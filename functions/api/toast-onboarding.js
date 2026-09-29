const MAX_FILE = 8 * 1024 * 1024;
const MAX_TOTAL = 30 * 1024 * 1024;
const MAX_REQUEST = 34 * 1024 * 1024;
const MAX_FILES = 12;
const ACCEPTED = new Set(['png', 'jpg', 'jpeg', 'webp', 'pdf', 'docx']);

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

function field(data, name, limit) {
  const value = data.get(name);
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, limit);
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'file';
}

async function verifyTurnstile(token, secret, hostname) {
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.success === true && result.hostname === hostname;
}

export async function onRequestPost({ request, env }) {
  if (!env.TOAST_INTAKE_BUCKET || !env.TOAST_TURNSTILE_SECRET || !env.TOAST_TURNSTILE_SITE_KEY) {
    return json({ error: 'Intake is not ready. Please email CoGrow.' }, 503);
  }
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Invalid submission origin.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return json({ error: 'Use the onboarding form to send materials.' }, 415);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_REQUEST) return json({ error: 'Files are too large. Use a shared folder link for larger sets.' }, 413);

  let data;
  try { data = await request.formData(); }
  catch { return json({ error: 'The upload could not be read. Please try again.' }, 400); }
  if (field(data, 'fax', 200)) return json({ error: 'Invalid submission.' }, 400);

  const restaurantName = field(data, 'restaurantName', 120);
  const contactName = field(data, 'contactName', 120);
  const email = field(data, 'email', 200);
  const primaryAction = field(data, 'primaryAction', 20);
  if (!restaurantName || !contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['order-online', 'view-menu', 'reserve', 'call', 'visit', 'other'].includes(primaryAction) || field(data, 'assetPermission', 8) !== 'yes') {
    return json({ error: 'Complete the required fields and permission checkbox.' }, 400);
  }

  const files = data.getAll('assets').filter(value => value instanceof File && value.name && value.size);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (files.length > MAX_FILES || total > MAX_TOTAL || files.some(file => file.size > MAX_FILE || !ACCEPTED.has(file.name.split('.').pop().toLowerCase()))) {
    return json({ error: 'Choose up to 12 PNG, JPG, WebP, PDF or DOCX files, 8 MB each and 30 MB total.' }, 400);
  }
  const assetFolderUrl = field(data, 'assetFolderUrl', 500);
  if (!files.length && !assetFolderUrl) return json({ error: 'Add at least one file or a shared folder link.' }, 400);

  let verified = false;
  try { verified = await verifyTurnstile(field(data, 'cf-turnstile-response', 2048), env.TOAST_TURNSTILE_SECRET, url.hostname); }
  catch { return json({ error: 'Verification is unavailable. Please try again.' }, 503); }
  if (!verified) return json({ error: 'Verification expired or failed. Please try again.' }, 400);

  const reference = crypto.randomUUID();
  const prefix = `toast-onboarding/${reference}`;
  const stored = [];
  const manifest = {
    reference,
    submittedAt: new Date().toISOString(),
    restaurantName, contactName, email,
    phone: field(data, 'phone', 40),
    currentUrl: field(data, 'currentUrl', 500),
    restaurantAddress: field(data, 'restaurantAddress', 300),
    pages: field(data, 'pages', 240),
    primaryAction,
    pageCopy: field(data, 'pageCopy', 12000),
    toastLinks: field(data, 'toastLinks', 2000),
    notes: field(data, 'notes', 4000),
    assetFolderUrl,
    files: []
  };
  try {
    for (const [index, file] of files.entries()) {
      const key = `${prefix}/assets/${String(index + 1).padStart(2, '0')}-${safeName(file.name)}`;
      await env.TOAST_INTAKE_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
      stored.push(key);
      manifest.files.push({ name: file.name, key, bytes: file.size, type: file.type });
    }
    const manifestKey = `${prefix}/submission.json`;
    await env.TOAST_INTAKE_BUCKET.put(manifestKey, JSON.stringify(manifest), { httpMetadata: { contentType: 'application/json' } });
    return json({ success: true, reference });
  } catch {
    await Promise.allSettled(stored.map(key => env.TOAST_INTAKE_BUCKET.delete(key)));
    return json({ error: 'We could not save the upload. Please try again.' }, 500);
  }
}
