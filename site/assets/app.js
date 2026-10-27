// Shared router and page rendering for every lecture site. Routes: #/ (home) and
// #/<chapter slug>. Each lecture supplies LECTURE and CHAPTERS (chapters.js) and DEMOS
// (demos.js). Course details (code, name, byline) come from COURSE in course.js.


const C = Object.assign({
  code: "COURSE",
  name: "Course",
  short: "Course",
  checked: "Every program here has been run, and every output shown is the real output.",
  practice: "run the programs yourself with plain Python 3",
}, typeof COURSE === "undefined" ? {} : COURSE);
const main = document.getElementById("main");
const pad = (k) => String(k + 1).padStart(2, "0");
const NUMBER_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
let cleanups = [];

function mountDemos(root) {
  root.querySelectorAll("[data-demo]").forEach((d) => {
    const body = d.querySelector(".demo-body") || d;
    DEMOS[d.dataset.demo](body);
  });
  root.querySelectorAll("[data-video]").forEach((v) => {
    const src = v.dataset.video;
    // English and Chinese subtitles sit next to the video as LNN.en.vtt / LNN.zh.vtt (kit/subs.py).
    const base = src.replace(/\.mp4$/, "");
    v.innerHTML = `<video controls preload="metadata" src="${src}"><track kind="subtitles" srclang="en" label="English" src="${base}.en.vtt" default><track kind="subtitles" srclang="zh" label="中文" src="${base}.zh.vtt"></video>
      <div class="vcap">${(LECTURE.videos || {})[src] || ""}</div>`;
    v.querySelector("video").addEventListener("error", () => {
      v.innerHTML = `<div class="missing">The video file is not bundled with this copy of the site.<br>Put it at <code>${src}</code> to play it here.</div>`;
    });
  });
}

function stopTimers() {
  // Demos use setInterval; clear every interval when the page changes.
  const max = setInterval(() => {}, 1000);
  for (let k = 0; k <= max; k++) clearInterval(k);
  cleanups.forEach((f) => f());
  cleanups = [];
}

function renderHome() {
  const L = LECTURE;
  document.title = `${L.title} — ${C.name} Lecture ${L.number}`;
  main.innerHTML = `<div class="wrap">
    <section class="hero">
      <div>
        <span class="pill">${C.name} · Lecture ${L.number}</span>
        <h1>${L.title}<small>${L.tagline}</small></h1>
        <p class="lead">${L.lead}</p>
        <div class="btnrow">
          <a class="btn primary" href="#/${CHAPTERS[0].slug}">Start → Chapter 1 · ${CHAPTERS[0].title}</a>
          <a class="btn" href="#outline">Lecture outline ↓</a>
        </div>
        <p class="meta">${C.byline ? C.byline + " · " : ""}${C.checked} · <a href="../index.html">All lectures</a></p>
      </div>
      <div class="card hero-demo">
        <div class="head"><span>${L.heroLabel}</span><button class="cbtn hero-pause">Pause</button></div>
        <div data-demo="${L.heroDemo}"><div class="demo-body"></div></div>
        <div class="caption">${L.heroCaption}</div>
      </div>
    </section>

    <h2 class="section-title">${L.whyTitle}</h2>
    <p class="section-sub">${L.whySub}</p>
    <div class="why">${L.why.map(([h, p]) => `<div class="card"><h3>${h}</h3><p>${p}</p></div>`).join("")}</div>

    <h2 class="section-title" id="outline">${NUMBER_WORDS[CHAPTERS.length] || CHAPTERS.length} chapters</h2>
    <p class="section-sub">In the order of the lecture. Read them in sequence.</p>
    <div class="chapters">${CHAPTERS.map((c, k) => `
      <a class="card chapcard" href="#/${c.slug}">
        <span class="num">${pad(k)}</span><h3>${c.title}</h3><p>${c.subtitle}</p>
        <div class="tags">${c.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
        <span class="go">Open →</span></a>`).join("")}
    </div>

    <h2 class="section-title">How to use these notes</h2>
    <p class="section-sub">Predict · Run · Investigate · Modify · Make</p>
    <div class="steps">
      <div class="card"><b>STEP 1</b><h3>Read</h3><p>Short sections, each with one idea and the code that goes with it.</p></div>
      <div class="card"><b>STEP 2</b><h3>Predict</h3><p>Answer the amber <b>Predict</b> box before you open the answer.</p></div>
      <div class="card"><b>STEP 3</b><h3>Step through</h3><p>Run each demo one step at a time (← →). Change the inputs and run it again.</p></div>
      <div class="card"><b>STEP 4</b><h3>Practise</h3><p>Finish with the self-check and the exercises in the last chapter.</p></div>
    </div>

    <section class="cta">
      <h2>${L.ctaTitle}</h2>
      <a class="btn primary" href="#/${CHAPTERS[0].slug}">Chapter 1 · ${CHAPTERS[0].title} →</a>
      <p class="meta" style="margin-top:16px">${L.minutes} · best on a laptop for the demos · ${C.practice}</p>
    </section>
  </div>`;
  mountDemos(main);
  // The pause button toggles the hero player by clearing/restarting its timers.
  const btn = main.querySelector(".hero-pause");
  btn.onclick = () => {
    const holder = main.querySelector(`[data-demo="${L.heroDemo}"]`);
    if (btn.textContent === "Pause") { stopTimers(); btn.textContent = "Play"; }
    else { DEMOS[L.heroDemo](holder.querySelector(".demo-body")); btn.textContent = "Pause"; }
  };
}

function heroHTML(c) {
  if (!c.hero) return "";
  if (c.hero === "toc") {
    return `<div class="card hero-demo"><div class="head"><span>The lecture at a glance</span></div>
      ${CHAPTERS.slice(0, -1).map((x, k) => `<a href="#/${x.slug}" style="display:flex;gap:10px;padding:7px 4px;text-decoration:none;color:var(--ink);border-bottom:1px solid var(--line)"><b class="mono" style="color:var(--amber)">${pad(k)}</b><span>${x.title}</span></a>`).join("")}</div>`;
  }
  if (c.hero.startsWith("code:")) {
    return `<div class="card hero-demo"><div class="head"><span>${c.heroCaption}</span></div>${codeBlock(CODE[c.hero.slice(5)])}</div>`;
  }
  return `<div class="card hero-demo"><div data-demo="${c.hero}"><div class="demo-body"></div></div><div class="caption">${c.heroCaption}</div></div>`;
}

function renderChapter(k) {
  const c = CHAPTERS[k];
  document.title = `${c.title} — ${C.name} Lecture ${LECTURE.number} · ${LECTURE.title}`;
  const prev = CHAPTERS[k - 1], next = CHAPTERS[k + 1];
  main.innerHTML = `<div class="wrap">
    <section class="chap-hero">
      <div>
        <span class="pill">Chapter ${pad(k)} · ${c.nav}</span>
        <h1>${c.title}</h1>
        <p class="subtitle">${c.subtitle}</p>
        <p class="abstract">${c.abstract}</p>
      </div>
      ${heroHTML(c)}
    </section>
    <div class="chap-body">
      <nav class="toc" aria-label="In this chapter"><b>IN THIS CHAPTER</b>
        ${c.sections.map((s, j) => `<a href="#/${c.slug}/${s.id}" data-sec="${s.id}">§${k + 1}.${j + 1} ${s.title}</a>`).join("")}
      </nav>
      <article>
        ${c.sections.map((s, j) => `<section id="${s.id}"><h2><span class="sec">§${k + 1}.${j + 1}</span>${s.title}</h2>${s.html}</section>`).join("")}
        <h2 style="font-size:20px">Chapter ${pad(k)} in three lines</h2>
        <div class="takeaways">${c.takeaways.map((t, j) => `<div class="card"><b>${j + 1}</b>${t}</div>`).join("")}</div>
        <div class="pager" style="margin-top:28px">
          ${prev ? `<a class="card" href="#/${prev.slug}"><small>← Previous · ${pad(k - 1)}</small><b>${prev.title}</b></a>` : `<a class="card" href="#/"><small>← Back</small><b>Home</b></a>`}
          ${next ? `<a class="card next" href="#/${next.slug}"><small>Next · ${pad(k + 1)} →</small><b>${next.title}</b></a>` : `<a class="card next" href="#/"><small>Done →</small><b>Back to this lecture&rsquo;s overview</b></a>`}
        </div>
      </article>
    </div>
  </div>`;
  mountDemos(main);
  // Highlight the section in view.
  const links = [...main.querySelectorAll(".toc a")];
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.dataset.sec === e.target.id));
    });
  }, { rootMargin: "-80px 0px -65% 0px" });
  main.querySelectorAll("article section").forEach((s) => obs.observe(s));
  cleanups.push(() => obs.disconnect());
}

function route() {
  stopTimers();
  const [slug, sec] = location.hash.replace(/^#\/?/, "").split("/");
  const k = CHAPTERS.findIndex((c) => c.slug === slug);
  if (k >= 0) renderChapter(k); else renderHome();
  document.querySelectorAll(".chapnav a").forEach((a) => a.classList.toggle("active", a.dataset.slug === slug));
  const target = sec ? document.getElementById(sec) : null;
  if (target) target.scrollIntoView();
  else if (!location.hash.includes("outline")) window.scrollTo(0, 0);
}

// In-page anchors (#outline, toc links) shouldn't re-render the page.
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href^='#']");
  if (!a) return;
  const href = a.getAttribute("href");
  if (href === "#outline") { e.preventDefault(); document.getElementById("outline").scrollIntoView(); return; }
  const m = href.match(/^#\/([^/]+)\/(.+)$/);
  if (m && location.hash.startsWith(`#/${m[1]}`)) {
    e.preventDefault();
    document.getElementById(m[2])?.scrollIntoView();
    history.replaceState(null, "", href);
  }
});

document.querySelector(".brand-text").innerHTML = `<b>${LECTURE.title} · L${String(LECTURE.number).padStart(2, "0")}</b><span>${C.short}</span>`;
document.getElementById("chapnav").innerHTML = CHAPTERS.map((c, k) =>
  `<a href="#/${c.slug}" data-slug="${c.slug}"><span>${pad(k)}</span>${c.nav}</a>`).join("");

// Theme toggle: remembers the choice when storage is available.
const themeBtn = document.getElementById("theme");
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  themeBtn.textContent = dark ? "☀" : "☾";
}
try { applyTheme(localStorage.getItem(`${C.code.toLowerCase()}-theme`)); } catch { applyTheme(null); }
themeBtn.onclick = () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  const t = dark ? "light" : "dark";
  applyTheme(t);
  try { localStorage.setItem(`${C.code.toLowerCase()}-theme`, t); } catch { /* storage unavailable */ }
};

// Reading progress bar.
const bar = document.getElementById("progress");
addEventListener("scroll", () => {
  const h = document.documentElement.scrollHeight - innerHeight;
  bar.style.width = h > 0 ? `${(100 * scrollY) / h}%` : "0";
}, { passive: true });

// Way back to the course home (all lectures), at the left of the top bar on every lecture page.
const homeLink = document.createElement("a");
homeLink.className = "homelink";
homeLink.href = "../index.html";
homeLink.title = "All lectures";
homeLink.innerHTML = `<span aria-hidden="true">←</span><span class="homelink-text">All lectures</span>`;
document.querySelector(".topbar").prepend(homeLink);

addEventListener("hashchange", route);
route();
