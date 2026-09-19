// 이미지 정보 — PNG 텍스트 청크(ComfyUI prompt/workflow · A1111 parameters) · JPEG EXIF 요약 · 메타 없는 사본 저장
import { h, dropzone, fileList, loadBitmap, canvas, toBlob, deliver, button, isImage, toast, fmtBytes, baseName, extOf, download } from "../ui.js";

function readPngText(buf) {
  const dv = new DataView(buf); const out = []; let off = 8; const dec = new TextDecoder("latin1"), u8 = new TextDecoder();
  if (dv.getUint32(0) !== 0x89504e47) return null;
  while (off + 8 <= buf.byteLength) { const len = dv.getUint32(off), type = dec.decode(new Uint8Array(buf, off + 4, 4)); const data = new Uint8Array(buf, off + 8, len);
    if (type === "tEXt") { const z = data.indexOf(0); out.push({ key: dec.decode(data.subarray(0, z)), text: u8.decode(data.subarray(z + 1)) }); }
    else if (type === "iTXt") { const z = data.indexOf(0); const key = dec.decode(data.subarray(0, z)); let p = z + 3; const l2 = data.indexOf(0, p); p = l2 + 1; const t2 = data.indexOf(0, p); p = t2 + 1; if (data[z + 1] === 0) out.push({ key, text: u8.decode(data.subarray(p)) }); else out.push({ key, text: "(압축 iTXt — 미지원)" }); }
    else if (type === "zTXt") { const z = data.indexOf(0); out.push({ key: dec.decode(data.subarray(0, z)), text: "(zTXt 압축 — 미지원)" }); }
    else if (type === "IEND") break;
    off += 12 + len; }
  return out;
}
function readExifSummary(buf) {
  const dv = new DataView(buf); if (dv.getUint16(0) !== 0xffd8) return null; let off = 2; const out = {};
  while (off < buf.byteLength) { const marker = dv.getUint16(off); const len = dv.getUint16(off + 2);
    if (marker === 0xffe1 && dv.getUint32(off + 4) === 0x45786966) { // Exif
      const t = off + 10; const le = dv.getUint16(t) === 0x4949; const g16 = (p) => dv.getUint16(p, le), g32 = (p) => dv.getUint32(p, le);
      const ifd = t + g32(t + 4); const n = g16(ifd); const TAGS = { 0x010f: "제조사", 0x0110: "모델", 0x0132: "수정일", 0x0131: "소프트웨어", 0x8825: "GPS 있음", 0x0112: "회전", 0x9003: "촬영일" };
      for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; const tag = g16(e), type = g16(e + 2), cnt = g32(e + 4); if (!TAGS[tag]) continue; if (type === 2) { const p = cnt > 4 ? t + g32(e + 8) : e + 8; out[TAGS[tag]] = new TextDecoder().decode(new Uint8Array(buf, p, cnt - 1)); } else if (tag === 0x8825) out["GPS 있음"] = "예 (위치 정보 포함)"; else out[TAGS[tag]] = String(type === 3 ? g16(e + 8) : g32(e + 8)); }
      return out; }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break; off += 2 + len; }
  return out;
}
export function mount(root) {
  let files = []; const out = h("div"); const list = h("div");
  const dz = dropzone({ accept: "image/*", hint: "ComfyUI 가 저장한 PNG 를 넣으면 프롬프트·워크플로우 JSON 이 나온다", onFiles: async (fs) => { files = fs.filter(isImage); list.replaceChildren(fileList(files)); await show(); } });
  async function show() {
    out.replaceChildren();
    for (const f of files) {
      const buf = await f.arrayBuffer(); const box = h("div", { class: "panel", style: { marginTop: "12px" } }, h("h2", {}, f.name), h("div", { class: "meta" }, `${fmtBytes(f.size)} · ${f.type || extOf(f.name)}`));
      const png = readPngText(buf);
      if (png) { if (!png.length) box.append(h("p", { class: "help" }, "텍스트 청크 없음 (메타 없음)"));
        for (const c of png) { let pretty = c.text, isJson = false; try { pretty = JSON.stringify(JSON.parse(c.text), null, 2); isJson = true; } catch {}
          const ta = h("textarea", { rows: Math.min(18, pretty.split("\n").length + 1), readonly: true, style: { width: "100%", fontFamily: "monospace", fontSize: "11.5px" } }, pretty);
          box.append(h("h3", {}, `${c.key}${isJson ? " (JSON)" : ""} · ${fmtBytes(c.text.length)}`), h("div", { class: "cm-tools", style: { marginBottom: "6px" } }, button("복사", () => { navigator.clipboard?.writeText(c.text); toast("복사", "ok", 1200); }, "btn sm"), isJson ? button(`${c.key}.json 저장`, () => download(new Blob([pretty], { type: "application/json" }), `${baseName(f.name)}_${c.key}.json`), "btn sm") : null, c.key === "prompt" && isJson ? button("프롬프트 텍스트만", () => { try { const j = JSON.parse(c.text); const texts = Object.values(j).filter((n) => n.inputs && typeof n.inputs.text === "string").map((n) => `[${n.class_type}] ${n.inputs.text}`); ta.value = texts.join("\n\n") || "(text 입력 노드 없음)"; } catch {} }, "btn sm") : null), ta); } }
      else { const ex = readExifSummary(buf); if (ex === null) box.append(h("p", { class: "help" }, "PNG/JPEG 가 아니라 메타 파서가 없다")); else if (!Object.keys(ex).length) box.append(h("p", { class: "help" }, "EXIF 없음")); else box.append(h("table", { class: "data" }, h("tbody", {}, ...Object.entries(ex).map(([k, v]) => h("tr", {}, h("td", {}, k), h("td", {}, v)))))); }
      out.append(box);
    }
  }
  async function strip() { const res = []; for (const f of files) { const b = await loadBitmap(f); const c = canvas(b.width, b.height); c.getContext("2d").drawImage(b, 0, 0); b.close?.(); const ext = extOf(f.name) === "jpg" || extOf(f.name) === "jpeg" ? "jpg" : "png"; res.push({ blob: await toBlob(c, ext === "jpg" ? "image/jpeg" : "image/png", 0.95), name: `${baseName(f.name)}_nometa.${ext}` }); } await deliver(res, "nometa.zip"); toast("메타 제거본 저장", "ok"); }
  root.append(h("div", { class: "tool wide" }, h("div", { class: "panel" }, dz, list, h("div", { class: "cm-tools", style: { marginTop: "10px" } }, button("메타데이터 없는 사본 저장 (픽셀만 다시 인코딩)", strip, "btn primary")), h("p", { class: "help", style: { marginTop: "8px" } }, "이 툴박스의 다른 도구도 캔버스로 다시 인코딩하므로 결과물엔 촬영·위치·워크플로우 정보가 남지 않는다.")), out));
  return () => dz.destroy();
}
