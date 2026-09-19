// 모자이크 — 브러시 / 사각 · 픽셀화 · 블러 · 검정 · 되돌리기
import { h, dropzone, loadBitmap, canvas, toBlob, download, field, select, num, button, range, baseName, isImage, mimeOf, toast, handoff } from "../ui.js";

export function mount(root) {
  let src = null, name = "image", work = null, undo = [];
  const st = { mode: "pixel", shape: "brush", size: 60, strength: 12, fmt: "png" };
  const view = h("canvas"); const wrap = h("div", { class: "canvas-wrap" }, view);
  const meta = h("div", { class: "meta" }, "브러시: 드래그로 칠한다 · 사각: 드래그로 영역을 잡는다");
  let drawing = false, rectStart = null, stroke = [];
  const dz = dropzone({ accept: "image/*", multiple: false, onFiles: ([f]) => load(f) });
  async function load(f) {
    if (!isImage(f)) return toast("이미지가 아닙니다", "warn");
    const bmp = await loadBitmap(f); name = baseName(f.name);
    src = canvas(bmp.width, bmp.height); src.getContext("2d").drawImage(bmp, 0, 0); bmp.close?.();
    work = canvas(src.width, src.height); work.getContext("2d").drawImage(src, 0, 0);
    undo = []; view.width = work.width; view.height = work.height; render(); dz.classList.add("compact");
  }
  function render() { view.getContext("2d").drawImage(work, 0, 0); }
  function snapshot() { const c = canvas(work.width, work.height); c.getContext("2d").drawImage(work, 0, 0); undo.push(c); if (undo.length > 20) undo.shift(); }
  // 영역 [x,y,w,h] 에 효과 적용 (clip 은 브러시 원 또는 사각)
  function effectPatch(x, y, w, hh) {
    x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y)); w = Math.min(work.width - x, Math.ceil(w)); hh = Math.min(work.height - y, Math.ceil(hh));
    if (w <= 0 || hh <= 0) return null;
    const p = canvas(w, hh), pc = p.getContext("2d");
    if (st.mode === "black") { pc.fillStyle = "#000"; pc.fillRect(0, 0, w, hh); return p; }
    if (st.mode === "pixel") {
      const s = Math.max(2, st.strength); const sm = canvas(Math.max(1, Math.round(w / s)), Math.max(1, Math.round(hh / s)));
      const sc = sm.getContext("2d"); sc.imageSmoothingEnabled = true; sc.drawImage(src, x, y, w, hh, 0, 0, sm.width, sm.height);
      pc.imageSmoothingEnabled = false; pc.drawImage(sm, 0, 0, sm.width, sm.height, 0, 0, w, hh); return p;
    }
    pc.filter = `blur(${st.strength}px)`; pc.drawImage(src, x - st.strength * 2, y - st.strength * 2, w + st.strength * 4, hh + st.strength * 4, -st.strength * 2, -st.strength * 2, w + st.strength * 4, hh + st.strength * 4); return p;
  }
  function applyCircle(cx, cy) {
    const r = st.size / 2, p = effectPatch(cx - r, cy - r, r * 2, r * 2); if (!p) return;
    const ctx = work.getContext("2d"); ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(p, Math.max(0, Math.floor(cx - r)), Math.max(0, Math.floor(cy - r))); ctx.restore();
  }
  function applyRect(x, y, w, hh) { const p = effectPatch(x, y, w, hh); if (!p) return; work.getContext("2d").drawImage(p, Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y))); }
  const pos = (e) => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) * view.width / r.width, (e.clientY - r.top) * view.height / r.height]; };
  view.addEventListener("pointerdown", (e) => { if (!work) return; snapshot(); drawing = true; view.setPointerCapture(e.pointerId); const [x, y] = pos(e); if (st.shape === "rect") rectStart = [x, y]; else { stroke = [[x, y]]; applyCircle(x, y); render(); } });
  view.addEventListener("pointermove", (e) => { if (!drawing) return; const [x, y] = pos(e);
    if (st.shape === "rect") { render(); const c = view.getContext("2d"); c.strokeStyle = "#fff"; c.lineWidth = 2; c.setLineDash([6, 4]); c.strokeRect(rectStart[0], rectStart[1], x - rectStart[0], y - rectStart[1]); return; }
    const [px, py] = stroke[stroke.length - 1]; const d = Math.hypot(x - px, y - py), steps = Math.max(1, Math.ceil(d / (st.size / 4)));
    for (let i = 1; i <= steps; i++) applyCircle(px + (x - px) * i / steps, py + (y - py) * i / steps);
    stroke.push([x, y]); render(); });
  view.addEventListener("pointerup", (e) => { if (!drawing) return; drawing = false; if (st.shape === "rect") { const [x, y] = pos(e); applyRect(Math.min(x, rectStart[0]), Math.min(y, rectStart[1]), Math.abs(x - rectStart[0]), Math.abs(y - rectStart[1])); rectStart = null; } render(); });
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); doUndo(); } };
  function doUndo() { const c = undo.pop(); if (!c) return; work = c; render(); }
  document.addEventListener("keydown", onKey);
  async function save() { if (!work) return; download(await toBlob(work, mimeOf(st.fmt), 0.92), `${name}_mosaic.${st.fmt}`); toast("저장", "ok"); }
  const seg = (opts, key) => { const s = h("div", { class: "seg" }); for (const [v, t] of opts) s.append(h("button", { type: "button", class: st[key] === v ? "on" : "", onclick: (e) => { st[key] = v; [...s.children].forEach((b) => b.classList.toggle("on", b === e.target)); } }, t)); return s; };
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, wrap, meta),
    h("div", { class: "panel controls" },
      field("효과", seg([["pixel", "픽셀"], ["blur", "블러"], ["black", "검정"]], "mode")),
      field("도구", seg([["brush", "브러시"], ["rect", "사각"]], "shape")),
      field("브러시 크기", range(st.size, { min: 10, max: 400, onInput: (v) => st.size = v })),
      field("강도 (픽셀 크기 / 블러 px)", range(st.strength, { min: 2, max: 60, onInput: (v) => st.strength = v })),
      h("div", { class: "row" }, button("되돌리기 (Ctrl+Z)", doUndo), button("전부 초기화", () => { if (!src) return; snapshot(); work.getContext("2d").drawImage(src, 0, 0); render(); })),
      field("형식", select([["png", "PNG"], ["jpg", "JPG"], ["webp", "WEBP"]], st.fmt, (v) => st.fmt = v)),
      button("저장", save, "btn primary full"))));
  const ho = handoff.take(); if (ho?.files?.[0]) load(ho.files[0]);
  return () => { dz.destroy(); document.removeEventListener("keydown", onKey); };
}
