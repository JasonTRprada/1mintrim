// 배경 제거 워커 — U²-Net small (u2netp.onnx) · onnxruntime-web (wasm · 단일 스레드)
importScripts("vendor/ort.min.js");
ort.env.wasm.wasmPaths = new URL("vendor/", self.location.href).href;
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
let session = null;
const SIZE = 320, MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

async function ensure() {
  if (session) return session;
  postMessage({ type: "status", text: "모델 내려받는 중 (4.6MB · 첫 실행만)" });
  const buf = await (await fetch(new URL("vendor/u2netp.onnx", self.location.href))).arrayBuffer();
  postMessage({ type: "status", text: "세션 준비 중" });
  session = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });
  return session;
}
self.onmessage = async (e) => {
  const { id, rgba } = e.data; // rgba: Uint8ClampedArray 320x320x4
  try {
    const s = await ensure();
    const plane = SIZE * SIZE, data = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      data[i] = (rgba[i * 4] / 255 - MEAN[0]) / STD[0];
      data[plane + i] = (rgba[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
      data[2 * plane + i] = (rgba[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
    }
    postMessage({ type: "status", text: "추론 중" });
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, SIZE, SIZE]) });
    const pred = out[s.outputNames[0]].data; // [1,1,320,320]
    let mi = Infinity, ma = -Infinity; for (let i = 0; i < plane; i++) { if (pred[i] < mi) mi = pred[i]; if (pred[i] > ma) ma = pred[i]; }
    const mask = new Uint8ClampedArray(plane); const r = ma - mi || 1;
    for (let i = 0; i < plane; i++) mask[i] = ((pred[i] - mi) / r) * 255;
    postMessage({ type: "result", id, mask }, [mask.buffer]);
  } catch (err) { postMessage({ type: "error", id, message: String(err.message || err) }); }
};
