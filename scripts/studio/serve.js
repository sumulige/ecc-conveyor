#!/usr/bin/env node
/**
 * Tiny static server for Paradigm Studio (no dependencies).
 *
 * Usage:
 *   node scripts/studio/serve.js
 *   PORT=4173 node scripts/studio/serve.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', 'apps', 'studio');
const PORT = parseInt(process.env.PORT || '4173', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function isPathInside(child, parent) {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const rawPath = decodeURIComponent(url.pathname);
  const reqPath = rawPath === '/' ? '/index.html' : rawPath;

  const abs = path.resolve(ROOT, '.' + reqPath);
  if (!isPathInside(abs, ROOT) && abs !== path.join(ROOT, 'index.html')) {
    return send(res, 400, { 'content-type': 'text/plain; charset=utf-8' }, 'Bad request');
  }

  fs.readFile(abs, (err, data) => {
    if (err) {
      return send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'Not found');
    }
    const ext = path.extname(abs).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    return send(res, 200, { 'content-type': mime }, data);
  });
});

server.listen(PORT, () => {
  console.log(`Paradigm Studio: http://localhost:${PORT}`);
  console.log(`Root: ${ROOT}`);
});
