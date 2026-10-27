// L05 demos. The JS models repeat the Python programs in frontiercs2/notes/L05-theory.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

// ---------- keys and a hash (exact twins of the Python) ----------

// Park-Miller generator, exact in JavaScript (products stay below 2^53).
class Rng {
  constructor(seed) { this.state = seed; }
  next() { this.state = (this.state * 48271) % 2147483647; return this.state; }
}

// 32 scrambled bits of (key, seed); Math.imul keeps the low 32 bits as Python's & MASK does.
function hash32(key, seed) {
  let x = (Math.imul(key, 0x9E3779B1) + seed) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x85EBCA6B) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 0xC2B2AE35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function makeKeys(n, seed, avoid = null) {
  const rng = new Rng(seed), keys = new Set();
  while (keys.size < n) { const k = rng.next(); if (!avoid || !avoid.has(k)) keys.add(k); }
  return [...keys].sort((a, b) => a - b);
}

// ---------- Bloom filter ----------

function bloomBuild(keys, m, k) {
  const bits = new Uint8Array(m);
  for (const key of keys) for (let i = 0; i < k; i++) bits[hash32(key, i) % m] = 1;
  return bits;
}
function bloomHas(bits, key, k) {
  for (let i = 0; i < k; i++) if (!bits[hash32(key, i) % bits.length]) return false;
  return true;
}

// ---------- peeling (xor and binary fuse filters) ----------

// Fill a table of `size` slots, or return table null if peeling gets stuck.
function build(keys, size, where, fingerprint) {
  const count = new Int32Array(size), mask = new Int32Array(size);
  for (const key of keys) for (const s of where(key)) { count[s]++; mask[s] ^= key; }
  const stack = [];
  for (let s = 0; s < size; s++) if (count[s] === 1) stack.push(s);
  const order = [];
  while (stack.length) {
    const s = stack.pop();
    if (count[s] !== 1) continue;
    const key = mask[s];
    order.push([key, s]);
    for (const t of where(key)) {
      count[t]--; mask[t] ^= key;
      if (count[t] === 1) stack.push(t);
    }
  }
  if (order.length < keys.length) return { table: null, order };
  const table = new Int32Array(size);
  for (let i = order.length - 1; i >= 0; i--) {
    const [key, s] = order[i], [a, b, c] = where(key);
    table[s] = fingerprint(key) ^ table[a] ^ table[b] ^ table[c];
  }
  return { table, order };
}

const xorWhere = (size, seed) => {
  const third = Math.floor(size / 3);
  return (key) => [0, 1, 2].map((i) => i * third + (hash32(key, seed + i) % third));
};
const fingerprint8 = (key) => hash32(key, 99) & 0xff;
function contains(table, where, fingerprint, key) {
  const [a, b, c] = where(key);
  return (table[a] ^ table[b] ^ table[c]) === fingerprint(key);
}

// Segment length, start segments, table size and slots per key, as in binaryfusefilter.h.
function fuseLayout(n) {
  let seg = 2 ** Math.floor(Math.log(n) / Math.log(3.33) + 2.25);
  const factor = Math.max(1.125, 0.875 + (0.25 * Math.log(1000000)) / Math.log(n));
  const capacity = Math.round(n * factor);
  while (seg > 256 && Math.ceil(capacity / seg) < 32 + 2) seg = Math.floor(seg / 2);
  const starts = Math.ceil(capacity / seg) - 2;
  return { seg, starts, size: (starts + 2) * seg, factor };
}
const fuseWhere = (seg, starts, seed) => (key) => {
  const first = Math.floor((hash32(key, seed) * starts) / 4294967296) * seg;
  return [0, 1, 2].map((i) => first + i * seg + (hash32(key, seed + 1 + i) % seg));
};

// ---------- the task's rules ----------

function allowance(m, b) {
  const mean = m / 2 ** b, L = Math.log(1200 / 1e-6);
  return Math.ceil(mean + Math.sqrt(2 * mean * L) + (2 / 3) * L);
}
const scoreTerm = (c, r) => (100 * r) / (c + r);
const score = (pairs) => pairs.reduce((acc, [c, r]) => acc + scoreTerm(c, r), 0) / pairs.length;

// ---------- shared data (built on first use) ----------

let KEYS1K = null, ABSENT = null, KEYS2K = null;
const keys1k = () => KEYS1K || (KEYS1K = makeKeys(1000, 1));
const absent100k = () => ABSENT || (ABSENT = makeKeys(100000, 2, new Set(keys1k())));
const keys2k = () => KEYS2K || (KEYS2K = makeKeys(2000, 3));
const SMALL = [12, 25, 37, 48, 51, 66, 74, 89];
const SMALL_SEED = (() => { let s = 0; while (!build(SMALL, 12, xorWhere(12, s), fingerprint8).table) s++; return s; })();
const hex2 = (v) => v.toString(16).padStart(2, "0");

// ---------- Demo 1: Bloom filter ----------

function demoBloom(el) {
  el.innerHTML = `<div class="controls">
      <label>bits per key <input class="m" type="range" min="2" max="16" value="8"><b class="mono vm"></b></label>
      <label>hashes k <input class="k" type="range" min="1" max="10" value="5"><b class="mono vk"></b></label></div>
    <div class="bl-strip" aria-label="The first 256 bits of the filter"></div>
    <div class="stats"></div><div class="msg"></div>`;
  const draw = () => {
    const per = +el.querySelector(".m").value, k = +el.querySelector(".k").value;
    el.querySelector(".vm").textContent = per; el.querySelector(".vk").textContent = k;
    const keys = keys1k(), m = per * keys.length, bits = bloomBuild(keys, m, k);
    let false_ = 0, missed = 0;
    for (const key of absent100k()) if (bloomHas(bits, key, k)) false_++;
    for (const key of keys) if (!bloomHas(bits, key, k)) missed++;
    const rate = false_ / 100000, predicted = (1 - Math.exp((-k * keys.length) / m)) ** k;
    let set = 0;
    for (let i = 0; i < m; i++) set += bits[i];
    el.querySelector(".bl-strip").innerHTML = Array.from(bits.slice(0, 256), (b) => `<i class="${b ? "on" : ""}"></i>`).join("");
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>bits set</small><b>${((100 * set) / m).toFixed(0)}%</b></div>
      <div class="stat"><small>false positives</small><b>${false_.toLocaleString("en-US")}</b></div>
      <div class="stat"><small>measured rate</small><b>${rate.toFixed(4)}</b></div>
      <div class="stat"><small>predicted</small><b>${predicted.toFixed(4)}</b></div>`;
    const best = Math.max(1, Math.round(0.693 * per));
    const msg = el.querySelector(".msg");
    msg.className = "msg";
    msg.textContent = `1,000 keys, 100,000 absent queries; stored keys missed: ${missed}. At ${per} bits per key the best k is about ${best}; the lower bound would allow a rate of 1/${2 ** per}.`;
  };
  el.querySelectorAll("input").forEach((i) => { i.oninput = draw; });
  draw();
}

// ---------- Demo 2: peeling 8 keys step by step ----------

function demoPeel(el, { auto = false } = {}) {
  const where = xorWhere(12, SMALL_SEED);
  const { table, order } = build(SMALL, 12, where, fingerprint8);
  const n = SMALL.length;
  let step = 0; // 0..n peeling, n+1..2n assigning
  el.innerHTML = `<div class="pl-slots"></div><div class="pl-keys"></div>
    ${auto ? "" : `<div class="controls"><button class="cbtn on next">Step</button><button class="cbtn all">Run to the end</button><button class="cbtn reset">Reset</button><span class="spacer"></span><span class="counter mono"></span></div>`}
    <div class="msg"></div>
    ${auto ? "" : `<div class="controls pl-query"><label>look up a key <input class="q" type="number" min="0" value="12"></label><button class="cbtn look">Look up</button><button class="cbtn fp">Find a false positive</button></div><div class="msg qmsg"></div>`}`;
  const draw = () => {
    const peeled = new Map(order.slice(0, Math.min(step, n)).map(([key, s]) => [key, s]));
    const assigned = step > n ? order.slice(n - (step - n)) : [];
    const setSlots = new Map(assigned.map(([key, s]) => [s, key]));
    const count = Array(12).fill(0);
    SMALL.forEach((key) => { if (!peeled.has(key)) where(key).forEach((s) => count[s]++); });
    const current = step >= 1 && step <= n ? order[step - 1] : step > n ? order[2 * n - step] : null;
    el.querySelector(".pl-slots").innerHTML = [0, 1, 2].map((p) => `<div class="pl-part"><small>part ${p + 1}</small><div>${[0, 1, 2, 3].map((j) => {
      const s = 4 * p + j, cls = [current && current[1] === s ? "cur" : "", step <= n && count[s] === 1 ? "one" : "", setSlots.has(s) ? "set" : ""].join(" ");
      const body = step > n ? (setSlots.has(s) ? hex2(table[s]) : "00") : count[s];
      return `<span class="pl-slot ${cls}"><i>${s}</i><b>${body}</b></span>`;
    }).join("")}</div></div>`).join("");
    el.querySelector(".pl-keys").innerHTML = SMALL.map((key) => {
      const slots = where(key), own = peeled.get(key), cur = current && current[0] === key;
      return `<div class="pl-key ${own !== undefined ? "done" : ""} ${cur ? "cur" : ""}"><b>${key}</b><span>${slots.map((s) => (s === own ? `<u>${s}</u>` : s)).join(" · ")}</span><small>f = ${hex2(fingerprint8(key))}</small></div>`;
    }).join("");
    const msg = el.querySelector(".msg");
    if (step === 0) { msg.className = "msg"; msg.textContent = "Each slot shows how many keys use it. Slots with one key (outlined) can start the peeling."; }
    else if (step <= n) {
      const [key, s] = order[step - 1];
      msg.className = "msg"; msg.textContent = `Peel ${step}: slot ${s} has one key, ${key}. Remove ${key} from slots ${where(key).join(", ")}; slot ${s} is its own.`;
    } else {
      const [key, s] = order[2 * n - step], [a, b, c] = where(key);
      msg.className = step === 2 * n ? "msg good" : "msg";
      msg.textContent = `Assign (reverse order): B[${s}] = f(${key}) ⊕ the other two = ${hex2(table[s])}, so B[${a}] ⊕ B[${b}] ⊕ B[${c}] = ${hex2(fingerprint8(key))}.${step === 2 * n ? " Every key's equation holds." : ""}`;
    }
    if (!auto) el.querySelector(".counter").textContent = step <= n ? `peeled ${Math.min(step, n)} / ${n}` : `assigned ${step - n} / ${n}`;
  };
  if (auto) {
    draw();
    setInterval(() => { step = (step + 1) % (2 * n + 1); draw(); }, 1100);
    return;
  }
  el.querySelector(".next").onclick = () => { if (step < 2 * n) step++; draw(); };
  el.querySelector(".all").onclick = () => { step = 2 * n; draw(); };
  el.querySelector(".reset").onclick = () => { step = 0; draw(); };
  const qmsg = el.querySelector(".qmsg");
  const look = (key) => {
    const [a, b, c] = where(key), x = table[a] ^ table[b] ^ table[c], f = fingerprint8(key), yes = x === f, stored = SMALL.includes(key);
    qmsg.className = `msg qmsg ${yes === stored ? "good" : "bad"}`;
    qmsg.textContent = `Key ${key}: slots ${a}, ${b}, ${c}; B XOR = ${hex2(x)}, fingerprint ${hex2(f)} → ${yes ? "yes" : "no"}. ${stored ? "It is stored." : yes ? "It is not stored: a false positive." : "It is not stored."}`;
  };
  el.querySelector(".look").onclick = () => { step = 2 * n; draw(); look(Math.max(0, Math.floor(+el.querySelector(".q").value || 0))); };
  el.querySelector(".fp").onclick = () => {
    step = 2 * n; draw();
    let key = 100;
    while (SMALL.includes(key) || !contains(table, where, fingerprint8, key)) key++;
    el.querySelector(".q").value = key; look(key);
  };
  draw();
}

// ---------- Demo 3: the peeling threshold ----------

function demoThreshold(el) {
  el.innerHTML = `<div class="controls"><label>slots per key <input class="f" type="range" min="110" max="135" value="121"><b class="mono vf"></b></label>
      <button class="cbtn on go">Try 10 seeds</button></div>
    <div class="th-seeds"></div><div class="msg"></div>`;
  const run = () => {
    const factor = +el.querySelector(".f").value / 100, keys = keys2k(), size = 3 * Math.ceil((factor * keys.length) / 3);
    const res = Array.from({ length: 10 }, (_, s) => build(keys, size, xorWhere(size, 10 * s), fingerprint8));
    const ok = res.filter((r) => r.table).length;
    el.querySelector(".th-seeds").innerHTML = res.map((r, s) => `<div class="th-seed ${r.table ? "ok" : ""}"><small>seed ${10 * s}</small><span><i style="width:${(100 * r.order.length) / keys.length}%"></i></span><b>${r.table ? "peels" : `${r.order.length} / 2,000`}</b></div>`).join("");
    const msg = el.querySelector(".msg");
    msg.className = `msg ${ok === 10 ? "good" : ok === 0 ? "bad" : ""}`;
    msg.textContent = `${factor.toFixed(2)} slots per key (${size.toLocaleString("en-US")} slots): ${ok} of 10 seeds peel all 2,000 keys. The bars show how many keys each seed peeled before it got stuck.`;
  };
  const f = el.querySelector(".f");
  f.oninput = () => { el.querySelector(".vf").textContent = (+f.value / 100).toFixed(2); };
  f.onchange = run;
  el.querySelector(".go").onclick = run;
  f.oninput();
  run();
}

// ---------- Demo 4: the fuse burns ----------

function demoFuse(el, { auto = false } = {}) {
  const keys = keys2k(), { seg, starts, size } = fuseLayout(keys.length);
  const nseg = starts + 2, BIN = 16, bins = size / BIN;
  const runs = {
    fuse: build(keys, size, fuseWhere(seg, starts, 0), fingerprint8),
    xor: build(keys, 3 * Math.floor(size / 3), xorWhere(3 * Math.floor(size / 3), 0), fingerprint8),
  };
  let mode = "fuse", t = 0, timer = null;
  el.innerHTML = `${auto ? "" : `<div class="controls"><button class="cbtn on m-fuse">Fuse layout</button><button class="cbtn m-xor">Xor layout, same size</button><button class="cbtn play">Replay</button></div>`}
    <div class="svgbox fu-box"></div><div class="fu-segs"></div>${auto ? "" : `<div class="msg"></div>`}`;
  const draw = () => {
    const { order } = runs[mode], when = new Int32Array(size).fill(-1);
    order.forEach(([, s], i) => { when[s] = i; });
    const W = 704, H = 70, bw = W / bins, peeledSoFar = Math.min(t, order.length);
    let svg = `<svg viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="Slots peeled so far, in bins of 16">`;
    for (let b = 0; b < bins; b++) {
      let done = 0;
      for (let s = b * BIN; s < (b + 1) * BIN; s++) if (when[s] >= 0 && when[s] < peeledSoFar) done++;
      svg += `<rect x="${(b * bw).toFixed(2)}" y="${H - (H * done) / BIN}" width="${(bw + 0.3).toFixed(2)}" height="${(H * done) / BIN}" fill="var(--teal)"/>`;
    }
    if (mode === "fuse") for (let g = 1; g < nseg; g++) svg += `<line x1="${(g * seg * W) / size}" x2="${(g * seg * W) / size}" y1="0" y2="${H}" stroke="var(--line)"/>`;
    svg += `<text x="0" y="${H + 13}" font-size="10" fill="var(--stone)">slot 0</text><text x="${W}" y="${H + 13}" font-size="10" text-anchor="end" fill="var(--stone)">slot ${size - 1}</text></svg>`;
    el.querySelector(".fu-box").innerHTML = svg;
    if (mode === "fuse") {
      const pct = Array.from({ length: nseg }, (_, g) => {
        let sum = 0;
        for (let s = g * seg; s < (g + 1) * seg; s++) sum += Math.max(0, when[s]);
        return Math.round((100 * sum) / seg / order.length);
      });
      el.querySelector(".fu-segs").innerHTML = `<small>average peeling time of each segment, % of the run</small><div>${pct.map((p) => `<span style="--p:${p}">${p}</span>`).join("")}</div>`;
    } else el.querySelector(".fu-segs").innerHTML = `<small>xor layout: three parts of ${Math.floor(size / 3).toLocaleString("en-US")} slots</small>`;
    if (!auto) {
      const msg = el.querySelector(".msg");
      msg.className = "msg";
      msg.textContent = mode === "fuse"
        ? `2,000 keys in ${nseg} segments of ${seg} slots. Peeled ${peeledSoFar.toLocaleString("en-US")} of 2,000: both ends go first, then the fronts burn toward the middle.`
        : `The same 2,000 keys in an xor layout of the same size: peeling happens everywhere at once, with no front. Peeled ${peeledSoFar.toLocaleString("en-US")} of 2,000.`;
    }
  };
  const play = () => {
    clearInterval(timer); t = 0; draw();
    timer = setInterval(() => {
      t += 40;
      if (t >= 2000 + (auto ? 600 : 0)) { if (auto) t = 0; else { t = 2000; clearInterval(timer); } }
      draw();
    }, 40);
  };
  if (!auto) {
    const set = (m) => { mode = m; el.querySelector(".m-fuse").classList.toggle("on", m === "fuse"); el.querySelector(".m-xor").classList.toggle("on", m === "xor"); play(); };
    el.querySelector(".m-fuse").onclick = () => set("fuse");
    el.querySelector(".m-xor").onclick = () => set("xor");
    el.querySelector(".play").onclick = play;
  }
  play();
}

// ---------- Demo 5: the score and the pass rule ----------

const SCORE_PRESETS = {
  "Claude Opus 5.5 (means)": [[9.24, 18.9], [3.56, 4.23], [616.1, 616.2]],
  "A copy of the reference": [[18.9, 18.9], [4.23, 4.23], [616.2, 616.2]],
};

function demoScore(el) {
  const names = ["build time (ms)", "lookup time (ns)", "memory (KiB)"];
  el.innerHTML = `<table class="sc"><tr><th>metric</th><th>run C</th><th>reference R</th><th>100·R/(C+R)</th><th></th></tr>
      ${names.map((nm, i) => `<tr><td>${nm}</td><td><input type="number" step="any" class="c" data-i="${i}"></td><td><input type="number" step="any" class="r" data-i="${i}"></td><td class="mono t"></td><td class="w"></td></tr>`).join("")}</table>
    <div class="controls">${Object.keys(SCORE_PRESETS).map((p, i) => `<button class="cbtn${i ? "" : " on"}" data-p="${p}">${p}</button>`).join("")}</div>
    <div class="stats"></div><p class="hint">The real score averages per workload, with the reference measured in the same run; a pass needs C &lt; R on every metric of all 144 workloads.</p>`;
  const load = (p) => {
    SCORE_PRESETS[p].forEach(([c, r], i) => { el.querySelectorAll(".c")[i].value = c; el.querySelectorAll(".r")[i].value = r; });
    el.querySelectorAll("[data-p]").forEach((b) => b.classList.toggle("on", b.dataset.p === p));
    draw();
  };
  const draw = () => {
    const pairs = names.map((_, i) => [+el.querySelectorAll(".c")[i].value || 0, +el.querySelectorAll(".r")[i].value || 0]);
    const rows = el.querySelectorAll("tr");
    pairs.forEach(([c, r], i) => {
      rows[i + 1].querySelector(".t").textContent = c + r > 0 ? scoreTerm(c, r).toFixed(1) : "–";
      rows[i + 1].querySelector(".w").innerHTML = c < r ? '<span class="chip pass">win</span>' : c === r ? '<span class="chip fail">tie</span>' : '<span class="chip fail">loss</span>';
    });
    const all = pairs.every(([c, r]) => c < r), valid = pairs.every(([c, r]) => c + r > 0);
    el.querySelector(".stats").innerHTML = `<div class="stat"><small>score</small><b>${valid ? score(pairs).toFixed(1) : "–"}</b></div>
      <div class="stat ${all ? "good" : "bad"}"><small>this workload</small><b>${all ? "all three won" : "not a pass"}</b></div>`;
  };
  el.querySelectorAll("input").forEach((i) => {
    i.oninput = () => { el.querySelectorAll("[data-p]").forEach((b) => b.classList.remove("on")); draw(); };
  });
  el.querySelectorAll("[data-p]").forEach((b) => { b.onclick = () => load(b.dataset.p); });
  load(Object.keys(SCORE_PRESETS)[0]);
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
  bloom: (el) => demoBloom(el),
  peel: (el) => demoPeel(el),
  peelAuto: (el) => demoPeel(el, { auto: true }),
  threshold: (el) => demoThreshold(el),
  fuse: (el) => demoFuse(el),
  fuseAuto: (el) => demoFuse(el, { auto: true }),
  score: (el) => demoScore(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
