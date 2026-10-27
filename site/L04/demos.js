// L04 demos. The JS models repeat the Python programs in frontiercs2/notes/L04-network.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

const JOB_COLORS = ["#4285f4", "#e8710a", "#1e8e3e", "#a142f4", "#d93025", "#12b5cb"];

// ---------- BBQ: a bitmap tree with counters ----------

const BBQ_W = 4;
const BBQ_START = [1, 1, 2, 9, 9];

function bbqNew(prios = BBQ_START) {
  const q = { top: Array(BBQ_W).fill(0), rows: Array.from({ length: BBQ_W }, () => Array(BBQ_W).fill(0)) };
  prios.forEach((p) => bbqEnqueue(q, p));
  return q;
}
function bbqEnqueue(q, p) {
  const r = Math.floor(p / BBQ_W), c = p % BBQ_W;
  q.top[r]++; q.rows[r][c]++;
}
const firstOne = (a) => a.findIndex((c) => c > 0);
const lastOne = (a) => { for (let i = a.length - 1; i >= 0; i--) if (a[i] > 0) return i; return -1; };

// Removes the best (min) or worst (max) packet; returns what changed, or null when empty.
function bbqDequeue(q, max = false) {
  const pick = max ? lastOne : firstOne;
  const r = pick(q.top);
  if (r < 0) return null;
  const c = pick(q.rows[r]);
  const before = { top: q.top[r], cell: q.rows[r][c] };
  q.top[r]--; q.rows[r][c]--;
  return { prio: r * BBQ_W + c, r, c, before, cellCleared: q.rows[r][c] === 0, topCleared: q.top[r] === 0 };
}

function bbqHTML(q, hit) {
  const cell = (count, label, on) => `<div class="bq-cell${count ? " one" : ""}${on ? " hit" : ""}">
      <b>${count ? 1 : 0}</b><small>${count}</small>${label !== null ? `<i>${label}</i>` : ""}</div>`;
  return `<div class="bq">
    <div class="bq-level"><span class="bq-name">Top level</span>
      <div class="bq-row">${q.top.map((c, i) => cell(c, `row ${i}`, hit && hit.r === i)).join("")}</div></div>
    <div class="bq-level"><span class="bq-name">Bottom level</span>
      <div class="bq-rows">${q.rows.map((row, r) => `<div class="bq-row">${row.map((c, i) =>
        cell(c, r * BBQ_W + i, hit && hit.r === r && hit.c === i)).join("")}</div>`).join("")}</div></div>
    <p class="bq-key">Big digit: the bit. Small digit: its counter. Grey label: the priority (bottom) or row (top).</p>
  </div>`;
}

function bbqMessage(res, max) {
  if (!res) return "The queue is empty.";
  const what = max ? "worst" : "best";
  let s = `Removed the ${what} packet: priority ${res.prio}. Counters ${res.before.top}→${res.before.top - 1} (top, row ${res.r}) and ${res.before.cell}→${res.before.cell - 1} (priority ${res.prio}).`;
  if (res.topCleared) s += ` Bit ${res.c} of row ${res.r} turns to 0, and so does bit ${res.r} of the top.`;
  else if (res.cellCleared) s += ` Bit ${res.c} of row ${res.r} turns to 0.`;
  else s += " No bit changes.";
  return s;
}

function demoBBQ(el) {
  let q = bbqNew(), hit = null;
  el.innerHTML = `<div class="bq-holder"></div>
    <div class="controls">
      <label>priority <select class="prio">${Array.from({ length: 16 }, (_, i) => `<option${i === 5 ? " selected" : ""}>${i}</option>`).join("")}</select></label>
      <button class="cbtn enq">Enqueue</button>
      <button class="cbtn on dmin">Dequeue min</button>
      <button class="cbtn dmax">Dequeue max</button>
      <span class="spacer"></span>
      <button class="cbtn reset">Reset</button>
    </div>
    <div class="msg">Five packets wait: priorities 1, 1, 2, 9 and 9. Press <b>Dequeue min</b> three times.</div>`;
  const holder = el.querySelector(".bq-holder"), msg = el.querySelector(".msg");
  const draw = () => { holder.innerHTML = bbqHTML(q, hit); };
  el.querySelector(".enq").onclick = () => {
    const p = +el.querySelector(".prio").value;
    bbqEnqueue(q, p);
    hit = { r: Math.floor(p / BBQ_W), c: p % BBQ_W };
    msg.textContent = `Added a packet of priority ${p}: row ${hit.r}, bit ${hit.c}. Both counters on its path go up by one.`;
    draw();
  };
  const deq = (max) => () => {
    const res = bbqDequeue(q, max);
    hit = res;
    msg.textContent = bbqMessage(res, max);
    draw();
  };
  el.querySelector(".dmin").onclick = deq(false);
  el.querySelector(".dmax").onclick = deq(true);
  el.querySelector(".reset").onclick = () => {
    q = bbqNew(); hit = null;
    msg.textContent = "Back to the five packets: 1, 1, 2, 9, 9.";
    draw();
  };
  draw();
}

// Hero: three removals of the notes' example, then the packets come back.
function demoBBQMini(el) {
  let q = bbqNew(), step = 0;
  el.innerHTML = `<div class="bq-holder"></div><div class="msg"></div>`;
  const holder = el.querySelector(".bq-holder"), msg = el.querySelector(".msg");
  const tick = () => {
    let hit = null;
    if (step === 0) { q = bbqNew(); msg.textContent = "Five packets: priorities 1, 1, 2, 9, 9."; }
    else if (step <= 3) { hit = bbqDequeue(q); msg.textContent = `Removal ${step}: ` + bbqMessage(hit, false).replace("Removed the best packet: ", ""); }
    holder.innerHTML = bbqHTML(q, hit);
    step = (step + 1) % 5;
  };
  tick();
  setInterval(tick, 2600);
}

// ---------- the clock period ----------

const START_PS = { register: 0, "fifo flag": 500, memory: 1000 };
const periodPs = (luts, start = "register") => 300 + START_PS[start] + 500 * luts;

function demoClock(el) {
  const presets = [
    ["Reference, small trees", "memory", 3],
    ["Gemini 4 Argon", "memory", 1],
    ["Claude Opus 5.5", "register", 3],
  ];
  el.innerHTML = `<div class="svgbox stretch"></div>
    <div class="controls">
      <label>starts at <select class="start">${Object.keys(START_PS).map((s) => `<option${s === "memory" ? " selected" : ""}>${s}</option>`).join("")}</select></label>
      <label>LUTs <input class="luts" type="range" min="1" max="8" value="3"><b class="nl mono">3</b></label>
    </div>
    <div class="controls">${presets.map(([n], k) => `<button class="cbtn pre" data-k="${k}">${n}</button>`).join("")}</div>
    <div class="stats"></div>
    <p class="hint">Operations per second at 0.68 operations per cycle. The reference runs at 2,800 ps on the three smallest trees.</p>`;
  const sel = el.querySelector(".start"), rng = el.querySelector(".luts");
  const draw = () => {
    const n = +rng.value, start = sel.value, p = periodPs(n, start);
    el.querySelector(".nl").textContent = n;
    const boxes = [start === "register" ? "register" : start === "memory" ? "memory" : "FIFO flag", ...Array(n).fill("LUT"), "register"];
    const w = 64, gap = 18, W = boxes.length * (w + gap) - gap + 20;
    el.querySelector(".stretch").innerHTML = `<svg viewBox="0 0 ${W} 70" role="img" aria-label="${n} lookup tables after a ${start}">
      ${boxes.map((b, k) => {
        const x = 10 + k * (w + gap), lut = b === "LUT";
        return `<rect x="${x}" y="14" width="${w}" height="34" rx="6" fill="${lut ? "var(--teal-soft)" : "var(--card)"}" stroke="${lut ? "var(--teal)" : "var(--stone)"}"/>
          <text x="${x + w / 2}" y="35" text-anchor="middle" font-size="${b.length > 7 ? 10 : 12}" fill="var(--ink)">${b}</text>
          ${k < boxes.length - 1 ? `<line x1="${x + w}" y1="31" x2="${x + w + gap}" y2="31" stroke="var(--stone)"/>` : ""}`;
      }).join("")}
      <text x="${W / 2}" y="66" text-anchor="middle" font-size="12" fill="var(--ink-2)">300 + ${START_PS[start]} + ${n} × 500 = ${p.toLocaleString("en-US")} ps</text></svg>`;
    const ops = 0.68 / (p * 1e-12);
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>period</small><b>${p.toLocaleString("en-US")} ps</b></div>
      <div class="stat"><small>clock</small><b>${(1e6 / p).toFixed(0)} MHz</b></div>
      <div class="stat"><small>operations / s</small><b>${(ops / 1e8).toFixed(2)}×10⁸</b></div>
      <div class="stat ${p < 2800 ? "good" : p > 2800 ? "bad" : ""}"><small>vs 2,800 ps</small><b>${(2800 / p).toFixed(2)}×</b></div>`;
  };
  sel.onchange = draw; rng.oninput = draw;
  el.querySelectorAll(".pre").forEach((b) => {
    b.onclick = () => { const [, s, n] = presets[+b.dataset.k]; sel.value = s; rng.value = n; draw(); };
  });
  draw();
}

// ---------- MetaOpt: an exact gap on a four-site network ----------

const NET_CAP = { AB: 12, BC: 12, AD: 12, CD: 12, BD: 6 };
const NET_PATHS = {
  "A>C": [["AB", "BC"], ["AD", "CD"]],
  "A>B": [["AB"], ["AD", "BD"]],
  "B>C": [["BC"], ["BD", "CD"]],
  "A>D": [["AD"], ["AB", "BD"]],
  "D>C": [["CD"], ["BD", "BC"]],
};
const NET_PAIRS = Object.keys(NET_PATHS);
const NET_GROUPS = [["A>C", "A>D"], ["A>B", "B>C", "D>C"]];

// Maximise c.x with A x <= b, x >= 0, b >= 0 (Bland's rule; floats, small LPs only).
function simplexMax(c, A, b) {
  const m = A.length, n = c.length, eps = 1e-9;
  const T = A.map((row, i) => [...row, ...Array.from({ length: m }, (_, j) => +(i === j)), b[i]]);
  let z = [...c.map((v) => -v), ...Array(m + 1).fill(0)];
  const basis = Array.from({ length: m }, (_, i) => n + i);
  for (let iter = 0; iter < 500; iter++) {
    const col = z.slice(0, n + m).findIndex((v) => v < -eps);
    if (col < 0) return z[n + m];
    let r = -1, best = null;
    for (let i = 0; i < m; i++) {
      if (T[i][col] > eps) {
        const ratio = T[i][n + m] / T[i][col];
        if (best === null || ratio < best[0] - eps || (Math.abs(ratio - best[0]) <= eps && basis[i] < best[1])) { best = [ratio, basis[i]]; r = i; }
      }
    }
    const p = T[r][col];
    T[r] = T[r].map((v) => v / p);
    for (let i = 0; i < m; i++) if (i !== r && Math.abs(T[i][col]) > eps) { const f = T[i][col]; T[i] = T[i].map((v, j) => v - f * T[r][j]); }
    const f = z[col];
    z = z.map((v, j) => v - f * T[r][j]);
    basis[r] = col;
  }
  return z[n + m];
}

function netMaxFlow(demand, cap) {
  const cols = [];
  NET_PAIRS.forEach((p) => { if ((demand[p] || 0) > 0) NET_PATHS[p].forEach((path) => cols.push([p, path])); });
  if (!cols.length) return 0;
  const A = [], b = [];
  NET_PAIRS.forEach((p) => { if ((demand[p] || 0) > 0) { A.push(cols.map(([q]) => +(q === p))); b.push(demand[p]); } });
  Object.entries(cap).forEach(([e, c]) => { A.push(cols.map(([, path]) => +path.includes(e))); b.push(c); });
  return simplexMax(cols.map(() => 1), A, b);
}
const netOpt = (d) => netMaxFlow(d, NET_CAP);
function netPop(d) {
  const share = Object.fromEntries(Object.entries(NET_CAP).map(([e, c]) => [e, c / NET_GROUPS.length]));
  return NET_GROUPS.reduce((s, g) => s + netMaxFlow(Object.fromEntries(g.map((p) => [p, d[p]])), share), 0);
}
function netDp(d, small = 6) {
  const rest = { ...NET_CAP };
  let pinned = 0;
  NET_PAIRS.forEach((p) => {
    if (d[p] > 0 && d[p] <= small) { NET_PATHS[p][0].forEach((e) => { rest[e] -= d[p]; }); pinned += d[p]; }
  });
  if (Object.values(rest).some((c) => c < -1e-9)) return null;
  const big = Object.fromEntries(NET_PAIRS.filter((p) => d[p] > small).map((p) => [p, d[p]]));
  return { value: pinned + netMaxFlow(big, rest), rest };
}
const r1 = (x) => Math.round(x * 1e6) / 1e6;

const NODE_XY = { A: [70, 50], B: [330, 50], C: [330, 210], D: [70, 210] };

function netSVG(d, dp) {
  const edges = Object.keys(NET_CAP).map((e) => {
    const [a, b] = [NODE_XY[e[0]], NODE_XY[e[1]]];
    const used = dp ? NET_CAP[e] - dp.rest[e] : 0;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = e === "BD" ? 18 : e === "AB" || e === "CD" ? 0 : e === "AD" ? -22 : 22;
    const dy = e === "AB" ? -12 : e === "CD" ? 22 : e === "BD" ? -6 : 4;
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${used ? "var(--amber)" : "var(--stone)"}" stroke-width="${used ? 2 + used / 2 : 2}" stroke-linecap="round"/>
      <text x="${mx + dx}" y="${my + dy}" text-anchor="middle" font-size="12" fill="var(--ink-2)">${e} ${used ? `${used}/` : ""}${NET_CAP[e]}</text>`;
  }).join("");
  const nodes = Object.entries(NODE_XY).map(([n, [x, y]]) =>
    `<circle cx="${x}" cy="${y}" r="17" fill="var(--teal)"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" font-weight="600" fill="var(--paper)">${n}</text>`).join("");
  return `<svg viewBox="0 0 400 250" role="img" aria-label="Four sites A, B, C, D and five links">${edges}${nodes}</svg>`;
}

function demoMetaOpt(el) {
  const d = { "A>C": 6, "A>B": 18, "B>C": 0, "A>D": 0, "D>C": 0 };
  el.innerHTML = `<div class="mo-grid"><div class="svgbox net"></div><div class="mo-pairs"></div></div>
    <div class="stats"></div>
    <div class="controls"><button class="cbtn on search">Try all 243 matrices</button><button class="cbtn clear">All zero</button></div>
    <div class="msg"></div>`;
  const pairsEl = el.querySelector(".mo-pairs"), msg = el.querySelector(".msg");
  const draw = () => {
    pairsEl.innerHTML = `<small class="mono">DEMAND PER PAIR</small>` + NET_PAIRS.map((p) => `<div class="mo-pair"><b class="mono">${p}</b>
      ${[0, 6, 18].map((v) => `<button class="cbtn lvl${d[p] === v ? " on" : ""}" data-p="${p}" data-v="${v}">${v}</button>`).join("")}</div>`).join("");
    pairsEl.querySelectorAll(".lvl").forEach((b) => { b.onclick = () => { d[b.dataset.p] = +b.dataset.v; draw(); }; });
    const dp = netDp(d), o = netOpt(d), p = netPop(d);
    el.querySelector(".net").innerHTML = netSVG(d, dp);
    const comb = Math.max(p, dp ? dp.value : -Infinity), g = o - comb;
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>OPT</small><b>${r1(o)}</b></div>
      <div class="stat"><small>POP</small><b>${r1(p)}</b></div>
      <div class="stat"><small>DP</small><b>${dp ? r1(dp.value) : "—"}</b></div>
      <div class="stat ${g > 0 ? "good" : ""}"><small>gap</small><b>${dp ? r1(g) : "invalid"}</b></div>`;
    if (!msg.dataset.keep) msg.textContent = "Amber links carry pinned demands (pinned load / capacity). The gap is OPT − max(POP, DP).";
    delete msg.dataset.keep;
  };
  el.querySelector(".search").onclick = () => {
    let best = null;
    const levels = [0, 6, 18];
    for (let k = 0; k < 243; k++) {
      const v = NET_PAIRS.map((_, i) => levels[Math.floor(k / 3 ** (NET_PAIRS.length - 1 - i)) % 3]);
      const t = Object.fromEntries(NET_PAIRS.map((p, i) => [p, v[i]]));
      const dp = netDp(t);
      if (!dp) continue;
      const g = netOpt(t) - Math.max(netPop(t), dp.value);
      const nz = v.filter((x) => x > 0).length;
      if (!best || g > best.g + 1e-9 || (Math.abs(g - best.g) <= 1e-9 && nz < best.nz)) best = { g, t, nz };
    }
    Object.assign(d, best.t);
    msg.dataset.keep = "1";
    msg.textContent = `Searched all 243 matrices. The largest gap is ${r1(best.g)}, with the fewest nonzero demands shown. The task has about 3.1 billion matrices per instance and 256 exact checks.`;
    draw();
  };
  el.querySelector(".clear").onclick = () => { NET_PAIRS.forEach((p) => { d[p] = 0; }); draw(); };
  draw();
}

// ---------- Shockwave: a round-based scheduler on four GPUs ----------

const ROUND_S = 120, GPU_N = 4;
const SCHED_JOBS = [
  ["LM", 1, 0, [300, 300, 200, 200]],
  ["ResNet", 2, 0, [400, 400, 400]],
  ["Rec", 4, 0, [240, 240, 120]],
  ["Trans", 1, 120, [600, 300]],
  ["ViT", 2, 240, [360, 240, 120]],
  ["A3C", 1, 360, [240, 240]],
];
const sumArr = (a) => a.reduce((s, x) => s + x, 0);
const FAIR_SHARE = Math.max(1, SCHED_JOBS.length / GPU_N);

const POLICIES = {
  FIFO: (live) => live.map((j) => j[0]),
  SRTF: (live, left) => [...live].sort((a, b) => left[a[0]] - left[b[0]]).map((j) => j[0]),
  Fairest: (live, left, t) => [...live].sort((a, b) =>
    (t + ROUND_S - b[2] + left[b[0]]) / (sumArr(b[3]) * FAIR_SHARE) - (t + ROUND_S - a[2] + left[a[0]]) / (sumArr(a[3]) * FAIR_SHARE)).map((j) => j[0]),
};

function schedSimulate(policy) {
  const left = Object.fromEntries(SCHED_JOBS.map((j) => [j[0], sumArr(j[3])]));
  const gpus = Object.fromEntries(SCHED_JOBS.map((j) => [j[0], j[1]]));
  const done = {}, rounds = [];
  let t = 0;
  while (Object.keys(done).length < SCHED_JOBS.length) {
    const live = SCHED_JOBS.filter((j) => j[2] <= t && !(j[0] in done));
    let used = 0;
    const slots = [];
    for (const name of policy(live, left, t)) {
      if (used + gpus[name] > GPU_N) continue;
      for (let k = 0; k < gpus[name]; k++) slots.push([name, Math.min(left[name], ROUND_S)]);
      used += gpus[name];
      if (left[name] <= ROUND_S) done[name] = t + left[name];
      left[name] = Math.max(0, left[name] - ROUND_S);
    }
    rounds.push(slots);
    t += ROUND_S;
  }
  const jct = Object.fromEntries(SCHED_JOBS.map((j) => [j[0], done[j[0]] - j[2]]));
  const rho = Object.fromEntries(SCHED_JOBS.map((j) => [j[0], jct[j[0]] / (sumArr(j[3]) * FAIR_SHARE)]));
  return {
    rounds, rho,
    makespan: Math.max(...Object.values(done)),
    avg: Math.round(sumArr(Object.values(jct)) / SCHED_JOBS.length),
    worst: Math.round(Math.max(...Object.values(rho)) * 100) / 100,
    unfair: Object.values(rho).filter((r) => r > 1.05).length,
  };
}

function demoSched(el) {
  let cur = "FIFO";
  const res = Object.fromEntries(Object.keys(POLICIES).map((k) => [k, schedSimulate(POLICIES[k])]));
  const bestOf = (key) => Math.min(...Object.values(res).map((r) => r[key]));
  el.innerHTML = `<div class="controls">${Object.keys(POLICIES).map((k) => `<button class="cbtn pol" data-k="${k}">${k}</button>`).join("")}</div>
    <div class="svgbox gantt"></div><div class="legend"></div><div class="sched-table"></div>`;
  el.querySelector(".legend").innerHTML = SCHED_JOBS.map((j, k) =>
    `<span><i style="background:${JOB_COLORS[k]}"></i>${j[0]} · ${j[1]} GPU${j[1] > 1 ? "s" : ""} · arrives ${j[2]} s</span>`).join("");
  const draw = () => {
    el.querySelectorAll(".pol").forEach((b) => b.classList.toggle("on", b.dataset.k === cur));
    const r = res[cur], n = r.rounds.length, cw = 640 / 22, x0 = 46;
    const W = x0 + 22 * cw + 10;
    let svg = `<svg viewBox="0 0 ${W} 150" role="img" aria-label="Which job runs on each GPU in each round">`;
    for (let g = 0; g < GPU_N; g++) svg += `<text x="4" y="${26 + g * 28}" font-size="11" fill="var(--ink-2)">GPU ${g}</text>`;
    r.rounds.forEach((slots, k) => slots.forEach(([name, secs], g) => {
      const col = JOB_COLORS[SCHED_JOBS.findIndex((j) => j[0] === name)];
      svg += `<rect x="${x0 + k * cw + 1}" y="${10 + g * 28}" width="${(cw - 2) * secs / ROUND_S}" height="22" rx="3" fill="${col}"/>`;
    }));
    for (let k = 0; k <= 22; k += 4) svg += `<text x="${x0 + k * cw}" y="138" font-size="10" text-anchor="middle" fill="var(--stone)">${k * ROUND_S}</text>`;
    svg += `<line x1="${x0 + (r.makespan / ROUND_S) * cw}" y1="6" x2="${x0 + (r.makespan / ROUND_S) * cw}" y2="124" stroke="var(--ink)" stroke-dasharray="3 3"/>
      <text x="${x0 + (r.makespan / ROUND_S) * cw - 4}" y="124" font-size="10" text-anchor="end" fill="var(--ink)">makespan ${r.makespan} s</text></svg>`;
    el.querySelector(".gantt").innerHTML = svg + `<small class="mono" style="color:var(--stone)">seconds · ${n} rounds of 120 s</small>`;
    const cell = (k, key, fmt = (v) => v) => {
      const v = res[k][key], win = v === bestOf(key);
      return `<td class="${win ? "win" : ""}">${fmt(v)}${win ? " ✓" : ""}</td>`;
    };
    el.querySelector(".sched-table").innerHTML = `<table><tr><th>Policy</th><th>Makespan (s)</th><th>Average JCT (s)</th><th>Worst ρ</th><th>Unfair jobs</th></tr>
      ${Object.keys(POLICIES).map((k) => `<tr class="${k === cur ? "cur" : ""}"><td><b>${k}</b></td>${cell(k, "makespan")}${cell(k, "avg")}${cell(k, "worst", (v) => v.toFixed(2))}${cell(k, "unfair", (v) => `${v} of 6`)}</tr>`).join("")}</table>
      <p class="hint">✓ marks the best value in each column; lower is better everywhere. No policy has all four.</p>`;
  };
  el.querySelectorAll(".pol").forEach((b) => { b.onclick = () => { cur = b.dataset.k; draw(); }; });
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
  bbq: (el) => demoBBQ(el),
  bbqMini: (el) => demoBBQMini(el),
  clock: (el) => demoClock(el),
  metaopt: (el) => demoMetaOpt(el),
  sched: (el) => demoSched(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
