export async function onRequestGet({ env }) {
  const enabled = Boolean(env.TOAST_INTAKE_BUCKET && env.TOAST_TURNSTILE_SITE_KEY && env.TOAST_TURNSTILE_SECRET);
  return Response.json({ enabled, siteKey: enabled ? env.TOAST_TURNSTILE_SITE_KEY : null }, {
    headers: { 'cache-control': 'no-store' }
  });
}
