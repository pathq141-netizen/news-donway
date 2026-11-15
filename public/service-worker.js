/* ALFATH × DONWAY NEWSROOM Web Push service worker */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() || "" }; }
  const title = typeof data.title === "string" ? data.title : "ALFATH × DONWAY NEWSROOM";
  const options = {
    body: typeof data.body === "string" ? data.body : "Ada kabar terbaru dari redaksi.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: { url: typeof data.url === "string" ? data.url : "/" },
    tag: typeof data.tag === "string" ? data.tag : undefined,
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) target.href = "/";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
