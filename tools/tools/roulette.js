// 뽑기 룰렛 — 후보(이미지 또는 텍스트)를 돌려 하나 고른다. 「알아서 골라」가 51점이면 운에 맡겨보자.
import { h, dropzone, loadBitmap, canvas, button, field, num, isImage, toast, check } from "../ui.js";

export function mount(root) {
  let items = []; // {label, img?}
  let angle = 0, spinning = false, history = [];
  const wheel = h("canvas", { width: 640, height: 640, style: { width: "min(100%, 520px)", display: "block", margin: "0 auto" } });
  const resultEl = h("div", { style: { textAlign: "center", marginTop: "10px" } });
  const list = h("ul", { class: "filelist" }); const st = { removeWinner: false, sound: true };
  const COLORS = ["#8370a8", "#d4ad79", "#e8a0b0", "#7fb3d5", "#9fd3a5", "#f3c86b", "#c39bd3", "#f0a07a"];
  const dz = dropzone({ accept: "image/*", hint: "후보 이미지 여러 장 · 또는 아래에 텍스트 후보를 줄마다", onFiles: async (fs) => { for (const f of fs.filter(isImage)) { const b = await loadBitmap(f, { resizeWidth: 160 }); const c = canvas(b.width, b.height); c.getContext("2d").drawImage(b, 0, 0); b.close?.(); items.push({ label: f.name.replace(/\.[^.]+$/, ""), img: c }); } render(); } });
  const ta = h("textarea", { rows: 4, placeholder: "v70 후보 A\nv70 후보 B\n오늘은 쉰다" });
  function addText() { const lines = ta.value.split("\n").map((s) => s.trim()).filter(Boolean); for (const l of lines) items.push({ label: l }); ta.value = ""; render(); }
  function render() { list.replaceChildren(...items.map((it, i) => h("li", {}, h("span", { class: "thumb ph", style: { background: COLORS[i % COLORS.length], color: "#fff" } }, it.img ? "" : String(i + 1)), it.img ? h("img", { class: "thumb", src: it.img.toDataURL() }) : null, h("span", { class: "fname" }, it.label), h("button", { class: "x", type: "button", onclick: () => { items.splice(i, 1); render(); } }, "×")))); draw(); spinBtn.disabled = items.length < 2; }
  function draw() {
    const ctx = wheel.getContext("2d"), R = 300, cx = 320, cy = 320; ctx.clearRect(0, 0, 640, 640); const n = items.length; if (!n) { ctx.fillStyle = "#e9dfe6"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill(); return; }
    const a = Math.PI * 2 / n;
    items.forEach((it, i) => { const s = angle + i * a; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, s, s + a); ctx.closePath(); ctx.fillStyle = COLORS[i % COLORS.length]; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(s + a / 2); if (it.img) { const sz = Math.min(90, R * a * 0.8); ctx.save(); ctx.beginPath(); ctx.arc(R * 0.62, 0, sz / 2, 0, 7); ctx.clip(); const r = Math.max(sz / it.img.width, sz / it.img.height); ctx.drawImage(it.img, R * 0.62 - it.img.width * r / 2, -it.img.height * r / 2, it.img.width * r, it.img.height * r); ctx.restore(); ctx.fillStyle = "#fff"; ctx.font = "600 14px 'DM Sans', sans-serif"; ctx.textAlign = "center"; ctx.fillText(it.label.slice(0, 14), R * 0.62, sz / 2 + 16); }
      else { ctx.fillStyle = "#fff"; ctx.font = `600 ${n > 10 ? 14 : 20}px 'DM Sans', sans-serif`; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(it.label.slice(0, 18), R - 16, 0); } ctx.restore(); });
    ctx.beginPath(); ctx.arc(cx, cy, 34, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#8370a8"; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = "#302c46"; ctx.beginPath(); ctx.moveTo(cx + R + 26, cy - 16); ctx.lineTo(cx + R - 18, cy); ctx.lineTo(cx + R + 26, cy + 16); ctx.closePath(); ctx.fill();
  }
  function beep(f = 660, d = 0.06) { if (!st.sound) return; try { const ac = beep.ac ||= new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0.08, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d); o.start(); o.stop(ac.currentTime + d); } catch {} }
  function spin() {
    if (spinning || items.length < 2) return; spinning = true; spinBtn.disabled = true; resultEl.textContent = "";
    const n = items.length, a = Math.PI * 2 / n; const winner = Math.floor(Math.random() * n);
    // 포인터(오른쪽, 각도 0)가 winner 조각 가운데를 가리키도록
    const target = -(winner * a + a / 2) + (Math.random() - 0.5) * a * 0.7; const turns = 6 + Math.random() * 3;
    const start = angle % (Math.PI * 2), total = Math.PI * 2 * turns + ((target - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const t0 = performance.now(), dur = 4200 + Math.random() * 1200; let lastIdx = -1;
    const tick = () => { const t = Math.min(1, (performance.now() - t0) / dur); const e = 1 - Math.pow(1 - t, 3); angle = start + total * e; draw();
      const idx = Math.floor((((-angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / a); if (idx !== lastIdx) { beep(500 + (idx % 5) * 60); lastIdx = idx; }
      if (t < 1) requestAnimationFrame(tick); else finish(winner); };
    requestAnimationFrame(tick);
  }
  function finish(i) {
    spinning = false; spinBtn.disabled = false; const it = items[i]; history.unshift(it.label); beep(880, 0.25); setTimeout(() => beep(1320, 0.3), 120);
    resultEl.replaceChildren(h("div", { class: "big-num" }, "🎉 " + it.label), it.img ? h("img", { src: it.img.toDataURL(), style: { maxHeight: "160px", borderRadius: "12px", marginTop: "8px" } }) : null, h("div", { class: "meta" }, "지난 결과: " + history.slice(0, 6).join(" · ")));
    confetti();
    if (st.removeWinner) { items.splice(i, 1); render(); }
  }
  function confetti() { const c = h("canvas", { width: innerWidth, height: innerHeight, style: { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60 } }); document.body.append(c); const ctx = c.getContext("2d"); const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - 0.5) * 18, vy: -Math.random() * 16 - 4, r: 4 + Math.random() * 5, c: COLORS[Math.random() * COLORS.length | 0], a: Math.random() * 7 })); const t0 = performance.now();
    const f = () => { ctx.clearRect(0, 0, c.width, c.height); for (const p of ps) { p.x += p.vx; p.vy += 0.45; p.y += p.vy; p.a += 0.2; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); } if (performance.now() - t0 < 2200) requestAnimationFrame(f); else c.remove(); }; requestAnimationFrame(f); }
  const spinBtn = button("돌려!", spin, "btn primary full"); spinBtn.disabled = true;
  root.append(h("div", { class: "tool" },
    h("div", { class: "panel" }, dz, wheel, resultEl),
    h("div", { class: "panel controls" }, field("텍스트 후보 (줄마다 하나)", ta), button("후보 추가", addText), list, check("뽑힌 건 후보에서 빼기", false, (v) => st.removeWinner = v), check("소리", true, (v) => st.sound = v), spinBtn, button("전부 비우기", () => { items = []; history = []; resultEl.textContent = ""; render(); }, "btn danger"))));
  render();
  return () => {};
}
