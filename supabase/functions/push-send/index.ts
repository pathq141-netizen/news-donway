import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

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
const cleanText = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (!cors.allowed) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors.headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors.headers);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) return json({ error: "Unauthorized" }, 401, cors.headers);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401, cors.headers);
    const db = createClient(url, service, { auth: { persistSession: false } });
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (profileError || profile?.role !== "admin") return json({ error: "Admin role required" }, 403, cors.headers);

    const body = await req.json();
    const action = body.action;
    let title = "", message = "", targetUrl = "/", eventKey = "";
    let articleId: string | null = null;
    if (action === "article_published") {
      articleId = cleanText(body.article_id, 80);
      if (!articleId) return json({ error: "article_id required" }, 400, cors.headers);
      const { data: article, error } = await db.from("articles").select("id,title,slug,summary,status").eq("id", articleId).maybeSingle();
      if (error || !article || article.status !== "published") return json({ error: "Published article not found" }, 404, cors.headers);
      title = cleanText(article.title, 120);
      message = cleanText(article.summary, 220) || "Berita terbaru telah diterbitkan.";
      targetUrl = `/news/${encodeURIComponent(article.slug)}`;
      eventKey = `article:${article.id}:published`;
    } else if (action === "breaking_news") {
      title = cleanText(body.title, 120);
      message = cleanText(body.message, 220);
      const rawUrl = cleanText(body.url, 1000) || "/";
      const siteUrl = Deno.env.get("SITE_URL");
      try {
        const parsed = new URL(rawUrl, siteUrl);
        if (!siteUrl || parsed.origin !== new URL(siteUrl).origin || !["https:", "http:"].includes(parsed.protocol)) return json({ error: "URL tujuan harus berasal dari domain website" }, 400, cors.headers);
        targetUrl = parsed.pathname + parsed.search + parsed.hash;
      } catch { return json({ error: "URL tujuan tidak valid" }, 400, cors.headers); }
      if (!title || !message) return json({ error: "Judul dan pesan wajib diisi" }, 400, cors.headers);
      eventKey = `breaking:${crypto.randomUUID()}`;
    } else return json({ error: "Unknown action" }, 400, cors.headers);

    const { error: ledgerError } = await db.from("push_notification_events").insert({ event_key: eventKey, article_id: articleId, event_type: action });
    if (ledgerError) {
      if (action === "article_published") return json({ error: "Notification already processed or ledger unavailable", duplicate: true }, 409, cors.headers);
      return json({ error: "Could not register notification event" }, 500, cors.headers);
    }

    const exportedVapidKeys = Deno.env.get("VAPID_KEYS_JSON");
    const subject = Deno.env.get("VAPID_SUBJECT");
    if (!exportedVapidKeys || !subject) return json({ error: "VAPID secrets are not configured" }, 500, cors.headers);
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(exportedVapidKeys));
    const appServer = await webpush.ApplicationServer.new({ contactInformation: subject, vapidKeys });
    const { data: rows, error: listError } = await db.from("push_subscriptions").select("id,endpoint,subscription");
    if (listError) return json({ error: "Could not load subscribers" }, 500, cors.headers);
    let sent = 0, failed = 0, expired = 0;
    const stale: string[] = [];
    // Sequential batches keep memory and concurrent outbound requests bounded.
    for (let i = 0; i < (rows || []).length; i += 50) {
      const batch = (rows || []).slice(i, i + 50);
      const results = await Promise.all(batch.map(async (row) => {
        try {
          const subscriber = appServer.subscribe(row.subscription);
          await subscriber.pushTextMessage(JSON.stringify({ title, body: message, url: targetUrl, tag: action === "article_published" ? `article-${articleId}` : undefined }), { ttl: 60 * 60 * 24 });
          sent++;
        } catch (err) {
          failed++;
          if (err instanceof webpush.PushMessageError && err.isGone()) { stale.push(row.id); expired++; }
        }
      }));
      void results;
    }
    if (stale.length) await db.from("push_subscriptions").delete().in("id", stale);
    return json({ ok: true, sent, failed, expired, total: rows?.length || 0, warning: failed ? "Sebagian pengiriman gagal; artikel tetap tersimpan." : undefined }, 200, cors.headers);
  } catch (error) {
    console.error("push-send failed", error);
    return json({ error: "Internal notification error" }, 500, cors.headers);
  }
});
