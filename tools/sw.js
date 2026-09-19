// 오프라인 캐시 — 핵심 파일은 설치 때, 벤더(모델·wasm)는 첫 사용 때 캐시
const VERSION = "wt-v1";
const CORE = ["./", "index.html", "app.js", "ui.js", "style.css", "manifest.webmanifest", "bg-worker.js",
  ...["gallery", "resize", "sheet", "frames", "sharp", "edit", "split", "mosaic", "bg", "gif", "record", "rename", "pdf", "qr"].map((t) => `tools/${t}.js`),
  "vendor/gifenc.esm.js", "vendor/qrcode.js"];
self.addEventListener("install", (e) => {
  e.waitUntil((async () => { const c = await caches.open(VERSION); await c.addAll(CORE); self.skipWaiting(); })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
    for (const cl of await self.clients.matchAll()) cl.postMessage({ type: "cached" });
  })());
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (!url.pathname.startsWith(new URL("./", location.href).pathname)) return; // /tools/ 아래만
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const isCore = e.request.mode === "navigate" || CORE.some((p) => p !== "./" && url.pathname.endsWith("/" + p));
    if (isCore) { // 핵심 파일: 네트워크 우선(항상 최신) → 실패하면 캐시
      try { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }
      catch { return (await c.match(e.request, { ignoreSearch: true })) || (e.request.mode === "navigate" ? c.match("index.html") : Response.error()); }
    }
    // 벤더(모델·wasm 등 큰 파일): 캐시 우선
    const hit = await c.match(e.request, { ignoreSearch: true }); if (hit) return hit;
    try { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; } catch { return Response.error(); }
  })());
});
