// Service worker do Finance OS (v2): app offline + notificações push.
// - Arquivos estáticos: cache-first.
// - Páginas (HTML e dados RSC): rede primeiro; sem internet, usa a última cópia salva no aparelho.
// - APIs e ações (POST): nunca passam pelo cache.
// Obs.: as páginas salvas contêm seus dados financeiros; são apagadas ao sair da conta.
const VERSION = "v3";
const STATIC = `fos-static-${VERSION}`;
const PAGES = `fos-pages-${VERSION}`;
const PRECACHE = ["/offline", "/icon.svg", "/sounds/caixa-registradora.wav"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== STATIC && k !== PAGES) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "clear-pages") e.waitUntil(caches.delete(PAGES));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

async function networkFirst(req, isNav) {
  const cache = await caches.open(PAGES);
  try {
    const res = await Promise.race([fetch(req), timeout(isNav ? 6000 : 4000)]);
    // Não guarda redirecionamentos (ex.: sessão expirada → /login) nem erros.
    if (res.ok && !res.redirected) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    if (isNav) {
      // Navegação sem cópia da própria página: tenta a página inicial salva; por fim, a tela offline.
      const home = await cache.match("/", { ignoreVary: true });
      return home || (await caches.match("/offline")) || Response.error();
    }
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/sounds/") || url.pathname === "/icon.svg") {
    e.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  const isNav = req.mode === "navigate";
  const isRsc = req.headers.get("RSC") === "1";
  const isWarm = req.headers.get("X-Warm") === "1"; // pré-carregamento das telas para uso offline
  if (isNav || isRsc || isWarm) e.respondWith(networkFirst(req, isNav));
});

// ---- Push: mensagem das 06:00 ----
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data ? e.data.text() : "" }; }
  const title = data.title || "Antes de gastar hoje";
  e.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: data.tag || undefined, // cada mensagem tem a sua (não substitui a anterior)
        silent: false, // usa o som padrão do aparelho
        vibrate: [200, 100, 200],
        data: { url: data.url || "/?msg=1" },
      });
      // Com o app aberto, toca a caixa registradora na hora.
      for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) c.postMessage({ type: "play-sound" });
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/?msg=1";
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if ("focus" in w) { await w.focus(); w.postMessage({ type: "play-sound" }); if ("navigate" in w) { try { await w.navigate(target); } catch {} } return; }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
