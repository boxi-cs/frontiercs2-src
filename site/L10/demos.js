// L10 demos. The JS models repeat the Python programs in frontiercs2/notes/L10-software-engineering.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

// ---------- the toy program and its tracer (exact twins of the Python) ----------

class Trace {
  constructor(x) { this.x = x; this.path = []; } // path: [branch, reads, test, text]
  cond(site, reads, test, text) {
    const taken = test(this.x);
    this.path.push([2 * site + (taken ? 0 : 1), reads, test, text]);
    return taken;
  }
}

// A toy packet parser: x0 is the type, x1..x5 the header, x6..x11 the payload.
function program(x, t) {
  if (t.cond(1, [0], (v) => v[0] < 8, "x0 < 8")) {
    if (t.cond(2, [0], (v) => v[0] === 3, "x0 == 3")) {
      if (t.cond(3, [1], (v) => v[1] === 7, "x1 == 7")) {
        if (t.cond(4, [1, 2], (v) => v[2] === v[1] + 4, "x2 == x1 + 4")) {
          t.cond(5, [3], (v) => v[3] > 13, "x3 > 13");
        }
      }
    } else {
      t.cond(6, [1, 2], (v) => v[1] > v[2], "x1 > x2");
    }
  } else if (t.cond(7, [0], (v) => v[0] === 12, "x0 == 12")) {
    if (t.cond(8, [3, 4], (v) => v[3] === 2 * v[4], "x3 == 2*x4")) {
      if (t.cond(9, [5], (v) => v[5] === 15, "x5 == 15")) {
        t.cond(10, [4], (v) => v[4] > 7, "x4 > 7");
      }
    }
  }
  for (let i = 6; i < 12; i++) t.cond(0, [i], (v) => v[i] === 0, `x${i} == 0`);
}

function run(x) { const t = new Trace([...x]); program(t.x, t); return t.path; }
const describe = (path) => path.map(([b, , , text]) => (b % 2 === 0 ? text : `not ${text}`));

// Inputs that follow path[:k] and then take the other side of path[k], or null.
function solve(x, path, k) {
  const [, reads, test] = path[k], want = path[k][0] % 2 === 1;
  const free = new Set(reads);
  let grown = true;
  while (grown) {
    grown = false;
    for (const [, r] of path.slice(0, k)) {
      if (r.some((i) => free.has(i)) && !r.every((i) => free.has(i))) { r.forEach((i) => free.add(i)); grown = true; }
    }
  }
  const keep = path.slice(0, k).filter(([, r]) => r.some((i) => free.has(i))).map(([b, , f]) => [b % 2 === 0, f]);
  const vars = [...free].sort((a, b) => a - b), n = vars.length;
  for (let idx = 0; idx < 16 ** n; idx++) {          // the order of itertools.product
    const y = [...x];
    for (let j = 0; j < n; j++) y[vars[j]] = Math.floor(idx / 16 ** (n - 1 - j)) % 16;
    if (test(y) === want && keep.every(([taken, f]) => f(y) === taken)) return y;
  }
  return null;
}

// ---------- the harness and the strategies ----------

class Rng {
  constructor(seed) { this.state = seed; }
  below(n) { this.state = (this.state * 48271) % 2147483647; return this.state % n; }
}

const BUDGET_SPENT = { spent: true };

class Tester {
  constructor(budget, seed) {
    this.budget = budget; this.rng = new Rng(seed);
    this.runs = 0; this.solves = 0; this.covered = new Set(); this.curve = []; this.paths = []; this.log = [];
  }
  execute(x) {
    if (this.runs === this.budget) throw BUDGET_SPENT;
    this.runs++;
    const path = run(x);
    this.paths.push(path.map(([b]) => b));
    let fresh = 0;
    for (const [b] of path) if (!this.covered.has(b)) { this.covered.add(b); fresh++; }
    this.curve.push(this.covered.size);
    this.log.push({ x, fresh, covered: new Set(this.covered) });
    return [x, path, fresh];
  }
  restart() { return this.execute(Array.from({ length: 12 }, () => this.rng.below(16))); }
  negate(ex, k) {
    this.solves++;
    const y = solve(ex[0], ex[1], k);
    return y === null ? null : this.execute(y);
  }
}

function session(strategy, budget, seed) {
  const t = new Tester(budget, seed);
  try { strategy(t); } catch (e) { if (e !== BUDGET_SPENT) throw e; }
  return t;
}

function randomTesting(t) { for (;;) t.restart(); }

function boundedDfs(t, depth = 12) {
  const dfs = (ex, pos, d) => {
    for (let k = pos; k < ex[1].length; k++) {
      if (d === 0) return;
      const nw = t.negate(ex, k);
      if (nw !== null) dfs(nw, k + 1, d - 1);
    }
  };
  for (;;) dfs(t.restart(), 0, depth);
}

function randomBranch(t, patience = 10) {
  for (;;) {
    let ex = t.restart(), stale = 0;
    while (stale < patience) {
      const nw = t.negate(ex, t.rng.below(ex[1].length));
      if (nw !== null) { ex = nw; stale = nw[2] ? 0 : stale + 1; }
    }
  }
}

// Branch-level control-flow graph; a branch with no entry goes to the payload loop.
const SUCC = { 2: [4, 5], 3: [14, 15], 4: [6, 7], 5: [12, 13], 6: [8, 9], 8: [10, 11], 14: [16, 17], 16: [18, 19], 18: [20, 21] };
const INF = 1e6;
const succ = (b) => SUCC[b] || [0, 1];

function distances(covered) {
  const back = Array.from({ length: 22 }, () => []);
  for (let a = 0; a < 22; a++) for (const b of succ(a)) back[b].push(a);
  const dist = Array(22).fill(INF), queue = [];
  for (let b = 0; b < 22; b++) if (!covered.has(b)) { queue.push(b); dist[b] = 0; }
  for (let q = 0; q < queue.length; q++) {
    const b = queue[q];
    for (const a of back[b]) if (dist[a] === INF) { dist[a] = dist[b] + 1; queue.push(a); }
  }
  return dist;
}

// One ranking step of CFG-directed search: shuffle, drop hopeless, sort by distance + tries.
function cfgOrder(t, ex, tries) {
  const dist = distances(t.covered), order = ex[1].map((_, k) => k);
  for (let i = order.length - 1; i > 0; i--) { const j = t.rng.below(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const key = (k) => dist[ex[1][k][0] ^ 1] + tries[ex[1][k][0] ^ 1];
  return order.filter((k) => dist[ex[1][k][0] ^ 1] < INF).sort((a, b) => key(a) - key(b));
}

function cfgDirected(t, patience = 10) {
  for (;;) {
    let ex = t.restart(), stale = 0;
    const tries = Array(22).fill(0);
    while (stale < patience) {
      let moved = false;
      for (const k of cfgOrder(t, ex, tries)) {
        const other = ex[1][k][0] ^ 1;
        tries[other]++;
        const nw = t.negate(ex, k);
        if (nw === null) continue;
        if (nw[2]) { ex = nw; stale = 0; tries[other] = 0; moved = true; break; }
        stale++;
      }
      if (!moved) break;
    }
  }
}

function cfgMemo(t, patience = 10) {
  const asked = new Set(), infeasible = Array(22).fill(0), feasible = Array(22).fill(0);
  for (;;) {
    let ex = t.restart(), stale = 0;
    const tries = Array(22).fill(0);
    while (stale < patience) {
      let moved = false;
      for (const k of cfgOrder(t, ex, tries)) {
        const other = ex[1][k][0] ^ 1;
        const prefix = ex[1].slice(0, k).map(([b]) => b).concat([other]).join(",");
        if (asked.has(prefix) || (infeasible[other] >= 3 && !feasible[other])) continue;
        asked.add(prefix);
        tries[other]++;
        const nw = t.negate(ex, k);
        if (nw === null) { infeasible[other]++; continue; }
        feasible[other]++;
        if (nw[2]) { ex = nw; stale = 0; tries[other] = 0; moved = true; break; }
        stale++;
      }
      if (!moved) break;
    }
  }
}

const STRATEGIES = { "random testing": randomTesting, "bounded DFS": boundedDfs, "random branch": randomBranch, "CFG-directed": cfgDirected };

// ---------- the task's rules ----------

const taskScore = (c, b, t) => (100 * Math.max(0, c - b)) / (t - b);
const margin = (s) => 3 * s * Math.sqrt(2 / 30);

// ---------- shared data (built on first use) ----------

let RACE = null; // 20 seeds x 4 strategies, 100 runs each
function race() {
  if (RACE) return RACE;
  RACE = {};
  for (const [name, f] of Object.entries(STRATEGIES)) RACE[name] = Array.from({ length: 20 }, (_, s) => session(f, 100, s + 1));
  return RACE;
}
const COLORS = { "random testing": "var(--stone)", "bounded DFS": "var(--red)", "random branch": "var(--amber)", "CFG-directed": "var(--teal)" };

// The 11 conditions, for the branch grids.
const CONDS = ["x(6..11) == 0", "x0 < 8", "x0 == 3", "x1 == 7", "x2 == x1 + 4", "x3 > 13", "x1 > x2", "x0 == 12", "x3 == 2*x4", "x5 == 15", "x4 > 7"];
function branchGrid(covered, highlight = new Set()) {
  return `<div class="cc-grid">${CONDS.map((c, s) => `<div class="cc-cond"><small>${s}</small><span class="cc-text">${c}</span>
    ${[0, 1].map((side) => { const b = 2 * s + side; return `<i class="${covered.has(b) ? "on" : ""} ${highlight.has(b) ? "new" : ""}" title="branch ${b}${b === 20 ? " (unreachable)" : ""}">${side ? "F" : "T"}</i>`; }).join("")}</div>`).join("")}</div>`;
}

// ---------- Demo 1: concolic testing by hand ----------

function demoConcolic(el) {
  let x = Array(12).fill(0), covered = new Set(), runs = 0, solves = 0, last = new Set(), tries = Array(22).fill(0);
  el.innerHTML = `<div class="cc-inputs"></div>
    <div class="controls"><button class="cbtn on pick">Let CFG-directed pick</button><button class="cbtn rnd">Random input</button><button class="cbtn reset">Reset to zeros</button><span class="spacer"></span><span class="counter mono"></span></div>
    <ol class="cc-path"></ol><div class="msg"></div><div class="cc-cov"></div>`;
  const msg = el.querySelector(".msg");
  const exec = (y) => {
    x = y; runs++;
    const path = run(x);
    last = new Set();
    for (const [b] of path) if (!covered.has(b)) { covered.add(b); last.add(b); }
    return path;
  };
  let path = exec(x);
  const negate = (k) => {
    solves++;
    const y = solve(x, path, k), cond = describe(path)[k];
    if (y === null) { msg.className = "msg bad"; msg.textContent = `Negating “${cond}” is infeasible: no inputs 0..15 satisfy it together with the conditions before it. One solver call, no run.`; draw(); return; }
    const changed = y.map((v, i) => (v !== x[i] ? `x${i} = ${v}` : null)).filter(Boolean);
    path = exec(y);
    msg.className = last.size ? "msg good" : "msg";
    msg.textContent = `Negated “${cond}”: the solver set ${changed.join(", ")}. ${last.size ? `New branches: ${[...last].join(", ")}.` : "No new branch."}`;
    draw();
  };
  const draw = () => {
    const dist = distances(covered);
    el.querySelector(".cc-inputs").innerHTML = x.map((v, i) => `<label><small>x${i}</small><input type="number" min="0" max="15" value="${v}" data-i="${i}"></label>`).join("");
    el.querySelectorAll(".cc-inputs input").forEach((inp) => {
      inp.onchange = () => {
        const y = [...x]; y[+inp.dataset.i] = Math.max(0, Math.min(15, Math.floor(+inp.value || 0)));
        path = exec(y); msg.className = "msg"; msg.textContent = `Ran the program on your input.${last.size ? ` New branches: ${[...last].join(", ")}.` : ""}`; draw();
      };
    });
    const texts = describe(path);
    el.querySelector(".cc-path").innerHTML = path.map(([b], k) => {
      const d = dist[b ^ 1];
      const tr = tries[b ^ 1] ? `, tried ${tries[b ^ 1]}×` : "";
      return `<li class="${b % 2 ? "f" : "t"}"><span class="mono">${texts[k]}</span><small>other side: branch ${b ^ 1}${covered.has(b ^ 1) ? "" : " (uncovered)"}, ${d < INF ? `${d} step${d === 1 ? "" : "s"} from new code${tr}` : "nothing new beyond"}</small><button class="cbtn" data-k="${k}">negate</button></li>`;
    }).join("");
    el.querySelectorAll(".cc-path button").forEach((b) => { b.onclick = () => negate(+b.dataset.k); });
    el.querySelector(".counter").textContent = `${runs} runs · ${solves} solver calls · ${covered.size} / 22 branches`;
    el.querySelector(".cc-cov").innerHTML = branchGrid(covered, last);
  };
  el.querySelector(".pick").onclick = () => {
    const dist = distances(covered), key = (k) => dist[path[k][0] ^ 1] + tries[path[k][0] ^ 1];
    let best = -1;
    path.forEach(([b], k) => { if (dist[b ^ 1] < INF && (best < 0 || key(k) < key(best))) best = k; });
    if (best < 0) { msg.className = "msg"; msg.textContent = "No condition on this path leads anywhere new. A strategy would restart."; return; }
    const other = path[best][0] ^ 1;
    tries[other]++;
    negate(best);
    if (last.size) tries[other] = 0;
  };
  el.querySelector(".rnd").onclick = () => {
    const y = Array.from({ length: 12 }, () => Math.floor(Math.random() * 16));
    path = exec(y); msg.className = "msg"; msg.textContent = `A random input.${last.size ? ` New branches: ${[...last].join(", ")}.` : " Nothing new."}`; draw();
  };
  el.querySelector(".reset").onclick = () => {
    covered = new Set(); runs = 0; solves = 0; tries = Array(22).fill(0); path = exec(Array(12).fill(0));
    msg.className = "msg"; msg.textContent = "All zeros, CREST's first input. Negate a condition, or let CFG-directed search pick the one whose other side is closest to new code."; draw();
  };
  msg.textContent = "All zeros, CREST's first input. Negate a condition, or let CFG-directed search pick the one whose other side is closest to new code.";
  draw();
}

// ---------- Demo 2: the race ----------

function curveSvg(lines, upto, W = 700, H = 200) {
  const x = (i) => 36 + ((W - 46) * i) / 99, y = (v) => H - 22 - ((H - 34) * v) / 22;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Branches covered against runs">`;
  for (const v of [0, 5, 10, 15, 20, 22]) svg += `<line x1="36" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="30" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="var(--stone)">${v}</text>`;
  for (const n of [1, 25, 50, 75, 100]) svg += `<text x="${x(n - 1)}" y="${H - 6}" font-size="10" text-anchor="middle" fill="var(--stone)">${n}</text>`;
  for (const [name, curve] of lines) {
    const pts = curve.slice(0, upto).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    svg += `<polyline points="${pts}" fill="none" stroke="${COLORS[name]}" stroke-width="2.2"/>`;
  }
  return svg + "</svg>";
}

function demoRace(el, { auto = false } = {}) {
  const R = race();
  let seed = 0, mean = true, upto = 0, timer = null;
  el.innerHTML = `${auto ? "" : `<div class="controls"><button class="cbtn on m-mean">Mean of 20 seeds</button><button class="cbtn m-one">One seed</button>
      <label class="seedl">seed <input class="seed" type="range" min="1" max="20" value="1"><b class="mono vs">1</b></label><button class="cbtn play">Replay</button></div>`}
    <div class="svgbox rc-box"></div><div class="rc-legend">${Object.keys(STRATEGIES).map((n) => `<span><i style="background:${COLORS[n]}"></i>${n}</span>`).join("")}</div>
    ${auto ? "" : `<div class="stats"></div><div class="msg"></div>`}`;
  const draw = () => {
    const lines = Object.keys(STRATEGIES).map((n) => [n, mean
      ? Array.from({ length: 100 }, (_, i) => { let s = 0; for (const r of R[n]) s += r.curve[i]; return s / 20; })
      : R[n][seed].curve]);
    el.querySelector(".rc-box").innerHTML = curveSvg(lines, upto);
    if (auto) return;
    el.querySelector(".stats").innerHTML = lines.map(([n, c]) => {
      let solves = 0;
      if (mean) { for (const r of R[n]) solves += r.solves; solves /= 20; } else solves = R[n][seed].solves;
      return `<div class="stat"><small>${n}</small><b style="color:${COLORS[n]}">${(c[Math.max(0, upto - 1)]).toFixed(mean ? 2 : 0)}</b><small>${mean ? solves.toFixed(2) : solves} solver calls</small></div>`;
    }).join("");
    const msg = el.querySelector(".msg");
    msg.className = "msg";
    msg.textContent = mean
      ? `Mean branches covered after ${upto} of 100 runs, over seeds 1 to 20 (the table in the notes). The program has 22 branches; branch 20 is unreachable.`
      : `Seed ${seed + 1}, after ${upto} runs. Bounded DFS spends its runs on the 64 ways through the payload loop.`;
  };
  const play = () => {
    clearInterval(timer); upto = 0; draw();
    timer = setInterval(() => {
      upto += 2;
      if (upto >= 100 + (auto ? 30 : 0)) { if (auto) upto = 0; else { upto = 100; clearInterval(timer); } }
      draw();
    }, 50);
  };
  if (!auto) {
    const setMode = (m) => { mean = m; el.querySelector(".m-mean").classList.toggle("on", m); el.querySelector(".m-one").classList.toggle("on", !m); play(); };
    el.querySelector(".m-mean").onclick = () => setMode(true);
    el.querySelector(".m-one").onclick = () => setMode(false);
    const s = el.querySelector(".seed");
    s.oninput = () => { seed = +s.value - 1; el.querySelector(".vs").textContent = s.value; if (mean) setMode(false); else { upto = 100; draw(); } };
    el.querySelector(".play").onclick = play;
  }
  play();
}

// ---------- Demo 3: one session, run by run ----------

function demoSession(el) {
  let name = "CFG-directed", idea = false, step = 0;
  el.innerHTML = `<div class="controls">${Object.keys(STRATEGIES).map((n, i) => `<button class="cbtn${i === 3 ? " on" : ""}" data-n="${n}">${n}</button>`).join("")}
      <label><input type="checkbox" class="memo"> with the two ideas</label></div>
    <div class="controls"><label>run <input class="step" type="range" min="1" max="100" value="1"><b class="mono vstep"></b></label><button class="cbtn next">Next new branch</button></div>
    <div class="ss-run mono"></div><div class="ss-cov"></div><div class="stats"></div>`;
  let t = null;
  const load = () => {
    const f = idea && name === "CFG-directed" ? cfgMemo : STRATEGIES[name];
    t = session(f, 100, 1);
    el.querySelector(".memo").disabled = name !== "CFG-directed";
    draw();
  };
  const draw = () => {
    const i = step, e = t.log[i], prev = i ? t.log[i - 1].covered : new Set(), fresh = new Set([...e.covered].filter((b) => !prev.has(b)));
    el.querySelector(".vstep").textContent = i + 1;
    el.querySelector(".step").value = i + 1;
    el.querySelector(".ss-run").innerHTML = `run ${i + 1}: x = [${e.x.join(", ")}]<br><span>${describe(run(e.x)).slice(0, -6).join(" · ")} · payload ${t.paths[i].slice(-6).map((b) => (b ? "F" : "T")).join("")}</span>`;
    el.querySelector(".ss-cov").innerHTML = branchGrid(e.covered, fresh);
    el.querySelector(".stats").innerHTML = `<div class="stat"><small>branches</small><b>${e.covered.size} / 22</b></div>
      <div class="stat"><small>new in this run</small><b>${e.fresh}</b></div>
      <div class="stat"><small>header paths so far</small><b>${new Set(t.paths.slice(0, i + 1).map((p) => p.slice(0, -6).join())).size}</b></div>
      <div class="stat"><small>solver calls, whole session</small><b>${t.solves}</b></div>`;
  };
  el.querySelectorAll("[data-n]").forEach((b) => {
    b.onclick = () => { name = b.dataset.n; el.querySelectorAll("[data-n]").forEach((x) => x.classList.toggle("on", x === b)); step = 0; load(); };
  });
  el.querySelector(".memo").onchange = (e) => { idea = e.target.checked; step = 0; load(); };
  el.querySelector(".step").oninput = (e) => { step = +e.target.value - 1; draw(); };
  el.querySelector(".next").onclick = () => {
    let j = step + 1;
    while (j < t.log.length && !t.log[j].fresh) j++;
    step = Math.min(j, t.log.length - 1); draw();
  };
  load();
}

// ---------- Demo 4: the pass rule ----------

const RULE_PRESETS = {
  "GPT-6.1 Terra, sed overhead": { cov: false, c: 31.4, r: 29.8, m: 0.572 },
  "Claude Opus 5.5, Vim overhead": { cov: false, c: 104, r: 116, m: 26.3 },
  "GPT-6.1 Terra, Vim coverage": { cov: true, c: 8930, r: 7700, m: 209 },
};

function demoRule(el) {
  el.innerHTML = `<div class="controls">${Object.keys(RULE_PRESETS).map((p, i) => `<button class="cbtn${i ? "" : " on"}" data-p="${p}">${p}</button>`).join("")}</div>
    <div class="controls"><label><select class="kind"><option value="cov">coverage (higher is better)</option><option value="ovh">overhead (lower is better)</option></select></label></div>
    <div class="controls"><label>candidate mean <input type="number" step="any" class="c"></label><label>reference mean <input type="number" step="any" class="r"></label></div>
    <div class="controls"><label>candidate spread s<sub>c</sub> <input type="number" step="any" class="sc"></label><label>reference spread s<sub>r</sub> <input type="number" step="any" class="sr"></label></div>
    <div class="stats"></div><div class="msg"></div>
    <p class="hint">The presets take the margin from the task page and set both spreads to the s it implies, s = margin / 0.7746.</p>`;
  const q = (c) => el.querySelector(c);
  const draw = () => {
    const cov = q(".kind").value === "cov", c = +q(".c").value, r = +q(".r").value;
    const s = Math.sqrt(((+q(".sc").value) ** 2 + (+q(".sr").value) ** 2) / 2), m = margin(s), gain = cov ? c - r : r - c, ok = gain > m;
    q(".stats").innerHTML = `<div class="stat"><small>gain</small><b>${gain.toFixed(2)}</b></div>
      <div class="stat"><small>pooled s</small><b>${s.toFixed(2)}</b></div>
      <div class="stat"><small>margin 3·s·√(2/30)</small><b>${m.toFixed(2)}</b></div>
      <div class="stat ${ok ? "good" : "bad"}"><small>this rule</small><b>${ok ? "cleared" : "not cleared"}</b></div>`;
    q(".msg").className = `msg ${ok ? "good" : "bad"}`;
    q(".msg").textContent = ok
      ? `The candidate is ${cov ? "ahead" : "faster"} by ${gain.toFixed(2)}, more than the margin. It must also clear the three other rules.`
      : `${gain <= 0 ? `The candidate is ${cov ? "behind" : "slower"}.` : `A gain of ${gain.toFixed(2)} is inside the margin of ${m.toFixed(2)}.`} One rule missed on one program fails the run.`;
  };
  const load = (p) => {
    const v = RULE_PRESETS[p], s = v.m / margin(1);
    q(".kind").value = v.cov ? "cov" : "ovh"; q(".c").value = v.c; q(".r").value = v.r;
    q(".sc").value = s.toFixed(3); q(".sr").value = s.toFixed(3);
    el.querySelectorAll("[data-p]").forEach((b) => b.classList.toggle("on", b.dataset.p === p));
    draw();
  };
  el.querySelectorAll("input, select").forEach((i) => { i.oninput = () => { el.querySelectorAll("[data-p]").forEach((b) => b.classList.remove("on")); draw(); }; });
  el.querySelectorAll("[data-p]").forEach((b) => { b.onclick = () => load(b.dataset.p); });
  load(Object.keys(RULE_PRESETS)[0]);
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
  concolic: (el) => demoConcolic(el),
  race: (el) => demoRace(el),
  raceAuto: (el) => demoRace(el, { auto: true }),
  session: (el) => demoSession(el),
  rule: (el) => demoRule(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
