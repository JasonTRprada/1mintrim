import { h, $, toast } from "./ui.js";

// 도구 등록표. 파일은 tools/<id>.js, export function mount(root, ctx) → cleanup?
export const GROUPS = [
  { id: "pipe", title: "제작 파이프라인", sub: "키프레임 · 시트 · 판정", tools: [
    { id: "gallery", ic: "🗂", name: "검수 갤러리", desc: "폴더를 열어 렌더 결과를 훑고 픽/탈락을 찍는다. 픽만 하위 폴더로 복사.", tags: "폴더 · 키보드 · 영상 재생" },
    { id: "resize", ic: "⬚", name: "키프레임 리사이즈", desc: "1920×1088 · 1376×768 · 1MP 같은 프리셋으로 여러 장을 한 번에. 크롭/패드/늘리기.", tags: "일괄 · ZIP" },
    { id: "sheet", ic: "▦", name: "컨택트 시트", desc: "여러 장을 격자 한 장으로. 파일명 라벨, 셀 크기, 배경색.", tags: "캐릭터 시트 · 비교표" },
    { id: "frames", ic: "🎞", name: "영상 → 스틸", desc: "원하는 시각·균등 N장·마지막 프레임을 PNG 로. i2v 키프레임 뽑기.", tags: "PNG · ZIP" },
    { id: "sharp", ic: "◎", name: "선명도 QC", desc: "1280 기준 라플라시안 분산(lap)·halo·micro 를 여러 장 한 번에 표로. 얼굴은 자동 검출.", tags: "face_qc_score 동일식 · 얼굴 검출" },
    { id: "compare", ic: "◫", name: "비교 뷰어", desc: "A/B 와이프 · 2~4장 동기 줌 격자 · 차이 맵 · 영상 2편 동기 재생. v20 vs v70 판정용.", tags: "와이프 · 차이맵" },
    { id: "pnginfo", ic: "ⓘ", name: "이미지 정보", desc: "ComfyUI PNG 의 prompt·workflow JSON 추출, EXIF 요약, 메타 없는 사본 저장.", tags: "ComfyUI · EXIF" },
    { id: "palette", ic: "🎨", name: "팔레트 추출", desc: "대표색 N개를 k-means 로. HEX 복사, 프롬프트용 색 이름, 팔레트 PNG.", tags: "k-means" },
  ]},
  { id: "image", title: "이미지", sub: "편집 · 분할 · 가리기 · 누끼 · 지우기 · 서명", tools: [
    { id: "edit", ic: "✂", name: "이미지 편집", desc: "크롭·회전·뒤집기·크기·색 보정·언샤프·워터마크·포맷/품질을 한 화면에서.", tags: "PNG · JPG · WEBP" },
    { id: "canvas", ic: "🖼", name: "템플릿 캔버스", desc: "여러 장·문구·띠를 배치한 페이지들 → 이미지 또는 페이드 슬라이드 GIF/WebM.", tags: "레이어 · 페이지 · 슬라이드" },
    { id: "split", ic: "⊞", name: "사진 분할", desc: "2·4·8·16 조각 또는 임의 행×열로 잘라 ZIP.", tags: "격자" },
    { id: "mosaic", ic: "▩", name: "모자이크", desc: "얼굴 자동 감지 또는 브러시로 픽셀화·블러·검정 가리기.", tags: "얼굴 검출 ONNX 1.2MB" },
    { id: "cleanup", ic: "🧽", name: "작은 표시 지우기", desc: "워터마크·잡티·전선을 마스크로 잡아 주변 결로 메운다. 가장자리 워터마크 자동 감지.", tags: "인페인트 · 결 복제" },
    { id: "bg", ic: "🪄", name: "배경 제거", desc: "U²-Net(경량) ONNX 를 브라우저에서 돌려 누끼. 투명·단색·그라데이션 배경.", tags: "ONNX 4.6MB · 첫 실행만 로드" },
    { id: "sign", ic: "✍", name: "사진·문서 서명", desc: "손글씨 패드·타이핑·서명 사진을 사진이나 PDF 페이지 위에 놓고 저장.", tags: "PDF 유지" },
  ]},
  { id: "video", title: "영상 · GIF", sub: "브라우저 디코더로", tools: [
    { id: "gif", ic: "🔁", name: "영상 → GIF", desc: "구간·fps·너비·부메랑. ffmpeg 없이 gifenc 로 인코딩.", tags: "오프라인" },
    { id: "record", ic: "⏺", name: "화면 녹화", desc: "화면·창·탭을 WebM 으로 녹화. 바로 GIF 도구로 넘기기.", tags: "WebM → GIF" },
  ]},
  { id: "file", title: "파일 · 기타", sub: "", tools: [
    { id: "rename", ic: "🏷", name: "파일명 일괄 변경", desc: "패턴·번호·접두/접미로 이름을 바꿔 ZIP 으로.", tags: "{name} {n}" },
    { id: "pdf", ic: "📄", name: "이미지 ↔ PDF", desc: "여러 장을 한 PDF 로, PDF 페이지를 이미지로. 순서 조정, 페이지 맞춤.", tags: "pdf-lib · pdf.js" },
    { id: "qr", ic: "▣", name: "QR 코드", desc: "주소·텍스트를 QR 로. 색·여백·크기. PNG/SVG.", tags: "" },
    { id: "roulette", ic: "🎡", name: "뽑기 룰렛", desc: "후보 이미지·문구를 돌려 하나 고른다. 못 고르겠을 때, 또는 벌칙 뽑기.", tags: "재미 · 폭죽" },
  ]},
  { id: "legacy", title: "기존 도구 (ffmpeg.wasm · 온라인 필요)", sub: "코어 31MB 를 CDN 에서 받는다", tools: [
    { id: "ext:../legacy/1mintrim-v1/", ic: "✂", name: "영상 트림 (1MinTrim)", desc: "구간 잘라 이어붙이기 · 최대 5분.", tags: "ffmpeg", ext: true },
    { id: "ext:../gif", ic: "🔁", name: "GIF (ffmpeg 판)", desc: "옛 GIF 변환기.", tags: "ffmpeg", ext: true },
    { id: "ext:../audio", ic: "♪", name: "오디오 추출", desc: "영상에서 MP3/WAV.", tags: "ffmpeg", ext: true },
    { id: "ext:../ico", ic: "◆", name: "ICO 생성", desc: "파비콘 만들기.", tags: "", ext: true },
  ]},
];
const ALL = GROUPS.flatMap((g) => g.tools.filter((t) => !t.ext));
const byId = Object.fromEntries(ALL.map((t) => [t.id, t]));

const view = $("#view"), nav = $("#nav"), sidebar = $("#sidebar");
let cleanup = null, current = null;

function renderNav() {
  nav.replaceChildren(h("a", { href: "#/", class: "nav-home", "data-id": "" }, h("span", { class: "ic" }, "⌂"), "모든 도구"));
  for (const g of GROUPS) {
    nav.append(h("div", { class: "nav-group" }, g.title));
    for (const t of g.tools) {
      const href = t.ext ? t.id.slice(4) : `#/${t.id}`;
      nav.append(h("a", { href, "data-id": t.id, target: t.ext ? "_self" : null }, h("span", { class: "ic" }, t.ic), t.name, t.ext ? h("span", { class: "ext" }, "↗") : null));
    }
  }
}
function setActive(id) { for (const a of nav.querySelectorAll("a")) a.classList.toggle("active", a.dataset.id === id); }

function header(t) {
  const online = navigator.onLine;
  return h("div", { class: "topbar" },
    h("div", {}, h("div", { class: "eyebrow" }, t ? "WORKSTATION TOOLS" : "JASON'S WORKSTATION · 04 TOOLS"), h("h1", {}, t ? `${t.ic} ${t.name}` : "브라우저에서 끝나는 도구"), h("p", {}, t ? t.desc : "업로드 없음, 서버 없음. 사진과 영상은 이 창 밖으로 나가지 않는다. 한 번 열어두면 오프라인에서도 그대로 돈다.")),
    h("span", { class: `local-badge ${online ? "" : "off"}` }, online ? "● 로컬 처리 · 서버 전송 없음" : "● 오프라인 모드"));
}

function renderHub() {
  const frag = h("div", {}, header(null));
  let n = 0;
  for (const g of GROUPS) {
    frag.append(h("div", { class: "hub-section" }, h("h2", {}, g.title), h("span", {}, g.sub)));
    const grid = h("div", { class: "hub-grid" });
    for (const t of g.tools) {
      n++;
      grid.append(h("a", { class: "hub-card", href: t.ext ? t.id.slice(4) : `#/${t.id}` },
        h("span", { class: "num" }, String(n).padStart(2, "0")), h("div", { class: "ic" }, t.ic), h("h3", {}, t.name), h("p", {}, t.desc), t.tags ? h("div", { class: "tags" }, t.tags) : null));
    }
    frag.append(grid);
  }
  frag.append(h("p", { class: "help", style: { marginTop: "36px" } },
    "모든 처리는 이 브라우저 안에서 끝난다 (Canvas · WebCodecs 없이도 되는 HTML5 디코더 · ONNX Runtime Web). ",
    "폴더 열기·저장은 Chrome/Edge 의 File System Access 를 쓴다. ",
    "결과 파일은 다운로드 폴더로 내려가고, 여러 장이면 ZIP 으로 묶인다."));
  return frag;
}

async function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const id = hash.split("?")[0];
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  view.replaceChildren();
  sidebar.classList.remove("open");
  window.scrollTo(0, 0);
  if (!id || !byId[id]) { setActive(""); current = null; view.append(renderHub()); document.title = "Workstation Tools | 1mintrim"; return; }
  const t = byId[id]; current = id; setActive(id);
  document.title = `${t.name} — Workstation Tools`;
  view.append(header(t));
  const root = h("div", { class: "tool-root" }); view.append(root);
  try {
    const mod = await import(`./tools/${id}.js`);
    cleanup = await mod.mount(root, { tool: t, go: (to) => { location.hash = `#/${to}`; } });
  } catch (e) {
    console.error(e);
    root.append(h("div", { class: "panel" }, h("h2", {}, "도구를 불러오지 못했습니다"), h("p", { class: "help" }, String(e.message || e))));
  }
}

renderNav();
window.addEventListener("hashchange", route);
$("#menu-btn").addEventListener("click", () => sidebar.classList.toggle("open"));
window.addEventListener("online", () => current === null && route());
window.addEventListener("offline", () => current === null && route());
route();

// 서비스워커: 정적 파일 전부 캐시 → 두 번째부터 오프라인
const offState = $("#offline-state");
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("sw.js").then((reg) => {
    const setReady = () => { offState.textContent = "오프라인에서도 열립니다."; };
    if (reg.active && !reg.installing) setReady();
    reg.addEventListener("updatefound", () => { const w = reg.installing; w?.addEventListener("statechange", () => { if (w.state === "activated") setReady(); }); });
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.type === "cached") setReady(); });
  }).catch((e) => { offState.textContent = "오프라인 캐시 실패: " + e.message; });
} else offState.textContent = "오프라인 캐시는 https 또는 localhost 에서만.";
