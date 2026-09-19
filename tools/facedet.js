// 얼굴 검출 클라이언트 — 어떤 캔버스/비트맵이든 넣으면 원본 좌표 박스 [x,y,w,h,p] 배열
import { canvas } from "./ui.js";
let worker = null;
function get() {
  if (!worker) worker = new Worker(new URL("./face-worker.js", import.meta.url));
  return worker;
}
export function detectFaces(src, { thresh = 0.7, minSize = 0 } = {}) {
  const sw = src.width || src.videoWidth, sh = src.height || src.videoHeight;
  const c = canvas(320, 240); const ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, 320, 240);
  const rgba = new Uint8ClampedArray(ctx.getImageData(0, 0, 320, 240).data);
  return new Promise((res, rej) => {
    const w = get(); const id = Math.random();
    const on = (e) => { if (e.data.id !== id) return; w.removeEventListener("message", on);
      if (e.data.type === "error") return rej(new Error(e.data.message));
      res(e.data.faces.map((f) => ({ x: f.box[0] * sw, y: f.box[1] * sh, w: (f.box[2] - f.box[0]) * sw, h: (f.box[3] - f.box[1]) * sh, p: f.p })).filter((f) => f.w >= minSize && f.h >= minSize)); };
    w.addEventListener("message", on); w.postMessage({ id, rgba, thresh }, [rgba.buffer]);
  });
}
export function disposeFaceWorker() { worker?.terminate(); worker = null; }
