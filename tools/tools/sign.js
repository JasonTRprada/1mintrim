// 사진·문서 서명 — 손글씨 패드 / 타이핑 / 서명 이미지 → 사진 또는 PDF 페이지 위에 배치
import { h, dropzone, loadBitmap, canvas, toBlob, download, field, select, num, button, range, baseName, isImage, mimeOf, toast, clamp, extOf, progress } from "../ui.js";

let pdfjsP = null;
function pdfjs() { return pdfjsP ||= import(new URL("../vendor/pdf.min.mjs", import.meta.url).href).then((m) => { m.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.mjs", import.meta.url).href; return m; }); }
let pdflibP = null;
function pdflib() { return pdflibP ||= new Promise((res, rej) => { if (window.PDFLib) return res(window.PDFLib); const s = document.createElement("script"); s.src = new URL("../vendor/pdf-lib.min.js", import.meta.url); s.onload = () => res(window.PDFLib); s.onerror = () => rej(new Error("pdf-lib 로드 실패")); document.head.append(s); }); }

export function mount(root) {
  // 문서: 이미지 1장 또는 PDF (페이지 여러 장)
  let doc = null; // { kind:'image'|'pdf', name, pages:[canvas], pdfBytes }
  let page = 0, sig = null /* canvas (투명) */, placed = []; // {page, x,y,w,h, rot, alpha} 문서 좌표
  const st = { color: "#1a1a1a", pen: 3, font: "'Nanum Pen Script', 'Caveat', cursive", typed: "", fmt: "png" };
  const view = h("canvas"); const wrap = h("div", { class: "canvas-wrap" }, view); const meta = h("div", { class: "meta" });
  const pad = h("canvas", { width: 600, height: 220, style: { width: "100%", background: "#fff", border: "1px solid #e9dfe6", borderRadius: "10px", touchAction: "none", cursor: "crosshair" } });
  const sigPreview = h("div", { class: "canvas-wrap checker", style: { minHeight: "80px" } });
  const prog = progress();
  const pageNav = h("div", { class: "row" });
  let mode = "draw";

  // ---------- 문서 로드 ----------
  const dz = dropzone({ accept: "image/*,application/pdf", multiple: false, hint: "사진(JPG·PNG) 또는 PDF 한 개", onFiles: ([f]) => load(f) });
  async function load(f) {
    placed = []; page = 0;
    if (extOf(f.name) === "pdf" || f.type === "application/pdf") {
      prog.set(0.1, "PDF 여는 중");
      const bytes = new Uint8Array(await f.arrayBuffer());
      const lib = await pdfjs(); const pdf = await lib.getDocument({ data: bytes.slice() }).promise;
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) { prog.set(i / pdf.numPages, `페이지 ${i}/${pdf.numPages} 렌더`); const p = await pdf.getPage(i); const vp = p.getViewport({ scale: 2 }); const c = canvas(vp.width, vp.height); await p.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise; c._pt = { w: p.getViewport({ scale: 1 }).width, h: p.getViewport({ scale: 1 }).height }; pages.push(c); }
      doc = { kind: "pdf", name: baseName(f.name), pages, pdfBytes: bytes }; prog.done();
    } else if (isImage(f)) {
      const b = await loadBitmap(f); const c = canvas(b.width, b.height); c.getContext("2d").drawImage(b, 0, 0); b.close?.();
      doc = { kind: "image", name: baseName(f.name), pages: [c] };
    } else return toast("사진 또는 PDF 만", "warn");
    dz.classList.add("compact"); renderNav(); draw(); meta.textContent = `${f.name} · ${doc.pages.length}페이지 · ${doc.pages[0].width}×${doc.pages[0].height}`;
  }
  function renderNav() {
    pageNav.replaceChildren();
    if (!doc || doc.pages.length < 2) return;
    pageNav.append(button("‹ 이전", () => { page = Math.max(0, page - 1); draw(); }, "btn sm"), h("span", { class: "meta" }, `페이지 ${page + 1}/${doc.pages.length}`), button("다음 ›", () => { page = Math.min(doc.pages.length - 1, page + 1); draw(); }, "btn sm"));
  }
  // ---------- 서명 만들기 ----------
  const pc = pad.getContext("2d"); let drawing = false, last = null;
  const ppos = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
  pad.addEventListener("pointerdown", (e) => { drawing = true; pad.setPointerCapture(e.pointerId); last = ppos(e); pc.beginPath(); pc.arc(last[0], last[1], st.pen / 2, 0, 7); pc.fillStyle = st.color; pc.fill(); });
  pad.addEventListener("pointermove", (e) => { if (!drawing) return; const p = ppos(e); pc.strokeStyle = st.color; pc.lineWidth = st.pen * (e.pressure ? 0.6 + e.pressure : 1); pc.lineCap = "round"; pc.lineJoin = "round"; pc.beginPath(); pc.moveTo(last[0], last[1]); pc.lineTo(p[0], p[1]); pc.stroke(); last = p; });
  pad.addEventListener("pointerup", () => { drawing = false; usePad(); });
  function trimAlpha(c) { // 투명 여백 잘라내기
    const { width: w, height: hh } = c; const d = c.getContext("2d").getImageData(0, 0, w, hh).data; let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null; const o = canvas(x1 - x0 + 1 + 8, y1 - y0 + 1 + 8); o.getContext("2d").drawImage(c, x0 - 4, y0 - 4, o.width, o.height, 0, 0, o.width, o.height); return o;
  }
  function usePad() { const t = trimAlpha(pad); if (!t) return; setSig(t); }
  function useTyped() {
    if (!st.typed.trim()) return toast("이름을 입력", "warn");
    const c = canvas(1200, 300), ctx = c.getContext("2d"); ctx.font = `120px ${st.font}`; ctx.fillStyle = st.color; ctx.textBaseline = "middle"; ctx.fillText(st.typed, 30, 150);
    const t = trimAlpha(c); if (t) setSig(t);
  }
  async function useImage(f) { // 흰 배경 서명 사진 → 투명
    const b = await loadBitmap(f); const c = canvas(b.width, b.height), ctx = c.getContext("2d"); ctx.drawImage(b, 0, 0); b.close?.();
    const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data; const col = hex(st.color);
    for (let i = 0; i < d.length; i += 4) { const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; const a = clamp((200 - lum) / 120, 0, 1); d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.round(a * 255); }
    ctx.putImageData(id, 0, 0); const t = trimAlpha(c); if (t) setSig(t); else toast("서명을 못 찾았다 (배경이 흰색이어야)", "warn");
  }
  const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  function setSig(c) { sig = c; sigPreview.replaceChildren(Object.assign(c.cloneNode(), { width: c.width, height: c.height })); sigPreview.firstChild.getContext("2d").drawImage(c, 0, 0); sigPreview.firstChild.style.maxHeight = "120px"; placeBtn.disabled = !doc; }
  // ---------- 배치 ----------
  function place() {
    if (!doc || !sig) return;
    const pg = doc.pages[page]; const w = pg.width * 0.25, hh = w * sig.height / sig.width;
    placed.push({ page, x: pg.width - w - pg.width * 0.05, y: pg.height - hh - pg.height * 0.05, w, h: hh, rot: 0, alpha: 1, sig });
    sel = placed.length - 1; draw();
  }
  let sel = -1, drag = null;
  function draw() {
    if (!doc) return; const pg = doc.pages[page];
    view.width = pg.width; view.height = pg.height; const ctx = view.getContext("2d"); ctx.drawImage(pg, 0, 0);
    placed.forEach((p, i) => { if (p.page !== page) return; drawSig(ctx, p); if (i === sel) { ctx.save(); ctx.strokeStyle = "#8370a8"; ctx.setLineDash([8, 6]); ctx.lineWidth = 3; ctx.strokeRect(p.x, p.y, p.w, p.h); ctx.restore(); } });
    renderNav();
  }
  function drawSig(ctx, p) { ctx.save(); ctx.globalAlpha = p.alpha; ctx.translate(p.x + p.w / 2, p.y + p.h / 2); ctx.rotate(p.rot * Math.PI / 180); ctx.drawImage(p.sig, -p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }
  const vpos = (e) => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) * view.width / r.width, (e.clientY - r.top) * view.height / r.height]; };
  view.addEventListener("pointerdown", (e) => { const [x, y] = vpos(e); const i = placed.findLastIndex((p) => p.page === page && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h); sel = i; if (i >= 0) { const p = placed[i]; const corner = x > p.x + p.w - p.w * 0.25 && y > p.y + p.h - p.h * 0.25; drag = { i, sx: x, sy: y, ox: p.x, oy: p.y, ow: p.w, corner }; view.setPointerCapture(e.pointerId); } draw(); });
  view.addEventListener("pointermove", (e) => { if (!drag) return; const [x, y] = vpos(e); const p = placed[drag.i]; if (drag.corner) { const nw = Math.max(20, drag.ow + (x - drag.sx)); p.h = p.h * nw / p.w; p.w = nw; } else { p.x = drag.ox + x - drag.sx; p.y = drag.oy + y - drag.sy; } draw(); });
  view.addEventListener("pointerup", () => drag = null);
  const onKey = (e) => { if (sel < 0 || document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return; if (e.key === "Delete" || e.key === "Backspace") { placed.splice(sel, 1); sel = -1; draw(); } };
  document.addEventListener("keydown", onKey);
  // ---------- 저장 ----------
  async function save() {
    if (!doc) return;
    if (doc.kind === "image") { const c = canvas(view.width, view.height); const ctx = c.getContext("2d"); ctx.drawImage(doc.pages[0], 0, 0); placed.forEach((p) => drawSig(ctx, p)); download(await toBlob(c, mimeOf(st.fmt), 0.92), `${doc.name}_signed.${st.fmt}`); return toast("저장", "ok"); }
    const { PDFDocument, degrees } = await pdflib(); const pdf = await PDFDocument.load(doc.pdfBytes); const pages = pdf.getPages();
    for (const p of placed) { const pg = pages[p.page]; const src = doc.pages[p.page]; const sx = pg.getWidth() / src.width, sy = pg.getHeight() / src.height;
      const c = canvas(p.sig.width, p.sig.height); const ctx = c.getContext("2d"); ctx.globalAlpha = p.alpha; ctx.drawImage(p.sig, 0, 0);
      const png = await pdf.embedPng(new Uint8Array(await (await toBlob(c, "image/png")).arrayBuffer()));
      const w = p.w * sx, hh = p.h * sy; const cx = (p.x + p.w / 2) * sx, cy = pg.getHeight() - (p.y + p.h / 2) * sy; const r = -p.rot * Math.PI / 180;
      pg.drawImage(png, { x: cx - (w / 2) * Math.cos(r) + (hh / 2) * Math.sin(r), y: cy - (w / 2) * Math.sin(r) - (hh / 2) * Math.cos(r), width: w, height: hh, rotate: degrees(-p.rot) }); }
    download(new Blob([await pdf.save()], { type: "application/pdf" }), `${doc.name}_signed.pdf`); toast("PDF 저장", "ok");
  }
  const placeBtn = button("문서에 서명 놓기", place, "btn primary full"); placeBtn.disabled = true;
  const modeSeg = h("div", { class: "seg" }); const panes = {};
  for (const [v, t] of [["draw", "손글씨"], ["type", "타이핑"], ["image", "서명 이미지"]]) modeSeg.append(h("button", { type: "button", class: v === mode ? "on" : "", onclick: (e) => { mode = v; [...modeSeg.children].forEach((b) => b.classList.toggle("on", b === e.target)); Object.entries(panes).forEach(([k, el]) => el.classList.toggle("hidden", k !== v)); } }, t));
  panes.draw = h("div", {}, pad, h("div", { class: "row", style: { marginTop: "6px" } }, button("지우기", () => { pc.clearRect(0, 0, pad.width, pad.height); }, "btn sm"), button("이 서명 쓰기", usePad, "btn sm primary")));
  panes.type = h("div", { class: "hidden" }, field("이름", h("input", { type: "text", placeholder: "홍길동", oninput: (e) => st.typed = e.target.value })), field("글꼴", select([["'Nanum Pen Script', cursive", "나눔 펜 (한글 손글씨)"], ["'Caveat', cursive", "Caveat (영문 손글씨)"], ["'Playfair Display', serif", "세리프"], ["cursive", "시스템 필기체"]], st.font, (v) => st.font = v)), button("이 서명 쓰기", useTyped, "btn sm primary"));
  panes.image = h("div", { class: "hidden" }, field("흰 종이에 쓴 서명 사진", h("input", { type: "file", accept: "image/*", onchange: (e) => e.target.files[0] && useImage(e.target.files[0]) }), "흰 배경을 투명으로, 획은 아래 색으로 바꾼다"));
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, pageNav, wrap, meta, prog, h("p", { class: "help", style: { marginTop: "10px" } }, "놓인 서명은 드래그로 이동, 오른쪽 아래 모서리를 끌면 크기. ", h("kbd", {}, "Delete"), " 로 제거. PDF 는 원본 위에 서명 이미지를 얹어 다시 저장한다(텍스트 보존).")),
    h("div", { class: "panel controls" },
      h("h3", {}, "1. 서명 만들기"), modeSeg, panes.draw, panes.type, panes.image,
      h("div", { class: "row" }, field("잉크색", h("input", { type: "color", value: st.color, oninput: (e) => st.color = e.target.value })), field("펜 굵기", num(st.pen, { min: 1, max: 12, onInput: (v) => st.pen = v }))),
      sigPreview,
      h("h3", {}, "2. 배치"), placeBtn,
      field("불투명도 (선택된 서명)", range(100, { min: 10, max: 100, onInput: (v) => { if (sel >= 0) { placed[sel].alpha = v / 100; draw(); } } })),
      field("회전 °", range(0, { min: -45, max: 45, onInput: (v) => { if (sel >= 0) { placed[sel].rot = v; draw(); } } })),
      h("h3", {}, "3. 저장"), field("사진 형식", select([["png", "PNG"], ["jpg", "JPG"], ["webp", "WEBP"]], st.fmt, (v) => st.fmt = v)),
      button("저장 (사진 / PDF)", save, "btn primary full"))));
  return () => { dz.destroy(); document.removeEventListener("keydown", onKey); };
}
