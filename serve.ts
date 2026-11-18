// Solara City — local dev server. Serves game/ as static files so the game
// can be played and screenshotted in desktop Chrome.
// Usage: node serve.ts [port]   (default port 8080)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const gameRoot = join(repoRoot, 'game');
const port = Number(process.argv[2] ?? 8080);

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = join(gameRoot, path === '/' ? 'index.html' : path);
  const insideRoot = file.startsWith(gameRoot);
  if (!insideRoot || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME_TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Solara City at http://localhost:${port}`));
