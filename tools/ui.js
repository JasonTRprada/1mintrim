// 공용 UI · 파일 · 캔버스 · ZIP 헬퍼. 모든 도구가 이 파일만 import 한다.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (v === false || v == null) continue;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;
export const fmtTime = (s) => { const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r.toFixed(2).padStart(5, "0")}`; };
export const baseName = (name) => name.replace(/\.[^.]+$/, "");
export const extOf = (name) => (name.match(/\.([^.]+)$/) || ["", ""])[1].toLowerCase();
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IMG_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"]);
const VID_EXT = new Set(["mp4", "webm", "mov", "m4v", "mkv"]);
export const isImage = (f) => (f.type && f.type.startsWith("image/")) || IMG_EXT.has(extOf(f.name));
export const isVideo = (f) => (f.type && f.type.startsWith("video/")) || VID_EXT.has(extOf(f.name));

// ---------- toast ----------
let toastEl;
export function toast(msg, kind = "info", ms = 3200) {
  if (!toastEl) { toastEl = h("div", { class: "toast-host" }); document.body.append(toastEl); }
  const t = h("div", { class: `toast ${kind}` }, msg);
  toastEl.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- 드롭존 ----------
export function dropzone({ accept = "*", multiple = true, hint = "", title = "파일을 여기에 드래그하거나 클릭해서 고르세요", onFiles }) {
  const input = h("input", { type: "file", accept: accept === "*" ? "" : accept, multiple, hidden: true });
  const zone = h("div", { class: "dropzone", tabindex: "0", role: "button" },
    h("div", { class: "dz-icon" }, "⬆"),
    h("p", { class: "dz-title" }, title),
    hint ? h("p", { class: "dz-hint" }, hint) : null,
    h("p", { class: "dz-paste" }, "Ctrl+V 로 클립보드 이미지 붙여넣기도 됩니다"),
    input);
  const emit = (list) => {
    const files = [...list].filter((f) => f.size > 0);
    if (!files.length) return;
    onFiles(multiple ? files : files.slice(0, 1));
  };
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { emit(input.files); input.value = ""; });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("over"); emit(e.dataTransfer.files); });
  const onPaste = (e) => {
    if (!zone.isConnected) return;
    const items = [...(e.clipboardData?.items || [])].filter((i) => i.kind === "file");
    if (!items.length) return;
    const files = items.map((i, n) => { const f = i.getAsFile(); return f && new File([f], f.name && f.name !== "image.png" ? f.name : `paste_${Date.now()}_${n}.png`, { type: f.type }); }).filter(Boolean);
    if (files.length) { e.preventDefault(); emit(files); }
  };
  document.addEventListener("paste", onPaste);
  zone.destroy = () => document.removeEventListener("paste", onPaste);
  zone.accept = emit;
  return zone;
}

// ---------- 이미지 ----------
export async function loadBitmap(file, opts) {
  try { return await createImageBitmap(file, opts); }
  catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      return await createImageBitmap(img, opts);
    } finally { URL.revokeObjectURL(url); }
  }
}
export function canvas(w, hh) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh)); return c; }
export function toBlob(c, type = "image/png", quality = 0.92) {
  return new Promise((res, rej) => c.toBlob((b) => b ? res(b) : rej(new Error("toBlob 실패")), type, quality));
}
export const mimeOf = (fmt) => ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" })[fmt] || "image/png";
export const extForMime = (m) => ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" })[m] || "png";

// 그레이스케일 (BT.601 · PIL convert("L") 과 같은 계수)
export function toGray(imgData) {
  const d = imgData.data, n = imgData.width * imgData.height, g = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
  return g;
}

// ---------- 다운로드 ----------
export function download(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- ZIP (store · 무압축) ----------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export class Zip {
  constructor() { this.entries = []; }
  async add(name, blob) {
    const data = new Uint8Array(await blob.arrayBuffer());
    this.entries.push({ name: new TextEncoder().encode(name), data, crc: crc32(data) });
  }
  async blob() {
    const parts = [], central = []; let offset = 0;
    const now = new Date();
    const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    for (const e of this.entries) {
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, e.crc, true);
      lh.setUint32(18, e.data.length, true); lh.setUint32(22, e.data.length, true); lh.setUint16(26, e.name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, e.name, e.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, e.crc, true);
      ch.setUint32(20, e.data.length, true); ch.setUint32(24, e.data.length, true); ch.setUint16(28, e.name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(ch.buffer, e.name);
      offset += 30 + e.name.length + e.data.length;
    }
    const cdSize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, this.entries.length, true); end.setUint16(10, this.entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
    return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
  }
}
// 결과 여러 개면 zip, 하나면 그대로
export async function deliver(items, zipName) {
  if (!items.length) return toast("내보낼 결과가 없습니다", "warn");
  if (items.length === 1) return download(items[0].blob, items[0].name);
  const z = new Zip(); for (const it of items) await z.add(it.name, it.blob);
  download(await z.blob(), zipName);
}

// ---------- 폼 위젯 ----------
export function field(label, control, note) {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), control, note ? h("small", { class: "field-note" }, note) : null);
}
export function select(options, value, onChange) {
  return h("select", { onchange: (e) => onChange?.(e.target.value) }, ...options.map(([v, t]) => h("option", { value: v, selected: String(v) === String(value) }, t)));
}
export function num(value, { min, max, step = 1, onInput, width } = {}) {
  return h("input", { type: "number", value, min, max, step, style: width ? { width } : undefined, oninput: (e) => onInput?.(Number(e.target.value)) });
}
export function range(value, { min = 0, max = 100, step = 1, onInput } = {}) {
  return h("input", { type: "range", value, min, max, step, oninput: (e) => onInput?.(Number(e.target.value)) });
}
export function check(label, checked, onChange) {
  const i = h("input", { type: "checkbox", checked, onchange: (e) => onChange?.(e.target.checked) });
  return h("label", { class: "check" }, i, h("span", {}, label));
}
export function button(text, onClick, cls = "btn") { return h("button", { class: cls, type: "button", onclick: onClick }, text); }
export function progress() {
  const bar = h("div", { class: "pbar" }); const label = h("span", { class: "plabel" });
  const wrap = h("div", { class: "pwrap", hidden: true }, h("div", { class: "ptrack" }, bar), label);
  wrap.set = (p, text) => { wrap.hidden = false; bar.style.width = `${Math.round(p * 100)}%`; if (text != null) label.textContent = text; };
  wrap.done = () => { wrap.hidden = true; bar.style.width = "0%"; label.textContent = ""; };
  return wrap;
}

// ---------- 파일 목록 ----------
export function fileList(files, { onRemove, thumbs = true } = {}) {
  const ul = h("ul", { class: "filelist" });
  files.forEach((f, i) => {
    const li = h("li", {},
      thumbs && isImage(f) ? h("img", { class: "thumb", alt: "", src: URL.createObjectURL(f), onload: (e) => URL.revokeObjectURL(e.target.src) }) : h("span", { class: "thumb ph" }, isVideo(f) ? "▶" : "▤"),
      h("span", { class: "fname", title: f.name }, f.name),
      h("span", { class: "fsize" }, fmtBytes(f.size)),
      onRemove ? h("button", { class: "x", type: "button", onclick: () => onRemove(i), "aria-label": "제거" }, "×") : null);
    ul.append(li);
  });
  return ul;
}

// ---------- 도구 간 핸드오프 (녹화 → GIF, 갤러리 → 편집 등) ----------
export const handoff = {
  _v: null,
  put(files, from) { this._v = { files, from, t: Date.now() }; },
  take() { const v = this._v; this._v = null; return v; },
};

// ---------- 비디오 ----------
export function loadVideo(file) {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto";
    v.src = URL.createObjectURL(file);
    v.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(v.duration)) return res(v);
      // MediaRecorder 가 만든 WebM 은 길이 정보가 없다 → 끝으로 탐색해 길이를 얻는다
      const fix = () => { if (!Number.isFinite(v.duration)) return; v.removeEventListener("durationchange", fix); v.currentTime = 0; res(v); };
      v.addEventListener("durationchange", fix);
      v.currentTime = 1e6;
      setTimeout(() => { if (!Number.isFinite(v.duration)) rej(new Error("영상 길이를 알 수 없습니다")); }, 8000);
    }, { once: true });
    v.addEventListener("error", () => rej(new Error("영상을 열 수 없습니다 (브라우저가 이 코덱을 지원하지 않을 수 있음)")), { once: true });
  });
}
export function seekTo(v, t) {
  return new Promise((res) => {
    const target = clamp(t, 0, Math.max(0, v.duration - 0.001));
    // rAF 는 숨은 탭에서 멈추므로 setTimeout 으로 프레임 반영을 기다린다
    if (Math.abs(v.currentTime - target) < 0.0005 && v.readyState >= 2) return setTimeout(res, 16);
    const done = () => { v.removeEventListener("seeked", done); setTimeout(res, 16); };
    v.addEventListener("seeked", done);
    v.currentTime = target;
  });
}
export async function frameAt(v, t, w, hh) {
  await seekTo(v, t);
  const c = canvas(w || v.videoWidth, hh || v.videoHeight);
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  return c;
}

// ---------- 확대·축소·이동 (브러시 도구 공용) ----------
// wrap 안의 canvas 에 CSS transform 을 건다. 도구 쪽 좌표 변환은 getBoundingClientRect 기반이라 그대로 맞는다.
// 휠=커서 기준 줌 · 가운데 버튼 / Space+드래그 / Alt+드래그 = 이동 · 툴바(−·%·+·맞춤) 반환
export function zoomable(wrap, cv, { min = 0.25, max = 12 } = {}) {
  let z = 1, tx = 0, ty = 0, panning = null, space = false;
  wrap.style.overflow = "hidden"; wrap.style.touchAction = "none"; cv.style.transformOrigin = "0 0"; cv.style.willChange = "transform";
  const label = h("span", { class: "zoom-label" }, "100%");
  const apply = () => { cv.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`; label.textContent = `${Math.round(z * 100)}%`; wrap.classList.toggle("zoomed", z !== 1 || tx || ty); };
  const fit = () => { z = 1; tx = ty = 0; apply(); };
  const zoomAt = (f, cx, cy) => { const r = wrap.getBoundingClientRect(); const px = cx - r.left, py = cy - r.top; const nz = clamp(z * f, min, max); const k = nz / z; tx = px - (px - tx) * k; ty = py - (py - ty) * k; z = nz; apply(); };
  wrap.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
  const onKey = (e) => { if (e.code === "Space" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) { space = e.type === "keydown"; wrap.style.cursor = space ? "grab" : ""; if (space) e.preventDefault(); } };
  document.addEventListener("keydown", onKey); document.addEventListener("keyup", onKey);
  wrap.addEventListener("pointerdown", (e) => { if (e.button === 1 || space || e.altKey) { e.preventDefault(); e.stopPropagation(); panning = { x: e.clientX, y: e.clientY, tx, ty }; try { wrap.setPointerCapture(e.pointerId); } catch {} wrap.style.cursor = "grabbing"; } }, true);
  wrap.addEventListener("pointermove", (e) => { if (!panning) return; e.stopPropagation(); tx = panning.tx + e.clientX - panning.x; ty = panning.ty + e.clientY - panning.y; apply(); }, true);
  wrap.addEventListener("pointerup", (e) => { if (!panning) return; e.stopPropagation(); panning = null; wrap.style.cursor = space ? "grab" : ""; }, true);
  wrap.addEventListener("dblclick", (e) => { if (e.altKey) fit(); });
  const bar = h("div", { class: "zoom-bar" }, button("−", () => { const r = wrap.getBoundingClientRect(); zoomAt(1 / 1.25, r.left + r.width / 2, r.top + r.height / 2); }, "btn sm"), label, button("+", () => { const r = wrap.getBoundingClientRect(); zoomAt(1.25, r.left + r.width / 2, r.top + r.height / 2); }, "btn sm"), button("맞춤", fit, "btn sm"), h("span", { class: "zoom-hint" }, "휠 줌 · 가운데버튼/Space 드래그 이동"));
  bar.fit = fit; bar.destroy = () => { document.removeEventListener("keydown", onKey); document.removeEventListener("keyup", onKey); };
  bar.isPanning = () => !!panning || space;
  return bar;
}

// 로컬 폴더 저장 (File System Access) — 없으면 null
export async function pickDirectory(mode = "read") {
  if (!window.showDirectoryPicker) return null;
  try { return await window.showDirectoryPicker({ mode }); } catch (e) { if (e.name !== "AbortError") toast(e.message, "warn"); return null; }
}
export async function writeFileTo(dirHandle, name, blob) {
  const fh = await dirHandle.getFileHandle(name, { create: true });
  const w = await fh.createWritable(); await w.write(blob); await w.close();
}
