// 배경 제거 — 워커에서 U²-Net 마스크 → 여기서 업샘플·문턱·부드러움 → 새 배경 합성 · 브러시 보정
import { h, dropzone, loadBitmap, canvas, toBlob, download, field, select, button, range, baseName, isImage, toast, handoff, progress, clamp } from "../ui.js";

const MAXSIDE = 2048;
export function mount(root) {
  let worker = null, src = null, name = "image", mask = null /* 320x320 Uint8 */, fixMask = null /* 원본 크기 canvas: 흰=지움 검=복원 */;
  const st = { bg: "transparent", color: "#ffffff", thresh: 30, soft: 2, brush: "erase", size: 50, fmt: "png" };
  const view = h("canvas"); const wrap = h("div", { class: "canvas-wrap checker" }, view);
  const prog = progress(); const statusEl = h("div", { class: "meta" });
  let bgImg = null, drawing = false;
  const dz = dropzone({ accept: "image/*", multiple: false, hint: "한 장 · 긴 변 2048px 로 줄여서 처리", onFiles: ([f]) => load(f) });

  async function load(f) {
    if (!isImage(f)) return toast("이미지가 아닙니다", "warn");
    const bmp = await loadBitmap(f); name = baseName(f.name);
    const s = Math.min(1, MAXSIDE / Math.max(bmp.width, bmp.height));
    src = canvas(bmp.width * s, bmp.height * s); src.getContext("2d").drawImage(bmp, 0, 0, src.width, src.height); bmp.close?.();
    mask = null; fixMask = canvas(src.width, src.height); view.width = src.width; view.height = src.height;
    view.getContext("2d").drawImage(src, 0, 0); runBtn.disabled = false; dz.classList.add("compact");
    statusEl.textContent = `${src.width}×${src.height}`;
  }
  function getWorker() {
    if (worker) return worker;
    worker = new Worker(new URL("../bg-worker.js", import.meta.url));
    worker.onmessage = (e) => { if (e.data.type === "status") { statusEl.textContent = e.data.text; prog.set(0.5, e.data.text); } };
    return worker;
  }
  function infer(rgba) {
    return new Promise((res, rej) => {
      const w = getWorker(); const id = Math.random();
      const on = (e) => { if (e.data.id !== id) return; w.removeEventListener("message", on); e.data.type === "error" ? rej(new Error(e.data.message)) : res(e.data.mask); };
      w.addEventListener("message", on); w.postMessage({ id, rgba }, [rgba.buffer]);
    });
  }
  async function run() {
    if (!src) return; runBtn.disabled = true; prog.set(0.1, "입력 준비");
    const small = canvas(320, 320); const sc = small.getContext("2d"); sc.imageSmoothingQuality = "high"; sc.drawImage(src, 0, 0, 320, 320);
    const rgba = sc.getImageData(0, 0, 320, 320).data;
    try { mask = await infer(new Uint8ClampedArray(rgba)); statusEl.textContent = "완료 — 범위·부드러움을 조절하거나 브러시로 보정"; compose(); }
    catch (e) { toast("추론 실패: " + e.message, "warn"); statusEl.textContent = e.message; }
    prog.done(); runBtn.disabled = false;
  }
  // 마스크 → 원본 크기 알파 캔버스
  function alphaCanvas() {
    const m = canvas(320, 320); const id = m.getContext("2d").createImageData(320, 320);
    const lo = st.thresh / 100 * 255, hi = 255;
    for (let i = 0; i < 320 * 320; i++) { const v = mask[i]; const a = v <= lo ? 0 : v >= hi ? 255 : ((v - lo) / (hi - lo)) * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = a; }
    m.getContext("2d").putImageData(id, 0, 0);
    const a = canvas(src.width, src.height), ac = a.getContext("2d"); ac.imageSmoothingQuality = "high";
    if (st.soft) ac.filter = `blur(${st.soft}px)`;
    ac.drawImage(m, 0, 0, src.width, src.height); ac.filter = "none";
    // 수동 보정: fixMask 의 흰(지움) → 알파 제거 · 검(복원) → 알파 채움
    ac.globalCompositeOperation = "destination-out"; ac.drawImage(fixMask, 0, 0); // fixMask 흰 부분(알파 있음) 지움
    return a;
  }
  function compose(forSave = false) {
    if (!mask) return null;
    const a = alphaCanvas();
    // 복원 브러시 레이어(검정 알파)
    const cut = canvas(src.width, src.height), cc = cut.getContext("2d");
    cc.drawImage(src, 0, 0); cc.globalCompositeOperation = "destination-in"; cc.drawImage(a, 0, 0);
    cc.globalCompositeOperation = "source-over";
    if (restoreLayer) { cc.save(); cc.globalCompositeOperation = "destination-over"; const r = canvas(src.width, src.height), rc = r.getContext("2d"); rc.drawImage(src, 0, 0); rc.globalCompositeOperation = "destination-in"; rc.drawImage(restoreLayer, 0, 0); cc.drawImage(r, 0, 0); cc.restore(); }
    const out = canvas(src.width, src.height), oc = out.getContext("2d");
    if (st.bg === "color") { oc.fillStyle = st.color; oc.fillRect(0, 0, out.width, out.height); }
    else if (st.bg.startsWith("grad")) { const g = oc.createLinearGradient(0, 0, 0, out.height); const [a1, b1] = { grad1: ["#efe6fb", "#c9b6e6"], grad2: ["#fff1e6", "#f4b89a"], grad3: ["#e6f2ff", "#9ec5f0"] }[st.bg]; g.addColorStop(0, a1); g.addColorStop(1, b1); oc.fillStyle = g; oc.fillRect(0, 0, out.width, out.height); }
    else if (st.bg === "image" && bgImg) { const r = Math.max(out.width / bgImg.width, out.height / bgImg.height); oc.drawImage(bgImg, (out.width - bgImg.width * r) / 2, (out.height - bgImg.height * r) / 2, bgImg.width * r, bgImg.height * r); }
    oc.drawImage(cut, 0, 0);
    if (!forSave) view.getContext("2d").clearRect(0, 0, view.width, view.height);
    if (!forSave) view.getContext("2d").drawImage(out, 0, 0);
    return out;
  }
  let restoreLayer = null;
  const pos = (e) => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) * view.width / r.width, (e.clientY - r.top) * view.height / r.height]; };
  function dab(x, y) {
    if (st.brush === "erase") { const c = fixMask.getContext("2d"); c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, st.size / 2, 0, Math.PI * 2); c.fill(); if (restoreLayer) { const rc = restoreLayer.getContext("2d"); rc.save(); rc.globalCompositeOperation = "destination-out"; rc.beginPath(); rc.arc(x, y, st.size / 2, 0, Math.PI * 2); rc.fill(); rc.restore(); } }
    else { restoreLayer ||= canvas(src.width, src.height); const c = restoreLayer.getContext("2d"); c.fillStyle = "#000"; c.beginPath(); c.arc(x, y, st.size / 2, 0, Math.PI * 2); c.fill(); const fc = fixMask.getContext("2d"); fc.save(); fc.globalCompositeOperation = "destination-out"; fc.beginPath(); fc.arc(x, y, st.size / 2, 0, Math.PI * 2); fc.fill(); fc.restore(); }
  }
  let last = null;
  view.addEventListener("pointerdown", (e) => { if (!mask) return; drawing = true; view.setPointerCapture(e.pointerId); const [x, y] = pos(e); last = [x, y]; dab(x, y); compose(); });
  view.addEventListener("pointermove", (e) => { if (!drawing) return; const [x, y] = pos(e); const d = Math.hypot(x - last[0], y - last[1]), n = Math.max(1, Math.ceil(d / (st.size / 4))); for (let i = 1; i <= n; i++) dab(last[0] + (x - last[0]) * i / n, last[1] + (y - last[1]) * i / n); last = [x, y]; compose(); });
  view.addEventListener("pointerup", () => { drawing = false; });
  async function save() { const o = compose(true); if (!o) return; const type = st.fmt === "jpg" ? "image/jpeg" : st.fmt === "webp" ? "image/webp" : "image/png";
    if (st.fmt === "jpg" && st.bg === "transparent") { const j = canvas(o.width, o.height), jc = j.getContext("2d"); jc.fillStyle = "#fff"; jc.fillRect(0, 0, j.width, j.height); jc.drawImage(o, 0, 0); download(await toBlob(j, type, 0.92), `${name}_nobg.jpg`); }
    else download(await toBlob(o, type, 0.92), `${name}_nobg.${st.fmt}`); toast("저장", "ok"); }
  const runBtn = button("자동 배경 제거", run, "btn primary full"); runBtn.disabled = true;
  const bgFile = h("input", { type: "file", accept: "image/*", onchange: async (e) => { const f = e.target.files[0]; if (!f) return; const b = await loadBitmap(f); bgImg = canvas(b.width, b.height); bgImg.getContext("2d").drawImage(b, 0, 0); b.close?.(); st.bg = "image"; bgSel.value = "image"; compose(); } });
  const bgSel = select([["transparent", "투명"], ["color", "단색"], ["grad1", "라벤더 그라데이션"], ["grad2", "피치 그라데이션"], ["grad3", "하늘 그라데이션"], ["image", "내 배경 사진"]], st.bg, (v) => { st.bg = v; if (v === "image" && !bgImg) bgFile.click(); compose(); });
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, wrap, statusEl, prog, h("p", { class: "help", style: { marginTop: "10px" } }, "경량 U²-Net(u2netp) 이라 머리카락·가는 물체는 거칠 수 있다. 브러시로 지우기/복원하고, 정밀 누끼가 필요하면 ComfyUI 쪽 세그먼트로.")),
    h("div", { class: "panel controls" }, runBtn,
      field("새 배경", bgSel), field("단색", h("input", { type: "color", value: st.color, oninput: (e) => { st.color = e.target.value; st.bg = "color"; bgSel.value = "color"; compose(); } })), field("배경 사진", bgFile),
      field("제거 범위 (문턱)", range(st.thresh, { min: 0, max: 90, onInput: (v) => { st.thresh = v; compose(); } })),
      field("경계 부드러움 px", range(st.soft, { min: 0, max: 12, onInput: (v) => { st.soft = v; compose(); } })),
      h("h3", {}, "수동 보정 (미리보기 위에 드래그)"),
      field("브러시", select([["erase", "지우기 (배경으로)"], ["restore", "복원하기 (피사체로)"]], st.brush, (v) => st.brush = v)),
      field("브러시 크기", range(st.size, { min: 6, max: 300, onInput: (v) => st.size = v })),
      button("보정 초기화", () => { if (!src) return; fixMask = canvas(src.width, src.height); restoreLayer = null; compose(); }),
      field("형식", select([["png", "PNG · 투명 유지"], ["webp", "WEBP · 투명 유지"], ["jpg", "JPG · 투명은 흰색"]], st.fmt, (v) => st.fmt = v)),
      button("완성 이미지 저장", save, "btn primary full"))));
  const ho = handoff.take(); if (ho?.files?.[0]) load(ho.files[0]);
  return () => { dz.destroy(); worker?.terminate(); };
}
