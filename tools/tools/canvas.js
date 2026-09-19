// 템플릿 캔버스 — 여러 장·문자를 배치한 페이지들 → PNG 또는 슬라이드 GIF/WebM
import { h, dropzone, loadBitmap, canvas, toBlob, download, field, select, num, button, range, isImage, mimeOf, toast, check, progress, deliver, clamp } from "../ui.js";
import { GIFEncoder, quantize, applyPalette } from "../vendor/gifenc.esm.js";

const SIZES = [["1080x1080", "정사각 1080"], ["1080x1350", "4:5 1080×1350"], ["1080x1920", "세로 9:16"], ["1920x1080", "가로 16:9"], ["1920x1088", "1920×1088 (i2v)"], ["1200x630", "링크 카드 1200×630"], ["custom", "직접"]];
const FONTS = [["'DM Sans', sans-serif", "DM Sans"], ["'Playfair Display', serif", "Playfair"], ["'Nanum Pen Script', cursive", "나눔 펜"], ["'Malgun Gothic', sans-serif", "맑은 고딕"], ["Impact, sans-serif", "Impact"], ["monospace", "고정폭"]];

export function mount(root) {
  const st = { W: 1080, H: 1080, bg: "#fffaf4", grad: "", fmt: "png", dur: 1500, fade: 400, out: "gif" };
  let pages = [{ items: [] }], pi = 0, sel = -1, drag = null;
  const view = h("canvas"); const wrap = h("div", { class: "canvas-wrap checker" }, view); const meta = h("div", { class: "meta" });
  const prog = progress(); const pageBar = h("div", { class: "row" }); const layerList = h("div", { class: "filelist" });
  const items = () => pages[pi].items;

  function draw(ctx = view.getContext("2d"), forExport = false) {
    if (!forExport) { view.width = st.W; view.height = st.H; }
    ctx.clearRect(0, 0, st.W, st.H);
    if (st.grad) { const g = ctx.createLinearGradient(0, 0, st.W, st.H); g.addColorStop(0, st.bg); g.addColorStop(1, st.grad); ctx.fillStyle = g; } else ctx.fillStyle = st.bg;
    if (st.bg !== "transparent") ctx.fillRect(0, 0, st.W, st.H);
    for (const it of items()) {
      ctx.save(); ctx.globalAlpha = it.alpha; ctx.translate(it.x + it.w / 2, it.y + it.h / 2); ctx.rotate(it.rot * Math.PI / 180);
      if (it.type === "image") { if (it.round) { ctx.beginPath(); ctx.roundRect(-it.w / 2, -it.h / 2, it.w, it.h, Math.min(it.w, it.h) * it.round / 2); ctx.clip(); } ctx.drawImage(it.img, -it.w / 2, -it.h / 2, it.w, it.h); }
      else if (it.type === "text") { ctx.font = `${it.bold ? "700" : "400"} ${it.size}px ${it.font}`; ctx.textAlign = it.align; ctx.textBaseline = "middle"; const lines = it.text.split("\n"); const lh = it.size * 1.25; const x = it.align === "left" ? -it.w / 2 : it.align === "right" ? it.w / 2 : 0;
        lines.forEach((ln, i) => { const y = (i - (lines.length - 1) / 2) * lh; if (it.stroke) { ctx.lineWidth = it.size / 8; ctx.strokeStyle = it.stroke; ctx.lineJoin = "round"; ctx.strokeText(ln, x, y); } if (it.shadow) { ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = it.size / 5; ctx.shadowOffsetY = it.size / 12; } ctx.fillStyle = it.color; ctx.fillText(ln, x, y); ctx.shadowColor = "transparent"; }); }
      else if (it.type === "rect") { ctx.fillStyle = it.color; ctx.beginPath(); ctx.roundRect(-it.w / 2, -it.h / 2, it.w, it.h, Math.min(it.w, it.h) * it.round / 2); ctx.fill(); }
      ctx.restore();
      if (!forExport && items()[sel] === it) { ctx.save(); ctx.strokeStyle = "#8370a8"; ctx.setLineDash([10, 6]); ctx.lineWidth = 3; ctx.strokeRect(it.x, it.y, it.w, it.h); ctx.fillStyle = "#8370a8"; ctx.fillRect(it.x + it.w - 14, it.y + it.h - 14, 14, 14); ctx.restore(); }
    }
    if (!forExport) { meta.textContent = `${st.W}×${st.H} · 페이지 ${pi + 1}/${pages.length} · 레이어 ${items().length}`; renderLayers(); renderPages(); }
  }
  function measureText(it) { const c = canvas(10, 10).getContext("2d"); c.font = `${it.bold ? "700" : "400"} ${it.size}px ${it.font}`; const lines = it.text.split("\n"); it.w = Math.max(...lines.map((l) => c.measureText(l).width)) + it.size * 0.4; it.h = lines.length * it.size * 1.25 + it.size * 0.3; }
  function addImage(img) { const r = Math.min(st.W * 0.6 / img.width, st.H * 0.6 / img.height, 1); const w = img.width * r, hh = img.height * r; items().push({ type: "image", img, x: (st.W - w) / 2 + items().length * 20, y: (st.H - hh) / 2 + items().length * 20, w, h: hh, rot: 0, alpha: 1, round: 0 }); sel = items().length - 1; draw(); }
  function addText(text = "문구를 입력") { const it = { type: "text", text, x: 0, y: 0, size: Math.round(st.W / 14), font: FONTS[0][0], color: "#302c46", stroke: "", shadow: false, bold: true, align: "center", rot: 0, alpha: 1 }; measureText(it); it.x = (st.W - it.w) / 2; it.y = (st.H - it.h) / 2; items().push(it); sel = items().length - 1; draw(); editText(); }
  function addRect() { items().unshift({ type: "rect", x: st.W * 0.1, y: st.H * 0.1, w: st.W * 0.8, h: st.H * 0.3, color: "#8370a8", round: 0.2, rot: 0, alpha: 0.9 }); sel = 0; draw(); }
  const dz = dropzone({ accept: "image/*", hint: "여러 장 → 각각 레이어로 추가. 텍스트·도형은 오른쪽에서", onFiles: async (fs) => { for (const f of fs.filter(isImage)) { const b = await loadBitmap(f); const c = canvas(b.width, b.height); c.getContext("2d").drawImage(b, 0, 0); b.close?.(); addImage(c); } } });
  // ---- 인터랙션 ----
  const pos = (e) => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) * st.W / r.width, (e.clientY - r.top) * st.H / r.height]; };
  view.addEventListener("pointerdown", (e) => { const [x, y] = pos(e); const i = items().findLastIndex((it) => x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h); sel = i; if (i >= 0) { const it = items()[i]; drag = { sx: x, sy: y, ox: it.x, oy: it.y, ow: it.w, oh: it.h, corner: x > it.x + it.w - 24 && y > it.y + it.h - 24 }; view.setPointerCapture(e.pointerId); } draw(); });
  view.addEventListener("pointermove", (e) => { if (!drag || sel < 0) return; const [x, y] = pos(e); const it = items()[sel]; if (drag.corner) { const s = Math.max(0.05, (drag.ow + x - drag.sx) / drag.ow); it.w = drag.ow * s; it.h = drag.oh * s; if (it.type === "text") { it.size = Math.round(it.size * s); measureText(it); drag.ow = it.w; drag.oh = it.h; drag.sx = x; } } else { it.x = drag.ox + x - drag.sx; it.y = drag.oy + y - drag.sy; } draw(); });
  view.addEventListener("pointerup", () => drag = null);
  view.addEventListener("dblclick", () => { if (sel >= 0 && items()[sel].type === "text") editText(); });
  const onKey = (e) => { if (sel < 0 || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return; const it = items()[sel]; const step = e.shiftKey ? 10 : 1;
    if (e.key === "Delete" || e.key === "Backspace") { items().splice(sel, 1); sel = -1; } else if (e.key === "ArrowLeft") it.x -= step; else if (e.key === "ArrowRight") it.x += step; else if (e.key === "ArrowUp") it.y -= step; else if (e.key === "ArrowDown") it.y += step; else if (e.key === "d" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); items().push({ ...it, x: it.x + 30, y: it.y + 30 }); sel = items().length - 1; } else return; e.preventDefault(); draw(); };
  document.addEventListener("keydown", onKey);
  // ---- 속성 패널 ----
  const propBox = h("div", { class: "controls" });
  function renderLayers() {
    const arr = items();
    const swap = (a, b) => { const t = arr[a]; arr[a] = arr[b]; arr[b] = t; };
    const rows = arr.map((it, i) => h("li", { style: i === sel ? { borderColor: "#8370a8", background: "#f4eefb" } : {}, onclick: () => { sel = i; draw(); } },
      h("span", { class: "thumb ph" }, it.type === "image" ? "🖼" : it.type === "text" ? "T" : "▭"),
      h("span", { class: "fname" }, it.type === "text" ? it.text.split("\n")[0] : it.type),
      h("button", { class: "x", type: "button", title: "위로", onclick: (e) => { e.stopPropagation(); if (i < arr.length - 1) { swap(i, i + 1); sel = i + 1; draw(); } } }, "▲"),
      h("button", { class: "x", type: "button", title: "아래로", onclick: (e) => { e.stopPropagation(); if (i > 0) { swap(i, i - 1); sel = i - 1; draw(); } } }, "▼"),
      h("button", { class: "x", type: "button", onclick: (e) => { e.stopPropagation(); arr.splice(i, 1); sel = -1; draw(); } }, "×")));
    layerList.replaceChildren(...rows.reverse());
    renderProps();
  }
  function renderProps() {
    propBox.replaceChildren(); const it = items()[sel]; if (!it) { propBox.append(h("p", { class: "help" }, "레이어를 클릭하면 속성이 나온다. 드래그 이동 · 오른쪽 아래 모서리로 크기 · 방향키 · Delete · Ctrl+D 복제.")); return; }
    propBox.append(h("h3", {}, `선택: ${it.type}`));
    propBox.append(field("불투명도", range(it.alpha * 100, { min: 5, max: 100, onInput: (v) => { it.alpha = v / 100; draw(); } })), field("회전", range(it.rot, { min: -180, max: 180, onInput: (v) => { it.rot = v; draw(); } })));
    if (it.type !== "text") propBox.append(field("모서리 둥글기", range(it.round * 100, { min: 0, max: 100, onInput: (v) => { it.round = v / 100; draw(); } })));
    if (it.type === "rect") propBox.append(field("색", h("input", { type: "color", value: it.color, oninput: (e) => { it.color = e.target.value; draw(); } })));
    if (it.type === "text") propBox.append(
      field("문구", h("textarea", { rows: 2, oninput: (e) => { it.text = e.target.value; measureText(it); draw(); } }, it.text)),
      h("div", { class: "row" }, field("글꼴", select(FONTS, it.font, (v) => { it.font = v; measureText(it); draw(); })), field("크기", num(it.size, { min: 8, max: 600, onInput: (v) => { it.size = v; measureText(it); draw(); } }))),
      h("div", { class: "row" }, field("색", h("input", { type: "color", value: it.color, oninput: (e) => { it.color = e.target.value; draw(); } })), field("외곽선", h("input", { type: "color", value: it.stroke || "#ffffff", oninput: (e) => { it.stroke = e.target.value; draw(); } }))),
      h("div", { class: "row" }, check("굵게", it.bold, (v) => { it.bold = v; measureText(it); draw(); }), check("그림자", it.shadow, (v) => { it.shadow = v; draw(); }), check("외곽선 켬", !!it.stroke, (v) => { it.stroke = v ? (it.stroke || "#ffffff") : ""; draw(); })),
      field("정렬", select([["center", "가운데"], ["left", "왼쪽"], ["right", "오른쪽"]], it.align, (v) => { it.align = v; draw(); })));
    propBox.append(h("div", { class: "cm-tools" }, button("가운데", () => { it.x = (st.W - it.w) / 2; it.y = (st.H - it.h) / 2; draw(); }, "btn sm"), button("꽉 채움", () => { const s = Math.max(st.W / it.w, st.H / it.h); it.w *= s; it.h *= s; it.x = (st.W - it.w) / 2; it.y = (st.H - it.h) / 2; draw(); }, "btn sm"), button("맞춤", () => { const s = Math.min(st.W / it.w, st.H / it.h); it.w *= s; it.h *= s; it.x = (st.W - it.w) / 2; it.y = (st.H - it.h) / 2; draw(); }, "btn sm")));
  }
  function editText() { renderProps(); propBox.querySelector("textarea")?.focus(); }
  function renderPages() { pageBar.replaceChildren(...pages.map((p, i) => button(`${i + 1}`, () => { pi = i; sel = -1; draw(); }, `btn sm ${i === pi ? "primary" : ""}`)), button("+ 페이지", () => { pages.push({ items: [] }); pi = pages.length - 1; sel = -1; draw(); }, "btn sm"), button("복제", () => { pages.splice(pi + 1, 0, { items: items().map((x) => ({ ...x })) }); pi++; draw(); }, "btn sm"), pages.length > 1 ? button("삭제", () => { pages.splice(pi, 1); pi = Math.max(0, pi - 1); sel = -1; draw(); }, "btn sm danger") : null); }
  // ---- 내보내기 ----
  function renderPage(i) { const c = canvas(st.W, st.H); const keep = pi; pi = i; draw(c.getContext("2d"), true); pi = keep; return c; }
  async function exportImages() { const out = []; for (let i = 0; i < pages.length; i++) out.push({ blob: await toBlob(renderPage(i), mimeOf(st.fmt), 0.92), name: `page_${String(i + 1).padStart(2, "0")}.${st.fmt}` }); await deliver(out, "canvas_pages.zip"); }
  async function exportSlides() {
    const frames = []; const fps = 20; const fadeF = Math.round(st.fade / 1000 * fps), holdF = Math.round(st.dur / 1000 * fps);
    const scale = Math.min(1, 720 / Math.max(st.W, st.H)); const w = Math.round(st.W * scale), hh = Math.round(st.H * scale);
    const rendered = pages.map((_, i) => renderPage(i)); const c = canvas(w, hh), ctx = c.getContext("2d");
    for (let i = 0; i < rendered.length; i++) { for (let f = 0; f < holdF; f++) { ctx.drawImage(rendered[i], 0, 0, w, hh); frames.push(ctx.getImageData(0, 0, w, hh).data); }
      const nx = rendered[(i + 1) % rendered.length]; for (let f = 0; f < fadeF; f++) { ctx.drawImage(rendered[i], 0, 0, w, hh); ctx.globalAlpha = f / fadeF; ctx.drawImage(nx, 0, 0, w, hh); ctx.globalAlpha = 1; frames.push(ctx.getImageData(0, 0, w, hh).data); } }
    if (st.out === "gif") { const gif = GIFEncoder(); for (let i = 0; i < frames.length; i++) { const pal = quantize(frames[i], 256, { format: "rgb444" }); gif.writeFrame(applyPalette(frames[i], pal, "rgb444"), w, hh, { palette: pal, delay: 1000 / fps, repeat: 0 }); if (i % 5 === 0) { prog.set(i / frames.length, `GIF ${i}/${frames.length}`); await new Promise((r) => setTimeout(r)); } } gif.finish(); download(new Blob([gif.bytes()], { type: "image/gif" }), "canvas_slides.gif"); }
    else { const stream = c.captureStream(0); const track = stream.getVideoTracks()[0]; const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm", videoBitsPerSecond: 8e6 }); const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data); rec.start();
      for (let i = 0; i < frames.length; i++) { ctx.putImageData(new ImageData(frames[i], w, hh), 0, 0); track.requestFrame?.(); await new Promise((r) => setTimeout(r, 1000 / fps)); if (i % 10 === 0) prog.set(i / frames.length, `WebM ${i}/${frames.length}`); }
      rec.stop(); await new Promise((r) => rec.onstop = r); download(new Blob(chunks, { type: "video/webm" }), "canvas_slides.webm"); }
    prog.done(); toast("내보냄", "ok");
  }
  const wIn = num(st.W, { min: 64, max: 6000, onInput: (v) => { st.W = v; draw(); } }), hIn = num(st.H, { min: 64, max: 6000, onInput: (v) => { st.H = v; draw(); } });
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, pageBar, wrap, meta, prog, h("h3", {}, "레이어 (위가 앞)"), layerList),
    h("div", { class: "panel" }, h("div", { class: "controls" },
      field("캔버스", select(SIZES, "1080x1080", (v) => { if (v !== "custom") { [st.W, st.H] = v.split("x").map(Number); wIn.value = st.W; hIn.value = st.H; draw(); } })),
      h("div", { class: "row" }, field("가로", wIn), field("세로", hIn)),
      h("div", { class: "row" }, field("배경", h("input", { type: "color", value: st.bg, oninput: (e) => { st.bg = e.target.value; draw(); } })), field("그라데이션 끝색", h("input", { type: "color", value: "#e8e0f5", oninput: (e) => { st.grad = e.target.value; draw(); } }))),
      h("div", { class: "cm-tools" }, button("투명 배경", () => { st.bg = "transparent"; st.grad = ""; draw(); }, "btn sm"), button("그라데이션 끄기", () => { st.grad = ""; draw(); }, "btn sm")),
      h("div", { class: "cm-tools" }, button("+ 텍스트", () => addText(), "btn primary"), button("+ 도형(띠)", addRect)),
      propBox,
      h("h3", {}, "내보내기"),
      h("div", { class: "row" }, field("이미지 형식", select([["png", "PNG"], ["jpg", "JPG"], ["webp", "WEBP"]], st.fmt, (v) => st.fmt = v)), button("페이지 → 이미지", exportImages, "btn primary")),
      h("div", { class: "row" }, field("페이지 유지 ms", num(st.dur, { min: 200, max: 10000, step: 100, onInput: (v) => st.dur = v })), field("페이드 ms", num(st.fade, { min: 0, max: 3000, step: 50, onInput: (v) => st.fade = v }))),
      h("div", { class: "row" }, field("슬라이드 형식", select([["gif", "GIF (≤720px)"], ["webm", "WebM 영상"]], st.out, (v) => st.out = v)), button("페이지 → 슬라이드", exportSlides, "btn primary"))))));
  draw();
  return () => { dz.destroy(); document.removeEventListener("keydown", onKey); };
}
