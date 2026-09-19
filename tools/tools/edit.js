// 이미지 편집 — 크롭 · 회전 · 뒤집기 · 크기 · 워터마크 · 포맷/품질
import { h, dropzone, loadBitmap, canvas, toBlob, download, field, select, num, button, range, baseName, isImage, mimeOf, toast, handoff, check, clamp } from "../ui.js";

export function mount(root) {
  let src = null, name = "image", srcW = 0, srcH = 0;
  const st = { rot: 0, fh: false, fv: false, crop: null, outW: 0, outH: 0, lock: true, wm: "", wmPos: "br", wmSize: 4, wmAlpha: 0.5, wmColor: "#ffffff", fmt: "png", q: 0.92 };
  const view = h("canvas"); const wrap = h("div", { class: "canvas-wrap checker" }, view);
  const meta = h("div", { class: "meta" });
  const wIn = num(0, { min: 1, max: 16384, onInput: (v) => { st.outW = v; if (st.lock) { st.outH = Math.round(v * baseH() / baseW()); hIn.value = st.outH; } } });
  const hIn = num(0, { min: 1, max: 16384, onInput: (v) => { st.outH = v; if (st.lock) { st.outW = Math.round(v * baseW() / baseH()); wIn.value = st.outW; } } });
  let drag = null;

  const dz = dropzone({ accept: "image/*", multiple: false, hint: "한 장. 여러 장 크기 변경은 「키프레임 리사이즈」", onFiles: ([f]) => load(f) });
  async function load(f) {
    if (!isImage(f)) return toast("이미지가 아닙니다", "warn");
    src = await loadBitmap(f); name = baseName(f.name); srcW = src.width; srcH = src.height;
    Object.assign(st, { rot: 0, fh: false, fv: false, crop: null }); resetSize(); draw();
    dz.classList.add("compact");
  }
  const rotated = () => st.rot % 180 !== 0;
  const baseW = () => st.crop ? st.crop[2] : rotated() ? srcH : srcW;
  const baseH = () => st.crop ? st.crop[3] : rotated() ? srcW : srcH;
  function resetSize() { st.outW = baseW(); st.outH = baseH(); wIn.value = st.outW; hIn.value = st.outH; }

  // 1) 회전/뒤집기 적용 캔버스 2) 크롭 3) 리사이즈 4) 워터마크
  function compose(full) {
    if (!src) return null;
    const rw = rotated() ? srcH : srcW, rh = rotated() ? srcW : srcH;
    const a = canvas(rw, rh), ac = a.getContext("2d");
    ac.translate(rw / 2, rh / 2); ac.rotate(st.rot * Math.PI / 180); ac.scale(st.fh ? -1 : 1, st.fv ? -1 : 1); ac.drawImage(src, -srcW / 2, -srcH / 2);
    const crop = st.crop || [0, 0, rw, rh];
    const ow = full ? st.outW : Math.min(st.outW, 1600), oh = full ? st.outH : Math.round(Math.min(st.outW, 1600) * st.outH / st.outW);
    const o = canvas(ow, oh), oc = o.getContext("2d"); oc.imageSmoothingQuality = "high";
    oc.drawImage(a, crop[0], crop[1], crop[2], crop[3], 0, 0, ow, oh);
    if (st.wm) {
      const fs = Math.max(10, Math.round(Math.min(ow, oh) * st.wmSize / 100));
      oc.font = `600 ${fs}px "DM Sans", sans-serif`; oc.globalAlpha = st.wmAlpha; oc.fillStyle = st.wmColor; oc.shadowColor = "rgba(0,0,0,.5)"; oc.shadowBlur = fs / 6;
      const pad = fs; const tw = oc.measureText(st.wm).width;
      const x = st.wmPos.endsWith("l") ? pad : st.wmPos.endsWith("r") ? ow - pad - tw : (ow - tw) / 2;
      const y = st.wmPos.startsWith("t") ? pad + fs : st.wmPos.startsWith("b") ? oh - pad : (oh + fs) / 2;
      oc.fillText(st.wm, x, y); oc.globalAlpha = 1;
    }
    return o;
  }
  function draw() {
    const c = compose(false); if (!c) return;
    view.width = c.width; view.height = c.height; view.getContext("2d").drawImage(c, 0, 0);
    meta.textContent = `원본 ${srcW}×${srcH} → 출력 ${st.outW}×${st.outH}${st.crop ? ` · 크롭 ${st.crop.join(",")}` : ""} · 회전 ${st.rot}°`;
  }
  // 크롭 드래그 (미리보기 좌표 → 회전본 좌표)
  const toBase = (e) => { const r = view.getBoundingClientRect(); const c = st.crop || [0, 0, baseW(), baseH()]; return [c[0] + (e.clientX - r.left) / r.width * c[2], c[1] + (e.clientY - r.top) / r.height * c[3]]; };
  view.addEventListener("pointerdown", (e) => { if (!src || !cropMode.checked) return; drag = { s: toBase(e), e: null }; view.setPointerCapture(e.pointerId); });
  view.addEventListener("pointermove", (e) => { if (!drag) return; drag.e = toBase(e); draw(); const r = view.getBoundingClientRect(); const c = st.crop || [0, 0, baseW(), baseH()]; const ctx = view.getContext("2d"); const sx = view.width / c[2], sy = view.height / c[3];
    ctx.save(); ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 0, view.width, view.height); ctx.clearRect((Math.min(drag.s[0], drag.e[0]) - c[0]) * sx, (Math.min(drag.s[1], drag.e[1]) - c[1]) * sy, Math.abs(drag.e[0] - drag.s[0]) * sx, Math.abs(drag.e[1] - drag.s[1]) * sy); ctx.restore();
    ctx.drawImage(compose(false), 0, 0); ctx.save(); ctx.globalCompositeOperation = "destination-over"; ctx.restore();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect((Math.min(drag.s[0], drag.e[0]) - c[0]) * sx, (Math.min(drag.s[1], drag.e[1]) - c[1]) * sy, Math.abs(drag.e[0] - drag.s[0]) * sx, Math.abs(drag.e[1] - drag.s[1]) * sy); });
  view.addEventListener("pointerup", () => { if (!drag || !drag.e) { drag = null; return; }
    const x = Math.round(Math.min(drag.s[0], drag.e[0])), y = Math.round(Math.min(drag.s[1], drag.e[1])), w = Math.round(Math.abs(drag.e[0] - drag.s[0])), hh = Math.round(Math.abs(drag.e[1] - drag.s[1])); drag = null;
    if (w > 4 && hh > 4) { const W0 = rotated() ? srcH : srcW, H0 = rotated() ? srcW : srcH; st.crop = [clamp(x, 0, W0 - 1), clamp(y, 0, H0 - 1), clamp(w, 1, W0 - x), clamp(hh, 1, H0 - y)]; resetSize(); }
    draw(); });
  const cropMode = h("input", { type: "checkbox" });
  function applyRatio(r) { // 비율 크롭 (가운데)
    const W0 = rotated() ? srcH : srcW, H0 = rotated() ? srcW : srcH;
    if (!r) { st.crop = null; resetSize(); draw(); return; }
    const [a, b] = r.split(":").map(Number); let w = W0, hh = Math.round(W0 * b / a); if (hh > H0) { hh = H0; w = Math.round(H0 * a / b); }
    st.crop = [Math.round((W0 - w) / 2), Math.round((H0 - hh) / 2), w, hh]; resetSize(); draw();
  }
  async function save() {
    const c = compose(true); if (!c) return;
    download(await toBlob(c, mimeOf(st.fmt), st.q), `${name}_edit.${st.fmt}`); toast("저장", "ok");
  }
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, wrap, meta),
    h("div", { class: "panel controls" },
      h("h3", {}, "회전 · 뒤집기"),
      h("div", { class: "cm-tools" }, button("↺ 90°", () => { st.rot = (st.rot + 270) % 360; st.crop = null; resetSize(); draw(); }), button("↻ 90°", () => { st.rot = (st.rot + 90) % 360; st.crop = null; resetSize(); draw(); }), button("좌우", () => { st.fh = !st.fh; draw(); }), button("상하", () => { st.fv = !st.fv; draw(); })),
      h("h3", {}, "크롭"),
      h("label", { class: "check" }, cropMode, h("span", {}, "미리보기 위에서 드래그로 크롭")),
      h("div", { class: "cm-tools" }, ...[["", "원본"], ["1:1", "1:1"], ["16:9", "16:9"], ["9:16", "9:16"], ["4:3", "4:3"], ["3:2", "3:2"], ["2:3", "2:3"]].map(([r, t]) => button(t, () => applyRatio(r), "btn sm"))),
      h("h3", {}, "크기"),
      h("div", { class: "row" }, field("가로", wIn), field("세로", hIn)),
      check("비율 고정", true, (v) => st.lock = v),
      h("div", { class: "cm-tools" }, ...[50, 25, 200].map((p) => button(`${p}%`, () => { st.outW = Math.round(baseW() * p / 100); st.outH = Math.round(baseH() * p / 100); wIn.value = st.outW; hIn.value = st.outH; draw(); }, "btn sm")), button("원본", () => { resetSize(); draw(); }, "btn sm")),
      h("h3", {}, "워터마크"),
      field("문구", h("input", { type: "text", placeholder: "비우면 없음", oninput: (e) => { st.wm = e.target.value; draw(); } })),
      h("div", { class: "row" }, field("위치", select([["br", "우하"], ["bl", "좌하"], ["tr", "우상"], ["tl", "좌상"], ["c", "가운데"]], st.wmPos, (v) => { st.wmPos = v; draw(); })), field("색", h("input", { type: "color", value: st.wmColor, oninput: (e) => { st.wmColor = e.target.value; draw(); } }))),
      field(`크기 (짧은 변의 %)`, range(st.wmSize, { min: 1, max: 20, onInput: (v) => { st.wmSize = v; draw(); } })),
      field("불투명도", range(50, { min: 5, max: 100, onInput: (v) => { st.wmAlpha = v / 100; draw(); } })),
      h("h3", {}, "저장"),
      h("div", { class: "row" }, field("형식", select([["png", "PNG"], ["jpg", "JPG"], ["webp", "WEBP"]], st.fmt, (v) => st.fmt = v)), field("품질", num(92, { min: 40, max: 100, onInput: (v) => st.q = v / 100 }))),
      button("저장", save, "btn primary full"))));
  const ho = handoff.take(); if (ho?.files?.[0]) load(ho.files[0]);
  return () => { dz.destroy(); src?.close?.(); };
}
