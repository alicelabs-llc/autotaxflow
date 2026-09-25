#!/usr/bin/env node
/**
 * Build + Start script para Render Free.
 *
 * Por qué existe: en Render Free, el buildCommand `npm install && npx tsc ...`
 * fallaba con exit code 2 (npx no encontraba tsc). En vez de pelear con
 * bash && chains, este script Node hace todo:
 *   1. Verifica que node_modules está instalado
 *   2. Compila packages/shared y packages/db (con tsc directo)
 *   3. Genera Prisma client
 *   4. Compila apps/api
 *   5. Arranca el API
 *
 * Si algo falla, arranca un HTTP server en PORT que expone el error JSON
 * para poder curlarlo desde afuera sin dashboard access.
 */

const { execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOG = (...args) => console.log('[build-start]', ...args);
const ERR = (...args) => console.error('[build-start]', ...args);

function runStep(name, cmd) {
  LOG(`Step: ${name}`);
  LOG(`  cmd: ${cmd}`);
  try {
    const out = execSync(cmd, { stdio: 'pipe', encoding: 'utf8', timeout: 120000 });
    if (out.trim()) LOG(`  stdout: ${out.slice(0, 500)}`);
    LOG(`  ✓ ${name} OK`);
    return { ok: true };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().slice(0, 2000) : '';
    const stdout = err.stdout ? err.stdout.toString().slice(0, 1000) : '';
    const msg = err.message || String(err);
    ERR(`  ✗ ${name} FAILED`);
    ERR(`  err: ${msg}`);
    ERR(`  stdout: ${stdout}`);
    ERR(`  stderr: ${stderr}`);
    return { ok: false, err: msg, stderr, stdout };
  }
}

function startErrorServer(errorInfo) {
  const port = Number(process.env.PORT) || 3001;
  const payload = JSON.stringify(errorInfo, null, 2);
  http
    .createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(payload);
    })
    .listen(port, '0.0.0.0', () => {
      ERR(`>>> Error exposure server on port ${port}`);
      ERR(`>>> curl https://autotaxflow-api.onrender.com/ to see the error`);
    });
}

async function main() {
  LOG(`Starting at ${new Date().toISOString()}`);
  LOG(`cwd: ${process.cwd()}`);
  LOG(`node: ${process.version}`);
  LOG(`PORT: ${process.env.PORT}`);
  LOG(`REDIS_HOST: ${process.env.REDIS_HOST}`);
  LOG(`DATABASE_URL set: ${!!process.env.DATABASE_URL}`);
  LOG(`JWT_SECRET set: ${!!process.env.JWT_SECRET}`);
  LOG(`TOKEN_ENC_KEY set: ${!!process.env.TOKEN_ENC_KEY}`);

  // Verificar que node_modules existe
  if (!fs.existsSync('node_modules')) {
    LOG('node_modules missing, running npm install...');
    const r = runStep('npm install', 'npm install');
    if (!r.ok) {
      startErrorServer({
        status: 'INSTALL_FAILED',
        ...r,
      });
      return;
    }
  }

  // Verificar que tsc existe
  const tscPath = path.join('node_modules', '.bin', 'tsc');
  if (!fs.existsSync(tscPath)) {
    LOG(`tsc not found at ${tscPath}`);
    LOG('Listing node_modules/.bin:');
    try {
      const bin = fs.readdirSync(path.join('node_modules', '.bin'));
      LOG(bin.join(', '));
    } catch (e) {
      LOG('node_modules/.bin does not exist:', e.message);
    }
    startErrorServer({
      status: 'TSC_NOT_FOUND',
      message: 'node_modules/.bin/tsc does not exist after npm install',
      tscPath,
      binExists: fs.existsSync(path.join('node_modules', '.bin')),
    });
    return;
  }

  // Build packages/shared
  let r = runStep('tsc shared', `node_modules/.bin/tsc -p packages/shared/tsconfig.json`);
  if (!r.ok) {
    startErrorServer({ status: 'TSC_SHARED_FAILED', ...r });
    return;
  }

  // Build packages/db
  r = runStep('tsc db', `node_modules/.bin/tsc -p packages/db/tsconfig.json`);
  if (!r.ok) {
    startErrorServer({ status: 'TSC_DB_FAILED', ...r });
    return;
  }

  // Prisma generate
  r = runStep('prisma generate', `node_modules/.bin/prisma generate --schema packages/db/prisma/schema.prisma`);
  if (!r.ok) {
    startErrorServer({ status: 'PRISMA_FAILED', ...r });
    return;
  }

  // Build apps/api
  r = runStep('tsc api', `node_modules/.bin/tsc -p apps/api/tsconfig.json`);
  if (!r.ok) {
    startErrorServer({ status: 'TSC_API_FAILED', ...r });
    return;
  }

  // Verify dist/index.js exists
  const distPath = path.join('apps', 'api', 'dist', 'index.js');
  if (!fs.existsSync(distPath)) {
    LOG(`dist/index.js not found at ${distPath}`);
    try {
      const dist = fs.readdirSync(path.join('apps', 'api', 'dist'));
      LOG('Contents of apps/api/dist:', dist.join(', '));
    } catch (e) {
      LOG('apps/api/dist does not exist:', e.message);
    }
    startErrorServer({
      status: 'DIST_NOT_FOUND',
      message: `apps/api/dist/index.js not found after tsc`,
      distPath,
    });
    return;
  }

  // All good — start the API
  LOG('All build steps succeeded. Starting API...');

  // Use child_process.spawn to start the API and keep this process alive
  const { spawn } = require('child_process');
  const api = spawn('node', [distPath], {
    stdio: 'inherit',
    env: process.env,
  });

  api.on('exit', (code, signal) => {
    ERR(`API exited with code ${code} signal ${signal}`);
    // If API exits, start error server to expose what happened
    startErrorServer({
      status: 'API_EXITED',
      message: `API process exited with code ${code} signal ${signal}`,
      exitCode: code,
      signal,
    });
  });

  // Keep this process alive
  process.on('SIGTERM', () => {
    LOG('SIGTERM received, killing API');
    api.kill('SIGTERM');
    process.exit(0);
  });
  process.on('SIGINT', () => {
    LOG('SIGINT received, killing API');
    api.kill('SIGINT');
    process.exit(0);
  });
}

main().catch((err) => {
  ERR('Fatal error in build-and-start.js:', err.message, err.stack);
  startErrorServer({
    status: 'FATAL',
    message: err.message,
    stack: err.stack,
  });
});
