// FrontierCS 2 course details and the footer. Loaded before app.js on every page.

const COURSE = {
  code: "FCS2",
  name: "FrontierCS 2",
  short: "FrontierCS 2 · Course",
  byline: "Designed and led by Boxi Yu",
  checked: "Every program here has been run, and every output shown is the real output",
  practice: "run the programs yourself with plain Python 3",
  // Course order for previous / next links.
  lectures: [[0, "Introduction"], [1, "MLSys"], [2, "HPC"], [3, "Architecture"], [4, "Network"], [5, "Theory"],
    [6, "Bioinformatics"], [7, "Machine Learning"], [8, "Database"], [9, "Programming Languages"],
    [10, "Software Engineering"], [11, "Cryptography"], [12, "Security"], [13, "Robotics"]],
};

function renderFooter(root = "") {
  const f = document.querySelector("footer");
  if (!f) return;
  f.innerHTML = `<div class="wrap">
    <p>FrontierCS 2 · Course · Designed and led by <b>Boxi Yu</b> · <a href="${root}about/index.html">About</a></p>
    <p>Tasks, results and case studies from the <a href="https://frontier-cs.org/" target="_blank" rel="noopener">FrontierCS 2 benchmark ↗</a>.
      Results as of October 26, 2026.</p>
  </div>`;
}
