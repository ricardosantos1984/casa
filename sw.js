// A Nossa Casa — service worker: a app abre depressa e funciona sem rede (só leitura do que já carregou).
// Estratégia "rede primeiro": quando há internet usa sempre a versão mais recente.
const CACHE = "casa-v1";
const BASE = ["./", "index.html", "styles.css", "app.js", "config.js", "fichas.js", "ingredientes.js", "manifest.json", "icons/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return; // Supabase e CDN: sempre direto
  e.respondWith(fetch(r).then((res) => { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(r, copia)); return res; })
    .catch(() => caches.match(r).then((m) => m || caches.match("index.html"))));
});
