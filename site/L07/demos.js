// L07 demos. The JS models repeat the Python programs in frontiercs2/notes/L07-machine-learning.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

// Park-Miller generator, exact in JavaScript (products stay below 2^53).
class Rng {
  constructor(seed) { this.state = seed; }
  uniform() { this.state = (this.state * 48271) % 2147483647; return this.state / 2147483647; }
  normal() { let s = 0; for (let i = 0; i < 12; i++) s += this.uniform(); return s - 6; }
}
// A plain left-to-right sum, as in the notes.
const total = (xs) => { let s = 0; for (const x of xs) s += x; return s; };
const fmt = (x, d) => x.toFixed(d);
const fmtE = (x, d) => x.toExponential(d).replace(/e([+-])(\d)$/, "e$10$2");   // Python's .2e
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- KV Compaction: one head ----------

const KD = 4;
function makeHead(seed) {
  const rng = new Rng(seed);
  const vec = (scale) => Array.from({ length: KD }, () => scale * rng.normal());
  const template = Array.from({ length: 4 }, () => { const k = vec(1); return [k, vec(1)]; });
  const article = Array.from({ length: 48 }, (_, i) => { const k = vec(1 + (i % 7 === 0 ? 1 : 0)); return [k, vec(1)]; });
  const focus = vec(1);
  const queries = Array.from({ length: 96 }, () => { const n = vec(1.5); return focus.map((f, i) => f + n[i]); });
  return { template, article, sample: queries.slice(0, 64), test: queries.slice(64) };
}
const kScore = (q, k) => total(q.map((a, i) => a * k[i])) / 2;      // D ** 0.5 = 2
function attend(q, keys) {
  const w = keys.map(([k, b]) => Math.exp(kScore(q, k) + b));
  const mass = total(w);
  return [Array.from({ length: KD }, (_, i) => total(w.map((wi, j) => wi * keys[j][2][i])) / mass), mass];
}
function kvCache(template, article, kept = null, bias = null, values = null) {
  kept = kept || article.map((_, j) => j);
  bias = bias || kept.map(() => 0);
  values = values || kept.map((j) => article[j][1]);
  return template.map(([k, v]) => [k, 0, v]).concat(kept.map((j, i) => [article[j][0], bias[i], values[i]]));
}
function kvError(small, template, article, queries) {
  const full = kvCache(template, article);
  const gaps = queries.map((q) => { const a = attend(q, small)[0], b = attend(q, full)[0]; return total(a.map((x, i) => Math.abs(x - b[i]))) / KD; });
  return total(gaps) / gaps.length;
}
function keepRandom(article, t, seed) {
  const rng = new Rng(seed), order = article.map((_, j) => j);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.uniform() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, t).sort((a, b) => a - b);
}
function keepTop(template, article, queries, t) {
  const full = kvCache(template, article), best = article.map(() => 0);
  for (const q of queries) {
    const mass = attend(q, full)[1];
    article.forEach(([k], j) => { best[j] = Math.max(best[j], Math.exp(kScore(q, k)) / mass); });
  }
  return article.map((_, j) => j).sort((a, b) => best[b] - best[a] || a - b).slice(0, t).sort((a, b) => a - b);
}
function fitBias(article, kept, queries, steps = 200) {
  const a = queries.map((q) => kept.map((j) => Math.exp(kScore(q, article[j][0]))));
  const mass = queries.map((q) => total(article.map(([k]) => Math.exp(kScore(q, k)))));
  let w = kept.map(() => 1);
  for (let s = 0; s < steps; s++) {
    const fit = a.map((row) => total(row.map((x, j) => x * w[j])));
    w = kept.map((_, j) => w[j] * total(a.map((row, i) => row[j] * mass[i])) / total(a.map((row, i) => row[j] * fit[i])));
  }
  return w.map(Math.log);
}
function solve(m, rhs) {
  const n = m.length, a = m.map((row, i) => row.concat(rhs[i]));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      a[r] = a[r].map((x, i) => x - f * a[c][i]);
    }
  }
  return a.map((row, i) => row.slice(n).map((x) => x / a[i][i]));
}
function fitValues(article, kept, bias, queries, ridge = 0.1) {
  const p = queries.map((q) => { const w = kept.map((j, i) => Math.exp(kScore(q, article[j][0]) + bias[i])); return w.map((x) => x / total(w)); });
  const full = article.map(([k, v]) => [k, 0, v]);
  const y = queries.map((q) => attend(q, full)[0]);
  const t = kept.length;
  const gram = Array.from({ length: t }, (_, i) => Array.from({ length: t }, (_, j) => total(p.map((row) => row[i] * row[j]))));
  const lam = ridge * total(gram.map((row, i) => row[i])) / t;
  const rhs = Array.from({ length: t }, (_, i) => Array.from({ length: KD }, (_, c) => total(p.map((row, r) => row[i] * y[r][c])) + lam * article[kept[i]][1][c]));
  for (let i = 0; i < t; i++) gram[i][i] += lam;
  return solve(gram, rhs);
}
let HEAD = null;
const head = () => HEAD || (HEAD = makeHead(7));
const KV_CACHE = {};
function kvRow(t) {
  if (KV_CACHE[t]) return KV_CACHE[t];
  const { template, article, sample, test } = head();
  const rand = keepRandom(article, t, 11), kept = keepTop(template, article, sample, t);
  const bias = fitBias(article, kept, sample), values = fitValues(article, kept, bias, sample);
  return (KV_CACHE[t] = {
    rand, kept,
    errs: [kvError(kvCache(template, article, rand), template, article, test),
      kvError(kvCache(template, article, kept), template, article, test),
      kvError(kvCache(template, article, kept, bias), template, article, test),
      kvError(kvCache(template, article, kept, bias, values), template, article, test)],
  });
}
const KV_METHODS = ["random keys", "top attention", "+ bias", "+ bias + values"];

function demoKv(el, { auto = false } = {}) {
  let t = 6, m = 3;
  el.innerHTML = `${auto ? "" : `<div class="controls"><label>keys kept <input class="t" type="range" min="1" max="24" value="6"><b class="mono vt"></b></label></div>
    <div class="controls kv-btns">${KV_METHODS.map((n, i) => `<button class="cbtn" data-m="${i}">${n}</button>`).join("")}</div>`}
    <div class="kv-strip"></div><div class="kv-bars"></div><div class="stats"></div>
    ${auto ? "" : `<p class="hint">Each cell is one of the 48 article keys; filled cells are kept. The bars give the mean gap from the full cache's output on 32 test queries.</p>`}`;
  const draw = () => {
    const row = kvRow(t), kept = new Set(m === 0 ? row.rand : row.kept);
    el.querySelector(".kv-strip").innerHTML = Array.from({ length: 48 }, (_, j) => `<span class="kv-cell ${kept.has(j) ? (m >= 2 ? "fit" : "on") : ""}" title="key ${j + 1}"></span>`).join("");
    const top = Math.max(1, ...row.errs);
    el.querySelector(".kv-bars").innerHTML = row.errs.map((e, i) => `<div class="kv-bar ${i === m ? "sel" : ""}"><small>${KV_METHODS[i]}</small><span class="r${i}" style="width:${Math.max(1, (e / top) * 100)}%"></span><b class="mono">${fmt(e, 4)}</b></div>`).join("");
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>keys kept</small><b>${t} of 48</b></div>
      <div class="stat"><small>method</small><b>${KV_METHODS[m]}</b></div>
      <div class="stat ${row.errs[m] < 0.2 ? "good" : "bad"}"><small>gap from full cache</small><b>${fmt(row.errs[m], 4)}</b></div>`;
    if (!auto) {
      el.querySelector(".vt").textContent = t;
      el.querySelectorAll(".kv-btns .cbtn").forEach((b) => b.classList.toggle("on", +b.dataset.m === m));
    }
  };
  if (auto) {
    m = 0;
    setInterval(() => { m = (m + 1) % 4; draw(); }, 2200);
  } else {
    el.querySelector(".t").oninput = (e) => { t = +e.target.value; draw(); };
    el.querySelectorAll(".kv-btns .cbtn").forEach((b) => { b.onclick = () => { m = +b.dataset.m; draw(); }; });
  }
  draw();
}

// ---------- RAGEN: a packed row and a group ----------

function normalize(group) {
  const mean = total(group) / group.length;
  const spread = Math.sqrt(total(group.map((r) => (r - mean) * (r - mean))) / group.length);
  return group.map((r) => (spread === 0 ? 0 : (r - mean) / spread));
}
const ragenScore = (s, r) => clamp(10 + 60 * s + 30 * clamp((r + 1) / 12, 0, 1), 0, 100);
const OUTCOMES = [["solved", 10.8], ["one box on goal", 0.7], ["stuck", -0.3], ["bad format", -1.3]];

function demoRagen(el) {
  const games = [0, 2, 2, 2];
  const row = [["view:", 0], ["P", 0], ["B", 0], [".", 0], ["G", 0], ["<answer>", 1], ["Right", 1], ["</answer>", 1],
    ["view:", 0], [".", 0], ["P", 0], ["B", 0], ["G", 0], ["<answer>", 1], ["Right", 1], ["</answer>", 1]];
  el.innerHTML = `<div class="rg-row">${row.map(([w, mk], i) => `<span class="rg-tok ${mk ? "m" : ""} ${i === row.length - 1 ? "r" : ""}">${esc(w)}</span>`).join("")}</div>
    <p class="legend"><span><i style="background:var(--teal)"></i>loss mask 1 (the model's tokens)</span><span><i style="background:var(--amber)"></i>the game's reward</span></p>
    <div class="rg-group"></div><div class="stats"></div>
    <p class="hint">Click a game to change its outcome. The rewards are ours. Each game's advantage is its reward minus the group mean, over the group's spread.</p>`;
  const draw = () => {
    const rewards = games.map((g) => OUTCOMES[g][1]), adv = normalize(rewards);
    el.querySelector(".rg-group").innerHTML = games.map((g, i) => `<div class="rg-game">
      <button class="cbtn" data-i="${i}">Game ${i + 1}: ${OUTCOMES[g][0]}</button>
      <span class="mono">reward ${fmt(rewards[i], 1)}</span>
      <span class="rg-adv"><span class="${adv[i] >= 0 ? "pos" : "neg"}" style="width:${Math.min(50, Math.abs(adv[i]) * 25)}%;${adv[i] >= 0 ? "left:50%" : `right:50%`}"></span></span>
      <b class="mono">${fmt(adv[i], 3)}</b></div>`).join("");
    el.querySelectorAll(".rg-game .cbtn").forEach((b) => { b.onclick = () => { const i = +b.dataset.i; games[i] = (games[i] + 1) % OUTCOMES.length; draw(); }; });
    const solved = games.filter((g) => g === 0).length / 4, mean = total(rewards) / 4;
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>solved</small><b>${games.filter((g) => g === 0).length} of 4</b></div>
      <div class="stat"><small>mean reward</small><b>${fmt(mean, 3)}</b></div>
      <div class="stat ${adv.every((a) => a === 0) ? "bad" : ""}"><small>${adv.every((a) => a === 0) ? "all equal: teaches nothing" : "score from this group"}</small><b>${fmt(ragenScore(solved, mean), 2)}</b></div>`;
  };
  draw();
}

// ---------- Flow-OPD: signal per step ----------

const SIGMAS = Array.from({ length: 11 }, (_, i) => 1 - i / 10);
function noiseScale(sigma, cap = null, level = 0.7) {
  const s = sigma < 1 ? sigma : SIGMAS[1];
  const scale = level * Math.sqrt(s / (1 - s));
  return cap === null ? scale : Math.min(scale, cap);
}
function signal(sigma, next, cap = null) {
  const dt = next - sigma, a = noiseScale(sigma, cap);
  const shift = (1 + a * a * (1 - sigma) / (2 * sigma)) * dt;
  return shift * shift / (2 * a * a * -dt);
}

function demoSignal(el) {
  el.innerHTML = `<div class="controls"><label>noise cap <input class="c" type="range" min="20" max="215" step="5" value="215"><b class="mono vc"></b></label></div>
    <div class="sg-bars"></div><div class="stats"></div>
    <p class="hint">Each bar is one of our ten steps, from pure noise (step 1) to the image (step 10), on a log scale: the KL between two step Gaussians whose velocities differ by 1.</p>`;
  const draw = () => {
    const v = +el.querySelector(".c").value / 100, cap = v >= 2.15 ? null : v;
    el.querySelector(".vc").textContent = cap === null ? "none" : fmt(cap, 2);
    const sig = SIGMAS.slice(0, 10).map((s, i) => signal(s, SIGMAS[i + 1], cap));
    const lo = Math.log10(0.004), hi = Math.log10(2);
    el.querySelector(".sg-bars").innerHTML = sig.map((x, i) => `<div class="sg-bar"><small>step ${i + 1}</small><span style="width:${((Math.log10(x) - lo) / (hi - lo)) * 100}%" class="${noiseScale(SIGMAS[i], cap) < noiseScale(SIGMAS[i]) ? "capped" : ""}"></span><b class="mono">${fmt(x, 3)}</b></div>`).join("");
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>first step's signal</small><b>${fmt(sig[0], 3)}</b></div>
      <div class="stat"><small>last step's signal</small><b>${fmt(sig[9], 3)}</b></div>
      <div class="stat ${sig[9] / sig[0] > 50 ? "bad" : "good"}"><small>last ÷ first</small><b>${fmt(sig[9] / sig[0], 0)}×</b></div>`;
  };
  el.querySelector(".c").oninput = draw;
  draw();
}

// ---------- Representation Fréchet Loss: a ring buffer ----------

function trainQueue(window, steps = 160, batch = 8, rate = 0.05, seed = 3) {
  const rng = new Rng(seed);
  let m = 1, s = 0.5, headPos = 0;
  const ring = Array.from({ length: window }, () => m + s * rng.normal()), path = [];
  for (let step = 0; step < steps; step++) {
    const z = Array.from({ length: batch }, () => rng.normal());
    const x = z.map((zi) => m + s * zi);
    const pop = [];
    for (let i = batch; i < window; i++) pop.push(ring[(headPos + i) % window]);
    pop.push(...x);
    const n = pop.length, mu = total(pop) / n;
    const sd = Math.sqrt(total(pop.map((p) => (p - mu) * (p - mu))) / n);
    let gm = 0, gs = 0;
    x.forEach((xi, i) => {
      const g = (2 * mu + 2 * (sd - 1) * (xi - mu) / sd) / n;
      gm += g; gs += g * z[i];
    });
    [m, s] = [m - rate * n / batch * gm, s - rate * n / batch * gs];
    for (let i = 0; i < batch; i++) ring[(headPos + i) % window] = x[i];
    headPos = (headPos + batch) % window;
    path.push([m, s]);
  }
  return path;
}
const QUEUES = {};
const queuePath = (w) => QUEUES[w] || (QUEUES[w] = trainQueue(w));

function demoQueue(el) {
  let w = 512;
  el.innerHTML = `<div class="controls">${[16, 64, 256, 512].map((v) => `<button class="cbtn" data-w="${v}">window ${v}</button>`).join("")}</div>
    <div class="svgbox fq-chart"></div><div class="stats"></div>
    <p class="legend"><span><i style="background:var(--teal)"></i>mean m (target 0)</span><span><i style="background:var(--amber)"></i>spread s (target 1)</span></p>`;
  const draw = () => {
    const path = queuePath(w), W = 600, H = 220, y0 = -2, y1 = 1.6;
    const X = (i) => 30 + (i / 159) * (W - 40), Y = (v) => 10 + ((y1 - clamp(v, y0, y1)) / (y1 - y0)) * (H - 30);
    const line = (k, col) => `<polyline fill="none" stroke="${col}" stroke-width="2" points="${path.map((p, i) => `${X(i)},${Y(p[k])}`).join(" ")}"/>`;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Generator mean and spread over 160 steps">`;
    for (const v of [-2, -1, 0, 1]) svg += `<line x1="30" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" ${v === 0 || v === 1 ? "" : 'stroke-dasharray="3 3"'}/><text x="4" y="${Y(v) + 4}" font-size="11" fill="var(--stone)">${v}</text>`;
    svg += line(0, "var(--teal)") + line(1, "var(--amber)") + `<text x="${W - 10}" y="${H - 4}" font-size="11" text-anchor="end" fill="var(--stone)">step 160</text></svg>`;
    el.querySelector(".fq-chart").innerHTML = svg;
    const low = Math.min(...path.map((p) => p[0]));
    const late = total(path.slice(80).map(([m, s]) => m * m + (s - 1) * (s - 1))) / 80;
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>window</small><b>${w} features</b></div>
      <div class="stat ${low < -0.5 ? "bad" : ""}"><small>lowest m</small><b>${fmt(low, 3)}</b></div>
      <div class="stat ${late > 0.1 ? "bad" : "good"}"><small>distance, last 80 steps</small><b>${fmt(late, 4)}</b></div>`;
    el.querySelectorAll(".cbtn").forEach((b) => b.classList.toggle("on", +b.dataset.w === w));
  };
  el.querySelectorAll(".cbtn").forEach((b) => { b.onclick = () => { w = +b.dataset.w; draw(); }; });
  draw();
}

// ---------- LeJEPA: four encoders ----------

const rotate = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1]]; };
const spiral = (p) => rotate(p, Math.PI * Math.sqrt(p[0] * p[0] + p[1] * p[1]));
function makeWorld(seed, n = 2000, rho = 0.95) {
  const rng = new Rng(seed);
  const z = Array.from({ length: n }, () => { const a = rng.normal(); return [a, rng.normal()]; });
  const c = Math.sqrt(1 - rho * rho);
  const views = [0, 1].map(() => z.map((p) => p.map((a) => rho * a + c * rng.normal())));
  return { z, views };
}
function affineFit(xs, ys) {
  const rows = xs.map((x) => [x[0], x[1], 1]);
  const gram = [0, 1, 2].map((i) => [0, 1, 2].map((j) => total(rows.map((r) => r[i] * r[j]))));
  const rhs = [0, 1, 2].map((i) => [0, 1].map((c) => total(rows.map((r, k) => r[i] * ys[k][c]))));
  const w = solve(gram, rhs);
  const mean = [0, 1].map((c) => total(ys.map((y) => y[c])) / ys.length);
  const errs = [], tots = [];
  rows.forEach((r, k) => [0, 1].forEach((c) => { const d = ys[k][c] - r[0] * w[0][c] - r[1] * w[1][c] - w[2][c]; errs.push(d * d); }));
  ys.forEach((y) => [0, 1].forEach((c) => { const d = y[c] - mean[c]; tots.push(d * d); }));
  return [[[w[0][0], w[1][0]], [w[0][1], w[1][1]]], 1 - total(errs) / total(tots)];
}
function recovery(z, h) {
  const [a, r2zh] = affineFit(z, h), r2hz = affineFit(h, z)[1];
  const ata = [0, 1].map((i) => [0, 1].map((j) => a[0][i] * a[0][j] + a[1][i] * a[1][j]));
  const sq = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const d = ata[i][j] - (i === j ? 1 : 0); sq.push(d * d); }
  const orth = Math.sqrt(total(sq)) / Math.SQRT2;
  const c = (v) => clamp(v, 0, 1);
  return [r2zh, r2hz, orth, 35 * c(r2zh) + 35 * c(r2hz) + 20 * c(1 - orth)];
}
function jepaLosses(h0, h1) {
  const n = h0.length;
  const align = total(h0.map((a, i) => { const d0 = a[0] - h1[i][0], d1 = a[1] - h1[i][1]; return d0 * d0 + d1 * d1; })) / n;
  const mean = [0, 1].map((c) => total(h0.map((h) => h[c])) / n);
  const cov = [0, 1].map((i) => [0, 1].map((j) => total(h0.map((h) => (h[i] - mean[i]) * (h[j] - mean[j]))) / n));
  const sq = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const d = cov[i][j] - (i === j ? 1 : 0); sq.push(d * d); }
  return [align, mean[0] * mean[0] + mean[1] * mean[1] + total(sq)];
}
const ENCODERS = [["rotation", (p) => rotate(p, 0.8)], ["3 x rotation", (p) => rotate(p, 0.8).map((c) => 3 * c)],
  ["0.01 x rotation", (p) => rotate(p, 0.8).map((c) => 0.01 * c)], ["the spiral x", spiral]];
let WORLD = null;
const world = () => WORLD || (WORLD = makeWorld(1));
const JEPA = {};
function jepaRow(k) {
  if (JEPA[k]) return JEPA[k];
  const { z, views } = world(), enc = ENCODERS[k][1];
  return (JEPA[k] = [...jepaLosses(views[0].map(enc), views[1].map(enc)), ...recovery(z, z.map(enc))]);
}

function demoJepa(el) {
  let k = 3;
  el.innerHTML = `<div class="controls">${ENCODERS.map(([n], i) => `<button class="cbtn" data-k="${i}">${n}</button>`).join("")}</div>
    <div class="lj-wrap"><div class="svgbox lj-chart"></div><div class="lj-side"><div class="stats"></div></div></div>
    <p class="hint">Each dot is one encoder output h for a latent z; its color is z's quadrant. A good encoder keeps the four colors in four turned quadrants. The scale of the plot follows the outputs.</p>`;
  const draw = () => {
    const { z } = world(), enc = ENCODERS[k][1], S = 260, pts = z.slice(0, 500).map(enc);
    const r = Math.max(...pts.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1])))) * 1.05;
    const cols = ["var(--teal)", "var(--amber)", "var(--green)", "var(--red)"];
    let svg = `<svg viewBox="0 0 ${S} ${S}" role="img" aria-label="Encoder outputs"><line x1="0" x2="${S}" y1="${S / 2}" y2="${S / 2}" stroke="var(--line)"/><line y1="0" y2="${S}" x1="${S / 2}" x2="${S / 2}" stroke="var(--line)"/>`;
    pts.forEach((p, i) => {
      const q = (z[i][0] >= 0 ? 0 : 1) + (z[i][1] >= 0 ? 0 : 2);
      svg += `<circle cx="${S / 2 + (p[0] / r) * (S / 2)}" cy="${S / 2 - (p[1] / r) * (S / 2)}" r="2" fill="${cols[q]}" opacity="0.75"/>`;
    });
    el.querySelector(".lj-chart").innerHTML = svg + "</svg>";
    const [align, white, r2zh, r2hz, orth, q] = jepaRow(k);
    el.querySelector(".stats").innerHTML = `
      <div class="stat ${align < 0.01 ? "bad" : ""}"><small>alignment</small><b>${fmt(align, 3)}</b></div>
      <div class="stat ${white > 1 ? "bad" : "good"}"><small>whitening</small><b>${fmt(white, 3)}</b></div>
      <div class="stat"><small>R² z→h · h→z</small><b>${fmt(r2zh, 3)} · ${fmt(r2hz, 3)}</b></div>
      <div class="stat ${q > 85 ? "good" : "bad"}"><small>orth error · Q</small><b>${fmt(orth, 2)} · ${fmt(q, 1)}</b></div>`;
    el.querySelectorAll(".cbtn").forEach((b) => b.classList.toggle("on", +b.dataset.k === k));
  };
  el.querySelectorAll(".cbtn").forEach((b) => { b.onclick = () => { k = +b.dataset.k; draw(); }; });
  draw();
}

// ---------- Nano World Model: schedules and averaging ----------

function schedule(frames, steps, lag) {
  const rows = [];
  for (let r = 0; r <= steps + lag * (frames - 1); r++) rows.push(Array.from({ length: frames }, (_, f) => clamp(1 - (r - lag * f) / steps, 0, 1)));
  return rows;
}

function demoSchedule(el) {
  const steps = 4;
  el.innerHTML = `<div class="controls"><label>lag <input class="l" type="range" min="0" max="${steps}" value="${steps}"><b class="mono vl"></b></label></div>
    <div class="nw-grid"></div>
    <p class="hint">Rows run top to bottom; columns are future frames 1 to 3. Dark is pure noise (1), white is clean (0). Our schedule has 4 steps per frame; the task's has 250.</p>`;
  const draw = () => {
    const lag = +el.querySelector(".l").value, rows = schedule(3, steps, lag);
    el.querySelector(".vl").textContent = `${lag}${lag === 0 ? " (together)" : lag === 1 ? " (pyramid)" : lag === steps ? " (sequential)" : ""}`;
    el.querySelector(".nw-grid").innerHTML = `<div class="nw-head"><small>row</small><small>f1</small><small>f2</small><small>f3</small></div>` + rows.map((row, r) => `<div class="nw-row"><small>${r}</small>${row.map((x) => `<span style="background:color-mix(in srgb, var(--ink) ${Math.round(x * 85)}%, var(--card))" title="${x}"><b>${x === 0 || x === 1 ? x : fmt(x, 2)}</b></span>`).join("")}</div>`).join("") + `<p class="meta">${rows.length} rows, each one model call for all frames.</p>`;
  };
  el.querySelector(".l").oninput = draw;
  draw();
}

const psnr = (a, b) => 10 * Math.log10(1 / (total(a.map((x, i) => (x - b[i]) * (x - b[i]))) / a.length));
let FRAMES = null;
function frames() {
  if (FRAMES) return FRAMES;
  const rng = new Rng(9);
  const truth = Array.from({ length: 256 }, () => rng.uniform());
  const shared = truth.map(() => 0.02 * rng.normal());
  const samples = Array.from({ length: 16 }, () => truth.map((t, i) => t + shared[i] + 0.08 * rng.normal()));
  return (FRAMES = { truth, samples });
}
const averaged = (n) => { const { truth, samples } = frames(); return truth.map((_, i) => total(samples.slice(0, n).map((s) => s[i])) / n); };

function demoAverage(el) {
  el.innerHTML = `<div class="controls"><label>samples averaged <input class="n" type="range" min="1" max="16" value="1"><b class="mono vn"></b></label></div>
    <div class="svgbox av-chart"></div><div class="stats"></div>
    <p class="legend"><span><i style="background:var(--ink-2)"></i>true pixels</span><span><i style="background:var(--teal)"></i>the average</span></p>`;
  const draw = () => {
    const n = +el.querySelector(".n").value, { truth } = frames(), avg = averaged(n), W = 600, H = 150, k = 64;
    el.querySelector(".vn").textContent = n;
    const X = (i) => 6 + (i / (k - 1)) * (W - 12), Y = (v) => 8 + (1.2 - clamp(v, -0.2, 1.2)) / 1.4 * (H - 16);
    const poly = (arr, col, wd) => `<polyline fill="none" stroke="${col}" stroke-width="${wd}" points="${arr.slice(0, k).map((v, i) => `${X(i)},${Y(v)}`).join(" ")}"/>`;
    el.querySelector(".av-chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pixels of the average and the truth">${poly(truth, "var(--ink-2)", 1.5)}${poly(avg, "var(--teal)", 2)}</svg>`;
    const p = psnr(avg, truth);
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>samples</small><b>${n}</b></div>
      <div class="stat"><small>PSNR</small><b>${fmt(p, 2)} dB</b></div>
      <div class="stat ${p > 30 ? "good" : ""}"><small>PSNR term</small><b>${fmt(clamp((p - 20) / 30, 0, 1), 3)}</b></div>`;
  };
  el.querySelector(".n").oninput = draw;
  draw();
}

// ---------- Polar Express: a schedule against a fixed cubic ----------

function bestCubic(lo, hi) {
  const c = hi * hi + hi * lo + lo * lo, peak = Math.sqrt(c / 3);
  const b = 2 / (lo ** 3 - c * lo + peak ** 3 - c * peak), a = -b * c;
  return [a, b, 1 - (a * lo + b * lo ** 3)];
}
function polarRuns(n) {
  let loNs = 0.001, loPe = 0.001, hiPe = 1;
  const out = [{ ns: [loNs, 1], pe: [loPe, hiPe], ens: 1 - loNs, epe: 1 - loPe }];
  for (let k = 0; k < n; k++) {
    loNs = 1.5 * loNs - 0.5 * loNs ** 3;
    const [, , err] = bestCubic(loPe, hiPe);
    [loPe, hiPe] = [1 - err, 1 + err];
    out.push({ ns: [loNs, 1], pe: [loPe, hiPe], ens: 1 - loNs, epe: err });
  }
  return out;
}

function demoPolar(el) {
  const runs = polarRuns(10);
  el.innerHTML = `<div class="controls"><label>steps <input class="s" type="range" min="0" max="10" value="0"><b class="mono vs"></b></label></div>
    <div class="pe-lines"></div><div class="stats"></div>
    <p class="hint">Each line is the range of values from 0 to 2 that the singular values, which start between 0.001 and 1, can now take. The goal is to squeeze them all onto 1.</p>`;
  const draw = () => {
    const s = +el.querySelector(".s").value, r = runs[s];
    el.querySelector(".vs").textContent = s;
    const bar = ([lo, hi], cls) => `<span class="pe-track"><span class="pe-one"></span><span class="pe-int ${cls}" style="left:${(lo / 2) * 100}%;width:${Math.max(0.4, ((hi - lo) / 2) * 100)}%"></span></span>`;
    el.querySelector(".pe-lines").innerHTML = `
      <div class="pe-line"><small>Newton–Schulz</small>${bar(r.ns, "ns")}</div>
      <div class="pe-line"><small>greedy best cubic</small>${bar(r.pe, "pe")}</div>`;
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>Newton–Schulz worst error</small><b>${fmtE(r.ens, 2)}</b></div>
      <div class="stat ${r.epe < 1e-3 ? "good" : ""}"><small>greedy worst error</small><b>${fmtE(r.epe, 2)}</b></div>`;
  };
  el.querySelector(".s").oninput = draw;
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

const DEMOS = {
  kv: (el) => demoKv(el),
  kvAuto: (el) => demoKv(el, { auto: true }),
  ragen: (el) => demoRagen(el),
  signal: (el) => demoSignal(el),
  queue: (el) => demoQueue(el),
  jepa: (el) => demoJepa(el),
  schedule: (el) => demoSchedule(el),
  average: (el) => demoAverage(el),
  polar: (el) => demoPolar(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
