// 비교 뷰어 — A/B 와이프 슬라이더 · 2~4장 동기 줌 격자 · 영상 두 편 동기 재생
import { h, dropzone, loadBitmap, canvas, field, select, button, range, isImage, isVideo, loadVideo, toast, check, clamp, toBlob, download } from "../ui.js";

export function mount(root) {
  let files = [], imgs = [], vids = [];
  const st = { mode: "wipe", zoom: 1, px: 0.5, py: 0.5, split: 0.5, labels: true, diff: false };
  const stage = h("div", { class: "canvas-wrap", style: { position: "relative", userSelect: "none" } });
  const meta = h("div", { class: "meta" });
  const dz = dropzone({ accept: "image/*,video/*", hint: "이미지 2~4장 (같은 해상도가 아니어도 됨) 또는 영상 2편", onFiles: async (fs) => { files = fs.slice(0, 4); await load(); } });
  async function load() {
    imgs.forEach((b) => b.close?.()); imgs = []; vids.forEach((v) => URL.revokeObjectURL(v.src)); vids = [];
    if (files.every(isVideo)) { vids = await Promise.all(files.slice(0, 2).map(loadVideo)); st.mode = "video"; }
    else { imgs = await Promise.all(files.filter(isImage).map((f) => loadBitmap(f))); if (st.mode === "video") st.mode = "wipe"; }
    modeSel.value = st.mode; dz.classList.add("compact"); render();
  }
  const view = h("canvas", { style: { cursor: "grab" } });
  function render() {
    stage.replaceChildren();
    if (st.mode === "video") return renderVideo();
    if (!imgs.length) return;
    stage.append(view);
    const W = Math.max(...imgs.map((i) => i.width)), H = Math.max(...imgs.map((i) => i.height));
    const draw = () => {
      if (st.mode === "grid") { const n = imgs.length, cols = n <= 2 ? n : 2, rows = Math.ceil(n / cols); const cw = Math.round(W / (cols > 1 ? 1.6 : 1)), ch = Math.round(cw * H / W); view.width = cols * cw + (cols - 1) * 4; view.height = rows * ch + (rows - 1) * 4; const ctx = view.getContext("2d"); ctx.fillStyle = "#8370a8"; ctx.fillRect(0, 0, view.width, view.height);
        imgs.forEach((im, i) => { const x = (i % cols) * (cw + 4), y = Math.floor(i / cols) * (ch + 4); ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip(); drawZoomed(ctx, im, x, y, cw, ch); if (st.labels) label(ctx, files[i].name, x + 8, y + 8); ctx.restore(); }); return; }
      view.width = W; view.height = H; const ctx = view.getContext("2d"); const a = imgs[0], b = imgs[1] || imgs[0];
      if (st.diff && imgs[1]) { const ca = canvas(W, H), cb = canvas(W, H); drawZoomed(ca.getContext("2d"), a, 0, 0, W, H); drawZoomed(cb.getContext("2d"), b, 0, 0, W, H); const da = ca.getContext("2d").getImageData(0, 0, W, H), db = cb.getContext("2d").getImageData(0, 0, W, H); const o = ctx.createImageData(W, H); let sum = 0;
        for (let i = 0; i < da.data.length; i += 4) { const d = (Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2])) / 3; sum += d; const v = clamp(d * 4, 0, 255); o.data[i] = v; o.data[i + 1] = v * 0.4; o.data[i + 2] = 255 - v; o.data[i + 3] = 255; } ctx.putImageData(o, 0, 0); meta.textContent = `평균 차이 ${(sum / (W * H)).toFixed(2)} / 255 (파랑=같음 · 빨강=다름) · 줌 ${st.zoom.toFixed(1)}×`; return; }
      drawZoomed(ctx, a, 0, 0, W, H); ctx.save(); ctx.beginPath(); ctx.rect(W * st.split, 0, W, H); ctx.clip(); drawZoomed(ctx, b, 0, 0, W, H); ctx.restore();
      ctx.fillStyle = "#fff"; ctx.fillRect(W * st.split - 2, 0, 4, H);
      if (st.labels) { label(ctx, files[0].name, 10, 10); if (files[1]) label(ctx, files[1].name, W - 10, 10, "right"); }
      meta.textContent = `${W}×${H} · 와이프 ${(st.split * 100) | 0}% · 줌 ${st.zoom.toFixed(1)}× (휠로 줌 · 드래그로 이동 · 클릭으로 와이프 위치)`;
    };
    function drawZoomed(ctx, im, x, y, w, hh) { const s = Math.min(w / im.width, hh / im.height) * st.zoom; const dw = im.width * s, dh = im.height * s; const ox = x + (w - dw) * st.px, oy = y + (hh - dh) * st.py; ctx.imageSmoothingEnabled = st.zoom < 3; ctx.drawImage(im, ox, oy, dw, dh); }
    function label(ctx, t, x, y, align = "left") { ctx.font = `600 ${Math.round(view.width / 60)}px "DM Sans", sans-serif`; const w = ctx.measureText(t).width + 16; const hh = view.width / 40; ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(align === "right" ? x - w : x, y, w, hh); ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = align; ctx.fillText(t, align === "right" ? x - 8 : x + 8, y + hh / 2); ctx.textAlign = "left"; }
    draw(); view._draw = draw;
  }
  // 상호작용
  let drag = null;
  view.addEventListener("wheel", (e) => { e.preventDefault(); st.zoom = clamp(st.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 1, 16); view._draw?.(); }, { passive: false });
  view.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, px: st.px, py: st.py, moved: false }; view.setPointerCapture(e.pointerId); });
  view.addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; if (st.zoom > 1 && drag.moved) { const r = view.getBoundingClientRect(); st.px = clamp(drag.px + dx / r.width / (st.zoom - 1) * 1.0, 0, 1); st.py = clamp(drag.py + dy / r.height / (st.zoom - 1) * 1.0, 0, 1); view._draw?.(); } });
  view.addEventListener("pointerup", (e) => { if (drag && !drag.moved && st.mode === "wipe") { const r = view.getBoundingClientRect(); st.split = clamp((e.clientX - r.left) / r.width, 0, 1); view._draw?.(); } drag = null; });
  function renderVideo() {
    const row = h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", width: "100%" } });
    vids.forEach((v, i) => { v.controls = i === 0; v.loop = true; row.append(h("div", {}, v, h("div", { class: "meta" }, files[i].name))); });
    if (vids[1]) { const a = vids[0], b = vids[1]; a.addEventListener("play", () => b.play()); a.addEventListener("pause", () => b.pause()); a.addEventListener("seeked", () => { b.currentTime = a.currentTime; }); a.addEventListener("timeupdate", () => { if (Math.abs(a.currentTime - b.currentTime) > 0.08) b.currentTime = a.currentTime; }); }
    stage.append(row); meta.textContent = "왼쪽 컨트롤로 두 영상을 같이 재생·탐색한다.";
  }
  async function saveView() { if (!view.width) return; download(await toBlob(view, "image/png"), "compare.png"); }
  const modeSel = select([["wipe", "A/B 와이프"], ["grid", "격자 (동기 줌)"], ["video", "영상 2편 동기"]], st.mode, (v) => { st.mode = v; render(); });
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, stage, meta, h("p", { class: "help", style: { marginTop: "10px" } }, "v20 vs v70 처럼 같은 자리를 같은 배율로 본다. 줌은 모든 칸에 같이 걸린다. 「차이 맵」은 두 장의 픽셀 차이를 색으로.")),
    h("div", { class: "panel controls" },
      field("보기", modeSel),
      field("줌", range(10, { min: 10, max: 160, onInput: (v) => { st.zoom = v / 10; view._draw?.(); } })),
      field("와이프 위치", range(50, { min: 0, max: 100, onInput: (v) => { st.split = v / 100; view._draw?.(); } })),
      check("파일명 라벨", true, (v) => { st.labels = v; view._draw?.(); }),
      check("차이 맵 (A−B)", false, (v) => { st.diff = v; view._draw?.(); }),
      button("줌 초기화", () => { st.zoom = 1; st.px = st.py = 0.5; view._draw?.(); }),
      button("현재 화면 PNG 저장", saveView, "btn primary full"))));
  return () => { dz.destroy(); imgs.forEach((b) => b.close?.()); vids.forEach((v) => URL.revokeObjectURL(v.src)); };
}
