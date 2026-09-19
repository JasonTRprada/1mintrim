import { h, dropzone, fileList, loadBitmap, canvas, toBlob, download, field, select, num, button, check, baseName, isImage, mimeOf, toast } from "../ui.js";

export function mount(root) {
  let files = [], bitmaps = [];
  const st = { cols: 4, cell: 512, gap: 12, bg: "#ffffff", label: true, fontPx: 18, fit: "contain", fmt: "png", title: "" };
  const preview = h("canvas");
  const wrap = h("div", { class: "canvas-wrap sheet-preview" }, preview);
  const meta = h("div", { class: "meta" });
  const list = h("div");
  const dz = dropzone({ accept: "image/*", hint: "여러 장을 한 번에. 순서는 목록 순서(이름순 정렬 버튼 있음)", onFiles: async (fs) => { files = files.concat(fs.filter(isImage)); await reload(); } });

  async function reload() {
    bitmaps.forEach((b) => b.close?.());
    bitmaps = await Promise.all(files.map((f) => loadBitmap(f)));
    list.replaceChildren(fileList(files, { onRemove: async (i) => { files.splice(i, 1); await reload(); } }));
    draw();
  }
  function draw(full = false) {
    if (!bitmaps.length) { preview.width = preview.height = 1; meta.textContent = ""; return null; }
    const cols = Math.max(1, Math.min(st.cols, bitmaps.length)), rows = Math.ceil(bitmaps.length / cols);
    const cell = st.cell, gap = st.gap, labelH = st.label ? Math.round(st.fontPx * 1.6) : 0;
    const titleH = st.title ? Math.round(st.fontPx * 2.2) : 0;
    const W = cols * cell + (cols + 1) * gap, H = titleH + rows * (cell + labelH) + (rows + 1) * gap;
    const c = full ? canvas(W, H) : preview;
    if (!full) { c.width = W; c.height = H; }
    const ctx = c.getContext("2d");
    ctx.fillStyle = st.bg; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = "high";
    const dark = isDark(st.bg);
    ctx.fillStyle = dark ? "#eee" : "#333"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (st.title) { ctx.font = `600 ${Math.round(st.fontPx * 1.3)}px "DM Sans", sans-serif`; ctx.fillText(st.title, W / 2, gap + titleH / 2); }
    ctx.font = `${st.fontPx}px "DM Sans", "Malgun Gothic", sans-serif`;
    bitmaps.forEach((b, i) => {
      const cx = gap + (i % cols) * (cell + gap), cy = titleH + gap + Math.floor(i / cols) * (cell + labelH + gap);
      const r = b.width / b.height;
      let dw = cell, dh = cell, sx = 0, sy = 0, sw = b.width, sh = b.height;
      if (st.fit === "contain") { if (r > 1) dh = cell / r; else dw = cell * r; }
      else { if (r > 1) { sw = b.height; sx = (b.width - sw) / 2; } else { sh = b.width; sy = (b.height - sh) / 2; } }
      ctx.drawImage(b, sx, sy, sw, sh, cx + (cell - dw) / 2, cy + (cell - dh) / 2, dw, dh);
      if (st.label) {
        let name = baseName(files[i].name);
        while (ctx.measureText(name).width > cell - 8 && name.length > 4) name = name.slice(0, -2);
        ctx.fillStyle = dark ? "#eee" : "#333";
        ctx.fillText(name, cx + cell / 2, cy + cell + labelH / 2);
      }
    });
    meta.textContent = `${bitmaps.length}장 · ${cols}열 × ${rows}행 · 출력 ${W}×${H}px`;
    return c;
  }
  function isDark(hex) { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 128; }
  async function save() {
    const c = draw(true); if (!c) return;
    download(await toBlob(c, mimeOf(st.fmt), 0.92), `contact_sheet_${bitmaps.length}.${st.fmt}`);
    toast("시트 저장", "ok");
  }
  const re = () => draw();
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, wrap, meta, list),
    h("div", { class: "panel controls" },
      field("제목 (선택)", h("input", { type: "text", placeholder: "예: mmf_doggy v01 후보", oninput: (e) => { st.title = e.target.value; re(); } })),
      h("div", { class: "row" }, field("열 수", num(st.cols, { min: 1, max: 12, onInput: (v) => { st.cols = v; re(); } })), field("셀 크기 px", num(st.cell, { min: 64, max: 2048, step: 16, onInput: (v) => { st.cell = v; re(); } }))),
      h("div", { class: "row" }, field("간격 px", num(st.gap, { min: 0, max: 200, onInput: (v) => { st.gap = v; re(); } })), field("글자 px", num(st.fontPx, { min: 8, max: 72, onInput: (v) => { st.fontPx = v; re(); } }))),
      field("셀 맞춤", select([["contain", "전체 보이기"], ["cover", "꽉 채우기 (크롭)"]], st.fit, (v) => { st.fit = v; re(); })),
      field("배경색", h("input", { type: "color", value: st.bg, oninput: (e) => { st.bg = e.target.value; re(); } })),
      check("파일명 라벨", true, (v) => { st.label = v; re(); }),
      button("이름순 정렬", async () => { const idx = files.map((f, i) => i).sort((a, b) => files[a].name.localeCompare(files[b].name, "ko", { numeric: true })); files = idx.map((i) => files[i]); await reload(); }),
      field("저장 형식", select([["png", "PNG"], ["jpg", "JPG"], ["webp", "WEBP"]], st.fmt, (v) => st.fmt = v)),
      button("시트 저장", save, "btn primary full"))));
  return () => { dz.destroy(); bitmaps.forEach((b) => b.close?.()); };
}
