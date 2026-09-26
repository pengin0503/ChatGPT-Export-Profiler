import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(scriptDirectory, 'dist');
const requestedPort = Number(process.env.PORT ?? '4173');
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536 ? requestedPort : 4173;

const csp = "default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

async function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  let candidate = resolve(distRoot, relativePath);
  if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${sep}`)) return null;

  try {
    const metadata = await stat(candidate);
    if (metadata.isDirectory()) candidate = resolve(candidate, 'index.html');
    else if (!metadata.isFile()) return null;
  } catch {
    if (extname(relativePath)) return null;
    candidate = resolve(distRoot, 'index.html');
  }

  try {
    const metadata = await stat(candidate);
    return metadata.isFile() ? { candidate, size: metadata.size } : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method Not Allowed');
    return;
  }

  let pathname;
  try {
    pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  } catch {
    sendText(response, 400, 'Bad Request');
    return;
  }

  let resolved;
  try {
    resolved = await resolveFile(pathname);
  } catch {
    sendText(response, 400, 'Bad Request');
    return;
  }

  if (!resolved) {
    sendText(response, 404, 'Not Found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes.get(extname(resolved.candidate).toLowerCase()) ?? 'application/octet-stream',
    'Content-Length': resolved.size,
    'Content-Security-Policy': csp,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(resolved.candidate).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ChatGPT Export Profiler offline server: http://127.0.0.1:${port}`);
});
