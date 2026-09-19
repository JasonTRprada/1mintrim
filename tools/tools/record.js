// 화면 녹화 — getDisplayMedia + MediaRecorder → WebM · GIF 도구로 넘기기
import { h, button, field, select, download, toast, handoff, check, fmtTime, fmtBytes } from "../ui.js";

export function mount(root, ctx) {
  let stream = null, rec = null, chunks = [], blob = null, t0 = 0, timer = null;
  const st = { fps: 30, audio: false, quality: "high" };
  const stage = h("div", { class: "canvas-wrap" }, h("p", { class: "help" }, "「녹화 시작」을 누르면 브라우저가 화면·창·탭 선택창을 띄운다. 이 탭에 돌아올 필요 없이 녹화된다."));
  const clock = h("div", { class: "big-num" }, "0:00.00"); const meta = h("div", { class: "meta" });
  const supported = !!navigator.mediaDevices?.getDisplayMedia;
  function mime() { for (const m of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]) if (MediaRecorder.isTypeSupported(m)) return m; return ""; }
  async function start() {
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: st.fps }, audio: st.audio }); }
    catch (e) {
      // 앱 내장 브라우저(Claude 브라우저 패널·일부 웹뷰)는 화면 캡처를 막는다 → 기본 브라우저로 열도록 안내
      const blocked = e.name === "NotAllowedError" || e.name === "NotSupportedError" || e.name === "SecurityError";
      stage.replaceChildren(h("div", { class: "help", style: { padding: "18px", textAlign: "center" } },
        h("p", { style: { color: "#a2632a", fontWeight: 600, margin: "0 0 8px" } }, blocked ? "이 브라우저에서 화면 캡처가 거부됐다." : "화면 캡처 실패: " + e.message),
        h("p", { style: { margin: "0 0 12px" } }, "앱 안에 내장된 브라우저(예: Claude 브라우저 패널, 카카오·인스타 인앱 브라우저)는 화면·창 공유를 막는다. Chrome · Edge · Firefox 에서 같은 주소를 열면 된다."),
        h("div", { class: "cm-tools", style: { justifyContent: "center" } },
          button("주소 복사", () => { navigator.clipboard?.writeText(location.href); toast("주소 복사됨 — 기본 브라우저에 붙여넣기", "ok"); }, "btn sm primary"),
          h("a", { class: "btn sm", href: location.href, target: "_blank", rel: "noopener" }, "새 창으로 열기 ↗"))));
      return;
    }
    chunks = []; blob = null;
    rec = new MediaRecorder(stream, { mimeType: mime(), videoBitsPerSecond: { high: 12e6, mid: 6e6, low: 2.5e6 }[st.quality] });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = finish; rec.start(500);
    stream.getVideoTracks()[0].addEventListener("ended", stop);
    t0 = performance.now(); timer = setInterval(() => { clock.textContent = fmtTime((performance.now() - t0) / 1000); }, 50);
    const live = h("video", { autoplay: true, muted: true, playsInline: true }); live.srcObject = stream; stage.replaceChildren(live);
    startBtn.disabled = true; stopBtn.disabled = false;
  }
  function stop() { if (rec && rec.state !== "inactive") rec.stop(); stream?.getTracks().forEach((t) => t.stop()); clearInterval(timer); }
  function finish() {
    blob = new Blob(chunks, { type: rec.mimeType.split(";")[0] });
    const v = h("video", { controls: true, src: URL.createObjectURL(blob) }); stage.replaceChildren(v);
    meta.textContent = `${rec.mimeType} · ${fmtBytes(blob.size)} · ${clock.textContent}`;
    startBtn.disabled = false; stopBtn.disabled = true; dlBtn.disabled = false; gifBtn.disabled = false;
    toast("녹화 종료", "ok");
  }
  const ext = () => (blob?.type.includes("mp4") ? "mp4" : "webm");
  const startBtn = button("⏺ 녹화 시작", start, "btn primary full"); const stopBtn = button("■ 정지", stop, "btn full"); stopBtn.disabled = true;
  const dlBtn = button("WebM 다운로드", () => download(blob, `record_${Date.now()}.${ext()}`)); dlBtn.disabled = true;
  const gifBtn = button("GIF 도구로 보내기", () => { handoff.put([new File([blob], `record.${ext()}`, { type: blob.type })], "record"); ctx.go("gif"); }); gifBtn.disabled = true;
  if (!supported) startBtn.disabled = true;
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, supported ? null : h("p", { class: "help", style: { color: "#a2632a" } }, "이 브라우저는 화면 캡처를 지원하지 않는다 (PC Chrome·Edge·Firefox 에서)."), stage, h("div", { class: "row", style: { marginTop: "12px" } }, clock, meta)),
    h("div", { class: "panel controls" },
      field("프레임", select([["30", "30 fps"], ["60", "60 fps"], ["15", "15 fps"]], "30", (v) => st.fps = Number(v))),
      field("화질", select([["high", "높음 (12 Mbps)"], ["mid", "보통 (6 Mbps)"], ["low", "낮음 (2.5 Mbps)"]], st.quality, (v) => st.quality = v)),
      check("시스템 오디오 포함 (탭·화면 공유 시)", false, (v) => st.audio = v),
      startBtn, stopBtn, dlBtn, gifBtn,
      h("p", { class: "help" }, "WebM 은 브라우저 인코더 결과라 편집툴에 넣으려면 ffmpeg 로 mp4 변환이 필요할 수 있다. 짧은 설명용 GIF 는 바로 「GIF 도구로」."))));
  return () => { stop(); };
}
