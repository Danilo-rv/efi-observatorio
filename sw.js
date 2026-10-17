// Guarda a "casca" do app para abrir mesmo sem internet. Os dados vêm sempre do Supabase.
const V = "efi-v3";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./config.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())) });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())) });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  const mine = u.origin === location.origin;
  const ext = u.hostname === "cdn.jsdelivr.net" || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
  if (!mine && !ext) return;
  // Arquivos do próprio app: tenta a internet primeiro (sempre a versão nova); sem internet, usa a cópia guardada.
  if (mine) {
    e.respondWith(fetch(r, { cache: "no-cache" }).then(res => { if (res && res.status === 200) { const c = res.clone(); caches.open(V).then(k => k.put(r, c)) } return res }).catch(() => caches.match(r)));
    return;
  }
  // Bibliotecas e fontes de fora: cópia guardada primeiro.
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(r);
    const net = fetch(r).then(res => { if (res && res.status === 200) c.put(r, res.clone()); return res }).catch(() => hit);
    return hit || net;
  }));
});
