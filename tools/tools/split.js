import { h, dropzone, fileList, loadBitmap, canvas, toBlob, deliver, field, select, num, button, progress, baseName, isImage, mimeOf, toast } from "../ui.js";

const PRESETS = { "2h": [1, 2], "2v": [2, 1], "4": [2, 2], "8": [2, 4], "16": [4, 4], "9": [3, 3], "custom": null };

export function mount(root) {
  let files = [];
  const st = { preset: "4", rows: 2, cols: 2, fmt: "png", order: "rowmajor" };
  const list = h("div"); const prog = progress();
  const rowsIn = num(2, { min: 1, max: 20, onInput: (v) => { st.rows = v; st.preset = "custom"; sel.value = "custom"; preview(); } });
  const colsIn = num(2, { min: 1, max: 20, onInput: (v) => { st.cols = v; st.preset = "custom"; sel.value = "custom"; preview(); } });
  const sel = select([["2h", "2분할 (위·아래)"], ["2v", "2분할 (좌·우)"], ["4", "4분할 (2×2)"], ["9", "9분할 (3×3)"], ["8", "8분할 (2행×4열)"], ["16", "16분할 (4×4)"], ["custom", "직접 (행×열)"]], st.preset, (v) => { st.preset = v; if (PRESETS[v]) { [st.rows, st.cols] = PRESETS[v]; rowsIn.value = st.rows; colsIn.value = st.cols; } preview(); });
  const pv = h("canvas"); const wrap = h("div", { class: "canvas-wrap" }, pv);
  let first = null;
  const dz = dropzone({ accept: "image/*", hint: "여러 장이면 각각 같은 격자로 잘라 ZIP 하나로", onFiles: async (fs) => { files = files.concat(fs.filter(isImage)); if (!first && files.length) first = await loadBitmap(files[0]); render(); } });
  function render() { list.replaceChildren(fileList(files, { onRemove: async (i) => { files.splice(i, 1); if (i === 0) { first?.close?.(); first = files.length ? await loadBitmap(files[0]) : null; } render(); } })); runBtn.disabled = !files.length; preview(); }
  function preview() {
    if (!first) { pv.width = pv.height = 1; return; }
    const s = Math.min(1, 900 / first.width); pv.width = Math.round(first.width * s); pv.height = Math.round(first.height * s);
    const ctx = pv.getContext("2d"); ctx.drawImage(first, 0, 0, pv.width, pv.height);
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    for (let r = 1; r < st.rows; r++) { const y = pv.height * r / st.rows; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pv.width, y); ctx.stroke(); }
    for (let c = 1; c < st.cols; c++) { const x = pv.width * c / st.cols; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, pv.height); ctx.stroke(); }
  }
  async function run() {
    const out = []; let k = 0;
    for (const f of files) {
      const bmp = files[0] === f && first ? first : await loadBitmap(f);
      const cw = bmp.width / st.cols, ch = bmp.height / st.rows;
      for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
        const x0 = Math.round(c * cw), y0 = Math.round(r * ch), x1 = Math.round((c + 1) * cw), y1 = Math.round((r + 1) * ch);
        const cv = canvas(x1 - x0, y1 - y0); cv.getContext("2d").drawImage(bmp, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
        const idx = st.order === "rowmajor" ? r * st.cols + c + 1 : c * st.rows + r + 1;
        out.push({ blob: await toBlob(cv, mimeOf(st.fmt), 0.95), name: `${baseName(f.name)}_${String(idx).padStart(2, "0")}_r${r + 1}c${c + 1}.${st.fmt}` });
        prog.set((++k) / (files.length * st.rows * st.cols), `${k} 조각`);
      }
      if (bmp !== first) bmp.close?.();
    }
    prog.done(); await deliver(out, `split_${st.rows}x${st.cols}.zip`); toast(`${out.length}조각`, "ok");
  }
  const runBtn = button("자르기 → ZIP", run, "btn primary full"); runBtn.disabled = true;
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, wrap, list),
    h("div", { class: "panel controls" }, field("분할", sel), h("div", { class: "row" }, field("행", rowsIn), field("열", colsIn)),
      field("번호 순서", select([["rowmajor", "가로 먼저 (1 2 / 3 4)"], ["colmajor", "세로 먼저 (1 3 / 2 4)"]], st.order, (v) => st.order = v)),
      field("형식", select([["png", "PNG"], ["jpg", "JPG"], ["webp", "WEBP"]], st.fmt, (v) => st.fmt = v)), runBtn, prog)));
  return () => { dz.destroy(); first?.close?.(); };
}
