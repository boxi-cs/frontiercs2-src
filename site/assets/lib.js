// Shared helpers: Python highlighting, code blocks, the call-stack stepper and the
// recursion-tree player. Plain scripts (no modules) so index.html also opens from file://.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PY_KW = new Set(("def return if elif else for while in not and or is None True False " +
  "import from as pass break continue lambda try except raise with class yield global").split(" "));
const PY_BUILTIN = new Set("print len range str int list sum min max abs".split(" "));

// Highlight one line of Python. `state.inDoc` carries an open triple-quoted string across lines.
function hlLine(line, state) {
  let out = "";
  let i = 0;
  if (state.inDoc) {
    const end = line.indexOf('"""');
    if (end < 0) return `<span class="tk-str">${esc(line)}</span>`;
    out += `<span class="tk-str">${esc(line.slice(0, end + 3))}</span>`;
    i = end + 3;
    state.inDoc = false;
  }
  if (/^(>>>|\.\.\.)( |$)/.test(line.slice(i))) {
    out += `<span class="tk-prompt">${line.slice(i, i + 3)}</span>`;
    i += 3;
  }
  let prev = "";
  while (i < line.length) {
    const rest = line.slice(i);
    let m;
    if (rest[0] === "#") { out += `<span class="tk-com">${esc(rest)}</span>`; break; }
    if (rest.startsWith('"""')) {
      const end = rest.indexOf('"""', 3);
      if (end < 0) { out += `<span class="tk-str">${esc(rest)}</span>`; state.inDoc = true; break; }
      out += `<span class="tk-str">${esc(rest.slice(0, end + 3))}</span>`; i += end + 3; continue;
    }
    if ((m = rest.match(/^f?("[^"]*"|'[^']*')/))) { out += `<span class="tk-str">${esc(m[0])}</span>`; i += m[0].length; continue; }
    if ((m = rest.match(/^\d[\d_]*(\.\d+)?([eE][-+]?\d+)?/))) { out += `<span class="tk-num">${m[0]}</span>`; i += m[0].length; continue; }
    if ((m = rest.match(/^[A-Za-z_]\w*/))) {
      const w = m[0];
      if (PY_KW.has(w)) out += `<span class="tk-kw">${w}</span>`;
      else if (prev === "def" || PY_BUILTIN.has(w) || /^\s*\(/.test(rest.slice(w.length))) out += `<span class="tk-fn">${w}</span>`;
      else out += w;
      prev = w; i += w.length; continue;
    }
    out += esc(rest[0]);
    if (rest[0] !== " ") prev = rest[0];
    i += 1;
  }
  return out;
}

function hl(code) {
  const state = { inDoc: false };
  return code.replace(/\n$/, "").split("\n").map((l) => hlLine(l, state));
}

// A code panel. kind: "py" (numbered), "repl" (shell session), "out" (plain output).
function codeBlock(code, kind = "py", hlLines = []) {
  const lines = kind === "out" ? code.replace(/\n$/, "").split("\n").map(esc) : hl(code);
  const cls = kind === "py" ? "code" : kind === "out" ? "code nonum out" : "code nonum";
  return `<pre class="${cls}">` + lines.map((l, k) =>
    `<span class="ln${hlLines.includes(k + 1) ? " hl" : ""}" data-n="${k + 1}">${l || " "}</span>`
  ).join("") + "</pre>";
}

// ---------- tracing ----------

// Records snapshots while a hand-written JS twin of the Python function runs.
class Tracer {
  constructor() { this.stack = []; this.out = []; this.snaps = []; }
  push(name, vars, status = "running") {
    const f = { name, vars, status, cls: "" };
    this.stack.push(f);
    return f;
  }
  pop() { this.stack.pop(); }
  snap(line, msg = "", msgCls = "", extra = null) {
    this.snaps.push({
      line, msg, msgCls, extra,
      stack: this.stack.map((f) => ({ ...f, vars: { ...f.vars } })),
      out: this.out.slice(),
    });
  }
}

function fmtVars(vars) {
  return Object.entries(vars).map(([k, v]) => `${k} = ${v}`).join(", ");
}

function frameHTML(f, isTop, isNew) {
  const cls = ["frame", f.cls || (isTop ? "top" : ""), isNew ? "new" : ""].join(" ");
  return `<div class="${cls}"><span class="fname">${esc(f.name)}</span>` +
    (Object.keys(f.vars).length ? ` <span class="vars">${esc(fmtVars(f.vars))}</span>` : "") +
    `<div class="status">${esc(f.status)}</div></div>`;
}

function stackHTML(stack, maxShown = 7, grew = false) {
  let shown = stack.map((f, k) => frameHTML(f, k === stack.length - 1, grew && k === stack.length - 1));
  if (stack.length > maxShown) {
    const keepTop = maxShown - 3;
    const hidden = stack.length - 3 - keepTop;
    shown = [...shown.slice(0, 3),
      `<div class="frame more">… ${hidden} more frame${hidden > 1 ? "s" : ""} …</div>`,
      ...shown.slice(stack.length - keepTop)];
  }
  return shown.join("");
}

// Step-through player shared by every call-stack demo.
// opts: code, build() -> snaps, extraControls (html), onMount(root, rebuild), mini, showConsole,
//       renderExtra(snap) -> html shown above the code/stack grid, stackLabel.
function makeStepper(el, opts) {
  const mini = !!opts.mini;
  el.innerHTML = `
    <div class="sx-extra"></div>
    <div class="stepper${mini ? " mini" : ""}">
      <div><div class="sx-code"></div>${opts.showConsole && !mini ? `<div class="console sx-out"></div>` : ""}</div>
      <div class="stack-wrap"><small><span>${opts.stackLabel || "call stack (newest on top)"}</span><span class="sx-depth"></span></small><div class="stack sx-stack"></div></div>
    </div>
    ${mini ? "" : `<div class="msg sx-msg"></div>
    <div class="controls">
      <button class="cbtn sx-reset" title="Back to the start">⟲ Reset</button>
      <button class="cbtn sx-back" title="Step back (←)">◀ Back</button>
      <button class="cbtn sx-step on" title="Step (→)">Step ▶</button>
      <button class="cbtn sx-play">Play</button>
      ${opts.extraControls || ""}
      <span class="spacer"></span><span class="counter sx-count"></span>
    </div>`}`;
  const $ = (s) => el.querySelector(s);
  let code = typeof opts.code === "function" ? opts.code() : opts.code;
  let snaps = [];
  let i = 0;
  let timer = null;
  let codeLines = [];

  function renderCode() {
    // Mini players drop end-of-line comments so the code fits a narrow card.
    $(".sx-code").innerHTML = codeBlock(mini ? code.replace(/\s+#.*$/gm, "") : code);
    codeLines = [...el.querySelectorAll(".sx-code .ln")];
  }
  function render() {
    const s = snaps[i];
    codeLines.forEach((ln, k) => ln.classList.toggle("hl", k + 1 === s.line));
    const grew = i > 0 && s.stack.length > snaps[i - 1].stack.length;
    $(".sx-stack").innerHTML = stackHTML(s.stack, mini ? 5 : 7, grew);
    $(".sx-depth").textContent = s.stack.length ? `depth ${s.stack.length}` : "";
    if (opts.renderExtra) $(".sx-extra").innerHTML = opts.renderExtra(s);
    if (mini) return;
    const msg = $(".sx-msg");
    msg.innerHTML = s.msg;
    msg.className = "msg sx-msg " + (s.msgCls || "");
    if (opts.showConsole) { const o = $(".sx-out"); o.textContent = s.out.join("\n"); o.scrollTop = o.scrollHeight; }
    $(".sx-count").textContent = `step ${i + 1} / ${snaps.length}`;
    $(".sx-back").disabled = i === 0;
    $(".sx-step").disabled = i === snaps.length - 1;
    $(".sx-reset").disabled = i === 0;
  }
  function stop() {
    clearInterval(timer); timer = null;
    if (!mini) $(".sx-play").textContent = "Play";
  }
  function play() {
    if (timer) return stop();
    if (i === snaps.length - 1) i = 0;
    if (!mini) $(".sx-play").textContent = "Pause";
    timer = setInterval(() => {
      if (i < snaps.length - 1) { i++; render(); }
      else if (mini) { i = 0; render(); }
      else stop();
    }, mini ? 900 : 700);
  }
  function rebuild() {
    stop();
    code = typeof opts.code === "function" ? opts.code() : opts.code;
    renderCode();
    snaps = opts.build();
    i = 0;
    render();
  }
  if (!mini) {
    $(".sx-reset").onclick = () => { stop(); i = 0; render(); };
    $(".sx-back").onclick = () => { stop(); if (i > 0) i--; render(); };
    $(".sx-step").onclick = () => { stop(); if (i < snaps.length - 1) i++; render(); };
    $(".sx-play").onclick = play;
    el.tabIndex = 0;
    el.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "ArrowRight") { e.preventDefault(); $(".sx-step").click(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); $(".sx-back").click(); }
    });
  }
  if (opts.onMount) opts.onMount(el, rebuild);
  rebuild();
  if (mini) play();
  return { rebuild, stop, play, isPlaying: () => !!timer };
}

// ---------- recursion trees ----------

// Lay out a tree: leaves get consecutive slots, a parent sits over the middle of its children.
function layoutTree(root) {
  let slot = 0;
  let maxDepth = 0;
  (function walk(n, d) {
    n.depth = d; maxDepth = Math.max(maxDepth, d);
    if (!n.kids.length) { n.x = slot++; return; }
    n.kids.forEach((k) => walk(k, d + 1));
    n.x = (n.kids[0].x + n.kids[n.kids.length - 1].x) / 2;
  })(root, 0);
  return { slots: slot, depth: maxDepth };
}

// Tree player. build() returns {root, events}; each event is
// {type: "enter"|"exit"|"out", id, value, text, line}. Nodes have {id, label, kids}.
function makeTreePlayer(el, opts) {
  const mini = !!opts.mini;
  el.innerHTML = `
    <div class="svgbox tx-svg"></div>
    ${mini ? "" : `<div class="stepper" style="margin-top:12px">
      <div class="tx-code"></div>
      <div><div class="counter" style="margin-bottom:4px">${opts.outLabel || "output"}</div><div class="console tx-out" style="margin-top:0;max-height:260px"></div></div>
    </div>
    <div class="stats tx-stats"></div>
    <div class="controls">
      <button class="cbtn tx-reset">⟲ Reset</button>
      <button class="cbtn tx-back">◀ Back</button>
      <button class="cbtn tx-step on">Step ▶</button>
      <button class="cbtn tx-play">Play</button>
      <button class="cbtn tx-end">Skip to end</button>
      ${opts.extraControls || ""}
      <span class="spacer"></span><span class="counter tx-count"></span>
    </div>`}`;
  const $ = (s) => el.querySelector(s);
  let tree, events, nodes, i, timer = null, layout, codeLines = [];

  function rebuild() {
    stop();
    ({ root: tree, events } = opts.build());
    nodes = {};
    (function walk(n) { nodes[n.id] = n; n.kids.forEach(walk); })(tree);
    layout = layoutTree(tree);
    i = 0;
    if (!mini) {
      $(".tx-code").innerHTML = codeBlock(typeof opts.code === "function" ? opts.code() : opts.code);
      codeLines = [...el.querySelectorAll(".tx-code .ln")];
    }
    render();
  }
  // State after the first k events.
  function stateAt(k) {
    const st = {}; const val = {}; const out = []; const stack = [];
    let line = 0, calls = 0;
    for (let j = 0; j < k; j++) {
      const e = events[j];
      if (e.type === "enter") { st[e.id] = "active"; stack.push(e.id); calls++; }
      if (e.type === "exit") { st[e.id] = "done"; val[e.id] = e.value; stack.pop(); }
      if (e.type === "out") out.push(e.text);
      if (e.line) line = e.line;
    }
    return { st, val, out, stack, line, calls };
  }
  function render() {
    const s = stateAt(i);
    const W = opts.width || 720;
    const slotW = W / layout.slots;
    const rowH = opts.rowH || 62;
    const H = (layout.depth + 1) * rowH + 10;
    const nodeW = Math.min(opts.nodeW || 88, slotW - 4);
    const top = s.stack[s.stack.length - 1];
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="recursion tree">`;
    const cx = (n) => (n.x + 0.5) * slotW;
    const cy = (n) => n.depth * rowH + 24;
    Object.values(nodes).forEach((n) => n.kids.forEach((k) => {
      const seen = s.st[k.id];
      svg += `<line x1="${cx(n)}" y1="${cy(n) + 14}" x2="${cx(k)}" y2="${cy(k) - 14}" stroke="var(--${seen ? "ink-2" : "line"})" stroke-width="1.4"/>`;
    }));
    Object.values(nodes).forEach((n) => {
      const state = s.st[n.id];
      const isTop = n.id === top;
      const fill = isTop ? "var(--mark)" : state === "active" ? "var(--teal-soft)" : state === "done" ? "var(--card)" : "var(--paper-2)";
      const stroke = isTop ? "var(--amber)" : state === "active" ? "var(--teal)" : state === "done" ? "var(--ink-2)" : "var(--line)";
      const op = state ? 1 : 0.45;
      const fs = opts.fontSize || Math.min(12, Math.max(8, nodeW / 7));
      svg += `<g opacity="${op}"><rect x="${cx(n) - nodeW / 2}" y="${cy(n) - 14}" width="${nodeW}" height="28" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${isTop ? 2 : 1.2}"/>`;
      svg += `<text x="${cx(n)}" y="${cy(n) + 4}" text-anchor="middle" font-size="${fs}" fill="var(--ink)">${esc(n.label)}</text></g>`;
      if (state === "done" && n.id in s.val && s.val[n.id] !== undefined) {
        svg += `<text x="${cx(n)}" y="${cy(n) + 28}" text-anchor="middle" font-size="${Math.max(9, fs - 1)}" font-weight="600" fill="var(--green)">${esc(s.val[n.id])}</text>`;
      }
    });
    svg += "</svg>";
    $(".tx-svg").innerHTML = svg;
    if (mini) return;
    codeLines.forEach((ln, k) => ln.classList.toggle("hl", k + 1 === s.line));
    const o = $(".tx-out"); o.textContent = s.out.join("\n"); o.scrollTop = o.scrollHeight;
    $(".tx-stats").innerHTML = (opts.stats ? opts.stats(s) : []).map(([k, v]) =>
      `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join("");
    $(".tx-count").textContent = `step ${i} / ${events.length}`;
    $(".tx-back").disabled = i === 0;
    $(".tx-reset").disabled = i === 0;
    $(".tx-step").disabled = $(".tx-end").disabled = i === events.length;
  }
  function stop() { clearInterval(timer); timer = null; if (!mini && $(".tx-play")) $(".tx-play").textContent = "Play"; }
  function play() {
    if (timer) return stop();
    if (i === events.length) i = 0;
    if (!mini) $(".tx-play").textContent = "Pause";
    timer = setInterval(() => {
      if (i < events.length) { i++; render(); }
      else if (mini) { i = 0; render(); }
      else stop();
    }, mini ? 380 : 420);
  }
  if (!mini) {
    $(".tx-reset").onclick = () => { stop(); i = 0; render(); };
    $(".tx-back").onclick = () => { stop(); if (i > 0) i--; render(); };
    $(".tx-step").onclick = () => { stop(); if (i < events.length) i++; render(); };
    $(".tx-end").onclick = () => { stop(); i = events.length; render(); };
    $(".tx-play").onclick = play;
  }
  if (opts.onMount) opts.onMount(el, rebuild);
  rebuild();
  if (mini) play();
  return { rebuild, stop };
}

function parseNums(text, fallback) {
  const xs = String(text).split(/[\s,]+/).filter(Boolean).map(Number).filter((x) => Number.isFinite(x));
  return xs.length ? xs.map((x) => Math.trunc(x)) : fallback;
}
