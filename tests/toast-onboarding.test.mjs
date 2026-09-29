import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/toast-onboarding.js';
import { onRequestGet } from '../functions/api/toast-onboarding-config.js';

const url = 'https://cogrow.ai/api/toast-onboarding';

function makeRequest({ file = new File(['logo'], 'logo.png', { type: 'image/png' }), folder = '', origin = 'https://cogrow.ai' } = {}) {
  const form = new FormData();
  form.set('restaurantName', 'Test Restaurant');
  form.set('contactName', 'Alex');
  form.set('email', 'alex@example.com');
  form.set('primaryAction', 'view-menu');
  form.set('assetPermission', 'yes');
  form.set('cf-turnstile-response', 'test-token');
  if (folder) form.set('assetFolderUrl', folder);
  if (file) form.append('assets', file);
  return new Request(url, { method: 'POST', headers: { origin }, body: form });
}

function env(put) {
  return {
    TOAST_INTAKE_BUCKET: { put, delete: async () => {} },
    TOAST_TURNSTILE_SECRET: 'test-secret',
    TOAST_TURNSTILE_SITE_KEY: 'test-site-key'
  };
}

test('config stays disabled until storage and verification are bound', async () => {
  const response = await onRequestGet({ env: {} });
  assert.deepEqual(await response.json(), { enabled: false, siteKey: null });
});

test('upload rejects missing configuration and cross-origin posts', async () => {
  assert.equal((await onRequestPost({ request: makeRequest(), env: {} })).status, 503);
  assert.equal((await onRequestPost({ request: makeRequest({ origin: 'https://other.example' }), env: env(async () => {}) })).status, 403);
});

test('upload rejects unsupported files before storing', async () => {
  const response = await onRequestPost({ request: makeRequest({ file: new File(['bad'], 'program.exe') }), env: env(async () => {}) });
  assert.equal(response.status, 400);
});

test('upload requires a file or shared folder link', async () => {
  const response = await onRequestPost({ request: makeRequest({ file: null }), env: env(async () => {}) });
  assert.equal(response.status, 400);
});

test('shared folder link can replace direct files', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: true, hostname: 'cogrow.ai' });
  const stored = new Map();
  try {
    const response = await onRequestPost({
      request: makeRequest({ file: null, folder: 'https://example.com/assets' }),
      env: env(async (key, body) => stored.set(key, body))
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    const manifest = JSON.parse(stored.get(`toast-onboarding/${result.reference}/submission.json`));
    assert.equal(manifest.assetFolderUrl, 'https://example.com/assets');
    assert.deepEqual(manifest.files, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('valid upload stores assets and manifest before reporting success', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: true, hostname: 'cogrow.ai' });
  const stored = new Map();
  try {
    const bucket = env(async (key, body) => stored.set(key, typeof body === 'string' ? body : await new Response(body).text()));
    const response = await onRequestPost({ request: makeRequest(), env: bucket });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    const base = `toast-onboarding/${result.reference}`;
    assert.equal(stored.get(`${base}/assets/01-logo.png`), 'logo');
    const manifest = JSON.parse(stored.get(`${base}/submission.json`));
    assert.equal(manifest.restaurantName, 'Test Restaurant');
    assert.equal(manifest.primaryAction, 'view-menu');
    assert.equal(manifest.files[0].key, `${base}/assets/01-logo.png`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
