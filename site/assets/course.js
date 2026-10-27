// FrontierCS 2 course details and the footer. Loaded before app.js on every page.

const COURSE = {
  code: "FCS2",
  name: "FrontierCS 2",
  short: "FrontierCS 2 · Course",
  byline: "Designed and led by Boxi Yu",
  checked: "Every program here has been run, and every output shown is the real output",
  practice: "run the programs yourself with plain Python 3",
};

function renderFooter(root = "") {
  const f = document.querySelector("footer");
  if (!f) return;
  f.innerHTML = `<div class="wrap">
    <p>FrontierCS 2 · Course · Designed and led by <b>Boxi Yu</b></p>
    <p>Tasks, results and case studies from the <a href="https://frontier-cs.org/" target="_blank" rel="noopener">FrontierCS 2 benchmark ↗</a>.
      Results as of October 26, 2026.</p>
  </div>`;
}
