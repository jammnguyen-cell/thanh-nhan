// Upload dist/ len Cloudflare Pages (direct upload). Dung: PAGES_JWT=... node scripts/pages-upload.mjs <dist> <blake3-wasm-dir>
// In ra manifest JSON (duong dan -> hash) de tao deployment.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import { createRequire } from 'node:module';
const [dist, blakeDir, out] = process.argv.slice(2);
const { hash } = createRequire(import.meta.url)(blakeDir);
const jwt = process.env.PAGES_JWT;
const API = 'https://api.cloudflare.com/client/v4/pages/assets';
const types = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.xml':'application/xml', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp', '.jpg':'image/jpeg', '.png':'image/png', '.woff':'font/woff', '.woff2':'font/woff2', '.json':'application/json', '.txt':'text/plain' };
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(dist).map(p => {
  const b64 = readFileSync(p).toString('base64');
  const ext = extname(p).slice(1);
  return { path: '/' + relative(dist, p).split(sep).join('/'), b64, key: hash(b64 + ext).toString('hex').slice(0, 32), type: types[extname(p)] || 'application/octet-stream' };
});
const call = async (ep, body) => {
  const r = await fetch(`${API}/${ep}`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.success) throw new Error(`${ep}: ${r.status} ${JSON.stringify(j.errors)}`);
  return j.result;
};
const hashes = [...new Set(files.map(f => f.key))];
const missing = await call('check-missing', { hashes });
const todo = files.filter((f, i, a) => missing.includes(f.key) && a.findIndex(x => x.key === f.key) === i);
if (todo.length) await call('upload', todo.map(f => ({ key: f.key, value: f.b64, metadata: { contentType: f.type }, base64: true })));
await call('upsert-hashes', { hashes });
const manifest = Object.fromEntries(files.map(f => [f.path, f.key]));
writeFileSync(out, JSON.stringify(manifest));
console.error(`files=${files.length} uploaded=${todo.length}`);
console.log(JSON.stringify(manifest));
