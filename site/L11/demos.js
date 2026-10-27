// L11 demos. The JS models repeat the Python programs in frontiercs2/notes/L11-cryptography.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

// Park-Miller generator, exact in JavaScript (products stay below 2^53).
class Rng {
  constructor(seed) { this.state = seed; }
  next() { this.state = (this.state * 48271) % 2147483647; return this.state; }
  below(k) { return this.next() % k; }
  uniform() { return this.next() / 2147483647; }
}

// ---------- Structured LWE ----------

const LQ = 97, LN = 12, LM = 20, LW = 2;
const center = (v, q = LQ) => { v = ((v % q) + q) % q; return v > Math.floor(q / 2) ? v - q : v; };

function makeInstance(seed) {
  const rng = new Rng(seed);
  const A = Array.from({ length: LM }, () => Array.from({ length: LN }, () => rng.below(LQ)));
  const support = [];
  while (support.length < LW) { const j = rng.below(LN); if (!support.includes(j)) support.push(j); }
  const s = Array(LN).fill(0);
  support.sort((x, y) => x - y).forEach((j) => { s[j] = rng.below(2) ? 1 : -1; });
  const e = Array.from({ length: LM }, () => rng.below(3) - 1);
  const b = A.map((row, i) => (row.reduce((acc, a, j) => acc + a * s[j], 0) + e[i] + LQ * 4) % LQ);
  return { A, b, s };
}
const LWE = makeInstance(2024);
const residual = (s) => LWE.A.map((row, i) => center(LWE.b[i] - row.reduce((acc, a, j) => acc + a * s[j], 0)));

function lweCheck(s) {
  const nz = s.filter((x) => x !== 0).length, r = residual(s), worst = Math.max(...r.map(Math.abs));
  return { nz, r, worst, ok: nz === LW && worst <= 1 };
}

function demoLWE(el) {
  const s = Array(LN).fill(0);
  el.innerHTML = `<p class="hint" style="margin-top:0">Click an entry to cycle it through 0, 1, −1. A valid secret has exactly two nonzeros and every residual between −1 and 1.</p>
    <div class="lwe-s"></div><div class="lwe-r"></div><div class="stats"></div>
    <div class="controls"><button class="cbtn on search">Search all 264</button><button class="cbtn clear">Clear</button><span class="spacer"></span><span class="counter"></span></div>
    <div class="msg"></div>`;
  const msg = el.querySelector(".msg");
  const draw = () => {
    el.querySelector(".lwe-s").innerHTML = `<small class="mono">s</small>` + s.map((x, j) =>
      `<button class="lwe-cell v${x}" data-j="${j}" aria-label="entry ${j}: ${x}">${x === -1 ? "−1" : x}</button>`).join("");
    el.querySelectorAll(".lwe-cell").forEach((c) => {
      c.onclick = () => { const j = +c.dataset.j; s[j] = s[j] === 0 ? 1 : s[j] === 1 ? -1 : 0; draw(); };
    });
    const { nz, r, worst, ok } = lweCheck(s);
    el.querySelector(".lwe-r").innerHTML = `<small class="mono">b − As, centered mod 97</small><div class="lwe-bars">${r.map((v) =>
      `<span class="lwe-bar ${Math.abs(v) <= 1 ? "in" : "outb"}" style="height:${4 + Math.abs(v)}px" title="${v}"></span>`).join("")}</div>`;
    el.querySelector(".stats").innerHTML = `
      <div class="stat ${nz === LW ? "good" : "bad"}"><small>nonzeros</small><b>${nz} / ${LW}</b></div>
      <div class="stat ${worst <= 1 ? "good" : "bad"}"><small>largest residual</small><b>${worst}</b></div>
      <div class="stat ${ok ? "good" : "bad"}"><small>valid</small><b>${ok ? "yes" : "no"}</b></div>`;
  };
  el.querySelector(".clear").onclick = () => { s.fill(0); msg.textContent = ""; draw(); };
  el.querySelector(".search").onclick = () => {
    let tried = 0; const found = [];
    for (let a = 0; a < LN; a++) for (let c = a + 1; c < LN; c++) for (const sa of [1, -1]) for (const sc of [1, -1]) {
      const t = Array(LN).fill(0); t[a] = sa; t[c] = sc; tried++;
      if (lweCheck(t).ok) found.push(t);
    }
    s.splice(0, LN, ...found[0]);
    el.querySelector(".counter").textContent = `${tried} tried`;
    msg.className = "msg good";
    msg.textContent = `Tried ${tried} candidates; ${found.length} valid: entries ${found[0].map((x, j) => (x ? j : -1)).filter((j) => j >= 0).join(" and ")}. A dense ternary secret would need 531,441 tries.`;
    draw();
  };
  draw();
}

// ---------- CKKS noise ----------

const DELTA = 2 ** 20, SLOTS = 2048, SIGMA = 3.2;
function gauss(rng) { const u1 = rng.uniform(), u2 = rng.uniform(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }
function ckksRun(values, squarings, rng) {
  let c = values.map((x) => x * DELTA + SIGMA * gauss(rng));
  for (let k = 0; k < squarings; k++) c = c.map((ci) => (ci * ci) / DELTA + (rng.uniform() - 0.5) + gauss(rng));
  return c.map((ci) => ci / DELTA);
}
function precisionBits(decoded, truth) { return decoded.map((d, i) => -Math.log2(Math.abs(d - truth[i]))); }
const meanOf = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sdOf = (a) => { const m = meanOf(a); return Math.sqrt(meanOf(a.map((x) => (x - m) ** 2))); };
const CKKS_XS = (() => { const r = new Rng(7); return Array.from({ length: SLOTS }, () => 0.9 + 0.2 * r.uniform()); })();

function demoCKKS(el, { mini = false } = {}) {
  el.innerHTML = `${mini ? "" : `<div class="controls"><label>squarings <input class="k" type="range" min="0" max="5" value="3"><b class="mono vk"></b></label></div>`}
    <div class="svgbox hist"></div><div class="stats"></div>`;
  let auto = 0;
  const draw = (k) => {
    if (!mini) el.querySelector(".vk").textContent = k;
    const truth = CKKS_XS.map((x) => x ** (2 ** k));
    const actual = precisionBits(ckksRun(CKKS_XS, k, new Rng(1)), truth);
    const est = precisionBits(ckksRun(CKKS_XS, k, new Rng(2)), truth);
    const lo = 8, hi = 26, W = 520, H = 150, bins = hi - lo;
    const count = (a) => { const c = Array(bins).fill(0); a.forEach((v) => { const i = Math.floor(v) - lo; if (i >= 0 && i < bins) c[i]++; }); return c; };
    const ca = count(actual), ce = count(est), top = Math.max(...ca, ...ce), bw = (W - 40) / bins;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram of per-slot precision">`;
    ca.forEach((n, i) => {
      const x = 30 + i * bw, h1 = (n / top) * (H - 40), h2 = (ce[i] / top) * (H - 40);
      svg += `<rect x="${x + 1}" y="${H - 22 - h1}" width="${bw / 2 - 1}" height="${h1}" fill="var(--teal)"/>
        <rect x="${x + bw / 2}" y="${H - 22 - h2}" width="${bw / 2 - 1}" height="${h2}" fill="var(--amber)"/>`;
      if ((lo + i) % 2 === 0) svg += `<text x="${x}" y="${H - 8}" font-size="10" fill="var(--stone)">${lo + i}</text>`;
    });
    svg += `<text x="${W - 10}" y="14" font-size="11" text-anchor="end" fill="var(--teal)">actual</text><text x="${W - 10}" y="28" font-size="11" text-anchor="end" fill="var(--amber)">estimator</text></svg>`;
    el.querySelector(".hist").innerHTML = svg + `<small class="mono" style="color:var(--stone)">precision of each of 2,048 slots, in bits</small>`;
    const ma = meanOf(actual), me = meanOf(est), sa = sdOf(actual), se = sdOf(est);
    el.querySelector(".stats").innerHTML = `
      <div class="stat"><small>actual mean · spread</small><b>${ma.toFixed(2)} · ${sa.toFixed(2)}</b></div>
      <div class="stat"><small>estimator</small><b>${me.toFixed(2)} · ${se.toFixed(2)}</b></div>
      <div class="stat good"><small>miss, bits</small><b>${Math.abs(ma - me).toFixed(3)} · ${Math.abs(sa - se).toFixed(3)}</b></div>`;
  };
  if (mini) { draw(auto); setInterval(() => { auto = (auto + 1) % 6; draw(auto); }, 2400); }
  else { const r = el.querySelector(".k"); r.oninput = () => draw(+r.value); draw(+r.value); }
}

// ---------- QuarterPIR: a hint ----------

const PIR_DB = (() => { const r = new Rng(11); return Object.fromEntries([..."ABCDEFGHIJKLMNOP"].map((n) => [n, r.below(256)])); })();
const PIR_ROWS = ["ABCD", "EFGH", "IJKL", "MNOP"];
const PIR_HINT = ["B", "G", "I", "O"];
const xorOf = (names) => names.reduce((p, n) => p ^ PIR_DB[n], 0);
const hex = (v) => "0x" + v.toString(16).padStart(2, "0");
// The spare the client stored for each row (F for G's row, as in the notes).
const PIR_SPARE = { B: "A", G: "F", I: "J", O: "N" };
const spareOf = (want) => PIR_SPARE[want];

function demoPIR(el, { auto = false } = {}) {
  let want = "G";
  el.innerHTML = `<div class="pir"><div class="pir-grid"></div><div class="pir-steps"></div></div>
    ${auto ? "" : `<p class="hint">Click B, G, I or O (the hint's entries) to read it privately.</p>`}`;
  const stored = xorOf(PIR_HINT);
  const draw = () => {
    const spare = spareOf(want), request = PIR_HINT.map((n) => (n === want ? spare : n)), reply = xorOf(request);
    el.querySelector(".pir-grid").innerHTML = PIR_ROWS.map((row, r) => `<div class="pir-row"><small>row ${r + 1}</small>${[...row].map((n) => {
      const cls = [PIR_HINT.includes(n) ? "hint" : "", request.includes(n) ? "req" : "", n === want ? "want" : ""].join(" ");
      return `<button class="pir-cell ${cls}" data-n="${n}" ${PIR_HINT.includes(n) && !auto ? "" : "disabled"}>${n}</button>`;
    }).join("")}</div>`).join("") + `<p class="pir-key"><span class="k hint">hint</span><span class="k req">request</span><span class="k want">wanted</span></p>`;
    el.querySelectorAll(".pir-cell:not([disabled])").forEach((c) => { c.onclick = () => { want = c.dataset.n; draw(); }; });
    const value = reply ^ stored ^ PIR_DB[spare];
    el.querySelector(".pir-steps").innerHTML = `
      <div><b>Client stores</b> parity of ${PIR_HINT.join(", ")} = ${hex(stored)}, and spare ${spare} = ${hex(PIR_DB[spare])}</div>
      <div><b>1 · Request</b> ${request.join(", ")} <small>(${want} swapped for ${spare})</small></div>
      <div><b>2 · Server replies</b> their parity ${hex(reply)}</div>
      <div><b>3 · XOR with the stored parity</b> ${hex(reply ^ stored)} = ${want} ⊕ ${spare}</div>
      <div class="good"><b>4 · XOR with ${spare}</b> ${want} = ${hex(value)} ${value === PIR_DB[want] ? "✓" : "✗"}</div>
      <small>The server saw one position per row and cannot tell which was swapped.</small>`;
  };
  draw();
  if (auto) { let k = 1; setInterval(() => { want = PIR_HINT[k++ % 4]; draw(); }, 2600); }
}

// ---------- the two checksums ----------

function demoSums(el) {
  const server = [4, 7, 1, 9], client = [4, 2, 1, 6];
  el.innerHTML = `<table class="sums"><tr><th></th>${[1, 2, 3, 4].map((g) => `<th>group ${g}</th>`).join("")}<th>sum</th><th>weighted</th></tr>
      <tr class="srv"><th>server</th>${server.map((v, i) => `<td><input type="number" data-i="${i}" value="${v}" aria-label="server group ${i + 1}"></td>`).join("")}<td class="s1"></td><td class="w1"></td></tr>
      <tr><th>client</th>${client.map((v) => `<td class="mono">${v}</td>`).join("")}<td class="s2"></td><td class="w2"></td></tr></table>
    <div class="controls"><label>the two groups that can differ <select class="g">${[[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]].map(([a, b]) => `<option value="${a},${b}"${a === 2 && b === 4 ? " selected" : ""}>${a} and ${b}</option>`).join("")}</select></label></div>
    <div class="msg"></div>
    <p class="hint">Only the two sums travel. Change a server value in the two chosen groups: the client still recovers both differences. Change one in another group and the answer is wrong, which is why the client must know the two groups.</p>`;
  const draw = () => {
    const sv = [...el.querySelectorAll(".srv input")].map((i) => +i.value || 0);
    const sums = (v) => [v.reduce((a, b) => a + b, 0), v.reduce((a, b, i) => a + (i + 1) * b, 0)];
    const [s1, w1] = sums(sv), [s2, w2] = sums(client);
    el.querySelector(".s1").textContent = s1; el.querySelector(".w1").textContent = w1;
    el.querySelector(".s2").textContent = s2; el.querySelector(".w2").textContent = w2;
    const [g, h] = el.querySelector(".g").value.split(",").map(Number);
    const plain = s1 - s2, weighted = w1 - w2;
    const dh = (weighted - g * plain) / (h - g), dg = plain - dh;
    const truth = sv.map((v, i) => v - client[i]);
    const right = truth.every((d, i) => (i === g - 1 ? Math.abs(d - dg) < 1e-9 : i === h - 1 ? Math.abs(d - dh) < 1e-9 : d === 0));
    const msg = el.querySelector(".msg");
    msg.className = `msg ${right ? "good" : "bad"}`;
    msg.textContent = `From ${plain} and ${weighted}: group ${g} differs by ${+dg.toFixed(3)}, group ${h} by ${+dh.toFixed(3)}. ${right ? "Correct." : "Wrong: another group differs too."}`;
  };
  el.querySelectorAll("input, select").forEach((i) => { i.oninput = draw; i.onchange = draw; });
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
  lwe: (el) => demoLWE(el),
  ckks: (el) => demoCKKS(el),
  ckksMini: (el) => demoCKKS(el, { mini: true }),
  pir: (el) => demoPIR(el),
  pirAuto: (el) => demoPIR(el, { auto: true }),
  sums: (el) => demoSums(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
