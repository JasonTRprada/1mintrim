// 영상 → GIF — HTML5 디코더로 프레임 뽑아 gifenc 로 인코딩 (ffmpeg 불필요)
import { h, dropzone, loadVideo, seekTo, canvas, download, field, select, num, button, progress, baseName, fmtTime, isVideo, isImage, toast, handoff, check, clamp, loadBitmap } from "../ui.js";
import { GIFEncoder, quantize, applyPalette } from "../vendor/gifenc.esm.js";

export function mount(root) {
  let video = null, file = null, images = null;
  const st = { start: 0, end: 0, fps: 12, width: 480, boom: false, dither: false, maxLen: 30, loop: true, delayImg: 500 };
  const stage = h("div", { class: "canvas-wrap" }); const info = h("div", { class: "meta" });
  const out = h("div", { class: "canvas-wrap checker", style: { marginTop: "12px" } }); const outMeta = h("div", { class: "meta" });
  const prog = progress();
  const tl = h("div", { class: "tl" }); const fill = h("div", { class: "fill" }); const hs = h("div", { class: "hd" }); const he = h("div", { class: "hd" });
  tl.append(fill, hs, he);
  const labels = h("div", { class: "tl-labels" }, h("span"), h("span"), h("span"));
  const dz = dropzone({ accept: "video/*,image/*", hint: "영상 한 편 · 또는 이미지 여러 장(슬라이드 GIF)", onFiles: async (fs) => {
    if (fs.every(isImage)) { images = fs; video = null; stage.replaceChildren(h("p", { class: "help" }, `${fs.length}장 → 프레임당 ${st.delayImg}ms 슬라이드 GIF`)); tl.classList.add("hidden"); labels.classList.add("hidden"); runBtn.disabled = false; return; }
    const f = fs.find(isVideo); if (!f) return toast("영상/이미지 파일이 아닙니다", "warn");
    try { video = await loadVideo(f); } catch (e) { return toast(e.message, "warn"); }
    images = null; file = f; video.controls = true; stage.replaceChildren(video); tl.classList.remove("hidden"); labels.classList.remove("hidden");
    st.start = 0; st.end = Math.min(video.duration, 5); info.textContent = `${f.name} · ${video.videoWidth}×${video.videoHeight} · ${fmtTime(video.duration)}`;
    drawTl(); runBtn.disabled = false;
  }});
  function drawTl() {
    if (!video) return; const d = video.duration;
    fill.style.left = `${st.start / d * 100}%`; fill.style.width = `${(st.end - st.start) / d * 100}%`;
    hs.style.left = `${st.start / d * 100}%`; he.style.left = `${st.end / d * 100}%`;
    labels.children[0].textContent = `${st.start.toFixed(2)}s`; labels.children[1].textContent = `구간 ${(st.end - st.start).toFixed(2)}s · ${Math.round((st.end - st.start) * st.fps)}프레임`; labels.children[2].textContent = `${st.end.toFixed(2)}s`;
  }
  function dragHandle(hd, which) {
    hd.addEventListener("pointerdown", (e) => { hd.setPointerCapture(e.pointerId); const mv = (ev) => { const r = tl.getBoundingClientRect(); const t = clamp((ev.clientX - r.left) / r.width, 0, 1) * video.duration;
      if (which === "s") st.start = Math.min(t, st.end - 0.1); else st.end = Math.max(t, st.start + 0.1);
      if (st.end - st.start > st.maxLen) { if (which === "s") st.end = st.start + st.maxLen; else st.start = st.end - st.maxLen; }
      video.currentTime = which === "s" ? st.start : st.end; drawTl(); };
      const up = () => { hd.removeEventListener("pointermove", mv); hd.removeEventListener("pointerup", up); }; hd.addEventListener("pointermove", mv); hd.addEventListener("pointerup", up); });
  }
  dragHandle(hs, "s"); dragHandle(he, "e");

  async function run() {
    runBtn.disabled = true;
    try {
      const frames = []; let w, hh;
      if (images) {
        for (let i = 0; i < images.length; i++) { const b = await loadBitmap(images[i]); if (!w) { w = Math.min(st.width, b.width); hh = Math.round(b.height * w / b.width); } const c = canvas(w, hh); c.getContext("2d").drawImage(b, 0, 0, w, hh); b.close?.(); frames.push(c.getContext("2d").getImageData(0, 0, w, hh).data); prog.set(i / images.length, `프레임 ${i + 1}/${images.length}`); }
      } else {
        w = Math.min(st.width, video.videoWidth); hh = Math.round(video.videoHeight * w / video.videoWidth); if (hh % 2) hh++;
        const n = Math.max(1, Math.round((st.end - st.start) * st.fps)); const c = canvas(w, hh), ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high";
        video.pause();
        for (let i = 0; i < n; i++) { await seekTo(video, st.start + i / st.fps); ctx.drawImage(video, 0, 0, w, hh); frames.push(ctx.getImageData(0, 0, w, hh).data); prog.set(i / n * 0.7, `프레임 ${i + 1}/${n}`); }
      }
      if (st.boom && frames.length > 2) for (let i = frames.length - 2; i > 0; i--) frames.push(frames[i]);
      const gif = GIFEncoder(); const delay = images ? st.delayImg : Math.round(1000 / st.fps);
      for (let i = 0; i < frames.length; i++) {
        const palette = quantize(frames[i], 256, { format: "rgb444" }); const index = applyPalette(frames[i], palette, "rgb444");
        gif.writeFrame(index, w, hh, { palette, delay, repeat: st.loop ? 0 : -1, dispose: 1 });
        if (i % 5 === 0) { prog.set(0.7 + 0.3 * i / frames.length, `인코딩 ${i + 1}/${frames.length}`); await new Promise((r) => setTimeout(r)); }
      }
      gif.finish();
      const blob = new Blob([gif.bytes()], { type: "image/gif" });
      out.replaceChildren(h("img", { src: URL.createObjectURL(blob), alt: "GIF" }));
      outMeta.textContent = `${w}×${hh} · ${frames.length}프레임 · ${(blob.size / 1048576).toFixed(2)} MB`;
      download(blob, `${baseName(file?.name || "slides")}_${w}px.gif`);
      toast("GIF 완료", "ok");
    } catch (e) { toast("실패: " + e.message, "warn"); }
    prog.done(); runBtn.disabled = false;
  }
  const runBtn = button("GIF 만들기", run, "btn primary full"); runBtn.disabled = true;
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, stage, info, tl, labels, out, outMeta, h("p", { class: "help", style: { marginTop: "10px" } }, "핸들을 끌어 구간을 잡는다 (최대 30초). 너비가 클수록·fps 가 높을수록 파일이 급격히 커진다. 공유용은 480px·12fps 가 적당.")),
    h("div", { class: "panel controls" },
      h("div", { class: "row" }, field("fps", num(st.fps, { min: 1, max: 30, onInput: (v) => { st.fps = v; drawTl(); } })), field("너비 px", num(st.width, { min: 32, max: 1920, step: 16, onInput: (v) => st.width = v }))),
      check("부메랑 (A → B → A)", false, (v) => st.boom = v), check("무한 반복", true, (v) => st.loop = v),
      field("이미지 슬라이드 프레임 ms", num(st.delayImg, { min: 50, max: 5000, step: 50, onInput: (v) => st.delayImg = v })),
      runBtn, prog)));
  const ho = handoff.take(); if (ho?.files?.length) dz.accept(ho.files);
  return () => { dz.destroy(); if (video) URL.revokeObjectURL(video.src); };
}
