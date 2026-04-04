import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
};

const server = createServer(async (req, res) => {
  let url = new URL(req.url, `http://localhost:${PORT}`).pathname;

  // Try exact file first, then fallback to index.html (SPA)
  let filePath = join(DIST, url);
  if (!existsSync(filePath) || url === '/') {
    filePath = join(DIST, 'index.html');
  }

  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // Prevent stale HTML cache (assets have hash-based filenames from Vite)
    if (ext === '.html') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    } else if (ext === '.js' || ext === '.css') {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    // Final fallback to index.html for SPA routing
    try {
      const data = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server running on port ${PORT}`);
});
