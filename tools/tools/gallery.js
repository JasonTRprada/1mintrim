// 검수 갤러리 — 로컬 폴더(File System Access) → 썸네일 → 픽/탈락 → 픽만 _picked 로 복사
import { h, button, field, select, num, toast, isImage, isVideo, extOf, fmtBytes, download, handoff, pickDirectory, writeFileTo, check } from "../ui.js";

export function mount(root, ctx) {
  const supported = !!window.showDirectoryPicker;
  let dir = null, items = [], marks = {}, filter = "all", sort = "name", cell = 160, recursive = true, cur = -1;
  const grid = h("div", { class: "gal-grid" });
  const status = h("div", { class: "meta" });
  const io = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) { loadThumb(e.target); io.unobserve(e.target); } }, { rootMargin: "300px" });

  const keyOf = () => `wt.gallery.${dir?.name || "x"}`;
  function loadMarks() { try { marks = JSON.parse(localStorage.getItem(keyOf()) || "{}"); } catch { marks = {}; } }
  function saveMarks() { try { localStorage.setItem(keyOf(), JSON.stringify(marks)); } catch {} }

  async function scan(handle, prefix = "", depth = 0) {
    const out = [];
    for await (const [name, e] of handle.entries()) {
      if (name.startsWith("_picked") || name.startsWith(".")) continue;
      if (e.kind === "file") { if (isImage({ name, type: "" }) || isVideo({ name, type: "" })) out.push({ name, path: prefix + name, handle: e, parent: handle }); }
      else if (recursive && depth < 4) out.push(...await scan(e, prefix + name + "/", depth + 1));
    }
    return out;
  }
  async function open() {
    const d = await pickDirectory("readwrite"); if (!d) return;
    dir = d; loadMarks();
    status.textContent = "폴더 읽는 중…";
    items = await scan(d);
    for (const it of items) { const f = await it.handle.getFile(); it.size = f.size; it.mtime = f.lastModified; it.video = isVideo(f); }
    render(); toast(`${items.length}개 항목`, "ok");
  }
  function visible() {
    let list = items.filter((it) => filter === "all" || (filter === "unmarked" ? !marks[it.path] : marks[it.path] === filter));
    list.sort((a, b) => sort === "name" ? a.path.localeCompare(b.path, "ko", { numeric: true }) : sort === "new" ? b.mtime - a.mtime : a.mtime - b.mtime);
    return list;
  }
  function render() {
    grid.style.setProperty("--cell", cell + "px");
    const list = visible();
    grid.replaceChildren(...list.map((it, i) => {
      const el = h("div", { class: `gal-item ${marks[it.path] || ""}`, "data-path": it.path, tabindex: "0", onclick: () => openLb(i, list), onkeydown: (e) => { if (e.key === "Enter") openLb(i, list); } },
        h("span", { class: "mark" }, marks[it.path] === "pick" ? "✓" : marks[it.path] === "reject" ? "×" : ""),
        it.video ? h("span", { class: "vid" }, "▶ " + extOf(it.name)) : null,
        h("span", { class: "cap" }, it.path));
      el._item = it; io.observe(el); return el;
    }));
    const p = items.filter((i) => marks[i.path] === "pick").length, r = items.filter((i) => marks[i.path] === "reject").length;
    status.textContent = dir ? `${dir.name} · 전체 ${items.length} · 표시 ${list.length} · 픽 ${p} · 탈락 ${r}` : "";
  }
  async function loadThumb(el) {
    const it = el._item; if (!it || el.querySelector("img,video")) return;
    const f = await it.handle.getFile();
    if (it.video) {
      const v = h("video", { muted: true, preload: "metadata", src: URL.createObjectURL(f) });
      v.addEventListener("loadeddata", () => { v.currentTime = Math.min(0.5, v.duration / 2); }, { once: true });
      v.addEventListener("mouseenter", () => v.play().catch(() => {})); v.addEventListener("mouseleave", () => { v.pause(); });
      el.prepend(v);
    } else {
      try { const bmp = await createImageBitmap(f, { resizeWidth: cell * 2, resizeQuality: "medium" }); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0); bmp.close(); el.prepend(c); c.style.cssText = "width:100%;height:100%;object-fit:cover"; }
      catch { el.prepend(h("img", { src: URL.createObjectURL(f), loading: "lazy" })); }
    }
  }
  function setMark(it, m) { if (m) marks[it.path] = m; else delete marks[it.path]; saveMarks(); const el = grid.querySelector(`[data-path="${CSS.escape(it.path)}"]`); if (el) { el.className = `gal-item ${m || ""}`; el.querySelector(".mark").textContent = m === "pick" ? "✓" : m === "reject" ? "×" : ""; } status.textContent = status.textContent.replace(/픽 \d+ · 탈락 \d+/, `픽 ${items.filter((i) => marks[i.path] === "pick").length} · 탈락 ${items.filter((i) => marks[i.path] === "reject").length}`); }

  // ---- 라이트박스 ----
  let lb = null, lbList = [];
  async function openLb(i, list) { lbList = list; cur = i; if (!lb) { lb = buildLb(); document.body.append(lb); } await showLb(); }
  function buildLb() {
    const stage = h("div", { class: "lb-stage" }); const title = h("span"); const markEl = h("span");
    const el = h("div", { class: "lightbox", tabindex: "-1" },
      h("div", { class: "lb-top" }, title, markEl, button("닫기 (Esc)", closeLb)),
      stage,
      h("div", { class: "lb-bottom" }, button("✓ 픽 (P)", () => mark("pick")), button("× 탈락 (X)", () => mark("reject")), button("표시 해제 (0)", () => mark(null)), button("편집으로 보내기 (E)", sendEdit), button("이 파일 다운로드", dl)),
      h("button", { class: "nav-arrow l", type: "button", onclick: () => step(-1) }, "‹"), h("button", { class: "nav-arrow r", type: "button", onclick: () => step(1) }, "›"));
    el._stage = stage; el._title = title; el._mark = markEl; return el;
  }
  async function showLb() {
    const it = lbList[cur]; if (!it) return closeLb();
    const f = await it.handle.getFile(); const url = URL.createObjectURL(f);
    lb._stage.replaceChildren(it.video ? h("video", { src: url, controls: true, autoplay: true, loop: true, muted: true }) : h("img", { src: url, alt: it.name }));
    lb._title.textContent = `${cur + 1}/${lbList.length} · ${it.path} · ${fmtBytes(it.size)}`;
    lb._mark.textContent = marks[it.path] === "pick" ? "✓ 픽" : marks[it.path] === "reject" ? "× 탈락" : "";
    lb.focus();
  }
  function step(d) { cur = (cur + d + lbList.length) % lbList.length; showLb(); }
  function mark(m) { const it = lbList[cur]; setMark(it, m); lb._mark.textContent = m === "pick" ? "✓ 픽" : m === "reject" ? "× 탈락" : ""; if (m) step(1); }
  function closeLb() { lb?.remove(); lb = null; }
  async function sendEdit() { const it = lbList[cur]; const f = await it.handle.getFile(); handoff.put([f], "gallery"); closeLb(); ctx.go(it.video ? "frames" : "edit"); }
  async function dl() { const it = lbList[cur]; download(await it.handle.getFile(), it.name); }
  const onKey = (e) => {
    if (!lb) return;
    if (e.key === "Escape") closeLb(); else if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1);
    else if (e.key.toLowerCase() === "p") mark("pick"); else if (e.key.toLowerCase() === "x") mark("reject"); else if (e.key === "0") mark(null); else if (e.key.toLowerCase() === "e") sendEdit();
  };
  document.addEventListener("keydown", onKey);

  async function copyPicks() {
    if (!dir) return;
    const picks = items.filter((i) => marks[i.path] === "pick"); if (!picks.length) return toast("픽이 없습니다", "warn");
    const out = await dir.getDirectoryHandle("_picked", { create: true });
    let n = 0;
    for (const it of picks) { await writeFileTo(out, it.path.replace(/\//g, "__"), await it.handle.getFile()); n++; status.textContent = `복사 ${n}/${picks.length}`; }
    toast(`_picked 로 ${n}개 복사 완료`, "ok"); render();
  }
  function exportList() {
    const lines = items.filter((i) => marks[i.path]).map((i) => `${marks[i.path]}\t${i.path}`);
    download(new Blob([lines.join("\n")], { type: "text/plain" }), `${dir?.name || "gallery"}_marks.txt`);
  }
  async function saveMarksToFolder() { if (!dir) return; await writeFileTo(dir, "_marks.json", new Blob([JSON.stringify({ dir: dir.name, at: new Date().toISOString(), marks }, null, 2)], { type: "application/json" })); toast("_marks.json 저장", "ok"); }

  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" },
      supported ? null : h("p", { class: "help", style: { color: "#a2632a" } }, "이 브라우저는 폴더 열기(File System Access)를 지원하지 않는다. Chrome · Edge 에서 열어라."),
      h("div", { class: "row", style: { marginBottom: "12px" } }, button("폴더 열기", open, "btn primary"), status),
      grid,
      h("p", { class: "help", style: { marginTop: "14px" } }, "썸네일 클릭 → 큰 화면. ", h("kbd", {}, "←"), h("kbd", {}, "→"), " 이동 · ", h("kbd", {}, "P"), " 픽 · ", h("kbd", {}, "X"), " 탈락 · ", h("kbd", {}, "0"), " 해제 · ", h("kbd", {}, "E"), " 편집으로 · ", h("kbd", {}, "Esc"), " 닫기. 표시는 이 브라우저(localStorage)에 폴더 이름 단위로 남는다.")),
    h("div", { class: "panel controls" },
      field("필터", select([["all", "전체"], ["unmarked", "미표시"], ["pick", "픽만"], ["reject", "탈락만"]], filter, (v) => { filter = v; render(); })),
      field("정렬", select([["name", "이름"], ["new", "최신 먼저"], ["old", "오래된 먼저"]], sort, (v) => { sort = v; render(); })),
      field("썸네일 px", num(cell, { min: 80, max: 480, step: 20, onInput: (v) => { cell = v; render(); } })),
      check("하위 폴더 포함 (4단계)", true, (v) => recursive = v),
      button("픽만 _picked 폴더로 복사", copyPicks, "btn primary full"),
      button("표시 목록 .txt", exportList), button("표시를 폴더에 _marks.json 으로", saveMarksToFolder),
      button("이 폴더 표시 전부 지우기", () => { if (confirm("표시를 전부 지울까?")) { marks = {}; saveMarks(); render(); } }, "btn danger"))));
  return () => { document.removeEventListener("keydown", onKey); closeLb(); io.disconnect(); };
}
