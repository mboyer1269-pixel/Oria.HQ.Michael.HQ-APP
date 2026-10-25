// HARNAIS DE TEST LOCAL (non livré en production) : sert les VRAIS route handlers
// /api/atelier/** dans un serveur HTTP Node, avec la session Supabase remplacée par la
// fixture de test de la PR #410 (aucune base distante). Identité = ATELIER_LOCAL_USER.
import http from 'node:http';
import path from 'node:path';
import { createJiti } from 'jiti';
if (process.env.NODE_ENV === 'production') throw new Error('refused in production');
const src = path.resolve('src');
const fixture = path.join(src, 'server/auth/test-fixtures/authz-dependencies.mjs');
const jiti = createJiti(path.join(process.cwd(), 'x.mjs'), { alias: { '@/lib/supabase/server': fixture, '@/server/supabase/admin': fixture, '@': src, 'server-only': path.join(src, 'scripts/smoke/server-only-stub.mjs') } });
globalThis.authzTestUser = { id: process.env.ATELIER_LOCAL_USER };
const base = 'app/api/atelier/missions';
const routes = [
  [/^\/api\/atelier\/missions$/, `${base}/route.ts`],
  [/^\/api\/atelier\/missions\/([0-9a-f-]{36})$/, `${base}/[missionId]/route.ts`],
  [/^\/api\/atelier\/missions\/([0-9a-f-]{36})\/(events|steps|resume|interrupt|verify)$/, null],
  [/^\/api\/atelier\/missions\/([0-9a-f-]{36})\/artifacts\/([0-9a-f-]{36})$/, `${base}/[missionId]/artifacts/[artifactId]/route.ts`],
];
const mods = {};
const load = async f => (mods[f] ??= await jiti.import(path.join(src, f)));
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  for (const [re, file] of routes) {
    const m = re.exec(url.pathname); if (!m) continue;
    const f = file ?? `${base}/[missionId]/${m[2]}/route.ts`;
    const mod = await load(f); const handler = mod[req.method];
    if (!handler) { res.writeHead(405).end(); return; }
    const chunks = []; for await (const c of req) chunks.push(c);
    const ac = new AbortController(); req.on('close', () => ac.abort());
    const request = new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined, signal: ac.signal });
    const params = Promise.resolve(m[2] && !file ? { missionId: m[1] } : { missionId: m[1], artifactId: m[2] });
    const response = await handler(request, { params });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const c of response.body) res.write(c);
    res.end(); return;
  }
  res.writeHead(404).end();
}).listen(Number(process.env.PORT ?? 4317), '127.0.0.1', () => console.log(`atelier api host pid=${process.pid} port=${process.env.PORT ?? 4317}`));
