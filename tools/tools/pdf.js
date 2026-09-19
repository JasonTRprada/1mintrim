// 이미지 → PDF (pdf-lib)
import { h, dropzone, loadBitmap, canvas, toBlob, download, field, select, num, button, progress, isImage, toast, fmtBytes } from "../ui.js";

let libP = null;
function lib() { return libP ||= new Promise((res, rej) => { if (window.PDFLib) return res(window.PDFLib); const s = document.createElement("script"); s.src = new URL("../vendor/pdf-lib.min.js", import.meta.url); s.onload = () => res(window.PDFLib); s.onerror = () => rej(new Error("pdf-lib 로드 실패")); document.head.append(s); }); }

export function mount(root) {
  let files = [];
  const st = { page: "image", margin: 0, quality: 0.9, maxSide: 0, title: "" };
  const list = h("ul", { class: "filelist" }); const prog = progress();
  const dz = dropzone({ accept: "image/*,application/pdf", hint: "이미지 여러 장 → 한 PDF · PDF 를 넣으면 페이지를 이미지로 뽑는다", onFiles: (fs) => { const pdfs = fs.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)); if (pdfs.length) return pdfToImages(pdfs[0]); files = files.concat(fs.filter(isImage)); render(); } });
  const st2 = { scale: 2, fmt: "png" };
  async function pdfToImages(f) {
    try {
      prog.set(0.05, "pdf.js 로드"); const lib = await import(new URL("../vendor/pdf.min.mjs", import.meta.url).href); lib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.mjs", import.meta.url).href;
      const pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise; const out = [];
      for (let i = 1; i <= pdf.numPages; i++) { prog.set(i / pdf.numPages, `페이지 ${i}/${pdf.numPages}`); const p = await pdf.getPage(i); const vp = p.getViewport({ scale: st2.scale }); const c = canvas(vp.width, vp.height); const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); await p.render({ canvasContext: ctx, viewport: vp }).promise; out.push({ blob: await toBlob(c, st2.fmt === "jpg" ? "image/jpeg" : "image/png", 0.92), name: `${f.name.replace(/\.pdf$/i, "")}_p${String(i).padStart(3, "0")}.${st2.fmt}` }); }
      prog.done(); const { deliver } = await import("../ui.js"); await deliver(out, `${f.name.replace(/\.pdf$/i, "")}_pages.zip`); toast(`${out.length}페이지 → 이미지`, "ok");
    } catch (e) { prog.done(); toast("PDF 읽기 실패: " + e.message, "warn"); }
  }
  function render() {
    list.replaceChildren(...files.map((f, i) => h("li", {}, h("img", { class: "thumb", src: URL.createObjectURL(f), onload: (e) => URL.revokeObjectURL(e.target.src) }), h("span", { class: "fname" }, f.name), h("span", { class: "fsize" }, fmtBytes(f.size)),
      h("button", { class: "x", type: "button", onclick: () => { if (i > 0) { [files[i - 1], files[i]] = [files[i], files[i - 1]]; render(); } } }, "▲"), h("button", { class: "x", type: "button", onclick: () => { if (i < files.length - 1) { [files[i + 1], files[i]] = [files[i], files[i + 1]]; render(); } } }, "▼"), h("button", { class: "x", type: "button", onclick: () => { files.splice(i, 1); render(); } }, "×"))));
    runBtn.disabled = !files.length;
  }
  async function run() {
    runBtn.disabled = true;
    try {
      const { PDFDocument } = await lib(); const doc = await PDFDocument.create(); if (st.title) doc.setTitle(st.title);
      for (let i = 0; i < files.length; i++) {
        prog.set(i / files.length, files[i].name);
        const bmp = await loadBitmap(files[i]); let w = bmp.width, hh = bmp.height;
        if (st.maxSide && Math.max(w, hh) > st.maxSide) { const s = st.maxSide / Math.max(w, hh); w = Math.round(w * s); hh = Math.round(hh * s); }
        const c = canvas(w, hh); c.getContext("2d").drawImage(bmp, 0, 0, w, hh); bmp.close?.();
        const isPng = files[i].type === "image/png" && !st.maxSide;
        const bytes = new Uint8Array(await (isPng ? files[i] : await toBlob(c, "image/jpeg", st.quality)).arrayBuffer());
        const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        let pw, ph; if (st.page === "image") { pw = img.width + st.margin * 2; ph = img.height + st.margin * 2; } else { const A4 = [595.28, 841.89]; const land = img.width > img.height; pw = land ? A4[1] : A4[0]; ph = land ? A4[0] : A4[1]; }
        const page = doc.addPage([pw, ph]); const s = Math.min((pw - st.margin * 2) / img.width, (ph - st.margin * 2) / img.height); const dw = img.width * s, dh = img.height * s;
        page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
      }
      const pdf = await doc.save(); download(new Blob([pdf], { type: "application/pdf" }), `${st.title || "images"}_${files.length}p.pdf`); toast(`PDF ${fmtBytes(pdf.length)}`, "ok");
    } catch (e) { toast("실패: " + e.message, "warn"); }
    prog.done(); runBtn.disabled = false;
  }
  const runBtn = button("PDF 만들기", run, "btn primary full"); runBtn.disabled = true;
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, list),
    h("div", { class: "panel controls" },
      field("제목 (파일명·메타)", h("input", { type: "text", oninput: (e) => st.title = e.target.value.trim() })),
      field("페이지", select([["image", "이미지 크기 그대로"], ["a4", "A4 (가로/세로 자동)"]], st.page, (v) => st.page = v)),
      field("여백 pt", num(st.margin, { min: 0, max: 200, onInput: (v) => st.margin = v })),
      field("긴 변 제한 px (0=원본)", num(0, { min: 0, max: 8000, step: 100, onInput: (v) => st.maxSide = v }), "PNG 은 제한 없을 때 무손실로 그대로 들어간다"),
      field("JPG 품질", num(90, { min: 40, max: 100, onInput: (v) => st.quality = v / 100 })),
      button("이름순 정렬", () => { files.sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true })); render(); }),
      runBtn, prog,
      h("h3", {}, "PDF → 이미지 (PDF 를 드롭)"),
      h("div", { class: "row" }, field("배율", select([["1", "1× (72dpi)"], ["2", "2× (144dpi)"], ["3", "3× (216dpi)"]], "2", (v) => st2.scale = Number(v))), field("형식", select([["png", "PNG"], ["jpg", "JPG"]], "png", (v) => st2.fmt = v))))));
  return () => dz.destroy();
}
