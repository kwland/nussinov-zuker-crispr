const canonicalPairs = new Set(["AU", "UA", "GC", "CG"]);
const wobblePairs = new Set(["GU", "UG"]);
const seedLength = 8;

const examples = [
  { label: "Hairpin", sequence: "GGGAAACCC" },
  { label: "Guide control", sequence: "CTTAAGGGTTAAGTAAGTGT" },
  { label: "Bad guide", sequence: "GCGCGATACGCGTATCGCGC" },
];

function normalizeRNA(sequence) {
  const seq = sequence.replace(/\s+/g, "").toUpperCase().replaceAll("T", "U");
  const invalid = [...new Set(seq.replace(/[ACGU]/g, ""))];
  if (invalid.length) {
    throw new Error(`Only A, C, G, U, and T are supported. Found: ${invalid.join(", ")}`);
  }
  return seq;
}

function canPair(left, right, allowWobble) {
  const pair = `${left}${right}`;
  return canonicalPairs.has(pair) || (allowWobble && wobblePairs.has(pair));
}

function dotBracket(length, pairs) {
  const chars = Array(length).fill(".");
  for (const [i, j] of pairs) {
    chars[i] = "(";
    chars[j] = ")";
  }
  return chars.join("");
}

function nussinovFold(sequence, minLoopLength = 3, allowWobble = true) {
  const seq = normalizeRNA(sequence);
  const n = seq.length;
  if (n === 0) {
    return { sequence: seq, score: 0, structure: "", pairs: [], dp: [] };
  }

  const dp = Array.from({ length: n }, () => Array(n).fill(0));
  for (let span = 1; span < n; span += 1) {
    for (let i = 0; i < n - span; i += 1) {
      const j = i + span;
      let best = Math.max(dp[i + 1]?.[j] ?? 0, dp[i][j - 1] ?? 0);

      if (j - i > minLoopLength && canPair(seq[i], seq[j], allowWobble)) {
        best = Math.max(best, (dp[i + 1]?.[j - 1] ?? 0) + 1);
      }

      for (let k = i; k < j; k += 1) {
        best = Math.max(best, (dp[i][k] ?? 0) + (dp[k + 1]?.[j] ?? 0));
      }

      dp[i][j] = best;
    }
  }

  const pairs = [];
  function traceback(i, j) {
    if (i >= j) return;

    if (
      j - i > minLoopLength &&
      canPair(seq[i], seq[j], allowWobble) &&
      dp[i][j] === (dp[i + 1]?.[j - 1] ?? 0) + 1
    ) {
      pairs.push([i, j]);
      traceback(i + 1, j - 1);
      return;
    }

    if (dp[i][j] === (dp[i + 1]?.[j] ?? 0)) {
      traceback(i + 1, j);
      return;
    }

    if (dp[i][j] === (dp[i][j - 1] ?? 0)) {
      traceback(i, j - 1);
      return;
    }

    for (let k = i; k < j; k += 1) {
      if (dp[i][j] === (dp[i][k] ?? 0) + (dp[k + 1]?.[j] ?? 0)) {
        traceback(i, k);
        traceback(k + 1, j);
        return;
      }
    }
  }

  traceback(0, n - 1);
  pairs.sort((a, b) => a[0] - b[0]);
  return { sequence: seq, score: dp[0][n - 1], structure: dotBracket(n, pairs), pairs, dp };
}

function gcPercent(sequence) {
  if (!sequence.length) return 0;
  const gc = [...sequence].filter((base) => base === "G" || base === "C").length;
  return (gc / sequence.length) * 100;
}

function scoreGuide(sequence) {
  const fold = nussinovFold(sequence, 3, true);
  const paired = new Set(fold.pairs.flat());
  const seedStart = Math.max(0, fold.sequence.length - seedLength);
  let seedPaired = 0;
  for (let i = seedStart; i < fold.sequence.length; i += 1) {
    if (paired.has(i)) seedPaired += 1;
  }
  const seedBases = fold.sequence.length - seedStart;
  const seedAccessibility = seedBases ? (seedBases - seedPaired) / seedBases : 0;
  const gc = gcPercent(fold.sequence);
  const warnings = [];
  const dna = fold.sequence.replaceAll("U", "T");
  if (fold.sequence.length !== 20) warnings.push("not 20 nt");
  if (gc < 30) warnings.push("low GC");
  if (gc > 75) warnings.push("high GC");
  if (dna.includes("TTTT")) warnings.push("TTTT run");
  if (seedAccessibility < 0.5) warnings.push("seed mostly paired");
  return {
    ...fold,
    gc,
    seedAccessibility,
    selfPairFraction: fold.sequence.length ? (2 * fold.score) / fold.sequence.length : 0,
    warnings,
  };
}

function switchTab(tabName, updateHash = true) {
  if (!document.querySelector(`[data-tab-panel="${tabName}"]`)) {
    tabName = "tool";
  }

  document.querySelectorAll("[data-tab]").forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    const active = panel.dataset.tabPanel === tabName;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });

  if (updateHash) {
    history.replaceState(null, "", `#${tabName}`);
  }

  if (tabName === "tool") {
    requestAnimationFrame(runFold);
  }
}

function foldInterpretation(score) {
  if (!score.sequence.length) return "Enter an RNA or DNA sequence to start folding.";
  const pieces = [
    `${score.score} predicted base pairs`,
    `${score.gc.toFixed(1)}% GC`,
  ];
  if (score.sequence.length >= seedLength) {
    pieces.push(`${Math.round(score.seedAccessibility * 100)}% of seed bases open`);
  }
  if (score.warnings.length) {
    pieces.push(`warnings: ${score.warnings.join(", ")}`);
  } else {
    pieces.push("no simple guide-design warnings");
  }
  return pieces.join(" · ");
}

function drawRNA(canvas, fold) {
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const n = fold.sequence.length;
  if (!n) return;

  const padding = 32;
  const baseline = rect.height * 0.68;
  const step = n > 1 ? (rect.width - padding * 2) / (n - 1) : 0;
  const positions = Array.from({ length: n }, (_, i) => ({
    x: padding + step * i,
    y: baseline,
  }));

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#cf5b4d";
  for (const [i, j] of fold.pairs) {
    const left = positions[i];
    const right = positions[j];
    const width = right.x - left.x;
    const height = Math.min(rect.height * 0.48, 32 + width * 0.34);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y - 10);
    ctx.bezierCurveTo(left.x, left.y - height, right.x, right.y - height, right.x, right.y - 10);
    ctx.stroke();
  }

  ctx.strokeStyle = "#839188";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  positions.forEach((pos, i) => {
    if (i === 0) ctx.moveTo(pos.x, pos.y);
    else ctx.lineTo(pos.x, pos.y);
  });
  ctx.stroke();

  const seedStart = Math.max(0, n - seedLength);
  positions.forEach((pos, i) => {
    const isSeed = i >= seedStart;
    ctx.beginPath();
    ctx.fillStyle = isSeed ? "#b78222" : "#197c80";
    ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fold.sequence[i], pos.x, pos.y + 0.5);
  });

  ctx.fillStyle = "#5d6861";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Seed bases are gold", padding, 24);
}

function drawMatrix(canvas, fold) {
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.width * ratio));
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, rect.width, rect.width);

  const n = fold.sequence.length;
  if (!n) return;
  const cell = rect.width / n;
  const maxScore = Math.max(1, fold.score);

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const value = j >= i ? fold.dp[i][j] : 0;
      const intensity = value / maxScore;
      const r = Math.round(239 - intensity * 40);
      const g = Math.round(247 - intensity * 118);
      const b = Math.round(242 - intensity * 120);
      ctx.fillStyle = j >= i ? `rgb(${r}, ${g}, ${b})` : "#f2f1ec";
      ctx.fillRect(j * cell, i * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }

  ctx.strokeStyle = "rgba(24, 32, 29, 0.22)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= n; i += 1) {
    const p = i * cell;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, rect.width);
    ctx.moveTo(0, p);
    ctx.lineTo(rect.width, p);
    ctx.stroke();
  }
}

function renderFold(fold) {
  const scored = scoreGuide(fold.sequence);
  document.querySelector("#pairCount").textContent = String(scored.score);
  document.querySelector("#gcPercent").textContent = `${scored.gc.toFixed(1)}%`;
  document.querySelector("#seqLength").textContent = `${fold.sequence.length} nt`;
  document.querySelector("#seedOpen").textContent =
    fold.sequence.length >= seedLength ? `${Math.round(scored.seedAccessibility * 100)}%` : "n/a";
  document.querySelector("#normalizedSequence").textContent = fold.sequence;
  document.querySelector("#dotBracket").textContent = fold.structure;
  document.querySelector("#foldInterpretation").textContent = foldInterpretation(scored);
  document.querySelector("#inputStatus").textContent =
    scored.warnings.length ? `${scored.warnings.length} warning${scored.warnings.length > 1 ? "s" : ""}` : "ready";
  drawRNA(document.querySelector("#rnaCanvas"), fold);
  drawMatrix(document.querySelector("#matrixCanvas"), fold);
}

function runFold() {
  const error = document.querySelector("#errorText");
  error.textContent = "";
  try {
    const fold = nussinovFold(
      document.querySelector("#sequenceInput").value,
      Number(document.querySelector("#loopLength").value),
      document.querySelector("#allowWobble").checked,
    );
    renderFold(fold);
  } catch (err) {
    error.textContent = err.message;
    document.querySelector("#inputStatus").textContent = "check input";
  }
}

function placeholderCard(item) {
  return `
    <article class="guide-card">
      <header>
        <div>
          <h3>${item.name}</h3>
          <p>${item.notes}</p>
        </div>
        <span class="badge known">known</span>
      </header>
      <p class="sequence-text">${item.spacer}</p>
      <p class="warning-text">${item.status}</p>
    </article>
  `;
}

function guideCard(item) {
  if (item.spacer.includes("REPLACE_WITH")) return placeholderCard(item);
  const score = scoreGuide(item.spacer);
  const badgeClass = item.group.includes("bad")
    ? "bad"
    : item.group.includes("random")
      ? "random"
      : "known";
  const warnings = score.warnings.length ? score.warnings.join(", ") : "none";
  return `
    <article class="guide-card">
      <header>
        <div>
          <h3>${item.name}</h3>
          <p>${item.notes}</p>
        </div>
        <span class="badge ${badgeClass}">${item.group}</span>
      </header>
      <p class="sequence-text">${item.spacer}</p>
      <div class="bar-group">
        <div>
          <div class="bar-label"><span>Seed accessibility</span><span>${Math.round(score.seedAccessibility * 100)}%</span></div>
          <div class="bar-track"><div class="bar-fill" style="width: ${score.seedAccessibility * 100}%"></div></div>
        </div>
        <div>
          <div class="bar-label"><span>Self-pair fraction</span><span>${Math.round(score.selfPairFraction * 100)}%</span></div>
          <div class="bar-track"><div class="bar-fill warning" style="width: ${score.selfPairFraction * 100}%"></div></div>
        </div>
      </div>
      <p><strong>Fold:</strong> <span class="sequence-text">${score.structure}</span></p>
      <p class="${warnings === "none" ? "" : "warning-text"}"><strong>Warnings:</strong> ${warnings}</p>
      <button class="secondary-action load-guide" type="button" data-load-guide="${item.spacer}">
        Load guide in Fold Lab
      </button>
    </article>
  `;
}

function renderGuideSummary(data) {
  const ready = data.filter((item) => !item.spacer.includes("REPLACE_WITH"));
  const scored = ready.map((item) => scoreGuide(item.spacer));
  const averageSeed = scored.length
    ? scored.reduce((sum, item) => sum + item.seedAccessibility, 0) / scored.length
    : 0;
  const averagePairs = scored.length
    ? scored.reduce((sum, item) => sum + item.score, 0) / scored.length
    : 0;
  const warnings = scored.reduce((sum, item) => sum + item.warnings.length, 0);
  document.querySelector("#guideSummary").innerHTML = `
    <div class="summary-stat">
      <span>Ready sequences</span>
      <strong>${ready.length}/${data.length}</strong>
    </div>
    <div class="summary-stat">
      <span>Average seed open</span>
      <strong>${Math.round(averageSeed * 100)}%</strong>
    </div>
    <div class="summary-stat">
      <span>Average base pairs</span>
      <strong>${averagePairs.toFixed(1)}</strong>
    </div>
    <div class="summary-stat">
      <span>Design warnings</span>
      <strong>${warnings}</strong>
    </div>
  `;
}

function attachGuideLoaders() {
  document.querySelectorAll("[data-load-guide]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#sequenceInput").value = button.dataset.loadGuide;
      switchTab("tool");
    });
  });
}

async function loadGuides() {
  const container = document.querySelector("#guideCards");
  try {
    const response = await fetch("data/guide_examples.json");
    const data = await response.json();
    container.innerHTML = data.map(guideCard).join("");
    renderGuideSummary(data);
    attachGuideLoaders();
  } catch {
    const fallback = examples.map((example) => ({
          name: example.label,
          group: "demo",
          spacer: example.sequence,
          notes: "Loaded from the built-in demo sequence.",
        }));
    container.innerHTML = fallback.map(guideCard).join("");
    renderGuideSummary(fallback);
    attachGuideLoaders();
  }
}

document.querySelector("#foldForm").addEventListener("submit", (event) => {
  event.preventDefault();
  runFold();
});

document.querySelector("#loopLength").addEventListener("input", (event) => {
  document.querySelector("#loopLengthValue").textContent = event.target.value;
  runFold();
});

document.querySelector("#allowWobble").addEventListener("change", runFold);

document.querySelector("#clearSequence").addEventListener("click", () => {
  document.querySelector("#sequenceInput").value = "";
  runFold();
});

document.querySelector("#copyStructure").addEventListener("click", async () => {
  const sequence = document.querySelector("#normalizedSequence").textContent;
  const structure = document.querySelector("#dotBracket").textContent;
  const text = `${sequence}\n${structure}`;
  try {
    await navigator.clipboard.writeText(text);
    document.querySelector("#foldInterpretation").textContent = "Copied sequence and dot-bracket structure.";
  } catch {
    document.querySelector("#foldInterpretation").textContent = text;
  }
});

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#sequenceInput").value = button.dataset.example;
    runFold();
  });
});

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

document.querySelectorAll("[data-tab-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    switchTab(link.dataset.tabLink);
  });
});

window.addEventListener("resize", () => runFold());
window.addEventListener("hashchange", () => switchTab(location.hash.replace("#", "") || "tool", false));

loadGuides();
switchTab(location.hash.replace("#", "") || "tool", false);
runFold();
