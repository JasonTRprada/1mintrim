// 얼굴 검출 워커 — Ultra-Light-Fast-Generic-Face-Detector (version-RFB-320, MIT) · onnxruntime-web
importScripts("vendor/ort.min.js");
ort.env.wasm.wasmPaths = new URL("vendor/", self.location.href).href;
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error"; // 이 모델은 옛 exporter 라 initializer 경고가 수백 줄 뜬다
let session = null;
const W = 320, H = 240;

async function ensure() {
  if (session) return session;
  const buf = await (await fetch(new URL("vendor/face-rfb-320.onnx", self.location.href))).arrayBuffer();
  session = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"], logSeverityLevel: 3, logVerbosityLevel: 0 });
  return session;
}
function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9);
}
self.onmessage = async (e) => {
  const { id, rgba, thresh = 0.7 } = e.data; // rgba: 320x240x4
  try {
    const s = await ensure();
    const plane = W * H, data = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) { data[i] = (rgba[i * 4] - 127) / 128; data[plane + i] = (rgba[i * 4 + 1] - 127) / 128; data[2 * plane + i] = (rgba[i * 4 + 2] - 127) / 128; }
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, H, W]) });
    const names = s.outputNames; // scores [1,N,2], boxes [1,N,4]
    let scores, boxes; for (const n of names) { const t = out[n]; if (t.dims[2] === 2) scores = t.data; else if (t.dims[2] === 4) boxes = t.data; }
    const cand = [];
    for (let i = 0; i < scores.length / 2; i++) { const p = scores[i * 2 + 1]; if (p >= thresh) cand.push({ p, box: [boxes[i * 4], boxes[i * 4 + 1], boxes[i * 4 + 2], boxes[i * 4 + 3]] }); }
    cand.sort((a, b) => b.p - a.p);
    const keep = [];
    for (const c of cand) { if (keep.every((k) => iou(k.box, c.box) < 0.3)) keep.push(c); }
    postMessage({ type: "result", id, faces: keep.map((k) => ({ p: k.p, box: k.box.map((v) => Math.min(1, Math.max(0, v))) })) });
  } catch (err) { postMessage({ type: "error", id, message: String(err.message || err) }); }
};
