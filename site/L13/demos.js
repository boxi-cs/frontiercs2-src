// L13 demos. The JS models repeat the Python programs in frontiercs2/notes/L13-robotics.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

// Park-Miller generator, exact in JavaScript (products stay below 2^53).
class Rng {
  constructor(seed) { this.state = seed; }
  next() { this.state = (this.state * 48271) % 2147483647; return this.state; }
  uniform() { return this.next() / 2147483647; }
  gauss() { const u1 = this.uniform(), u2 = this.uniform(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }
}

// ---------- Diffusion Policy ----------

const MODES = [-1, 1], SPREAD = 0.1, T = 100;

function demoActions() {
  const rng = new Rng(5);
  const demos = [];
  for (let i = 0; i < 200; i++) demos.push(MODES[rng.next() % 2] + SPREAD * rng.gauss());
  let total = 0;
  for (const a of demos) total += a;
  const average = total / demos.length;
  return { demos, average, near: demos.filter((a) => Math.abs(a - average) < 0.3).length };
}

const AB = (() => {
  const f = (u) => Math.cos(((u / T + 0.008) / 1.008) * Math.PI / 2) ** 2;
  return Array.from({ length: T + 1 }, (_, t) => f(t) / f(0));
})();

function denoise(x, t) {
  const ab = AB[t], v = ab * SPREAD ** 2 + 1 - ab;
  let num = 0, den = 0;
  for (const mu of MODES) {
    const w = Math.exp(-((x - Math.sqrt(ab) * mu) ** 2) / (2 * v));
    num += w * (mu + (Math.sqrt(ab) * SPREAD ** 2 / v) * (x - Math.sqrt(ab) * mu));
    den += w;
  }
  return num / den;
}

// Each sampler returns the final plan; `path`, if given, collects the clean guess at every level (for drawing).
function ddpm(levels, rng, path = null) {
  let x = rng.gauss();
  for (let i = 0; i < levels.length; i++) {
    const t = levels[i], s = i + 1 < levels.length ? levels[i + 1] : 0;
    const guess = denoise(x, t);
    if (path) path.push([t, guess]);
    if (s === 0) return guess;
    const beta = 1 - AB[t] / AB[s];
    const mean = (Math.sqrt(AB[s]) * beta * guess + Math.sqrt(1 - beta) * (1 - AB[s]) * x) / (1 - AB[t]);
    x = mean + Math.sqrt((beta * (1 - AB[s])) / (1 - AB[t])) * rng.gauss();
  }
}

function ddim(levels, rng, path = null) {
  let x = rng.gauss();
  for (let i = 0; i < levels.length; i++) {
    const t = levels[i], s = i + 1 < levels.length ? levels[i + 1] : 0;
    const guess = denoise(x, t);
    if (path) path.push([t, guess]);
    if (s === 0) return guess;
    const noise = (x - Math.sqrt(AB[t]) * guess) / Math.sqrt(1 - AB[t]);
    x = Math.sqrt(AB[s]) * guess + Math.sqrt(1 - AB[s]) * noise;
  }
}

const lam = (t) => 0.5 * Math.log(AB[t] / (1 - AB[t]));

function dpm2(levels, rng, path = null) {
  let x = rng.gauss(), prev = null;
  for (let i = 0; i < levels.length; i++) {
    const t = levels[i], s = i + 1 < levels.length ? levels[i + 1] : 0;
    const guess = denoise(x, t);
    if (path) path.push([t, guess]);
    if (s === 0) return guess;
    const h = lam(s) - lam(t);
    let d = guess;
    if (prev !== null) {
      const r = (lam(t) - lam(levels[i - 1])) / h;
      d = (1 + 1 / (2 * r)) * guess - prev / (2 * r);
    }
    prev = guess;
    x = (Math.sqrt(1 - AB[s]) / Math.sqrt(1 - AB[t])) * x + Math.sqrt(AB[s]) * (1 - Math.exp(-h)) * d;
  }
}

const levelsEven = (k) => Array.from({ length: k }, (_, i) => Math.round(T - (i * T) / k));
const ALL_LEVELS = Array.from({ length: T }, (_, i) => T - i);

function tally(samples) {
  const left = samples.filter((a) => Math.abs(a + 1) < 0.3).length;
  const right = samples.filter((a) => Math.abs(a - 1) < 0.3).length;
  return { left, right, middle: samples.length - left - right };
}

function sampleMany(sampler, levels, n = 1000, seed = 9) {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => sampler(levels, rng));
}

function utility(q, latency, wall, qn, ln, tn) {
  const gain = Math.max(0, (q - qn) / (1 - qn));
  return gain * Math.min(ln / latency, tn / wall);
}
function finalScore(us) { let u = 0; for (const x of us) u += x; u /= us.length; return (100 * u) / (1 + u); }

// ---------- MuJoCo Playground walker ----------

const DT = 0.02, STEPS = 1000, LAG = 0.25, WIDTH = 0.5, STRENGTH = [1.0, 0.8];

function episode(theta, seed, pushes = false, trace = null) {
  const rng = new Rng(seed);
  let v = 0, w = 0, lastL = 0, lastR = 0, cv = 0, cw = 0;
  const m = { reward: 0, lin: 0, ang: 0, energy: 0, rate: 0 };
  for (let step = 0; step < STEPS; step++) {
    if (step % 250 === 0) { cv = 2 * rng.uniform() - 1; cw = 2 * rng.uniform() - 1; }
    if (pushes && step % 100 === 50) { const dv = 0.5 * rng.gauss(); const dw = 0.5 * rng.gauss(); v += dv; w += dw; }
    const f0 = cv, f1 = cw, f2 = cv - v - 0.1 * rng.gauss(), f3 = cw - w - 0.1 * rng.gauss();
    const left = theta[0] * f0 + theta[1] * f1 + theta[2] * f2 + theta[3] * f3;
    const right = theta[4] * f0 + theta[5] * f1 + theta[6] * f2 + theta[7] * f3;
    const fl = STRENGTH[0] * left, fr = STRENGTH[1] * right;
    v += (DT * ((fl + fr) / 2 - v)) / LAG;
    w += (DT * ((fr - fl) / WIDTH - w)) / LAG;
    const lin = Math.exp(-((cv - v) ** 2) / 0.25), ang = Math.exp(-((cw - w) ** 2) / 0.25);
    const rate = -((left - lastL) ** 2 + (right - lastR) ** 2);
    const energy = -(Math.abs(left * fl) + Math.abs(right * fr));
    m.reward += Math.max(0, lin + 0.5 * ang + 0.01 * rate + 0.001 * energy) * DT;
    m.lin += lin; m.ang += ang;
    m.energy += energy / STEPS; m.rate += rate / STEPS;
    if (trace) trace.push([cv, v, cw, w]);
    lastL = left; lastR = right;
  }
  return m;
}

// Random search, one iteration at a time; train(iters, seed) repeats it.
function trainer(seed, step = 0.02, nu = 0.05, dirs = 4) {
  const rng = new Rng(seed);
  let theta = Array(8).fill(0);
  return {
    get theta() { return theta; },
    iterate() {
      let grad = Array(8).fill(0);
      for (let k = 0; k < dirs; k++) {
        const d = Array.from({ length: 8 }, () => rng.gauss());
        const env = rng.next();
        const up = episode(theta.map((t, i) => t + nu * d[i]), env).reward;
        const down = episode(theta.map((t, i) => t - nu * d[i]), env).reward;
        grad = grad.map((g, i) => g + (up - down) * d[i]);
      }
      theta = theta.map((t, i) => t + (step * grad[i]) / (2 * dirs * nu));
      return episode(theta, 999).reward;
    },
  };
}
function train(iters, seed) {
  const tr = trainer(seed), curve = [];
  for (let i = 0; i < iters; i++) curve.push(tr.iterate());
  return { theta: tr.theta, curve };
}

function compare(ours, ref) {
  const wins = {};
  Object.keys(ours[0]).forEach((k) => { wins[k] = 0; });
  ours.forEach((a, i) => Object.keys(wins).forEach((k) => { if (a[k] > ref[i][k]) wins[k]++; }));
  return wins;
}

const playgroundScore = (r) => { r = Math.max(0, r); return (100 * r) / (r + 30); };

function stepsByDeadline(deadline = 720, setup = 60, margin = 30) {
  let clock = setup, steps = 0;
  while (clock + 19.75 <= deadline - margin) { clock += 19.75; steps += 10000000; }
  return { steps, clock };
}

// ---------- drawing helpers ----------

const fmt = (x, d = 2) => x.toFixed(d);

function histSVG(samples, { W = 520, H = 150, bins = 40, lo = -1.6, hi = 1.6, mark = null } = {}) {
  const c = Array(bins).fill(0);
  samples.forEach((a) => { const i = Math.floor(((a - lo) / (hi - lo)) * bins); if (i >= 0 && i < bins) c[i]++; });
  const top = Math.max(1, ...c), bw = (W - 20) / bins, X = (a) => 10 + ((a - lo) / (hi - lo)) * (W - 20);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram of sampled actions">
    <rect x="${X(-0.3)}" y="6" width="${X(0.3) - X(-0.3)}" height="${H - 30}" fill="var(--red-soft)"/>
    <text x="${X(0)}" y="18" font-size="10" text-anchor="middle" fill="var(--red)">obstacle</text>`;
  c.forEach((n, i) => {
    const h = (n / top) * (H - 40);
    svg += `<rect x="${10 + i * bw + 1}" y="${H - 24 - h}" width="${bw - 2}" height="${h}" fill="var(--teal)"/>`;
  });
  if (mark !== null) svg += `<line x1="${X(mark)}" x2="${X(mark)}" y1="6" y2="${H - 24}" stroke="var(--amber)" stroke-width="3"/>
    <text x="${X(mark) + 6}" y="32" font-size="11" fill="var(--amber)">regression ${fmt(mark, 3)}</text>`;
  [-1, 0, 1].forEach((a) => { svg += `<text x="${X(a)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="var(--stone)">${a === -1 ? "−1 left" : a === 1 ? "+1 right" : "0"}</text>`; });
  return svg + "</svg>";
}

function tallyStats(t, calls) {
  return `<div class="stat good"><small>left</small><b>${t.left}</b></div>
    <div class="stat good"><small>right</small><b>${t.right}</b></div>
    <div class="stat ${t.middle > 50 ? "bad" : t.middle ? "" : "good"}"><small>middle (miss)</small><b>${t.middle}</b></div>
    <div class="stat"><small>network calls</small><b>${calls}</b></div>`;
}

// ---------- Demo 1: noise to two actions (100-call DDPM) ----------

function demoFlow(el, { mini = false } = {}) {
  const W = 520, H = 230, NPATH = mini ? 30 : 40;
  el.innerHTML = `<div class="svgbox dp-flow"></div>
    ${mini ? "" : `<div class="stats"></div><div class="controls"><button class="cbtn on run">Sample 1,000 plans</button><button class="cbtn reg">Show the regression answer</button><span class="spacer"></span><span class="counter mono"></span></div>`}
    <div class="dp-hist"></div>`;
  const X = (t) => 30 + ((T - t) / T) * (W - 50), Y = (x) => (H - 14) / 2 - x * ((H - 14) / 2 - 16);
  const rng = new Rng(9), paths = [];
  for (let i = 0; i < NPATH; i++) { const p = []; ddpm(ALL_LEVELS, rng, p); paths.push(p); }
  const finals = mini ? [] : sampleMany(ddpm, ALL_LEVELS);
  const { average } = demoActions();
  let shown = 0, reg = false, timer = null;
  const frame = (upto) => {
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Each sample's clean guess at every noise level">
      <rect x="30" y="${Y(0.3)}" width="${W - 50}" height="${Y(-0.3) - Y(0.3)}" fill="var(--red-soft)"/>
      <text x="${W - 22}" y="${Y(0) + 4}" font-size="10" text-anchor="end" fill="var(--red)">obstacle</text>
      <line x1="30" x2="${W - 20}" y1="${Y(1)}" y2="${Y(1)}" stroke="var(--line)" stroke-dasharray="4 4"/>
      <line x1="30" x2="${W - 20}" y1="${Y(-1)}" y2="${Y(-1)}" stroke="var(--line)" stroke-dasharray="4 4"/>
      <text x="4" y="${Y(1) + 4}" font-size="10" fill="var(--stone)">+1</text><text x="4" y="${Y(-1) + 4}" font-size="10" fill="var(--stone)">−1</text>
      <text x="30" y="${H - 2}" font-size="10" fill="var(--stone)">noise level 100</text><text x="${W - 20}" y="${H - 2}" font-size="10" text-anchor="end" fill="var(--stone)">0 · the plan</text>`;
    paths.forEach((p) => {
      const pts = p.filter(([t]) => t >= T - upto).map(([t, x]) => `${fmt(X(t), 1)},${fmt(Y(x), 1)}`).join(" ");
      svg += `<polyline points="${pts}" fill="none" stroke="var(--teal)" stroke-opacity="0.45" stroke-width="1.3"/>`;
    });
    if (reg) svg += `<line x1="30" x2="${W - 20}" y1="${Y(average)}" y2="${Y(average)}" stroke="var(--amber)" stroke-width="3"/>
      <text x="36" y="${Y(average) - 6}" font-size="11" fill="var(--amber)">regression: ${fmt(average, 3)}</text>`;
    el.querySelector(".dp-flow").innerHTML = svg + "</svg>";
  };
  const finish = () => {
    if (mini) return;
    const t = tally(finals);
    el.querySelector(".stats").innerHTML = tallyStats(t, 100);
    el.querySelector(".dp-hist").innerHTML = `<div class="svgbox">${histSVG(finals, { mark: reg ? average : null })}<small class="mono" style="color:var(--stone)">1,000 plans from the 100-call sampler</small></div>`;
  };
  const play = () => {
    clearInterval(timer); shown = 0;
    timer = setInterval(() => {
      shown = Math.min(T, shown + 4);
      frame(shown);
      if (!mini) el.querySelector(".counter").textContent = `level ${T - shown}`;
      if (shown >= T) {
        clearInterval(timer); finish();
        if (mini) setTimeout(play, 1600);
      }
    }, 60);
  };
  if (!mini) {
    el.querySelector(".run").onclick = play;
    el.querySelector(".reg").onclick = (e) => { reg = !reg; e.target.classList.toggle("on", reg); frame(shown); if (shown >= T) finish(); };
  }
  frame(0); play();
}

// ---------- Demo 2: fewer calls ----------

function parseLevels(text) {
  const lv = text.split(/[\s,]+/).filter(Boolean).map(Number);
  if (!lv.length || lv.some((t) => !Number.isInteger(t) || t < 1 || t > 100)) return null;
  for (let i = 1; i < lv.length; i++) if (lv[i] >= lv[i - 1]) return null;
  return lv;
}

function demoSteps(el) {
  const presets = [["100 even", ALL_LEVELS.join(", ")], ["1", "100"], ["3 even", levelsEven(3).join(", ")], ["3 placed", "95, 50, 10"],
    ["5 even", levelsEven(5).join(", ")], ["Opus's 5", "95, 70, 45, 22, 5"]];
  el.innerHTML = `<div class="controls dp-presets">${presets.map(([n], i) => `<button class="cbtn" data-i="${i}">${n}</button>`).join("")}</div>
    <div class="controls"><label>levels <input type="text" class="lv mono" value="95, 70, 45, 22, 5"></label>
      <label><input type="checkbox" class="second"> second order</label><button class="cbtn on go">Sample</button></div>
    <div class="svgbox hist"></div><div class="stats"></div><div class="msg"></div>`;
  const msg = el.querySelector(".msg"), input = el.querySelector(".lv"), second = el.querySelector(".second");
  const run = () => {
    const lv = parseLevels(input.value);
    if (!lv) { msg.className = "msg bad"; msg.textContent = "Levels must be whole numbers from 100 down to 1, each lower than the one before."; return; }
    const sampler = second.checked ? dpm2 : ddim;
    const samples = sampleMany(sampler, lv), t = tally(samples);
    el.querySelector(".hist").innerHTML = histSVG(samples);
    el.querySelector(".stats").innerHTML = tallyStats(t, lv.length);
    msg.className = "msg";
    msg.textContent = `${second.checked ? "Second-order" : "First-order (DDIM)"} jumps, levels ${lv.length > 8 ? `${lv.slice(0, 4).join(", ")} … ${lv.slice(-2).join(", ")}` : lv.join(", ")}: ${t.middle} of 1,000 plans go into the obstacle.`;
  };
  el.querySelectorAll(".dp-presets .cbtn").forEach((b) => {
    b.onclick = () => { input.value = presets[+b.dataset.i][1]; second.checked = false; run(); };
  });
  el.querySelector(".go").onclick = run;
  second.onchange = run;
  input.onkeydown = (e) => { if (e.key === "Enter") run(); };
  run();
}

// ---------- Demo 3: train the walker ----------

function traceSVG(trace, W = 520, H = 130) {
  const X = (i) => 30 + (i / (trace.length - 1)) * (W - 40), Y = (x) => H / 2 - x * (H / 2 - 12);
  const line = (k, color, width, dash = "") => `<polyline points="${trace.filter((_, i) => i % 4 === 0).map((r, j) => `${fmt(X(j * 4), 1)},${fmt(Y(r[k]), 1)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Commanded and actual speed over 20 seconds">
    <line x1="30" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)"/>
    ${line(0, "var(--amber)", 2, "5 4")}${line(1, "var(--teal)", 1.6)}
    <text x="4" y="${Y(1) + 4}" font-size="10" fill="var(--stone)">+1</text><text x="4" y="${Y(-1) + 4}" font-size="10" fill="var(--stone)">−1</text>
    <text x="${W - 10}" y="12" font-size="11" text-anchor="end" fill="var(--amber)">commanded speed</text>
    <text x="${W - 10}" y="26" font-size="11" text-anchor="end" fill="var(--teal)">walker's speed</text></svg>`;
}

function curveSVG(curve, base, W = 520, H = 130, n = 32) {
  const lo = 10, hi = 30, X = (i) => 34 + (i / (n - 1)) * (W - 44), Y = (r) => H - 18 - ((r - lo) / (hi - lo)) * (H - 30);
  const pts = curve.map((r, i) => `${fmt(X(i), 1)},${fmt(Y(r), 1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Test reward after each iteration">
    <line x1="34" x2="${W - 10}" y1="${Y(30)}" y2="${Y(30)}" stroke="var(--line)" stroke-dasharray="4 4"/>
    <text x="4" y="${Y(30) + 4}" font-size="10" fill="var(--stone)">30</text><text x="4" y="${Y(10) + 4}" font-size="10" fill="var(--stone)">10</text>
    <line x1="34" x2="${W - 10}" y1="${Y(base)}" y2="${Y(base)}" stroke="var(--red)" stroke-opacity="0.4"/>
    <text x="${W - 10}" y="${Y(base) - 4}" font-size="10" text-anchor="end" fill="var(--red)">standing still ${fmt(base)}</text>
    <polyline points="${pts}" fill="none" stroke="var(--teal)" stroke-width="2"/>
    ${curve.map((r, i) => `<circle cx="${fmt(X(i), 1)}" cy="${fmt(Y(r), 1)}" r="2.5" fill="var(--teal)"/>`).join("")}
    <text x="${W - 10}" y="${H - 4}" font-size="10" text-anchor="end" fill="var(--stone)">iteration ${n}</text>
    <text x="34" y="${H - 4}" font-size="10" fill="var(--stone)">1</text></svg>`;
}

function demoWalker(el) {
  el.innerHTML = `<div class="svgbox wk-curve"></div><div class="svgbox wk-trace"></div><div class="stats"></div>
    <div class="controls"><button class="cbtn on run">Train 32 iterations</button><button class="cbtn step">One iteration</button><button class="cbtn reset">Reset</button>
      <span class="spacer"></span><span class="counter mono"></span></div>`;
  let tr, curve, timer = null;
  const base = episode(Array(8).fill(0), 999).reward;
  const draw = () => {
    const trace = [];
    const m = episode(tr.theta, 999, false, trace);
    el.querySelector(".wk-curve").innerHTML = curveSVG(curve, base);
    el.querySelector(".wk-trace").innerHTML = traceSVG(trace);
    const th = tr.theta;
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>iteration</small><b>${curve.length}</b></div>
      <div class="stat ${m.reward > 29 ? "good" : ""}"><small>test reward</small><b>${fmt(m.reward)}</b></div>
      <div class="stat"><small>speed weight R · L</small><b>${fmt(th[4])} · ${fmt(th[0])}</b></div>
      <div class="stat"><small>episodes run</small><b>${curve.length * 8}</b></div>`;
    el.querySelector(".counter").textContent = curve.length >= 32 ? "done" : "";
  };
  const reset = () => { clearInterval(timer); tr = trainer(1); curve = []; draw(); };
  const once = () => { if (curve.length < 32) { curve.push(tr.iterate()); draw(); } };
  el.querySelector(".run").onclick = () => {
    clearInterval(timer);
    timer = setInterval(() => { once(); if (curve.length >= 32) clearInterval(timer); }, 90);
  };
  el.querySelector(".step").onclick = () => { clearInterval(timer); once(); };
  el.querySelector(".reset").onclick = reset;
  reset();
}

// ---------- Demo 4: every metric, every workload ----------

function demoStrict(el) {
  const MAXI = 40, NAMES = [["reward", "reward"], ["lin", "speed"], ["ang", "turn"], ["energy", "energy"], ["rate", "rate"]];
  el.innerHTML = `<div class="controls"><label>our recipe: iterations <input class="it" type="range" min="10" max="${MAXI}" value="32"><b class="mono vit"></b></label>
    <span class="hint" style="margin:0">reference recipe: 20</span></div>
    <div class="wk-table"></div><div class="stats"></div><div class="msg"></div>`;
  // theta after i iterations, for seeds 1-3 (one training run of MAXI iterations each)
  const hist = [1, 2, 3].map((seed) => { const tr = trainer(seed), h = [null]; for (let i = 0; i < MAXI; i++) { tr.iterate(); h.push(tr.theta); } return h; });
  const ref = [];
  [1, 2, 3].forEach((seed, k) => [false, true].forEach((p) => ref.push(episode(hist[k][20], 200 + seed, p))));
  const draw = (n) => {
    el.querySelector(".vit").textContent = n;
    const ours = [];
    [1, 2, 3].forEach((seed, k) => [false, true].forEach((p) => ours.push(episode(hist[k][n], 200 + seed, p))));
    const wins = compare(ours, ref);
    let rows = "";
    ours.forEach((a, i) => {
      rows += `<tr><td>${1 + Math.floor(i / 2)} · ${i % 2 ? "push" : "flat"}</td>${NAMES.map(([k]) => {
        const win = a[k] > ref[i][k];
        return `<td class="${win ? "win" : "loss"}">${k === "energy" || k === "rate" ? fmt(a[k], 3) : k === "reward" ? fmt(a[k]) : fmt(a[k], 0)}</td>`;
      }).join("")}</tr>`;
    });
    el.querySelector(".wk-table").innerHTML = `<div class="tablewrap"><table class="strict"><tr><th>seed</th>${NAMES.map(([, n]) => `<th>${n}</th>`).join("")}</tr>${rows}
      <tr class="sum"><td>won, of 6</td>${NAMES.map(([k]) => `<td>${wins[k]}</td>`).join("")}</tr></table></div>`;
    let mean = 0;
    for (const a of ours) mean += a.reward;
    mean /= ours.length;
    let refMean = 0;
    for (const a of ref) refMean += a.reward;
    refMean /= ref.length;
    const passes = Object.values(wins).every((x) => x === ours.length);
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>mean reward · ours</small><b>${fmt(mean, 3)}</b></div>
      <div class="stat"><small>mean reward · reference</small><b>${fmt(refMean, 3)}</b></div>
      <div class="stat ${passes ? "good" : "bad"}"><small>passes</small><b>${passes ? "yes" : "no"}</b></div>`;
    const msg = el.querySelector(".msg");
    msg.className = passes ? "msg good" : "msg bad";
    msg.textContent = passes ? "Strictly better on every metric in every workload." :
      `Green cells beat the reference; red cells do not. Speed and turn are tracking sums; energy and rate (action rate) are penalties, so higher, nearer 0, is better.`;
  };
  const r = el.querySelector(".it");
  r.oninput = () => draw(+r.value);
  draw(+r.value);
}

// ---------- Quiz ----------

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

const DEMOS = {
  flow: (el) => demoFlow(el),
  flowMini: (el) => demoFlow(el, { mini: true }),
  steps: (el) => demoSteps(el),
  walker: (el) => demoWalker(el),
  strict: (el) => demoStrict(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
