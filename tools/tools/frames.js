import { h, dropzone, loadVideo, frameAt, toBlob, deliver, field, num, button, progress, baseName, fmtTime, isVideo, toast, select, mimeOf, check } from "../ui.js";

export function mount(root) {
  let video = null, file = null, shots = []; // {t, canvas}
  const st = { n: 6, fmt: "png", scale: 1, skipEnds: true };
  const stage = h("div", { class: "canvas-wrap" });
  const strip = h("div", { class: "strip" });
  const info = h("div", { class: "meta" });
  const timeIn = num(0, { min: 0, step: 0.01, width: "120px" });
  const prog = progress();
  const dz = dropzone({ accept: "video/*", multiple: false, hint: "MP4 · WebM (브라우저가 재생할 수 있는 코덱)", onFiles: async ([f]) => {
    if (!isVideo(f)) return toast("영상 파일이 아닙니다", "warn");
    try { video = await loadVideo(f); } catch (e) { return toast(e.message, "warn"); }
    file = f; video.controls = true; stage.replaceChildren(video);
    info.textContent = `${f.name} · ${video.videoWidth}×${video.videoHeight} · ${fmtTime(video.duration)}`;
    timeIn.max = video.duration.toFixed(2);
    video.addEventListener("timeupdate", () => { timeIn.value = video.currentTime.toFixed(2); });
    shots = []; renderStrip(); enable(true);
  }});
  const btns = [];
  const enable = (on) => btns.forEach((b) => b.disabled = !on);

  function outSize() { return [Math.round(video.videoWidth * st.scale), Math.round(video.videoHeight * st.scale)]; }
  async function grab(t) {
    const [w, hh] = outSize();
    const c = await frameAt(video, t, w, hh);
    shots.push({ t: video.currentTime, canvas: c }); shots.sort((a, b) => a.t - b.t); renderStrip();
  }
  function renderStrip() {
    strip.replaceChildren(...shots.map((s, i) => {
      const thumb = h("canvas", { width: 150, height: Math.round(150 * s.canvas.height / s.canvas.width) });
      thumb.getContext("2d").drawImage(s.canvas, 0, 0, thumb.width, thumb.height);
      return h("div", { class: "fr" }, thumb, h("div", { class: "t" }, `${s.t.toFixed(3)}s`), h("button", { class: "x", type: "button", onclick: () => { shots.splice(i, 1); renderStrip(); } }, "×"));
    }));
    saveBtn.disabled = !shots.length;
  }
  async function grabEven() {
    shots = [];
    const n = Math.max(1, st.n), d = video.duration;
    for (let i = 0; i < n; i++) {
      prog.set(i / n, `${i + 1}/${n}`);
      const t = st.skipEnds ? (d * (i + 0.5)) / n : n === 1 ? 0 : (d * i) / (n - 1);
      await grab(t);
    }
    prog.done();
  }
  async function save() {
    const out = [];
    const [w, hh] = outSize();
    for (let i = 0; i < shots.length; i++) {
      prog.set(i / shots.length, `인코딩 ${i + 1}/${shots.length}`);
      out.push({ blob: await toBlob(shots[i].canvas, mimeOf(st.fmt), 0.95), name: `${baseName(file.name)}_t${shots[i].t.toFixed(3).replace(".", "_")}_${w}x${hh}.${st.fmt}` });
    }
    prog.done();
    await deliver(out, `${baseName(file.name)}_frames.zip`);
  }
  const saveBtn = button("스틸 저장 (PNG / ZIP)", save, "btn primary full"); saveBtn.disabled = true;
  const b1 = button("현재 위치 캡처", () => grab(video.currentTime), "btn primary");
  const b2 = button("첫 프레임", () => grab(0));
  const b3 = button("마지막 프레임", () => grab(video.duration - 0.04));
  const b4 = button("입력 시각으로 캡처", () => grab(Number(timeIn.value)));
  const b5 = button("균등 N장", grabEven);
  btns.push(b1, b2, b3, b4, b5); enable(false);

  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, stage, info, h("h3", {}, "캡처한 프레임"), strip, h("p", { class: "help" }, "재생하다 멈춘 자리에서 「현재 위치 캡처」. 마지막 프레임은 끝샷 키프레임(i2v 도착점)으로 쓴다. ", h("kbd", {}, "←"), h("kbd", {}, "→"), " 로 영상 위에서 프레임 단위 이동(브라우저 기본 5초 → 여기선 1/30초).")),
    h("div", { class: "panel controls" },
      h("div", { class: "cm-tools" }, b1, b2, b3),
      h("div", { class: "row" }, field("시각(초)", timeIn), b4),
      h("div", { class: "row" }, field("N", num(st.n, { min: 1, max: 200, onInput: (v) => st.n = v })), b5),
      check("양 끝 피해서 균등 (중앙 정렬)", true, (v) => st.skipEnds = v),
      field("출력 배율", select([["1", "원본 100%"], ["0.5", "50%"], ["0.25", "25%"], ["2", "200% (업샘플)"]], "1", (v) => st.scale = Number(v))),
      field("형식", select([["png", "PNG (무손실)"], ["jpg", "JPG"], ["webp", "WEBP"]], st.fmt, (v) => st.fmt = v)),
      saveBtn, prog)));
  const onKey = (e) => {
    if (!video || document.activeElement?.tagName === "INPUT") return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); video.pause(); video.currentTime = Math.max(0, video.currentTime + (e.key === "ArrowRight" ? 1 : -1) / 30); }
  };
  document.addEventListener("keydown", onKey);
  return () => { dz.destroy(); document.removeEventListener("keydown", onKey); if (video) URL.revokeObjectURL(video.src); };
}
