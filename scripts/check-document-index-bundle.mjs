/** Run after next build. Inspect trace metadata only; never read bundled data. */
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const routes = ['app/hq/page.js.nft.json', 'app/api/brief/ceo/route.js.nft.json', 'app/api/joris/chat/route.js.nft.json', 'app/api/inngest/route.js.nft.json'];
const reports = [];
for (const route of routes) {
  const trace = path.join(root, '.next/server', route);
  const metadata = JSON.parse(await readFile(trace, 'utf8'));
  const files = metadata.files.map(file => path.resolve(path.dirname(trace), file));
  const relative = files.map(file => path.relative(root, file));
  // These raw source/doc directories were pulled in by the arbitrary test path.
  // Compiled chunks and dependency sources remain legitimate traced inputs.
  const excessive = relative.filter(file => /^(src|docs|\.agents)[/\\]/.test(file));
  assert.equal(excessive.length, 0, `${route}: ${excessive.length} unexpected raw repository source/documentation files`);
  assert.ok(relative.includes(path.join('db', 'documents.json')), `${route}: missing fixed fixture dependency`);
  await access(path.join(root, '.next/standalone/db/documents.json'));
  reports.push({route, tracedFiles: files.length, unexpectedRawRepositoryFiles: excessive.length, fixedFixturePresent: true});
}
console.log(JSON.stringify({status:'passed',scope:'Next trace metadata and standalone fixture existence; no hosted deployment or file content read',reports}, null, 2));
