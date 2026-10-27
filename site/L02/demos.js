// L02 demos. The JS models repeat the Python programs in frontiercs2/notes/L02-hpc.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

// Park-Miller generator, exact in JavaScript (products stay below 2^53).
class Rng {
  constructor(seed) { this.state = seed; }
  next() { this.state = (this.state * 48271) % 2147483647; return this.state; }
  below(k) { return this.next() % k; }
  uniform() { return this.next() / 2147483647; }
}
const COLORS = ["var(--teal)", "var(--amber)", "var(--green)", "var(--fn)"];

// ---------- RegionsSort ----------

const RS_N = 40, RS_K = 4, RS_B = 4, RS_SIZE = RS_N / RS_K;
const digit = (key) => key >> 6;

function rsSetup() {
  const rng = new Rng(2019);
  const A = Array.from({ length: RS_N }, () => rng.below(256));
  for (let lo = 0; lo < RS_N; lo += RS_SIZE) {
    const block = A.slice(lo, lo + RS_SIZE).sort((x, y) => digit(x) - digit(y)); // stable, like sorted()
    A.splice(lo, RS_SIZE, ...block);
  }
  const counts = Array.from({ length: RS_B }, (_, d) => A.filter((x) => digit(x) === d).length);
  const starts = counts.map((_, d) => counts.slice(0, d).reduce((a, b) => a + b, 0));
  const country = [];
  counts.forEach((c, d) => { for (let i = 0; i < c; i++) country.push(d); });
  return { A, counts, starts, country };
}

function regionsGraph(A, country) {
  const graph = new Map(); // "i,j" -> [[start, amount], ...]
  let start = 0;
  for (let p = 1; p <= RS_N; p++) {
    const same = p < RS_N && p % RS_SIZE && country[p] === country[start];
    if (!same || digit(A[p]) !== digit(A[start])) {
      const i = country[start], j = digit(A[start]);
      if (i !== j) {
        const k = `${i},${j}`;
        if (!graph.has(k)) graph.set(k, []);
        graph.get(k).push([start, p - start]);
      }
      start = p;
    }
  }
  return graph;
}

const sortedEdges = (graph) => [...graph.keys()].map((k) => k.split(",").map(Number))
  .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

function planBucket(graph, b) {
  const incoming = [], outgoing = [];
  for (const [i, j] of sortedEdges(graph)) {
    for (const r of graph.get(`${i},${j}`)) {
      if (j === b) incoming.push([i, r]);
      if (i === b) outgoing.push([j, r]);
    }
  }
  const swaps = [];
  for (const [x, src] of incoming) {
    while (src[1]) {
      const live = outgoing.filter((o) => o[1][1]);
      const [y, dst] = live.find((o) => o[0] === x) || live[0]; // prefer a 2-cycle
      const amount = Math.min(src[1], dst[1]);
      swaps.push([src[0], dst[0], amount, x, y]);
      if (x !== y) {
        const k = `${x},${y}`;
        if (!graph.has(k)) graph.set(k, []);
        graph.get(k).push([src[0], amount]);
      }
      src[0] += amount; src[1] -= amount; dst[0] += amount; dst[1] -= amount;
    }
  }
  for (const k of [...graph.keys()]) if (k.split(",").map(Number).includes(b)) graph.delete(k);
  return swaps;
}

// The whole plan, as in the notes: one round of swaps per bucket.
function rsPlan() {
  const { A, starts, counts, country } = rsSetup();
  const before = A.slice();
  const graph = regionsGraph(A, country);
  const edges = sortedEdges(graph).map(([i, j]) => [i, j, graph.get(`${i},${j}`).map((r) => r.slice())]);
  const misplaced = [...graph.values()].flat().reduce((s, r) => s + r[1], 0);
  const rounds = [];
  for (let b = 0; b < RS_B; b++) {
    const swaps = planBucket(graph, b);
    for (const [p, q, w] of swaps) {
      const a = A.slice(p, p + w), c = A.slice(q, q + w);
      A.splice(p, w, ...c); A.splice(q, w, ...a);
    }
    rounds.push(swaps);
  }
  const done = A.every((x, i) => digit(x) === country[i]);
  return { before, after: A, starts, counts, country, edges, misplaced, rounds, done };
}

function demoRegions(el, { auto = false } = {}) {
  const plan = rsPlan();
  const steps = plan.rounds.flatMap((swaps, b) => swaps.map((s) => ({ b, s })));
  let A, k;
  el.innerHTML = `<div class="rs-wrap"><div class="rs-row rs-country"></div><div class="rs-row rs-arr"></div><div class="rs-row rs-block"></div></div>
    <div class="stats"></div>
    ${auto ? "" : `<div class="controls"><button class="cbtn on step">Next swap</button><button class="cbtn round">Finish bucket</button><button class="cbtn reset">Reset</button><span class="spacer"></span><span class="counter"></span></div>`}
    <div class="msg"></div>`;
  const msg = el.querySelector(".msg");
  const reset = () => { A = plan.before.slice(); k = 0; msg.textContent = ""; msg.className = "msg"; draw(); };
  const apply = () => {
    const [p, q, w, x, y] = steps[k].s;
    const a = A.slice(p, p + w), c = A.slice(q, q + w);
    A.splice(p, w, ...c); A.splice(q, w, ...a);
    msg.className = "msg";
    msg.textContent = `Bucket ${steps[k].b}: swap ${w} key${w > 1 ? "s" : ""} at ${p} with ${w} at ${q}. ` +
      (x === y ? "A 2-cycle: both sides land home." : `Bucket ${y}'s keys move to country ${x}: a new edge ${x} → ${y}.`);
    k++;
    if (k === steps.length) {
      msg.className = "msg good";
      msg.textContent = `${steps.length} swaps in ${plan.rounds.filter((r) => r.length).length} rounds: every key is in its country. Bucket 3 needed none.`;
    }
  };
  const draw = (hl = null) => {
    el.querySelector(".rs-country").innerHTML = plan.counts.map((c, d) =>
      `<span style="flex:${c}; border-color:${COLORS[d]}; color:${COLORS[d]}">country ${d}</span>`).join("");
    el.querySelector(".rs-arr").innerHTML = A.map((x, i) => {
      const home = digit(x) === plan.country[i];
      const on = hl && ((i >= hl[0] && i < hl[0] + hl[2]) || (i >= hl[1] && i < hl[1] + hl[2]));
      return `<span class="rs-key${home ? "" : " away"}${on ? " hl" : ""}" style="background:${COLORS[digit(x)]}" title="position ${i}, key ${x}">${digit(x)}</span>`;
    }).join("");
    el.querySelector(".rs-block").innerHTML = [0, 1, 2, 3].map((b) => `<span>block ${b}</span>`).join("");
    const left = A.filter((x, i) => digit(x) !== plan.country[i]).length;
    el.querySelector(".stats").innerHTML = `
      <div class="stat ${left ? "bad" : "good"}"><small>misplaced keys</small><b>${left} / ${plan.misplaced}</b></div>
      <div class="stat"><small>swaps done</small><b>${k} / ${steps.length}</b></div>
      <div class="stat"><small>next bucket</small><b>${k < steps.length ? steps[k].b : "—"}</b></div>`;
    const counter = el.querySelector(".counter");
    if (counter) counter.textContent = k < steps.length ? `next: (${steps[k].s.slice(0, 3).join(", ")})` : "done";
  };
  if (auto) {
    reset();
    setInterval(() => {
      if (k === steps.length) { reset(); return; }
      const s = steps[k].s; apply(); draw(s);
    }, 1500);
    return;
  }
  el.querySelector(".step").onclick = () => { if (k < steps.length) { const s = steps[k].s; apply(); draw(s); } };
  el.querySelector(".round").onclick = () => {
    if (k >= steps.length) return;
    const b = steps[k].b;
    while (k < steps.length && steps[k].b === b) apply();
    draw();
  };
  el.querySelector(".reset").onclick = reset;
  reset();
}

// ---------- Parallel DBSCAN ----------

const DB_MIN_PTS = 4;
function gauss(rng) { const u1 = rng.uniform(), u2 = rng.uniform(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }
const DB_POINTS = (() => {
  const rng = new Rng(2020), centers = [[2.0, 2.0], [5.5, 2.5], [3.5, 5.5]], pts = [];
  for (let k = 0; k < 66; k++) {
    const [cx, cy] = centers[k % 3];
    const x = cx + 0.45 * gauss(rng); const y = cy + 0.45 * gauss(rng);
    pts.push([x, y]);
  }
  for (let k = 0; k < 14; k++) { const x = 8 * rng.uniform(); const y = 8 * rng.uniform(); pts.push([x, y]); }
  return pts;
})();

function dbscan(eps) {
  const pts = DB_POINTS, n = pts.length;
  let tests = 0;
  const close = (p, q) => { tests++; return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 <= eps * eps; };
  // the oracle
  const core = pts.map((p) => pts.filter((q) => close(p, q)).length >= DB_MIN_PTS);
  const coreTests = tests;
  const truth = Array(n).fill(-1);
  for (let s = 0; s < n; s++) {
    if (core[s] && truth[s] < 0) {
      truth[s] = s; const stack = [s];
      while (stack.length) {
        const p = stack.pop();
        for (let q = 0; q < n; q++) if (core[q] && truth[q] < 0 && close(pts[p], pts[q])) { truth[q] = s; stack.push(q); }
      }
    }
  }
  const oracleLink = tests - coreTests;
  // the grid
  const side = eps / Math.sqrt(2), cells = new Map();
  pts.forEach(([x, y], i) => {
    const key = `${Math.floor(x / side)},${Math.floor(y / side)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  });
  const reach = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
    if (side * side * (Math.max(Math.abs(dx) - 1, 0) ** 2 + Math.max(Math.abs(dy) - 1, 0) ** 2) <= eps * eps) reach.push([dx, dy]);
  }
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];
  const coreCells = [...cells.keys()].map((k) => k.split(",").map(Number))
    .filter((c) => cells.get(`${c[0]},${c[1]}`).some((i) => core[i])).sort(cmp);
  const parent = new Map(coreCells.map((c) => [`${c[0]},${c[1]}`, `${c[0]},${c[1]}`]));
  const find = (c) => { while (parent.get(c) !== c) { parent.set(c, parent.get(parent.get(c))); c = parent.get(c); } return c; };
  tests = 0;
  for (const a of coreCells) {
    const ka = `${a[0]},${a[1]}`;
    for (const [dx, dy] of reach) {
      const b = [a[0] + dx, a[1] + dy], kb = `${b[0]},${b[1]}`;
      if (cmp(b, a) <= 0 || !parent.has(kb) || find(ka) === find(kb)) continue;
      const hit = cells.get(ka).some((i) => core[i] && cells.get(kb).some((j) => core[j] && close(pts[i], pts[j])));
      if (hit) parent.set(find(ka), find(kb));
    }
  }
  const roots = coreCells.map((c) => `${c[0]},${c[1]}`);
  const label = Array(n).fill(-1);
  for (const kc of roots) for (const i of cells.get(kc)) if (core[i]) label[i] = roots.indexOf(find(kc));
  let same = true;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (core[i] && core[j] && (label[i] === label[j]) !== (truth[i] === truth[j])) same = false;
  }
  const clusters = new Set(truth.filter((t) => t >= 0)).size;
  const border = pts.map((p, i) => !core[i] && pts.some((q, j) => core[j] && (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 <= eps * eps));
  return { core, truth, label, border, clusters, coreTests, oracleLink, cells: cells.size, coreCells: coreCells.length, gridLink: tests, same, side, coreCellKeys: roots };
}

function demoDBSCAN(el) {
  el.innerHTML = `<div class="controls"><label>ε <input class="eps" type="range" min="4" max="12" value="6"><b class="mono veps"></b></label>
    <label><input type="checkbox" class="showgrid" checked> grid</label></div>
    <div class="svgbox db-plot"></div><div class="stats"></div>
    <p class="hint">Filled dots are core points, colored by cluster; rings are border points; grey dots are noise. Shaded cells hold core points.</p>`;
  const draw = () => {
    const eps = +el.querySelector(".eps").value / 10;
    el.querySelector(".veps").textContent = eps.toFixed(1);
    const r = dbscan(eps), W = 320, S = W / 8;
    const order = [...new Set(r.truth.filter((t) => t >= 0))];
    let svg = `<svg viewBox="0 0 ${W} ${W}" role="img" aria-label="DBSCAN points on a grid">`;
    if (el.querySelector(".showgrid").checked) {
      for (const kc of r.coreCellKeys) {
        const [cx, cy] = kc.split(",").map(Number);
        svg += `<rect x="${cx * r.side * S}" y="${W - (cy + 1) * r.side * S}" width="${r.side * S}" height="${r.side * S}" fill="var(--teal-soft)"/>`;
      }
      for (let g = 0; g * r.side <= 8; g++) {
        const t = g * r.side * S;
        svg += `<line x1="${t}" y1="0" x2="${t}" y2="${W}" stroke="var(--line)" stroke-width="0.5"/><line x1="0" y1="${W - t}" x2="${W}" y2="${W - t}" stroke="var(--line)" stroke-width="0.5"/>`;
      }
    }
    DB_POINTS.forEach(([x, y], i) => {
      const cx = x * S, cy = W - y * S;
      if (r.core[i]) svg += `<circle cx="${cx}" cy="${cy}" r="3.6" fill="${COLORS[order.indexOf(r.truth[i]) % 4]}"/>`;
      else if (r.border[i]) svg += `<circle cx="${cx}" cy="${cy}" r="3.2" fill="none" stroke="var(--ink-2, var(--ink))" stroke-width="1.2"/>`;
      else svg += `<circle cx="${cx}" cy="${cy}" r="2.6" fill="var(--stone)" opacity="0.6"/>`;
    });
    el.querySelector(".db-plot").innerHTML = svg + "</svg>";
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>core · clusters</small><b>${r.core.filter(Boolean).length} · ${r.clusters}</b></div>
      <div class="stat"><small>tests to link, all pairs</small><b>${r.oracleLink}</b></div>
      <div class="stat good"><small>tests to link, grid</small><b>${r.gridLink}</b></div>
      <div class="stat ${r.same ? "good" : "bad"}"><small>same clusters</small><b>${r.same ? "yes" : "no"}</b></div>`;
  };
  el.querySelectorAll("input").forEach((i) => { i.oninput = draw; });
  draw();
}

// ---------- Hygra ----------

const HY_EDGES = [[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 2, 3], [3, 4], [4, 5, 6], [5, 6], [6, 7]];
const HY_NV = 9;

// Peeling with buckets; records every round for the demo.
function peel(edges, nv) {
  const incident = Array.from({ length: nv }, () => []);
  edges.forEach((members, e) => members.forEach((v) => incident[v].push(e)));
  const degree = incident.map((es) => es.length);
  let buckets = new Map();
  const add = (d, v) => { if (!buckets.has(d)) buckets.set(d, new Set()); buckets.get(d).add(v); };
  for (let v = 0; v < nv; v++) add(degree[v], v);
  const dead = Array(edges.length).fill(false), removed = Array(nv).fill(false);
  let k = 0, decrements = 0;
  const rounds = [], log = [];
  while (buckets.size) {
    const lowest = Math.min(...buckets.keys());
    k = Math.max(k, lowest);
    const frontier = [...buckets.get(lowest)];
    buckets.delete(lowest);
    rounds.push(frontier.length);
    for (const v of frontier) { removed[v] = true; degree[v] = k; }
    const killed = [];
    for (const v of frontier) {
      for (const e of incident[v]) {
        if (dead[e]) continue;
        dead[e] = true; killed.push(e);
        for (const u of edges[e]) {
          if (removed[u]) continue;
          const old = Math.max(degree[u], k);
          degree[u] -= 1; decrements++;
          const nw = Math.max(degree[u], k);
          if (nw !== old) { buckets.get(old).delete(u); add(nw, u); }
        }
      }
    }
    log.push({ k, frontier: frontier.sort((a, b) => a - b), killed, degree: degree.slice(), removed: removed.slice() });
    buckets = new Map([...buckets].filter(([, vs]) => vs.size));
  }
  return { core: degree, rounds, decrements, log };
}

function hyBig() {
  const rng = new Rng(2020), nv = 2000, big = [];
  for (let e = 0; e < 6000; e++) {
    const members = new Set(), m = 2 + rng.below(4);
    for (let t = 0; t < m; t++) members.add(rng.below(nv));
    big.push([...members]);
  }
  const { core, rounds, decrements } = peel(big, nv);
  let left = nv, scans = 0;
  for (const size of rounds) { scans += left; left -= size; }
  return { maxCore: Math.max(...core), rounds: rounds.length, buckets: nv + decrements, rescans: scans + decrements };
}

function demoPeel(el) {
  const run = peel(HY_EDGES, HY_NV);
  const deg0 = Array.from({ length: HY_NV }, (_, v) => HY_EDGES.filter((e) => e.includes(v)).length);
  let step = 0;
  el.innerHTML = `<div class="hy-wrap"><table class="hy"></table></div><div class="stats"></div>
    <div class="controls"><button class="cbtn on next">Next round</button><button class="cbtn reset">Reset</button><span class="spacer"></span><span class="counter"></span></div>
    <div class="msg"></div><p class="hint big"></p>`;
  const big = hyBig();
  el.querySelector(".hint.big").textContent = `On the 2,000-vertex random hypergraph of the notes: ${big.rounds} rounds, max core ${big.maxCore}; the buckets visit ${big.buckets.toLocaleString("en-US")} vertices, rescanning would visit ${big.rescans.toLocaleString("en-US")}.`;
  const draw = () => {
    const st = step ? run.log[step - 1] : null;
    const deadSet = new Set(run.log.slice(0, step).flatMap((r) => r.killed));
    const degree = st ? st.degree : deg0, removed = st ? st.removed : Array(HY_NV).fill(false);
    const fresh = new Set(st ? st.frontier : []);
    let h = `<tr><th></th>${Array.from({ length: HY_NV }, (_, v) => `<th class="${fresh.has(v) ? "now" : ""}">${v}</th>`).join("")}</tr>`;
    HY_EDGES.forEach((e, i) => {
      h += `<tr class="${deadSet.has(i) ? "dead" : ""}"><th>{${e.join(",")}}</th>${Array.from({ length: HY_NV }, (_, v) =>
        `<td class="${e.includes(v) ? "in" : ""}${removed[v] ? " gone" : ""}"></td>`).join("")}</tr>`;
    });
    h += `<tr class="deg"><th>${step ? "degree / core" : "degree"}</th>${degree.map((d, v) => `<td class="${removed[v] ? "core" : ""}">${d}</td>`).join("")}</tr>`;
    el.querySelector(".hy").innerHTML = h;
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>level k</small><b>${st ? st.k : "—"}</b></div>
      <div class="stat"><small>round</small><b>${step} / ${run.log.length}</b></div>
      <div class="stat"><small>vertices left</small><b>${removed.filter((x) => !x).length}</b></div>`;
    const msg = el.querySelector(".msg");
    if (!st) { msg.className = "msg"; msg.textContent = "Each column is a vertex, each row a hyperedge. Press Next round to peel."; return; }
    msg.className = step === run.log.length ? "msg good" : "msg";
    msg.textContent = `Level ${st.k}: ${st.frontier.length > 1 ? "vertices" : "vertex"} ${st.frontier.join(", ")} leave${st.frontier.length > 1 ? "" : "s"} with core number ${st.k}` +
      (st.killed.length ? `; hyperedge${st.killed.length > 1 ? "s" : ""} ${st.killed.map((i) => `{${HY_EDGES[i].join(",")}}`).join(" ")} die${st.killed.length > 1 ? "" : "s"}.` : ".") +
      (step === run.log.length ? ` Core numbers: [${run.core.join(", ")}].` : "");
  };
  el.querySelector(".next").onclick = () => { if (step < run.log.length) { step++; draw(); } };
  el.querySelector(".reset").onclick = () => { step = 0; draw(); };
  draw();
}

// ---------- ParButterfly ----------

const BL = 40, BR = 40, BM = 320;
function bisectRight(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (x < a[m]) hi = m; else lo = m + 1; } return lo; }

function bipartite(seed, skewed) {
  const rng = new Rng(seed), adj = Array.from({ length: BL + BR }, () => new Set());
  const cum = []; let total = 0;
  for (let r = 0; r < BL; r++) { total += Math.floor(1000 / (r + 1) ** 2) + 5; cum.push(total); }
  const leftEdges = () => adj.slice(0, BL).reduce((s, n) => s + n.size, 0);
  while (leftEdges() < BM) {
    let u, v;
    if (skewed) { u = bisectRight(cum, rng.below(total)); v = BL + bisectRight(cum, rng.below(total)); }
    else {
      u = 0; for (let x = 1; x < BL; x++) if (adj[x].size < adj[u].size) u = x;
      v = BL + rng.below(BR);
    }
    adj[u].add(v); adj[v].add(u);
  }
  return adj;
}

function bruteForce(adj) {
  let n = 0;
  for (let a = 0; a < BL; a++) for (let b = a + 1; b < BL; b++) {
    for (let c = BL; c < BL + BR; c++) {
      if (!adj[a].has(c) || !adj[b].has(c)) continue;
      for (let d = c + 1; d < BL + BR; d++) if (adj[a].has(d) && adj[b].has(d)) n++;
    }
  }
  return n;
}

function countButterflies(adj, rank) {
  let butterflies = 0, wedges = 0;
  for (let x = 0; x < adj.length; x++) {
    const shared = new Map();
    for (const y of adj[x]) {
      if (rank[y] <= rank[x]) continue;
      for (const z of adj[y]) if (rank[z] > rank[x]) { shared.set(z, (shared.get(z) || 0) + 1); wedges++; }
    }
    for (const c of shared.values()) butterflies += (c * (c - 1)) / 2;
  }
  return [butterflies, wedges];
}

function bfOrders(adj) {
  const ids = adj.map((_, v) => v);
  const byDeg = ids.slice().sort((a, b) => adj[b].size - adj[a].size); // stable, like sorted()
  const degRank = Array(adj.length); byDeg.forEach((v, i) => { degRank[v] = i; });
  return {
    "centers right": ids.slice(),
    "centers left": ids.map((v) => (v + BL) % (BL + BR)),
    "degree order": degRank,
  };
}

function bfAll(skewed) {
  const adj = bipartite(2020, skewed), orders = bfOrders(adj), results = {};
  for (const [name, rank] of Object.entries(orders)) results[name] = countButterflies(adj, rank);
  const ws = Math.min(results["centers right"][1], results["centers left"][1]), wr = results["degree order"][1];
  return { adj, orders, results, brute: bruteForce(adj), ratio: (ws - wr) / ws };
}

function demoButterfly(el) {
  const cache = {};
  el.innerHTML = `<div class="controls"><span class="seg graph"><button class="cbtn on" data-g="0">uniform</button><button class="cbtn" data-g="1">skewed</button></span>
    <span class="seg order"><button class="cbtn on" data-o="centers right">centers right</button><button class="cbtn" data-o="centers left">centers left</button><button class="cbtn" data-o="degree order">degree order</button></span></div>
    <div class="bf"><div class="svgbox bf-mat"></div><div class="bf-side"><div class="stats"></div><div class="msg"></div></div></div>
    <p class="hint">Rows are the 40 left vertices, columns the 40 right ones, each sorted by degree; a dot is an edge. Bars show each vertex's degree. A vertex of degree d is the center of d(d − 1)/2 wedges when it is a center.</p>`;
  let g = 0, o = "centers right";
  const draw = () => {
    const r = cache[g] || (cache[g] = bfAll(g === 1));
    const { adj } = r, W = 300, P = 30, cell = (W - P) / 40;
    const rows = [...Array(BL).keys()].sort((a, b) => adj[b].size - adj[a].size);
    const cols = [...Array(BR).keys()].map((c) => c + BL).sort((a, b) => adj[b].size - adj[a].size);
    const maxDeg = Math.max(...adj.map((s) => s.size));
    let svg = `<svg viewBox="0 0 ${W} ${W}" role="img" aria-label="Adjacency matrix of the bipartite graph">`;
    rows.forEach((u, i) => {
      svg += `<rect x="0" y="${P + i * cell}" width="${(adj[u].size / maxDeg) * (P - 4)}" height="${cell - 1}" fill="${o === "centers left" ? "var(--amber)" : "var(--stone)"}" opacity="0.7"/>`;
      cols.forEach((v, j) => { if (adj[u].has(v)) svg += `<rect x="${P + j * cell}" y="${P + i * cell}" width="${cell - 1}" height="${cell - 1}" fill="var(--teal)"/>`; });
    });
    cols.forEach((v, j) => {
      svg += `<rect x="${P + j * cell}" y="${P - 4 - (adj[v].size / maxDeg) * (P - 4)}" width="${cell - 1}" height="${(adj[v].size / maxDeg) * (P - 4)}" fill="${o === "centers right" ? "var(--amber)" : "var(--stone)"}" opacity="0.7"/>`;
    });
    el.querySelector(".bf-mat").innerHTML = svg + "</svg>";
    const [bf, wd] = r.results[o];
    const best = Math.min(...Object.values(r.results).map((x) => x[1]));
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>brute force</small><b>${r.brute}</b></div>
      <div class="stat ${bf === r.brute ? "good" : "bad"}"><small>butterflies</small><b>${bf}</b></div>
      <div class="stat ${wd === best ? "good" : ""}"><small>wedges</small><b>${wd}</b></div>`;
    const msg = el.querySelector(".msg");
    msg.className = "msg";
    msg.textContent = `Wedges: centers right ${r.results["centers right"][1]}, centers left ${r.results["centers left"][1]}, degree order ${r.results["degree order"][1]}. ` +
      `(w_s − w_r) / w_s = ${r.ratio.toFixed(2)}, so the rule picks ${r.ratio < 0.1 ? "side order" : "degree order"}.`;
  };
  el.querySelectorAll(".graph .cbtn").forEach((b) => { b.onclick = () => { g = +b.dataset.g; el.querySelectorAll(".graph .cbtn").forEach((x) => x.classList.toggle("on", x === b)); draw(); }; });
  el.querySelectorAll(".order .cbtn").forEach((b) => { b.onclick = () => { o = b.dataset.o; el.querySelectorAll(".order .cbtn").forEach((x) => x.classList.toggle("on", x === b)); draw(); }; });
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
  regions: (el) => demoRegions(el),
  regionsAuto: (el) => demoRegions(el, { auto: true }),
  dbscan: (el) => demoDBSCAN(el),
  peel: (el) => demoPeel(el),
  butterfly: (el) => demoButterfly(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
