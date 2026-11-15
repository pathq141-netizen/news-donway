import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = (req: Request) => {
  const origin = req.headers.get("origin");
  const site = Deno.env.get("SITE_URL");
  const allowed = !origin || !site || new URL(origin).origin === new URL(site).origin;
  return { allowed, headers: {
    "Access-Control-Allow-Origin": origin && site ? new URL(site).origin : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Vary": "Origin",
  }};
};
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers });
function isTrustedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const trusted = host === "fcm.googleapis.com" ||
      host.endsWith(".push.services.mozilla.com") ||
      host === "web.push.apple.com" ||
      host.endsWith(".notify.windows.com");
    return url.protocol === "https:" && !url.username && !url.password && !url.port && trusted;
  } catch { return false; }
}
Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (!cors.allowed) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors.headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors.headers);
  try {
    const { action, subscription, endpoint } = await req.json();
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, key, { auth: { persistSession: false } });
    if (action === "subscribe") {
      if (!subscription || typeof subscription.endpoint !== "string" || !isTrustedPushEndpoint(subscription.endpoint) ||
          typeof subscription.keys?.p256dh !== "string" || subscription.keys.p256dh.length > 512 ||
          typeof subscription.keys?.auth !== "string" || subscription.keys.auth.length > 256) return json({ error: "Invalid push subscription" }, 400, cors.headers);
      const { error } = await db.from("push_subscriptions").upsert({
        endpoint: subscription.endpoint, subscription, updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      if (error) return json({ error: "Could not save subscription" }, 500, cors.headers);
      return json({ ok: true }, 200, cors.headers);
    }
    if (action === "unsubscribe") {
      if (typeof endpoint !== "string" || !isTrustedPushEndpoint(endpoint)) return json({ error: "Invalid endpoint" }, 400, cors.headers);
      const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
      if (error) return json({ error: "Could not remove subscription" }, 500, cors.headers);
      return json({ ok: true }, 200, cors.headers);
    }
    return json({ error: "Unknown action" }, 400, cors.headers);
  } catch { return json({ error: "Invalid request" }, 400, cors.headers); }
});
