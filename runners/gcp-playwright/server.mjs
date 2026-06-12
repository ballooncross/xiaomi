import 'dotenv/config';
import { createServer } from 'node:http';
import { checkIcaAppointment } from './ica-check.mjs';

const port = Number(process.env.PORT ?? 8788);
const triggerToken = process.env.ICA_FALLBACK_TRIGGER_TOKEN ?? process.env.RUNNER_TOKEN ?? '';
let inFlight = false;

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    return sendJson(response, 200, { ok: true });
  }

  if (request.method !== 'POST' || request.url !== '/ica-check') {
    return sendJson(response, 404, { error: 'Not found' });
  }

  if (!triggerToken) {
    return sendJson(response, 500, { error: 'ICA_FALLBACK_TRIGGER_TOKEN is not configured on the runner' });
  }

  if (!isAuthorized(request.headers.authorization, request.headers['x-runner-token'])) {
    return sendJson(response, 401, { error: 'Unauthorized' });
  }

  if (inFlight) {
    return sendJson(response, 409, { error: 'ICA check already running' });
  }

  inFlight = true;
  try {
    const input = await readJson(request);
    const result = await checkIcaAppointment({
      targetBefore: typeof input.targetBefore === 'string' ? input.targetBefore : undefined
    });
    return sendJson(response, 200, result);
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : 'Runner failed' });
  } finally {
    inFlight = false;
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Personal Radar GCP Playwright runner listening on ${port}`);
});

function isAuthorized(authorization, runnerToken) {
  if (runnerToken === triggerToken) return true;
  if (typeof authorization === 'string' && authorization === `Bearer ${triggerToken}`) return true;
  return false;
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 20_000) {
        request.destroy();
        reject(new Error('Request body too large'));
      }
    });
    request.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}
