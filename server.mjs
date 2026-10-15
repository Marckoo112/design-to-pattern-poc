import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const VENDOR = path.join(ROOT, 'vendor', 'ourlette');
const RUNNER = path.join(VENDOR, 'runner.cjs');
const BUILD = '09b408d4c34bf907fb334f7b09c9a4695e5ad89f60eb79436f116e0e5f7b7d69';
const MIMES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function runEngine(payload) {
  const result = spawnSync(process.execPath, [RUNNER], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Engine exited with status ${result.status}`);
  return JSON.parse(result.stdout);
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256_000) throw new Error('Request body exceeds 256 KB.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStatic(response, pathname) {
  const capturedChunkPath = pathname.startsWith('/_next/static/immutable/chunks/');
  const base = pathname.startsWith('/vendor/') || capturedChunkPath ? VENDOR : PUBLIC;
  let relative = pathname.startsWith('/vendor/') ? pathname.slice('/vendor/'.length) : capturedChunkPath ? `chunks/${pathname.slice('/_next/static/immutable/chunks/'.length)}` : pathname.slice(1);
  if (relative.startsWith('static/immutable/chunks/')) relative = `chunks/${relative.slice('static/immutable/chunks/'.length)}`;
  const target = path.resolve(base, relative || 'index.html');
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': MIMES[path.extname(target)] || 'application/octet-stream',
      'Content-Length': body.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  try {
    if (request.method === 'GET' && url.pathname === '/api/schema') {
      json(response, 200, runEngine({
        action: 'capabilities',
        garmentId: url.searchParams.get('garment') || 'button-up-shirt',
      }));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/draft') {
      const input = await readBody(request);
      if (!input?.spec || typeof input.spec !== 'object') throw new Error('spec must be an object.');
      if (!input?.measurements || typeof input.measurements !== 'object') throw new Error('measurements must be an object.');
      const result = runEngine({
        spec: input.spec,
        measurements: input.measurements,
        settings: input.settings || {},
      });
      json(response, 200, result);
      return;
    }
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/vendor/'))) {
      await serveStatic(response, url.pathname);
      return;
    }
    if (request.method === 'GET') {
      await serveStatic(response, url.pathname);
      return;
    }
    response.writeHead(405).end('Method not allowed');
  } catch (error) {
    json(response, 400, { ok: false, error: error.message || String(error) });
  }
});

const host = process.env.OURLETTE_STUDIO_HOST || '127.0.0.1';
const port = Number(process.env.OURLETTE_STUDIO_PORT || 8767);
server.listen(port, host, () => {
  console.log(`Ourlette JS Studio (${BUILD}): http://${host}:${port}`);
  console.log('Drafting runs from the local captured JavaScript bundle; no Ourlette network requests are made.');
});
