// 선명도 QC — Vesper_Lab/JW_H3/api/qc/face_qc_score.py 와 같은 계산식
//   1280 폭으로 리사이즈 → L 그레이 → ROI(피부 자동 or 드래그 or 전체)
//   lap  = 라플라시안([[0,1,0],[1,-4,1],[0,1,0]]) 분산
//   halo = |L|>40 인 픽셀 비율 (링잉·샤픈 테두리)
//   micro= 5×5 창 표준편차의 중앙값 (피부 결 · 밀랍이면 낮다)
// 참조 기준(메모리 Comp1 QC 점수표): 얼굴 ROI lap≈137 · halo≤0.025 · micro≥2.7 @1280
import { h, dropzone, loadBitmap, loadVideo, frameAt, canvas, toGray, field, select, num, button, progress, download, isImage, isVideo, toast, check, clamp } from "../ui.js";

const W = 1280;
function laplacian(g, w, hh) { // valid 영역 (w-2)x(h-2)
  const ow = w - 2, oh = hh - 2, L = new Float32Array(ow * oh);
  for (let y = 1; y < hh - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    L[(y - 1) * ow + (x - 1)] = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
  }
  return { L, ow, oh };
}
function variance(a) { let s = 0; for (const v of a) s += v; const m = s / a.length; let q = 0; for (const v of a) q += (v - m) * (v - m); return q / a.length; }
function median(a) { const b = Float32Array.from(a).sort(); const n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; }
function microStd(g, w, hh) { // 5x5 sliding std → median
  const ow = w - 4, oh = hh - 4; if (ow <= 0 || oh <= 0) return 0;
  const out = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    let s = 0, q = 0;
    for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) { const v = g[(y + dy) * w + x + dx]; s += v; q += v * v; }
    const m = s / 25; out[y * ow + x] = Math.sqrt(Math.max(0, q / 25 - m * m));
  }
  return median(out);
}
function crop(g, w, roi) { const [x, y, rw, rh] = roi, o = new Float32Array(rw * rh); for (let j = 0; j < rh; j++) o.set(g.subarray((y + j) * w + x, (y + j) * w + x + rw), j * rw); return o; }
function metrics(g, w, roi) {
  const [, , rw, rh] = roi, sub = crop(g, w, roi);
  const { L } = laplacian(sub, rw, rh);
  let halo = 0; for (const v of L) if (Math.abs(v) > 40) halo++;
  return { lap: variance(L), halo: halo / L.length, micro: microStd(sub, rw, rh) };
}
// YCbCr 피부 마스크 → 상단 70% → 8px 블록 밀도>0.6 → 가장 밀집한 24×24 블록 창 (192px)
function skinRoi(img) {
  const { width: w, height: hh, data: d } = img;
  const bh = Math.floor(hh / 8), bw = Math.floor(w / 8); if (bh < 24 || bw < 24) return null;
  const dens = new Float32Array(bh * bw); const limit = Math.floor(hh * 0.7);
  for (let y = 0; y < bh * 8; y++) { if (y >= limit) break; for (let x = 0; x < bw * 8; x++) {
    const i = (y * w + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
    const Y = 0.299 * R + 0.587 * G + 0.114 * B, Cb = 128 - 0.168736 * R - 0.331264 * G + 0.5 * B, Cr = 128 + 0.5 * R - 0.418688 * G - 0.081312 * B;
    if (Cr > 135 && Cr < 175 && Cb > 80 && Cb < 130 && Y > 60) dens[(y >> 3) * bw + (x >> 3)] += 1 / 64;
  } }
  const D = new Uint8Array(bh * bw); let cnt = 0; for (let i = 0; i < D.length; i++) if (dens[i] > 0.6) { D[i] = 1; cnt++; }
  if (cnt < 20) return null;
  let best = null;
  for (let y = 0; y < Math.max(1, bh - 24); y += 2) for (let x = 0; x < Math.max(1, bw - 24); x += 2) {
    let s = 0; for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) s += D[(y + j) * bw + x + i];
    if (!best || s > best[0]) best = [s, x, y];
  }
  if (!best || best[0] < 60) return null;
  return [best[1] * 8, best[2] * 8, 192, 192];
}
function verdict(m) {
  const ok = m.lap >= 120 && m.halo <= 0.025 && m.micro >= 2.7;
  const soft = m.lap < 80, halo = m.halo > 0.025, wax = m.micro < 2.7;
  return ok ? ["good", "합격권"] : [halo ? "bad" : "", [soft && "무름", halo && "할로", wax && "밀랍"].filter(Boolean).join("·") || "경계"];
}

export function mount(root) {
  const st = { roiMode: "auto", vidN: 5, manual: null };
  const rows = [];
  const tbody = h("tbody");
  const prog = progress();
  const preview = h("canvas"); const pwrap = h("div", { class: "canvas-wrap" }, preview);
  const pmeta = h("div", { class: "meta" }, "드래그해서 ROI 를 직접 잡을 수 있다 (1280 기준 좌표). 잡지 않으면 자동(피부) → 실패 시 전체.");
  let drag = null;

  async function scaled(src, w0, h0) { // 1280 폭 그레이 + 컬러 ImageData
    const hh = Math.round(h0 * W / w0), c = canvas(W, hh), ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, W, hh);
    const img = ctx.getImageData(0, 0, W, hh);
    return { img, g: toGray(img), w: W, hh, canvas: c };
  }
  function pickRoi(s) {
    if (st.roiMode === "manual" && st.manual) { const [x, y, w, hh] = st.manual; return [clamp(x, 0, s.w - 8), clamp(y, 0, s.hh - 8), clamp(w, 8, s.w - x), clamp(hh, 8, s.hh - y)]; }
    if (st.roiMode !== "full") { const r = skinRoi(s.img); if (r) return r; }
    return [0, 0, s.w, s.hh];
  }
  function showPreview(s, roi) {
    preview.width = s.w; preview.height = s.hh;
    const ctx = preview.getContext("2d"); ctx.drawImage(s.canvas, 0, 0);
    ctx.strokeStyle = "#2e8b57"; ctx.lineWidth = 4; ctx.strokeRect(roi[0], roi[1], roi[2], roi[3]);
  }
  function addRow(name, m, roi, note) {
    const [cls, text] = verdict(m);
    rows.push({ name, ...m, roi: roi.join("x"), note });
    tbody.append(h("tr", {}, h("td", {}, name), h("td", { class: "num" }, m.lap.toFixed(1)), h("td", { class: "num" }, m.halo.toFixed(4)), h("td", { class: "num" }, m.micro.toFixed(3)), h("td", {}, `${roi[0]},${roi[1]} ${roi[2]}×${roi[3]}`), h("td", {}, h("span", { class: `pill ${cls}` }, text), note ? ` ${note}` : "")));
  }
  async function processFiles(files) {
    let k = 0;
    for (const f of files) {
      prog.set(k++ / files.length, f.name);
      try {
        if (isImage(f)) {
          const bmp = await loadBitmap(f); const s = await scaled(bmp, bmp.width, bmp.height); bmp.close?.();
          const roi = pickRoi(s); showPreview(s, roi); addRow(f.name, metrics(s.g, s.w, roi), roi, "");
        } else if (isVideo(f)) {
          const v = await loadVideo(f); const n = st.vidN, ms = [];
          let roiLast = null;
          for (let i = 0; i < n; i++) {
            prog.set((k - 1 + (i + 1) / n) / files.length, `${f.name} 프레임 ${i + 1}/${n}`);
            const t = (v.duration * (i + 0.5)) / n; const c = await frameAt(v, t);
            const s = await scaled(c, c.width, c.height); const roi = pickRoi(s); roiLast = roi; showPreview(s, roi); ms.push(metrics(s.g, s.w, roi));
          }
          URL.revokeObjectURL(v.src);
          const med = { lap: median(ms.map((m) => m.lap)), halo: median(ms.map((m) => m.halo)), micro: median(ms.map((m) => m.micro)) };
          addRow(f.name, med, roiLast, `(${n}프레임 중앙값)`);
        }
      } catch (e) { toast(`${f.name}: ${e.message}`, "warn"); }
    }
    prog.done();
  }
  const dz = dropzone({ accept: "image/*,video/*", hint: "이미지 여러 장 · 영상은 균등 N프레임의 중앙값", onFiles: processFiles });
  preview.addEventListener("pointerdown", (e) => { const r = preview.getBoundingClientRect(); const sx = preview.width / r.width; drag = [(e.clientX - r.left) * sx, (e.clientY - r.top) * sx]; preview.setPointerCapture(e.pointerId); });
  preview.addEventListener("pointermove", (e) => { if (!drag) return; const r = preview.getBoundingClientRect(); const sx = preview.width / r.width; const x = (e.clientX - r.left) * sx, y = (e.clientY - r.top) * sx;
    const ctx = preview.getContext("2d"); ctx.save(); ctx.strokeStyle = "#8370a8"; ctx.setLineDash([8, 6]); ctx.lineWidth = 3; ctx.strokeRect(drag[0], drag[1], x - drag[0], y - drag[1]); ctx.restore(); });
  preview.addEventListener("pointerup", (e) => { if (!drag) return; const r = preview.getBoundingClientRect(); const sx = preview.width / r.width; const x = (e.clientX - r.left) * sx, y = (e.clientY - r.top) * sx;
    const roi = [Math.round(Math.min(drag[0], x)), Math.round(Math.min(drag[1], y)), Math.round(Math.abs(x - drag[0])), Math.round(Math.abs(y - drag[1]))]; drag = null;
    if (roi[2] > 8 && roi[3] > 8) { st.manual = roi; st.roiMode = "manual"; roiSel.value = "manual"; toast(`ROI ${roi.join(",")} — 다음 파일부터 적용`, "ok"); } });
  const roiSel = select([["auto", "자동 (피부 192×192)"], ["full", "전체 화면"], ["manual", "드래그한 ROI"]], st.roiMode, (v) => st.roiMode = v);
  function exportCsv() {
    const lines = ["name,lap,halo,micro,roi,note", ...rows.map((r) => [r.name, r.lap.toFixed(2), r.halo.toFixed(5), r.micro.toFixed(4), r.roi, r.note].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))];
    download(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }), `sharp_qc_${Date.now()}.csv`);
  }
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, pwrap, pmeta,
      h("table", { class: "data", style: { marginTop: "14px" } }, h("thead", {}, h("tr", {}, h("th", {}, "파일"), h("th", {}, "lap"), h("th", {}, "halo"), h("th", {}, "micro"), h("th", {}, "ROI"), h("th", {}, "판정"))), tbody)),
    h("div", { class: "panel controls" },
      field("ROI", roiSel),
      field("영상 샘플 프레임 수", num(st.vidN, { min: 1, max: 30, onInput: (v) => st.vidN = v })),
      button("CSV 내보내기", exportCsv),
      button("표 비우기", () => { rows.length = 0; tbody.replaceChildren(); }),
      prog,
      h("div", { class: "help" }, "기준(Comp1 QC 점수표): 얼굴 ROI ", h("code", {}, "lap≈137"), " · ", h("code", {}, "halo≤0.025"), " · ", h("code", {}, "micro≥2.7"), " @1280. 리사이즈는 브라우저 보간(파이썬 LANCZOS 와 소수점 차이)이라 절대값은 ±수 % 어긋날 수 있다. 같은 도구 안에서 상대 비교로 쓴다."))));
  return () => dz.destroy();
}
