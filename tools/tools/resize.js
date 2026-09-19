import { h, dropzone, fileList, loadBitmap, canvas, toBlob, deliver, field, select, num, button, progress, baseName, isImage, mimeOf, toast, check } from "../ui.js";

const PRESETS = [
  ["1920x1088", "1920×1088 (i2v 기본)"], ["1280x720", "1280×720"], ["1376x768", "1376×768 (H3 1차)"],
  ["1024x1024", "1024×1024"], ["832x480", "832×480"], ["1MP", "1MP · 비율 유지 · 16 배수"], ["custom", "직접 입력"],
];

export function mount(root) {
  let files = [];
  const st = { preset: "1920x1088", w: 1920, h: 1088, mode: "cover", fmt: "png", q: 0.92, bg: "#000000", suffix: true };
  const list = h("div");
  const prog = progress();
  const wEl = num(st.w, { min: 16, max: 8192, onInput: (v) => { st.w = v; st.preset = "custom"; sync(); } });
  const hEl = num(st.h, { min: 16, max: 8192, onInput: (v) => { st.h = v; st.preset = "custom"; sync(); } });
  const presetEl = select(PRESETS, st.preset, (v) => { st.preset = v; if (/^\d+x\d+$/.test(v)) { [st.w, st.h] = v.split("x").map(Number); } sync(); });
  const custom = h("div", { class: "row" }, field("가로", wEl), field("세로", hEl));
  const dz = dropzone({ accept: "image/*", hint: "PNG · JPG · WEBP, 여러 장 가능", onFiles: (fs) => { files = files.concat(fs.filter(isImage)); render(); } });

  function sync() {
    presetEl.value = st.preset;
    custom.classList.toggle("hidden", st.preset === "1MP");
    wEl.value = st.w; hEl.value = st.h;
  }
  function render() {
    list.replaceChildren(fileList(files, { onRemove: (i) => { files.splice(i, 1); render(); } }));
    runBtn.disabled = !files.length;
  }
  // 1MP: 면적 ≈ 1,048,576 을 비율 유지로, 16 배수 내림
  function targetFor(sw, sh) {
    if (st.preset !== "1MP") return [st.w, st.h];
    const s = Math.sqrt(1048576 / (sw * sh));
    return [Math.max(16, Math.floor(sw * s / 16) * 16), Math.max(16, Math.floor(sh * s / 16) * 16)];
  }
  async function run() {
    const out = [];
    for (let i = 0; i < files.length; i++) {
      prog.set(i / files.length, `${i + 1}/${files.length} ${files[i].name}`);
      const bmp = await loadBitmap(files[i]);
      const [tw, th] = targetFor(bmp.width, bmp.height);
      const c = canvas(tw, th), ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      if (st.mode === "stretch" || st.preset === "1MP") ctx.drawImage(bmp, 0, 0, tw, th);
      else {
        const sr = bmp.width / bmp.height, tr = tw / th;
        if (st.mode === "cover") {
          let sw = bmp.width, sh = bmp.height;
          if (sr > tr) sw = Math.round(bmp.height * tr); else sh = Math.round(bmp.width / tr);
          ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, tw, th);
        } else { // contain + pad
          ctx.fillStyle = st.bg; ctx.fillRect(0, 0, tw, th);
          let dw = tw, dh = th;
          if (sr > tr) dh = Math.round(tw / sr); else dw = Math.round(th * sr);
          ctx.drawImage(bmp, (tw - dw) / 2, (th - dh) / 2, dw, dh);
        }
      }
      bmp.close?.();
      const blob = await toBlob(c, mimeOf(st.fmt), st.q);
      out.push({ blob, name: `${baseName(files[i].name)}${st.suffix ? `_${tw}x${th}` : ""}.${st.fmt}` });
    }
    prog.done();
    await deliver(out, `resize_${st.preset === "1MP" ? "1MP" : `${st.w}x${st.h}`}.zip`);
    toast(`${out.length}장 완료`, "ok");
  }
  const runBtn = button("리사이즈 → 다운로드", run, "btn primary full"); runBtn.disabled = true;

  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, list, h("p", { class: "help", style: { marginTop: "12px" } }, "「덮기」는 비율 맞춰 가운데 크롭, 「채우기」는 비율 유지 + 여백색, 「늘리기」는 비율 무시. 키프레임은 원본에서 바로 목표 해상도로 한 번만 리사이즈하는 게 정본이다.")),
    h("div", { class: "panel controls" },
      field("프리셋", presetEl), custom,
      field("맞춤 방식", select([["cover", "덮기 (가운데 크롭)"], ["contain", "채우기 (여백)"], ["stretch", "늘리기"]], st.mode, (v) => st.mode = v)),
      field("여백색 (채우기)", h("input", { type: "color", value: st.bg, oninput: (e) => st.bg = e.target.value })),
      field("저장 형식", select([["png", "PNG"], ["jpg", "JPG"], ["webp", "WEBP"]], st.fmt, (v) => st.fmt = v)),
      field("품질 (JPG/WEBP)", num(92, { min: 50, max: 100, onInput: (v) => st.q = v / 100 })),
      check("파일명에 _가로x세로 붙이기", true, (v) => st.suffix = v),
      runBtn, prog)));
  sync();
  return () => dz.destroy();
}
