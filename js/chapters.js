/*
 * The four data-driven chapters: Guide Analyzer, Designer, Dataset, and Check
 * our work.
 *
 * Data credit: data/model.json, data/guides.json, data/vienna.json and
 * data/references.json come from Thomas Yu's build of this group project
 * (https://tomas-1226.github.io/rna-fold-lab/). See js/guide-tools.js.
 * The folding scored here is our own code.
 */

window.Chapters = (function () {
  "use strict";

  var UI = window.FoldUI;
  var $ = UI.$;
  var $$ = UI.$$;

  // A 262 bp stretch of human EMX1, the standard worked example for Cas9.
  var EMX1 =
    "GAGTCCGAGCAGAAGAAGAAGGGCTCCCATCACATCAACCGGTGGCGCATTGCCACGAAGCAGGCCAATGGGGAGGACATCGATGTCACCTCCAATGACT" +
    "AGGGTGGGCAACCACAAACCCACGAGGGCAGAGTGCTGCTTGCTGCTGGCCAGGCCCCTGCGTGGGCCCAAGCTGGACTCTGGCCACTCCCTGGCCAGGC" +
    "TTTGGGGAGGCCTGGAGTCATGGCCCCACAGGGCTTGAAGCCCGGGGCCGCCATTGACAGAG";

  var MAX_TARGET = 5000;
  var TABLE_LIMIT = 250;

  var state = { guides: [], designer: [], checkDone: false };

  function pct(x) {
    return Math.round(x * 100) + "%";
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

  function summaryStat(label, value, hint) {
    return (
      '<div class="summary-stat"><span>' +
      label +
      "</span><strong>" +
      value +
      "</strong>" +
      (hint ? '<em class="stat-hint">' + hint + "</em>" : "") +
      "</div>"
    );
  }

  // ============================================================== ANALYZER

  function analyzerModel() {
    var checked = $('input[name="analyzerModel"]:checked');
    return checked ? checked.value : "zuker";
  }

  function runAnalyzer() {
    var error = $("#analyzerError");
    var status = $("#analyzerStatus");
    error.textContent = "";

    var raw = $("#spacerInput").value;
    var dna = GuideTools.toDna(raw);
    $("#spacerCount").textContent = dna.length;

    if (!dna.length) {
      status.textContent = "empty";
      status.classList.remove("is-warn");
      $("#analyzerFlags").innerHTML = "";
      $("#analyzerInterpretation").textContent = "Paste a 20 letter spacer above.";
      UI.setupCanvas($("#analyzerCanvas"));
      $("#analyzerLegend").innerHTML = "";
      return;
    }

    var info;
    try {
      info = GuideTools.analyzeGuide(raw, {
        algorithm: analyzerModel(),
        withScaffold: $("#withScaffold").checked
      });
    } catch (err) {
      error.textContent = err.message;
      status.textContent = "check input";
      status.classList.add("is-warn");
      return;
    }

    $("#seedOpennessValue").textContent = pct(info.seedOpenness);
    $("#analyzerGc").textContent = Math.round(info.gcPercent) + "%";
    $("#analyzerEnergy").textContent = info.energy != null ? info.energy.toFixed(2) : "n/a";

    var prediction = GuideTools.predictEfficiency(dna);
    $("#predEfficiency").textContent = prediction ? pct(prediction.value) : "n/a";

    $("#analyzerSpacerSeq").textContent = info.spacer;
    $("#analyzerSpacerStruct").textContent = info.spacerStructure;

    status.textContent = info.flags.length ? info.flags.length + " to check" : "looks fine";
    status.classList.toggle("is-warn", info.flags.length > 0);

    $("#analyzerFlags").innerHTML = info.flags.length
      ? info.flags
          .map(function (f) {
            return '<span class="warn-tag">' + UI.escapeHtml(f) + "</span>";
          })
          .join("")
      : '<span class="warn-tag ok">Nothing to flag</span>';

    var spacerLen = info.spacer.length;
    UI.drawArcDiagram($("#analyzerCanvas"), info.full, info.pairs, null, {
      seedFrom: Math.max(0, spacerLen - GuideTools.SEED_LENGTH),
      seedTo: spacerLen,
      colorA: analyzerModel() === "zuker" ? UI.ARC_B : UI.ARC_A,
      divider: $("#withScaffold").checked ? spacerLen : null
    });
    $("#analyzerLegend").innerHTML = [
      UI.swatch(analyzerModel() === "zuker" ? UI.ARC_B : UI.ARC_A, analyzerModel() === "zuker" ? "Zuker pairs" : "Nussinov pairs"),
      UI.swatch(UI.SEED, "the seed, last 8 letters")
    ].join("");

    var open = Math.round(info.seedOpenness * 100);
    var verdict;
    if (open >= 75) verdict = "The seed is wide open, so it should be free to reach the DNA.";
    else if (open >= 50) verdict = "The seed is mostly open. That is usually good enough.";
    else if (open >= 25) verdict = "Most of the seed is tied up in the fold, which tends to hurt.";
    else verdict = "The seed is almost completely folded up. This guide is likely to work poorly.";

    var scaffoldNote = $("#withScaffold").checked
      ? " Folded together with the scaffold tail, which is the molecule that really exists."
      : " Folded as a bare spacer. The real guide carries a 76 letter tail that can pair with it, so this reading is optimistic.";

    $("#analyzerInterpretation").textContent = open + "% of the seed is free. " + verdict + scaffoldNote;
  }

  function renderModelCard() {
    var meta = GuideTools.modelMeta();
    var statusPill = $("#modelStatus");
    if (!meta) {
      statusPill.textContent = "unavailable";
      statusPill.classList.add("is-warn");
      $("#modelStats").innerHTML = "";
      $("#modelNote").textContent =
        "The efficiency model did not load, so the predicted number is hidden. Everything else on this page still works.";
      return;
    }
    statusPill.textContent = "loaded";
    statusPill.classList.remove("is-warn");

    $("#modelStats").innerHTML = [
      stat("Test accuracy", "ρ " + meta.testSpearman.toFixed(3), "on " + meta.testN.toLocaleString() + " held out guides"),
      stat("G/C alone", "ρ " + meta.baselineGcSpearman.toFixed(3), "the baseline to beat"),
      stat("Without openness", "ρ " + meta.testSpearmanNoOpenness.toFixed(3), "our folding feature adds a little"),
      stat("Weights", meta.params.toLocaleString(), meta.hidden + " hidden units")
    ].join("");

    $("#modelNote").textContent =
      "A small neural net (" +
      meta.hidden +
      " hidden units, " +
      meta.params.toLocaleString() +
      " weights) trained on " +
      meta.trainedOn +
      ". It reads the letter at each position, each neighbouring pair, G/C content, and the seed openness from our own folder. On " +
      meta.testN.toLocaleString() +
      " held out guides it reaches Spearman ρ ≈ " +
      meta.testSpearman.toFixed(3) +
      ", which is modest but real: it beats G/C alone (ρ ≈ " +
      meta.baselineGcSpearman.toFixed(3) +
      "), and adding our folding feature nudges it up from ρ ≈ " +
      meta.testSpearmanNoOpenness.toFixed(3) +
      ". Guessing efficiency from 20 letters is genuinely hard, so treat this as a hint, not an answer. It runs in your browser. The network was trained by Thomas Yu for this project.";
  }

  function initAnalyzer() {
    $("#analyzerForm").addEventListener("submit", function (e) {
      e.preventDefault();
      runAnalyzer();
    });
    $("#spacerInput").addEventListener("input", runAnalyzer);
    $("#withScaffold").addEventListener("change", runAnalyzer);
    $$('input[name="analyzerModel"]').forEach(function (r) {
      r.addEventListener("change", runAnalyzer);
    });
    $$("[data-spacer]").forEach(function (b) {
      b.addEventListener("click", function () {
        $("#spacerInput").value = b.dataset.spacer;
        runAnalyzer();
      });
    });
    if ("ResizeObserver" in window) {
      new ResizeObserver(function () {
        runAnalyzer();
      }).observe($("#analyzerCanvas"));
    }
    runAnalyzer();
  }

  // ============================================================== DESIGNER

  function renderDesigner(rows) {
    var body = $("#designerBody");
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" class="table-empty">No NGG sites found in that sequence.</td></tr>';
      $("#designerStats").innerHTML = "";
      return;
    }
    var clean = rows.filter(function (r) {
      return !r.flags.length;
    }).length;

    $("#designerStats").innerHTML = [
      stat("Guide sites", rows.length, "NGG PAM, both strands"),
      stat("Best predicted", rows[0].efficiency != null ? pct(rows[0].efficiency) : "n/a", "top ranked guide"),
      stat("Clean guides", clean, "nothing flagged")
    ].join("");

    body.innerHTML = rows
      .map(function (r, i) {
        var flags = r.flags.length
          ? r.flags
              .map(function (f) {
                return '<span class="warn-tag tiny">' + UI.escapeHtml(f) + "</span>";
              })
              .join(" ")
          : '<span class="flag-clean">clean</span>';
        return (
          "<tr><td>" +
          (i + 1) +
          '</td><td class="mono">' +
          r.spacer +
          "</td><td>" +
          r.strand +
          "</td><td>" +
          r.position +
          "</td><td>" +
          Math.round(r.gcPercent) +
          "%</td><td>" +
          pct(r.seedOpenness) +
          '</td><td class="num-strong">' +
          (r.efficiency != null ? pct(r.efficiency) : "n/a") +
          "</td><td>" +
          flags +
          '</td><td><button class="chip tiny" type="button" data-open-guide="' +
          r.spacer +
          '">open</button></td></tr>'
        );
      })
      .join("");

    $$("[data-open-guide]").forEach(function (b) {
      b.addEventListener("click", function () {
        $("#spacerInput").value = b.dataset.openGuide;
        runAnalyzer();
        var target = document.getElementById("analyzer");
        window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 76, behavior: "smooth" });
      });
    });
  }

  function runDesigner() {
    var error = $("#designerError");
    var status = $("#designerStatus");
    error.textContent = "";

    var dna = GuideTools.toDna($("#targetInput").value).replace(/[^ACGT]/g, "");
    if (!dna.length) {
      error.textContent = "Paste some target DNA first.";
      return;
    }
    if (dna.length > MAX_TARGET) {
      error.textContent = "That is " + dna.length.toLocaleString() + " bp. This demo handles up to " + MAX_TARGET.toLocaleString() + ".";
      return;
    }

    status.textContent = "folding";
    status.classList.remove("is-warn");

    // Folding every candidate takes a moment, so let the pill paint first.
    setTimeout(function () {
      var t0 = performance.now();
      state.designer = GuideTools.rankGuides(dna);
      var ms = Math.round(performance.now() - t0);
      renderDesigner(state.designer);
      status.textContent = state.designer.length + " found · " + ms + " ms";
    }, 30);
  }

  function initDesigner() {
    $("#designerForm").addEventListener("submit", function (e) {
      e.preventDefault();
      runDesigner();
    });
    $("#targetInput").addEventListener("input", function () {
      $("#targetCount").textContent = GuideTools.toDna($("#targetInput").value).replace(/[^ACGT]/g, "").length;
    });
    $("#designerExample").addEventListener("click", function () {
      $("#targetInput").value = EMX1;
      $("#targetCount").textContent = EMX1.length;
      runDesigner();
    });
    $("#designerClear").addEventListener("click", function () {
      $("#targetInput").value = "";
      $("#targetCount").textContent = "0";
      $("#designerBody").innerHTML = '<tr><td colspan="9" class="table-empty">Paste a target and press Find guides.</td></tr>';
      $("#designerStats").innerHTML = "";
      $("#designerStatus").textContent = "ready";
    });
    $("#designerCsv").addEventListener("click", function () {
      if (!state.designer.length) return;
      var lines = ["rank,spacer_dna,strand,position,pam,gc_percent,seed_openness,predicted_efficiency,flags"];
      state.designer.forEach(function (r, i) {
        lines.push(
          [
            i + 1,
            r.spacer,
            r.strand,
            r.position,
            r.pam || "",
            r.gcPercent.toFixed(0),
            r.seedOpenness.toFixed(3),
            r.efficiency != null ? r.efficiency.toFixed(3) : "",
            r.flags.join(";") || "clean"
          ]
            .map(UI.csvCell)
            .join(",")
        );
      });
      UI.downloadCsv("designed_guides.csv", lines);
    });
  }

  // =============================================================== DATASET

  function binned(guides) {
    // Openness is a fraction of 8 letters, so it lands on 0, 1/8, 2/8 ...
    var bins = {};
    guides.forEach(function (g) {
      var key = Math.round(g.seedOpenness * 8) / 8;
      if (!bins[key]) bins[key] = { sum: 0, n: 0 };
      bins[key].sum += g.activity;
      bins[key].n++;
    });
    return Object.keys(bins)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      })
      .map(function (k) {
        return { openness: k, mean: bins[k].sum / bins[k].n, n: bins[k].n };
      });
  }

  function drawDatasetChart() {
    var canvas = $("#datasetChart");
    if (!canvas) return;
    var env = UI.setupCanvas(canvas);
    var ctx = env.ctx;
    if (!state.guides.length) return;

    var rows = binned(state.guides);
    var padL = 58;
    var padR = 22;
    var padT = 22;
    var padB = 42;
    var plotW = env.w - padL - padR;
    var plotH = env.h - padT - padB;

    ctx.font = "10px 'Jost', system-ui, sans-serif";
    ctx.textBaseline = "middle";

    // y axis 0..100%
    for (var t = 0; t <= 5; t++) {
      var y = padT + plotH - (plotH * t) / 5;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(147,164,177,0.6)";
      ctx.textAlign = "right";
      ctx.fillText(t * 20 + "%", padL - 10, y);
    }

    var barW = plotW / rows.length;
    rows.forEach(function (r, i) {
      var h = plotH * Math.max(0, Math.min(1, r.mean));
      var x = padL + i * barW + barW * 0.22;
      var w = barW * 0.56;
      var y = padT + plotH - h;
      var grad = ctx.createLinearGradient(0, y, 0, padT + plotH);
      grad.addColorStop(0, "#4fd8e8");
      grad.addColorStop(1, "rgba(79,216,232,0.25)");
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);

      ctx.fillStyle = "rgba(238,243,247,0.85)";
      ctx.textAlign = "center";
      ctx.font = "9.5px 'Jost', system-ui, sans-serif";
      ctx.fillText(Math.round(r.mean * 100) + "%", x + w / 2, y - 9);
      ctx.fillStyle = "rgba(147,164,177,0.7)";
      ctx.fillText(Math.round(r.openness * 100) + "%", x + w / 2, padT + plotH + 14);
      ctx.fillStyle = "rgba(147,164,177,0.4)";
      ctx.font = "8.5px 'Jost', system-ui, sans-serif";
      ctx.fillText("n=" + r.n, x + w / 2, padT + plotH + 27);
    });

    ctx.fillStyle = "rgba(147,164,177,0.75)";
    ctx.font = "10px 'Jost', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Seed openness", padL + plotW / 2, env.h - 6);
    ctx.save();
    ctx.translate(13, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Mean efficiency", 0, 0);
    ctx.restore();
  }

  function renderDataset() {
    var guides = state.guides;
    if (!guides.length) {
      $("#datasetCount").textContent = "unavailable";
      $("#datasetFinding").textContent =
        "The dataset did not load, so this chapter is empty. Everything else on this page still works.";
      $("#datasetBody").innerHTML = '<tr><td colspan="6" class="table-empty">Dataset unavailable.</td></tr>';
      return;
    }

    var openness = guides.map(function (g) {
      return g.seedOpenness;
    });
    var activity = guides.map(function (g) {
      return g.activity;
    });
    var gc = guides.map(function (g) {
      return g.gcPercent;
    });

    var rhoOpen = GuideTools.spearman(openness, activity);
    var rhoGc = GuideTools.spearman(gc, activity);
    var genes = {};
    guides.forEach(function (g) {
      genes[g.gene] = true;
    });

    $("#datasetCount").textContent = guides.length.toLocaleString() + " guides";
    $("#datasetStats").innerHTML = [
      summaryStat("Guides", guides.length.toLocaleString(), "with lab measured efficiency"),
      summaryStat("Genes", Object.keys(genes).length.toLocaleString(), "across two screens"),
      summaryStat("Openness vs efficiency", "ρ " + rhoOpen.toFixed(2), "essentially nothing"),
      summaryStat("G/C vs efficiency", "ρ " + rhoGc.toFixed(2), "weak but positive")
    ].join("");

    $("#datasetFinding").textContent =
      "Each bar is the average measured efficiency of every guide at that level of seed openness. If our idea were right, the bars would climb to the right. They do not. Across " +
      guides.length.toLocaleString() +
      " guides the relationship is flat (Spearman ρ ≈ " +
      rhoOpen.toFixed(2) +
      "), so seed openness on its own does not predict how well a guide edits. G/C content does a little better (ρ ≈ " +
      rhoGc.toFixed(2) +
      ") but is still weak. This is a negative result, and it is worth more than a hopeful one: a weak signal on a small sample did not survive a bigger, more varied dataset. What efficiency mostly depends on is the sequence itself, which is what the neural net in chapter 02 picks up on.";

    $("#datasetSource").textContent =
      "Real data. " +
      guides.length.toLocaleString() +
      " guides with lab measured editing efficiency, pooled from two published screens (Doench 2014 and 2016, via CRISPOR / Haeussler 2016), with activity as a within dataset percentile. One caveat worth stating plainly: the seed openness column was precomputed by Thomas Yu's folder, not by the code running on this page, because folding all " +
      guides.length.toLocaleString() +
      " guides live would take about a minute. Our folder agrees with his closely but not perfectly, so these numbers are his. Showing the first " +
      TABLE_LIMIT +
      " rows. Dataset assembled by Thomas Yu for this project.";

    $("#datasetBody").innerHTML = guides
      .slice(0, TABLE_LIMIT)
      .map(function (g) {
        return (
          '<tr><td class="mono">' +
          UI.escapeHtml(g.spacer) +
          "</td><td>" +
          UI.escapeHtml(g.gene) +
          "</td><td>" +
          Math.round(g.gcPercent) +
          "%</td><td>" +
          pct(g.seedOpenness) +
          '</td><td class="num-strong">' +
          pct(g.activity) +
          '</td><td><button class="chip tiny" type="button" data-open-guide="' +
          UI.escapeHtml(g.spacer) +
          '">open</button></td></tr>'
        );
      })
      .join("");

    $$("#datasetBody [data-open-guide]").forEach(function (b) {
      b.addEventListener("click", function () {
        $("#spacerInput").value = b.dataset.openGuide;
        runAnalyzer();
        var target = document.getElementById("analyzer");
        window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 76, behavior: "smooth" });
      });
    });

    drawDatasetChart();
  }

  function initDataset() {
    $("#datasetCsv").addEventListener("click", function () {
      if (!state.guides.length) return;
      var lines = ["spacer,gene,gc_percent,seed_openness,activity_percentile"];
      state.guides.forEach(function (g) {
        lines.push([g.spacer, g.gene, g.gcPercent, g.seedOpenness.toFixed(3), g.activity.toFixed(3)].map(UI.csvCell).join(","));
      });
      UI.downloadCsv("guide_dataset.csv", lines);
    });

    if ("ResizeObserver" in window) {
      new ResizeObserver(function () {
        drawDatasetChart();
      }).observe($("#datasetChart"));
    }

    fetch("data/guides.json")
      .then(function (r) {
        if (!r.ok) throw new Error("no dataset");
        return r.json();
      })
      .then(function (data) {
        // Accept either the bare array or the {source, guides} wrapper.
        state.guides = Array.isArray(data) ? data : data.guides || [];
        renderDataset();
        UI.observeReveal();
      })
      .catch(function () {
        state.guides = [];
        renderDataset();
      });
  }

  // ========================================================= CHECK OUR WORK

  function drawViennaScatter(points, r) {
    var canvas = $("#viennaScatter");
    if (!canvas) return;
    var env = UI.setupCanvas(canvas);
    var ctx = env.ctx;
    if (!points.length) return;

    var padL = 58;
    var padR = 20;
    var padT = 20;
    var padB = 44;
    var plotW = env.w - padL - padR;
    var plotH = env.h - padT - padB;

    var xs = points.map(function (p) {
      return p.vienna;
    });
    var ys = points.map(function (p) {
      return p.mine;
    });
    var xMin = Math.min.apply(null, xs) - 1;
    var xMax = Math.max.apply(null, xs) + 1;
    var yMin = Math.min.apply(null, ys) - 1;
    var yMax = Math.max.apply(null, ys) + 1;

    function px(v) {
      return padL + ((v - xMin) / (xMax - xMin)) * plotW;
    }
    function py(v) {
      return padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    }

    ctx.font = "10px 'Jost', system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (var t = 0; t <= 4; t++) {
      var gx = padL + (plotW * t) / 4;
      var gy = padT + (plotH * t) / 4;
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.moveTo(gx, padT);
      ctx.lineTo(gx, padT + plotH);
      ctx.moveTo(padL, gy);
      ctx.lineTo(padL + plotW, gy);
      ctx.stroke();

      ctx.fillStyle = "rgba(147,164,177,0.6)";
      ctx.textAlign = "center";
      ctx.fillText(Math.round(xMin + ((xMax - xMin) * t) / 4), gx, padT + plotH + 15);
      ctx.textAlign = "right";
      ctx.fillText(Math.round(yMax - ((yMax - yMin) * t) / 4), padL - 10, gy);
    }

    points.forEach(function (p) {
      ctx.fillStyle = "rgba(79,216,232,0.75)";
      ctx.beginPath();
      ctx.arc(px(p.vienna), py(p.mine), 3.4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "rgba(147,164,177,0.75)";
    ctx.textAlign = "center";
    ctx.fillText("ViennaRNA energy (kcal/mol)", padL + plotW / 2, env.h - 8);
    ctx.save();
    ctx.translate(13, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Our energy", 0, 0);
    ctx.restore();

    ctx.fillStyle = "#4fd8e8";
    ctx.textAlign = "left";
    ctx.font = "11px 'Jost', system-ui, sans-serif";
    ctx.fillText("r = " + r.toFixed(2), padL + 10, padT + 12);
  }

  function runCheck() {
    if (state.checkDone) return;
    state.checkDone = true;

    Promise.all([
      fetch("data/references.json").then(function (r) {
        return r.ok ? r.json() : null;
      }),
      fetch("data/vienna.json").then(function (r) {
        return r.ok ? r.json() : null;
      })
    ])
      .then(function (results) {
        var refs = results[0];
        var vienna = results[1];
        if (!refs || !vienna) throw new Error("no reference data");

        var scored = refs.map(function (ref) {
          var mz = RNA.zuker(ref.seq);
          var mn = RNA.nussinov(ref.seq);
          var v = vienna.references[ref.id];
          return {
            ref: ref,
            zukerF1: GuideTools.f1Score(mz.structure, ref.structure),
            nussinovF1: GuideTools.f1Score(mn.structure, ref.structure),
            viennaF1: v ? GuideTools.f1Score(v.structure, ref.structure) : 0,
            zukerStruct: mz.structure,
            nussinovStruct: mn.structure,
            viennaStruct: v ? v.structure : "",
            zukerEnergy: mz.energy,
            viennaEnergy: v ? v.energy : null
          };
        });

        var avg = function (key) {
          return scored.reduce(function (s, r) {
            return s + r[key];
          }, 0) / scored.length;
        };

        $("#checkStats").innerHTML = [
          summaryStat("Answer key shapes", scored.length, "solved in a lab"),
          summaryStat("Our Zuker", avg("zukerF1").toFixed(2), "average accuracy (F1)"),
          summaryStat("Our Nussinov", avg("nussinovF1").toFixed(2), "average accuracy (F1)"),
          summaryStat("ViennaRNA", avg("viennaF1").toFixed(2), "the standard tool")
        ].join("");

        $("#checkCards").innerHTML = scored
          .map(function (s) {
            function row(label, struct, f1, cls) {
              return (
                '<div class="check-row"><div class="check-row-head"><span class="dot-tag ' +
                (cls || "") +
                '">' +
                label +
                '</span><span class="check-f1' +
                (f1 >= 0.99 ? " is-perfect" : f1 < 0.6 ? " is-poor" : "") +
                '">F1 ' +
                f1.toFixed(2) +
                "</span></div><code>" +
                UI.escapeHtml(struct) +
                "</code></div>"
              );
            }
            return (
              '<article class="card check-card"><div class="card-head"><div><p class="kicker">' +
              s.ref.seq.length +
              " letters</p><h3>" +
              UI.escapeHtml(s.ref.name) +
              '</h3></div></div><p class="guide-notes">' +
              UI.escapeHtml(s.ref.note) +
              '</p><div class="check-scroll"><div class="check-row"><div class="check-row-head"><span class="dot-tag">Known shape</span></div><code>' +
              UI.escapeHtml(s.ref.structure) +
              "</code></div>" +
              row("Our Zuker", s.zukerStruct, s.zukerF1, "tag-b") +
              row("Our Nussinov", s.nussinovStruct, s.nussinovF1, "tag-a") +
              row("ViennaRNA", s.viennaStruct, s.viennaF1, "") +
              "</div></article>"
            );
          })
          .join("");

        // 30 real sgRNAs folded by our Zuker and by ViennaRNA.
        var points = vienna.guideSample.map(function (g) {
          var mz = RNA.zuker(g.full);
          return { mine: mz.energy, vienna: g.energy, f1: GuideTools.f1Score(mz.structure, g.structure) };
        });
        var r = GuideTools.pearson(
          points.map(function (p) {
            return p.vienna;
          }),
          points.map(function (p) {
            return p.mine;
          })
        );
        var meanF1 =
          points.reduce(function (s, p) {
            return s + p.f1;
          }, 0) / points.length;

        $("#viennaCorr").textContent = "r = " + r.toFixed(2) + " · " + points.length + " guides";
        drawViennaScatter(points, r);

        $("#viennaNote").textContent =
          "Every dot is one real sgRNA, folded twice: once by ViennaRNA and once by our Zuker. The energies line up at r = " +
          r.toFixed(2) +
          ", and our structures recover " +
          Math.round(meanF1 * 100) +
          "% of ViennaRNA's pairs on average (F1). The dots sit above the diagonal because our energies come out consistently less negative: our loop and wobble tables are simplified, so we under count how much a fold is worth. What matters is that the two move together. ViennaRNA uses the full set of lab measured energies and we do not, so agreeing this closely is a good sign our folder is doing the right thing. ViennaRNA cannot run in a browser, so its numbers here were computed ahead of time by Thomas Yu.";

        if ("ResizeObserver" in window) {
          new ResizeObserver(function () {
            drawViennaScatter(points, r);
          }).observe($("#viennaScatter"));
        }
        UI.observeReveal();
      })
      .catch(function () {
        $("#checkStats").innerHTML = "";
        $("#viennaCorr").textContent = "unavailable";
        $("#viennaNote").textContent =
          "The reference data did not load, so this chapter is empty. Everything else on this page still works.";
      });
  }

  function initCheck() {
    // Folding 30 sgRNAs with the scaffold is about a second of work, so hold
    // off until the reader is actually heading for this chapter.
    var section = document.getElementById("check");
    if (!section || !("IntersectionObserver" in window)) {
      runCheck();
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        if (entries[0].isIntersecting) {
          runCheck();
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(section);

    // Safety net. IntersectionObserver only delivers on a rendering frame, so
    // in a tab that is not painting it may never fire and the chapter would sit
    // on "computing" forever. Compute anyway after a few seconds; runCheck
    // guards itself, so whichever path wins, the work happens once.
    setTimeout(function () {
      if (!state.checkDone) {
        runCheck();
        observer.disconnect();
      }
    }, 5000);
  }

  // ------------------------------------------------------------------ init

  function init() {
    initAnalyzer();
    initDesigner();
    initDataset();
    initCheck();

    GuideTools.loadModel("data/model.json").then(function () {
      renderModelCard();
      runAnalyzer();
    });
  }

  return { init: init, runAnalyzer: runAnalyzer };
})();
