(() => {
  const MAX_SOURCE_DURATION = 60; // seconds
  const MAX_SOURCE_SIZE = 30 * 1024 * 1024; // 30MB
  const MAX_GIF_DURATION = 10; // seconds
  const CORE_VERSION = "0.12.6";

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const editor = document.getElementById("editor");
  const preview = document.getElementById("preview");
  const timeline = document.getElementById("timeline");
  const trackFill = document.getElementById("track-fill");
  const handleStart = document.getElementById("handle-start");
  const handleEnd = document.getElementById("handle-end");
  const labelStart = document.getElementById("label-start");
  const labelEnd = document.getElementById("label-end");
  const labelDuration = document.getElementById("label-duration");
  const btnConvert = document.getElementById("btn-convert");
  const btnReset = document.getElementById("btn-reset");
  const statusEl = document.getElementById("status");
  const progressWrap = document.getElementById("progress-wrap");
  const progressBar = document.getElementById("progress-bar");
  const errorBox = document.getElementById("error-box");

  let videoDuration = 0;
  let trimStart = 0;
  let trimEnd = 0;
  let currentFile = null;
  let ffmpeg = null;
  let ffmpegLoaded = false;

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  }

  function clearError() {
    errorBox.classList.add("hidden");
    errorBox.textContent = "";
  }

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function fmtTime(s) {
    return s.toFixed(1) + "s";
  }

  function resetUI() {
    editor.classList.add("hidden");
    dropZone.classList.remove("hidden");
    fileInput.value = "";
    preview.src = "";
    currentFile = null;
    clearError();
    setStatus("");
    progressWrap.classList.add("hidden");
    progressBar.style.width = "0%";
  }

  function updateTimelineUI() {
    const startPct = (trimStart / videoDuration) * 100;
    const endPct = (trimEnd / videoDuration) * 100;
    handleStart.style.left = startPct + "%";
    handleEnd.style.left = endPct + "%";
    trackFill.style.left = startPct + "%";
    trackFill.style.width = (endPct - startPct) + "%";
    labelStart.textContent = fmtTime(trimStart);
    labelEnd.textContent = fmtTime(trimEnd);
    labelDuration.textContent = `구간: ${fmtTime(trimEnd - trimStart)} (최대 ${MAX_GIF_DURATION}.0s)`;
  }

  function handleFile(file) {
    clearError();
    if (!file.type.startsWith("video/")) {
      showError("영상 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_SOURCE_SIZE) {
      showError(`파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 최대 30MB까지만 지원합니다.`);
      return;
    }
    const url = URL.createObjectURL(file);
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      const duration = tempVideo.duration;
      if (!isFinite(duration) || duration <= 0) {
        showError("영상 길이를 읽을 수 없습니다. 다른 파일을 시도해주세요.");
        URL.revokeObjectURL(url);
        return;
      }
      if (duration > MAX_SOURCE_DURATION) {
        showError(`영상이 너무 길어요 (${duration.toFixed(1)}초). 최대 ${MAX_SOURCE_DURATION}초까지만 지원합니다.`);
        URL.revokeObjectURL(url);
        return;
      }
      currentFile = file;
      videoDuration = duration;
      trimStart = 0;
      trimEnd = Math.min(duration, MAX_GIF_DURATION);
      preview.src = url;
      dropZone.classList.add("hidden");
      editor.classList.remove("hidden");
      updateTimelineUI();
    };
    tempVideo.onerror = () => {
      showError("영상을 불러올 수 없습니다. 지원하지 않는 형식일 수 있습니다.");
      URL.revokeObjectURL(url);
    };
  }

  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  ["dragenter", "dragover"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    })
  );
  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  btnReset.addEventListener("click", resetUI);

  // Drag handles
  let activeHandle = null;

  function posToTime(clientX) {
    const rect = timeline.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return pct * videoDuration;
  }

  function startDrag(handle) {
    activeHandle = handle;
  }

  function onDragMove(clientX) {
    if (!activeHandle) return;
    const t = posToTime(clientX);
    if (activeHandle === handleStart) {
      trimStart = Math.min(t, trimEnd - 0.1);
      trimStart = Math.max(0, trimStart);
      trimStart = Math.max(trimStart, trimEnd - MAX_GIF_DURATION);
    } else {
      trimEnd = Math.max(t, trimStart + 0.1);
      trimEnd = Math.min(videoDuration, trimEnd);
      trimEnd = Math.min(trimEnd, trimStart + MAX_GIF_DURATION);
    }
    updateTimelineUI();
    preview.pause();
    preview.currentTime = activeHandle === handleStart ? trimStart : trimEnd;
  }

  function endDrag() {
    activeHandle = null;
  }

  handleStart.addEventListener("mousedown", () => startDrag(handleStart));
  handleEnd.addEventListener("mousedown", () => startDrag(handleEnd));
  window.addEventListener("mousemove", (e) => onDragMove(e.clientX));
  window.addEventListener("mouseup", endDrag);

  handleStart.addEventListener("touchstart", () => startDrag(handleStart));
  handleEnd.addEventListener("touchstart", () => startDrag(handleEnd));
  window.addEventListener("touchmove", (e) => {
    if (activeHandle && e.touches[0]) onDragMove(e.touches[0].clientX);
  });
  window.addEventListener("touchend", endDrag);

  // FFmpeg
  async function loadFFmpeg() {
    if (ffmpegLoaded) return;
    setStatus("처리 엔진을 불러오는 중...");
    const { FFmpeg } = FFmpegWASM;
    ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      progressWrap.classList.remove("hidden");
      progressBar.style.width = Math.min(100, Math.round(progress * 100)) + "%";
    });
    const cdnBaseURL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
    await ffmpeg.load({
      coreURL: await FFmpegUtil.toBlobURL("vendor/core/ffmpeg-core.js", "text/javascript"),
      wasmURL: await FFmpegUtil.toBlobURL(`${cdnBaseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegLoaded = true;
  }

  function getExt(filename) {
    const m = filename.match(/\.[0-9a-z]+$/i);
    return m ? m[0] : ".mp4";
  }

  async function convertToGif() {
    if (!currentFile) return;
    btnConvert.disabled = true;
    clearError();
    try {
      await loadFFmpeg();
      progressWrap.classList.remove("hidden");
      progressBar.style.width = "0%";

      const direction = document.querySelector('input[name="direction"]:checked').value;
      const inputName = "input" + getExt(currentFile.name);
      const start = trimStart.toFixed(3);
      const duration = (trimEnd - trimStart).toFixed(3);

      setStatus("구간을 자르는 중...");
      await ffmpeg.writeFile(inputName, await FFmpegUtil.fetchFile(currentFile));

      const segName = "seg.mp4";
      await ffmpeg.exec([
        "-ss", start,
        "-i", inputName,
        "-t", duration,
        "-an",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        segName,
      ]);

      let gifSourceName = segName;

      if (direction === "boomerang") {
        setStatus("부메랑 효과 적용 중...");
        await ffmpeg.exec(["-i", segName, "-vf", "reverse", "-preset", "ultrafast", "rev.mp4"]);
        await ffmpeg.writeFile(
          "concat_list.txt",
          new TextEncoder().encode(`file '${segName}'\nfile 'rev.mp4'\n`)
        );
        await ffmpeg.exec([
          "-f", "concat",
          "-safe", "0",
          "-i", "concat_list.txt",
          "-c", "copy",
          "boomerang.mp4",
        ]);
        gifSourceName = "boomerang.mp4";
      }

      setStatus("GIF로 변환 중...");
      await ffmpeg.exec([
        "-i", gifSourceName,
        "-vf", "fps=12,scale=480:-1:flags=lanczos",
        "output.gif",
      ]);

      setStatus("다운로드 준비 중...");
      const data = await ffmpeg.readFile("output.gif");
      const blob = new Blob([data.buffer], { type: "image/gif" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "output.gif";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      for (const n of [inputName, segName, "rev.mp4", "concat_list.txt", "boomerang.mp4", "output.gif"]) {
        await ffmpeg.deleteFile(n).catch(() => {});
      }

      setStatus("완료! 다운로드가 시작됐습니다.");
      progressWrap.classList.add("hidden");
    } catch (err) {
      console.error(err);
      showError("변환 중 오류가 발생했습니다: " + (err.message || err));
      setStatus("");
    } finally {
      btnConvert.disabled = false;
    }
  }

  btnConvert.addEventListener("click", convertToGif);
})();
