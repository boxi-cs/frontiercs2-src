// L03 demos. The JS models repeat the Python programs in frontiercs2/notes/L03-architecture.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

const fmt = (x) => x.toLocaleString("en-US");

// ---------- branch prediction: counters, history, register values ----------

// Predict with the two-bit counter at table[key] (0..3, taken if 2 or 3), then train it.
function bpStep(table, key, taken) {
  const counter = table.has(key) ? table.get(key) : 2;
  table.set(key, taken ? Math.min(3, counter + 1) : Math.max(0, counter - 1));
  return { pred: counter >= 2, miss: (counter >= 2) !== taken ? 1 : 0 };
}
const loopBranch = (trips, times) => {
  const out = [];
  for (let t = 0; t < times; t++) { for (let i = 0; i < trips - 1; i++) out.push(true); out.push(false); }
  return out;
};
const alternating = (times) => { const out = []; for (let t = 0; t < times; t++) out.push(true, false); return out; };

// Park-Miller generator, exact in JS: the product stays below 2^53.
class Rng {
  constructor(seed) { this.state = seed; }
  next() { this.state = (this.state * 48271) % 2147483647; return this.state; }
}
function dataBranch(n, seed = 1) {
  const rng = new Rng(seed), trace = [];
  for (let i = 0; i < n; i++) {
    const x = rng.next() % 64;
    trace.push([x, rng.next() % 4 !== 0, x % 3 === 0]);
  }
  return trace;
}

// One predictor over a trace of [x, ready, taken]; h = history length, reg = use register values.
class Predictor {
  constructor(h, reg) { this.h = h; this.reg = reg; this.byHistory = new Map(); this.byValue = new Map(); this.history = []; this.misses = 0; this.seen = 0; }
  step([x, ready, taken]) {
    const key = this.history.map((t) => (t ? "T" : "N")).join("");
    const viaHistory = bpStep(this.byHistory, key, taken);
    let r = viaHistory, source = this.h ? `history ${key}` : "counter";
    if (this.reg && ready) { r = bpStep(this.byValue, x, taken); source = `value ${x}`; }
    this.misses += r.miss; this.seen++;
    if (this.h) { this.history.push(taken); if (this.history.length > this.h) this.history.shift(); }
    return { pred: r.pred, miss: r.miss, taken, x, ready, source };
  }
}
const runAll = (trace, h, reg) => { const p = new Predictor(h, reg); trace.forEach((e) => p.step(e)); return p.misses; };
const asTrace = (outcomes) => outcomes.map((t) => [0, false, t]);

const BP_TRACES = {
  loop: { name: "Loop of 8", h: 7, trace: () => asTrace(loopBranch(8, 100)) },
  alt: { name: "Alternating", h: 1, trace: () => asTrace(alternating(400)) },
  data: { name: "x % 3 == 0", h: 4, trace: () => dataBranch(1000) },
};

function bpCells(log) {
  return log.map((e) => `<span class="bp-cell ${e.miss ? "miss" : "hit"}" title="${e.taken ? "taken" : "not taken"}, predicted ${e.pred ? "taken" : "not taken"}">${e.taken ? "T" : "N"}</span>`).join("");
}

function demoPredictor(el) {
  let which = "loop", kind = "counter", h = 7, trace, p, pos, log;
  el.innerHTML = `
    <div class="controls"><span class="bp-lab">Branch</span>${Object.entries(BP_TRACES).map(([k, t]) => `<button class="cbtn tr" data-k="${k}">${t.name}</button>`).join("")}</div>
    <div class="controls"><span class="bp-lab">Predictor</span>
      <button class="cbtn pk" data-k="counter">Two-bit counter</button>
      <button class="cbtn pk" data-k="history">History</button>
      <button class="cbtn pk" data-k="register">History + register</button>
      <label>history <input class="hl" type="range" min="1" max="8" value="7"><b class="hv mono">7</b></label></div>
    <div class="bp-strip"></div>
    <div class="stats"></div>
    <div class="controls"><button class="cbtn on st1">Step</button><button class="cbtn st50">Run 50</button><button class="cbtn stall">Run to the end</button><span class="spacer"></span><button class="cbtn reset">Reset</button></div>
    <div class="msg"></div>`;
  const msg = el.querySelector(".msg");
  const reset = () => {
    trace = BP_TRACES[which].trace(); pos = 0; log = [];
    p = new Predictor(kind === "counter" ? 0 : h, kind === "register");
    msg.textContent = which === "data"
      ? "Each branch tests a value x from 0 to 63; the value is ready 3 times in 4. Green: right guess. Red: miss."
      : "Each cell is one outcome: T taken, N not taken. Green: right guess. Red: miss.";
    draw();
  };
  const run = (n) => {
    let last = null;
    for (let i = 0; i < n && pos < trace.length; i++) { last = p.step(trace[pos++]); log.push(last); }
    if (log.length > 48) log = log.slice(-48);
    if (last) {
      msg.textContent = pos >= trace.length
        ? `End of the trace: ${p.misses} misses in ${trace.length} branches.`
        : `Branch ${pos}: ${last.taken ? "taken" : "not taken"}${which === "data" ? ` (x = ${last.x}, ${last.ready ? "ready" : "not ready"})` : ""}; predicted from ${last.source}: ${last.miss ? "miss" : "hit"}.`;
    }
    draw();
  };
  const draw = () => {
    el.querySelectorAll(".tr").forEach((b) => b.classList.toggle("on", b.dataset.k === which));
    el.querySelectorAll(".pk").forEach((b) => {
      b.classList.toggle("on", b.dataset.k === kind);
      b.disabled = b.dataset.k === "register" && which !== "data";
    });
    el.querySelector(".hl").disabled = kind === "counter";
    el.querySelector(".bp-strip").innerHTML = log.length ? bpCells(log) : `<span class="bp-empty">Press Step.</span>`;
    const full = runAll(trace, kind === "counter" ? 0 : h, kind === "register");
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>branches</small><b>${pos} / ${trace.length}</b></div>
      <div class="stat ${p.misses ? "bad" : ""}"><small>misses so far</small><b>${p.misses}</b></div>
      <div class="stat"><small>whole trace</small><b>${full} misses</b></div>`;
  };
  const setH = (v) => { h = v; el.querySelector(".hl").value = v; el.querySelector(".hv").textContent = v; };
  el.querySelectorAll(".tr").forEach((b) => {
    b.onclick = () => {
      which = b.dataset.k;
      if (which !== "data" && kind === "register") kind = "history";
      setH(BP_TRACES[which].h);  // the history length the notes use for this branch
      reset();
    };
  });
  el.querySelectorAll(".pk").forEach((b) => { b.onclick = () => { kind = b.dataset.k; reset(); }; });
  el.querySelector(".hl").oninput = (e) => { h = +e.target.value; el.querySelector(".hv").textContent = h; reset(); };
  el.querySelector(".st1").onclick = () => run(1);
  el.querySelector(".st50").onclick = () => run(50);
  el.querySelector(".stall").onclick = () => run(trace.length);
  el.querySelector(".reset").onclick = reset;
  reset();
}

// Hero: the loop branch, a two-bit counter against seven outcomes of history.
function demoPredictorMini(el) {
  const trace = asTrace(loopBranch(8, 100));
  let a, b, pos, logA, logB;
  el.innerHTML = `<div class="bp-row"><span class="bp-lab">Two-bit counter</span><div class="bp-strip a"></div></div>
    <div class="bp-row"><span class="bp-lab">History of 7</span><div class="bp-strip b"></div></div><div class="msg"></div>`;
  const start = () => { a = new Predictor(0, false); b = new Predictor(7, false); pos = 0; logA = []; logB = []; };
  const tick = () => {
    if (pos >= 64) start();
    for (let i = 0; i < 2; i++) { logA.push(a.step(trace[pos])); logB.push(b.step(trace[pos])); pos++; }
    logA = logA.slice(-24); logB = logB.slice(-24);
    el.querySelector(".a").innerHTML = bpCells(logA);
    el.querySelector(".b").innerHTML = bpCells(logB);
    el.querySelector(".msg").textContent = `A loop of 8, ${pos} branches: the counter has missed ${a.misses}, the history table ${b.misses}.`;
  };
  start(); tick();
  setInterval(tick, 900);
}

// ---------- the newest producer of a register ----------

const PRODUCER_EVENTS = [["decode", 10], ["decode", 12], ["execute", 12, 5], ["predict", 13],
  ["execute", 10, 9], ["predict", 14], ["decode", 15], ["predict", 16]];

// Returns one line per event, as the Python prints, plus the naive "last written" value.
function newestProducer(events) {
  let claim = null, value = null, naive = null;
  return events.map(([kind, seq, v]) => {
    let line;
    if (kind === "decode") { claim = seq; value = null; line = `decode  #${seq} will write r3  -> r3 unusable`; }
    else if (kind === "execute" && seq === claim) { value = v; naive = v; line = `execute #${seq} r3 = ${String(v).padEnd(3)}  -> r3 = ${v}`; }
    else if (kind === "execute") { naive = v; line = `execute #${seq} r3 = ${String(v).padEnd(3)}  -> ignored, #${claim} is newer`; }
    else line = `predict #${seq}             -> uses r3 = ${value === null ? "None" : value}`;
    return { kind, seq, v, claim, value, naive, line };
  });
}

function demoProducer(el) {
  const rows = newestProducer(PRODUCER_EVENTS);
  let k = 0;
  el.innerHTML = `<div class="pr-table"></div>
    <div class="controls"><button class="cbtn on next">Next event</button><button class="cbtn reset">Reset</button></div>
    <div class="msg"></div>`;
  const draw = () => {
    el.querySelector(".pr-table").innerHTML = `<table><tr><th>Event</th><th>Newest claim</th><th>r3, newest rule</th><th>r3, last written</th></tr>
      ${rows.map((r, i) => {
        const what = r.kind === "decode" ? `decode #${r.seq} → r3` : r.kind === "execute" ? `#${r.seq} runs: r3 = ${r.v}` : `predict #${r.seq}`;
        const bad = r.kind === "predict" && r.naive !== r.value;
        return `<tr class="${i < k ? "" : "later"}${i === k - 1 ? " cur" : ""}"><td>${what}</td><td>#${r.claim}</td>
          <td>${r.value === null ? "unusable" : r.value}</td><td class="${bad ? "stale" : ""}">${r.naive === null ? "—" : r.naive}${bad ? " (stale)" : ""}</td></tr>`;
      }).join("")}</table>`;
    const r = rows[k - 1];
    const msg = el.querySelector(".msg");
    if (!r) msg.textContent = "Eight events on register r3, in the order the processor delivers them. Press Next event.";
    else if (r.kind === "predict" && r.naive !== r.value) msg.textContent = `Prediction #${r.seq}: the newest rule uses ${r.value === null ? "no value" : r.value}; "last written" would use ${r.naive}, a value the program has already overwritten.`;
    else msg.textContent = r.line.replace(/\s+/g, " ");
    el.querySelector(".next").disabled = k >= rows.length;
  };
  el.querySelector(".next").onclick = () => { k++; draw(); };
  el.querySelector(".reset").onclick = () => { k = 0; draw(); };
  draw();
}

// ---------- RUNLTS: score, and winning every trace ----------

const runltsScore = (b, w) => 100 / Math.sqrt((1 + b) * (1 + w / 100));

// erf by Abramowitz and Stegun 7.1.26 (error below 1.5e-7).
function erf(x) {
  const s = Math.sign(x), t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const chanceAllWin = (gain, noise, traces = 105) => (0.5 * (1 + erf(gain / (noise * Math.SQRT2)))) ** traces;

// A normal sample from two uniforms of our generator (Box-Muller), for the dot row.
function normals(n, seed) {
  const rng = new Rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const u1 = rng.next() / 2147483647, u2 = rng.next() / 2147483647;
    out.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
  }
  return out;
}

function demoAllWin(el) {
  let seed = 7;
  el.innerHTML = `<div class="controls">
      <label>average gain <input class="g" type="range" min="0" max="60" value="20"><b class="gv mono"></b></label>
      <label>noise per trace <input class="n" type="range" min="2" max="30" value="10"><b class="nv mono"></b></label></div>
    <div class="aw-dots"></div>
    <div class="stats"></div>
    <div class="controls"><button class="cbtn draw">Draw 105 new traces</button></div>
    <p class="hint">Each dot is one trace: green if the candidate beat the reference there, red if not. The chance is for all 105 at once, from the model in the notes.</p>`;
  const draw = () => {
    const gain = +el.querySelector(".g").value / 1000, noise = +el.querySelector(".n").value / 1000;
    el.querySelector(".gv").textContent = `${(gain * 100).toFixed(1)}%`;
    el.querySelector(".nv").textContent = `${(noise * 100).toFixed(1)}%`;
    const z = normals(105, seed), wins = z.map((v) => gain + noise * v > 0);
    el.querySelector(".aw-dots").innerHTML = wins.map((w) => `<i class="${w ? "w" : "l"}"></i>`).join("");
    const lost = wins.filter((w) => !w).length, p = chanceAllWin(gain, noise);
    el.querySelector(".stats").innerHTML = `
      <div class="stat ${lost ? "bad" : "good"}"><small>traces lost, this draw</small><b>${lost}</b></div>
      <div class="stat ${p > 0.9 ? "good" : p < 0.1 ? "bad" : ""}"><small>chance to win all 105</small><b>${p.toFixed(3)}</b></div>
      <div class="stat"><small>chance to win one trace</small><b>${(0.5 * (1 + erf(gain / (noise * Math.SQRT2)))).toFixed(3)}</b></div>`;
  };
  el.querySelector(".g").oninput = draw;
  el.querySelector(".n").oninput = draw;
  el.querySelector(".draw").onclick = () => { seed = seed * 31 % 2147483647 + 1; draw(); };
  draw();
}

// ---------- KAMI: memory bound, and the warp layout ----------

const SHAPES = [[16, 16, 24, 65536], [32, 64, 48, 8192], [64, 64, 32, 8192], [128, 64, 64, 4096]];
const PEAK_TFLOPS = 67, BANDWIDTH_TBS = 3.35;
const blockCost = (m, n, k) => ({ flops: 2 * m * n * k, moved: 8 * (m * k + n * k + 2 * m * n) });
const sharedLoads = (m, n, k, rows, cols) => k * (m * cols + n * rows);
function layouts(m, n, k, warps) {
  const out = [];
  for (let r = 1; r <= warps; r++) {
    if (warps % r) continue;
    const c = warps / r;
    out.push({ rows: r, cols: c, loads: sharedLoads(m, n, k, r, c), ok: (m / 16) % r === 0 && (n / 8) % c === 0 });
  }
  return out;
}
function bestLayout(m, n, k, warps) {
  const ok = layouts(m, n, k, warps).filter((l) => l.ok);
  if (!ok.length) return null;
  return ok.reduce((a, b) => (b.loads < a.loads || (b.loads === a.loads && b.rows < a.rows) ? b : a));
}
const kamiScore = (g) => Math.max(0, Math.min(100, 100 * g / (g + 20)));

function demoKami(el) {
  let s = 3, warps = 4, pick = null;
  el.innerHTML = `<div class="controls"><span class="bp-lab">Shape</span>${SHAPES.map(([m, n, k], i) => `<button class="cbtn sh" data-i="${i}">${m}×${n}×${k}</button>`).join("")}</div>
    <div class="km-roof"></div>
    <div class="controls"><span class="bp-lab">Warps</span>${[1, 2, 4, 8].map((w) => `<button class="cbtn wp" data-w="${w}">${w}</button>`).join("")}</div>
    <div class="km-grid"><div class="svgbox km-c"></div><div class="km-opts"></div></div>
    <div class="msg"></div>`;
  const draw = () => {
    const [m, n, k, batch] = SHAPES[s], { flops, moved } = blockCost(m, n, k);
    const ai = flops / moved, bound = Math.min(PEAK_TFLOPS, ai * BANDWIDTH_TBS);
    el.querySelectorAll(".sh").forEach((b) => b.classList.toggle("on", +b.dataset.i === s));
    el.querySelectorAll(".wp").forEach((b) => b.classList.toggle("on", +b.dataset.w === warps));
    el.querySelector(".km-roof").innerHTML = `
      <div class="stats">
        <div class="stat"><small>FLOP, whole batch</small><b>${fmt(flops * batch)}</b></div>
        <div class="stat"><small>intensity</small><b>${ai.toFixed(2)} FLOP/B</b></div>
        <div class="stat bad"><small>memory bound</small><b>${bound.toFixed(1)} TFLOPS</b></div></div>
      <div class="km-bar" role="img" aria-label="The memory bound is ${bound.toFixed(1)} of a 67 TFLOPS peak">
        <span style="width:${(bound / PEAK_TFLOPS * 100).toFixed(1)}%"></span><em>${bound.toFixed(1)} of ${PEAK_TFLOPS} TFLOPS peak: memory decides</em></div>`;
    const opts = layouts(m, n, k, warps), best = bestLayout(m, n, k, warps);
    const cur = pick && opts.find((o) => o.rows === pick.rows && o.ok) ? opts.find((o) => o.rows === pick.rows) : best;
    el.querySelector(".km-opts").innerHTML = `<small class="mono">LAYOUTS (rows × cols of warps)</small>` + opts.map((o) =>
      `<button class="cbtn lay${cur && o.rows === cur.rows ? " on" : ""}" data-r="${o.rows}" ${o.ok ? "" : "disabled"}>${o.rows}×${o.cols} · ${o.ok ? `${fmt(o.loads)} loads` : "uneven"}${best && o.rows === best.rows ? " ✓" : ""}</button>`).join("");
    el.querySelectorAll(".lay").forEach((b) => { b.onclick = () => { pick = { rows: +b.dataset.r }; draw(); }; });
    // C as a grid of 16x8 fragments, coloured by the warp that owns each one.
    const fr = m / 16, fc = n / 8, cell = Math.min(26, 220 / Math.max(fr, fc));
    let svg = `<svg viewBox="0 0 ${fc * cell + 2} ${fr * cell + 2}" role="img" aria-label="C as ${fr} by ${fc} tensor-core fragments">`;
    const hues = ["#4285f4", "#e8710a", "#1e8e3e", "#a142f4", "#d93025", "#12b5cb", "#f9ab00", "#5f6368"];
    for (let i = 0; i < fr; i++) for (let j = 0; j < fc; j++) {
      const w = cur ? Math.floor(i / (fr / cur.rows)) * cur.cols + Math.floor(j / (fc / cur.cols)) : -1;
      svg += `<rect x="${1 + j * cell}" y="${1 + i * cell}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="${w >= 0 ? hues[w % 8] : "var(--line)"}" opacity="0.85"/>`;
    }
    el.querySelector(".km-c").innerHTML = svg + `</svg><small class="mono">C: ${fr} × ${fc} fragments of 16×8</small>`;
    el.querySelector(".msg").textContent = cur
      ? `${warps} warp${warps > 1 ? "s" : ""} as ${cur.rows}×${cur.cols}: each warp reads ${m / cur.rows} rows of A and ${n / cur.cols} rows of B over K = ${k}; ${fmt(cur.loads)} shared-memory loads in all.`
      : `${m}×${n} has only ${fr * fc} fragment${fr * fc > 1 ? "s" : ""}: ${warps} warps cannot share them evenly.`;
  };
  el.querySelectorAll(".sh").forEach((b) => { b.onclick = () => { s = +b.dataset.i; pick = null; draw(); }; });
  el.querySelectorAll(".wp").forEach((b) => { b.onclick = () => { warps = +b.dataset.w; pick = null; draw(); }; });
  draw();
}

// ---------- Clusterwise SpGEMM: reads of B ----------

function stencil(side) {
  const rows = [];
  for (let i = 0; i < side * side; i++) {
    const r = Math.floor(i / side), c = i % side;
    rows.push([[r - 1, c], [r, c - 1], [r, c], [r, c + 1], [r + 1, c]]
      .filter(([rr, cc]) => rr >= 0 && rr < side && cc >= 0 && cc < side).map(([rr, cc]) => rr * side + cc).sort((a, b) => a - b));
  }
  return rows;
}
function bRowReads(rows, width) {
  let total = 0;
  for (let g = 0; g < rows.length; g += width) total += new Set(rows.slice(g, g + width).flat()).size;
  return total;
}
const lexCompare = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};
function spOrders() {
  const A = stencil(8), shuffled = A.slice(), rng = new Rng(5);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.next() % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { grid: A, shuffled, reordered: shuffled.slice().sort(lexCompare) };
}
const spgemmResult = (speedups) => {
  const g = speedups.reduce((p, s) => p * s, 1) ** (1 / speedups.length);
  return [Math.round(1000 * g / (1 + g)) / 10, speedups.every((s) => 1 / s < 0.85)];
};

function demoSpgemm(el) {
  const orders = spOrders();
  let which = "grid", width = 8;
  el.innerHTML = `<div class="controls"><span class="bp-lab">Row order</span>
      <button class="cbtn od" data-k="grid">Grid</button><button class="cbtn od" data-k="shuffled">Shuffled</button><button class="cbtn od" data-k="reordered">Reordered</button></div>
    <div class="controls"><span class="bp-lab">Rows per cluster</span>${[1, 2, 4, 8, 16].map((w) => `<button class="cbtn wd" data-w="${w}">${w}</button>`).join("")}</div>
    <div class="sp-grid"><div class="svgbox sp-spy"></div><div class="sp-side"><div class="stats"></div><p class="hint sp-note"></p></div></div>`;
  const draw = () => {
    el.querySelectorAll(".od").forEach((b) => b.classList.toggle("on", b.dataset.k === which));
    el.querySelectorAll(".wd").forEach((b) => b.classList.toggle("on", +b.dataset.w === width));
    const rows = orders[which], c = 4, W = 64 * c;
    let svg = `<svg viewBox="0 0 ${W + 2} ${W + 2}" role="img" aria-label="Sparsity pattern of A: 64 rows, 64 columns">`;
    for (let g = 0; g < 64; g += width) {
      const used = new Set(rows.slice(g, g + width).flat());
      if ((g / width) % 2 === 0) svg += `<rect x="1" y="${1 + g * c}" width="${W}" height="${width * c}" fill="var(--teal-soft)"/>`;
      used.forEach((col) => { svg += `<rect x="${1 + col * c}" y="${1 + g * c}" width="${c}" height="${width * c}" fill="var(--amber)" opacity="0.25"/>`; });
    }
    rows.forEach((cols, i) => cols.forEach((col) => { svg += `<rect x="${1 + col * c + 0.5}" y="${1 + i * c + 0.5}" width="${c - 1}" height="${c - 1}" fill="var(--teal)"/>`; }));
    el.querySelector(".sp-spy").innerHTML = svg + "</svg>";
    const one = bRowReads(rows, 1), many = bRowReads(rows, width);
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>row by row</small><b>${one} reads</b></div>
      <div class="stat ${many < one ? "good" : ""}"><small>${width} rows at a time</small><b>${many} reads</b></div>
      <div class="stat"><small>saved</small><b>${Math.round(100 * (1 - many / one))}%</b></div>`;
    el.querySelector(".sp-note").textContent = "Blue dots: stored entries of A. Each band is one cluster; an amber column is a row of B the cluster reads once.";
  };
  el.querySelectorAll(".od").forEach((b) => { b.onclick = () => { which = b.dataset.k; draw(); }; });
  el.querySelectorAll(".wd").forEach((b) => { b.onclick = () => { width = +b.dataset.w; draw(); }; });
  draw();
}

// ---------- quiz ----------

function demoQuiz(el, questions) {
  el.innerHTML = `<div class="quiz">` + questions.map((q, k) => `<div class="card q" data-k="${k}">
      <p><b>Q${k + 1}.</b> ${q.q}</p>${q.code ? codeBlock(q.code) : ""}
      <div class="opts">${q.opts.map((o, j) => `<button class="opt" data-j="${j}">${o}</button>`).join("")}</div>
      <div class="explain">${q.why}</div></div>`).join("") +
    `<p class="score"></p></div>`;
  let right = 0, done = 0;
  el.querySelectorAll(".q").forEach((qe) => {
    const q = questions[+qe.dataset.k];
    qe.querySelectorAll(".opt").forEach((b) => {
      b.onclick = () => {
        const j = +b.dataset.j;
        qe.querySelectorAll(".opt").forEach((x) => { x.disabled = true; });
        qe.querySelectorAll(".opt")[q.a].classList.add("right");
        if (j !== q.a) b.classList.add("wrong"); else right++;
        qe.classList.add("done");
        done++;
        el.querySelector(".score").textContent = `${right} / ${done} correct` + (done === questions.length ? (right === questions.length ? " — all right!" : " — reread the sections you missed.") : "");
      };
    });
  });
}

// Demo registry: data-demo="name" in chapters.js mounts DEMOS[name].
const DEMOS = {
  predictor: (el) => demoPredictor(el),
  predictorMini: (el) => demoPredictorMini(el),
  producer: (el) => demoProducer(el),
  allwin: (el) => demoAllWin(el),
  kami: (el) => demoKami(el),
  spgemm: (el) => demoSpgemm(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
