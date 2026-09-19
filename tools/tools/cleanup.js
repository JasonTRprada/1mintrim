// 사진 속 작은 표시 지우기 — 브러시/사각으로 마스크 → 주변 결 복제(PatchMatch 축약) 또는 부드럽게 채우기
// 자동 감지: 네 모서리·가장자리 띠에서 고대비 얇은 획(워터마크·글자) 후보를 찾아 마스크로 제안한다
import { h, dropzone, loadBitmap, canvas, toBlob, download, field, select, button, range, baseName, isImage, mimeOf, toast, handoff, progress, toGray, zoomable } from "../ui.js";

export function mount(root) {
  let src = null, name = "image", mask = null /* Uint8 w*h, 1=지울 곳 */, result = null, undo = [];
  const st = { size: 40, mode: "patch", shape: "brush", fmt: "png", corners: 22 };
  const view = h("canvas"); const wrap = h("div", { class: "canvas-wrap" }, view);
  const zoomBar = zoomable(wrap, view);
  const meta = h("div", { class: "meta" }, "지울 곳을 브러시로 칠하거나 사각으로 잡고 「채우기」");
  const prog = progress();
  let W = 0, H = 0, drawing = false, rectStart = null, showMask = true;
  const dz = dropzone({ accept: "image/*", multiple: false, onFiles: ([f]) => load(f) });
  async function load(f) {
    if (!isImage(f)) return toast("이미지가 아닙니다", "warn");
    const b = await loadBitmap(f); name = baseName(f.name);
    const s = Math.min(1, 2600 / Math.max(b.width, b.height));
    src = canvas(b.width * s, b.height * s); src.getContext("2d").drawImage(b, 0, 0, src.width, src.height); b.close?.();
    W = src.width; H = src.height; result = canvas(W, H); result.getContext("2d").drawImage(src, 0, 0);
    mask = new Uint8Array(W * H); undo = []; view.width = W; view.height = H; render(); dz.classList.add("compact");
    meta.textContent = `${W}×${H}${s < 1 ? " (2600px 로 축소)" : ""}`;
  }
  function render() {
    const ctx = view.getContext("2d"); ctx.drawImage(result, 0, 0);
    if (showMask && mask) { const id = ctx.getImageData(0, 0, W, H), d = id.data; for (let i = 0; i < W * H; i++) if (mask[i]) { d[i * 4] = d[i * 4] * 0.4 + 255 * 0.6; d[i * 4 + 1] *= 0.4; d[i * 4 + 2] = d[i * 4 + 2] * 0.4 + 120 * 0.6; } ctx.putImageData(id, 0, 0); }
  }
  const pos = (e) => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  function paint(cx, cy, r) { const x0 = Math.max(0, cx - r | 0), x1 = Math.min(W - 1, cx + r | 0), y0 = Math.max(0, cy - r | 0), y1 = Math.min(H - 1, cy + r | 0); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[y * W + x] = 1; }
  let last = null;
  view.addEventListener("pointerdown", (e) => { if (!src) return; drawing = true; view.setPointerCapture(e.pointerId); const [x, y] = pos(e); if (st.shape === "rect") rectStart = [x, y]; else { last = [x, y]; paint(x, y, st.size / 2); render(); } });
  view.addEventListener("pointermove", (e) => { if (!drawing) return; const [x, y] = pos(e); if (st.shape === "rect") { render(); const c = view.getContext("2d"); c.strokeStyle = "#f0f"; c.lineWidth = 2; c.setLineDash([6, 4]); c.strokeRect(rectStart[0], rectStart[1], x - rectStart[0], y - rectStart[1]); return; }
    const d = Math.hypot(x - last[0], y - last[1]), n = Math.max(1, Math.ceil(d / (st.size / 4))); for (let i = 1; i <= n; i++) paint(last[0] + (x - last[0]) * i / n, last[1] + (y - last[1]) * i / n, st.size / 2); last = [x, y]; render(); });
  view.addEventListener("pointerup", (e) => { if (!drawing) return; drawing = false; if (st.shape === "rect") { const [x, y] = pos(e); const x0 = Math.max(0, Math.min(x, rectStart[0]) | 0), y0 = Math.max(0, Math.min(y, rectStart[1]) | 0), x1 = Math.min(W - 1, Math.max(x, rectStart[0]) | 0), y1 = Math.min(H - 1, Math.max(y, rectStart[1]) | 0); for (let yy = y0; yy <= y1; yy++) mask.fill(1, yy * W + x0, yy * W + x1 + 1); rectStart = null; } render(); });

  // ---------- 자동 감지: 가장자리 띠에서 얇은 고대비 획 ----------
  function autoDetect() {
    if (!src) return;
    const id = src.getContext("2d").getImageData(0, 0, W, H); const g = toGray(id);
    const band = Math.round(Math.min(W, H) * st.corners / 100);
    // 로컬 대비: 3x3 라플라시안 절댓값 큰 곳 + 밝기 극단(흰/검 글자)
    const cand = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const inBand = x < band || x > W - band || y < band || y > H - band; if (!inBand) continue;
      const i = y * W + x; const L = Math.abs(g[i - W] + g[i + W] + g[i - 1] + g[i + 1] - 4 * g[i]);
      if (L > 60) cand[i] = 1;
    }
    // 팽창 2px 후 작은 덩어리(면적 < 12px) 제거, 가는 획을 마스크로
    const dil = new Uint8Array(W * H);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; if (!cand[i]) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) dil[i + dy * W + dx] = 1; }
    // 연결 성분 라벨링(스택), 너무 큰 덩어리(사진 내용의 강한 에지)는 제외
    const seen = new Uint8Array(W * H); let kept = 0;
    for (let i = 0; i < W * H; i++) { if (!dil[i] || seen[i]) continue; const stack = [i], comp = []; seen[i] = 1;
      while (stack.length) { const j = stack.pop(); comp.push(j); const x = j % W, y = (j / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const k = ny * W + nx; if (dil[k] && !seen[k]) { seen[k] = 1; stack.push(k); } } }
      let x0 = W, x1 = 0, y0 = H, y1 = 0; for (const j of comp) { const x = j % W, y = (j / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1; const fill = comp.length / (bw * bh);
      // 워터마크/글자: 면적 12~(0.06*W*H), 박스 한 변이 화면의 40% 이하, 채움 비율 낮음(얇은 획)
      if (comp.length >= 12 && comp.length < W * H * 0.06 && bw < W * 0.4 && bh < H * 0.4 && fill < 0.75) { for (const j of comp) mask[j] = 1; kept++; }
    }
    render(); meta.textContent = kept ? `후보 ${kept}개를 마스크로 제안했다. 틀린 곳은 브러시(지우개 모드)로 빼고 「채우기」` : "가장자리에서 워터마크 후보를 못 찾았다. 손으로 칠해라.";
  }

  // ---------- 채우기 ----------
  function snapshot() { const c = canvas(W, H); c.getContext("2d").drawImage(result, 0, 0); undo.push({ c, m: mask.slice() }); if (undo.length > 10) undo.shift(); }
  async function fill() {
    if (!src || !mask.some((v) => v)) return toast("지울 곳을 먼저 표시", "warn");
    snapshot(); fillBtn.disabled = true;
    const ctx = result.getContext("2d"); const id = ctx.getImageData(0, 0, W, H);
    if (st.mode === "smooth") smoothFill(id.data, mask, W, H); else await patchFill(id.data, mask, W, H, (p) => prog.set(p, "결 복제 중"));
    ctx.putImageData(id, 0, 0); mask.fill(0); prog.done(); render(); fillBtn.disabled = false; toast("채움", "ok");
  }
  // 부드럽게: 마스크 안을 경계에서 반복 확산 (다운샘플 피라미드로 빠르게)
  function smoothFill(d, m, w, hh) {
    const idx = []; for (let i = 0; i < w * hh; i++) if (m[i]) idx.push(i);
    // 초기값: 가장 가까운 경계 평균 근사 → 반복 평균
    for (let it = 0; it < 200; it++) { let moved = 0; for (const i of idx) { const x = i % w, y = (i / w) | 0; let r = 0, g = 0, b = 0, n = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= hh) continue; const k = (ny * w + nx) * 4; if (m[ny * w + nx] && it === 0) continue; r += d[k]; g += d[k + 1]; b += d[k + 2]; n++; } if (n) { const k = i * 4; if (Math.abs(d[k] - r / n) > 0.5) moved++; d[k] = r / n; d[k + 1] = g / n; d[k + 2] = b / n; } } if (it > 5 && moved < idx.length * 0.002) break; }
  }
  // 결 복제: 마스크 픽셀마다 주변(반경 R) 비마스크 영역에서 가장 비슷한 7x7 패치를 무작위 탐색+전파로 찾아 중심 픽셀 복사. 바깥→안쪽 순서.
  async function patchFill(d, m, w, hh, onProg) {
    const P = 3, R = Math.max(24, Math.round(Math.min(w, hh) * 0.08)), ITER = 3;
    const filled = new Uint8Array(m); // 1 = 아직 비어 있음
    const order = []; // 경계 거리 순(밖→안): 간단히 침식 반복
    let cur = Array.from(filled).map((v, i) => v ? i : -1).filter((i) => i >= 0); let ring = 0;
    const dist = new Int32Array(w * hh).fill(-1);
    while (cur.length) { const next = []; for (const i of cur) { const x = i % w, y = (i / w) | 0; let edge = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= hh || !filled[ny * w + nx] || dist[ny * w + nx] >= 0 && dist[ny * w + nx] < ring) { edge = true; break; } } if (edge) { dist[i] = ring; order.push(i); } else next.push(i); } if (next.length === cur.length) { for (const i of next) { dist[i] = ring; order.push(i); } break; } cur = next; ring++; }
    const nn = new Int32Array(w * hh).fill(-1);
    const cost = (i, j) => { // 패치 차이 (마스크 안 픽셀은 제외)
      const xi = i % w, yi = (i / w) | 0, xj = j % w, yj = (j / w) | 0; let s = 0, n = 0;
      for (let dy = -P; dy <= P; dy++) for (let dx = -P; dx <= P; dx++) { const ax = xi + dx, ay = yi + dy, bx = xj + dx, by = yj + dy; if (ax < 0 || ay < 0 || ax >= w || ay >= hh || bx < 0 || by < 0 || bx >= w || by >= hh) { s += 3000; continue; } const a = ay * w + ax, b = by * w + bx; if (filled[a] || m[b]) continue; const ka = a * 4, kb = b * 4; s += (d[ka] - d[kb]) ** 2 + (d[ka + 1] - d[kb + 1]) ** 2 + (d[ka + 2] - d[kb + 2]) ** 2; n++; } return n ? s / n : 1e9; };
    const rnd = (i) => { const x = i % w, y = (i / w) | 0; for (let t = 0; t < 30; t++) { const nx = Math.round(x + (Math.random() * 2 - 1) * R), ny = Math.round(y + (Math.random() * 2 - 1) * R); if (nx < P || ny < P || nx >= w - P || ny >= hh - P) continue; const j = ny * w + nx; if (!m[j]) return j; } return -1; };
    let done = 0;
    for (const i of order) {
      let best = -1, bc = Infinity;
      // 전파: 이웃(이미 채운)의 대응점을 옮겨 시도
      const x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= hh) continue; const nb = nn[ny * w + nx]; if (nb < 0) continue; const j = nb - dy * w - dx; if (j < 0 || j >= w * hh || m[j]) continue; const c = cost(i, j); if (c < bc) { bc = c; best = j; } }
      for (let t = 0; t < 8; t++) { const j = rnd(i); if (j < 0) continue; const c = cost(i, j); if (c < bc) { bc = c; best = j; } }
      for (let it = 0; it < ITER && best >= 0; it++) { const bx = best % w, by = (best / w) | 0; const r = Math.max(2, R >> (it + 1)); for (let t = 0; t < 4; t++) { const nx = Math.round(bx + (Math.random() * 2 - 1) * r), ny = Math.round(by + (Math.random() * 2 - 1) * r); if (nx < P || ny < P || nx >= w - P || ny >= hh - P) continue; const j = ny * w + nx; if (m[j]) continue; const c = cost(i, j); if (c < bc) { bc = c; best = j; } } }
      if (best < 0) best = rnd(i);
      if (best >= 0) { nn[i] = best; d[i * 4] = d[best * 4]; d[i * 4 + 1] = d[best * 4 + 1]; d[i * 4 + 2] = d[best * 4 + 2]; }
      filled[i] = 0;
      if ((++done & 1023) === 0) { onProg(done / order.length); await new Promise((r) => setTimeout(r)); }
    }
    // 마무리: 마스크 안을 3x3 가볍게 블렌드해 이음새 완화
    const copy = new Uint8ClampedArray(d);
    for (const i of order) { const x = i % w, y = (i / w) | 0; if (x < 1 || y < 1 || x >= w - 1 || y >= hh - 1) continue; for (let c = 0; c < 3; c++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += copy[((y + dy) * w + x + dx) * 4 + c]; d[i * 4 + c] = (copy[i * 4 + c] * 2 + s / 9) / 3; } }
  }
  function doUndo() { const u = undo.pop(); if (!u) return; result = u.c; mask = u.m; render(); }
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); doUndo(); } };
  document.addEventListener("keydown", onKey);
  async function save() { if (!result) return; download(await toBlob(result, mimeOf(st.fmt), 0.92), `${name}_clean.${st.fmt}`); toast("저장", "ok"); }
  const fillBtn = button("채우기", fill, "btn primary full");
  const seg = (opts, key, after) => { const s = h("div", { class: "seg" }); for (const [v, t] of opts) s.append(h("button", { type: "button", class: st[key] === v ? "on" : "", onclick: (e) => { st[key] = v; [...s.children].forEach((b) => b.classList.toggle("on", b === e.target)); after?.(); } }, t)); return s; };
  let eraser = false;
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, wrap, zoomBar, meta, prog, h("p", { class: "help", style: { marginTop: "10px" } }, "「결 복제」는 주변 무늬를 가져와 메운다(워터마크·잡티·전선). 「부드럽게」는 단색 배경에서 빠르다. 넓은 영역·복잡한 배경은 ComfyUI 인페인트로.")),
    h("div", { class: "panel controls" },
      button("자동 감지 (가장자리 워터마크·글자)", autoDetect, "btn full"),
      field("감지 띠 폭 (짧은 변의 %)", range(st.corners, { min: 8, max: 50, onInput: (v) => st.corners = v })),
      field("도구", seg([["brush", "브러시"], ["rect", "사각"]], "shape")),
      field("브러시 크기", range(st.size, { min: 6, max: 300, onInput: (v) => st.size = v })),
      h("label", { class: "check" }, h("input", { type: "checkbox", onchange: (e) => { eraser = e.target.checked; paint = eraser ? (cx, cy, r) => { const x0 = Math.max(0, cx - r | 0), x1 = Math.min(W - 1, cx + r | 0), y0 = Math.max(0, cy - r | 0), y1 = Math.min(H - 1, cy + r | 0); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[y * W + x] = 0; } : paintOrig; } }), h("span", {}, "지우개 (마스크에서 빼기)")),
      field("채우는 방식", seg([["patch", "결 복제"], ["smooth", "부드럽게"]], "mode")),
      fillBtn,
      h("div", { class: "row" }, button("되돌리기 (Ctrl+Z)", doUndo), button("마스크 지우기", () => { mask?.fill(0); render(); })),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: true, onchange: (e) => { showMask = e.target.checked; render(); } }), h("span", {}, "마스크 표시")),
      field("형식", select([["png", "PNG"], ["jpg", "JPG"], ["webp", "WEBP"]], st.fmt, (v) => st.fmt = v)),
      button("저장", save, "btn primary full"))));
  const paintOrig = paint;
  const ho = handoff.take(); if (ho?.files?.[0]) load(ho.files[0]);
  return () => { dz.destroy(); document.removeEventListener("keydown", onKey); zoomBar.destroy(); };
}
