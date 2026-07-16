/*
 * RNA secondary-structure prediction: Nussinov and Zuker.
 *
 * Two models are implemented side by side because they optimize different
 * objectives:
 *
 *   Nussinov  maximizes the COUNT of non-crossing base pairs. Every allowed
 *             pair is worth +1. Transparent, but not physical.
 *
 *   Zuker     minimizes FREE ENERGY (kcal/mol) using nearest-neighbour
 *             thermodynamics: stacking stabilizes, loops cost.
 *
 * PARAMETER PROVENANCE — read before quoting numbers in a report:
 *
 *   - Watson-Crick stacking energies are the published Turner/Xia nearest-
 *     neighbour values (Xia et al. 1998, Turner & Mathews 2010), in kcal/mol
 *     at 37 C. These 10 values are exact.
 *
 *   - G-U wobble stacks, loop initiation tables, and the multiloop model are
 *     SIMPLIFIED approximations of the Turner rules. They reproduce the right
 *     qualitative ordering but are not the exact published tables. Each is
 *     flagged with an APPROXIMATION comment below.
 *
 *   Consequence: predicted structures are usually reasonable, but the absolute
 *   kcal/mol will not match ViennaRNA exactly. ViennaRNA/RNAfold remains the
 *   reference implementation for any quantitative claim.
 */

window.RNA = (function () {
  "use strict";

  var CANONICAL = { AU: 1, UA: 1, GC: 1, CG: 1 };
  var WOBBLE = { GU: 1, UG: 1 };

  var MIN_LOOP = 3; // minimum unpaired bases enclosed by a hairpin
  var MAX_LEN = 300; // guard: both algorithms are polynomial, keep the UI responsive
  var MAX_INTERNAL = 30; // Turner convention: internal loops larger than this are ignored
  var EPS = 1e-7; // float tolerance for traceback equality tests

  // ---------------------------------------------------------------- sequence

  function normalize(sequence) {
    var seq = String(sequence || "")
      .replace(/\s+/g, "")
      .toUpperCase()
      .replace(/T/g, "U");
    var invalid = [];
    for (var i = 0; i < seq.length; i++) {
      var ch = seq[i];
      if (ch !== "A" && ch !== "C" && ch !== "G" && ch !== "U" && invalid.indexOf(ch) === -1) {
        invalid.push(ch);
      }
    }
    if (invalid.length) {
      throw new Error("Only A, C, G, U (and T, read as U) are supported. Found: " + invalid.join(", "));
    }
    if (seq.length > MAX_LEN) {
      throw new Error("Sequence is " + seq.length + " nt. This browser demo folds up to " + MAX_LEN + " nt.");
    }
    return seq;
  }

  function canPair(a, b, allowWobble) {
    var key = a + b;
    return CANONICAL[key] === 1 || (allowWobble !== false && WOBBLE[key] === 1);
  }

  function isWobble(a, b) {
    return WOBBLE[a + b] === 1;
  }

  function dotBracket(n, pairs) {
    var chars = new Array(n);
    for (var i = 0; i < n; i++) chars[i] = ".";
    for (var p = 0; p < pairs.length; p++) {
      chars[pairs[p][0]] = "(";
      chars[pairs[p][1]] = ")";
    }
    return chars.join("");
  }

  function matrix(n, fill) {
    var m = new Array(n);
    for (var i = 0; i < n; i++) {
      m[i] = new Array(n);
      for (var j = 0; j < n; j++) m[i][j] = fill;
    }
    return m;
  }

  // ---------------------------------------------------------------- Nussinov

  /*
   * N[i,j] = max( N[i+1,j],
   *               N[i,j-1],
   *               N[i+1,j-1] + pair(i,j),
   *               max_k N[i,k] + N[k+1,j] )
   */
  function nussinov(sequence, minLoop, allowWobble) {
    var seq = normalize(sequence);
    var n = seq.length;
    if (minLoop == null) minLoop = MIN_LOOP;
    if (allowWobble == null) allowWobble = true;
    if (n === 0) return { sequence: "", score: 0, structure: "", pairs: [], dp: [] };

    var dp = matrix(n, 0);

    for (var span = 1; span < n; span++) {
      for (var i = 0; i + span < n; i++) {
        var j = i + span;
        var best = Math.max(dp[i + 1][j], dp[i][j - 1]);

        if (j - i > minLoop && canPair(seq[i], seq[j], allowWobble)) {
          best = Math.max(best, dp[i + 1][j - 1] + 1);
        }
        for (var k = i; k < j; k++) {
          var split = dp[i][k] + dp[k + 1][j];
          if (split > best) best = split;
        }
        dp[i][j] = best;
      }
    }

    var pairs = [];
    var stack = [[0, n - 1]];
    while (stack.length) {
      var frame = stack.pop();
      var a = frame[0];
      var b = frame[1];
      if (a >= b) continue;

      if (b - a > minLoop && canPair(seq[a], seq[b], allowWobble) && dp[a][b] === dp[a + 1][b - 1] + 1) {
        pairs.push([a, b]);
        stack.push([a + 1, b - 1]);
        continue;
      }
      if (dp[a][b] === dp[a + 1][b]) {
        stack.push([a + 1, b]);
        continue;
      }
      if (dp[a][b] === dp[a][b - 1]) {
        stack.push([a, b - 1]);
        continue;
      }
      for (var s = a; s < b; s++) {
        if (dp[a][b] === dp[a][s] + dp[s + 1][b]) {
          stack.push([a, s]);
          stack.push([s + 1, b]);
          break;
        }
      }
    }

    pairs.sort(function (x, y) {
      return x[0] - y[0];
    });
    return { sequence: seq, score: dp[0][n - 1], structure: dotBracket(n, pairs), pairs: pairs, dp: dp };
  }

  // ------------------------------------------------------- Zuker energy model

  var RT37 = 0.6163; // kcal/mol at 37 C
  var LOOP_SCALE = 1.75 * RT37; // Jacobson-Stockmayer extrapolation coefficient

  /*
   * Watson-Crick nearest-neighbour stacking, kcal/mol at 37 C (Xia et al. 1998).
   * Key "WX/ZY" means the duplex 5'-W X-3' paired with 3'-Z Y-5', i.e. the pair
   * (W,Z) stacked directly on the pair (X,Y). These 10 values are exact.
   */
  var WC_STACKS = [
    ["AA/UU", -0.93],
    ["AU/UA", -1.1],
    ["UA/AU", -1.33],
    ["CU/GA", -2.08],
    ["CA/GU", -2.11],
    ["GU/CA", -2.24],
    ["GA/CU", -2.35],
    ["CG/GC", -2.36],
    ["GG/CC", -3.26],
    ["GC/CG", -3.42]
  ];

  /*
   * APPROXIMATION. Real Turner wobble parameters are context-dependent (tandem
   * G-U in particular has special-case tables). We collapse them to two flat
   * values that preserve the ordering: wobble stacks are weaker than any
   * Watson-Crick stack, and tandem wobbles are weaker still.
   */
  var WOBBLE_SINGLE_STACK = -1.3;
  var WOBBLE_TANDEM_STACK = -0.5;

  // Terminal A-U / G-U penalty applied at the end of a helix (Turner: +0.45).
  var TERMINAL_AU = 0.45;
  // APPROXIMATION: Turner applies a distinct A-U/G-U closure cost inside internal loops.
  var INTERNAL_TERMINAL_AU = 0.7;

  /*
   * Linear multiloop model: a + b*branches + c*unpaired.
   *
   * b is NEGATIVE — each extra branch is rewarded, not punished. That looks
   * wrong but is the Turner 2004 convention, and it is load-bearing: with a
   * positive b the model nests tRNA's arms into a chain instead of opening the
   * four-way junction. At b = -0.9 the tRNA-Phe fold recovers the accepted
   * cloverleaf (stems of 7/4/5/5, ~86% positional agreement). See the tRNA-Phe
   * example on the site.
   *
   * APPROXIMATION: the real Turner multiloop term is not strictly linear.
   */
  var ML_CLOSE = 3.4;
  var ML_BRANCH = -0.9;
  var ML_UNPAIRED = 0.0;

  // Loop initiation tables (Turner-style, kcal/mol). Sizes beyond the table are
  // extrapolated logarithmically.
  var HAIRPIN_INIT = { 3: 5.4, 4: 5.6, 5: 5.7, 6: 5.4, 7: 6.0, 8: 5.5, 9: 6.4 };
  var BULGE_INIT = { 1: 3.8, 2: 2.8, 3: 3.2, 4: 3.6, 5: 4.0, 6: 4.4 };
  // APPROXIMATION: sizes 2-3 (1x1, 1x2 loops) use special tables in Turner; flattened here.
  var INTERNAL_INIT = { 2: 1.5, 3: 1.6, 4: 1.7, 5: 1.8, 6: 2.0 };

  var STACK = {};
  (function buildStackTable() {
    for (var s = 0; s < WC_STACKS.length; s++) {
      var parts = WC_STACKS[s][0].split("/");
      var value = WC_STACKS[s][1];
      var W = parts[0][0];
      var X = parts[0][1];
      var Z = parts[1][0];
      var Y = parts[1][1];
      // Key layout: outer pair (W,Z) then inner pair (X,Y) -> "W X Z Y".
      STACK[W + X + Z + Y] = value;
      // A duplex read from the opposite strand is the same duplex: WX/ZY == YZ/XW.
      STACK[Y + Z + X + W] = value;
    }
  })();

  function terminalPenalty(a, b) {
    return CANONICAL[a + b] === 1 && (a === "G" || a === "C") ? 0 : TERMINAL_AU;
  }

  function internalTerminalPenalty(a, b) {
    return CANONICAL[a + b] === 1 && (a === "G" || a === "C") ? 0 : INTERNAL_TERMINAL_AU;
  }

  function stackEnergy(a1, b1, a2, b2) {
    var wc = STACK[a1 + a2 + b1 + b2];
    if (wc !== undefined) return wc;
    var wobbles = (isWobble(a1, b1) ? 1 : 0) + (isWobble(a2, b2) ? 1 : 0);
    if (wobbles >= 2) return WOBBLE_TANDEM_STACK;
    if (wobbles === 1) return WOBBLE_SINGLE_STACK;
    return 0;
  }

  function extrapolate(table, size, anchor) {
    if (table[size] !== undefined) return table[size];
    return table[anchor] + LOOP_SCALE * Math.log(size / anchor);
  }

  function hairpinInit(size) {
    if (size < 3) return Infinity;
    return extrapolate(HAIRPIN_INIT, size, 9);
  }

  function bulgeInit(size) {
    return extrapolate(BULGE_INIT, size, 6);
  }

  function internalInit(size) {
    if (size < 2) return Infinity;
    return extrapolate(INTERNAL_INIT, size, 6);
  }

  /*
   * Zuker MFE folding.
   *
   *   V[i,j]  = MFE of i..j GIVEN that i pairs with j
   *   W[i,j]  = MFE of i..j with no constraint (exterior context)
   *   WM[i,j] = MFE of i..j inside a multiloop, at least one branch
   */
  function zuker(sequence, allowWobble) {
    var seq = normalize(sequence);
    var n = seq.length;
    if (allowWobble == null) allowWobble = true;
    if (n === 0) {
      return { sequence: "", energy: 0, structure: "", pairs: [], V: [], W: [] };
    }

    var V = matrix(n, Infinity);
    var W = matrix(n, 0);
    var WM = matrix(n, Infinity);

    function hairpin(i, j) {
      var size = j - i - 1;
      if (size < MIN_LOOP) return Infinity;
      return hairpinInit(size) + terminalPenalty(seq[i], seq[j]);
    }

    // Energy of the loop closed by (i,j) with inner pair (k,l): stack, bulge, or internal.
    function loopEnergy(i, j, k, l) {
      var l1 = k - i - 1;
      var l2 = j - l - 1;
      var total = l1 + l2;

      if (total === 0) {
        return stackEnergy(seq[i], seq[j], seq[k], seq[l]);
      }
      if (l1 === 0 || l2 === 0) {
        var e = bulgeInit(total);
        if (total === 1) {
          // A single bulged base does not break the helix: the stack survives.
          e += stackEnergy(seq[i], seq[j], seq[k], seq[l]);
        } else {
          e += terminalPenalty(seq[i], seq[j]) + terminalPenalty(seq[k], seq[l]);
        }
        return e;
      }
      var ie = internalInit(total);
      // APPROXIMATION: Turner's asymmetry term uses a fitted coefficient and cap.
      ie += Math.min(3.0, 0.6 * Math.abs(l1 - l2));
      ie += internalTerminalPenalty(seq[i], seq[j]) + internalTerminalPenalty(seq[k], seq[l]);
      return ie;
    }

    for (var span = 1; span < n; span++) {
      for (var i = 0; i + span < n; i++) {
        var j = i + span;

        // ---- V
        var v = Infinity;
        if (j - i - 1 >= MIN_LOOP && canPair(seq[i], seq[j], allowWobble)) {
          v = hairpin(i, j);

          for (var k = i + 1; k <= j - MIN_LOOP - 2; k++) {
            var l1 = k - i - 1;
            if (l1 > MAX_INTERNAL) break;
            for (var l = j - 1; l > k + MIN_LOOP; l--) {
              var l2 = j - l - 1;
              if (l1 + l2 > MAX_INTERNAL) break;
              if (V[k][l] === Infinity) continue;
              var cand = loopEnergy(i, j, k, l) + V[k][l];
              if (cand < v) v = cand;
            }
          }

          for (var m = i + 2; m < j - 1; m++) {
            if (WM[i + 1][m] === Infinity || WM[m + 1][j - 1] === Infinity) continue;
            var ml = WM[i + 1][m] + WM[m + 1][j - 1] + ML_CLOSE + ML_BRANCH + terminalPenalty(seq[i], seq[j]);
            if (ml < v) v = ml;
          }
        }
        V[i][j] = v;

        // ---- WM
        var wm = Infinity;
        if (V[i][j] !== Infinity) {
          wm = V[i][j] + ML_BRANCH + terminalPenalty(seq[i], seq[j]);
        }
        if (WM[i + 1][j] !== Infinity && WM[i + 1][j] + ML_UNPAIRED < wm) wm = WM[i + 1][j] + ML_UNPAIRED;
        if (WM[i][j - 1] !== Infinity && WM[i][j - 1] + ML_UNPAIRED < wm) wm = WM[i][j - 1] + ML_UNPAIRED;
        for (var q = i; q < j; q++) {
          if (WM[i][q] === Infinity || WM[q + 1][j] === Infinity) continue;
          var mm = WM[i][q] + WM[q + 1][j];
          if (mm < wm) wm = mm;
        }
        WM[i][j] = wm;

        // ---- W (exterior loop: unpaired bases are free)
        var w = 0;
        if (W[i + 1][j] < w) w = W[i + 1][j];
        if (W[i][j - 1] < w) w = W[i][j - 1];
        if (V[i][j] !== Infinity) {
          var closed = V[i][j] + terminalPenalty(seq[i], seq[j]);
          if (closed < w) w = closed;
        }
        for (var r = i; r < j; r++) {
          var sp = W[i][r] + W[r + 1][j];
          if (sp < w) w = sp;
        }
        W[i][j] = w;
      }
    }

    // ---- traceback
    var pairs = [];

    function eq(a, b) {
      if (a === Infinity || b === Infinity) return false;
      return Math.abs(a - b) < EPS;
    }

    function traceW(i, j) {
      if (j - i < MIN_LOOP + 1) return;
      if (eq(W[i][j], W[i + 1][j])) return traceW(i + 1, j);
      if (eq(W[i][j], W[i][j - 1])) return traceW(i, j - 1);
      if (V[i][j] !== Infinity && eq(W[i][j], V[i][j] + terminalPenalty(seq[i], seq[j]))) {
        pairs.push([i, j]);
        return traceV(i, j);
      }
      for (var k = i; k < j; k++) {
        if (eq(W[i][j], W[i][k] + W[k + 1][j])) {
          traceW(i, k);
          traceW(k + 1, j);
          return;
        }
      }
    }

    function traceV(i, j) {
      var v = V[i][j];
      if (v === Infinity) return;
      if (eq(v, hairpin(i, j))) return;

      for (var k = i + 1; k <= j - MIN_LOOP - 2; k++) {
        var l1 = k - i - 1;
        if (l1 > MAX_INTERNAL) break;
        for (var l = j - 1; l > k + MIN_LOOP; l--) {
          var l2 = j - l - 1;
          if (l1 + l2 > MAX_INTERNAL) break;
          if (V[k][l] === Infinity) continue;
          if (eq(v, loopEnergy(i, j, k, l) + V[k][l])) {
            pairs.push([k, l]);
            return traceV(k, l);
          }
        }
      }

      for (var m = i + 2; m < j - 1; m++) {
        if (WM[i + 1][m] === Infinity || WM[m + 1][j - 1] === Infinity) continue;
        if (eq(v, WM[i + 1][m] + WM[m + 1][j - 1] + ML_CLOSE + ML_BRANCH + terminalPenalty(seq[i], seq[j]))) {
          traceWM(i + 1, m);
          traceWM(m + 1, j - 1);
          return;
        }
      }
    }

    function traceWM(i, j) {
      if (i >= j) return;
      var wm = WM[i][j];
      if (wm === Infinity) return;
      if (V[i][j] !== Infinity && eq(wm, V[i][j] + ML_BRANCH + terminalPenalty(seq[i], seq[j]))) {
        pairs.push([i, j]);
        return traceV(i, j);
      }
      if (WM[i + 1][j] !== Infinity && eq(wm, WM[i + 1][j] + ML_UNPAIRED)) return traceWM(i + 1, j);
      if (WM[i][j - 1] !== Infinity && eq(wm, WM[i][j - 1] + ML_UNPAIRED)) return traceWM(i, j - 1);
      for (var k = i; k < j; k++) {
        if (WM[i][k] === Infinity || WM[k + 1][j] === Infinity) continue;
        if (eq(wm, WM[i][k] + WM[k + 1][j])) {
          traceWM(i, k);
          traceWM(k + 1, j);
          return;
        }
      }
    }

    traceW(0, n - 1);
    pairs.sort(function (a, b) {
      return a[0] - b[0];
    });

    return {
      sequence: seq,
      energy: W[0][n - 1],
      structure: dotBracket(n, pairs),
      pairs: pairs,
      V: V,
      W: W
    };
  }

  // ------------------------------------------------------- CRISPR guide layer

  var SEED_LENGTH = 8; // PAM-proximal seed for SpCas9

  function gcPercent(seq) {
    if (!seq.length) return 0;
    var gc = 0;
    for (var i = 0; i < seq.length; i++) {
      if (seq[i] === "G" || seq[i] === "C") gc++;
    }
    return (gc / seq.length) * 100;
  }

  function pairedPositions(pairs) {
    var set = {};
    for (var i = 0; i < pairs.length; i++) {
      set[pairs[i][0]] = true;
      set[pairs[i][1]] = true;
    }
    return set;
  }

  /*
   * Turn a fold into guide-design features. The biological premise: a spacer
   * that pairs with itself, especially across the PAM-proximal seed, has less
   * of that seed available to interrogate the DNA target.
   */
  function scoreGuide(sequence, model) {
    var fold = model === "zuker" ? zuker(sequence) : nussinov(sequence);
    var seq = fold.sequence;
    var n = seq.length;
    var paired = pairedPositions(fold.pairs);

    var seedStart = Math.max(0, n - SEED_LENGTH);
    var seedBases = n - seedStart;
    var seedPaired = 0;
    for (var i = seedStart; i < n; i++) {
      if (paired[i]) seedPaired++;
    }
    var seedAccessibility = seedBases ? (seedBases - seedPaired) / seedBases : 0;

    var gc = gcPercent(seq);
    var pairCount = fold.pairs.length;
    var selfPairFraction = n ? (2 * pairCount) / n : 0;

    var warnings = [];
    var dna = seq.replace(/U/g, "T");
    if (n !== 20) warnings.push("not 20 nt");
    if (gc < 30) warnings.push("low GC");
    if (gc > 75) warnings.push("high GC");
    if (dna.indexOf("TTTT") !== -1) warnings.push("poly-T (U6 termination risk)");
    if (n >= SEED_LENGTH && seedAccessibility < 0.5) warnings.push("seed mostly paired");

    return {
      sequence: seq,
      structure: fold.structure,
      pairs: fold.pairs,
      dp: fold.dp || null,
      energy: fold.energy != null ? fold.energy : null,
      score: fold.score != null ? fold.score : pairCount,
      pairCount: pairCount,
      gc: gc,
      seedStart: seedStart,
      seedAccessibility: seedAccessibility,
      selfPairFraction: selfPairFraction,
      warnings: warnings
    };
  }

  /*
   * Per-position agreement between two structures. Returns one char per base:
   *   "=" both models agree, "1" only model A pairs it, "2" only model B pairs it.
   */
  function comparePairs(n, pairsA, pairsB) {
    function keys(pairs) {
      var m = {};
      for (var i = 0; i < pairs.length; i++) m[pairs[i][0] + ":" + pairs[i][1]] = true;
      return m;
    }
    var a = keys(pairsA);
    var b = keys(pairsB);
    var shared = 0;
    for (var key in a) {
      if (b[key]) shared++;
    }
    var union = Object.keys(a).length + Object.keys(b).length - shared;
    var onlyA = pairedPositions(pairsA);
    var onlyB = pairedPositions(pairsB);
    var track = [];
    for (var i = 0; i < n; i++) {
      var inA = !!onlyA[i];
      var inB = !!onlyB[i];
      if (inA && inB) track.push("=");
      else if (inA) track.push("1");
      else if (inB) track.push("2");
      else track.push(".");
    }
    return {
      shared: shared,
      onlyA: Object.keys(a).length - shared,
      onlyB: Object.keys(b).length - shared,
      agreement: union ? shared / union : 1,
      track: track.join("")
    };
  }

  return {
    normalize: normalize,
    canPair: canPair,
    dotBracket: dotBracket,
    nussinov: nussinov,
    zuker: zuker,
    scoreGuide: scoreGuide,
    comparePairs: comparePairs,
    gcPercent: gcPercent,
    pairedPositions: pairedPositions,
    stackEnergy: stackEnergy,
    SEED_LENGTH: SEED_LENGTH,
    MAX_LEN: MAX_LEN
  };
})();
