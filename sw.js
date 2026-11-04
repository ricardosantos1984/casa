// A Nossa Casa — service worker: a app abre depressa e funciona sem rede (só leitura do que já carregou).
// Estratégia "rede primeiro": quando há internet usa sempre a versão mais recente.
const CACHE = "casa-v4";
const BASE = ["./", "index.html", "styles.css", "app.js", "config.js", "fichas.js", "ingredientes.js", "manifest.json", "icons/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return; // Supabase e CDN: sempre direto
  e.respondWith(fetch(r).then((res) => { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(r, copia)); return res; })
    .catch(() => caches.match(r).then((m) => m || caches.match("index.html"))));
});

// Notificações (Web Push) enviadas pelo n8n
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { corpo: e.data ? e.data.text() : "" }; }
  const titulo = d.titulo || "A Nossa Casa";
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.corpo || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    tag: d.tag || undefined, data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
