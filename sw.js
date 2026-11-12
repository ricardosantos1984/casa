// A Nossa Casa — service worker: a app abre depressa e funciona sem rede (só leitura do que já carregou).
// Estratégia "rede primeiro": quando há internet usa sempre a versão mais recente.
const CACHE = "casa-v30";
const BASE = ["./", "index.html", "styles.css", "app.js", "config.js", "fichas.js", "ingredientes.js", "manifest.json", "icons/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())); });
const MSGS = "casa-mensagens"; // mensagens recebidas por notificação (ficam guardadas para se lerem na app)
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== MSGS).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
const lerMsgs = () => caches.open(MSGS).then((c) => c.match("/__mensagens")).then((r) => (r ? r.json() : [])).catch(() => []);
const gravarMsgs = (l) => caches.open(MSGS).then((c) => c.put("/__mensagens", new Response(JSON.stringify(l.slice(0, 30)), { headers: { "Content-Type": "application/json" } })));
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
  const id = d.id || String(Date.now());
  // mensagens enviadas a uma pessoa: guardam-se para aparecerem na app ao abrir (a notificação desaparece quando se toca nela)
  const guardar = d.tipo === "mensagem"
    ? lerMsgs().then((l) => gravarMsgs([{ id, titulo, corpo: d.corpo || "", quando: new Date().toISOString(), vista: false }, ...l.filter((m) => m.id !== id)]))
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true })).then((cs) => cs.forEach((c) => c.postMessage({ tipo: "mensagem-nova" })))
    : Promise.resolve();
  // a notificação aparece sempre, mesmo que guardar a mensagem falhe
  e.waitUntil(guardar.catch(() => {}).then(() => self.registration.showNotification(titulo, {
    body: d.corpo || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    tag: d.tag || undefined, data: { url: d.tipo === "mensagem" ? "./?mensagem=" + encodeURIComponent(id) : d.url || "./" }
  })));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
