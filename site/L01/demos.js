// L01 demos. The JS models repeat the Python programs in frontiercs2/notes/L01-mlsys.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

// Park-Miller generator, exact in JavaScript (products stay below 2^53).
class Rng {
  constructor(seed) { this.state = seed; }
  next() { this.state = (this.state * 48271) % 2147483647; return this.state; }
  below(k) { return this.next() % k; }
  uniform() { return this.next() / 2147483647; }
}

// Python 3.12+ sum() of floats: Neumaier's compensated summation, as CPython does it.
function pysum(xs) {
  let f = 0, c = 0;
  for (const x of xs) {
    const t = f + x;
    c += Math.abs(f) >= Math.abs(x) ? (f - t) + x : (x - t) + f;
    f = t;
  }
  return c !== 0 && Number.isFinite(c) ? f + c : f;
}
const sqDist = (a, b) => pysum(a.map((x, i) => (x - b[i]) * (x - b[i])));
const fmt = (x, d) => x.toFixed(d);

// ---------- SVG-EAR: one query, four keys ----------

const ATTN = { A: [[1, 2], [1, 2]], B: [[0, 1], [2, 3]] };   // (score, value)
const exactW = (keys) => [pysum(keys.map(([s]) => Math.exp(s))), pysum(keys.map(([s, v]) => Math.exp(s) * v))];
function estimateW(keys) {
  const n = keys.length, sBar = pysum(keys.map(([s]) => s)) / n, vBar = pysum(keys.map(([, v]) => v)) / n;
  const w = n * Math.exp(sBar);
  return [w, w * vBar];
}
function outputOf(plan) {
  let w = 0, wv = 0;
  for (const [keys, how] of plan) {
    if (how === "drop") continue;
    const [a, b] = (how === "compute" ? exactW : estimateW)(keys);
    w += a; wv += b;
  }
  return wv / w;
}

function demoAttn(el, { auto = false } = {}) {
  const plan = { A: "estimate", B: "compute" };
  const autoPlans = [["compute", "compute"], ["drop", "compute"], ["compute", "estimate"], ["estimate", "compute"]];
  el.innerHTML = `<div class="at-grid"></div><div class="stats"></div>${auto ? "" : `<p class="hint">Choose how to handle each cluster. Room for one computed cluster: which one should it be?</p>`}`;
  const full = outputOf([[ATTN.A, "compute"], [ATTN.B, "compute"]]);
  const draw = () => {
    const top = 9;
    el.querySelector(".at-grid").innerHTML = ["A", "B"].map((name) => {
      const keys = ATTN[name], [w] = exactW(keys), [e] = estimateW(keys);
      const used = plan[name] === "compute" ? w : plan[name] === "estimate" ? e : 0;
      return `<div class="card at-card"><div class="at-head"><b>Cluster ${name}</b><span class="mono">scores ${keys.map(([s]) => s).join(", ")} · values ${keys.map(([, v]) => v).join(", ")}</span></div>
        <div class="at-bar"><small>true weight</small><span style="width:${(w / top) * 100}%" class="t"></span><b class="mono">${fmt(w, 2)}</b></div>
        <div class="at-bar"><small>used</small><span style="width:${(used / top) * 100}%" class="u ${plan[name]}"></span><b class="mono">${fmt(used, 2)}</b></div>
        <div class="at-btns">${["compute", "estimate", "drop"].map((h) => `<button class="cbtn ${plan[name] === h ? "on" : ""}" data-c="${name}" data-h="${h}" ${auto ? "disabled" : ""}>${h}</button>`).join("")}</div></div>`;
    }).join("");
    el.querySelectorAll(".at-btns .cbtn").forEach((b) => { b.onclick = () => { plan[b.dataset.c] = b.dataset.h; draw(); }; });
    const both = plan.A === "drop" && plan.B === "drop";
    const o = both ? NaN : outputOf([[ATTN.A, plan.A], [ATTN.B, plan.B]]);
    const computed = (plan.A === "compute") + (plan.B === "compute");
    const gap = Math.abs(o - full);
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>full attention</small><b>${fmt(full, 3)}</b></div>
      <div class="stat ${both ? "bad" : gap < 5e-4 ? "good" : "bad"}"><small>this plan</small><b>${both ? "—" : fmt(o, 3)}</b></div>
      <div class="stat"><small>clusters computed</small><b>${computed} of 2</b></div>`;
  };
  draw();
  if (auto) {
    let k = 0;
    setInterval(() => { k = (k + 1) % 4; [plan.A, plan.B] = autoPlans[k]; draw(); }, 2400);
    [plan.A, plan.B] = autoPlans[0]; draw();
  }
}

// ---------- SVG-EAR: routing a layer ----------

const RD = 8, RCLUSTERS = 16, RSIZE = 8, RQUERIES = 32;
function makeLayer(seed) {
  const rng = new Rng(seed), clusters = [];
  for (let c = 0; c < RCLUSTERS; c++) {
    const center = Array.from({ length: RD }, () => 2 * rng.uniform() - 1);
    const spread = 0.1 + (0.9 * c) / (RCLUSTERS - 1);
    const keys = Array.from({ length: RSIZE }, () => center.map((x) => x + spread * (2 * rng.uniform() - 1)));
    clusters.push(keys.map((k) => [k, 2 * rng.uniform() - 1 + c / 8]));
  }
  const queries = Array.from({ length: RQUERIES }, () => Array.from({ length: RD }, () => 3 * (2 * rng.uniform() - 1)));
  return { clusters, queries };
}
const scoredKeys = (q, cluster) => cluster.map(([k, v]) => [pysum(q.map((x, i) => x * k[i])) / Math.sqrt(RD), v]);
function blockError(keys) {
  const [w, wv] = estimateW(keys), one = w / keys.length, vBar = wv / w;
  return pysum(keys.map(([s, v]) => { const d = one * vBar - Math.exp(s) * v; return d * d; }));
}
function routeOrder(blocks, rankBy) {
  const sig = blocks.map((b) => (rankBy === "error" ? blockError(b) : estimateW(b)[0]));
  return blocks.map((_, i) => i).sort((a, b) => sig[b] - sig[a]);
}
function routed(q, clusters, budget, rankBy, rest) {
  const blocks = clusters.map((c) => scoredKeys(q, c));
  const chosen = new Set(routeOrder(blocks, rankBy).slice(0, budget));
  return outputOf(blocks.map((b, i) => [b, chosen.has(i) ? "compute" : rest]));
}
function meanError(budget, rankBy, rest, clusters, queries) {
  return pysum(queries.map((q) => Math.abs(routed(q, clusters, budget, rankBy, rest) - routed(q, clusters, clusters.length, rankBy, rest)))) / queries.length;
}
let LAYER = null;
const layer = () => LAYER || (LAYER = makeLayer(5));
const RULES = [["weight", "drop", "rank by weight, drop the rest"], ["weight", "estimate", "rank by weight, estimate the rest"], ["error", "estimate", "rank by error, estimate the rest (SVG-EAR)"]];

function demoRoute(el) {
  const { clusters, queries } = layer();
  el.innerHTML = `<div class="controls"><label>clusters computed <input class="b" type="range" min="1" max="15" value="4"><b class="mono vb"></b></label>
      <label>query <input class="q" type="range" min="1" max="32" value="1"><b class="mono vq"></b></label></div>
    <div class="rt-strips"></div><div class="rt-bars"></div>
    <p class="hint">Each strip is one query's 16 key clusters, from tight (left) to loose (right). Filled cells are computed; the bars give the mean gap from full attention over all 32 queries.</p>`;
  const draw = () => {
    const budget = +el.querySelector(".b").value, qi = +el.querySelector(".q").value - 1;
    el.querySelector(".vb").textContent = `${budget} of 16`;
    el.querySelector(".vq").textContent = qi + 1;
    const blocks = clusters.map((c) => scoredKeys(queries[qi], c));
    el.querySelector(".rt-strips").innerHTML = [["weight", "by weight"], ["error", "by error"]].map(([r, label]) => {
      const chosen = new Set(routeOrder(blocks, r).slice(0, budget));
      return `<div class="rt-strip"><small>${label}</small>${blocks.map((_, i) => `<span class="rt-cell ${chosen.has(i) ? (r === "error" ? "on-e" : "on-w") : ""}" title="cluster ${i + 1}"></span>`).join("")}</div>`;
    }).join("");
    const errs = RULES.map(([r, s]) => meanError(budget, r, s, clusters, queries));
    const top = Math.max(...RULES.map(([r, s]) => meanError(1, r, s, clusters, queries)));
    el.querySelector(".rt-bars").innerHTML = RULES.map(([, , label], i) => `<div class="rt-bar"><small>${label}</small><span class="r${i}" style="width:${Math.max(1, (errs[i] / top) * 100)}%"></span><b class="mono">${fmt(errs[i], 4)}</b></div>`).join("");
  };
  el.querySelectorAll("input").forEach((i) => { i.oninput = draw; });
  draw();
}

// ---------- Continuum: a small server ----------

const CONVERSATIONS = [
  [0.0, [[3000, 4.0], [800, 6.0], [800, 3.0], [600, 0.0]]],
  [1.0, [[2500, 5.0], [900, 5.0], [700, 0.0]]],
  [2.0, [[4000, 3.0], [600, 7.0], [900, 4.0], [500, 0.0]]],
  [3.5, [[2000, 6.0], [1000, 4.0], [800, 0.0]]],
  [5.0, [[3500, 4.0], [700, 5.0], [600, 0.0]]],
  [6.0, [[3000, 5.0], [800, 3.0], [900, 6.0], [700, 0.0]]],
];
const REPLY = 300, PREFILL_RATE = 4000, DECODE_SECONDS = 1.0, CACHE = 14000;

function serve(convs, policy, ttl = 0) {
  const n = convs.length, turn = Array(n).fill(0), context = Array(n).fill(0);
  const ready = convs.map(([a]) => a), cache = new Map(), done = new Map(), segments = [];
  let clock = 0, recomputed = 0;
  const open = () => [...Array(n).keys()].filter((c) => !done.has(c));
  while (done.size < n) {
    const waiting = open().filter((c) => ready[c] <= clock);
    if (!waiting.length) { clock = Math.min(...open().map((c) => ready[c])); continue; }
    const key = policy === "vllm" ? (c) => ready[c] : (c) => convs[c][0];
    const c = waiting.reduce((b, x) => (key(x) < key(b) || (key(x) === key(b) && x < b) ? x : b));
    const [fresh] = convs[c][1][turn[c]], pause = convs[c][1][turn[c]][1];
    const hit = cache.has(c);
    cache.delete(c);
    const prompt = hit ? fresh : context[c] + fresh;
    recomputed += prompt - fresh;
    const need = context[c] + fresh + REPLY;
    let victims;
    if (policy === "vllm") victims = [...cache.keys()].sort((a, b) => cache.get(a)[1] - cache.get(b)[1]);
    else {
      const free = [...cache.keys()].filter((v) => cache.get(v)[2] <= clock).sort((a, b) => cache.get(a)[1] - cache.get(b)[1]);
      const newer = [...cache.keys()].filter((v) => cache.get(v)[2] > clock && convs[v][0] > convs[c][0]).sort((a, b) => convs[b][0] - convs[a][0]);
      victims = free.concat(newer);
    }
    for (const v of victims) {
      if (pysum([...cache.values()].map(([t]) => t)) + need <= CACHE) break;
      cache.delete(v);
    }
    const start = clock;
    clock += prompt / PREFILL_RATE + DECODE_SECONDS;
    segments.push({ c, start, redo: (prompt - fresh) / PREFILL_RATE, end: clock });
    context[c] = need;
    turn[c] += 1;
    if (turn[c] === convs[c][1].length) done.set(c, clock - convs[c][0]);
    else {
      cache.set(c, [need, clock, policy === "continuum" ? clock + ttl : clock]);
      ready[c] = clock + pause;
    }
  }
  return { latency: [...Array(n).keys()].map((c) => done.get(c)), recomputed, segments, end: clock };
}
const nearestRank = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1];

function demoServe(el, { mini = false } = {}) {
  let policy = mini ? "vllm" : "continuum", ttl = 8;
  el.innerHTML = `${mini ? "" : `<div class="controls"><button class="cbtn p-vllm">vLLM</button><button class="cbtn p-cont">Continuum</button>
      <label>TTL <input class="ttl" type="range" min="0" max="12" value="8"><b class="mono vt"></b></label></div>`}
    <div class="svgbox sv-chart"></div><div class="legend"><span><i style="background:var(--teal)"></i>new tokens + reply</span><span><i style="background:var(--amber)"></i>context computed again</span><span><i style="background:var(--line)"></i>tool pause or waiting</span></div><div class="stats"></div>`;
  const draw = () => {
    const r = serve(CONVERSATIONS, policy, ttl), W = 560, rowH = 22, H = 24 + rowH * 6, x0 = 34, scale = (W - x0 - 14) / 50;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Timeline of six conversations">`;
    for (let t = 0; t <= 50; t += 10) svg += `<text x="${x0 + t * scale}" y="${H - 4}" font-size="10" fill="var(--stone)" text-anchor="middle">${t}s</text>`;
    CONVERSATIONS.forEach(([arrival], c) => {
      const y = 4 + c * rowH, last = arrival + r.latency[c];
      svg += `<text x="4" y="${y + 13}" font-size="11" fill="var(--ink-2)">C${c + 1}</text>
        <rect x="${x0 + arrival * scale}" y="${y + 7}" width="${(last - arrival) * scale}" height="4" fill="var(--line)"/>`;
    });
    r.segments.forEach(({ c, start, redo, end }) => {
      const y = 4 + c * rowH;
      svg += `<rect x="${x0 + start * scale}" y="${y + 2}" width="${redo * scale}" height="14" fill="var(--amber)"/>
        <rect x="${x0 + (start + redo) * scale}" y="${y + 2}" width="${(end - start - redo) * scale}" height="14" fill="var(--teal)"/>`;
    });
    el.querySelector(".sv-chart").innerHTML = svg + "</svg>";
    const mean = pysum(r.latency) / r.latency.length;
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>${policy === "vllm" ? "vLLM" : `Continuum, TTL ${ttl} s`}</small><b>mean ${fmt(mean, 1)} s</b></div>
      <div class="stat"><small>p90 (nearest rank)</small><b>${fmt(nearestRank(r.latency, 0.9), 1)} s</b></div>
      <div class="stat ${r.recomputed < 30000 ? "good" : ""}"><small>tokens computed again</small><b>${r.recomputed.toLocaleString("en-US")}</b></div>`;
    if (!mini) {
      el.querySelector(".p-vllm").classList.toggle("on", policy === "vllm");
      el.querySelector(".p-cont").classList.toggle("on", policy !== "vllm");
      el.querySelector(".ttl").disabled = policy === "vllm";
      el.querySelector(".vt").textContent = `${ttl} s`;
    }
  };
  if (mini) setInterval(() => { policy = policy === "vllm" ? "continuum" : "vllm"; draw(); }, 3000);
  else {
    el.querySelector(".p-vllm").onclick = () => { policy = "vllm"; draw(); };
    el.querySelector(".p-cont").onclick = () => { policy = "continuum"; draw(); };
    el.querySelector(".ttl").oninput = (e) => { ttl = +e.target.value; draw(); };
  }
  draw();
}

// ---------- FlashLib k-NN ----------

function makePoints(seed, n, dim, centers = 16) {
  const rng = new Rng(seed);
  const middles = Array.from({ length: centers }, () => Array.from({ length: dim }, () => rng.below(256)));
  return Array.from({ length: n }, () => {
    const m = middles[rng.below(centers)];
    return m.map((x) => Math.min(255, Math.max(0, x + rng.below(61) - 30)));
  });
}
let KNN = null;
function knnData() {
  if (KNN) return KNN;
  const database = makePoints(1, 4096, 8), queries = makePoints(2, 4, 8);
  KNN = { database, queries, table: queries.map((q) => database.map((row) => sqDist(q, row))) };
  return KNN;
}
const byDist = (d) => (a, b) => d[a] - d[b] || a - b;

function knnBounded(dists, k, group) {
  const groups = [];
  for (let start = 0; start < dists.length; start += group) {
    const rows = [];
    for (let j = start; j < Math.min(start + group, dists.length); j++) rows.push(j);
    rows.sort(byDist(dists));
    groups.push({ start, first: rows[0], second: rows[1] });
  }
  const bound = groups.map((g) => dists[g.first]).sort((a, b) => a - b)[k - 1];
  const cand = new Set();
  for (const g of groups) {
    g.best = dists[g.first] <= bound;
    g.rescan = dists[g.second] <= bound;
    if (g.best) cand.add(g.first);
    if (g.rescan) for (let j = g.start; j < Math.min(g.start + group, dists.length); j++) cand.add(j);
  }
  const found = [...cand].sort(byDist(dists)).slice(0, k);
  return { found, count: cand.size, groups, bound };
}

function demoKnn(el) {
  el.innerHTML = `<div class="controls"><label>group size <select class="g">${[16, 32, 64, 128].map((g) => `<option${g === 32 ? " selected" : ""}>${g}</option>`).join("")}</select></label>
      <label>k <input class="k" type="range" min="1" max="30" value="10"><b class="mono vk"></b></label>
      <label>query <select class="qq">${[1, 2, 3, 4].map((q) => `<option value="${q - 1}">${q}</option>`).join("")}</select></label></div>
    <div class="svgbox kn-chart"></div>
    <div class="legend"><span><i style="background:var(--teal)"></i>gives its best row</span><span><i style="background:var(--amber)"></i>rescanned in full</span><span><i style="background:var(--line)"></i>skipped</span></div>
    <div class="stats"></div>`;
  const draw = () => {
    const { table } = knnData(), group = +el.querySelector(".g").value, k = +el.querySelector(".k").value, qi = +el.querySelector(".qq").value;
    el.querySelector(".vk").textContent = k;
    const d = table[qi], r = knnBounded(d, k, group);
    const exact = [...d.keys()].sort(byDist(d)).slice(0, k);
    const ok = exact.every((j, i) => j === r.found[i]);
    const shown = r.groups, W = 560, H = 140, bw = (W - 20) / shown.length;
    const lo = 0.9 * Math.min(...shown.map((g) => d[g.first])), hi = lo + 2.5 * (r.bound - lo);
    const y = (v) => H - 14 - Math.max(0.02, Math.min(1, (v - lo) / (hi - lo))) * (H - 28);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Group minima against the bound">`;
    shown.forEach((g, i) => {
      const x = 10 + i * bw, col = g.rescan ? "var(--amber)" : g.best ? "var(--teal)" : "var(--line)";
      svg += `<rect x="${x + 1}" y="${y(d[g.first])}" width="${Math.max(1, bw - 2)}" height="${H - 14 - y(d[g.first])}" fill="${col}"/>
        <circle cx="${x + bw / 2}" cy="${y(d[g.second])}" r="${Math.min(3, bw / 3)}" fill="none" stroke="var(--ink-2)"/>`;
    });
    svg += `<line x1="8" x2="${W - 8}" y1="${y(r.bound)}" y2="${y(r.bound)}" stroke="var(--red)" stroke-dasharray="4 3"/>
      <text x="${W - 10}" y="${y(r.bound) - 4}" font-size="10" text-anchor="end" fill="var(--red)">bound = ${r.bound.toLocaleString("en-US")}</text></svg>`;
    el.querySelector(".kn-chart").innerHTML = svg + `<small class="mono" style="color:var(--stone)">${r.groups.length} groups: bar = smallest distance, circle = second smallest (the axis is zoomed around the bound)</small>`;
    const avg = pysum(knnData().table.map((t) => knnBounded(t, k, group).count)) / 4;
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>rows rescored</small><b>${r.count.toLocaleString("en-US")} / 4,096</b></div>
      <div class="stat"><small>mean of 4 queries</small><b>${fmt(avg, 2)}</b></div>
      <div class="stat ${ok ? "good" : "bad"}"><small>exact top-k</small><b>${ok ? "yes" : "no"}</b></div>`;
  };
  el.querySelectorAll("input, select").forEach((i) => { i.oninput = draw; i.onchange = draw; });
  draw();
}

// ---------- k-means step (also used to build the IVF-PQ index) ----------

function kmeansStep(points, centroids, tile = 4) {
  const labels = points.map((p) => {
    let bd = Infinity, bc = -1;
    for (let start = 0; start < centroids.length; start += tile) {
      for (let c = start; c < Math.min(start + tile, centroids.length); c++) {
        const d = sqDist(p, centroids[c]);
        if (d < bd) { bd = d; bc = c; }
      }
    }
    return bc;
  });
  const dim = centroids[0].length, sums = centroids.map(() => Array(dim).fill(0)), counts = Array(centroids.length).fill(0);
  points.forEach((p, i) => { const c = labels[i]; counts[c] += 1; sums[c] = sums[c].map((s, j) => s + p[j]); });
  const fresh = sums.map((total, c) => (counts[c] ? total.map((s) => s / counts[c]) : centroids[c]));
  return { labels, centroids: fresh, counts };
}

// ---------- DBSCAN ----------

function makeBlobs(seed, n = 150) {
  const rng = new Rng(seed), blobs = [[0.25, 0.3, 0.08], [0.7, 0.7, 0.1], [0.75, 0.25, 0.05]], pts = [];
  for (let i = 0; i < n; i++) {
    if (i % 10 === 9) { const x = rng.uniform(); pts.push([x, rng.uniform()]); }
    else {
      const [x, y, r] = blobs[rng.below(3)];
      const px = x + r * (2 * rng.uniform() - 1);
      pts.push([px, y + r * (2 * rng.uniform() - 1)]);
    }
  }
  return pts;
}

function dbscan(pts, eps, minSamples) {
  const n = pts.length;
  const near = pts.map((p) => [...pts.keys()].filter((j) => sqDist(p, pts[j]) <= eps * eps));
  const core = near.map((l) => l.length >= minSamples), parent = [...pts.keys()];
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < n; i++) for (const j of near[i]) {
    if (core[i] && core[j]) { const a = find(i), b = find(j); parent[Math.max(a, b)] = Math.min(a, b); }
  }
  const labels = [];
  for (let i = 0; i < n; i++) {
    if (core[i]) labels.push(find(i));
    else { const roots = near[i].filter((j) => core[j]).map(find); labels.push(roots.length ? Math.min(...roots) : -1); }
  }
  return { labels, core };
}
let BLOBS = null;
const blobs = () => BLOBS || (BLOBS = makeBlobs(4));
const PALETTE = ["var(--teal)", "var(--amber)", "var(--green)", "var(--sea)", "var(--red)"];

function dbscanStats(labels, core) {
  const clusters = [...new Set(labels.filter((x) => x !== -1))].sort((a, b) => a - b);
  const border = labels.filter((x, i) => x !== -1 && !core[i]).length;
  return { clusters, core: core.filter(Boolean).length, border, noise: labels.filter((x) => x === -1).length };
}

function demoDbscan(el, { mini = false } = {}) {
  let eps = 50, ms = 5;
  el.innerHTML = `${mini ? "" : `<div class="controls"><label>eps <input class="e" type="range" min="20" max="100" step="5" value="50"><b class="mono ve"></b></label>
      <label>min_samples <input class="m" type="range" min="2" max="12" value="5"><b class="mono vm"></b></label></div>`}
    <div class="db-wrap"><div class="svgbox db-chart"></div><div class="db-side"><div class="stats"></div>
    <p class="db-key"><span><i class="dot core"></i>core</span><span><i class="dot border"></i>border</span><span><i class="dot noise"></i>noise</span></p></div></div>`;
  const draw = () => {
    const pts = blobs(), { labels, core } = dbscan(pts, eps / 1000, ms), s = dbscanStats(labels, core), S = 300;
    let svg = `<svg viewBox="0 0 ${S} ${S}" role="img" aria-label="DBSCAN clusters">`;
    if (!mini) svg += `<circle cx="${pts[0][0] * S}" cy="${S - pts[0][1] * S}" r="${(eps / 1000) * S}" fill="none" stroke="var(--stone)" stroke-dasharray="3 3"/>`;
    pts.forEach(([x, y], i) => {
      const cx = x * S, cy = S - y * S;
      if (labels[i] === -1) svg += `<path d="M${cx - 3} ${cy - 3}L${cx + 3} ${cy + 3}M${cx - 3} ${cy + 3}L${cx + 3} ${cy - 3}" stroke="var(--stone)"/>`;
      else {
        const col = PALETTE[s.clusters.indexOf(labels[i]) % PALETTE.length];
        svg += core[i] ? `<circle cx="${cx}" cy="${cy}" r="3.2" fill="${col}"/>` : `<circle cx="${cx}" cy="${cy}" r="3.4" fill="var(--paper)" stroke="${col}" stroke-width="1.6"/>`;
      }
    });
    el.querySelector(".db-chart").innerHTML = svg + "</svg>";
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>eps · min_samples</small><b>${fmt(eps / 1000, 3)} · ${ms}</b></div>
      <div class="stat"><small>clusters</small><b>${s.clusters.length}</b></div>
      <div class="stat"><small>core · border</small><b>${s.core} · ${s.border}</b></div>
      <div class="stat"><small>noise</small><b>${s.noise}</b></div>`;
    if (!mini) { el.querySelector(".ve").textContent = fmt(eps / 1000, 3); el.querySelector(".vm").textContent = ms; }
  };
  if (mini) {
    const seq = [30, 40, 50, 60, 80];
    let k = 2;
    setInterval(() => { k = (k + 1) % seq.length; eps = seq[k]; draw(); }, 2200);
  } else {
    el.querySelector(".e").oninput = (e) => { eps = +e.target.value; draw(); };
    el.querySelector(".m").oninput = (e) => { ms = +e.target.value; draw(); };
  }
  draw();
}

// ---------- IVF-PQ ----------

function lloyd(points, k, steps) {
  let centers = points.slice(0, k).map((p) => p.map(Number));
  for (let s = 0; s < steps; s++) centers = kmeansStep(points, centers).centroids;
  return centers;
}
function nearest(v, centers) {
  let bc = 0, bd = sqDist(v, centers[0]);
  for (let c = 1; c < centers.length; c++) { const d = sqDist(v, centers[c]); if (d < bd) { bd = d; bc = c; } }
  return bc;
}
function buildIndex(base, nlist = 16, m = 4, codes = 16) {
  const coarse = lloyd(base, nlist, 6), lists = Array.from({ length: nlist }, () => []), residuals = [];
  base.forEach((v, i) => { const c = nearest(v, coarse); lists[c].push(i); residuals.push(v.map((x, j) => x - coarse[c][j])); });
  const sub = base[0].length / m;
  const books = Array.from({ length: m }, (_, p) => lloyd(residuals.map((r) => r.slice(p * sub, (p + 1) * sub)), codes, 6));
  const code = residuals.map((r) => books.map((book, p) => nearest(r.slice(p * sub, (p + 1) * sub), book)));
  return { coarse, lists, books, code };
}
function search(index, q, k, nprobe) {
  const { coarse, lists, books, code } = index, sub = q.length / books.length;
  const cd = coarse.map((c) => sqDist(q, c));
  const probes = [...coarse.keys()].sort(byDist(cd)).slice(0, nprobe);
  const hits = [];
  for (const c of probes) {
    const r = q.map((x, j) => x - coarse[c][j]);
    const table = books.map((book, p) => book.map((w) => sqDist(r.slice(p * sub, (p + 1) * sub), w)));
    for (const i of lists[c]) hits.push([pysum(books.map((_, p) => table[p][code[i][p]])), i]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { found: hits.slice(0, k).map(([, i]) => i), scanned: hits.length };
}
let IVF = null;
function ivfData() {
  if (IVF) return IVF;
  const base = makePoints(5, 2000, 8), tests = makePoints(6, 20, 8), index = buildIndex(base);
  const truth = tests.map((q) => { const d = base.map((v) => sqDist(q, v)); return [...d.keys()].reduce((b, i) => (d[i] < d[b] ? i : b), 0); });
  const full = tests.map((q) => search(index, q, 10, 16).found);
  const rows = [];
  for (let nprobe = 1; nprobe <= 16; nprobe++) {
    const found = tests.map((q) => search(index, q, 10, nprobe));
    const nn = found.filter((f, i) => f.found.includes(truth[i])).length / tests.length;
    const iso = pysum(found.map((f, i) => f.found.filter((x) => full[i].includes(x)).length)) / (10 * tests.length);
    rows.push({ nprobe, scanned: pysum(found.map((f) => f.scanned)) / tests.length, iso, nn });
  }
  IVF = { rows };
  return IVF;
}

function demoIvf(el) {
  el.innerHTML = `<div class="controls"><label>lists probed <input class="np" type="range" min="1" max="16" value="2"><b class="mono vn"></b></label></div>
    <div class="svgbox iv-chart"></div>
    <div class="legend"><span><i style="background:var(--teal)"></i>iso-recall</span><span><i style="background:var(--amber)"></i>nearest-neighbor recall@10</span><span><i style="background:var(--line)"></i>codes scanned (of 2,000)</span></div>
    <div class="stats"></div>`;
  const draw = () => {
    const { rows } = ivfData(), np = +el.querySelector(".np").value, row = rows[np - 1], W = 560, H = 150, bw = (W - 20) / 16;
    el.querySelector(".vn").textContent = `${np} of 16`;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Recall and work against lists probed">`;
    rows.forEach((r, i) => {
      const x = 10 + i * bw, h = H - 30;
      svg += `<rect x="${x + 2}" y="${10 + h * (1 - r.scanned / 2000)}" width="${bw - 4}" height="${h * (r.scanned / 2000)}" fill="var(--line)" ${r.nprobe === np ? 'stroke="var(--ink-2)"' : ""}/>
        <circle cx="${x + bw / 2}" cy="${10 + h * (1 - r.iso)}" r="3.5" fill="var(--teal)"/>
        <circle cx="${x + bw / 2}" cy="${10 + h * (1 - r.nn)}" r="2.5" fill="var(--amber)"/>
        <text x="${x + bw / 2}" y="${H - 6}" font-size="10" text-anchor="middle" fill="${r.nprobe === np ? "var(--ink)" : "var(--stone)"}">${r.nprobe}</text>`;
    });
    el.querySelector(".iv-chart").innerHTML = svg + "</svg>";
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>codes scanned</small><b>${fmt(row.scanned, 1)}</b></div>
      <div class="stat ${row.iso >= 0.99 ? "good" : "bad"}"><small>iso-recall</small><b>${fmt(row.iso, 2)}</b></div>
      <div class="stat"><small>nn-recall@10</small><b>${fmt(row.nn, 2)}</b></div>`;
  };
  el.querySelector(".np").oninput = draw;
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
  attn: (el) => demoAttn(el),
  attnAuto: (el) => demoAttn(el, { auto: true }),
  route: (el) => demoRoute(el),
  serve: (el) => demoServe(el),
  serveMini: (el) => demoServe(el, { mini: true }),
  knn: (el) => demoKnn(el),
  dbscan: (el) => demoDbscan(el),
  dbscanMini: (el) => demoDbscan(el, { mini: true }),
  ivf: (el) => demoIvf(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
