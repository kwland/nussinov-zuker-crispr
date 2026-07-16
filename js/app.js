/*
 * Fold Lab UI wiring.
 *
 * Everything runs client-side: RNA.nussinov / RNA.zuker do the science,
 * Viewer3D draws the structure, Hero draws the masthead helix, and this file
 * connects them to the DOM.
 */

(function () {
  "use strict";

  var $ = function (sel) {
    return document.querySelector(sel);
  };
  var $$ = function (sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  };

  var MODEL_A = "#0e7c7b"; // Nussinov
  var MODEL_B = "#8b2d6b"; // Zuker
  var ARC_A = "#4fd8e8";
  var ARC_B = "#e85bb0";

  var BASE_COLORS = { A: "#5ee6c5", U: "#ffb454", G: "#7aa2ff", C: "#ff6fa5" };

  var state = {
    model: "both",
    dataModel: "nussinov",
    nussinov: null,
    zuker: null,
    guides: [],
    matrixCells: null
  };

  var viewer = null;
  var foldTimer = null;

  // ------------------------------------------------------------------ tabs

  function switchTab(name, options) {
    options = options || {};
    if (!document.querySelector('[data-tab-panel="' + name + '"]')) name = "lab";

    $$("[data-tab]").forEach(function (button) {
      var active = button.dataset.tab === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });

    $$("[data-tab-panel]").forEach(function (panel) {
      var active = panel.dataset.tabPanel === name;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });

    if (options.updateHash !== false) {
      history.replaceState(null, "", "#" + name);
    }

    closeNav();

    // Canvases inside a display:none panel measure as 0, so redraw on reveal.
    if (name === "lab") {
      requestAnimationFrame(function () {
        renderAll();
        if (options.focusInput) $("#sequenceInput").focus();
      });
    } else if (name === "data") {
      requestAnimationFrame(function () {
        drawGuideChart();
      });
    }

    if (options.scroll) {
      var main = document.querySelector("main");
      var top = main.getBoundingClientRect().top + window.pageYOffset - 68;
      window.scrollTo({ top: top, behavior: "smooth" });
    }
  }

  function closeNav() {
    $(".mainnav").classList.remove("is-open");
    $(".nav-toggle").setAttribute("aria-expanded", "false");
  }

  // ------------------------------------------------------------- folding

  function currentSequence() {
    return $("#sequenceInput").value;
  }

  function runFold() {
    var error = $("#errorText");
    var status = $("#inputStatus");
    error.textContent = "";

    var raw = currentSequence();
    var minLoop = Number($("#loopLength").value);
    var wobble = $("#allowWobble").checked;

    try {
      var seq = RNA.normalize(raw);
      $("#charCount").textContent = seq.length;

      if (!seq.length) {
        state.nussinov = null;
        state.zuker = null;
        renderAll();
        status.textContent = "empty";
        status.classList.remove("is-warn");
        return;
      }

      state.nussinov = RNA.nussinov(seq, minLoop, wobble);
      // Zuker's loop tables assume a minimum hairpin of 3, so it ignores the slider.
      state.zuker = RNA.zuker(seq, wobble);
      renderAll();
    } catch (err) {
      error.textContent = err.message;
      status.textContent = "check input";
      status.classList.add("is-warn");
    }
  }

  function scheduleFold() {
    clearTimeout(foldTimer);
    foldTimer = setTimeout(runFold, 180);
  }

  // ------------------------------------------------------------ rendering

  function activeFold() {
    return state.model === "zuker" ? state.zuker : state.nussinov;
  }

  function renderAll() {
    renderMetrics();
    renderDotRows();
    renderInterpretation();
    renderCompare();
    drawArcs();
    drawMatrix();
    updateViewer();
  }

  function renderMetrics() {
    var n = state.nussinov;
    var z = state.zuker;
    var showA = state.model === "nussinov" || state.model === "both";
    var showB = state.model === "zuker" || state.model === "both";

    var metrics = $$("#metricGrid .metric");
    metrics[0].classList.toggle("is-dim", !showA);
    metrics[0].classList.add("accent-a");
    metrics[1].classList.toggle("is-dim", !showB);
    metrics[1].classList.add("accent-b");

    $("#pairCount").textContent = n ? String(n.pairs.length) : "0";
    $("#mfeValue").textContent = z ? z.energy.toFixed(1) : "0.0";

    var fold = activeFold();
    var seq = fold ? fold.sequence : "";
    $("#gcPercent").textContent = seq.length ? RNA.gcPercent(seq).toFixed(0) + "%" : "0%";

    if (!fold || seq.length < RNA.SEED_LENGTH) {
      $("#seedOpen").textContent = "n/a";
    } else {
      var paired = RNA.pairedPositions(fold.pairs);
      var start = seq.length - RNA.SEED_LENGTH;
      var open = 0;
      for (var i = start; i < seq.length; i++) {
        if (!paired[i]) open++;
      }
      $("#seedOpen").textContent = Math.round((open / RNA.SEED_LENGTH) * 100) + "%";
    }

    var status = $("#inputStatus");
    if (!fold || !seq.length) {
      status.textContent = "ready";
      status.classList.remove("is-warn");
      return;
    }
    var scored = RNA.scoreGuide(seq, state.model === "zuker" ? "zuker" : "nussinov");
    status.textContent = scored.warnings.length
      ? scored.warnings.length + " warning" + (scored.warnings.length > 1 ? "s" : "")
      : "ready";
    status.classList.toggle("is-warn", scored.warnings.length > 0);

    var list = $("#warningList");
    list.innerHTML = "";
    if (seq.length !== 20) {
      // Warnings are guide-design rules; they only mean something for a spacer.
      list.innerHTML = '<span class="warn-tag ok">Guide-design checks apply to 20 nt spacers</span>';
      return;
    }
    if (!scored.warnings.length) {
      list.innerHTML = '<span class="warn-tag ok">No design warnings</span>';
    } else {
      list.innerHTML = scored.warnings
        .map(function (w) {
          return '<span class="warn-tag">' + escapeHtml(w) + "</span>";
        })
        .join("");
    }
  }

  function renderDotRows() {
    var fold = activeFold();
    $("#normalizedSequence").textContent = fold ? fold.sequence : "";
    $("#dotBracket").textContent = state.nussinov ? state.nussinov.structure : "";
    $("#dotBracketZuker").textContent = state.zuker ? state.zuker.structure : "";

    $("#nussinovRow").style.display = state.model === "zuker" ? "none" : "flex";
    $("#zukerRow").style.display = state.model === "nussinov" ? "none" : "flex";
  }

  function renderInterpretation() {
    var el = $("#foldInterpretation");
    var n = state.nussinov;
    var z = state.zuker;
    if (!n || !n.sequence.length) {
      el.textContent = "Enter an RNA or DNA sequence to fold it.";
      return;
    }

    var parts = [];
    if (state.model !== "zuker") {
      parts.push("Nussinov finds " + n.pairs.length + " base pairs");
    }
    if (state.model !== "nussinov") {
      parts.push("Zuker settles at " + z.energy.toFixed(1) + " kcal/mol with " + z.pairs.length + " pairs");
    }
    parts.push(RNA.gcPercent(n.sequence).toFixed(0) + "% GC");

    var text = parts.join(" · ") + ".";

    if (state.model === "both" && z.pairs.length < n.pairs.length) {
      text +=
        " Zuker predicts fewer pairs because energy-based folding will not pay the loop cost for pairs that do not stack — Nussinov counts them anyway.";
    }
    el.textContent = text;
  }

  function renderCompare() {
    var card = $("#compareCard");
    if (state.model !== "both" || !state.nussinov || !state.nussinov.sequence.length) {
      card.style.display = "none";
      return;
    }
    card.style.display = "";

    var n = state.nussinov;
    var z = state.zuker;
    var cmp = RNA.comparePairs(n.sequence.length, n.pairs, z.pairs);

    $("#agreementPill").textContent = Math.round(cmp.agreement * 100) + "% agreement";
    $("#agreementPill").classList.toggle("is-warn", cmp.agreement < 0.5);

    $("#compareStats").innerHTML = [
      stat("Shared pairs", cmp.shared),
      stat("Nussinov only", cmp.onlyA),
      stat("Zuker only", cmp.onlyB),
      stat("Zuker MFE", z.energy.toFixed(1) + " kcal/mol")
    ].join("");

    var note;
    if (cmp.shared === 0 && n.pairs.length) {
      note =
        "The two models agree on nothing here. That usually means the sequence has no thermodynamically favourable stem, so Nussinov's pairs are artefacts of counting rather than real structure.";
    } else if (cmp.onlyA > cmp.onlyB) {
      note =
        "Nussinov claims " +
        cmp.onlyA +
        " pair(s) that Zuker rejects. These are typically isolated pairs: they add +1 to a base-pair count, but they cost more loop energy than the single stack repays.";
    } else if (cmp.onlyB > 0) {
      note =
        "Zuker forms " +
        cmp.onlyB +
        " pair(s) Nussinov misses, because extending a stem is energetically favourable even when it does not raise the total pair count.";
    } else {
      note =
        "Both models converge on the same structure. That happens when the fold is dominated by one clean stem, where counting pairs and minimizing energy point the same way.";
    }
    $("#compareNote").textContent = note;
  }

  function stat(label, value) {
    return '<div class="compare-stat"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  // ------------------------------------------------------------ arc diagram

  function setupCanvas(canvas) {
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, rect.width);
    var h = Math.max(1, rect.height);
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function drawArcs() {
    var canvas = $("#rnaCanvas");
    var env = setupCanvas(canvas);
    var ctx = env.ctx;
    var fold = state.nussinov;
    var legend = $("#arcLegend");

    if (!fold || !fold.sequence.length) {
      legend.innerHTML = "";
      return;
    }

    var seq = fold.sequence;
    var n = seq.length;
    var both = state.model === "both";
    var pad = 26;
    var baseline = both ? env.h * 0.5 : env.h * 0.76;
    var step = n > 1 ? (env.w - pad * 2) / (n - 1) : 0;
    var maxUp = baseline - 14;
    var maxDown = env.h - baseline - 14;

    function xOf(i) {
      return pad + step * i;
    }

    function arc(pairs, color, up, limit) {
      ctx.strokeStyle = color;
      ctx.lineWidth = n > 90 ? 1.1 : 1.8;
      for (var p = 0; p < pairs.length; p++) {
        var i = pairs[p][0];
        var j = pairs[p][1];
        var x1 = xOf(i);
        var x2 = xOf(j);
        var width = x2 - x1;
        var height = Math.min(limit, 14 + width * 0.42);
        var dir = up ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, baseline + dir * 6);
        ctx.bezierCurveTo(x1, baseline + dir * height, x2, baseline + dir * height, x2, baseline + dir * 6);
        ctx.stroke();
      }
    }

    if (state.model === "nussinov") {
      arc(state.nussinov.pairs, ARC_A, true, maxUp);
    } else if (state.model === "zuker") {
      arc(state.zuker.pairs, ARC_B, true, maxUp);
    } else {
      arc(state.nussinov.pairs, ARC_A, true, maxUp);
      arc(state.zuker.pairs, ARC_B, false, maxDown);
    }

    // backbone
    ctx.strokeStyle = "rgba(150, 214, 198, 0.3)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(xOf(0), baseline);
    ctx.lineTo(xOf(n - 1), baseline);
    ctx.stroke();

    var seedStart = n >= RNA.SEED_LENGTH ? n - RNA.SEED_LENGTH : n;
    var r = n > 90 ? 2.2 : n > 40 ? 4 : 6.5;

    for (var i = 0; i < n; i++) {
      var x = xOf(i);
      ctx.beginPath();
      ctx.fillStyle = BASE_COLORS[seq[i]] || "#9fb6ad";
      ctx.arc(x, baseline, r, 0, Math.PI * 2);
      ctx.fill();

      if (i >= seedStart) {
        ctx.strokeStyle = "#ffd666";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, baseline, r + 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (r >= 6) {
        ctx.fillStyle = "#06100f";
        ctx.font = "700 8px 'Inter', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(seq[i], x, baseline + 0.5);
      }
    }

    var items = [];
    if (state.model !== "zuker") {
      items.push('<span><i class="swatch" style="background:' + ARC_A + '"></i>Nussinov' + (both ? " (above)" : "") + "</span>");
    }
    if (state.model !== "nussinov") {
      items.push('<span><i class="swatch" style="background:' + ARC_B + '"></i>Zuker' + (both ? " (below)" : "") + "</span>");
    }
    if (n >= RNA.SEED_LENGTH) {
      items.push('<span><i class="swatch" style="background:#ffd666"></i>seed (last 8 nt)</span>');
    }
    legend.innerHTML = items.join("");
  }

  // ---------------------------------------------------------------- matrix

  function drawMatrix() {
    var canvas = $("#matrixCanvas");
    var env = setupCanvas(canvas);
    var ctx = env.ctx;
    var useZuker = state.model === "zuker";

    $("#matrixTitle").textContent = useZuker ? "Zuker energy matrix (W)" : "Nussinov score matrix";
    $(".matrix-legend").firstElementChild.textContent = useZuker ? "0 kcal/mol" : "fewer pairs";
    $(".matrix-legend").lastElementChild.textContent = useZuker ? "most stable" : "more pairs";

    var fold = useZuker ? state.zuker : state.nussinov;
    if (!fold || !fold.sequence.length) {
      state.matrixCells = null;
      return;
    }

    var n = fold.sequence.length;
    var grid = useZuker ? fold.W : fold.dp;
    if (!grid) return;

    var size = Math.min(env.w, env.h);
    var cell = size / n;
    var ox = (env.w - size) / 2;
    var oy = (env.h - size) / 2;

    // Normalize: Nussinov counts up from 0, Zuker energies run down from 0.
    var best = 1;
    for (var a = 0; a < n; a++) {
      for (var b = a; b < n; b++) {
        var val = useZuker ? -grid[a][b] : grid[a][b];
        if (val > best) best = val;
      }
    }

    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var x = ox + j * cell;
        var y = oy + i * cell;
        if (j < i) {
          ctx.fillStyle = "#061715";
        } else {
          var v = useZuker ? -grid[i][j] : grid[i][j];
          var t = Math.max(0, Math.min(1, v / best));
          ctx.fillStyle = ramp(t);
        }
        ctx.fillRect(x, y, Math.ceil(cell), Math.ceil(cell));
      }
    }

    if (n <= 60) {
      ctx.strokeStyle = "rgba(196, 216, 202, 0.08)";
      ctx.lineWidth = 0.5;
      for (var k = 0; k <= n; k++) {
        var p = k * cell;
        ctx.beginPath();
        ctx.moveTo(ox + p, oy);
        ctx.lineTo(ox + p, oy + size);
        ctx.moveTo(ox, oy + p);
        ctx.lineTo(ox + size, oy + p);
        ctx.stroke();
      }
    }

    // The whole-molecule answer lives in the top-right corner.
    ctx.strokeStyle = "#ffd666";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + (n - 1) * cell, oy, cell, cell);

    state.matrixCells = { n: n, cell: cell, ox: ox, oy: oy, grid: grid, useZuker: useZuker, seq: fold.sequence };
  }

  function ramp(t) {
    // dark teal -> mid teal -> cyan
    var stops = [
      [11, 31, 27],
      [20, 107, 98],
      [79, 216, 232]
    ];
    var seg = t < 0.5 ? 0 : 1;
    var local = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    var from = stops[seg];
    var to = stops[seg + 1];
    var r = Math.round(from[0] + (to[0] - from[0]) * local);
    var g = Math.round(from[1] + (to[1] - from[1]) * local);
    var b = Math.round(from[2] + (to[2] - from[2]) * local);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  $("#matrixCanvas").addEventListener("mousemove", function (event) {
    var cells = state.matrixCells;
    var hint = $("#matrixHover");
    if (!cells) return;
    var rect = this.getBoundingClientRect();
    var j = Math.floor((event.clientX - rect.left - cells.ox) / cells.cell);
    var i = Math.floor((event.clientY - rect.top - cells.oy) / cells.cell);
    if (i < 0 || j < 0 || i >= cells.n || j >= cells.n || j < i) {
      hint.textContent = "hover a cell";
      return;
    }
    var v = cells.grid[i][j];
    var label = cells.useZuker ? v.toFixed(1) + " kcal/mol" : v + " pairs";
    hint.textContent = "[" + (i + 1) + "," + (j + 1) + "] " + cells.seq.slice(i, j + 1).slice(0, 12) + (j - i > 11 ? "…" : "") + " = " + label;
  });

  $("#matrixCanvas").addEventListener("mouseleave", function () {
    $("#matrixHover").textContent = "hover a cell";
  });

  // ---------------------------------------------------------------- viewer

  function updateViewer() {
    if (!viewer) return;
    var fold = activeFold();
    if (!fold || !fold.sequence.length) {
      viewer.setModel("", [], 0);
      return;
    }
    var seedStart = fold.sequence.length >= RNA.SEED_LENGTH ? fold.sequence.length - RNA.SEED_LENGTH : fold.sequence.length;
    viewer.setModel(fold.sequence, fold.pairs, seedStart);
  }

  // ----------------------------------------------------------- guide data

  function guideCard(item) {
    var isPlaceholder = item.spacer.indexOf("REPLACE_WITH") !== -1;
    var badgeClass = item.group.indexOf("bad") !== -1 ? "bad" : item.group.indexOf("random") !== -1 ? "random" : "known";

    if (isPlaceholder) {
      return (
        '<article class="guide-card is-placeholder">' +
        '<div class="guide-head"><div><h3>' +
        escapeHtml(item.name) +
        '</h3><p class="guide-notes">' +
        escapeHtml(item.notes) +
        '</p></div><span class="badge ' +
        badgeClass +
        '">' +
        escapeHtml(item.group) +
        "</span></div>" +
        '<p class="sequence-text">' +
        escapeHtml(item.spacer) +
        "</p>" +
        '<p class="guide-notes"><strong>Status:</strong> ' +
        escapeHtml(item.status) +
        "</p>" +
        "</article>"
      );
    }

    var score = RNA.scoreGuide(item.spacer, state.dataModel);
    var seedPct = Math.round(score.seedAccessibility * 100);
    var selfPct = Math.round(Math.min(1, score.selfPairFraction) * 100);

    return (
      '<article class="guide-card">' +
      '<div class="guide-head"><div><h3>' +
      escapeHtml(item.name) +
      '</h3><p class="guide-notes">' +
      escapeHtml(item.notes) +
      '</p></div><span class="badge ' +
      badgeClass +
      '">' +
      escapeHtml(item.group) +
      "</span></div>" +
      '<p class="sequence-text">' +
      escapeHtml(item.spacer) +
      "</p>" +
      '<div class="bar-group">' +
      bar("Seed accessibility", seedPct, false) +
      bar("Self-pair fraction", selfPct, true) +
      "</div>" +
      '<p class="sequence-text">' +
      escapeHtml(score.structure) +
      "</p>" +
      '<p class="guide-notes">' +
      (state.dataModel === "zuker"
        ? "<strong>MFE:</strong> " + score.energy.toFixed(1) + " kcal/mol · "
        : "<strong>Pairs:</strong> " + score.pairCount + " · ") +
      "<strong>GC:</strong> " +
      score.gc.toFixed(0) +
      "% · <strong>Warnings:</strong> " +
      (score.warnings.length ? escapeHtml(score.warnings.join(", ")) : "none") +
      "</p>" +
      '<div class="guide-foot"><button class="btn btn-ghost btn-sm" type="button" data-load-guide="' +
      escapeHtml(item.spacer) +
      '">Load in Fold Lab</button></div>' +
      "</article>"
    );
  }

  function bar(label, pct, warn) {
    return (
      '<div><div class="bar-label"><span>' +
      label +
      "</span><b>" +
      pct +
      '%</b></div><div class="bar-track"><div class="bar-fill' +
      (warn ? " warning" : "") +
      '" style="width:' +
      pct +
      '%"></div></div></div>'
    );
  }

  function renderGuideSummary() {
    var ready = state.guides.filter(function (g) {
      return g.spacer.indexOf("REPLACE_WITH") === -1;
    });
    var scored = ready.map(function (g) {
      return RNA.scoreGuide(g.spacer, state.dataModel);
    });

    var avgSeed = scored.length
      ? scored.reduce(function (s, g) {
          return s + g.seedAccessibility;
        }, 0) / scored.length
      : 0;
    var warnings = scored.reduce(function (s, g) {
      return s + g.warnings.length;
    }, 0);

    var second =
      state.dataModel === "zuker"
        ? {
            label: "Average MFE",
            value: scored.length
              ? (
                  scored.reduce(function (s, g) {
                    return s + g.energy;
                  }, 0) / scored.length
                ).toFixed(1)
              : "0.0"
          }
        : {
            label: "Average pairs",
            value: scored.length
              ? (
                  scored.reduce(function (s, g) {
                    return s + g.pairCount;
                  }, 0) / scored.length
                ).toFixed(1)
              : "0.0"
          };

    $("#guideSummary").innerHTML = [
      '<div class="summary-stat"><span>Ready sequences</span><strong>' + ready.length + "/" + state.guides.length + "</strong></div>",
      '<div class="summary-stat"><span>Average seed open</span><strong>' + Math.round(avgSeed * 100) + "%</strong></div>",
      '<div class="summary-stat"><span>' + second.label + "</span><strong>" + second.value + "</strong></div>",
      '<div class="summary-stat"><span>Design warnings</span><strong>' + warnings + "</strong></div>"
    ].join("");
  }

  function renderGuides() {
    $("#guideCards").innerHTML = state.guides.map(guideCard).join("");
    renderGuideSummary();
    drawGuideChart();
    attachGuideLoaders();
    observeReveal();
  }

  function attachGuideLoaders() {
    $$("[data-load-guide]").forEach(function (button) {
      button.addEventListener("click", function () {
        $("#sequenceInput").value = button.dataset.loadGuide;
        runFold();
        switchTab("lab", { scroll: true });
      });
    });
  }

  function drawGuideChart() {
    var canvas = $("#guideChart");
    if (!canvas) return;
    var env = setupCanvas(canvas);
    var ctx = env.ctx;

    var ready = state.guides.filter(function (g) {
      return g.spacer.indexOf("REPLACE_WITH") === -1;
    });
    if (!ready.length) return;

    var rows = ready.map(function (g) {
      var s = RNA.scoreGuide(g.spacer, state.dataModel);
      return { name: g.name, group: g.group, seed: s.seedAccessibility, self: Math.min(1, s.selfPairFraction) };
    });

    var padL = 148;
    var padR = 60;
    var padT = 26;
    var padB = 30;
    var plotW = env.w - padL - padR;
    var rowH = (env.h - padT - padB) / rows.length;

    // gridlines at 0/25/50/75/100%
    ctx.font = "10px 'Inter', system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (var t = 0; t <= 4; t++) {
      var x = padL + (plotW * t) / 4;
      ctx.strokeStyle = "rgba(150, 214, 198, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padT - 6);
      ctx.lineTo(x, env.h - padB + 4);
      ctx.stroke();
      ctx.fillStyle = "rgba(183, 210, 203, 0.55)";
      ctx.textAlign = "center";
      ctx.fillText(t * 25 + "%", x, env.h - padB + 14);
    }

    rows.forEach(function (row, index) {
      var y = padT + rowH * index;
      var barH = Math.min(11, rowH * 0.3);
      var gap = 4;

      ctx.fillStyle = "rgba(226, 238, 234, 0.82)";
      ctx.font = "600 10.5px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(truncate(row.name, 22), padL - 12, y + rowH / 2 - 1);

      var yA = y + rowH / 2 - barH - gap / 2;
      var yB = y + rowH / 2 + gap / 2;

      ctx.fillStyle = "#4fd8e8";
      ctx.fillRect(padL, yA, Math.max(1, plotW * row.seed), barH);
      ctx.fillStyle = "#e85bb0";
      ctx.fillRect(padL, yB, Math.max(1, plotW * row.self), barH);

      ctx.fillStyle = "rgba(226, 238, 234, 0.7)";
      ctx.font = "10px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(Math.round(row.seed * 100) + "%", padL + plotW * row.seed + 6, yA + barH / 2);
      ctx.fillText(Math.round(row.self * 100) + "%", padL + plotW * row.self + 6, yB + barH / 2);
    });

    // legend
    ctx.textAlign = "left";
    ctx.font = "10px 'Inter', system-ui, sans-serif";
    ctx.fillStyle = "#4fd8e8";
    ctx.fillRect(padL, 8, 14, 4);
    ctx.fillStyle = "rgba(226, 238, 234, 0.7)";
    ctx.fillText("seed accessibility", padL + 20, 10);
    ctx.fillStyle = "#e85bb0";
    ctx.fillRect(padL + 130, 8, 14, 4);
    ctx.fillStyle = "rgba(226, 238, 234, 0.7)";
    ctx.fillText("self-pairing", padL + 150, 10);
  }

  function truncate(text, max) {
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  }

  function downloadCsv() {
    var columns = [
      "name",
      "group",
      "spacer",
      "model",
      "length",
      "gc_percent",
      "pairs",
      "mfe_kcal_mol",
      "self_pair_fraction",
      "dot_bracket",
      "seed_accessibility",
      "warnings",
      "status"
    ];
    var lines = [columns.join(",")];

    state.guides.forEach(function (g) {
      if (g.spacer.indexOf("REPLACE_WITH") !== -1) {
        lines.push(
          [g.name, g.group, g.spacer, state.dataModel, "", "", "", "", "", "", "", "", "needs_sequence"].map(csvCell).join(",")
        );
        return;
      }
      var s = RNA.scoreGuide(g.spacer, state.dataModel);
      lines.push(
        [
          g.name,
          g.group,
          g.spacer,
          state.dataModel,
          s.sequence.length,
          s.gc.toFixed(1),
          s.pairCount,
          s.energy != null ? s.energy.toFixed(2) : "",
          s.selfPairFraction.toFixed(3),
          s.structure,
          s.seedAccessibility.toFixed(3),
          s.warnings.join(";") || "none",
          "ok"
        ]
          .map(csvCell)
          .join(",")
      );
    });

    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "guide_fold_features_" + state.dataModel + ".csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    var text = String(value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  // ------------------------------------------------------------ stack table

  function renderStackTable() {
    var rows = [
      ["A", "U", "A", "U", "AA/UU"],
      ["A", "U", "U", "A", "AU/UA"],
      ["U", "A", "A", "U", "UA/AU"],
      ["C", "G", "U", "A", "CU/GA"],
      ["C", "G", "A", "U", "CA/GU"],
      ["G", "C", "U", "A", "GU/CA"],
      ["G", "C", "A", "U", "GA/CU"],
      ["C", "G", "G", "C", "CG/GC"],
      ["G", "C", "G", "C", "GG/CC"],
      ["G", "C", "C", "G", "GC/CG"]
    ];

    var values = rows.map(function (r) {
      return RNA.stackEnergy(r[0], r[1], r[2], r[3]);
    });
    var min = Math.min.apply(null, values);

    $("#stackTable").innerHTML = rows
      .map(function (r, index) {
        var energy = values[index];
        var strength = energy / min; // 0..1, 1 = most stabilizing
        var duplex = "5'-" + r[0] + r[2] + "-3'\n3'-" + r[1] + r[3] + "-5'";
        return (
          '<div class="stack-cell" style="background: rgba(14, 124, 123, ' +
          (0.05 + strength * 0.16).toFixed(3) +
          ')">' +
          '<div class="stack-duplex">' +
          duplex +
          "</div>" +
          '<div class="stack-energy" style="color: ' +
          (strength > 0.75 ? MODEL_A : "var(--ink)") +
          '">' +
          energy.toFixed(2) +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  // ---------------------------------------------------------------- reveal

  function observeReveal() {
    var targets = $$(
      ".card:not(.reveal), .guide-card:not(.reveal), .summary-stat:not(.reveal)"
    );
    if (!("IntersectionObserver" in window)) return;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    targets.forEach(function (element) {
      element.classList.add("reveal");
      observer.observe(element);
    });
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  // ------------------------------------------------------------------ init

  var FALLBACK_GUIDES = [
    {
      name: "random_control_1",
      group: "random control",
      spacer: "CTTAAGGGTTAAGTAAGTGT",
      status: "ready",
      notes: "Length-matched 20 nt control with moderate GC content."
    },
    {
      name: "bad_high_gc_self_pair",
      group: "bad control",
      spacer: "GCGCGATACGCGTATCGCGC",
      status: "ready",
      notes: "High-GC sequence designed to fold back on itself."
    }
  ];

  function loadGuides() {
    fetch("data/guide_examples.json")
      .then(function (response) {
        if (!response.ok) throw new Error("guide data unavailable");
        return response.json();
      })
      .then(function (data) {
        state.guides = data;
        renderGuides();
      })
      .catch(function () {
        // Keeps the page usable when opened straight from the filesystem.
        state.guides = FALLBACK_GUIDES;
        renderGuides();
      });
  }

  function randomSpacer() {
    var bases = "ACGT";
    var out = "";
    for (var i = 0; i < 20; i++) out += bases[Math.floor(Math.random() * 4)];
    return out;
  }

  function bindEvents() {
    $("#foldForm").addEventListener("submit", function (event) {
      event.preventDefault();
      runFold();
    });

    $("#sequenceInput").addEventListener("input", scheduleFold);

    $("#loopLength").addEventListener("input", function (event) {
      $("#loopLengthValue").textContent = event.target.value;
      scheduleFold();
    });

    $("#allowWobble").addEventListener("change", runFold);

    $("#clearSequence").addEventListener("click", function () {
      $("#sequenceInput").value = "";
      runFold();
    });

    $("#randomGuide").addEventListener("click", function () {
      $("#sequenceInput").value = randomSpacer();
      runFold();
    });

    $$("[data-example]").forEach(function (button) {
      button.addEventListener("click", function () {
        $("#sequenceInput").value = button.dataset.example;
        runFold();
      });
    });

    $$('input[name="model"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        state.model = radio.value;
        renderAll();
      });
    });

    $$('input[name="dataModel"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        state.dataModel = radio.value;
        renderGuides();
      });
    });

    $("#downloadCsv").addEventListener("click", downloadCsv);

    $("#copyStructure").addEventListener("click", function () {
      var fold = state.nussinov;
      if (!fold || !fold.sequence.length) return;
      var text = ">fold_lab_result\n" + fold.sequence + "\n";
      if (state.model !== "zuker") text += state.nussinov.structure + "  (Nussinov, " + state.nussinov.pairs.length + " pairs)\n";
      if (state.model !== "nussinov") text += state.zuker.structure + "  (Zuker, " + state.zuker.energy.toFixed(1) + " kcal/mol)\n";

      var done = function () {
        var button = $("#copyStructure");
        button.textContent = "Copied";
        setTimeout(function () {
          button.textContent = "Copy";
        }, 1400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          $("#foldInterpretation").textContent = text;
        });
      } else {
        $("#foldInterpretation").textContent = text;
      }
    });

    $("#spinToggle").addEventListener("click", function () {
      var spinning = viewer.toggleSpin();
      this.textContent = spinning ? "Pause spin" : "Resume spin";
    });

    $("#resetView").addEventListener("click", function () {
      viewer.resetView();
      $("#spinToggle").textContent = "Pause spin";
    });

    $$("[data-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        switchTab(button.dataset.tab, { scroll: true });
      });
    });

    $$("[data-tab-link]").forEach(function (element) {
      element.addEventListener("click", function (event) {
        event.preventDefault();
        switchTab(element.dataset.tabLink, {
          scroll: true,
          focusInput: element.dataset.focusInput === "true"
        });
      });
    });

    $(".nav-toggle").addEventListener("click", function () {
      var nav = $(".mainnav");
      var open = nav.classList.toggle("is-open");
      this.setAttribute("aria-expanded", String(open));
    });

    window.addEventListener("hashchange", function () {
      switchTab(location.hash.replace("#", "") || "lab", { updateHash: false });
    });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        drawArcs();
        drawMatrix();
        drawGuideChart();
        if (viewer) viewer.draw();
      }, 140);
    });
  }

  function init() {
    Hero.create($("#heroCanvas"));
    viewer = Viewer3D.create($("#viewerCanvas"));

    bindEvents();
    renderStackTable();
    loadGuides();

    // Legacy deep links: the old site used #tool for the lab.
    var hash = location.hash.replace("#", "");
    if (hash === "tool") hash = "lab";
    switchTab(hash || "lab", { updateHash: false });

    runFold();
    observeReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
