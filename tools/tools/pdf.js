// 이미지 → PDF (pdf-lib)
import { h, dropzone, loadBitmap, canvas, toBlob, download, field, select, num, button, progress, isImage, toast, fmtBytes } from "../ui.js";

let libP = null;
function lib() { return libP ||= new Promise((res, rej) => { if (window.PDFLib) return res(window.PDFLib); const s = document.createElement("script"); s.src = new URL("../vendor/pdf-lib.min.js", import.meta.url); s.onload = () => res(window.PDFLib); s.onerror = () => rej(new Error("pdf-lib 로드 실패")); document.head.append(s); }); }

export function mount(root) {
  let files = [];
  const st = { page: "image", margin: 0, quality: 0.9, maxSide: 0, title: "" };
  const list = h("ul", { class: "filelist" }); const prog = progress();
  const dz = dropzone({ accept: "image/*", hint: "여러 장 → 한 PDF. 순서는 목록에서 ▲▼", onFiles: (fs) => { files = files.concat(fs.filter(isImage)); render(); } });
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
      runBtn, prog)));
  return () => dz.destroy();
}
