#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname);
const preferredPort = parseInt(process.argv[2] || '8085', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(rootDir, urlPath.replace(/^\/+/, ''));

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${urlPath}`);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });
    res.end(data);
  });
});

server.listen(preferredPort, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║  C Compiler Pipeline Visualizer IDE                 ║');
  console.log(`  ║  → http://localhost:${preferredPort}/                            ║`);
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('');
});
