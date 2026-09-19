// QR 코드 (qrcode-generator)
import { h, field, select, num, button, download, toast, range } from "../ui.js";

let libP = null;
function lib() { return libP ||= new Promise((res, rej) => { if (window.qrcode) return res(window.qrcode); const s = document.createElement("script"); s.src = new URL("../vendor/qrcode.js", import.meta.url); s.onload = () => res(window.qrcode); s.onerror = () => rej(new Error("qrcode 로드 실패")); document.head.append(s); }); }

export function mount(root) {
  const st = { text: "https://1mintrim.com/", ecl: "M", size: 512, margin: 4, fg: "#302c46", bg: "#ffffff", round: 0 };
  const cv = h("canvas"); const wrap = h("div", { class: "canvas-wrap" }, cv); const meta = h("div", { class: "meta" });
  let qr = null;
  async function make() {
    try {
      const Q = await lib(); qr = Q(0, st.ecl); qr.addData(st.text || " ", /^[A-Z0-9 $%*+\-./:]*$/.test(st.text) ? "Alphanumeric" : "Byte"); qr.make();
      const n = qr.getModuleCount(), cell = st.size / (n + st.margin * 2);
      cv.width = cv.height = st.size; const ctx = cv.getContext("2d");
      ctx.fillStyle = st.bg; ctx.fillRect(0, 0, st.size, st.size); ctx.fillStyle = st.fg;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) { const x = (c + st.margin) * cell, y = (r + st.margin) * cell;
        if (st.round) { const rr = cell * st.round / 2; ctx.beginPath(); ctx.roundRect(x, y, cell + 0.5, cell + 0.5, rr); ctx.fill(); } else ctx.fillRect(x, y, cell + 0.5, cell + 0.5); }
      meta.textContent = `${n}×${n} 모듈 · 오류정정 ${st.ecl} · ${st.size}px · ${new TextEncoder().encode(st.text).length} bytes`;
    } catch (e) { meta.textContent = "너무 긴 내용이거나 만들 수 없음: " + e.message; }
  }
  function svg() { if (!qr) return; const n = qr.getModuleCount(), m = st.margin; let p = ""; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) p += `M${c + m} ${r + m}h1v1h-1z`;
    const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${st.bg}"/><path d="${p}" fill="${st.fg}"/></svg>`;
    download(new Blob([s], { type: "image/svg+xml" }), "qr.svg"); }
  const ta = h("textarea", { rows: 4, oninput: (e) => { st.text = e.target.value; make(); } }, st.text);
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, wrap, meta),
    h("div", { class: "panel controls" },
      field("내용 (URL · 텍스트 · Wi-Fi 문자열 등)", ta),
      h("div", { class: "row" }, field("오류 정정", select([["L", "L 7%"], ["M", "M 15%"], ["Q", "Q 25%"], ["H", "H 30%"]], st.ecl, (v) => { st.ecl = v; make(); })), field("크기 px", num(st.size, { min: 128, max: 4096, step: 64, onInput: (v) => { st.size = v; make(); } }))),
      h("div", { class: "row" }, field("전경", h("input", { type: "color", value: st.fg, oninput: (e) => { st.fg = e.target.value; make(); } })), field("배경", h("input", { type: "color", value: st.bg, oninput: (e) => { st.bg = e.target.value; make(); } }))),
      field("여백 (모듈)", num(st.margin, { min: 0, max: 16, onInput: (v) => { st.margin = v; make(); } })),
      field("모서리 둥글기", range(0, { min: 0, max: 100, onInput: (v) => { st.round = v / 100; make(); } })),
      button("PNG 저장", () => cv.toBlob((b) => { download(b, "qr.png"); toast("저장", "ok"); }), "btn primary full"), button("SVG 저장", svg))));
  make();
  return () => {};
}
