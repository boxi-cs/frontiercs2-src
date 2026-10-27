// L06 demos. The JS models repeat the Python programs in frontiercs2/notes/L06-bioinformatics.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

// ---------- edit distance by dynamic programming ----------

const MATCH = 0, INSERT = 1, DELETE = 2, MISMATCH = 3;

// D[i][j] = edit distance between q[:i] and t[:j]. With hw = true the first row is all zeros.
function editTable(q, t, hw = false) {
  const m = q.length, n = t.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = hw ? 0 : j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j - 1] + (q[i - 1] !== t[j - 1] ? 1 : 0), d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }
  return d;
}

// Walk back from cell (i, j); with stopAtTop the walk ends on row 0 (a free target start).
function tracebackFrom(q, t, d, i, j, stopAtTop = false) {
  const ops = [], cells = [[i, j]];
  while (stopAtTop ? i > 0 : i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (q[i - 1] !== t[j - 1] ? 1 : 0)) {
      ops.push(q[i - 1] === t[j - 1] ? MATCH : MISMATCH);
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push(INSERT); i--;
    } else {
      ops.push(DELETE); j--;
    }
    cells.push([i, j]);
  }
  return { ops: ops.reverse(), cells, start: j };
}
const traceback = (q, t, d) => tracebackFrom(q, t, d, q.length, t.length).ops;

function cigar(ops) {
  const out = [];
  let k = 0;
  while (k < ops.length) {
    let r = k;
    while (r < ops.length && ops[r] === ops[k]) r++;
    out.push(`${r - k}${"=IDX"[ops[k]]}`);
    k = r;
  }
  return out.join("");
}

// The last row of the table, keeping only two rows at a time.
function lastRow(q, t, mode = "NW") {
  let prev = Array.from({ length: t.length + 1 }, (_, j) => (mode === "HW" ? 0 : j));
  for (let i = 1; i <= q.length; i++) {
    const row = [i], a = q[i - 1];
    for (let j = 1; j <= t.length; j++) {
      row.push(Math.min(prev[j - 1] + (a !== t[j - 1] ? 1 : 0), prev[j] + 1, row[j - 1] + 1));
    }
    prev = row;
  }
  return prev;
}

function distance(q, t, mode = "NW") {
  const row = lastRow(q, t, mode);
  if (mode === "NW") return [row[row.length - 1], [t.length - 1]];
  const best = Math.min(...row), ends = [];
  row.forEach((v, j) => { if (v === best) ends.push(j - 1); });
  return [best, ends];
}

// ---------- our DNA pairs ----------

// Park-Miller generator, exact in JavaScript (products stay below 2^53).
class Rng {
  constructor(seed) { this.state = seed; }
  below(n) { this.state = (this.state * 48271) % 2147483647; return this.state % n; }
}
function randomDna(n, rng) {
  let s = "";
  for (let i = 0; i < n; i++) s += "ACGT"[rng.below(4)];
  return s;
}
// Edit each base with probability 1 - similarity%: 60% substitution, 20% insertion, 20% deletion.
function mutate(seq, similarity, rng) {
  let out = "";
  for (const c of seq) {
    if (rng.below(100) < similarity) { out += c; continue; }
    const r = rng.below(10);
    if (r < 6) out += "ACGT"[("ACGT".indexOf(c) + 1 + rng.below(3)) % 4];
    else if (r < 8) out += c + "ACGT"[rng.below(4)];
  }
  return out;
}
let PAIRS = null;
function pairs() {
  if (PAIRS) return PAIRS;
  const rng = new Rng(6), target = randomDna(1000, rng), qs = {};
  for (const s of [99, 90, 80, 70, 60]) qs[s] = mutate(target, s, rng);
  return (PAIRS = { target, qs });
}

// ---------- Myers's bit-vector algorithm (BigInt plays Python's long word) ----------

function peq(q) {
  const masks = { A: 0n, C: 0n, G: 0n, T: 0n };
  for (let i = 0; i < q.length; i++) masks[q[i]] |= 1n << BigInt(i);
  return masks;
}
// Global edit distance; onColumn(j, letter, pv, mv, score) sees every column.
function myers(q, t, onColumn = null) {
  const m = BigInt(q.length), full = (1n << m) - 1n, high = 1n << (m - 1n), eqs = peq(q);
  let pv = full, mv = 0n, score = q.length;
  for (let j = 1; j <= t.length; j++) {
    const c = t[j - 1], eq = eqs[c];
    const xv = eq | mv;
    const xh = (((eq & pv) + pv) ^ pv) | eq;
    let ph = mv | (~(xh | pv) & full);
    let mh = pv & xh;
    score += ((ph & high) > 0n ? 1 : 0) - ((mh & high) > 0n ? 1 : 0);
    ph = ((ph << 1n) | 1n) & full;
    mh = (mh << 1n) & full;
    pv = mh | (~(xv | ph) & full);
    mv = ph & xv;
    if (onColumn) onColumn(j, c, pv, mv, score);
  }
  return score;
}
const bit = (x, i) => Number((x >> BigInt(i)) & 1n);

// ---------- the band ----------

function banded(q, t, k) {
  const m = q.length, n = t.length, far = 2 ** 30;
  let cells = 0;
  if (Math.abs(m - n) > k) return [null, 0];
  let prev = Array.from({ length: n + 1 }, (_, j) => (j <= k ? j : far));
  for (let i = 1; i <= m; i++) {
    const row = new Array(n + 1).fill(far);
    row[0] = i <= k ? i : far;
    for (let j = Math.max(1, i - k); j <= Math.min(n, i + k); j++) {
      if (Math.abs(i - j) + Math.abs(m - i - (n - j)) > k) continue;
      cells++;
      row[j] = Math.min(prev[j - 1] + (q[i - 1] !== t[j - 1] ? 1 : 0), prev[j] + 1, row[j - 1] + 1);
    }
    prev = row;
  }
  return [prev[n] <= k ? prev[n] : null, cells];
}
// Returns every attempt: [k, distance or null, cells].
function doubling(q, t, k = 64) {
  const tries = [];
  for (;;) {
    const [d, cells] = banded(q, t, k);
    tries.push([k, d, cells]);
    if (d !== null) return tries;
    k *= 2;
  }
}

// ---------- path recovery ----------

function tracebackBytes(m, n) {
  const blocks = Math.ceil(m / 64);
  return (2 * 8 + 4) * blocks * n + 2 * 4 * n;
}

const rev = (s) => [...s].reverse().join("");
function middle(q, t) {
  const mid = Math.floor(q.length / 2);
  const top = lastRow(q.slice(0, mid), t);
  const bottom = lastRow(rev(q.slice(mid)), rev(t)).reverse();
  const sums = top.map((a, j) => a + bottom[j]);
  return { mid, top, bottom, sums, j: sums.indexOf(Math.min(...sums)) };
}

// An optimal global alignment in linear memory; work counts cells and the longest row.
function hirschberg(q, t, work = { cells: 0, row: 0 }, record = null, q0 = 0, t0 = 0) {
  if (q.length <= 1 || t.length <= 1) {
    work.cells += q.length * t.length;
    const ops = traceback(q, t, editTable(q, t));
    if (record) record.push({ base: true, q0, t0, m: q.length, n: t.length, ops });
    return ops;
  }
  const md = middle(q, t);
  work.cells += q.length * t.length;
  work.row = Math.max(work.row, t.length + 1);
  if (record) record.push({ base: false, q0, t0, m: q.length, n: t.length, ...md });
  return hirschberg(q.slice(0, md.mid), t.slice(0, md.j), work, record, q0, t0)
    .concat(hirschberg(q.slice(md.mid), t.slice(md.j), work, record, q0 + md.mid, t0 + md.j));
}

function pathCost(q, t, ops) {
  let i = 0, j = 0, cost = 0;
  for (const op of ops) {
    if (op === MATCH || op === MISMATCH) {
      if (i >= q.length || j >= t.length || (q[i] === t[j]) !== (op === MATCH)) return null;
      cost += op === MISMATCH ? 1 : 0; i++; j++;
    } else if (op === INSERT) { cost++; i++; } else { cost++; j++; }
  }
  return i === q.length && j === t.length ? cost : null;
}

// ---------- the task's measurement and score ----------

function measured(reconMs, rng, baseMs = 6.0, jitterMs = 0.5, runs = 15) {
  const run = (extra) => baseMs + extra + (jitterMs * rng.below(1000)) / 1000;
  let path = Infinity, loc = Infinity;
  for (let r = 0; r < runs; r++) path = Math.min(path, run(reconMs));
  for (let r = 0; r < runs; r++) loc = Math.min(loc, run(0));
  return path - loc;
}
function scoreTerm(length, seconds) {
  const a = (length / 100000) ** 2;
  return (100 * a) / (a + seconds);
}

function diagonal(q, t) {
  const m = q.length, n = t.length;
  let far = new Map([[0, 0]]), d = 0, steps = 0;
  for (;;) {
    for (const [k, i0] of far) {
      let i = i0;
      while (i < m && i + k < n && q[i] === t[i + k]) { i++; steps++; }
      far.set(k, i);
    }
    if ((far.has(n - m) ? far.get(n - m) : -1) >= m) return [d, steps];
    d++;
    const next = new Map(), get = (k, dflt) => (far.has(k) ? far.get(k) : dflt);
    for (let k = -d; k <= d; k++) {
      let i = Math.max(get(k, -2) + 1, get(k + 1, -2) + 1, get(k - 1, -1));
      i = Math.min(i, m, n - k);
      steps++;
      if (i >= 0 && i + k >= 0) next.set(k, i);
    }
    far = next;
  }
}

// ---------- helpers ----------

const fmt = (x) => x.toLocaleString("en-US");
const clean = (s, max) => s.toUpperCase().replace(/[^ACGT]/g, "").slice(0, max);
const OPNAME = ["match", "insertion", "deletion", "mismatch"];

// A table as a CSS grid: header row and column with the letters, cell(i, j) gives [text, class].
function gridHTML(q, t, cell) {
  let h = `<div class="bi-grid" style="--cols:${t.length + 2}"><span class="h"></span><span class="h">·</span>`;
  for (const c of t) h += `<span class="h">${c}</span>`;
  for (let i = 0; i <= q.length; i++) {
    h += `<span class="h">${i ? q[i - 1] : "·"}</span>`;
    for (let j = 0; j <= t.length; j++) {
      const [text, cls] = cell(i, j);
      h += `<span class="${cls}">${text}</span>`;
    }
  }
  return h + "</div>";
}

// ---------- Demo 1: the edit table ----------

function demoTable(el) {
  el.innerHTML = `<div class="controls bi-inputs">
      <label>query <input class="q" type="text" value="ACGT" maxlength="12" spellcheck="false"></label>
      <label>target <input class="t" type="text" value="ACCT" maxlength="14" spellcheck="false"></label></div>
    <div class="controls"><button class="cbtn on" data-m="NW">NW global</button><button class="cbtn" data-m="SHW">SHW prefix</button><button class="cbtn" data-m="HW">HW infix</button>
      <span class="spacer"></span><button class="cbtn ex">GATTACA / GCATGCA</button></div>
    <div class="bi-box"></div><div class="stats"></div><div class="msg"></div>`;
  let mode = "NW";
  const draw = () => {
    const q = clean(el.querySelector(".q").value, 12), t = clean(el.querySelector(".t").value, 14);
    const box = el.querySelector(".bi-box"), msg = el.querySelector(".msg");
    if (!q || !t) {
      box.innerHTML = ""; el.querySelector(".stats").innerHTML = "";
      msg.className = "msg bad"; msg.textContent = "Type a query and a target using the letters A, C, G and T.";
      return;
    }
    const d = editTable(q, t, mode === "HW"), [dist, ends] = distance(q, t, mode);
    const end = ends[0] + 1, tb = tracebackFrom(q, t, d, q.length, end, mode === "HW");
    const onPath = new Set(tb.cells.map(([i, j]) => `${i},${j}`));
    box.innerHTML = gridHTML(q, t, (i, j) => {
      const cls = [onPath.has(`${i},${j}`) ? "path" : "", i === q.length && j === end ? "end" : "",
        (mode !== "NW" && i === q.length && ends.includes(j - 1)) ? "best" : "", j > end || (mode === "HW" && j < tb.start) ? "free" : ""];
      return [d[i][j], cls.join(" ")];
    });
    el.querySelector(".stats").innerHTML = `<div class="stat"><small>distance</small><b>${dist}</b></div>
      <div class="stat"><small>operations</small><b>${tb.ops.join(",")}</b></div>
      <div class="stat"><small>CIGAR</small><b>${cigar(tb.ops)}</b></div>`;
    const free = mode === "NW" ? "" : mode === "SHW" ? ` The target after position ${end - 1} is free.` : ` The target before position ${tb.start} and after position ${end - 1} is free (first row all zeros).`;
    msg.className = "msg";
    msg.textContent = `${mode}: distance ${dist}, end location${ends.length > 1 ? "s" : ""} ${ends.join(", ")}. The highlighted cells are one optimal path, traced back from the end cell.${free}`;
  };
  el.querySelectorAll("[data-m]").forEach((b) => {
    b.onclick = () => { mode = b.dataset.m; el.querySelectorAll("[data-m]").forEach((x) => x.classList.toggle("on", x === b)); draw(); };
  });
  el.querySelector(".ex").onclick = () => { el.querySelector(".q").value = "GATTACA"; el.querySelector(".t").value = "GCATGCA"; draw(); };
  el.querySelectorAll("input").forEach((i) => { i.oninput = draw; });
  draw();
}

// ---------- Demo 2: Myers column by column ----------

function demoMyers(el) {
  el.innerHTML = `<div class="controls bi-inputs">
      <label>query <input class="q" type="text" value="ACGT" maxlength="10" spellcheck="false"></label>
      <label>target <input class="t" type="text" value="ACCT" maxlength="12" spellcheck="false"></label></div>
    <div class="controls"><button class="cbtn on next">Next column</button><button class="cbtn all">All columns</button><button class="cbtn reset">Reset</button><span class="spacer"></span><span class="counter mono"></span></div>
    <div class="bi-box"></div><div class="bi-bits mono"></div><div class="msg"></div>`;
  let cols = [], step = 0, q = "", t = "";
  const rebuild = () => {
    q = clean(el.querySelector(".q").value, 10); t = clean(el.querySelector(".t").value, 12);
    cols = [];
    if (q && t) myers(q, t, (j, c, pv, mv, score) => cols.push({ j, c, pv, mv, score }));
    step = 0; draw();
  };
  const draw = () => {
    const msg = el.querySelector(".msg"), box = el.querySelector(".bi-box"), bits = el.querySelector(".bi-bits");
    if (!q || !t) { box.innerHTML = ""; bits.innerHTML = ""; msg.className = "msg bad"; msg.textContent = "Type a query and a target using A, C, G and T."; return; }
    const d = editTable(q, t);
    // Values rebuilt from the deltas: column j starts at j and adds pv - mv going down.
    const val = (i, j) => {
      if (j === 0) return i;
      const { pv, mv } = cols[j - 1];
      let v = j;
      for (let r = 0; r < i; r++) v += bit(pv, r) - bit(mv, r);
      return v;
    };
    box.innerHTML = gridHTML(q, t, (i, j) => {
      if (j > step) return ["", "todo"];
      if (i === 0 || j === 0) return [i === 0 ? j : i, j === step && step ? "cur" : ""];
      const { pv, mv } = cols[j - 1], delta = bit(pv, i - 1) ? "+" : bit(mv, i - 1) ? "−" : "0";
      return [`${val(i, j)}<i>${delta}</i>`, `${j === step ? "cur" : ""} ${delta === "+" ? "up" : delta === "−" ? "dn" : ""}`];
    });
    el.querySelector(".counter").textContent = `column ${step} / ${t.length}`;
    if (!step) {
      bits.innerHTML = `peq: ${Object.entries(peq(q)).map(([c, x]) => `${c} ${[...q].map((_, i) => bit(x, i)).join("")}`).join(" · ")}`;
      msg.className = "msg"; msg.textContent = "Column 0 is 0, 1, 2, …: every delta going down is +1, so pv is all ones and mv is all zeros. peq marks the rows holding each letter.";
      return;
    }
    const { c, pv, mv, score } = cols[step - 1], row = (x) => [...q].map((_, i) => bit(x, i)).join("");
    bits.innerHTML = `eq(${c}) ${row(peq(q)[c])} · pv ${row(pv)} · mv ${row(mv)}`;
    const ok = [...q].every((_, i) => val(i + 1, step) === d[i + 1][step]);
    msg.className = step === t.length ? "msg good" : "msg";
    msg.textContent = `Column ${step} (${c}): a handful of bitwise operations on whole words give its deltas; the bottom cell is ${score}. ${ok ? "Rebuilt from the deltas, the column equals the full table's." : "Mismatch with the table!"}${step === t.length ? ` Edit distance ${score}.` : ""}`;
  };
  el.querySelector(".next").onclick = () => { if (step < cols.length) step++; draw(); };
  el.querySelector(".all").onclick = () => { step = cols.length; draw(); };
  el.querySelector(".reset").onclick = () => { step = 0; draw(); };
  el.querySelectorAll("input").forEach((i) => { i.oninput = rebuild; });
  rebuild();
}

// ---------- Demo 3: the band and k doubling ----------

function demoBand(el) {
  el.innerHTML = `<div class="controls">${[99, 90, 80, 70, 60].map((s, i) => `<button class="cbtn${i ? "" : " on"}" data-s="${s}">${s}%</button>`).join("")}<span class="spacer"></span><span class="counter mono">our 1,000-base pairs</span></div>
    <div class="bi-band"><div class="svgbox"></div><div class="bi-tries"></div></div><div class="stats"></div><div class="msg"></div>`;
  const cache = {};
  const run = (s) => {
    el.querySelectorAll("[data-s]").forEach((b) => b.classList.toggle("on", +b.dataset.s === s));
    const { target, qs } = pairs(), q = qs[s], m = q.length, n = target.length;
    const res = cache[s] || (cache[s] = { tries: doubling(q, target), ops: hirschberg(q, target) });
    const S = 300, sx = S / n, sy = S / m;
    const band = (k) => {
      const left = [], right = [];
      for (let i = 0; i <= m; i += 4) {
        let lo = -1, hi = -1;
        for (let j = Math.max(0, i - k); j <= Math.min(n, i + k); j++) {
          if (Math.abs(i - j) + Math.abs(m - i - (n - j)) <= k) { if (lo < 0) lo = j; hi = j; }
        }
        if (lo >= 0) { left.push(`${(lo * sx).toFixed(1)},${(i * sy).toFixed(1)}`); right.push(`${(hi * sx).toFixed(1)},${(i * sy).toFixed(1)}`); }
      }
      return left.concat(right.reverse()).join(" ");
    };
    let svg = `<svg viewBox="-2 -2 ${S + 4} ${S + 4}" role="img" aria-label="The table, the bands tried and the optimal path"><rect x="0" y="0" width="${S}" height="${S}" fill="var(--paper-2)" stroke="var(--line)"/>`;
    [...res.tries].reverse().forEach(([k, d], idx) => {
      svg += `<polygon points="${band(k)}" fill="${d === null ? "var(--amber)" : "var(--teal)"}" opacity="${d === null ? 0.25 : 0.3 + 0.05 * idx}"/>`;
    });
    let i = 0, j = 0, pts = "0,0";
    for (const op of res.ops) {
      if (op !== DELETE) i++;
      if (op !== INSERT) j++;
      pts += ` ${(j * sx).toFixed(1)},${(i * sy).toFixed(1)}`;
    }
    svg += `<polyline points="${pts}" fill="none" stroke="var(--ink)" stroke-width="1.2"/>`;
    svg += `<text x="4" y="12" font-size="10" fill="var(--stone)">target →</text><text x="4" y="${S - 4}" font-size="10" fill="var(--stone)">↓ query</text></svg>`;
    el.querySelector(".svgbox").innerHTML = svg;
    let total = 0;
    el.querySelector(".bi-tries").innerHTML = res.tries.map(([k, d, cells]) => {
      total += cells;
      return `<div class="bi-try ${d === null ? "" : "ok"}"><b>k = ${k}</b><span>${d === null ? "more than k" : `distance ${d}`}</span><small>${fmt(cells)} cells</small></div>`;
    }).join("");
    const dist = res.tries[res.tries.length - 1][1];
    el.querySelector(".stats").innerHTML = `<div class="stat"><small>distance</small><b>${dist}</b></div>
      <div class="stat"><small>cells, all tries</small><b>${fmt(total)}</b></div>
      <div class="stat"><small>share of table</small><b>${((100 * total) / (m * n)).toFixed(1)}%</b></div>
      <div class="stat"><small>band if k known</small><b>${fmt(banded(q, target, dist)[1])}</b></div>`;
    const msg = el.querySelector(".msg");
    msg.className = "msg";
    msg.textContent = `${s}% similar: amber bands were too narrow, the blue one held the answer. The black line is an optimal path (from Hirschberg's method); it never leaves the band. Knowing the distance, path recovery can use the narrowest band at once.`;
  };
  el.querySelectorAll("[data-s]").forEach((b) => { b.onclick = () => run(+b.dataset.s); });
  run(99);
}

// ---------- Demo 4: Hirschberg, meeting in the middle ----------

function demoHirschberg(el, { auto = false } = {}) {
  el.innerHTML = `${auto ? "" : `<div class="controls bi-inputs">
      <label>query <input class="q" type="text" value="GATTACAGA" maxlength="12" spellcheck="false"></label>
      <label>target <input class="t" type="text" value="GCATGCAGTA" maxlength="14" spellcheck="false"></label></div>
    <div class="controls"><button class="cbtn on next">Next split</button><button class="cbtn all">Run to the end</button><button class="cbtn reset">Reset</button><span class="spacer"></span><span class="counter mono"></span></div>`}
    <div class="bi-box"></div><div class="bi-rows"></div><div class="msg"></div>`;
  let q = "", t = "", rec = [], ops = [], step = 0;
  const rebuild = () => {
    q = auto ? "GATTACAGA" : clean(el.querySelector(".q").value, 12);
    t = auto ? "GCATGCAGTA" : clean(el.querySelector(".t").value, 14);
    rec = []; ops = q && t ? hirschberg(q, t, { cells: 0, row: 0 }, rec) : [];
    step = 0; draw();
  };
  const draw = () => {
    const box = el.querySelector(".bi-box"), rows = el.querySelector(".bi-rows"), msg = el.querySelector(".msg");
    if (!q || !t) { box.innerHTML = ""; rows.innerHTML = ""; msg.className = "msg bad"; msg.textContent = "Type a query and a target using A, C, G and T."; return; }
    // Live rectangles: the whole table, minus every processed piece, plus the pieces it created.
    const live = new Set(["0,0"]), known = new Set();
    const key = (r) => `${r.q0},${r.t0}`;
    for (let s = 0; s < step; s++) {
      const r = rec[s];
      live.delete(key(r));
      if (r.base) {
        let i = r.q0, j = r.t0;
        known.add(`${i},${j}`);
        for (const op of r.ops) { if (op !== DELETE) i++; if (op !== INSERT) j++; known.add(`${i},${j}`); }
      } else {
        known.add(`${r.q0 + r.mid},${r.t0 + r.j}`);
        live.add(`${r.q0},${r.t0}`); live.add(`${r.q0 + r.mid},${r.t0 + r.j}`);
      }
    }
    const rects = rec.filter((r) => live.has(key(r)) && rec.indexOf(r) >= step);
    const cur = step < rec.length ? rec[step] : null;
    const inRect = (r, i, j) => i >= r.q0 && i <= r.q0 + r.m && j >= r.t0 && j <= r.t0 + r.n;
    box.innerHTML = gridHTML(q, t, (i, j) => {
      const onPath = known.has(`${i},${j}`);
      const cls = [onPath ? "path" : "", onPath || rects.some((r) => inRect(r, i, j)) ? "" : "free",
        cur && inRect(cur, i, j) ? "cur" : "", cur && !cur.base && i === cur.q0 + cur.mid && inRect(cur, i, j) ? "mid" : ""];
      return ["", cls.join(" ")];
    });
    if (!auto) el.querySelector(".counter").textContent = `step ${step} / ${rec.length}`;
    if (cur && !cur.base) {
      const best = Math.min(...cur.sums);
      const line = (name, arr, hl) => `<tr><th>${name}</th>${arr.map((v, j) => `<td class="${hl && v === best ? "best" : ""}">${v}</td>`).join("")}</tr>`;
      rows.innerHTML = `<table class="bi-sums"><tr><th>column</th>${cur.sums.map((_, j) => `<td>${cur.t0 + j}</td>`).join("")}</tr>${line("top →", cur.top)}${line("bottom ←", cur.bottom)}${line("sum", cur.sums, true)}</table>`;
      msg.className = "msg";
      msg.textContent = `Piece rows ${cur.q0}–${cur.q0 + cur.m}, columns ${cur.t0}–${cur.t0 + cur.n}: the top half forward and the bottom half backward meet on row ${cur.q0 + cur.mid}. The smallest sum, ${best}, is at column ${cur.t0 + cur.j}: an optimal path crosses there, and two smaller pieces remain.`;
    } else if (cur) {
      rows.innerHTML = "";
      msg.className = "msg";
      msg.textContent = `Piece rows ${cur.q0}–${cur.q0 + cur.m}, columns ${cur.t0}–${cur.t0 + cur.n} is one row or one column: a tiny table gives its path directly (${cigar(cur.ops) || "empty"}).`;
    } else {
      rows.innerHTML = "";
      const cost = pathCost(q, t, ops);
      msg.className = "msg good";
      msg.textContent = `Done: ${cigar(ops)}, cost ${cost}, equal to the distance ${myers(q, t)}. No step kept more than two rows of the table.`;
    }
  };
  if (auto) {
    rebuild();
    setInterval(() => { step = (step + 1) % (rec.length + 3); if (step > rec.length) return; draw(); }, 1200);
    return;
  }
  el.querySelector(".next").onclick = () => { if (step < rec.length) step++; draw(); };
  el.querySelector(".all").onclick = () => { step = rec.length; draw(); };
  el.querySelector(".reset").onclick = () => { step = 0; draw(); };
  el.querySelectorAll("input").forEach((i) => { i.oninput = rebuild; });
  rebuild();
}

// ---------- Demo 5: a small, noisy difference ----------

function demoTiming(el) {
  el.innerHTML = `<div class="controls">
      <label>true reconstruction <input class="r" type="range" min="0" max="100" value="5"><b class="mono vr"></b></label>
      <label>random delay up to <input class="j" type="range" min="0" max="20" value="5"><b class="mono vj"></b></label>
      <button class="cbtn on go">Measure 60 workloads again</button></div>
    <div class="svgbox bi-strip"></div><div class="stats"></div><div class="msg"></div>`;
  const rng = new Rng(7);
  const run = () => {
    const recon = +el.querySelector(".r").value / 100, jitter = +el.querySelector(".j").value / 10;
    el.querySelector(".vr").textContent = `${recon.toFixed(2)} ms`;
    el.querySelector(".vj").textContent = `${jitter.toFixed(1)} ms`;
    const xs = Array.from({ length: 60 }, () => measured(recon, rng, 6.0, jitter));
    let total = 0, bad = 0;
    for (const x of xs) { total += x; if (x <= 0) bad++; }
    const lo = Math.min(-0.2, ...xs), hi = Math.max(1.2, ...xs), W = 600, H = 60, X = (v) => ((v - lo) / (hi - lo)) * (W - 20) + 10;
    let svg = `<svg viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="The 60 measured reconstruction times"><line x1="${X(0)}" x2="${X(0)}" y1="0" y2="${H}" stroke="var(--red)"/><line x1="${X(recon)}" x2="${X(recon)}" y1="0" y2="${H}" stroke="var(--teal)" stroke-dasharray="4 3"/>`;
    xs.forEach((x, k) => { svg += `<circle cx="${X(x).toFixed(1)}" cy="${8 + (k % 6) * 9}" r="3.5" fill="${x <= 0 ? "var(--red)" : "var(--teal)"}" opacity="0.8"/>`; });
    svg += `<text x="${X(0)}" y="${H + 14}" font-size="10" text-anchor="middle" fill="var(--red)">0</text><text x="${W - 10}" y="${H + 14}" font-size="10" text-anchor="end" fill="var(--stone)">ms</text></svg>`;
    el.querySelector(".svgbox").innerHTML = svg;
    el.querySelector(".stats").innerHTML = `<div class="stat"><small>true</small><b>${recon.toFixed(2)} ms</b></div>
      <div class="stat"><small>mean measured</small><b>${(total / 60).toFixed(3)} ms</b></div>
      <div class="stat ${bad ? "bad" : "good"}"><small>not positive</small><b>${bad} of 60</b></div>`;
    const msg = el.querySelector(".msg");
    msg.className = `msg ${bad ? "bad" : ""}`;
    msg.textContent = `Each dot is one workload: fastest of 15 path runs minus fastest of 15 locations-only runs (a 6 ms process, our numbers). The dashed line is the true time. ${bad ? `${bad} workloads would fail outright: a difference that is not positive is not a reconstruction time.` : "Every difference is positive."}`;
  };
  el.querySelectorAll("input").forEach((i) => { i.oninput = run; });
  el.querySelector(".go").onclick = run;
  run();
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
  table: (el) => demoTable(el),
  myers: (el) => demoMyers(el),
  band: (el) => demoBand(el),
  hirschberg: (el) => demoHirschberg(el),
  hirschbergAuto: (el) => demoHirschberg(el, { auto: true }),
  timing: (el) => demoTiming(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
