(() => {
  const MAX_SOURCE_SIZE = 300 * 1024 * 1024; // 300MB
  const MAX_CLIP_DURATION = 60;  // seconds per clip
  const MAX_OUTPUT_DURATION = 300; // seconds total sequence (5 min)
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
  const btnAddClip = document.getElementById("btn-add-clip");
  const btnReset = document.getElementById("btn-reset");
  const statusEl = document.getElementById("status");
  const progressWrap = document.getElementById("progress-wrap");
  const progressBar = document.getElementById("progress-bar");
  const errorBox = document.getElementById("error-box");

  const sequencePanel = document.getElementById("sequence-panel");
  const sequenceTrack = document.getElementById("sequence-track");
  const sequenceTotal = document.getElementById("sequence-total");
  const sequenceList = document.getElementById("sequence-list");
  const btnAddMore = document.getElementById("btn-add-more");
  const btnExportFinal = document.getElementById("btn-export-final");
  const btnClearSequence = document.getElementById("btn-clear-sequence");

  let videoDuration = 0;
  let trimStart = 0;
  let trimEnd = 0;
  let currentFile = null;
  let ffmpeg = null;
  let ffmpegLoaded = false;
  let sequence = []; // { file, start, end, duration }
  let seqIdCounter = 0;

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

  function sequenceTotalDuration() {
    return sequence.reduce((sum, c) => sum + c.duration, 0);
  }

  function renderSequence() {
    const total = sequenceTotalDuration();
    sequenceTotal.textContent = `총 ${fmtTime(total)} / ${MAX_OUTPUT_DURATION}s`;

    sequenceTrack.innerHTML = "";
    sequence.forEach((clip, i) => {
      const block = document.createElement("div");
      block.className = "sequence-block";
      block.style.width = Math.max(2, (clip.duration / MAX_OUTPUT_DURATION) * 100) + "%";
      block.textContent = i + 1;
      sequenceTrack.appendChild(block);
    });

    sequenceList.innerHTML = "";
    sequence.forEach((clip) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${clip.file.name} — ${fmtTime(clip.duration)}`;
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "삭제";
      removeBtn.addEventListener("click", () => {
        sequence = sequence.filter((c) => c.id !== clip.id);
        renderSequence();
      });
      li.appendChild(label);
      li.appendChild(removeBtn);
      sequenceList.appendChild(li);
    });

    sequencePanel.classList.toggle("hidden", sequence.length === 0);
    btnExportFinal.disabled = sequence.length === 0;
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
    labelDuration.textContent = "구간: " + fmtTime(trimEnd - trimStart);
  }

  function handleFile(file) {
    clearError();
    if (!file.type.startsWith("video/")) {
      showError("영상 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_SOURCE_SIZE) {
      showError(`파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 최대 300MB까지만 지원합니다.`);
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
      currentFile = file;
      videoDuration = duration;
      trimStart = 0;
      trimEnd = duration;
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
  btnAddMore.addEventListener("click", resetUI);

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
    } else {
      trimEnd = Math.max(t, trimStart + 0.1);
      trimEnd = Math.min(videoDuration, trimEnd);
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

  // Keyboard accessibility
  function handleKeydown(handle, e) {
    const step = 0.5;
    if (e.key === "ArrowLeft") {
      activeHandle = handle;
      onDragMove(
        timeline.getBoundingClientRect().left +
          ((handle === handleStart ? trimStart : trimEnd) - step) /
            videoDuration *
            timeline.getBoundingClientRect().width
      );
      activeHandle = null;
    } else if (e.key === "ArrowRight") {
      activeHandle = handle;
      onDragMove(
        timeline.getBoundingClientRect().left +
          ((handle === handleStart ? trimStart : trimEnd) + step) /
            videoDuration *
            timeline.getBoundingClientRect().width
      );
      activeHandle = null;
    }
  }
  handleStart.addEventListener("keydown", (e) => handleKeydown(handleStart, e));
  handleEnd.addEventListener("keydown", (e) => handleKeydown(handleEnd, e));

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

  function addCurrentClipToSequence() {
    if (!currentFile) return;
    clearError();
    const duration = trimEnd - trimStart;
    if (duration > MAX_CLIP_DURATION + 0.05) {
      showError(`한 구간은 최대 ${MAX_CLIP_DURATION}초까지만 선택할 수 있습니다. (현재 ${fmtTime(duration)})`);
      return;
    }
    const projectedTotal = sequenceTotalDuration() + duration;
    if (projectedTotal > MAX_OUTPUT_DURATION + 0.05) {
      showError(
        `시퀀스 총 길이가 5분을 넘을 수 없습니다. (현재 ${fmtTime(sequenceTotalDuration())} + 이 구간 ${fmtTime(duration)})`
      );
      return;
    }
    sequence.push({
      id: ++seqIdCounter,
      file: currentFile,
      start: trimStart,
      end: trimEnd,
      duration,
    });
    renderSequence();
    resetUI();
  }

  btnClearSequence.addEventListener("click", () => {
    sequence = [];
    renderSequence();
  });

  async function exportSequence() {
    if (sequence.length === 0) return;
    btnExportFinal.disabled = true;
    clearError();
    try {
      await loadFFmpeg();
      progressWrap.classList.remove("hidden");
      progressBar.style.width = "0%";

      const segmentNames = [];

      if (sequence.length === 1) {
        const clip = sequence[0];
        const inputName = "input0" + getExt(clip.file.name);
        await ffmpeg.writeFile(inputName, await FFmpegUtil.fetchFile(clip.file));
        const start = clip.start.toFixed(3);
        const duration = (clip.end - clip.start).toFixed(3);
        const outputName = "final.mp4";

        setStatus("무손실 트림 시도 중...");
        let success = await tryCopyTrim(inputName, outputName, start, duration);
        if (!success) {
          setStatus("정밀 트림을 위해 재인코딩 중... (시간이 더 걸릴 수 있어요)");
          await ffmpeg.deleteFile(outputName).catch(() => {});
          success = await tryReencodeTrim(inputName, outputName, start, duration);
        }
        if (!success) {
          showError("트림 처리에 실패했습니다. 다른 영상으로 다시 시도해주세요.");
          setStatus("");
          return;
        }
        await downloadResult(outputName);
        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});
      } else {
        for (let i = 0; i < sequence.length; i++) {
          const clip = sequence[i];
          const inputName = `input${i}` + getExt(clip.file.name);
          const segName = `seg${i}.mp4`;
          setStatus(`구간 ${i + 1}/${sequence.length} 처리 중... (재인코딩)`);
          await ffmpeg.writeFile(inputName, await FFmpegUtil.fetchFile(clip.file));
          const start = clip.start.toFixed(3);
          const duration = (clip.end - clip.start).toFixed(3);
          const success = await tryReencodeTrim(inputName, segName, start, duration);
          if (!success) {
            showError(`구간 ${i + 1}을 처리하는 중 오류가 발생했습니다.`);
            setStatus("");
            return;
          }
          segmentNames.push(segName);
          await ffmpeg.deleteFile(inputName).catch(() => {});
        }

        setStatus("구간들을 이어붙이는 중...");
        const listContent = segmentNames.map((n) => `file '${n}'`).join("\n");
        await ffmpeg.writeFile("concat_list.txt", new TextEncoder().encode(listContent));
        await ffmpeg.exec([
          "-f", "concat",
          "-safe", "0",
          "-i", "concat_list.txt",
          "-c", "copy",
          "final.mp4",
        ]);

        await downloadResult("final.mp4");

        await ffmpeg.deleteFile("concat_list.txt").catch(() => {});
        for (const n of segmentNames) await ffmpeg.deleteFile(n).catch(() => {});
        await ffmpeg.deleteFile("final.mp4").catch(() => {});
      }

      setStatus("완료! 다운로드가 시작됐습니다.");
      progressWrap.classList.add("hidden");
      sequence = [];
      renderSequence();
    } catch (err) {
      console.error(err);
      showError("처리 중 오류가 발생했습니다: " + (err.message || err));
      setStatus("");
    } finally {
      btnExportFinal.disabled = sequence.length === 0;
    }
  }

  async function downloadResult(outputName) {
    setStatus("다운로드 준비 중...");
    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trimmed.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function tryCopyTrim(inputName, outputName, start, duration) {
    try {
      await ffmpeg.exec([
        "-ss", start,
        "-i", inputName,
        "-t", duration,
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        outputName,
      ]);
      const data = await ffmpeg.readFile(outputName);
      return data && data.length > 0;
    } catch (e) {
      return false;
    }
  }

  async function tryReencodeTrim(inputName, outputName, start, duration) {
    try {
      await ffmpeg.exec([
        "-ss", start,
        "-i", inputName,
        "-t", duration,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-c:a", "aac",
        outputName,
      ]);
      const data = await ffmpeg.readFile(outputName);
      return data && data.length > 0;
    } catch (e) {
      return false;
    }
  }

  function getExt(filename) {
    const m = filename.match(/\.[0-9a-z]+$/i);
    return m ? m[0] : ".mp4";
  }

  btnAddClip.addEventListener("click", addCurrentClipToSequence);
  btnExportFinal.addEventListener("click", exportSequence);
})();
