(() => {
  const MAX_SOURCE_DURATION = 60; // seconds
  const MAX_SOURCE_SIZE = 30 * 1024 * 1024; // 30MB
  const CORE_VERSION = "0.12.6";

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const editor = document.getElementById("editor");
  const preview = document.getElementById("preview");
  const btnExtract = document.getElementById("btn-extract");
  const btnReset = document.getElementById("btn-reset");
  const statusEl = document.getElementById("status");
  const progressWrap = document.getElementById("progress-wrap");
  const progressBar = document.getElementById("progress-bar");
  const errorBox = document.getElementById("error-box");

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
      preview.src = url;
      dropZone.classList.add("hidden");
      editor.classList.remove("hidden");
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

  async function extractAudio() {
    if (!currentFile) return;
    btnExtract.disabled = true;
    clearError();
    try {
      await loadFFmpeg();
      progressWrap.classList.remove("hidden");
      progressBar.style.width = "0%";

      const format = document.querySelector('input[name="format"]:checked').value;
      const inputName = "input" + getExt(currentFile.name);
      const outputName = "output." + format;

      setStatus("오디오를 추출하는 중...");
      await ffmpeg.writeFile(inputName, await FFmpegUtil.fetchFile(currentFile));

      const args = format === "mp3"
        ? ["-i", inputName, "-vn", "-c:a", "libmp3lame", "-q:a", "2", outputName]
        : ["-i", inputName, "-vn", "-c:a", "pcm_s16le", outputName];

      await ffmpeg.exec(args);

      setStatus("다운로드 준비 중...");
      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data.buffer], { type: format === "mp3" ? "audio/mpeg" : "audio/wav" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audio." + format;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});

      setStatus("완료! 다운로드가 시작됐습니다.");
      progressWrap.classList.add("hidden");
    } catch (err) {
      console.error(err);
      showError("추출 중 오류가 발생했습니다: " + (err.message || err));
      setStatus("");
    } finally {
      btnExtract.disabled = false;
    }
  }

  btnExtract.addEventListener("click", extractAudio);
})();
