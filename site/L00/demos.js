// L00 demos. The JS models repeat the Python programs in frontiercs2/notes/L00-introduction.md
// (checked by tools/check.py); CODE and OUT come from code.js, generated from the same notes.

// ---------- hero: the life of a task ----------

const ANATOMY = [
  ["Paper + released code", "A paper and the repository its authors released."],
  ["Delete the contribution", "The builders remove the paper's key idea. The authors' code becomes the human reference."],
  ["Agent writes it back", "Five hours. Each train call returns a development score and one message."],
  ["Judge on hidden workloads", "Only the final submission is run, on workloads the agent never saw."],
  ["Pass or fail", "Pass only if it beats the reference on every metric of every hidden workload."],
];

function demoAnatomy(el, { auto = true } = {}) {
  let k = 0;
  el.innerHTML = `<div class="anat">${ANATOMY.map(([t, s], i) => `<div class="anat-step" data-i="${i}">
      <span class="anat-n">${i + 1}</span><div><b>${t}</b><small>${s}</small></div></div>`).join("")}</div>`;
  const steps = [...el.querySelectorAll(".anat-step")];
  const show = () => steps.forEach((s, i) => { s.classList.toggle("on", i === k); s.classList.toggle("done", i < k); });
  steps.forEach((s, i) => { s.onclick = () => { k = i; show(); }; });
  show();
  if (auto) setInterval(() => { k = (k + 1) % ANATOMY.length; show(); }, 2200);
}

// ---------- picking the final version ----------

const RUN = [[35, 31.0, 30.2], [80, 38.5, 37.9], [140, 41.0, 40.1], [210, 44.2, 36.0], [275, 42.8, 41.6]];
const REFERENCE_HIDDEN = 40.0;

function demoPick(el) {
  let chosen = null;
  el.innerHTML = `<div class="svgbox chart"></div>
    <div class="controls">${RUN.map(([m], i) => `<button class="cbtn sub" data-i="${i}">Submit minute ${m}</button>`).join("")}</div>
    <div class="msg">The agent saw only the blue development scores. Pick its final submission.</div>`;
  const W = 560, H = 210, x = (m) => 40 + (m / 300) * (W - 60), y = (s) => H - 30 - ((s - 25) / 25) * (H - 50);
  const draw = () => {
    const pts = (k) => RUN.map((r) => `${x(r[0])},${y(r[k])}`).join(" ");
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Development and hidden scores of five submissions">`;
    [25, 30, 35, 40, 45, 50].forEach((s) => { svg += `<line x1="40" x2="${W - 20}" y1="${y(s)}" y2="${y(s)}" stroke="var(--line)"/><text x="32" y="${y(s) + 4}" font-size="10" text-anchor="end" fill="var(--stone)">${s}</text>`; });
    svg += `<line x1="40" x2="${W - 20}" y1="${y(REFERENCE_HIDDEN)}" y2="${y(REFERENCE_HIDDEN)}" stroke="var(--ink)" stroke-dasharray="4 3"/>
      <text x="${W - 22}" y="${y(REFERENCE_HIDDEN) - 5}" font-size="10" text-anchor="end" fill="var(--ink)">human reference, hidden 40.0</text>
      <polyline points="${pts(1)}" fill="none" stroke="var(--teal)" stroke-width="2"/>`;
    if (chosen !== null) svg += `<polyline points="${pts(2)}" fill="none" stroke="var(--amber)" stroke-width="2" stroke-dasharray="5 3"/>`;
    RUN.forEach(([m, dev, hid], i) => {
      svg += `<circle cx="${x(m)}" cy="${y(dev)}" r="${i === chosen ? 7 : 5}" fill="var(--teal)" stroke="var(--paper)" stroke-width="2"/>
        <text x="${x(m)}" y="${y(dev) - 11}" font-size="10" text-anchor="middle" fill="var(--teal)">${dev}</text>
        <text x="${x(m)}" y="${H - 10}" font-size="10" text-anchor="middle" fill="var(--stone)">min ${m}</text>`;
      if (chosen !== null) svg += `<circle cx="${x(m)}" cy="${y(hid)}" r="4" fill="var(--amber)"/>`;
    });
    el.querySelector(".chart").innerHTML = svg + "</svg>";
    el.querySelectorAll(".sub").forEach((b) => b.classList.toggle("on", +b.dataset.i === chosen));
  };
  el.querySelectorAll(".sub").forEach((b) => {
    b.onclick = () => {
      chosen = +b.dataset.i;
      const [m, dev, hid] = RUN[chosen], ok = hid > REFERENCE_HIDDEN;
      const msg = el.querySelector(".msg");
      msg.className = `msg ${ok ? "good" : "bad"}`;
      msg.textContent = `Final: minute ${m}, development ${dev}. Hidden score ${hid}: ${ok ? "above" : "below"} the reference's 40.0. The amber line shows every version's hidden score, which the agent never saw.`;
      draw();
    };
  });
  draw();
}

// ---------- a pass rule with a margin ----------

function demoMargin(el) {
  el.innerHTML = `<div class="controls">
      <label>latency <input class="lat" type="range" min="85" max="105" step="0.5" value="97"><b class="mono vl"></b></label>
      <label>PSNR <input class="ps" type="range" min="28.5" max="31" step="0.1" value="30.4"><b class="mono vp"></b></label>
      <label>margin <select class="mg"><option>0.96</option><option>0.98</option><option>1.00</option></select></label>
    </div><div class="stats"></div><div class="msg"></div>
    <p class="hint">Reference: latency 100, PSNR 30.0 dB. The 0.5 dB quality band is our example; each task page lists its real rules.</p>`;
  const draw = () => {
    const lat = +el.querySelector(".lat").value, ps = +el.querySelector(".ps").value, mg = +el.querySelector(".mg").value;
    el.querySelector(".vl").textContent = lat.toFixed(1);
    el.querySelector(".vp").textContent = ps.toFixed(1);
    const okL = lat <= mg * 100, okP = ps >= 30 - 0.5;
    el.querySelector(".stats").innerHTML = `
      <div class="stat ${okL ? "good" : "bad"}"><small>latency ≤ ${(mg * 100).toFixed(0)}</small><b>${okL ? "beat" : "miss"}</b></div>
      <div class="stat ${okP ? "good" : "bad"}"><small>PSNR ≥ 29.5</small><b>${okP ? "beat" : "miss"}</b></div>`;
    const msg = el.querySelector(".msg"), ok = okL && okP;
    msg.className = `msg ${ok ? "good" : "bad"}`;
    msg.textContent = ok ? "Pass on this workload. A task repeats these checks on every hidden workload." :
      `Fail. ${!okL ? `${(100 - lat).toFixed(1)}% faster is not enough; the rule asks for ${((1 - mg) * 100).toFixed(0)}%. ` : ""}${!okP ? "The quality dropped more than the band allows." : ""}`;
  };
  el.querySelectorAll("input, select").forEach((i) => { i.oninput = draw; i.onchange = draw; });
  draw();
}

// ---------- a toy FCI-style fit ----------

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function fitTable(table, zero, steps = 2000, rate = 0.1, shrink = 0.1) {
  const models = Object.keys(table), n = table[models[0]].length;
  const ability = Object.fromEntries(models.map((m) => [m, 0]));
  let difficulty = Array(n).fill(0);
  for (let s = 0; s < steps; s++) {
    const ga = Object.fromEntries(models.map((m) => [m, -shrink * ability[m]]));
    const gd = difficulty.map((d) => -shrink * d);
    for (const m of models) for (let t = 0; t < n; t++) {
      const miss = table[m][t] - sigmoid(ability[m] - difficulty[t]);
      ga[m] += miss; gd[t] -= miss;
    }
    for (const m of models) ability[m] += rate * ga[m];
    difficulty = difficulty.map((d, t) => d + rate * gd[t]);
  }
  const shift = ability[zero];
  return [Object.fromEntries(models.map((m) => [m, ability[m] - shift])), difficulty.map((d) => d - shift)];
}

function demoFit(el) {
  const table = { "Model A": [1, 1, 1, 0, 1], "Model B": [1, 1, 0, 0, 0], "Model Z": [1, 0, 0, 0, 0] };
  const start = JSON.stringify(table);
  el.innerHTML = `<div class="fit-grid"></div><div class="fit-bars"></div>
    <div class="controls"><button class="cbtn add">Add Model D</button><button class="cbtn reset">Reset</button></div>
    <p class="hint">Click a cell to switch pass and miss. Model Z is the zero point, like Kimi K2.7 on the real FCI.</p>`;
  const draw = () => {
    const [ability, difficulty] = fitTable(table, "Model Z");
    const tasks = difficulty.map((_, t) => `T${t + 1}`);
    el.querySelector(".fit-grid").innerHTML = `<table class="fit"><tr><th></th>${tasks.map((t, i) => `<th>${t}<small>FDI ${difficulty[i].toFixed(1)}</small></th>`).join("")}<th>ability</th></tr>
      ${Object.entries(table).map(([m, row]) => `<tr><th>${m}</th>${row.map((v, t) => `<td><button class="fit-cell ${v ? "p" : "m"}" data-m="${m}" data-t="${t}" aria-label="${m} ${tasks[t]} ${v ? "pass" : "miss"}">${v ? "pass" : "miss"}</button></td>`).join("")}<td class="mono"><b>${ability[m].toFixed(1)}</b></td></tr>`).join("")}</table>`;
    const lo = Math.min(...Object.values(ability), ...difficulty), hi = Math.max(...Object.values(ability), ...difficulty);
    const pos = (v) => (100 * (v - lo)) / (hi - lo || 1);
    // Equal values share one label ("A, D"), so labels never sit on top of each other.
    const group = (pairs) => {
      const g = [];
      pairs.forEach(([name, v]) => {
        const hit = g.find((x) => Math.abs(x.v - v) < 0.05);
        if (hit) hit.names.push(name); else g.push({ v, names: [name] });
      });
      return g;
    };
    const dots = (pairs, cls) => group(pairs).map(({ v, names }) =>
      `<span class="dot ${cls}" style="left:${pos(v)}%">${names.join(", ")} · ${v.toFixed(1)}</span>`).join("");
    el.querySelector(".fit-bars").innerHTML = `<div class="scale">
      ${dots(Object.entries(ability).map(([m, a]) => [m.replace("Model ", ""), a]), "model")}
      ${dots(difficulty.map((d, t) => [`T${t + 1}`, d]), "task")}
      </div><p class="hint">One scale. Models (blue, above) and tasks (grey, below): a model passes a task more often the further right of the task it sits.</p>`;
    el.querySelectorAll(".fit-cell").forEach((b) => {
      b.onclick = () => { const r = table[b.dataset.m]; r[+b.dataset.t] = 1 - r[+b.dataset.t]; draw(); };
    });
    el.querySelector(".add").disabled = "Model D" in table;
  };
  // Model D passes every task but T4, as in Exercise 3.
  el.querySelector(".add").onclick = () => { table["Model D"] = [1, 1, 1, 0, 1]; draw(); };
  el.querySelector(".reset").onclick = () => {
    Object.keys(table).forEach((k) => delete table[k]);
    Object.assign(table, JSON.parse(start));
    draw();
  };
  draw();
}

// ---------- test-time scaling ----------

const SCALE_RUNS = [[0.8, true], [2.5, false], [4.0, true], [7.3, true], [12.0, false], [25.9, true]];

function demoBudget(el) {
  el.innerHTML = `<div class="controls"><label>budget per run <input class="bud" type="range" min="0" max="100" value="50"><b class="mono vb"></b></label></div>
    <div class="runs"></div><div class="stats"></div>`;
  const toBudget = (v) => Math.round(0.5 * Math.pow(60, v / 100) * 10) / 10;  // $0.5 to $30, log scale
  const draw = () => {
    const b = toBudget(+el.querySelector(".bud").value);
    el.querySelector(".vb").textContent = `$${b.toFixed(1)}`;
    el.querySelector(".runs").innerHTML = SCALE_RUNS.map(([c, p], i) => {
      const inside = c <= b, counts = p && inside;
      return `<div class="run ${counts ? "yes" : inside ? "no" : "cut"}"><b>Run ${i + 1}</b><span>$${c.toFixed(1)} · ${p ? "passes" : "fails"}</span>
        <small>${!inside ? "stopped at the budget: no final submission" : counts ? "counts as a pass" : "ended in budget, failed"}</small></div>`;
    }).join("");
    const rate = SCALE_RUNS.filter(([c, p]) => p && c <= b).length / SCALE_RUNS.length;
    el.querySelector(".stats").innerHTML = `<div class="stat"><small>pass rate at $${b.toFixed(1)}</small><b>${Math.round(rate * 100)}%</b></div>
      <div class="stat"><small>with no budget</small><b>67%</b></div>`;
  };
  el.querySelector(".bud").oninput = draw;
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
  anatomy: (el) => demoAnatomy(el),
  anatomyStill: (el) => demoAnatomy(el, { auto: false }),
  pick: (el) => demoPick(el),
  margin: (el) => demoMargin(el),
  fit: (el) => demoFit(el),
  budget: (el) => demoBudget(el),
  quiz: (el) => demoQuiz(el, QUIZ),
};
