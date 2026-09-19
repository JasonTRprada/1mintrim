// 파일명 일괄 변경 — 패턴 · 번호 · 찾기/바꾸기 → ZIP
import { h, dropzone, field, select, num, button, progress, Zip, download, baseName, extOf, toast, check } from "../ui.js";

export function mount(root) {
  let files = [];
  const st = { pattern: "{name}", start: 1, pad: 3, find: "", replace: "", regex: false, lower: false, sortBy: "name", step: 1 };
  const tbody = h("tbody"); const prog = progress();
  const dz = dropzone({ accept: "*", hint: "어떤 파일이든. 결과는 ZIP 한 개", onFiles: (fs) => { files = files.concat(fs); preview(); } });
  const date = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; };
  function sorted() { const a = [...files]; if (st.sortBy === "name") a.sort((x, y) => x.name.localeCompare(y.name, "ko", { numeric: true })); else if (st.sortBy === "date") a.sort((x, y) => x.lastModified - y.lastModified); else if (st.sortBy === "size") a.sort((x, y) => x.size - y.size); return a; }
  function newName(f, i) {
    let name = baseName(f.name);
    if (st.find) { if (st.regex) { try { name = name.replace(new RegExp(st.find, "g"), st.replace); } catch { /* 잘못된 정규식 */ } } else name = name.split(st.find).join(st.replace); }
    const n = String(st.start + i * st.step).padStart(st.pad, "0");
    let out = st.pattern.replace(/\{name\}/g, name).replace(/\{n\}/g, n).replace(/\{i\}/g, String(i + 1)).replace(/\{date\}/g, date()).replace(/\{ext\}/g, extOf(f.name));
    if (st.lower) out = out.toLowerCase();
    out = out.replace(/[\\/:*?"<>|]/g, "_").trim() || `file_${n}`;
    return extOf(f.name) && !/\{ext\}/.test(st.pattern) ? `${out}.${extOf(f.name)}` : out;
  }
  function preview() {
    const list = sorted(); const seen = new Set();
    tbody.replaceChildren(...list.map((f, i) => { const nn = newName(f, i); const dup = seen.has(nn); seen.add(nn); return h("tr", {}, h("td", {}, f.name), h("td", {}, "→"), h("td", { style: dup ? { color: "#c0392b" } : {} }, nn, dup ? " (중복!)" : "")); }));
    runBtn.disabled = !files.length;
  }
  async function run() {
    const list = sorted(); const z = new Zip(); const seen = new Map();
    for (let i = 0; i < list.length; i++) { let nn = newName(list[i], i); if (seen.has(nn)) { const k = seen.get(nn) + 1; seen.set(nn, k); nn = nn.replace(/(\.[^.]+)?$/, `_${k}$1`); } else seen.set(nn, 0); await z.add(nn, list[i]); prog.set(i / list.length, nn); }
    prog.done(); download(await z.blob(), `renamed_${date()}.zip`); toast(`${list.length}개`, "ok");
  }
  const runBtn = button("ZIP 으로 내려받기", run, "btn primary full"); runBtn.disabled = true;
  const inp = (key, ph) => h("input", { type: "text", value: st[key], placeholder: ph, oninput: (e) => { st[key] = e.target.value; preview(); } });
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, h("table", { class: "data", style: { marginTop: "12px" } }, h("thead", {}, h("tr", {}, h("th", {}, "원래 이름"), h("th"), h("th", {}, "새 이름"))), tbody)),
    h("div", { class: "panel controls" },
      field("패턴", inp("pattern", "{name}_{n}"), "{name} 원래 이름 · {n} 번호(자릿수) · {i} 순번 · {date} 오늘 · {ext} 확장자"),
      h("div", { class: "row" }, field("시작 번호", num(st.start, { min: 0, onInput: (v) => { st.start = v; preview(); } })), field("자릿수", num(st.pad, { min: 1, max: 8, onInput: (v) => { st.pad = v; preview(); } })), field("증가", num(st.step, { min: 1, onInput: (v) => { st.step = v; preview(); } }))),
      field("찾기", inp("find", "")), field("바꾸기", inp("replace", "")),
      check("정규식", false, (v) => { st.regex = v; preview(); }), check("전부 소문자", false, (v) => { st.lower = v; preview(); }),
      field("정렬 (번호 순서)", select([["name", "이름"], ["date", "수정일"], ["size", "크기"], ["none", "넣은 순서"]], st.sortBy, (v) => { st.sortBy = v; preview(); })),
      h("div", { class: "cm-tools" }, ...[["{name}_{n}", "이름_번호"], ["{n}", "번호만"], ["{date}_{n}", "날짜_번호"], ["kf_{n}", "kf_번호"]].map(([p, t]) => button(t, () => { st.pattern = p; root.querySelector("input[placeholder='{name}_{n}']").value = p; preview(); }, "btn sm"))),
      button("목록 비우기", () => { files = []; preview(); }), runBtn, prog)));
  return () => dz.destroy();
}
