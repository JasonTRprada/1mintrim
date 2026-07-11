(() => {
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const ICON_SIZES = [16, 32, 48, 64, 128, 256];

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const editor = document.getElementById("editor");
  const previewImg = document.getElementById("preview-img");
  const cropContainer = document.getElementById("crop-container");
  const cropBox = document.getElementById("crop-box");
  const cropResize = document.getElementById("crop-resize");
  const btnConvert = document.getElementById("btn-convert");
  const btnReset = document.getElementById("btn-reset");
  const statusEl = document.getElementById("status");
  const errorBox = document.getElementById("error-box");

  let currentImage = null;
  let crop = { x: 0, y: 0, size: 0 }; // in displayed CSS pixels, relative to container
  const MIN_CROP = 24;

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
    previewImg.src = "";
    currentImage = null;
    clearError();
    setStatus("");
  }

  function handleFile(file) {
    clearError();
    if (!file.type.startsWith("image/")) {
      showError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_SIZE) {
      showError(`파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 최대 5MB까지만 지원합니다.`);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      currentImage = img;
      previewImg.src = url;
      dropZone.classList.add("hidden");
      editor.classList.remove("hidden");
      initCropBox();
    };
    img.onerror = () => {
      showError("이미지를 불러올 수 없습니다. 다른 파일을 시도해주세요.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function initCropBox() {
    const w = previewImg.clientWidth;
    const h = previewImg.clientHeight;
    const size = Math.min(w, h);
    crop = { x: (w - size) / 2, y: (h - size) / 2, size };
    renderCropBox();
  }

  function renderCropBox() {
    cropBox.style.left = crop.x + "px";
    cropBox.style.top = crop.y + "px";
    cropBox.style.width = crop.size + "px";
    cropBox.style.height = crop.size + "px";
  }

  function clampCrop() {
    const w = previewImg.clientWidth;
    const h = previewImg.clientHeight;
    crop.size = Math.max(MIN_CROP, Math.min(crop.size, Math.min(w, h)));
    crop.x = Math.max(0, Math.min(crop.x, w - crop.size));
    crop.y = Math.max(0, Math.min(crop.y, h - crop.size));
  }

  let dragMode = null; // "move" | "resize"
  let dragStart = null;

  function pointerPos(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }

  cropBox.addEventListener("mousedown", (e) => {
    if (e.target === cropResize) return;
    dragMode = "move";
    const p = pointerPos(e);
    dragStart = { x: p.x, y: p.y, cropX: crop.x, cropY: crop.y };
  });
  cropResize.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    dragMode = "resize";
    const p = pointerPos(e);
    dragStart = { x: p.x, y: p.y, size: crop.size };
  });
  cropBox.addEventListener("touchstart", (e) => {
    if (e.target === cropResize) return;
    dragMode = "move";
    const p = pointerPos(e);
    dragStart = { x: p.x, y: p.y, cropX: crop.x, cropY: crop.y };
  });
  cropResize.addEventListener("touchstart", (e) => {
    e.stopPropagation();
    dragMode = "resize";
    const p = pointerPos(e);
    dragStart = { x: p.x, y: p.y, size: crop.size };
  });

  function onPointerMove(e) {
    if (!dragMode) return;
    const p = pointerPos(e);
    const dx = p.x - dragStart.x;
    const dy = p.y - dragStart.y;
    if (dragMode === "move") {
      crop.x = dragStart.cropX + dx;
      crop.y = dragStart.cropY + dy;
    } else if (dragMode === "resize") {
      crop.size = dragStart.size + Math.max(dx, dy);
    }
    clampCrop();
    renderCropBox();
  }

  function onPointerUp() {
    dragMode = null;
  }

  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
  window.addEventListener("touchmove", (e) => {
    if (dragMode) onPointerMove(e);
  });
  window.addEventListener("touchend", onPointerUp);

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

  function canvasToPngBuffer(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      }, "image/png");
    });
  }

  async function buildIco(image) {
    const scale = image.naturalWidth / previewImg.clientWidth;
    const sx = crop.x * scale;
    const sy = crop.y * scale;
    const sSize = crop.size * scale;

    const pngBuffers = [];
    for (const size of ICON_SIZES) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, sx, sy, sSize, sSize, 0, 0, size, size);
      const buf = await canvasToPngBuffer(canvas);
      pngBuffers.push({ size, buf });
    }

    const headerSize = 6;
    const dirEntrySize = 16;
    const dirSize = dirEntrySize * pngBuffers.length;
    let totalSize = headerSize + dirSize;
    for (const { buf } of pngBuffers) totalSize += buf.length;

    const out = new Uint8Array(totalSize);
    const view = new DataView(out.buffer);

    view.setUint16(0, 0, true); // reserved
    view.setUint16(2, 1, true); // type: icon
    view.setUint16(4, pngBuffers.length, true); // image count

    let dataOffset = headerSize + dirSize;
    let dirPos = headerSize;
    for (const { size, buf } of pngBuffers) {
      const dim = size === 256 ? 0 : size; // 256 is encoded as 0
      out[dirPos] = dim; // width
      out[dirPos + 1] = dim; // height
      out[dirPos + 2] = 0; // color palette
      out[dirPos + 3] = 0; // reserved
      view.setUint16(dirPos + 4, 1, true); // color planes
      view.setUint16(dirPos + 6, 32, true); // bits per pixel
      view.setUint32(dirPos + 8, buf.length, true); // size of image data
      view.setUint32(dirPos + 12, dataOffset, true); // offset of image data
      out.set(buf, dataOffset);
      dataOffset += buf.length;
      dirPos += dirEntrySize;
    }

    return out;
  }

  async function convertToIco() {
    if (!currentImage) return;
    btnConvert.disabled = true;
    clearError();
    try {
      setStatus("아이콘 생성 중...");
      const icoData = await buildIco(currentImage);
      const blob = new Blob([icoData], { type: "image/x-icon" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "favicon.ico";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("완료! 다운로드가 시작됐습니다.");
    } catch (err) {
      console.error(err);
      showError("변환 중 오류가 발생했습니다: " + (err.message || err));
      setStatus("");
    } finally {
      btnConvert.disabled = false;
    }
  }

  btnConvert.addEventListener("click", convertToIco);
})();
