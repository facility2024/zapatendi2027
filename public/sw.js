/* ZapcomIA PWA — service worker sem dependências.
   Atualização NUNCA é automática: o cliente mostra o toast "Atualizar"
   e manda SKIP_WAITING aqui; aí sim o SW novo assume e o cliente recarrega. */
const VERSION = "v1";
const PRECACHE = `zapcomia-precache-${VERSION}`;
const RUNTIME = `zapcomia-runtime-${VERSION}`;
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // Sem skipWaiting aqui: a ativação fica para o clique no toast.
  event.waitUntil(caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== PRECACHE && k !== RUNTIME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Supabase e demais APIs de terceiros: sempre rede, nunca cache.
  if (url.origin !== self.location.origin) return;

  // Assets com hash do build: cache-first (o nome muda a cada build).
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navegações (páginas): network-first; offline → página visitada → offline.html.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches
              .open(RUNTIME)
              .then((cache) => cache.put(req, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/offline.html"))),
    );
    return;
  }

  // Demais GET same-origin (server functions, HTML, API): rede direto, sem cache.
});
