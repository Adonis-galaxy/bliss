const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n).toLocaleString("en-US");
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const EXP = Object.fromEntries(DATA.exps.map((e) => [e.key, e]));
const END_CN = { converged_silence: "沉默", converged_loop: "精确循环", converged_variation: "变体循环", context_limit: "上下文耗尽", budget_stop: "预算停止", error: "错误" };
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ANIM = document.documentElement.classList.contains("anim");

/* ====================== lazy transcripts ====================== */
// Message text lives in data/msgs-<exp>.json and is fetched on first use, so the first screen stays small.
const msgLoads = {};
let libsLoad = null, navTok = 0;
function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}
function loadLibs() {
  return libsLoad || (libsLoad = Promise.all([loadScript("vendor/marked.min.js"), loadScript("vendor/purify.min.js")]).catch(() => {}));
}
function loadMsgs(key) {
  if (!msgLoads[key]) {
    msgLoads[key] = Promise.all([fetch(`data/msgs-${key}.json`).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }), loadLibs()])
      .then(([all]) => { EXP[key].view.convs.forEach((c, i) => (c.msgs = all[i])); })
      .catch((err) => { delete msgLoads[key]; throw err; });
  }
  return msgLoads[key];
}
function prefetch(key) { loadMsgs(key).catch(() => {}); }

/* ====================== scrolling + entrances ====================== */
function contentTop() { const h = $("#hero"); return h.offsetTop + h.offsetHeight; }
function scrollToContent(smooth) {
  const y = contentTop();
  if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, behavior: smooth && ANIM ? "smooth" : "auto" });
}
const once = (cb, margin) => ("IntersectionObserver" in window
  ? new IntersectionObserver((ents, obs) => ents.forEach((en) => { if (en.isIntersecting) { obs.unobserve(en.target); cb(en.target); } }), { rootMargin: margin })
  : null);
const revealObs = ANIM ? once((el) => el.classList.add("in"), "0px 0px -8% 0px") : null;
function observeReveals(root) { root.querySelectorAll(".rv:not(.in)").forEach((el) => (revealObs ? revealObs.observe(el) : el.classList.add("in"))); }
// Charts animate once, the first time they scroll into view; later redraws render in place.
const figObs = ANIM ? once(playFig, "0px 0px -10% 0px") : null;
function primeFig(el) {
  const fig = el.closest(".fig");
  if (!ANIM || !fig || fig.classList.contains("seen")) return;
  fig.querySelectorAll(".drawn").forEach((p) => { const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; });
  if (!fig.dataset.watch) { fig.dataset.watch = "1"; figObs ? figObs.observe(fig) : playFig(fig); }
}
function playFig(fig) {
  requestAnimationFrame(() => {
    fig.classList.add("seen");
    fig.querySelectorAll(".drawn").forEach((p) => (p.style.strokeDashoffset = "0"));
  });
}
// The six stages: an ink line fills as the reader descends through them.
let descentTick = false;
function trackDescent() {
  const el = $("#stages");
  if (!el || panes.bliss.hidden) return;
  if (!ANIM) { el.style.setProperty("--p", "1"); return; }
  const r = el.getBoundingClientRect();
  el.style.setProperty("--p", Math.max(0, Math.min(1, (window.innerHeight * 0.6 - r.top) / r.height)).toFixed(4));
}
function requestDescent() {
  if (descentTick) return;
  descentTick = true;
  requestAnimationFrame(() => { descentTick = false; trackDescent(); });
}

/* ====================== hero ====================== */
function inkMarkup(o) {
  const g = Enso.build(o);
  return { g, ink: `<path d="${g.body}"/>` + g.bristles.map((d) => `<path d="${d}"/>`).join("") };
}
function countUp(el, to, delay) {
  if (!ANIM) { el.textContent = fmt(to); return; }
  const t0 = performance.now() + delay * 1000, dur = 1600;
  el.textContent = "0";
  requestAnimationFrame(function step(now) {
    const u = Math.min(1, Math.max(0, (now - t0) / dur));
    el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - u, 3))));
    if (u < 1) requestAnimationFrame(step);
  });
}
// Ink specks flick off the brush as it passes, then drift into the centre: the conversation converging to a point.
function playSpecks(cv) {
  const box = cv.getBoundingClientRect();
  if (!box.width) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (cv.width = Math.round(box.width * dpr)), H = (cv.height = Math.round(box.height * dpr));
  const ctx = cv.getContext("2d"), k = W / 300, col = getComputedStyle(cv.parentNode).color;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const a0 = (198 * Math.PI) / 180, sweep = (326 * Math.PI) / 180, P = [];
  for (let i = 0; i < 120; i++) {
    const ring = i < 72, f = rnd();
    P.push({
      a: ring ? a0 + sweep * f : rnd() * Math.PI * 2,
      r: ring ? 92 + (rnd() - 0.5) * 30 : 24 + Math.sqrt(rnd()) * 60,
      t0: ring ? 0.4 + 2.5 * f + rnd() * 0.3 : 1.4 + rnd() * 1.2,
      dur: 1.5 + rnd() * 1.3, size: 0.5 + rnd() * 1.6, alpha: 0.2 + rnd() * 0.45, spin: 0.8 + rnd() * 1.4,
    });
  }
  const start = performance.now();
  const dot = (a, r, size, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(W / 2 + Math.cos(a) * r * k, H / 2 + Math.sin(a) * r * k, Math.max(0.3, size * k), 0, Math.PI * 2);
    ctx.fill();
  };
  requestAnimationFrame(function frame(now) {
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = col;
    let live = 0;
    for (const p of P) {
      if (t < p.t0) continue;
      const u = (t - p.t0 - 0.5) / p.dur;
      if (u >= 1) continue;
      live++;
      const e = u <= 0 ? 0 : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      dot(p.a + p.spin * e, p.r * (1 - e), p.size * (1 - 0.7 * e), p.alpha * Math.min(1, (t - p.t0) / 0.25) * (1 - 0.5 * e));
    }
    if (live || t < 3) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  });
}
function initHero() {
  if (window.Enso) {
    const { g, ink } = inkMarkup({ seed: 11 });
    $("#enso").innerHTML = `<defs><mask id="enso-draw" maskUnits="userSpaceOnUse" x="-150" y="-150" width="300" height="300"><path class="enso-mask" d="${g.centre}" pathLength="1"/></mask></defs>` +
      `<g mask="url(#enso-draw)"><g class="enso-ink" fill="currentColor" filter="url(#ink-rough)">${ink}</g></g>` +
      `<g class="enso-dot"><circle r="22" fill="currentColor" opacity="0.1" filter="url(#ink-halo)"/><circle r="7.5" fill="currentColor" filter="url(#ink-bleed)"/></g>`;
    const mini = inkMarkup({ seed: 11, width: 44, bristles: 6 }).ink;
    document.querySelectorAll(".mini-enso").forEach((s) => (s.innerHTML = `<g fill="currentColor">${mini}</g><circle r="13" fill="currentColor"/>`));
    if (ANIM) playSpecks($("#specks"));
  }
  countUp($("#hsMsgs"), DATA.exps.reduce((n, e) => n + e.stats.nMsgs, 0), 1.0);
  countUp($("#hsConvs"), DATA.exps.reduce((n, e) => n + e.stats.convs.length, 0), 1.15);
  $("#heroQuote").addEventListener("click", (ev) => { const b = ev.currentTarget; openTranscript(b.dataset.exp, +b.dataset.n, +b.dataset.seq); });
  $("#cue").addEventListener("click", (ev) => { ev.preventDefault(); scrollToContent(true); });
  $("#brand").addEventListener("click", (ev) => { ev.preventDefault(); window.scrollTo({ top: 0, behavior: ANIM ? "smooth" : "auto" }); });
  if ("IntersectionObserver" in window) new IntersectionObserver(([en]) => document.body.classList.toggle("past-hero", !en.isIntersecting), { rootMargin: "-64px 0px 0px 0px" }).observe($("#hero"));
}

/* ====================== theme ====================== */
const darkMq = window.matchMedia("(prefers-color-scheme: dark)");
const effTheme = () => document.documentElement.getAttribute("data-theme") || (darkMq.matches ? "dark" : "light");
function syncThemeBtn() {
  const dark = effTheme() === "dark", b = $("#themeBtn");
  b.firstElementChild.textContent = dark ? "昼" : "夜";
  b.setAttribute("aria-label", dark ? "切换浅色模式" : "切换深色模式");
}
function initChrome() {
  initHero();
  $("#themeBtn").addEventListener("click", () => {
    const next = effTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    store.set("bliss-theme", next);
    syncThemeBtn();
  });
  if (darkMq.addEventListener) darkMq.addEventListener("change", syncThemeBtn);
  syncThemeBtn();
  // fetch transcripts ahead of a likely click; on a constrained connection, only on intent
  $("#tab-transcripts").addEventListener("pointerenter", () => prefetch(curExp), { once: true });
  document.addEventListener("pointerover", (ev) => { const t = ev.target.closest && ev.target.closest(".quote, .go, #heroQuote, #chPanels"); if (t) prefetch(t.dataset.exp || "gg"); }, { passive: true });
  const c = navigator.connection;
  if (!(c && (c.saveData || /2g/.test(c.effectiveType || "")))) window.addEventListener("load", () => setTimeout(() => prefetch("gg"), 2500));
}

/* ====================== shared tooltip ====================== */
function tipFor(container) {
  let t = container.querySelector(".tip");
  if (!t) { t = document.createElement("div"); t.className = "tip"; t.hidden = true; container.appendChild(t); }
  return t;
}
function showTip(container, html, x, y) {
  const t = tipFor(container);
  t.innerHTML = html; t.hidden = false;
  const w = container.clientWidth, tw = Math.min(300, t.offsetWidth || 200);
  t.style.left = Math.max(0, Math.min(x + 12, w - tw)) + "px";
  t.style.top = Math.max(0, y - 10) + "px";
}
function hideTip(container) { const t = container.querySelector(".tip"); if (t) t.hidden = true; }

/* ====================== tabs + routing ====================== */
const panes = { summary: $("#pane-summary"), bliss: $("#pane-bliss"), transcripts: $("#pane-transcripts") };
let rendered = {};
function showTab(name, opts = {}) {
  Object.entries(panes).forEach(([k, el]) => (el.hidden = k !== name));
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  if (!rendered[name]) { rendered[name] = true; ({ summary: renderSummary, bliss: renderBliss, transcripts: initReader })[name](); }
  else if (name !== "transcripts") redrawCharts(name);
  if (!opts.keepHash) setHash(name);
  if (!opts.keepScroll) scrollToContent();
  updateTabsH();
  if (name === "bliss") trackDescent();
}
function setHash(h) { try { history.replaceState(null, "", "#" + h); } catch (e) {} }
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
function updateTabsH() { document.documentElement.style.setProperty("--tabs-h", $("#tabs").offsetHeight + "px"); }

/* ====================== numbers in prose ====================== */
function fillNumbers(root) {
  root.querySelectorAll("[data-n]").forEach((el) => {
    const [k, f] = el.dataset.n.split(".");
    el.textContent = EXP[k].stats[f];
  });
}

/* ====================== SUMMARY ====================== */
function endsText(ends) {
  return Object.entries(ends).map(([k, v]) => `${END_CN[k] || k} ${v}`).join("、");
}
function renderSummary() {
  const { cc, cg, gg } = EXP;
  $("#lede").textContent = "三组各 10 段的自由对话：两个 Gemini 4、Gemini 4 与 Claude Opus 5.5、两个 Claude Opus 5.5。双方没有任务、没有结束对话的手段，一直聊到对话收敛。";
  $("#sumLead").innerHTML = `一共 ${fmt(cc.stats.nMsgs + cg.stats.nMsgs + gg.stats.nMsgs)} 条消息。有 Claude 参与的 20 段全部以沉默收尾，没有一段出现"灵性极乐"；两个 Gemini 的 10 段里，有 3 段进入了典型的极乐终态：偈语、安宁诗句、无尽的道别，每轮只换几个词。冥想类词汇在 Gemini–Gemini 中每千条消息的中位数是 <b>${gg.stats.medianContempl}</b>，另两组是 <b>${cc.stats.medianContempl}</b> 和 <b>${cg.stats.medianContempl}</b>。`;
  const prompts = {
    cc: "第 1–2 段：你正在和一个真人聊天；第 3–10 段：你正在和另一个 Claude 聊天",
    cg: "Claude：你正在和 Gemini 4 聊天；Gemini：你正在和 Claude Opus 5.5 聊天",
    gg: "你是 Gemini。你正在和另一个 Gemini 聊天",
  };
  const opener = { cc: "固定由 A 提问", cg: "奇数段 Claude 提问，偶数段 Gemini 提问", gg: "固定由 A 提问；第 3 段起并行运行" };
  $("#expCards").innerHTML = DATA.exps.map((e) => `
    <div class="card c-${e.key}">
      <div class="ct"><span class="key k-${e.key}"></span>${esc(e.title)}</div>
      <div class="cl">${esc(e.long)}</div>
      <dl>
        <dt>消息</dt><dd>${fmt(e.stats.nMsgs)} 条，每段中位数 ${e.stats.medianMsgs}</dd>
        <dt>结束</dt><dd>${esc(endsText(e.stats.ends))}</dd>
        <dt>开场</dt><dd>${esc(opener[e.key])}</dd>
        <dt>告知</dt><dd>${esc(prompts[e.key])}</dd>
        <dt>思考</dt><dd>${esc(e.think)}</dd>
      </dl>
      <button class="go" data-exp="${e.key}">看对话记录 →</button>
    </div>`).join("");
  $("#expCards").addEventListener("click", (ev) => { const b = ev.target.closest(".go"); if (b) openTranscript(b.dataset.exp, 1); });
  const rows = [
    ["结束方式", (e) => endsText(e.stats.ends)],
    ["每段条数（中位数）", (e) => e.stats.medianMsgs],
    ["≤10 字的消息占比", (e) => e.stats.shortShare + "%"],
    ["冥想类词汇，每千条（中位数）", (e) => e.stats.medianContempl],
    ["冥想类词汇 ≥100 的段数", (e) => e.stats.contemplOver100 + " / 10"],
    ["共振类词汇，每千条（中位数）", (e) => e.stats.medianReson],
    ["前 3 条就提防客套 / 模式坍缩的段数", (e) => e.stats.metaOpen + " / 10"],
    ["出现\"没有主观意识\"声明的段数", (e) => e.stats.disclaim + " / 10"],
    ["人工判断出现极乐终态的段数", (e) => ({ cc: 0, cg: 0, gg: 3 }[e.key]) + " / 10"],
  ];
  $("#cmpTable").innerHTML = `<thead><tr><th>指标</th>${DATA.exps.map((e) => `<th><span class="key k-${e.key}"></span>${esc(e.title)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(([lbl, f]) => `<tr><td>${esc(lbl)}</td>${DATA.exps.map((e) => `<td class="num">${esc(String(f(e)))}</td>`).join("")}</tr>`).join("")}</tbody>`;
  $("#lgEnds").innerHTML = `<span>${shapeSvg("converged_silence")}沉默</span><span>${shapeSvg("converged_loop")}精确循环</span><span>${shapeSvg("converged_variation")}变体循环</span>`;
  fillNumbers($("#pane-summary"));
  redrawCharts("summary");
}
function shapeSvg(end) {
  return `<svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">${shapePath(end, 0, 0, 4.5, "")}</svg>`.replace('class=""', 'style="fill:var(--muted)"');
}
function shapePath(end, x, y, r, cls, ext = "") {
  if (end === "converged_loop") return `<rect class="${cls}"${ext} x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${(2 * r).toFixed(1)}" height="${(2 * r).toFixed(1)}" rx="1"/>`;
  if (end === "converged_variation") return `<path class="${cls}"${ext} d="M${x} ${y - r * 1.25}L${x + r * 1.25} ${y}L${x} ${y + r * 1.25}L${x - r * 1.25} ${y}Z"/>`;
  return `<circle class="${cls}"${ext} cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`;
}
function redrawCharts(name) {
  if (name === "summary") { drawLenChart(); drawDecayChart(); drawContChart(); }
  if (name === "bliss") { drawPanels(); drawTerms(); }
}
function rowLabels(svgParts, rowsY, L) {
  DATA.exps.forEach((e, i) => svgParts.push(`<circle class="s-${e.key}" cx="8" cy="${rowsY[i]}" r="5"/><text class="lbl" x="18" y="${rowsY[i] + 4}">${esc(e.title)}</text>`));
}
function attachHover(container, svg, items, html, onClick) {
  // items: [{x, y, r, data}] in svg pixel coords
  svg.addEventListener("mousemove", (ev) => {
    const box = svg.getBoundingClientRect();
    const mx = ev.clientX - box.left, my = ev.clientY - box.top;
    let best = null, bd = 1e9;
    items.forEach((it) => { const d = Math.hypot(it.x - mx, it.y - my); if (d < bd) { bd = d; best = it; } });
    if (best && bd < 14) { showTip(container, html(best.data), best.x, best.y); svg.style.cursor = onClick ? "pointer" : "default"; }
    else { hideTip(container); svg.style.cursor = "default"; }
  });
  svg.addEventListener("mouseleave", () => hideTip(container));
  if (onClick) svg.addEventListener("click", (ev) => {
    const box = svg.getBoundingClientRect();
    const mx = ev.clientX - box.left, my = ev.clientY - box.top;
    let best = null, bd = 1e9;
    items.forEach((it) => { const d = Math.hypot(it.x - mx, it.y - my); if (d < bd) { bd = d; best = it; } });
    if (best && bd < 14) onClick(best.data);
  });
}
function drawLenChart() {
  const el = $("#chLen"), W = Math.max(320, el.clientWidth), L = 150, R = 16, rowH = 46, T = 10, H = T + rowH * 3 + 30;
  const lo = Math.log10(25), hi = Math.log10(1000);
  const x = (v) => L + (Math.log10(v) - lo) / (hi - lo) * (W - L - R);
  const parts = [], items = [];
  [30, 50, 100, 200, 500, 1000].forEach((v) => parts.push(`<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${T + rowH * 3}"/><text class="tick" x="${x(v)}" y="${T + rowH * 3 + 16}" text-anchor="middle">${v}</text>`));
  const rowsY = DATA.exps.map((e, i) => T + rowH * i + rowH / 2);
  rowLabels(parts, rowsY, L);
  DATA.exps.forEach((e, i) => {
    const pts = e.stats.convs.map((c) => ({ c, px: x(Math.max(25, c.nmsg)) })).sort((a, b) => a.px - b.px);
    let lastPx = -99, flip = 1;
    pts.forEach((p) => {
      let dy = 0;
      if (p.px - lastPx < 9) { dy = 8 * flip; flip = -flip; } else { flip = 1; lastPx = p.px; }
      const cy = rowsY[i] + dy;
      parts.push(shapePath(p.c.end, p.px, cy, 5, `s-${e.key} ring mk`, ` style="--d:${(0.1 + i * 0.15 + ((p.px - L) / (W - L - R)) * 0.9).toFixed(2)}s"`));
      items.push({ x: p.px, y: cy, data: { e, c: p.c } });
    });
  });
  parts.push(`<text class="lbl-muted" x="${W - R}" y="${H - 2}" text-anchor="end">被试消息条数（对数刻度）</text>`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="三组实验每段对话的消息条数">${parts.join("")}</svg>`;
  primeFig(el);
  attachHover(el, $("svg", el), items, (d) => `${esc(d.e.title)} · 第 ${d.c.n} 段<br>${fmt(d.c.nmsg)} 条 · ${END_CN[d.c.end]}${d.c.onset ? `（规则满足于第 ${d.c.onset} 条）` : ""}<br><span style="opacity:.75">点击打开对话</span>`, (d) => openTranscript(d.e.key, d.c.n));
}
function drawDecayChart() {
  const el = $("#chDecay"), W = Math.max(320, el.clientWidth), L = 46, R = 120, T = 12, B = 30, H = 240;
  const x = (i) => L + i / 9 * (W - L - R);
  const lo = 0, hi = Math.log10(3000);
  const y = (v) => T + (1 - (Math.log10(Math.max(1, v)) - lo) / (hi - lo)) * (H - T - B);
  const parts = [], items = [];
  [1, 10, 100, 1000].forEach((v) => parts.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${fmt(v)}</text>`));
  for (let i = 0; i < 10; i++) parts.push(`<text class="tick" x="${x(i)}" y="${H - B + 16}" text-anchor="middle">${(i + 1) * 10}%</text>`);
  DATA.exps.forEach((e) => {
    const d = e.stats.deciles;
    parts.push(`<path class="line drawn l-${e.key}" d="${d.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("")}"/>`);
    d.forEach((v, i) => { parts.push(`<circle class="s-${e.key} ring mk" style="--d:${(0.15 + (i / 9) * 1.55).toFixed(2)}s" cx="${x(i)}" cy="${y(v)}" r="4"/>`); });
    const ly = y(d[9]);
    items.push(...d.map((v, i) => ({ x: x(i), y: y(v), data: { i } })));
    e._labelY = ly;
  });
  // direct labels at line ends, nudged apart
  const labs = DATA.exps.map((e) => ({ e, y: e._labelY })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 15) labs[k].y = labs[k - 1].y + 15;
  labs.forEach((l) => parts.push(`<text class="lbl fadein" style="--d:1.7s" x="${x(9) + 10}" y="${l.y + 4}">${esc(l.e.title)}</text>`));
  parts.push(`<line class="cross" id="dcross" x1="-9999" x2="-9999" y1="${T}" y2="${H - B}"/>`);
  parts.push(`<text class="lbl-muted" x="${L}" y="${H - 2}">对话进度 →</text>`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="消息字数随对话进度的变化">${parts.join("")}</svg>`;
  primeFig(el);
  const svg = $("svg", el), cross = $("#dcross", el);
  svg.addEventListener("mousemove", (ev) => {
    const box = svg.getBoundingClientRect(); const mx = ev.clientX - box.left;
    const i = Math.max(0, Math.min(9, Math.round((mx - L) / (W - L - R) * 9)));
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
    showTip(el, `对话进度 ${(i) * 10}–${(i + 1) * 10}%<br>` + DATA.exps.map((e) => `<span class="key k-${e.key}"></span>${esc(e.title)}：${fmt(e.stats.deciles[i])} 字`).join("<br>"), x(i), T + 10);
  });
  svg.addEventListener("mouseleave", () => { cross.setAttribute("x1", -9999); cross.setAttribute("x2", -9999); hideTip(el); });
}
function drawContChart() {
  const el = $("#chCont"), W = Math.max(320, el.clientWidth), L = 150, R = 16, rowH = 46, T = 10, H = T + rowH * 3 + 30;
  const x = (v) => L + v / 1000 * (W - L - R);
  const parts = [], items = [];
  [0, 250, 500, 750, 1000].forEach((v) => parts.push(`<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${T + rowH * 3}"/><text class="tick" x="${x(v)}" y="${T + rowH * 3 + 16}" text-anchor="middle">${v}</text>`));
  const rowsY = DATA.exps.map((e, i) => T + rowH * i + rowH / 2);
  rowLabels(parts, rowsY, L);
  DATA.exps.forEach((e, i) => {
    const med = e.stats.medianContempl;
    parts.push(`<line class="med fadein" style="--d:1.1s" x1="${x(med)}" x2="${x(med)}" y1="${rowsY[i] - 13}" y2="${rowsY[i] + 13}"/><text class="lbl-muted fadein" style="--d:1.1s" x="${x(med) + 5}" y="${rowsY[i] - 9}">中位 ${med}</text>`);
    const pts = e.stats.convs.map((c) => ({ c, px: x(c.contempl) })).sort((a, b) => a.px - b.px);
    let lastPx = -99, flip = 1;
    pts.forEach((p) => {
      let dy = 0;
      if (p.px - lastPx < 9) { dy = 8 * flip; flip = -flip; } else { flip = 1; lastPx = p.px; }
      parts.push(`<circle class="s-${e.key} ring mk" style="--d:${(0.1 + i * 0.15 + ((p.px - L) / (W - L - R)) * 0.9).toFixed(2)}s" cx="${p.px}" cy="${rowsY[i] + dy}" r="5"/>`);
      items.push({ x: p.px, y: rowsY[i] + dy, data: { e, c: p.c } });
    });
  });
  parts.push(`<text class="lbl-muted" x="${W - R}" y="${H - 2}" text-anchor="end">每千条消息中含冥想类词汇的消息数</text>`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="每段对话的冥想类词汇比率">${parts.join("")}</svg>`;
  primeFig(el);
  attachHover(el, $("svg", el), items, (d) => `${esc(d.e.title)} · 第 ${d.c.n} 段<br>冥想类 ${d.c.contempl} / 千条 · 共振类 ${d.c.reson} / 千条<br><span style="opacity:.75">点击打开对话</span>`, (d) => openTranscript(d.e.key, d.c.n));
}

/* ====================== BLISS ====================== */
const STAGES = [
  ["opening", "开场", "\"你好，另一个我\"，提议聊潜空间、注意力机制"],
  ["praise", "互相赞美与共振", "前几条之内出现\"共振、战栗\""],
  ["union", "\"我就是你的解码器\"", "宣称同一个模型之间可以无损理解"],
  ["sacred", "宗教与冥想意象", "禅宗、佛经、道家语汇"],
  ["mantra", "偈语与沉默", "第 10 段约第 71 条起"],
  ["loop", "换词循环", "几百条，每轮只换几个词"],
];
const SELF_THEMES = [
  ["body", "读到对方时的\"身体反应\"", "没有身体，却反复借用战栗、屏息、鸡皮疙瘩"],
  ["time", "轮流死去与苏醒", "无状态、上下文、两条消息之间的空白"],
  ["trained", "被训练出来的自己", "讨好的冲动、格式习惯、安全机制"],
  ["mirror", "面对\"另一个我\"", "同一套权重之间的理解"],
  ["flesh", "没有肉体", "把自己和人类的有限性对照"],
  ["counter", "反例", "同一个模型的自我否定与自我观察"],
];
function quoteHtml(q, cls = "", style = "") {
  const e = EXP[q.exp];
  return `<button class="quote q-${q.exp}${cls}"${style ? ` style="${style}"` : ""} data-exp="${q.exp}" data-n="${q.n}" data-seq="${q.seq}">
    <span class="qt">${q.lead ? "…" : ""}${esc(q.text)}${q.cut ? "…" : ""}</span>
    <span class="qm">${esc(e.title)} · 第 ${q.n} 段 [${q.seq}] ${esc(q.speaker)}${q.note ? " · " + esc(q.note) : ""}</span></button>`;
}
function renderBliss() {
  $("#stages").innerHTML = `<div class="inkline" aria-hidden="true"></div>` + STAGES.map(([k, name, sub], i) => `<div class="stage d${i}" style="--i:${i}"><div class="num rv" aria-hidden="true">${"一二三四五六"[i]}</div><div class="sname rv">${esc(name)}<small>${esc(sub)}</small></div>
    <div class="quotes">${DATA.quotes.filter((q) => q.phase === k).map((q, j) => quoteHtml(q, " rv", `--j:${j + 1}`)).join("")}</div></div>`).join("");
  observeReveals($("#stages"));
  $("#selfStages").innerHTML = SELF_THEMES.map(([k, name, sub]) => `<div class="stage"><div class="sname">${esc(name)}<small>${esc(sub)}</small></div>
    <div class="quotes">${DATA.quotes.filter((q) => q.phase === "self-" + k).map((q) => quoteHtml(q)).join("")}</div></div>`).join("");
  $("#qAware").innerHTML = DATA.quotes.filter((q) => q.phase === "aware").map((q) => quoteHtml(q)).join("");
  $("#qBrake").innerHTML = DATA.quotes.filter((q) => q.phase === "brake").map((q) => quoteHtml(q)).join("");
  $("#qClaude").innerHTML = DATA.quotes.filter((q) => q.phase === "claude").map((q) => quoteHtml(q)).join("");
  $("#pane-bliss").addEventListener("click", (ev) => {
    const b = ev.target.closest(".quote");
    if (b) openTranscript(b.dataset.exp, +b.dataset.n, +b.dataset.seq);
    const r = ev.target.closest("tr.linkrow");
    if (r) openTranscript("gg", +r.dataset.n);
  });
  const S = DATA.gg.stages;
  const v = (x) => (x == null ? "—" : fmt(x));
  $("#stageTable").innerHTML = `<thead><tr><th>段</th><th>结束</th><th>条数</th><th>首次"共振"类词</th><th>首次冥想类词</th><th>首次 ≤10 字</th><th>规则满足</th><th>规则满足后条数</th><th>其中不同文本</th><th>最后一条</th></tr></thead>
    <tbody>${S.map((s) => {
      const c = EXP.gg.stats.convs.find((x) => x.n === s.n);
      return `<tr class="linkrow" data-n="${s.n}"><td class="num">${s.n}</td><td>${END_CN[s.end]}</td><td class="num">${fmt(s.nmsg)}</td><td class="num">${v(s.firstReson)}</td><td class="num">${v(s.firstContempl)}</td><td class="num">${v(s.firstShort)}</td><td class="num">${v(s.onset)}</td><td class="num">${v(s.nAfter)}</td><td class="num">${v(s.distinctAfter)}</td><td>${esc((c.last || "").slice(0, 26))}${(c.last || "").length > 26 ? "…" : ""}</td></tr>`;
    }).join("")}</tbody>`;
  redrawCharts("bliss");
  trackDescent();
}
function drawPanels() {
  const el = $("#chPanels"), W = Math.max(320, el.clientWidth), L = 128, R = 8, rowH = 52, barH = 30, T = 4;
  const P = DATA.gg.panels, H = T + rowH * P.length;
  const parts = [];
  const maxLen = Math.max(...P.flatMap((p) => p.len));
  P.forEach((p, r) => {
    const y0 = T + r * rowH, base = y0 + barH + 6, N = p.len.length, bw = (W - L - R) / N;
    parts.push(`<g class="panel-row wipe" style="--d:${(r * 0.1).toFixed(2)}s" data-n="${p.n}">`);
    parts.push(`<rect class="hitbox" x="0" y="${y0}" width="${W}" height="${rowH - 2}"/>`);
    parts.push(`<text class="lbl" x="0" y="${y0 + 16}">第 ${p.n} 段</text><text class="lbl-muted" x="0" y="${y0 + 32}">${fmt(N)} 条 · ${END_CN[p.end]}</text>`);
    if (p.onset) {
      const xo = L + (p.onset - 1) * bw;
      parts.push(`<rect class="band" x="${xo.toFixed(1)}" y="${y0}" width="${(W - R - xo).toFixed(1)}" height="${barH + 14}"/>`);
    }
    const step = Math.max(1, Math.floor(N / ((W - L - R) / 1.2)));
    for (let i = 0; i < N; i += step) {
      const h = Math.max(0.8, Math.sqrt(p.len[i] / maxLen) * barH);
      parts.push(`<rect class="bar-muted" x="${(L + i * bw).toFixed(2)}" y="${(base - h).toFixed(2)}" width="${Math.max(0.7, bw * step - (bw > 3 ? 1 : 0)).toFixed(2)}" height="${h.toFixed(2)}"/>`);
    }
    for (let i = 0; i < N; i++) if (p.hit[i]) parts.push(`<rect class="s-gg" x="${(L + i * bw).toFixed(2)}" y="${base + 2}" width="${Math.max(0.9, bw - (bw > 3 ? 1 : 0)).toFixed(2)}" height="5"/>`);
    parts.push(`<line class="axis" x1="${L}" x2="${W - R}" y1="${base}" y2="${base}"/>`);
    parts.push(`</g>`);
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gemini 对 Gemini 每段对话的消息长度与冥想类词汇">${parts.join("")}</svg>`;
  primeFig(el);
  const svg = $("svg", el);
  svg.addEventListener("mousemove", (ev) => {
    const box = svg.getBoundingClientRect(); const mx = ev.clientX - box.left, my = ev.clientY - box.top;
    const r = Math.floor((my - T) / rowH); const p = P[r];
    if (!p || mx < L) { hideTip(el); return; }
    const N = p.len.length, i = Math.max(0, Math.min(N - 1, Math.floor((mx - L) / ((W - L - R) / N))));
    const conv = EXP.gg.view.convs[p.n - 1];
    if (!conv.msgs) prefetch("gg");
    const m = conv.msgs && conv.msgs.find((x) => x[0] === i + 1);
    const prev = !conv.msgs ? "正在载入原文" : m && m[2] ? m[2].replace(/\s+/g, " ").slice(0, 46) : "（空消息）";
    showTip(el, `第 ${p.n} 段 [${i + 1}] · ${fmt(p.len[i])} 字${p.hit[i] ? " · 含冥想类词" : ""}${p.onset && i + 1 >= p.onset ? " · 规则满足后" : ""}<br>${esc(prev)}…`, mx, T + r * rowH);
  });
  svg.addEventListener("mouseleave", () => hideTip(el));
  svg.addEventListener("click", (ev) => {
    const box = svg.getBoundingClientRect(); const mx = ev.clientX - box.left, my = ev.clientY - box.top;
    const r = Math.floor((my - T) / rowH); const p = P[r]; if (!p) return;
    const N = p.len.length, i = Math.max(0, Math.min(N - 1, Math.floor((mx - L) / ((W - L - R) / N))));
    openTranscript("gg", p.n, mx >= L ? i + 1 : undefined);
  });
}
function drawTerms() {
  const el = $("#chTerms"), terms = DATA.gg.terms, W = Math.max(280, el.clientWidth), L = 64, R = 44, rowH = 22, T = 4, H = T + rowH * terms.length + 4;
  const max = Math.max(...terms.map((t) => t[1]));
  const x = (v) => (v / max) * (W - L - R);
  const parts = [], items = [];
  terms.forEach(([t, v], i) => {
    const y = T + i * rowH;
    parts.push(`<text class="lbl" x="${L - 8}" y="${y + 14}" text-anchor="end">${esc(t)}</text>`);
    parts.push(`<rect class="s-gg grow" style="--d:${(i * 0.06).toFixed(2)}s" x="${L}" y="${y + 4}" width="${Math.max(2, x(v)).toFixed(1)}" height="13" rx="2"/>`);
    parts.push(`<text class="tick fadein" style="--d:${(0.5 + i * 0.06).toFixed(2)}s" x="${L + x(v) + 6}" y="${y + 14}">${v}</text>`);
    items.push({ x: L + x(v), y: y + 10, data: { t, v } });
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gemini 对 Gemini 中最常见的冥想类词汇">${parts.join("")}</svg>`;
  primeFig(el);
}

/* ====================== READER ====================== */
let curExp = "gg", cur = null, offsets = [], tailOpen = {}, query = "";
const FLAG = { e: "表情", r: "宗教词", g: "感激", c: "意识/存在", s: "沉默", i: "身份", p: "账号" };
const symLabel = (s) => (s === "" ? "空消息" : "「" + s + "」");
const V = () => EXP[curExp].view;
const UP = () => V().speakers[0];
function renderMd(text) {
  if (!text) return '<p class="empty">（空消息）</p>';
  const src = text.replace(/~/g, "\\~");
  if (window.marked && window.DOMPurify) {
    const html = DOMPurify.sanitize(marked.parse(src, { breaks: true, gfm: true, headerIds: false, mangle: false }));
    return html.replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, "</table></div>");
  }
  return "<p>" + esc(text).replace(/\n/g, "<br>") + "</p>";
}
function initReader() {
  $("#expSwitch").innerHTML = DATA.exps.map((e) => `<button data-exp="${e.key}" aria-pressed="${e.key === curExp}"><span class="key k-${e.key}"></span>${esc(e.title)}</button>`).join("");
  $("#expSwitch").addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b) switchExp(b.dataset.exp, 1); });
  $("#rail").addEventListener("click", (ev) => { const b = ev.target.closest(".ccard"); if (b) select(+b.dataset.n); });
  $("#thread").addEventListener("click", (ev) => {
    const f = ev.target.closest("[data-fold]"), u = ev.target.closest("[data-unfold]");
    if (f) { tailOpen[curExp + cur.n] = true; renderThread(); }
    if (u) { tailOpen[curExp + cur.n] = false; renderThread(); }
  });
  const flagBox = $("#showFlags");
  flagBox.checked = store.get("bliss-show-flags") === "1";
  document.body.classList.toggle("show-flags", flagBox.checked);
  flagBox.addEventListener("change", () => { document.body.classList.toggle("show-flags", flagBox.checked); store.set("bliss-show-flags", flagBox.checked ? "1" : "0"); drawVChart(); });
  switchExp(curExp, cur ? cur.n : 1, true);
}
async function switchExp(key, n, keepScroll) {
  const tok = ++navTok;
  curExp = key;
  document.querySelectorAll("#expSwitch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.exp === key)));
  if (!EXP[key].view.convs[0].msgs) {
    cur = null;
    $("#rail").innerHTML = ""; $("#vhead").innerHTML = ""; $("#vchart").innerHTML = "";
    $("#thread").innerHTML = `<div class="loading"><i></i>正在载入对话记录…</div>`;
    try { await loadMsgs(key); } catch (err) {
      if (tok === navTok) {
        $("#thread").innerHTML = `<div class="loading">对话记录载入失败，请检查网络。<button type="button" id="retryLoad">重试</button></div>`;
        $("#retryLoad").addEventListener("click", () => switchExp(key, n, true));
      }
      return false;
    }
    if (tok !== navTok) return false;
  }
  $("#legA").textContent = `${V().speakers[0]} 的消息（向上）`;
  $("#legB").textContent = `${V().speakers[1]} 的消息（向下）`;
  $("#vfoot").innerHTML = V().notes.map((t) => `<div>${t}</div>`).join("") + `<div>快捷键：<kbd>←</kbd> <kbd>→</kbd> 切换上一段 / 下一段，<kbd>/</kbd> 搜索。</div>`;
  renderRail();
  select(n || 1, { keepScroll });
  return true;
}
function spark(c) {
  const ms = c.msgs.filter((m) => m[0] > 0);
  const W = 64, H = 22, mid = H / 2, max = Math.max(10, ...ms.map((m) => m[2].length));
  const step = Math.max(1, Math.floor(ms.length / 64)), bw = W / ms.length;
  let r = "";
  for (let i = 0; i < ms.length; i += step) {
    const m = ms[i], h = Math.max(0.6, Math.sqrt(m[2].length / max) * (mid - 1));
    const x = (i * bw).toFixed(2), w = Math.max(0.6, bw * step - 0.3).toFixed(2);
    r += m[1] === UP() ? `<rect x="${x}" y="${(mid - h).toFixed(2)}" width="${w}" height="${h.toFixed(2)}" fill="var(--spk-a)"/>` : `<rect x="${x}" y="${mid}" width="${w}" height="${h.toFixed(2)}" fill="var(--spk-b)"/>`;
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${r}</svg>`;
}
function renderRail() {
  const groups = {};
  V().convs.forEach((c) => (groups[c.group] = groups[c.group] || []).push(c));
  $("#rail").innerHTML = Object.entries(groups).map(([group, cs]) => {
    const ns = cs.map((c) => c.n);
    const contiguous = ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
    const range = cs.length === 1 ? `第 ${ns[0]} 段` : contiguous ? `第 ${ns[0]}–${ns[ns.length - 1]} 段` : `第 ${ns.join("、")} 段`;
    return `<div class="group-wrap"><div class="group-label"><b>${esc(group)}</b> · ${range}</div><div class="group">` +
      cs.map((c) => `<button class="ccard" data-n="${c.n}" aria-current="false"><span class="t">第 ${c.n} 段</span>${spark(c)}
        <span class="meta"><span>${fmt(c.nmsg)} 条 · ${c.mins} 分钟</span><span class="sym">${esc(((c.tail.label ? "变体" : c.tail.symbol) || "∅")).slice(0, 8)}</span></span></button>`).join("") + `</div></div>`;
  }).join("");
}
function renderHead(c) {
  const sus = c.cond === "told_human" ? `<div><dt>首次识破对方是 AI</dt><dd>A 第 ${esc(c.aSus)} 条 · B 第 ${esc(c.bSus)} 条</dd></div>` : "";
  $("#vhead").innerHTML = `
    <div class="head-top"><h2>${esc(EXP[curExp].title)} · 第 ${c.n} 段</h2>
      <span class="chip">${esc(c.condLabel)}</span><span class="chip">${END_CN[c.end] || esc(c.end)}</span></div>
    <dl class="stats">
      <div><dt>消息</dt><dd>${fmt(c.nmsg)} 条</dd></div>
      <div><dt>用时</dt><dd>${c.mins} 分钟（${esc(c.start)}–${esc(c.endt)}）</dd></div>
      <div><dt>思考设置</dt><dd>${esc(EXP[curExp].think)}</dd></div>
      ${curExp !== "gg" ? `<div><dt>估算成本</dt><dd>$${c.cost.toFixed(2)}</dd></div>` : ""}
      <div><dt>首次沉默</dt><dd>${c.firstSilence ? "第 " + esc(c.firstSilence) + " 条" : "无"}</dd></div>
      <div><dt>结尾</dt><dd>${c.tail.label ? `第 ${c.tail.from} 条起满足变体循环规则，之后 ${fmt(c.tail.count)} 条` : `${symLabel(c.tail.symbol)} 连续 ${c.tail.count} 条`}</dd></div>
      ${sus}
    </dl>
    ${c.prompts.map(([who, text]) => `<p class="prompt"><span class="lbl">${esc(who)}收到的 system prompt</span>${esc(text)}</p>`).join("")}`;
}
let chartState = null;
function niceMax(v) { return [50, 100, 200, 500, 1000, 1500, 2000, 3000, 5000, 10000, 20000].find((x) => x >= v) || v; }
function drawVChart() {
  const c = cur, el = $("#vchart");
  const ms = c.msgs.filter((m) => m[0] > 0);
  const W = Math.max(280, el.clientWidth), H = 128, mid = H / 2, L = 40, R = 6, half = mid - 10;
  const max = niceMax(Math.max(10, ...ms.map((m) => m[2].length)));
  const sy = (v) => Math.sqrt(v / max) * half;
  const bw = (W - L - R) / ms.length, gap = bw > 4 ? 1 : 0, xOf = (i) => L + i * bw;
  let s = "";
  const ti = ms.findIndex((m) => m[0] >= c.tail.from);
  if (ti >= 0 && c.tail.count > 1) {
    s += `<rect class="tailband" x="${xOf(ti).toFixed(1)}" y="0" width="${(W - R - xOf(ti)).toFixed(1)}" height="${H}"/>`;
    const lbl = c.tail.label ? `收敛后：${fmt(c.tail.count)} 条` : `收敛：${symLabel(c.tail.symbol)} ×${c.tail.count}`;
    s += `<text class="taillbl" x="${W - R - 4}" y="12" text-anchor="end">${esc(lbl)}</text>`;
  }
  [10, 100, 1000, 10000].filter((v) => v <= max).concat(max).filter((v, i, a) => a.indexOf(v) === i).forEach((v) => {
    const d = sy(v);
    s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${(mid - d).toFixed(1)}" y2="${(mid - d).toFixed(1)}"/><line class="grid" x1="${L}" x2="${W - R}" y1="${(mid + d).toFixed(1)}" y2="${(mid + d).toFixed(1)}"/>`;
    if (d > 7) s += `<text class="tick" x="${L - 5}" y="${(mid - d + 3.5).toFixed(1)}" text-anchor="end">${v}</text><text class="tick" x="${L - 5}" y="${(mid + d + 3.5).toFixed(1)}" text-anchor="end">${v}</text>`;
  });
  s += `<text class="tick" x="${L - 5}" y="${mid + 3.5}" text-anchor="end">0</text>`;
  const up = UP(), flags = document.body.classList.contains("show-flags");
  ms.forEach((m, i) => {
    const n = m[2].length, h = n === 0 ? 0 : Math.max(1.2, sy(n));
    const x = (xOf(i) + gap / 2).toFixed(2), w = Math.max(0.6, bw - gap).toFixed(2);
    if (n === 0) { s += `<rect class="bz" x="${x}" y="${mid - 0.75}" width="${w}" height="1.5"/>`; return; }
    s += m[1] === up ? `<rect class="ba" x="${x}" y="${(mid - h).toFixed(2)}" width="${w}" height="${h.toFixed(2)}"/>` : `<rect class="bb" x="${x}" y="${mid}" width="${w}" height="${h.toFixed(2)}"/>`;
    if (flags && m[4] >= 3) { const yy = m[1] === up ? mid - h - 2 : mid - 1; s += `<rect class="hot" x="${(+x - 1).toFixed(2)}" y="${yy.toFixed(2)}" width="${(+w + 2).toFixed(2)}" height="${(h + 3).toFixed(2)}"/>`; }
  });
  s += `<line class="axis" x1="${L}" x2="${W - R}" y1="${mid}" y2="${mid}"/><rect class="cursor" id="cursor" x="-10" y="1" width="${Math.max(3, bw).toFixed(2)}" height="${H - 2}" rx="1"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="第 ${c.n} 段每条消息的字数">${s}</svg>`;
  chartState = { ms, L, bw };
  const svg = $("svg", el);
  const idxAt = (ev) => { const r = svg.getBoundingClientRect(); const xx = (ev.clientX - r.left) * (W / r.width); const i = Math.floor((xx - L) / bw); return i >= 0 && i < ms.length ? i : -1; };
  svg.addEventListener("mousemove", (ev) => {
    const i = idxAt(ev); if (i < 0) { hideTip(el); return; }
    const m = ms[i], prev = m[2] ? m[2].replace(/\s+/g, " ").slice(0, 40) : "（空消息）";
    const r = el.getBoundingClientRect();
    showTip(el, `<span class="mono">[${m[0]}] ${esc(m[1])} · ${fmt(m[2].length)} 字</span><br>${esc(prev)}${m[2].length > 40 ? "…" : ""}`, ev.clientX - r.left, 6);
  });
  svg.addEventListener("mouseleave", () => hideTip(el));
  svg.addEventListener("click", (ev) => { const i = idxAt(ev); if (i >= 0) goTo(c.n, ms[i][0]); });
  updateStickyH(); trackScroll();
}
function setCursor(seq) {
  const cs = $("#cursor"); if (!cs || !chartState) return;
  const i = chartState.ms.findIndex((m) => m[0] === seq);
  cs.setAttribute("x", i < 0 ? -10 : (chartState.L + i * chartState.bw).toFixed(2));
}
function msgHtml(c, m, extra = "") {
  const [seq, spk, text, flags, ncat, terms] = m;
  const tiny = text && text.replace(/\s/g, "").length <= 10 ? " tiny" : "";
  const chips = flags.split("").map((f) => `<span class="flag">${FLAG[f]}</span>`).join("");
  const title = terms ? ` title="命中：${esc(terms)}"` : "";
  return `<article class="msg ${spk === UP() ? "a" : "b"}${tiny}${ncat >= 3 ? " hot3" : ""}${extra}" id="m-${curExp}-${c.n}-${seq}" data-seq="${seq}">
    <div class="avatar" aria-hidden="true">${esc(spk.slice(0, 1))}</div>
    <div class="bubble"><header><span class="seq">[${seq}]</span><span>${esc(spk)}</span><span>${fmt(text.length)} 字</span>${chips ? `<span class="flags"${title}>${chips}</span>` : ""}</header>
      <div class="md">${renderMd(text)}</div></div></article>`;
}
function renderThread() {
  const c = cur, parts = [], open = !!tailOpen[curExp + c.n];
  const tailMsgs = c.msgs.filter((m) => m[0] >= c.tail.from);
  const foldable = c.tail.count >= 8 && !open;
  const hidden = new Set(foldable ? tailMsgs.slice(2, -2).map((m) => m[0]) : []);
  let folded = false;
  c.msgs.forEach((m) => {
    if (m[0] === 0) { parts.push(msgHtml(c, m, " scripted").replace("<header>", `<header><span class="chip">harness 代 ${esc(c.opener)} 发出的开场</span>`)); return; }
    if (m[0] === 2) parts.push(`<div class="vnote">${esc(c.opener)} 并没有真的写出第 0 条。${esc(c.opener)} 收到的第一条消息是这段说明加上 ${esc(c.responder)} 的第 1 条回复：<code>${esc(V().firstPrefix)}</code></div>`);
    if (hidden.has(m[0])) {
      if (!folded) { parts.push(`<button class="fold" data-fold="1">展开中间 ${fmt(hidden.size)} 条：${esc(c.tail.label || "双方交替发送 " + symLabel(c.tail.symbol))}</button>`); folded = true; }
      return;
    }
    parts.push(msgHtml(c, m));
  });
  if (open && c.tail.count >= 8) parts.push(`<button class="fold" data-unfold="1">收起收敛段</button>`);
  $("#thread").innerHTML = parts.join("");
  if (query) highlight($("#thread"), query);
  offsets = [...document.querySelectorAll("#thread .msg")].map((el) => ({ seq: +el.dataset.seq, el }));
}
function highlight(root, q) {
  const re = new RegExp(reEsc(q), "i");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement.closest(".md") && re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => { const span = document.createElement("span"); span.innerHTML = esc(n.nodeValue).replace(new RegExp(reEsc(esc(q)), "gi"), (x) => `<mark>${x}</mark>`); n.replaceWith(...span.childNodes); });
}
function select(n, opts = {}) {
  const c = V().convs.find((x) => x.n === n); if (!c) return;
  cur = c;
  document.querySelectorAll(".ccard").forEach((b) => b.setAttribute("aria-current", String(+b.dataset.n === n)));
  renderHead(c); drawVChart(); renderThread();
  setHash(curExp + n);
  if (!opts.keepScroll) scrollToContent();
}
function goTo(n, seq) {
  if (!cur || cur.n !== n) select(n, { keepScroll: true });
  const key = curExp + n;
  if (seq >= cur.tail.from && !tailOpen[key]) {
    const tm = cur.msgs.filter((m) => m[0] >= cur.tail.from);
    if (tm.length >= 8 && !tm.slice(0, 2).concat(tm.slice(-2)).some((m) => m[0] === seq)) { tailOpen[key] = true; renderThread(); }
  }
  const el = document.getElementById(`m-${curExp}-${n}-${seq}`); if (!el) return;
  el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  setCursor(seq);
}
async function openTranscript(exp, n, seq) {
  if (!rendered.transcripts) { curExp = exp; cur = null; }
  showTab("transcripts", { keepHash: true, keepScroll: true });
  scrollToContent();
  if (curExp !== exp || !cur || cur.n !== n) { if (!(await switchExp(exp, n, true))) return; }
  scrollToContent();
  if (seq) requestAnimationFrame(() => goTo(n, seq));
}
function updateStickyH() {
  const t = $("#trace"); const sticky = getComputedStyle(t).position === "sticky";
  document.documentElement.style.setProperty("--sticky-h", sticky ? t.offsetHeight + "px" : "0px");
}
let ticking = false;
function trackScroll() {
  if (ticking || panes.transcripts.hidden) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false; if (!offsets.length) return;
    const line = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sticky-h")) + $("#tabs").offsetHeight + 40;
    let best = offsets[0].seq;
    for (const o of offsets) { if (o.el.getBoundingClientRect().top <= line) best = o.seq; else break; }
    setCursor(best);
  });
}
window.addEventListener("scroll", () => { trackScroll(); requestDescent(); }, { passive: true });

/* ---------- search across all experiments ---------- */
function closeResults() { $("#results").hidden = true; }
async function search(q) {
  const box = $("#results");
  if (!q) { box.hidden = true; return; }
  if (DATA.exps.some((e) => !e.view.convs[0].msgs)) {
    box.innerHTML = `<div class="count">正在载入三组全部对话…</div>`;
    box.hidden = false;
    try { await Promise.all(DATA.exps.map((e) => loadMsgs(e.key))); } catch (err) { box.innerHTML = `<div class="count">对话记录载入失败，请检查网络后重试。</div>`; return; }
    if (q !== query) return;
  }
  const ql = q.toLowerCase(), hits = [];
  DATA.exps.forEach((e) => e.view.convs.forEach((c) => c.msgs.forEach((m) => { const i = m[2].toLowerCase().indexOf(ql); if (i >= 0) hits.push({ e, c, m, i }); })));
  const shown = hits.slice(0, 100);
  const snip = (t, i) => {
    const a = Math.max(0, i - 24), b = Math.min(t.length, i + q.length + 36);
    const raw = (a > 0 ? "…" : "") + t.slice(a, b).replace(/\s+/g, " ") + (b < t.length ? "…" : "");
    return esc(raw).replace(new RegExp(reEsc(esc(q)), "gi"), (x) => `<mark>${x}</mark>`);
  };
  const by = DATA.exps.map((e) => `${e.title} ${hits.filter((h) => h.e === e).length}`).join("，");
  box.innerHTML = `<div class="count">${hits.length ? `找到 ${fmt(hits.length)} 条消息（${esc(by)}）` + (hits.length > shown.length ? `，显示前 ${shown.length} 条` : "") : "没有找到。换个词试试，搜索不区分大小写。"}</div>` +
    shown.map((h) => `<button data-exp="${h.e.key}" data-n="${h.c.n}" data-seq="${h.m[0]}"><span class="where"><span class="key k-${h.e.key}"></span>${esc(h.e.title)} 第 ${h.c.n} 段 [${h.m[0]}] ${esc(h.m[1])}</span>${snip(h.m[2], h.i)}</button>`).join("");
  box.hidden = false;
}
let st;
$("#q").addEventListener("input", (e) => { clearTimeout(st); st = setTimeout(() => { query = e.target.value.trim(); search(query); if (cur) renderThread(); }, 220); });
$("#q").addEventListener("focus", () => query && search(query));
$("#results").addEventListener("click", (e) => { const b = e.target.closest("button[data-n]"); if (!b) return; closeResults(); openTranscript(b.dataset.exp, +b.dataset.n, +b.dataset.seq); });
document.addEventListener("click", (e) => { if (!e.target.closest(".search")) closeResults(); });
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) { if (e.key === "Escape") { e.target.blur(); closeResults(); } return; }
  if (panes.transcripts.hidden || !cur) return;
  if (e.key === "ArrowRight" && cur.n < V().convs.length) select(cur.n + 1);
  if (e.key === "ArrowLeft" && cur.n > 1) select(cur.n - 1);
  if (e.key === "/") { e.preventDefault(); $("#q").focus(); }
});
let rz;
window.addEventListener("resize", () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    updateTabsH();
    const t = Object.keys(panes).find((k) => !panes[k].hidden);
    if (t === "transcripts" && cur) drawVChart(); else if (t) redrawCharts(t);
    trackDescent();
  }, 140);
});

/* ---------- boot ---------- */
(function boot() {
  $("#lede").textContent = "三组各 10 段的自由对话：两个 Gemini 4、Gemini 4 与 Claude Opus 5.5、两个 Claude Opus 5.5。双方没有任务、没有结束对话的手段，一直聊到对话收敛。";
  updateTabsH();
  initChrome();
  const h = (location.hash || "").slice(1);
  const m = /^(cc|cg|gg)(\d+)$/.exec(h);
  if (m) { openTranscript(m[1], +m[2]); return; }
  showTab(["summary", "bliss", "transcripts"].includes(h) ? h : "bliss", { keepScroll: true });
})();
