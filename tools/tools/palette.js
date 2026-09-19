// 팔레트 추출 — 이미지의 대표색 N개 (k-means) · 프롬프트용 색 이름 · 복사 · 팔레트 PNG
import { h, dropzone, loadBitmap, canvas, toBlob, download, field, num, button, isImage, toast, check } from "../ui.js";

const NAMES = [["black", 0, 0, 0], ["white", 255, 255, 255], ["gray", 128, 128, 128], ["silver", 192, 192, 192], ["charcoal", 54, 69, 79], ["red", 220, 20, 60], ["crimson", 153, 0, 0], ["coral", 255, 127, 80], ["salmon", 250, 128, 114], ["orange", 255, 140, 0], ["amber", 255, 191, 0], ["gold", 212, 175, 55], ["yellow", 255, 221, 51], ["cream", 255, 250, 244], ["beige", 245, 222, 179], ["tan", 210, 180, 140], ["brown", 120, 72, 40], ["chocolate", 90, 50, 30], ["olive", 128, 128, 0], ["lime", 150, 220, 60], ["green", 40, 160, 70], ["forest green", 20, 90, 40], ["mint", 152, 255, 200], ["teal", 0, 128, 128], ["cyan", 0, 200, 220], ["sky blue", 135, 206, 235], ["blue", 40, 90, 220], ["navy", 20, 30, 80], ["indigo", 75, 0, 130], ["lavender", 200, 180, 230], ["purple", 128, 0, 160], ["plum", 142, 69, 133], ["magenta", 220, 0, 160], ["pink", 255, 160, 200], ["rose", 230, 100, 130], ["peach", 255, 218, 185], ["skin light", 240, 200, 170], ["skin tan", 200, 150, 110], ["skin dark", 120, 80, 55]];
const nameOf = (r, g, b) => { let best = null, bd = 1e9; for (const [n, R, G, B] of NAMES) { const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (d < bd) { bd = d; best = n; } } return best; };
const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function mount(root) {
  let src = null, name = "image", result = [];
  const st = { k: 6, ignoreWhite: false, sort: "share" };
  const out = h("div"); const preview = h("div", { class: "canvas-wrap" }); const meta = h("div", { class: "meta" });
  const dz = dropzone({ accept: "image/*", multiple: false, onFiles: ([f]) => load(f) });
  async function load(f) { if (!isImage(f)) return toast("이미지가 아닙니다", "warn"); const b = await loadBitmap(f); name = f.name.replace(/\.[^.]+$/, ""); const s = Math.min(1, 320 / Math.max(b.width, b.height)); src = canvas(b.width * s, b.height * s); src.getContext("2d").drawImage(b, 0, 0, src.width, src.height); const big = canvas(b.width, b.height); big.getContext("2d").drawImage(b, 0, 0); preview.replaceChildren(big); b.close?.(); dz.classList.add("compact"); run(); }
  function run() {
    if (!src) return;
    const d = src.getContext("2d").getImageData(0, 0, src.width, src.height).data; const px = [];
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; if (st.ignoreWhite && d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) continue; px.push([d[i], d[i + 1], d[i + 2]]); }
    if (!px.length) return;
    // k-means++ 초기화 + 12회 반복
    const k = Math.min(st.k, px.length); const cents = [px[Math.random() * px.length | 0]];
    while (cents.length < k) { const dists = px.map((p) => Math.min(...cents.map((c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2))); let r = Math.random() * dists.reduce((a, b) => a + b, 0); for (let i = 0; i < px.length; i++) { r -= dists[i]; if (r <= 0) { cents.push(px[i]); break; } } if (cents.length < k && r > 0) cents.push(px[px.length - 1]); }
    let assign = new Int32Array(px.length);
    for (let it = 0; it < 12; it++) { const sum = cents.map(() => [0, 0, 0, 0]); for (let i = 0; i < px.length; i++) { const p = px[i]; let bi = 0, bd = 1e9; for (let c = 0; c < cents.length; c++) { const q = cents[c]; const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (dd < bd) { bd = dd; bi = c; } } assign[i] = bi; const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; } for (let c = 0; c < cents.length; c++) if (sum[c][3]) cents[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]]; }
    const counts = new Array(cents.length).fill(0); for (const a of assign) counts[a]++;
    result = cents.map((c, i) => ({ rgb: c.map(Math.round), share: counts[i] / px.length, hex: hex(...c), name: nameOf(...c) }));
    if (st.sort === "share") result.sort((a, b) => b.share - a.share); else result.sort((a, b) => lum(a.rgb) - lum(b.rgb));
    render();
  }
  const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
  function render() {
    out.replaceChildren(h("div", { style: { display: "flex", height: "56px", borderRadius: "12px", overflow: "hidden", marginBottom: "10px" } }, ...result.map((c) => h("div", { style: { flex: String(c.share), background: c.hex }, title: c.hex }))),
      h("table", { class: "data" }, h("thead", {}, h("tr", {}, h("th", {}, "색"), h("th", {}, "HEX"), h("th", {}, "RGB"), h("th", {}, "비율"), h("th", {}, "가까운 이름"))),
        h("tbody", {}, ...result.map((c) => h("tr", {}, h("td", {}, h("span", { style: { display: "inline-block", width: "28px", height: "28px", borderRadius: "7px", background: c.hex, border: "1px solid #ddd" } })), h("td", {}, h("code", { style: { cursor: "pointer" }, onclick: () => { navigator.clipboard?.writeText(c.hex); toast(`${c.hex} 복사`, "ok", 1200); } }, c.hex)), h("td", { class: "num" }, c.rgb.join(", ")), h("td", { class: "num" }, (c.share * 100).toFixed(1) + "%"), h("td", {}, c.name))))));
    meta.textContent = `프롬프트용: ${result.map((c) => c.name).filter((v, i, a) => a.indexOf(v) === i).join(", ")}`;
  }
  async function savePng() { if (!result.length) return; const c = canvas(120 * result.length, 160), ctx = c.getContext("2d"); result.forEach((r, i) => { ctx.fillStyle = r.hex; ctx.fillRect(i * 120, 0, 120, 120); ctx.fillStyle = "#222"; ctx.font = "14px monospace"; ctx.textAlign = "center"; ctx.fillText(r.hex, i * 120 + 60, 140); ctx.fillText(r.name, i * 120 + 60, 156); }); download(await toBlob(c, "image/png"), `${name}_palette.png`); }
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, preview, out, meta),
    h("div", { class: "panel controls" },
      field("색 개수", num(st.k, { min: 2, max: 16, onInput: (v) => { st.k = v; run(); } })),
      check("흰색(배경) 무시", false, (v) => { st.ignoreWhite = v; run(); }),
      field("정렬", h("div", { class: "seg" }, ...[["share", "비율순"], ["lum", "밝기순"]].map(([v, t]) => h("button", { type: "button", class: st.sort === v ? "on" : "", onclick: (e) => { st.sort = v; [...e.target.parentNode.children].forEach((b) => b.classList.toggle("on", b === e.target)); run(); } }, t)))),
      button("다시 뽑기 (무작위 초기값)", run),
      button("HEX 전부 복사", () => { navigator.clipboard?.writeText(result.map((c) => c.hex).join(", ")); toast("복사", "ok", 1200); }),
      button("팔레트 PNG 저장", savePng, "btn primary full"))));
  return () => dz.destroy();
}
