import { pathToFileURL } from 'node:url';

export function validatePublicBuildConfig(env) {
  let url;
  try { url = new URL(env.NEXT_PUBLIC_SUPABASE_URL); } catch { throw new Error('A public HTTPS Supabase URL is required at build time'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Supabase build URL must be HTTPS without credentials, query or fragment');
  }
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.role === 'anon') return;
  } catch { /* Fail closed without echoing supplied values. */ }
  throw new Error('A public Supabase anon JWT or publishable key is required; server secret keys are forbidden');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validatePublicBuildConfig(process.env);
}
