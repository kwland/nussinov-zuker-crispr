/*
 * Core UI: navigation, the Fold Lab, and the shared helpers that the other
 * chapters (js/chapters.js) build on.
 *
 * The page is one scrolling document, so every canvas is always laid out and
 * measurable. Navigation is anchor links plus a scroll spy that lights the
 * active chapter in the nav and the side rail.
 */

(function () {
  "use strict";

  var $ = function (sel) {
    return document.querySelector(sel);
  };
  var $$ = function (sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  };

  var MODEL_A = "#4fd8e8"; // Nussinov
  var ARC_A = "#4fd8e8";
  var ARC_B = "#e85bb0";
  var SEED = "#ffd166";

  var BASE_COLORS = { A: "#5ee6c5", U: "#ffb454", G: "#7aa2ff", C: "#ff6fa5" };

  var CHAPTERS = ["lab", "analyzer", "designer", "dataset", "check", "learn", "method", "about"];

  var state = { model: "both", nussinov: null, zuker: null, matrixCells: null };
  var viewer = null;
  var foldTimer = null;

  // ------------------------------------------------------- shared helpers

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  function csvCell(value) {
    var text = String(value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function downloadCsv(filename, lines) {
    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function setupCanvas(canvas) {
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, rect.width);
    var h = Math.max(1, rect.height);
    var wantW = Math.floor(w * ratio);
    var wantH = Math.floor(h * ratio);
    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW;
      canvas.height = wantH;
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  /*
   * Arc diagram. Pairs in setA arc above the backbone, setB below, so two
   * folds of the same strand can be compared at a glance.
   */
  function drawArcDiagram(canvas, sequence, setA, setB, options) {
    options = options || {};
    var env = setupCanvas(canvas);
    var ctx = env.ctx;
    var n = sequence.length;
    if (!n) return env;

    var both = !!(setA && setB);
    var pad = 24;
    var baseline = both ? env.h * 0.5 : env.h * 0.76;
    var step = n > 1 ? (env.w - pad * 2) / (n - 1) : 0;

    function xOf(i) {
      return pad + step * i;
    }
    function arc(pairs, color, up, limit) {
      if (!pairs) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = n > 90 ? 1 : 1.5;
      for (var p = 0; p < pairs.length; p++) {
        var x1 = xOf(pairs[p][0]);
        var x2 = xOf(pairs[p][1]);
        var height = Math.min(limit, 12 + (x2 - x1) * 0.42);
        var dir = up ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, baseline + dir * 5);
        ctx.bezierCurveTo(x1, baseline + dir * height, x2, baseline + dir * height, x2, baseline + dir * 5);
        ctx.stroke();
      }
    }

    arc(setA, options.colorA || ARC_A, true, baseline - 12);
    if (both) arc(setB, options.colorB || ARC_B, false, env.h - baseline - 12);

    ctx.strokeStyle = "rgba(160, 190, 205, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xOf(0), baseline);
    ctx.lineTo(xOf(n - 1), baseline);
    ctx.stroke();

    var seedFrom = options.seedFrom != null ? options.seedFrom : -1;
    var seedTo = options.seedTo != null ? options.seedTo : -1;
    var r = n > 120 ? 1.8 : n > 90 ? 2.2 : n > 40 ? 3.8 : 6.2;

    for (var i = 0; i < n; i++) {
      var x = xOf(i);
      ctx.beginPath();
      ctx.fillStyle = BASE_COLORS[sequence[i]] || "#9fb6ad";
      ctx.arc(x, baseline, r, 0, Math.PI * 2);
      ctx.fill();

      if (i >= seedFrom && i < seedTo) {
        ctx.strokeStyle = SEED;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(x, baseline, r + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (r >= 6) {
        ctx.fillStyle = "#080e13";
        ctx.font = "700 8px 'Jost', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sequence[i], x, baseline + 0.5);
      }
    }

    // Marks where the spacer ends and the scaffold begins.
    if (options.divider != null && options.divider > 0 && options.divider < n) {
      var dx = xOf(options.divider) - step / 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dx, 8);
      ctx.lineTo(dx, env.h - 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(200, 220, 230, 0.5)";
      ctx.font = "9px 'Jost', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("scaffold", dx + 5, 14);
    }
    return env;
  }

  function swatch(color, label) {
    return '<span><i class="swatch" style="background:' + color + '"></i>' + label + "</span>";
  }

  window.FoldUI = {
    $: $,
    $$: $$,
    escapeHtml: escapeHtml,
    csvCell: csvCell,
    downloadCsv: downloadCsv,
    setupCanvas: setupCanvas,
    drawArcDiagram: drawArcDiagram,
    swatch: swatch,
    BASE_COLORS: BASE_COLORS,
    ARC_A: ARC_A,
    ARC_B: ARC_B,
    SEED: SEED
  };

  // ------------------------------------------------------------- navigation

  function scrollToSection(id) {
    var target = document.getElementById(id);
    if (!target) return;
    var top = target.getBoundingClientRect().top + window.pageYOffset - 76;
    window.scrollTo({ top: top, behavior: "smooth" });
  }

  function initScrollSpy() {
    var sections = CHAPTERS.map(function (id) {
      return document.getElementById(id);
    }).filter(Boolean);

    function update() {
      $(".masthead").classList.toggle("is-stuck", window.pageYOffset > 40);
      var line = window.innerHeight * 0.35;
      var current = null;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= line) current = sections[i].id;
      }
      $$("[data-nav]").forEach(function (link) {
        link.classList.toggle("is-active", link.dataset.nav === current);
      });
    }

    var ticking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          update();
          ticking = false;
        });
      },
      { passive: true }
    );
    update();
  }

  function closeNav() {
    $(".mainnav").classList.remove("is-open");
    $(".nav-toggle").setAttribute("aria-expanded", "false");
  }

  // ---------------------------------------------------------------- folding

  function runFold() {
    var error = $("#errorText");
    var status = $("#inputStatus");
    error.textContent = "";

    try {
      var seq = RNA.normalize($("#sequenceInput").value);
      $("#charCount").textContent = seq.length;

      if (!seq.length) {
        state.nussinov = null;
        state.zuker = null;
        renderAll();
        status.textContent = "empty";
        status.classList.remove("is-warn");
        return;
      }
      state.nussinov = RNA.nussinov(seq, Number($("#loopLength").value), $("#allowWobble").checked);
      state.zuker = RNA.zuker(seq, $("#allowWobble").checked);
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
    var metrics = $$("#metricGrid .metric");
    metrics[0].classList.toggle("is-dim", state.model === "zuker");
    metrics[0].classList.add("accent-a");
    metrics[1].classList.toggle("is-dim", state.model === "nussinov");
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
      for (var i = start; i < seq.length; i++) if (!paired[i]) open++;
      $("#seedOpen").textContent = Math.round((open / RNA.SEED_LENGTH) * 100) + "%";
    }

    var status = $("#inputStatus");
    var list = $("#warningList");
    list.innerHTML = "";
    if (!fold || !seq.length) {
      status.textContent = "ready";
      status.classList.remove("is-warn");
      return;
    }

    // Guide design rules only mean something for a 20 letter spacer. Suppress
    // them everywhere at once, or the pill counts warnings the panel denies.
    if (seq.length !== 20) {
      status.textContent = "ready";
      status.classList.remove("is-warn");
      list.innerHTML = '<span class="warn-tag ok">Guide checks apply to 20 letter spacers. Try the Analyzer.</span>';
      return;
    }

    var scored = GuideTools.analyzeGuide(seq, {
      algorithm: state.model === "zuker" ? "zuker" : "nussinov",
      withScaffold: false
    });
    status.textContent = scored.flags.length ? scored.flags.length + " to check" : "ready";
    status.classList.toggle("is-warn", scored.flags.length > 0);
    list.innerHTML = scored.flags.length
      ? scored.flags
          .map(function (w) {
            return '<span class="warn-tag">' + escapeHtml(w) + "</span>";
          })
          .join("")
      : '<span class="warn-tag ok">Nothing to flag</span>';
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
      el.textContent = "Type a strand above to fold it.";
      return;
    }
    var parts = [];
    if (state.model !== "zuker") parts.push("Nussinov finds " + n.pairs.length + " pairs");
    if (state.model !== "nussinov") {
      parts.push("Zuker settles at " + z.energy.toFixed(1) + " kcal/mol with " + z.pairs.length + " pairs");
    }
    parts.push(RNA.gcPercent(n.sequence).toFixed(0) + "% G/C");
    var text = parts.join(" · ") + ".";
    if (state.model === "both" && z.pairs.length < n.pairs.length) {
      text +=
        " Zuker makes fewer pairs here. It won't pay the loop cost for a pair that doesn't stack onto anything. Nussinov just counts it anyway.";
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

    $("#agreementPill").textContent = Math.round(cmp.agreement * 100) + "% agree";
    $("#agreementPill").classList.toggle("is-warn", cmp.agreement < 0.5);

    $("#compareStats").innerHTML = [
      stat("Agreed pairs", cmp.shared, "both folders picked these"),
      stat("Nussinov only", cmp.onlyA, "pair counting alone"),
      stat("Zuker only", cmp.onlyB, "energy alone"),
      stat("Zuker energy", z.energy.toFixed(1), "kcal/mol")
    ].join("");

    var note;
    if (cmp.shared === 0 && n.pairs.length) {
      note =
        "They agree on nothing here. That usually means the strand has no stable stem at all, so Nussinov's pairs are an artefact of counting rather than a real shape.";
    } else if (cmp.onlyA > cmp.onlyB) {
      note =
        "Nussinov claims " +
        cmp.onlyA +
        " pair(s) Zuker throws out. Those are usually lone pairs. They're worth +1 if you're just counting, but they cost more in loop energy than the single stack gives back.";
    } else if (cmp.onlyB > 0) {
      note =
        "Zuker makes " +
        cmp.onlyB +
        " pair(s) Nussinov misses, because growing a stem pays for itself even when it does not raise the total count.";
    } else {
      note =
        "Both land on the same shape. That happens when one clean stem dominates, and counting pairs and minimising energy point the same way. Two different methods agreeing is real evidence the shape is right.";
    }
    $("#compareNote").textContent = note;
  }

  function stat(label, value, hint) {
    return (
      '<div class="compare-stat"><span>' +
      label +
      "</span><strong>" +
      value +
      "</strong>" +
      (hint ? '<em class="stat-hint">' + hint + "</em>" : "") +
      "</div>"
    );
  }

  // ------------------------------------------------------------ diagrams

  function drawArcs() {
    var fold = state.nussinov;
    var legend = $("#arcLegend");
    if (!fold || !fold.sequence.length) {
      setupCanvas($("#rnaCanvas"));
      legend.innerHTML = "";
      return;
    }
    var seq = fold.sequence;
    var n = seq.length;
    var both = state.model === "both";
    var seedFrom = n >= RNA.SEED_LENGTH ? n - RNA.SEED_LENGTH : n;

    drawArcDiagram(
      $("#rnaCanvas"),
      seq,
      state.model === "zuker" ? state.zuker.pairs : state.nussinov.pairs,
      both ? state.zuker.pairs : null,
      { seedFrom: seedFrom, seedTo: n, colorA: state.model === "zuker" ? ARC_B : ARC_A }
    );

    var items = [];
    if (state.model !== "zuker") items.push(swatch(ARC_A, "Nussinov" + (both ? " (above)" : "")));
    if (state.model !== "nussinov") items.push(swatch(ARC_B, "Zuker" + (both ? " (below)" : "")));
    if (n >= RNA.SEED_LENGTH) items.push(swatch(SEED, "last 8 letters"));
    legend.innerHTML = items.join("");
  }

  function drawMatrix() {
    var env = setupCanvas($("#matrixCanvas"));
    var ctx = env.ctx;
    var useZuker = state.model === "zuker";

    $("#matrixTitle").textContent = useZuker ? "Zuker grid" : "Nussinov grid";
    $(".matrix-legend").firstElementChild.textContent = useZuker ? "less stable" : "fewer pairs";
    $(".matrix-legend").lastElementChild.textContent = useZuker ? "more stable" : "more pairs";

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

    // Nussinov counts up from 0; Zuker energies run down from 0.
    var best = 1;
    for (var a = 0; a < n; a++) {
      for (var b = a; b < n; b++) {
        var val = useZuker ? -grid[a][b] : grid[a][b];
        if (val > best) best = val;
      }
    }
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if (j < i) ctx.fillStyle = "#080e13";
        else {
          var v = useZuker ? -grid[i][j] : grid[i][j];
          ctx.fillStyle = ramp(Math.max(0, Math.min(1, v / best)));
        }
        ctx.fillRect(ox + j * cell, oy + i * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    if (n <= 60) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
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
    ctx.strokeStyle = SEED;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(ox + (n - 1) * cell, oy, cell, cell);

    state.matrixCells = { n: n, cell: cell, ox: ox, oy: oy, grid: grid, useZuker: useZuker, seq: fold.sequence };
  }

  function ramp(t) {
    var stops = [
      [12, 20, 27],
      [29, 111, 124],
      [79, 216, 232]
    ];
    var seg = t < 0.5 ? 0 : 1;
    var local = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    var from = stops[seg];
    var to = stops[seg + 1];
    return (
      "rgb(" +
      Math.round(from[0] + (to[0] - from[0]) * local) +
      "," +
      Math.round(from[1] + (to[1] - from[1]) * local) +
      "," +
      Math.round(from[2] + (to[2] - from[2]) * local) +
      ")"
    );
  }

  function updateViewer() {
    if (!viewer) return;
    var fold = activeFold();
    if (!fold || !fold.sequence.length) {
      viewer.setModel("", [], 0);
      return;
    }
    var seedStart =
      fold.sequence.length >= RNA.SEED_LENGTH ? fold.sequence.length - RNA.SEED_LENGTH : fold.sequence.length;
    viewer.setModel(fold.sequence, fold.pairs, seedStart);
  }

  // ------------------------------------------------------------ stack table

  function renderStackTable() {
    var rows = [
      ["A", "U", "A", "U"],
      ["A", "U", "U", "A"],
      ["U", "A", "A", "U"],
      ["C", "G", "U", "A"],
      ["C", "G", "A", "U"],
      ["G", "C", "U", "A"],
      ["G", "C", "A", "U"],
      ["C", "G", "G", "C"],
      ["G", "C", "G", "C"],
      ["G", "C", "C", "G"]
    ];
    var values = rows.map(function (r) {
      return RNA.stackEnergy(r[0], r[1], r[2], r[3]);
    });
    var min = Math.min.apply(null, values);

    $("#stackTable").innerHTML = rows
      .map(function (r, index) {
        var energy = values[index];
        var strength = energy / min;
        var duplex = "5'-" + r[0] + r[2] + "-3'\n3'-" + r[1] + r[3] + "-5'";
        return (
          '<div class="stack-cell" style="background: rgba(79, 216, 232, ' +
          (0.03 + strength * 0.12).toFixed(3) +
          ')"><div class="stack-duplex">' +
          duplex +
          '</div><div class="stack-energy" style="color: ' +
          (strength > 0.75 ? MODEL_A : "#fff") +
          '">' +
          energy.toFixed(2) +
          "</div></div>"
        );
      })
      .join("");
  }

  // ---------------------------------------------------------------- reveal

  function observeReveal() {
    if (!("IntersectionObserver" in window)) return;
    var targets = $$(".card:not(.reveal), .summary-stat:not(.reveal)");
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.04 }
    );
    targets.forEach(function (element) {
      element.classList.add("reveal");
      observer.observe(element);
    });
  }
  window.FoldUI.observeReveal = observeReveal;

  // ------------------------------------------------------------------ init

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

    $("#copyStructure").addEventListener("click", function () {
      var fold = state.nussinov;
      if (!fold || !fold.sequence.length) return;
      var text = ">fold_lab_result\n" + fold.sequence + "\n";
      if (state.model !== "zuker") text += state.nussinov.structure + "  (Nussinov, " + state.nussinov.pairs.length + " pairs)\n";
      if (state.model !== "nussinov") text += state.zuker.structure + "  (Zuker, " + state.zuker.energy.toFixed(1) + " kcal/mol)\n";
      var button = $("#copyStructure");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            button.textContent = "Copied";
            setTimeout(function () {
              button.textContent = "Copy";
            }, 1400);
          },
          function () {
            $("#foldInterpretation").textContent = text;
          }
        );
      } else {
        $("#foldInterpretation").textContent = text;
      }
    });

    $("#spinToggle").addEventListener("click", function () {
      this.textContent = viewer.toggleSpin() ? "Pause spin" : "Resume spin";
    });
    $("#resetView").addEventListener("click", function () {
      viewer.resetView();
      $("#spinToggle").textContent = "Pause spin";
    });

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
      hint.textContent =
        "[" + (i + 1) + "," + (j + 1) + "] " + cells.seq.slice(i, j + 1).slice(0, 12) + (j - i > 11 ? "…" : "") + " = " + label;
    });
    $("#matrixCanvas").addEventListener("mouseleave", function () {
      $("#matrixHover").textContent = "hover a cell";
    });

    $$('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function (event) {
        var id = link.getAttribute("href").slice(1);
        if (!id || !document.getElementById(id)) return;
        event.preventDefault();
        closeNav();
        if (id === "top") window.scrollTo({ top: 0, behavior: "smooth" });
        else scrollToSection(id);
      });
    });

    $(".nav-toggle").addEventListener("click", function () {
      var open = $(".mainnav").classList.toggle("is-open");
      this.setAttribute("aria-expanded", String(open));
    });

    /*
     * Drive redraws from a ResizeObserver rather than measuring once at init.
     * At startup the canvas box can still be 0 wide (render blocking webfont
     * CSS), which pinned the backing store to 1px and left the hero blank until
     * the user happened to resize the window.
     */
    if ("ResizeObserver" in window) {
      [
        ["#rnaCanvas", drawArcs],
        ["#matrixCanvas", drawMatrix]
      ].forEach(function (entry) {
        var element = $(entry[0]);
        if (!element) return;
        new ResizeObserver(function () {
          entry[1]();
        }).observe(element);
      });
    }

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      // Backstop for devicePixelRatio changes, which leave the CSS box alone.
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        drawArcs();
        drawMatrix();
        if (viewer) viewer.draw();
      }, 140);
    });
  }

  function init() {
    Hero.create($("#heroCanvas"));
    viewer = Viewer3D.create($("#viewerCanvas"));

    bindEvents();
    initScrollSpy();
    renderStackTable();
    runFold();
    observeReveal();

    if (window.Chapters) window.Chapters.init();
    if (location.hash === "#tool") scrollToSection("lab");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
