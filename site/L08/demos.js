// L08 demos. The JS models repeat the Python programs in frontiercs2/notes/L08-database.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

// Park-Miller generator, exact in JavaScript (products stay below 2^53).
class Rng {
  constructor(seed) { this.state = seed; }
  next() { this.state = (this.state * 48271) % 2147483647; return this.state; }
  below(k) { return this.next() % k; }
  uniform() { return this.next() / 2147483647; }
}
const fmt = (x, d) => x.toFixed(d);
const padL = (s, w) => String(s).padStart(w);
const padR = (s, w) => String(s).padEnd(w);
const comma = (x) => x.toLocaleString("en-US");
const range = (n) => Array.from({ length: n }, (_, i) => i);

// ---------- Yannakakis: semijoins and join trees ----------

function yannData() {
  const rng = new Rng(7);
  const USERS = range(4).map((u) => ({ 1: u }));
  const POSTS = range(120).map((p) => ({ 0: p, 1: rng.below(40) }));
  const COMMENTS = range(600).map(() => ({ 0: rng.below(120) }));
  const VOTES = range(300).map(() => ({ 0: rng.below(120) }));
  return { USERS, POSTS, COMMENTS, VOTES };
}
const keyOf = (row, keys) => keys.map((a) => row[a]).join(",");
function hashJoin(left, right, keys) {
  const index = new Map();
  for (const row of right) {
    const k = keyOf(row, keys);
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(row);
  }
  const out = [];
  for (const a of left) for (const b of index.get(keyOf(a, keys)) || []) out.push({ ...a, ...b });
  return out;
}
function semijoin(left, right, keys) {
  const present = new Set(right.map((r) => keyOf(r, keys)));
  return left.filter((r) => present.has(keyOf(r, keys)));
}
const leaf = (name, attrs, rows) => ({ leaf: true, name, attrs: new Set(attrs), rows });
const joinNode = (left, right, keys) => ({ leaf: false, left, right, keys: new Set(keys) });
const tablesOf = (n) => (n.leaf ? [n] : [...tablesOf(n.left), ...tablesOf(n.right)]);
const subset = (a, b) => [...a].every((x) => b.has(x));
const showPlan = (n) => (n.leaf ? n.name : `(${showPlan(n.left)} ⋈[${[...n.keys].sort().join(", ")}] ${showPlan(n.right)})`);
function lowerable(n) {
  if (n.leaf) return true;
  return subset(n.keys, tablesOf(n.left)[0].attrs) && subset(n.keys, tablesOf(n.right)[0].attrs) && lowerable(n.left) && lowerable(n.right);
}
function treeEdges(n, edges) {
  if (!n.leaf) {
    const a = tablesOf(n.left).find((t) => subset(n.keys, t.attrs));
    const b = tablesOf(n.right).find((t) => subset(n.keys, t.attrs));
    edges.push([a, b, n.keys]);
    treeEdges(n.left, edges);
    treeEdges(n.right, edges);
  }
  return edges;
}
function childrenOf(node, parent, edges) {
  const out = edges.filter(([a, b]) => a === node && b !== parent).map(([, b, k]) => [b, k]);
  return out.concat(edges.filter(([a, b]) => b === node && a !== parent).map(([a, , k]) => [a, k]));
}
function rebuild(node, edges, parent = null) {
  let plan = node;
  for (const [child, keys] of childrenOf(node, parent, edges)) plan = joinNode(plan, rebuild(child, edges, node), keys);
  return plan;
}
function phaseOne(node, edges, parent = null) {
  let rows = node.rows, hashed = 0, probed = 0;
  const reduced = childrenOf(node, parent, edges).map(([c, k]) => [phaseOne(c, edges, node), k]);
  reduced.sort((x, y) => x[0][0].length - y[0][0].length);
  for (const [[childRows, h, p], keys] of reduced) {
    hashed += h + childRows.length;
    probed += p + rows.length;
    rows = semijoin(rows, childRows, [...keys].sort());
  }
  return [rows, hashed, probed];
}
let YANN = null;
function yannModel() {
  if (YANN) return YANN;
  const d = yannData();
  const cp = hashJoin(d.COMMENTS, d.POSTS, [0]);
  const binary = hashJoin(cp, d.USERS, [1]);
  const p2 = semijoin(d.POSTS, d.USERS, [1]);
  const c2 = semijoin(d.COMMENTS, p2, [0]);
  const cp2 = hashJoin(c2, p2, [0]);
  const twoPhase = hashJoin(cp2, d.USERS, [1]);
  const U = leaf("u", [1], d.USERS), P = leaf("p", [0, 1], d.POSTS), C = leaf("c", [0], d.COMMENTS), V = leaf("v", [0], d.VOTES);
  const plan = joinNode(joinNode(joinNode(U, P, [1]), C, [0]), V, [0]);
  const edges = treeEdges(plan, []);
  const roots = [U, P, C, V].map((root) => {
    const plan2 = rebuild(root, edges);
    const [, hashed, probed] = phaseOne(root, edges);
    return { root, plan: plan2, ok: lowerable(plan2), hashed, probed, cost: 3 * hashed + probed };
  });
  const rowsKey = (r) => r.map((x) => `${x[0]},${x[1]}`).sort().join(";");
  YANN = { d, cp, binary, p2, c2, cp2, twoPhase, same: rowsKey(binary) === rowsKey(twoPhase), plan, edges, roots };
  return YANN;
}

function demoYann(el, { auto = false } = {}) {
  const m = yannModel();
  let pick = 2;
  el.innerHTML = `<div class="l8-flow"></div>
    <div class="controls l8-roots">${m.roots.map((r, i) => `<button class="cbtn" data-i="${i}" ${auto ? "disabled" : ""}>root ${r.root.name}</button>`).join("")}</div>
    <div class="l8-plan mono"></div><div class="l8-bars"></div><div class="stats"></div>
    ${auto ? "" : `<p class="hint">The original plan fails the leftmost-table rule. Pick a root of the join tree: every root gives a valid plan; the costs differ.</p>`}`;
  const flow = [["binary plan: c ⋈ p", m.cp.length], ["binary result", m.binary.length], ["semijoin: p kept", m.p2.length], ["semijoin: c kept", m.c2.length], ["two-phase result", m.twoPhase.length]];
  el.querySelector(".l8-flow").innerHTML = flow.map(([label, v]) => `<div class="l8-bar"><small>${label}</small><span style="width:${Math.max(1, (v / 600) * 100)}%"></span><b class="mono">${v}</b></div>`).join("");
  const top = Math.max(...m.roots.map((r) => r.cost));
  const draw = () => {
    const r = m.roots[pick];
    el.querySelectorAll(".l8-roots .cbtn").forEach((b) => b.classList.toggle("on", +b.dataset.i === pick));
    el.querySelector(".l8-plan").textContent = showPlan(r.plan);
    el.querySelector(".l8-bars").innerHTML = m.roots.map((x, i) => `<div class="l8-bar ${i === pick ? "sel" : ""}"><small>root ${x.root.name}</small><span class="c" style="width:${(x.cost / top) * 100}%"></span><b class="mono">${x.cost}</b></div>`).join("");
    el.querySelector(".stats").innerHTML = `
      <div class="stat good"><small>lowerable</small><b>${r.ok ? "yes" : "no"}</b></div>
      <div class="stat"><small>rows hashed</small><b>${r.hashed}</b></div>
      <div class="stat"><small>rows probed</small><b>${r.probed}</b></div>
      <div class="stat"><small>cost 3h + p</small><b>${r.cost}</b></div>`;
  };
  el.querySelectorAll(".l8-roots .cbtn").forEach((b) => { b.onclick = () => { pick = +b.dataset.i; draw(); }; });
  draw();
  if (auto) setInterval(() => { pick = (pick + 1) % 4; draw(); }, 2200);
}

// ---------- JoinBoost: residual updates ----------

function boostData() {
  const rng = new Rng(3);
  const ITEMS = {}, STORES = {}, SALES = [];
  for (let i = 0; i < 20; i++) ITEMS[i] = rng.below(100);
  for (let s = 0; s < 5; s++) STORES[s] = rng.below(10);
  for (let k = 0; k < 400; k++) {
    const item = rng.below(20), store = rng.below(5);
    const y = ITEMS[item] / 10 - 2 * STORES[store] + rng.uniform();
    SALES.push({ item, store, r: y });
  }
  return { ITEMS, STORES, SALES };
}
const BOOST = boostData();
const FEATURES = { f1: ["item", BOOST.ITEMS], f4: ["store", BOOST.STORES] };
const featureOf = (row, name) => { const [key, table] = FEATURES[name]; return table[row[key]]; };
function sumR(rows) { let s = 0; for (const r of rows) s += r.r; return s; }
function sse(rows) { let s = 0; for (const r of rows) s += r.r * r.r; return s; }
function bestSplit(rows) {
  const total = sumR(rows), n = rows.length;
  let best = null;
  for (const name of Object.keys(FEATURES)) {
    const cuts = [...new Set(rows.map((r) => featureOf(r, name)))].sort((a, b) => a - b).slice(1);
    for (const cut of cuts) {
      const left = rows.filter((r) => featureOf(r, name) < cut);
      const g = sumR(left);
      const gain = (g * g) / left.length + (total - g) ** 2 / (n - left.length) - (total * total) / n;
      if (best === null || gain > best[0] + 1e-12) best = [gain, name, cut];
    }
  }
  return best;
}
function grow(rows, depth, path = []) {
  const split = depth > 0 && rows.length > 1 ? bestSplit(rows) : null;
  if (split === null) return [[path, rows, sumR(rows) / rows.length]];
  const [, name, cut] = split;
  return grow(rows.filter((r) => featureOf(r, name) < cut), depth - 1, [...path, [name, "<", cut]])
    .concat(grow(rows.filter((r) => featureOf(r, name) >= cut), depth - 1, [...path, [name, ">=", cut]]));
}
// Train `trees` trees on a fresh copy; returns per-tree [leaves, before, after, predicted].
function boostRun(trees, lr, depth = 2) {
  const sales = BOOST.SALES.map((r) => ({ ...r }));
  const rows = [];
  for (let t = 0; t < trees; t++) {
    const leaves = grow(sales, depth);
    const before = sse(sales);
    let drop = 0;
    for (const [, rs] of leaves) drop += sumR(rs) ** 2 / rs.length;
    for (const [, rs, value] of leaves) for (const r of rs) r.r -= lr * value;
    rows.push([leaves.length, before, sse(sales), before - (2 * lr - lr * lr) * drop]);
  }
  return rows;
}
const matchesPath = (row, path) => path.every(([f, op, cut]) => (featureOf(row, f) < cut) === (op === "<"));
// The residuals after four trees at rate 0.5, as in the notes.
let AFTER4 = null;
function salesAfterFour() {
  if (AFTER4) return AFTER4;
  const sales = BOOST.SALES.map((r) => ({ ...r }));
  for (let t = 0; t < 4; t++) for (const [, rs, value] of grow(sales, 2)) for (const r of rs) r.r -= 0.5 * value;
  AFTER4 = sales;
  return sales;
}
function visitsCompare(depth) {
  const base = salesAfterFour();
  const leaves = grow(base.map((r) => ({ ...r })), depth).map(([p, , v]) => [p, v]);
  const a = base.map((r) => ({ ...r })), b = base.map((r) => ({ ...r }));
  let va = 0;
  for (const [path, value] of leaves) for (const r of a) { va++; if (matchesPath(r, path)) r.r -= 0.5 * value; }
  for (const r of b) r.r -= 0.5 * leaves.find(([path]) => matchesPath(r, path))[1];
  return { leaves: leaves.length, va, vb: b.length, same: a.every((x, i) => x.r === b[i].r) };
}

function demoBoost(el) {
  el.innerHTML = `<div class="controls"><label>learning rate <input class="lr" type="range" min="1" max="10" value="5"><b class="mono vl"></b></label>
      <label>tree depth <input class="dp" type="range" min="1" max="5" value="2"><b class="mono vd"></b></label></div>
    <div class="l8-bars"></div><div class="stats"></div>
    <p class="hint">Bars: the sum of squared residuals after each of six trees (outline: the drop the identity predicts). The tiles count the sales-row visits one update needs.</p>`;
  const draw = () => {
    const lr = +el.querySelector(".lr").value / 10, depth = +el.querySelector(".dp").value;
    el.querySelector(".vl").textContent = fmt(lr, 1);
    el.querySelector(".vd").textContent = depth;
    const rows = boostRun(6, lr, depth), top = rows[0][1];
    el.querySelector(".l8-bars").innerHTML = rows.map(([n, , after, pred], i) => `<div class="l8-bar"><small>after tree ${i + 1}</small><span class="c" style="width:${Math.max(0.5, (after / top) * 100)}%"></span><b class="mono">${fmt(after, 1)}</b></div>`).join("") +
      `<p class="meta">identity holds on every tree: ${rows.every(([, , a, p]) => Math.abs(a - p) < 1e-6 * Math.max(1, a)) ? "yes" : "no"}</p>`;
    const v = visitsCompare(depth);
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>leaves</small><b>${v.leaves}</b></div>
      <div class="stat bad"><small>visits, one UPDATE per leaf</small><b>${comma(v.va)}</b></div>
      <div class="stat good"><small>visits, one CASE update</small><b>${v.vb}</b></div>`;
  };
  el.querySelectorAll("input").forEach((i) => { i.oninput = draw; });
  draw();
}

// ---------- FARGO: global probing and the stop rule ----------

const FD = 12, FN = 800, FK = 6, FL = 4;
let FARGO = null;
function dotp(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function fargoModel() {
  if (FARGO) return FARGO;
  const rng = new Rng(11);
  const gauss = () => rng.uniform() + rng.uniform() + rng.uniform() - 1.5;
  const CENTERS = range(8).map(() => range(FD).map(() => gauss()));
  const DATA = [];
  for (let i = 0; i < FN; i++) {
    const center = CENTERS[rng.below(8)], scale = 0.3 + rng.uniform();
    DATA.push(center.map((x) => scale * (x + 0.35 * gauss())));
  }
  const PLANES = range(FL).map(() => range(FK).map(() => range(FD + 1).map(() => gauss())));
  const key = (v, t) => { let k = 0; for (const plane of PLANES[t]) k = 2 * k + (dotp(plane, v) > 0 ? 1 : 0); return k; };
  const byNorm = range(FN).sort((a, b) => dotp(DATA[b], DATA[b]) - dotp(DATA[a], DATA[a]) || a - b);
  const PARTS = [];
  for (let j = 0; j < 4; j++) {
    const members = byNorm.slice((j * FN) / 4, ((j + 1) * FN) / 4);
    const m = Math.sqrt(dotp(DATA[members[0]], DATA[members[0]]));
    const tables = range(FL).map(() => new Map());
    for (const i of members) {
      const lifted = [...DATA[i], Math.sqrt(Math.max(0, m * m - dotp(DATA[i], DATA[i])))];
      for (let t = 0; t < FL; t++) {
        const k = key(lifted, t);
        if (!tables[t].has(k)) tables[t].set(k, []);
        tables[t].get(k).push(i);
      }
    }
    PARTS.push([m, tables]);
  }
  FARGO = { DATA, PLANES, PARTS, key };
  return FARGO;
}
function flipCosts(q) {
  const { PLANES, key } = fargoModel();
  const qn = Math.sqrt(dotp(q, q)), lifted = [...q.map((x) => x / qn), 0];
  return range(FL).map((t) => {
    const proj = PLANES[t].map((plane) => dotp(plane, lifted)), norm = dotp(proj, proj);
    return [key(lifted, t), proj.map((x) => (x * x) / norm)];
  });
}
function probeOrder(q) {
  const order = [];
  flipCosts(q).forEach(([home, cost], t) => {
    for (let b = 0; b < 2 ** FK; b++) {
      let qd = 0;
      for (let i = 0; i < FK; i++) if (((b ^ home) >> (FK - 1 - i)) & 1) qd += cost[i];
      order.push([qd, t, b]);
    }
  });
  order.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  return order;
}
function phi(cost, d, p) {
  let total = 0;
  for (let flips = 0; flips < 2 ** FK; flips++) {
    let qd = 0, n = 0;
    for (let i = 0; i < FK; i++) if ((flips >> (FK - 1 - i)) & 1) { qd += cost[i]; n++; }
    if (qd <= d) {
      let w = 1;
      for (let i = 0; i < FK; i++) w *= i < n ? p : 1 - p;
      total += w;
    }
  }
  return total;
}
// Returns the top k, the vectors verified, and per partition the buckets probed.
function fargoSearch(q, k, c, budget = null, pTau = 0.1) {
  const { DATA, PARTS } = fargoModel();
  const order = probeOrder(q), costs = flipCosts(q).map(([, cost]) => cost);
  const qn = Math.sqrt(dotp(q, q));
  let top = [], verified = 0;
  const probes = [];
  for (const [m, tables] of PARTS) {
    const bound = m * qn, seen = new Set();
    let probed = 0, why = "all buckets";
    for (const [d, t, b] of order) {
      if (top.length >= k && top[k - 1] > 0) {
        const kth = top[k - 1];
        if (budget !== null) {
          if (seen.size >= budget) { why = "budget"; break; }
        } else if (kth >= c * bound) { why = "settled"; break; }
        else {
          const p = Math.acos(kth / (c * bound)) / Math.PI;
          let allSeen = 1;
          for (const cost of costs) allSeen *= phi(cost, d, p);
          if (1 - allSeen < pTau) { why = "α₂ < p_τ"; break; }
        }
      }
      probed++;
      for (const i of tables[t].get(b) || []) {
        if (!seen.has(i)) {
          seen.add(i);
          top.push(dotp(q, DATA[i]));
          top.sort((x, y) => y - x);
          top = top.slice(0, k);
        }
      }
    }
    verified += seen.size;
    probes.push({ probed, verified: seen.size, why });
  }
  return { top, verified, probes };
}
const FRULES = [["budget 20", 1.0, 20], ["budget 50", 1.0, 50], ["adaptive c=0.6", 0.6, null], ["adaptive c=0.8", 0.8, null], ["adaptive c=0.9", 0.9, null]];
let FTABLE = null;
function fargoTable() {
  if (FTABLE) return FTABLE;
  const { DATA } = fargoModel(), k = 10, queries = DATA.slice(0, 20);
  const exact = queries.map((q) => DATA.map((x) => dotp(q, x)).sort((a, b) => b - a).slice(0, k));
  FTABLE = FRULES.map(([label, c, budget]) => {
    let recall = 0, ratio = 0, work = 0;
    queries.forEach((q, j) => {
      const { top, verified } = fargoSearch(q, k, c, budget);
      const truth = exact[j];
      recall += top.filter((s) => s >= truth[k - 1]).length / k;
      ratio += top[k - 1] / truth[k - 1];
      work += verified;
    });
    return { label, recall: recall / 20, ratio: ratio / 20, work: work / 20 };
  });
  return FTABLE;
}

function demoFargo(el) {
  el.innerHTML = `<div class="controls"><label>query <input class="q" type="range" min="1" max="20" value="1"><b class="mono vq"></b></label>
      <span class="l8-seg">${FRULES.map(([label], i) => `<button class="cbtn" data-i="${i}">${label}</button>`).join("")}</span></div>
    <div class="l8-parts"></div><div class="stats"></div>
    <p class="hint">Each row is one length partition, longest first: buckets probed out of 256 and why it stopped. The tiles give the mean over all 20 queries for the chosen rule.</p>`;
  let rule = 3;
  const { DATA } = fargoModel();
  const draw = () => {
    const qi = +el.querySelector(".q").value - 1, [, c, budget] = FRULES[rule];
    el.querySelector(".vq").textContent = qi + 1;
    el.querySelectorAll(".l8-seg .cbtn").forEach((b) => b.classList.toggle("on", +b.dataset.i === rule));
    const r = fargoSearch(DATA[qi], 10, c, budget);
    el.querySelector(".l8-parts").innerHTML = r.probes.map((p, j) => `<div class="l8-bar"><small>partition ${j + 1}</small><span class="c" style="width:${Math.max(0.5, (p.probed / 256) * 100)}%"></span><b class="mono">${p.probed}</b><em>${p.why} · ${p.verified} verified</em></div>`).join("");
    const row = fargoTable()[rule];
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>this query: verified</small><b>${r.verified}</b></div>
      <div class="stat ${row.recall >= 0.95 ? "good" : "bad"}"><small>mean recall@10</small><b>${fmt(row.recall, 3)}</b></div>
      <div class="stat"><small>mean last-result ratio</small><b>${fmt(row.ratio, 3)}</b></div>
      <div class="stat"><small>mean verified</small><b>${fmt(row.work, 2)}</b></div>`;
  };
  el.querySelector(".q").oninput = draw;
  el.querySelectorAll(".l8-seg .cbtn").forEach((b) => { b.onclick = () => { rule = +b.dataset.i; draw(); }; });
  draw();
}

// ---------- Graph patterns: local counts ----------

function graphData() {
  const rng = new Rng(5), n = 40, adj = range(n).map(() => new Set());
  while (adj.reduce((s, a) => s + a.size, 0) < 240) {
    const a = rng.below(n), b = rng.below(n);
    if (a !== b) { adj[a].add(b); adj[b].add(a); }
  }
  return { n, adj };
}
const GRAPH = graphData();
const PATTERNS = { "wedge end": [3, [[0, 1], [1, 2]], 0], "wedge center": [3, [[0, 1], [1, 2]], 1], triangle: [3, [[0, 1], [1, 2], [0, 2]], 0], "4-cycle": [4, [[0, 1], [1, 2], [2, 3], [3, 0]], 0] };
function permutations(items, r) {
  const out = [];
  const rec = (prefix, rest) => {
    if (prefix.length === r) { out.push(prefix); return; }
    rest.forEach((x, i) => rec([...prefix, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], items);
  return out;
}
const comb2 = (x) => (x * (x - 1)) / 2;
function localCount([k, edges, o], v) {
  const { n, adj } = GRAPH;
  const es = new Set(edges.map(([a, b]) => [a, b].sort().join("-")));
  const auts = permutations(range(k), k).filter((p) => { const s = new Set(edges.map(([a, b]) => [p[a], p[b]].sort().join("-"))); return s.size === es.size && [...s].every((x) => es.has(x)); });
  const orbit = new Set(auts.map((p) => p[o]));
  let iso = 0;
  for (const rest of permutations(range(n).filter((u) => u !== v), k - 1)) {
    const m = [...rest.slice(0, o), v, ...rest.slice(o)];
    if (edges.every(([a, b]) => adj[m[a]].has(m[b]))) iso++;
  }
  return Math.floor((iso * orbit.size) / auts.length);
}
function graphFormulas() {
  const { n, adj } = GRAPH, deg = adj.map((a) => a.size);
  const common = range(n).map((v) => range(n).map((w) => [...adj[v]].filter((x) => adj[w].has(x)).length));
  return {
    deg, common,
    f: {
      "wedge end": range(n).map((v) => [...adj[v]].reduce((s, u) => s + deg[u], 0) - deg[v]),
      "wedge center": range(n).map((v) => comb2(deg[v])),
      triangle: range(n).map((v) => [...adj[v]].reduce((s, u) => s + common[v][u], 0) / 2),
      "4-cycle": range(n).map((v) => range(n).reduce((s, w) => s + (w !== v ? comb2(common[v][w]) : 0), 0)),
    },
  };
}

function demoPattern(el) {
  const { n, adj } = GRAPH, F = graphFormulas();
  const pos = range(n).map((i) => [150 + 120 * Math.cos((2 * Math.PI * i) / n), 140 + 120 * Math.sin((2 * Math.PI * i) / n)]);
  el.innerHTML = `<div class="l8-graph"><div class="svgbox"></div><div><div class="controls"><span class="l8-seg">${Object.keys(PATTERNS).map((p) => `<button class="cbtn" data-p="${p}">${p}</button>`).join("")}</span></div>
    <div class="stats"></div><p class="msg"></p></div></div>
    <p class="hint">Click a vertex. The formula uses only degrees and common-neighbor counts; the check counts every one-to-one map.</p>`;
  let v = 1, pat = "triangle";
  const draw = () => {
    let svg = `<svg viewBox="0 0 300 280" role="img" aria-label="The 40-vertex graph">`;
    const nb = adj[v];
    for (let a = 0; a < n; a++) for (const b of adj[a]) if (a < b) {
      const hot = a === v || b === v;
      svg += `<line x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}" stroke="${hot ? "var(--teal)" : "var(--line)"}" stroke-width="${hot ? 1.6 : 0.8}"/>`;
    }
    range(n).forEach((i) => { svg += `<circle data-v="${i}" cx="${pos[i][0]}" cy="${pos[i][1]}" r="${i === v ? 7 : 5}" fill="${i === v ? "var(--amber)" : nb.has(i) ? "var(--teal)" : "var(--card)"}" stroke="var(--ink-2)" stroke-width="0.8" style="cursor:pointer"/>`; });
    el.querySelector(".svgbox").innerHTML = svg + "</svg>";
    el.querySelectorAll("circle").forEach((c) => { c.onclick = () => { v = +c.dataset.v; draw(); }; });
    el.querySelectorAll(".l8-seg .cbtn").forEach((b) => b.classList.toggle("on", b.dataset.p === pat));
    const formula = F.f[pat][v], brute = localCount(PATTERNS[pat], v);
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>vertex</small><b>${v}</b></div>
      <div class="stat"><small>degree</small><b>${F.deg[v]}</b></div>
      <div class="stat"><small>formula</small><b>${formula}</b></div>
      <div class="stat ${formula === brute ? "good" : "bad"}"><small>brute force</small><b>${brute}</b></div>`;
    el.querySelector(".msg").textContent = { "wedge end": "Σ deg(u) over neighbors u, minus deg(v): the walks v–u–v are not one-to-one.", "wedge center": "deg(v) choose 2: any two neighbors.", triangle: "Half the sum of common neighbors over the neighbors of v.", "4-cycle": "Σ over w ≠ v of (common neighbors of v and w) choose 2." }[pat];
  };
  el.querySelectorAll(".l8-seg .cbtn").forEach((b) => { b.onclick = () => { pat = b.dataset.p; draw(); }; });
  draw();
}

// ---------- ScaleGPM: regret ----------

const CASES = [[10, 12], [8, 30], [15, 14], [20, 9], [6, 25], [12, 13], [30, 11], [9, 10], [7, 40], [14, 16], [25, 10], [11, 50]];
function regret(picks) {
  let total = 0;
  CASES.forEach(([gs, ns], i) => { total += Math.log((picks[i] === "GS" ? gs : ns) / Math.min(gs, ns)); });
  return Math.exp(total / CASES.length);
}
const BESTPICK = CASES.map(([gs, ns]) => (gs <= ns ? "GS" : "NS"));
const CONSTANT = Math.min(regret(CASES.map(() => "GS")), regret(CASES.map(() => "NS")));
const wrongOn = (set) => BESTPICK.map((b, i) => (set.has(i) ? (b === "GS" ? "NS" : "GS") : b));
const SELECTORS = { "always GS": CASES.map(() => "GS"), "always NS": CASES.map(() => "NS"), perfect: BESTPICK, "wrong on 2 close calls": wrongOn(new Set([0, 5])), "wrong on 2 wide gaps": wrongOn(new Set([1, 6])) };
const gpmScore = (r) => Math.max(0, (100 * (CONSTANT - r)) / (CONSTANT - 1));

function demoRegret(el) {
  let picks = [...SELECTORS["always GS"]];
  el.innerHTML = `<div class="controls"><span class="l8-seg">${Object.keys(SELECTORS).map((s) => `<button class="cbtn" data-s="${s}">${s}</button>`).join("")}</span></div>
    <div class="l8-cases"></div><div class="stats"></div>
    <p class="hint">Click a setting to switch its engine. Bars: our made-up times for GS (blue) and NS (amber); the chosen one is outlined.</p>`;
  const draw = () => {
    el.querySelector(".l8-cases").innerHTML = CASES.map(([gs, ns], i) => `<button class="l8-case ${picks[i] === BESTPICK[i] ? "right" : "wrong"}" data-i="${i}">
      <span class="g ${picks[i] === "GS" ? "on" : ""}" style="height:${gs * 1.6}px"></span><span class="n ${picks[i] === "NS" ? "on" : ""}" style="height:${ns * 1.6}px"></span><small>${picks[i]}</small></button>`).join("");
    el.querySelectorAll(".l8-case").forEach((b) => { b.onclick = () => { const i = +b.dataset.i; picks[i] = picks[i] === "GS" ? "NS" : "GS"; draw(); }; });
    const r = regret(picks), right = picks.filter((p, i) => p === BESTPICK[i]).length;
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>right picks</small><b>${right}/12</b></div>
      <div class="stat"><small>regret R</small><b>${fmt(r, 4)}</b></div>
      <div class="stat"><small>better constant B</small><b>${fmt(CONSTANT, 4)}</b></div>
      <div class="stat ${gpmScore(r) > 0 ? "good" : "bad"}"><small>score</small><b>${fmt(gpmScore(r), 1)}</b></div>`;
  };
  el.querySelectorAll(".l8-seg .cbtn").forEach((b) => { b.onclick = () => { picks = [...SELECTORS[b.dataset.s]]; draw(); }; });
  draw();
}

// ---------- Spectrum: checkpointed stacks ----------

class CopyStack {
  constructor() { this.items = []; this.copied = { save: 0, restore: 0, write: 0 }; }
  push(v) { this.items.push(v); }
  write(index, v) { this.items[this.items.length - 1 - index] = v; }
  save() { this.copied.save += this.items.length; return [...this.items]; }
  restore(s) { this.copied.restore += s.length; this.items = [...s]; }
  values() { return [...this.items]; }
  kept(saved) { return saved.reduce((s, x) => s + x.length, 0); }
}
class PagedStack {
  constructor(page = 4) { this.PAGE = page; this.pages = []; this.owned = new Set(); this.height = 0; this.copied = { save: 0, restore: 0, write: 0 }; }
  push(v) {
    if (this.height % this.PAGE === 0) { this.pages.push(new Array(this.PAGE).fill(null)); this.owned.add(this.pages.length - 1); }
    this.height++;
    this.write(0, v);
  }
  write(index, v) {
    const pos = this.height - 1 - index, page = Math.floor(pos / this.PAGE);
    if (!this.owned.has(page)) { this.pages[page] = [...this.pages[page]]; this.copied.write += this.PAGE; this.owned.add(page); }
    this.pages[page][pos % this.PAGE] = v;
  }
  save() { this.owned = new Set(); return [[...this.pages], this.height]; }
  restore(s) { this.pages = [...s[0]]; this.height = s[1]; this.owned = new Set(); }
  values() { return range(this.height).map((i) => this.pages[Math.floor(i / this.PAGE)][i % this.PAGE]); }
  kept(saved) { const s = new Set(); for (const [table] of saved) for (const p of table) s.add(p); return this.PAGE * s.size; }
}
function checkpointTrace(stack, seed, depth = 200, rounds = 16, writes = 24) {
  const rng = new Rng(seed);
  for (let v = 0; v < depth; v++) stack.push(v);
  const saved = [], oracle = [];
  for (let r = 0; r < rounds; r++) {
    saved.push(stack.save());
    oracle.push(stack.values());
    for (let w = 0; w < writes; w++) { const i = rng.below(depth); stack.write(i, rng.below(1000)); }
  }
  let exact = true;
  for (let i = saved.length - 1; i >= 0; i--) { stack.restore(saved[i]); exact = exact && stack.values().join() === oracle[i].join(); }
  return [exact, stack.kept(saved)];
}

function demoStack(el) {
  el.innerHTML = `<div class="controls"><label>page size <input class="pg" type="range" min="0" max="5" value="2"><b class="mono vp"></b></label>
      <label>writes after each checkpoint <input class="wr" type="range" min="1" max="100" value="24"><b class="mono vw"></b></label></div>
    <div class="l8-bars"></div>
    <p class="hint">200 items, 16 live checkpoints, then every checkpoint restored and compared. Bars: items copied (saves and restores, then writes) and items kept alive.</p>`;
  const draw = () => {
    const page = 2 ** +el.querySelector(".pg").value, writes = +el.querySelector(".wr").value;
    el.querySelector(".vp").textContent = page;
    el.querySelector(".vw").textContent = writes;
    const a = new CopyStack(), b = new PagedStack(page);
    const [ea, ka] = checkpointTrace(a, 9, 200, 16, writes), [eb, kb] = checkpointTrace(b, 9, 200, 16, writes);
    const top = 6400;
    const bar = (label, v, cls) => `<div class="l8-bar"><small>${label}</small><span class="${cls}" style="width:${Math.max(0.5, Math.min(100, (v / top) * 100))}%"></span><b class="mono">${comma(v)}</b></div>`;
    el.querySelector(".l8-bars").innerHTML =
      `<h4>Copy the whole stack ${ea ? "· restores exact" : ""}</h4>` + bar("save + restore", a.copied.save + a.copied.restore, "r") + bar("on write", a.copied.write, "r") + bar("kept", ka, "k") +
      `<h4>Pages of ${page}, copy on write ${eb ? "· restores exact" : ""}</h4>` + bar("save + restore", b.copied.save + b.copied.restore, "c") + bar("on write", b.copied.write, "c") + bar("kept", kb, "k");
  };
  el.querySelectorAll("input").forEach((i) => { i.oninput = draw; });
  draw();
}

// ---------- Seer: branch predictors ----------

const UNSURE = 1, TAKEN = 2, NOT_TAKEN = 3;
const BKINDS = [...Array(24).fill("steady"), ...Array(18).fill("switches once"), ...Array(12).fill("per block"), ...Array(6).fill("random")];
function makeBranchTrace(seed, branches = 60, blocks = 40) {
  const rng = new Rng(seed), flipAt = range(branches).map(() => rng.below(blocks)), trace = [];
  for (let blk = 0; blk < blocks; blk++) {
    const runs = [];
    for (let b = 0; b < branches; b++) {
      const mood = rng.below(2), times = 1 + rng.below(3);
      for (let r = 0; r < times; r++) {
        const kind = BKINDS[b];
        let taken;
        if (kind === "steady") taken = b % 2 === 0;
        else if (kind === "switches once") taken = (blk >= flipAt[b]) === (b % 2 === 0);
        else if (kind === "per block") taken = mood === 1;
        else taken = rng.below(2) === 1;
        runs.push([b, taken]);
      }
    }
    trace.push(runs);
  }
  return trace;
}
class AlwaysTaken { predict() { return TAKEN; } update() {} }
class LastDirection {
  constructor() { this.last = UNSURE; }
  predict() { return this.last; }
  update(taken) { this.last = taken ? TAKEN : NOT_TAKEN; }
}
class StableTwoBlocks extends LastDirection {
  constructor() { super(); this.blocks = 0; this.newBlock = true; }
  predict() { this.newBlock = true; return this.blocks >= 2 ? this.last : UNSURE; }
  update(taken) {
    const seen = taken ? TAKEN : NOT_TAKEN;
    if (seen !== this.last) { this.last = seen; this.blocks = 1; } else if (this.newBlock) this.blocks++;
    this.newBlock = false;
  }
}
const PREDICTORS = { AlwaysTaken, LastDirection, StableTwoBlocks };
// Tally per branch kind as well as in total.
function replay(Kind, trace) {
  const predictors = new Map(), tally = { right: 0, wrong: 0, unsure: 0 }, byKind = {};
  for (const runs of trace) {
    const guesses = runs.map(([b]) => { if (!predictors.has(b)) predictors.set(b, new Kind()); return predictors.get(b).predict(); });
    runs.forEach(([b, taken], i) => {
      const g = guesses[i], res = g === UNSURE ? "unsure" : (g === TAKEN) === taken ? "right" : "wrong";
      tally[res]++;
      const k = BKINDS[b];
      byKind[k] = byKind[k] || { right: 0, wrong: 0, unsure: 0 };
      byKind[k][res]++;
      predictors.get(b).update(taken);
    });
  }
  return { tally, byKind };
}
let BTRACE = null;
const branchTrace = () => BTRACE || (BTRACE = makeBranchTrace(21));

function demoSeer(el) {
  el.innerHTML = `<div class="controls"><span class="l8-seg">${Object.keys(PREDICTORS).map((p) => `<button class="cbtn" data-p="${p}">${p}</button>`).join("")}</span></div>
    <div class="l8-stack"></div><div class="legend"><span><i style="background:var(--green)"></i>right</span><span><i style="background:var(--red)"></i>wrong</span><span><i style="background:var(--line)"></i>unsure</span></div>`;
  let pick = "StableTwoBlocks";
  const draw = () => {
    el.querySelectorAll(".l8-seg .cbtn").forEach((b) => b.classList.toggle("on", b.dataset.p === pick));
    const { tally, byKind } = replay(PREDICTORS[pick], branchTrace());
    const row = (label, t) => {
      const n = t.right + t.wrong + t.unsure;
      return `<div class="l8-stackrow"><small>${label}</small><div class="l8-split">${["right", "wrong", "unsure"].map((r) => `<span class="${r}" style="width:${(t[r] / n) * 100}%"></span>`).join("")}</div><b class="mono">${t.right}/${t.wrong}/${t.unsure}</b></div>`;
    };
    el.querySelector(".l8-stack").innerHTML = row("all branches", tally) + ["steady", "switches once", "per block", "random"].map((k) => row(k, byKind[k])).join("");
  };
  el.querySelectorAll(".l8-seg .cbtn").forEach((b) => { b.onclick = () => { pick = b.dataset.p; draw(); }; });
  draw();
}

// ---------- Persistent treap ----------

class TNode {
  constructor(key, prio, count, left, right) {
    this.key = key; this.prio = prio; this.count = count; this.left = left; this.right = right;
    this.total = count + (left ? left.total : 0) + (right ? right.total : 0);
  }
}
const tpriority = (key) => (key * 2654435761) % 4294967296;
const TSTATS = { copied: 0 };
function tcopy(n, ch) {
  const f = { key: n.key, prio: n.prio, count: n.count, left: n.left, right: n.right, ...ch };
  TSTATS.copied++;
  return new TNode(f.key, f.prio, f.count, f.left, f.right);
}
function tinsert(n, key) {
  if (n === null) { TSTATS.copied++; return new TNode(key, tpriority(key), 1, null, null); }
  if (key === n.key) return tcopy(n, { count: n.count + 1 });
  if (key < n.key) {
    const c = tinsert(n.left, key);
    if (c.prio > n.prio) return tcopy(c, { right: tcopy(n, { left: c.right }) });
    return tcopy(n, { left: c });
  }
  const c = tinsert(n.right, key);
  if (c.prio > n.prio) return tcopy(c, { left: tcopy(n, { right: c.left }) });
  return tcopy(n, { right: c });
}
function tmerge(a, b) {
  if (a === null || b === null) return a || b;
  if (a.prio > b.prio) return tcopy(a, { right: tmerge(a.right, b) });
  return tcopy(b, { left: tmerge(a, b.left) });
}
function tdelete(n, key) {
  if (key === n.key) return n.count > 1 ? tcopy(n, { count: n.count - 1 }) : tmerge(n.left, n.right);
  if (key < n.key) return tcopy(n, { left: tdelete(n.left, key) });
  return tcopy(n, { right: tdelete(n.right, key) });
}
function rangeSum(n, lo, hi) {
  if (n === null) return 0;
  if (n.key < lo) return rangeSum(n.right, lo, hi);
  if (n.key > hi) return rangeSum(n.left, lo, hi);
  return n.count + rangeSum(n.left, lo, n.key - 1) + rangeSum(n.right, n.key + 1, hi);
}
const TOP = 4294967296 - Math.floor(4294967296 / 32);
const topKeys = (n) => (n === null || n.prio < TOP ? [] : [...topKeys(n.left), n.key, ...topKeys(n.right)]);
function tpath(n, key) {
  let top = 0, unit = 0;
  while (n !== null) {
    if (n.prio >= TOP) top++; else unit++;
    if (key === n.key) break;
    n = key < n.key ? n.left : n.right;
  }
  return [top, unit];
}
const bisectLeft = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; } return lo; };
let TREAP = null;
function treapModel() {
  if (TREAP) return TREAP;
  const rng = new Rng(13), n = 500;
  const keys = range(n).map((i) => 2 * (i + 1));
  for (let i = n - 1; i > 0; i--) { const j = rng.below(i + 1); [keys[i], keys[j]] = [keys[j], keys[i]]; }
  let root = null;
  for (const key of keys) root = tinsert(root, key);
  const roots = [root], live = new Map(keys.map((k) => [k, 1])), history = [], ops = [];
  const initial = new Map(live);
  TSTATS.copied = 0;
  for (let s = 0; s < 3000; s++) {
    const draw = rng.below(100);
    let op = "query", key = 0;
    if (draw < 42) {
      op = "insert"; key = 1 + rng.below(4 * n);
      root = tinsert(root, key);
      live.set(key, (live.get(key) || 0) + 1);
    } else if (draw < 67) {
      op = "delete";
      const sorted = [...live.keys()].sort((a, b) => a - b);
      key = sorted[rng.below(sorted.length)];
      root = tdelete(root, key);
      live.set(key, live.get(key) - 1);
      if (live.get(key) === 0) live.delete(key);
    }
    roots.push(root);
    history.push(new Map(live));
    ops.push([op, key]);
  }
  const updates = roots.slice(1).filter((r, i) => r !== roots[i]).length;
  const perUpdate = TSTATS.copied / updates;
  let ok = true;
  for (let s = 0; s < 200; s++) {
    const v = 1 + rng.below(3000), lo = 1 + rng.below(4 * n - 128);
    let want = 0;
    for (const [k, c] of history[v - 1]) if (lo <= k && k <= lo + 127) want += c;
    ok = ok && rangeSum(roots[v], lo, lo + 127) === want;
  }
  const tops = topKeys(root);
  const units = [["uniform", 0], ["hotspot", 98]].map(([label, hot]) => {
    const r2 = new Rng(17), load = [0, 0, 0, 0];
    let topNodes = 0, unitNodes = 0;
    for (let s = 0; s < 1000; s++) {
      const key = r2.below(100) < hot ? 900 + r2.below(40) : 1 + r2.below(4 * n);
      load[bisectLeft(tops, key) % 4]++;
      const [t, u] = tpath(root, key);
      topNodes += t; unitNodes += u;
    }
    return { label, top: topNodes / 1000, unit: unitNodes / 1000, load };
  });
  TREAP = { n, roots, initial, history, ops, updates, perUpdate, ok, tops, units };
  return TREAP;
}

function demoTreap(el) {
  const m = treapModel();
  el.innerHTML = `<div class="controls"><label>version <input class="v" type="range" min="0" max="3000" value="1500"><b class="mono vv"></b></label>
      <label>range start <input class="lo" type="range" min="1" max="${4 * m.n - 128}" value="900"><b class="mono vlo"></b></label></div>
    <div class="stats"></div><div class="l8-bars"></div>
    <p class="hint">Any of the 3,001 versions answers a range sum over 128 keys from its own root; the bars compare the four workers' loads under uniform and hotspot updates.</p>`;
  const draw = () => {
    const v = +el.querySelector(".v").value, lo = +el.querySelector(".lo").value;
    el.querySelector(".vv").textContent = v;
    el.querySelector(".vlo").textContent = `${lo}–${lo + 127}`;
    const got = rangeSum(m.roots[v], lo, lo + 127);
    let want = 0;
    for (const [k, c] of v === 0 ? m.initial : m.history[v - 1]) if (lo <= k && k <= lo + 127) want += c;
    const op = v === 0 ? "initial keys" : `${m.ops[v - 1][0]}${m.ops[v - 1][0] === "query" ? "" : " " + m.ops[v - 1][1]}`;
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>transaction</small><b>${op}</b></div>
      <div class="stat"><small>range sum</small><b>${got}</b></div>
      <div class="stat ${got === want ? "good" : "bad"}"><small>from the recorded multiset</small><b>${want}</b></div>
      <div class="stat"><small>nodes copied per update</small><b>${fmt(m.perUpdate, 1)}</b></div>`;
    const top = 520;
    el.querySelector(".l8-bars").innerHTML = m.units.map((u) => `<h4>${u.label}: ${fmt(u.top, 1)} top + ${fmt(u.unit, 1)} unit nodes per update</h4>` +
      u.load.map((x, i) => `<div class="l8-bar"><small>worker ${i + 1}</small><span class="c" style="width:${Math.max(0.5, (x / top) * 100)}%"></span><b class="mono">${x}</b></div>`).join("")).join("");
  };
  el.querySelectorAll("input").forEach((i) => { i.oninput = draw; });
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
  yann: (el) => demoYann(el),
  yannAuto: (el) => demoYann(el, { auto: true }),
  boost: (el) => demoBoost(el),
  fargo: (el) => demoFargo(el),
  pattern: (el) => demoPattern(el),
  regret: (el) => demoRegret(el),
  stack: (el) => demoStack(el),
  seer: (el) => demoSeer(el),
  treap: (el) => demoTreap(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
