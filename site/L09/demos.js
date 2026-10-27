// L09 demos. The JS models repeat the Python programs in frontiercs2/notes/L09-programming-languages.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

// ---------- the e-graph (Egg chapter, reused by BABBLE) ----------

// A node is [op, ...child class ids]; its memo key is the JSON text.
const nodeKey = (node) => JSON.stringify(node);

class EGraph {
  constructor() {
    this.parent = []; this.memo = new Map(); this.nodes = new Map(); this.uses = new Map();
    this.pending = []; this.work = 0;
  }
  find(a) { while (this.parent[a] !== a) a = this.parent[a]; return a; }
  canon(node) { return [node[0], ...node.slice(1).map((c) => this.find(c))]; }
  add(node) {
    node = this.canon(node);
    const k = nodeKey(node);
    if (this.memo.has(k)) return this.find(this.memo.get(k));
    const a = this.parent.length;
    this.parent.push(a);
    this.memo.set(k, a); this.nodes.set(a, [node]); this.uses.set(a, []);
    [...new Set(node.slice(1))].sort((x, y) => x - y).forEach((c) => this.uses.get(c).push([node, a]));
    return a;
  }
  union(a, b) {
    a = this.find(a); b = this.find(b);
    if (a === b) return false;
    if (b < a) [a, b] = [b, a];
    this.parent[b] = a;
    this.nodes.set(a, this.nodes.get(a).concat(this.nodes.get(b))); this.nodes.delete(b);
    this.uses.set(a, this.uses.get(a).concat(this.uses.get(b))); this.uses.delete(b);
    this.pending.push(a);   // rebuild() restores the invariants later
    return true;
  }
  classes() { return this.nodes.size; }
  repair(a) {
    const parents = this.uses.get(a); this.uses.set(a, []);   // take the list: unions below may add to it
    const seen = new Map();   // key -> [node, class]
    for (const [node0, cls] of parents) {
      this.work++;
      this.memo.delete(nodeKey(node0));
      const node = this.canon(node0), k = nodeKey(node);
      if (seen.has(k)) this.union(cls, seen.get(k)[1]);
      const root = this.find(cls);
      this.memo.set(k, root); seen.set(k, [node, root]);   // like a Python dict: keeps its first position
    }
    const r = this.find(a);
    this.uses.set(r, this.uses.get(r).concat([...seen.values()]));
  }
  rebuild() {
    while (this.pending.length) {
      const todo = [...new Set(this.pending.map((a) => this.find(a)))].sort((x, y) => x - y);
      this.pending = [];
      todo.forEach((a) => { if (this.find(a) === a) this.repair(a); });   // merged earlier this round: its root is queued
    }
    for (const [a, list] of this.nodes) {
      const uniq = new Map(list.map((n) => this.canon(n)).map((n) => [nodeKey(n), n]));
      this.nodes.set(a, [...uniq.entries()].sort((x, y) => cmpNode(x[1], y[1])).map((e) => e[1]));
    }
  }
}
// Python sorts tuples element by element: strings by code point, ids as numbers.
function cmpNode(x, y) {
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}
// A term is a nested array like ["+", ["a"], ["b"]].
const addTerm = (g, t) => g.add([t[0], ...t.slice(1).map((k) => addTerm(g, k))]);

function batch(n, deferred) {
  const g = new EGraph();
  const xs = Array.from({ length: n }, (_, i) => addTerm(g, [`x${i}`]));
  for (let j = 0; j < n; j++) { addTerm(g, [`h${j}`, ["x0"]]); addTerm(g, [`h${j}`, [`x${j}`]]); }
  xs.slice(1).forEach((x) => { g.union(xs[0], x); if (!deferred) g.rebuild(); });   // the old way: rebuild after every union
  g.rebuild();
  return [g.classes(), g.work];
}

// Demo 1: congruence step by step.
function demoEgraph(el, { auto = false } = {}) {
  const names = ["a", "b", "c", "2"];
  let g, ids, step;
  const reset = () => {
    g = new EGraph(); step = 0;
    ids = {};
    ["b", "c"].forEach((x) => { ids[x] = addTerm(g, [x]); });
    ids.ab = addTerm(g, ["*", ["+", ["a"], ["b"]], ["2"]]);
    ids.ac = addTerm(g, ["*", ["+", ["a"], ["c"]], ["2"]]);
  };
  const label = (node) => names.includes(node[0]) ? node[0] : `${node[0]}(${node.slice(1).map((c) => "c" + g.find(c)).join(", ")})`;
  el.innerHTML = `${auto ? "" : `<p class="hint" style="margin-top:0">The e-graph of <code>(a + b) * 2</code> and <code>(a + c) * 2</code>. Merge <code>b</code> and <code>c</code>, then rebuild.</p>`}
    <div class="eg-classes"></div><div class="stats"></div>
    ${auto ? "" : `<div class="controls"><button class="cbtn on u">1 · union b = c</button><button class="cbtn r">2 · rebuild</button><button class="cbtn x">Reset</button></div>`}
    <div class="msg"></div>`;
  const msg = el.querySelector(".msg");
  const draw = () => {
    const same = g.find(ids.ab) === g.find(ids.ac);
    const hot = new Set(g.pending.map((a) => g.find(a)));
    el.querySelector(".eg-classes").innerHTML = [...g.nodes.keys()].sort((x, y) => x - y).map((a) => {
      const prod = a === g.find(ids.ab) || a === g.find(ids.ac);
      return `<div class="eg-class${hot.has(a) ? " hot" : ""}${prod && same ? " merged" : ""}"><small>c${a}</small>${g.nodes.get(a).map((n) => `<span class="eg-node">${label(n)}</span>`).join("")}</div>`;
    }).join("");
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>classes</small><b>${g.classes()}</b></div>
      <div class="stat ${g.pending.length ? "bad" : "good"}"><small>pending repairs</small><b>${g.pending.length}</b></div>
      <div class="stat ${same ? "good" : ""}"><small>products equal?</small><b>${same ? "yes" : "no"}</b></div>`;
    if (!auto) {
      el.querySelector(".u").disabled = step !== 0;
      el.querySelector(".r").disabled = step !== 1;
      el.querySelector(".u").classList.toggle("on", step === 0);
      el.querySelector(".r").classList.toggle("on", step === 1);
    }
    msg.className = "msg" + (step === 2 ? " good" : "");
    msg.textContent = ["Eight classes: a, b, c and 2 are stored once each.",
      "b and c now share class c" + g.find(ids.b) + ", but the two sums still sit in different classes: congruence is broken until a rebuild (highlighted: the pending class).",
      "Rebuild repaired the parents of the merged class: the two sums became the same node, so they merged, and then the two products did too."][step];
  };
  const doStep = () => {
    if (step === 0) g.union(ids.b, ids.c);
    else if (step === 1) g.rebuild();
    step++; draw();
  };
  reset(); draw();
  if (auto) setInterval(() => { if (step === 2) reset(); else doStep(); draw(); }, 2200);
  else {
    el.querySelector(".u").onclick = doStep;
    el.querySelector(".r").onclick = doStep;
    el.querySelector(".x").onclick = () => { reset(); draw(); };
  }
}

// Demo 2: work, immediate vs deferred.
function demoBatch(el) {
  const NS = [4, 8, 16, 32, 64, 128, 256];
  el.innerHTML = `<div class="controls"><label>n <input class="n" type="range" min="0" max="${NS.length - 1}" value="2"><b class="mono vn"></b></label></div>
    <div class="bars"></div><div class="stats"></div>
    <p class="hint">A class with n parents is merged n − 1 times in one batch. Work = parent entries repaired.</p>`;
  const draw = () => {
    const n = NS[+el.querySelector(".n").value];
    el.querySelector(".vn").textContent = n;
    const [k1, w1] = batch(n, false), [k2, w2] = batch(n, true);
    const bar = (lab, w, cls) => `<div class="eg-bar"><span>${lab}</span><i class="${cls}" style="width:${Math.max(0.5, (100 * w) / w1)}%"></i><b class="mono">${w.toLocaleString("en-US")}</b></div>`;
    el.querySelector(".bars").innerHTML = bar("repair after every union", w1, "imm") + bar("repair once per batch", w2, "def");
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>classes (both)</small><b>${k1 === k2 ? k1 : "?"}</b></div>
      <div class="stat good"><small>deferred saves</small><b>${(w1 / w2).toFixed(1)}×</b></div>`;
  };
  el.querySelector(".n").oninput = draw;
  draw();
}

// ---------- BABBLE ----------

function parse(text) {
  const tokens = text.replace(/\(/g, " ( ").replace(/\)/g, " ) ").trim().split(/\s+/);
  const read = (i) => {
    if (tokens[i] !== "(") return [[tokens[i]], i + 1];
    const op = tokens[i + 1]; i += 2;
    const kids = [];
    while (tokens[i] !== ")") { const [kid, j] = read(i); kids.push(kid); i = j; }
    return [[op, ...kids], i + 1];
  };
  return read(0)[0];
}
const show = (t) => (t.length === 1 ? t[0] : "(" + [t[0], ...t.slice(1).map(show)].join(" ") + ")");
const size = (t) => 1 + t.slice(1).reduce((s, k) => s + size(k), 0);
const PROGRAMS = [
  "(repeat 4 (seq (move 10) (turn 90)))",
  "(repeat 3 (seq (move 10) (turn 120)))",
  "(seq (repeat 6 (seq (move 5) (turn 60))) (move 20))",
  "(seq (move 20) (repeat 8 (seq (move 5) (turn 45))))",
];
const CORPUS = PROGRAMS.map(parse);
const LIB = new EGraph();
const ROOTS = CORPUS.map((p) => addTerm(LIB, p));

const termOf = (g, a) => { const n = g.nodes.get(a)[0]; return [n[0], ...n.slice(1).map((c) => termOf(g, c))]; };
function antiUnify(g, a, b, holes) {
  if (a === b) return termOf(g, a);
  const na = g.nodes.get(a)[0], nb = g.nodes.get(b)[0];
  if (na[0] === nb[0] && na.length === nb.length) return [na[0], ...na.slice(1).map((x, i) => antiUnify(g, x, nb[i + 1], holes))];
  const k = a + "," + b;
  if (!holes.has(k)) holes.set(k, "?" + "xyzuvw"[holes.size]);
  return [holes.get(k)];
}
const isHole = (t) => t[0].startsWith("?");
const holesIn = (t) => (isHole(t) ? new Set([t[0]]) : new Set(t.slice(1).flatMap((k) => [...holesIn(k)])));
function match(pat, t, env) {
  if (isHole(pat)) {
    if (!env.has(pat[0])) env.set(pat[0], t);
    return show(env.get(pat[0])) === show(t) ? env : null;
  }
  if (pat[0] !== t[0] || pat.length !== t.length) return null;
  for (let i = 1; i < pat.length; i++) if (match(pat[i], t[i], env) === null) return null;
  return env;
}
function rewrite(t, pat, name) {
  const env = match(pat, t, new Map());
  if (env !== null) return [name, ...[...env.keys()].sort().map((h) => rewrite(env.get(h), pat, name))];
  return [t[0], ...t.slice(1).map((k) => rewrite(k, pat, name))];
}
const costWith = (pat) => size(pat) + CORPUS.reduce((s, p) => s + size(rewrite(p, pat, "f")), 0);
const pyCmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
function rankCandidates(maxHoles) {
  const ids = [...LIB.nodes.keys()].sort((x, y) => x - y), cands = new Map();
  ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => {
    const pat = antiUnify(LIB, a, b, new Map());
    if (pat.length > 1 && holesIn(pat).size <= maxHoles) cands.set(show(pat), pat);
  }));
  return [...cands.values()].map((p) => ({ p, cost: costWith(p), s: show(p) }))
    .sort((x, y) => x.cost - y.cost || pyCmp(x.s, y.s));
}

function demoAU(el) {
  const opts = PROGRAMS.map((p, i) => `<option value="${i}">${i + 1} · ${p}</option>`).join("");
  el.innerHTML = `<div class="au-pick"><label>program <select class="pa">${opts}</select></label>
      <label>program <select class="pb">${opts}</select></label></div>
    <div class="au-out mono"></div>
    <div class="controls"><label>holes allowed <select class="mh"><option>1</option><option selected>2</option><option>3</option></select></label><button class="cbtn on learn">Learn one function</button></div>
    <div class="au-lib"></div><div class="msg"></div>`;
  el.querySelector(".pb").value = "1";
  const pair = () => {
    const a = +el.querySelector(".pa").value, b = +el.querySelector(".pb").value;
    const pat = antiUnify(LIB, ROOTS[a], ROOTS[b], new Map());
    el.querySelector(".au-out").innerHTML = `pattern: <b>${show(pat).replace(/\?[a-z]/g, (h) => `<span class="hole">${h}</span>`)}</b> <small>(${holesIn(pat).size} hole${holesIn(pat).size === 1 ? "" : "s"})</small>`;
  };
  const learn = () => {
    const ranked = rankCandidates(+el.querySelector(".mh").value), best = ranked[0];
    const before = CORPUS.reduce((s, p) => s + size(p), 0);
    el.querySelector(".au-lib").innerHTML = `<table class="au-table"><tr><th>cost</th><th>candidate</th></tr>${ranked.slice(0, 4).map((r, i) =>
      `<tr${i === 0 ? ' class="best"' : ""}><td class="mono">${r.cost}</td><td class="mono">${r.s}</td></tr>`).join("")}</table>
      <div class="au-rw">${CORPUS.map((p) => `<div class="mono">${show(rewrite(p, best.p, "f"))}</div>`).join("")}</div>`;
    const msg = el.querySelector(".msg");
    msg.className = "msg good";
    msg.textContent = `${ranked.length} candidates. f = ${best.s}: cost ${before} → ${best.cost}, ratio ${(before / best.cost).toFixed(3)}, reduction ${(100 * (1 - best.cost / before)).toFixed(1)}%.`;
  };
  el.querySelectorAll(".pa, .pb").forEach((s) => { s.onchange = pair; });
  el.querySelector(".mh").onchange = learn;
  el.querySelector(".learn").onclick = learn;
  pair();
}

// ---------- Polygon ----------

// A result is a map customer -> count; equal maps mean equal bags of rows.
function sqlAnswer(visits, trans) {
  const groups = new Map();
  for (const [visitId, customer] of visits) {
    const amounts = trans.filter((t) => t[1] === visitId).map((t) => t[2]);
    for (const amount of amounts.length ? amounts : [null]) {
      if (amount === null) groups.set(customer, (groups.get(customer) || 0) + (customer !== null ? 1 : 0));
    }
  }
  return groups;
}
function sqlReference(visits, trans) {
  const used = new Set(trans.map((t) => t[1])), groups = new Map();
  for (const [visitId, customer] of visits) if (!used.has(visitId)) groups.set(customer, (groups.get(customer) || 0) + 1);
  return groups;
}
const sameResult = (x, y) => x.size === y.size && [...x].every(([k, v]) => y.has(k) && y.get(k) === v);
function product(lists) { return lists.reduce((acc, l) => acc.flatMap((a) => l.map((x) => [...a, x])), [[]]); }
const power = (rows, n) => product(Array(n).fill(rows));

function sqlSearch(bound, customers = [7, null], amounts = [5, null]) {
  let tried = 0;
  const visitRows = product([[1, 2], customers]), transRows = product([[1, 2], [1, 2], amounts]);
  for (let total = 0; total <= 2 * bound; total++) {
    for (let nv = 0; nv <= Math.min(total, bound); nv++) {
      const nt = total - nv;
      if (nt > bound) continue;
      for (const visits of power(visitRows, nv)) {
        for (const trans of power(transRows, nt)) {
          const ids = visits.map((v) => v[0]);
          if (new Set(ids).size < nv || new Set(trans.map((t) => t[0])).size < nt) continue;
          if (trans.some((t) => !ids.includes(t[1]))) continue;
          tried++;
          if (!sameResult(sqlAnswer(visits, trans), sqlReference(visits, trans))) return [tried, visits, trans];
        }
      }
    }
  }
  return [tried, null, null];
}

function demoPolygon(el) {
  el.innerHTML = `<div class="controls"><label><input type="checkbox" class="nc" checked> NULL customer allowed</label>
      <label><input type="checkbox" class="na" checked> NULL amount allowed</label>
      <button class="cbtn on go">Search (at most 2 rows per table)</button></div>
    <div class="pg-db"></div><div class="stats"></div><div class="msg"></div>`;
  const fmt = (v) => (v === null ? '<span class="null">NULL</span>' : v);
  const table = (title, head, rows) => `<div class="pg-t"><small>${title}</small><table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${rows.length ? rows.map((r) => `<tr>${r.map((v) => `<td>${fmt(v)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${head.length}" class="empty">no rows</td></tr>`}</table></div>`;
  const result = (m) => (m.size ? [...m].map(([k, v]) => `(${k === null ? "NULL" : k}, ${v})`).join(" ") : "no rows");
  const go = () => {
    const customers = el.querySelector(".nc").checked ? [7, null] : [7], amounts = el.querySelector(".na").checked ? [5, null] : [5];
    const [tried, visits, trans] = sqlSearch(2, customers, amounts), msg = el.querySelector(".msg");
    el.querySelector(".stats").innerHTML = `<div class="stat"><small>databases tried</small><b>${tried}</b></div>
      <div class="stat ${visits ? "good" : "bad"}"><small>counterexample</small><b>${visits ? "found" : "none"}</b></div>`;
    if (visits) {
      el.querySelector(".pg-db").innerHTML = table("visits", ["visit_id", "customer_id"], visits) + table("transactions", ["transaction_id", "visit_id", "amount"], trans);
      msg.className = "msg good";
      msg.innerHTML = `Answer returns <b class="mono">${result(sqlAnswer(visits, trans))}</b>; reference returns <b class="mono">${result(sqlReference(visits, trans))}</b>.`;
    } else {
      el.querySelector(".pg-db").innerHTML = "";
      msg.className = "msg bad";
      msg.textContent = `The two queries agree on all ${tried} databases: without NULLs, this search cannot tell them apart.`;
    }
  };
  el.querySelector(".go").onclick = go;
  el.querySelectorAll("input").forEach((i) => { i.onchange = go; });
  go();
}

// ---------- Glenside: im2col ----------

function im2col(image, kh, kw, stride = 1) {
  const h = image.length, w = image[0].length, rows = [];
  for (let i = 0; i + kh <= h; i += stride) for (let j = 0; j + kw <= w; j += stride) {
    const row = [];
    for (let di = 0; di < kh; di++) for (let dj = 0; dj < kw; dj++) row.push(image[i + di][j + dj]);
    rows.push(row);
  }
  return rows;
}
const KERNEL = [1, 0, 0, -1];

function demoIm2col(el) {
  el.innerHTML = `<div class="controls"><label>image <select class="sz">${[3, 4, 5, 6].map((s) => `<option value="${s}">${s}×${s}</option>`).join("")}</select></label>
      <label>stride <select class="st"><option>1</option><option>2</option></select></label>
      <span class="hint">kernel 2×2 = [1, 0, 0, −1]; click a row</span></div>
    <div class="ic"><div class="ic-img"></div><div class="ic-mat"></div></div><div class="msg"></div>`;
  let pick = 0;
  const draw = () => {
    const n = +el.querySelector(".sz").value, stride = +el.querySelector(".st").value;
    const image = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => n * i + j + 1));
    const cols = im2col(image, 2, 2, stride), out = cols.map((r) => r.reduce((s, x, k) => s + KERNEL[k] * x, 0));
    const per = Math.floor((n - 2) / stride) + 1;
    if (pick >= cols.length) pick = 0;
    const pi = Math.floor(pick / per) * stride, pj = (pick % per) * stride;
    el.querySelector(".ic-img").innerHTML = `<small>image</small><div class="ic-grid" style="grid-template-columns:repeat(${n},1fr)">${image.flat().map((v, k) => {
      const i = Math.floor(k / n), j = k % n, on = i >= pi && i < pi + 2 && j >= pj && j < pj + 2;
      return `<span class="${on ? "on" : ""}">${v}</span>`;
    }).join("")}</div>`;
    el.querySelector(".ic-mat").innerHTML = `<small>im2col matrix (${cols.length} × 4) · kernel → output</small><div class="ic-rows">${cols.map((r, k) =>
      `<button class="ic-row${k === pick ? " on" : ""}" data-k="${k}"><span class="mono">[${r.join(", ")}]</span><b class="mono">${out[k]}</b></button>`).join("")}</div>`;
    el.querySelectorAll(".ic-row").forEach((b) => { b.onclick = () => { pick = +b.dataset.k; draw(); }; });
    const msg = el.querySelector(".msg");
    msg.className = "msg good";
    msg.textContent = `Output ${per}×${per} = [${out.join(", ")}]: one matrix-vector product, which a systolic array runs directly.`;
  };
  el.querySelectorAll("select").forEach((s) => { s.onchange = () => { pick = 0; draw(); }; });
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
  egraph: (el) => demoEgraph(el),
  egraphAuto: (el) => demoEgraph(el, { auto: true }),
  batch: (el) => demoBatch(el),
  au: (el) => demoAU(el),
  polygon: (el) => demoPolygon(el),
  im2col: (el) => demoIm2col(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
