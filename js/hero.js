/*
 * Hero background: a rotating DNA double helix with a CRISPR guide RNA strand
 * tracking alongside it, drawn live on a canvas.
 *
 * Rendered rather than photographed so it stays sharp at any viewport size,
 * ships no image bytes, and carries no licensing question. Same projection
 * approach as viewer3d.js: build points in 3D, rotate, perspective-divide,
 * sort back-to-front, draw with depth-scaled alpha and glow.
 *
 * Respects prefers-reduced-motion (renders one static frame) and pauses when
 * the tab is hidden or the hero scrolls out of view.
 */

window.Hero = (function () {
  "use strict";

  var BASE_COLORS = {
    A: "#5ee6c5",
    U: "#ffb454",
    G: "#7aa2ff",
    C: "#ff6fa5"
  };

  var STRAND_A = "#4fd8e8";
  var STRAND_B = "#e85bb0";
  var GUIDE = "#ffd166";

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function create(canvas) {
    var ctx = canvas.getContext("2d");
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var phase = 0;
    var raf = null;
    var visible = true;
    var width = 0;
    var height = 0;

    // Backbone geometry. The helix axis runs along X, across the hero.
    var TURNS = 3.6;
    var SAMPLES = 160;
    var RADIUS = 52;
    var LENGTH = 620;
    // Real B-DNA strands are not diametrically opposed; the offset is what
    // creates the minor/major groove.
    var MINOR_GROOVE = 2.4;

    var particles = [];
    for (var i = 0; i < 42; i++) {
      particles.push({
        x: (Math.random() - 0.5) * LENGTH * 1.3,
        y: (Math.random() - 0.5) * 300,
        z: (Math.random() - 0.5) * 260,
        r: Math.random() * 1.6 + 0.5
      });
    }

    var bases = [];
    var alphabet = ["A", "U", "G", "C"];
    for (var s = 0; s < SAMPLES; s++) {
      bases.push(alphabet[Math.floor(Math.random() * 4)]);
    }

    function resize() {
      var ratio = Math.min(window.devicePixelRatio || 1, 2);
      var rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function project(p, cx, cy, scale, dist, tilt) {
      // spin about the helix axis (X), then tilt the whole assembly
      var cosP = Math.cos(phase);
      var sinP = Math.sin(phase);
      var y = p.y * cosP - p.z * sinP;
      var z = p.y * sinP + p.z * cosP;

      var cosT = Math.cos(tilt);
      var sinT = Math.sin(tilt);
      var x2 = p.x * cosT - y * sinT;
      var y2 = p.x * sinT + y * cosT;

      var f = dist / (dist + z);
      return { x: cx + x2 * f * scale, y: cy + y2 * f * scale, z: z, f: f };
    }

    function helixPoint(t, offset, radius) {
      var angle = t * TURNS * Math.PI * 2 + offset;
      return {
        x: (t - 0.5) * LENGTH,
        y: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius
      };
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      var cx = width * 0.62;
      var cy = height * 0.52;
      var scale = clamp(Math.min(width / 900, height / 620), 0.5, 1.35);
      var dist = 460;
      var tilt = -0.32;

      var items = [];

      for (var i = 0; i < particles.length; i++) {
        var pp = project(particles[i], cx, cy, scale, dist, tilt);
        items.push({ kind: "particle", p: pp, r: particles[i].r, z: pp.z });
      }

      var prevA = null;
      var prevB = null;
      var prevG = null;

      for (var s = 0; s < SAMPLES; s++) {
        var t = s / (SAMPLES - 1);
        var a = project(helixPoint(t, 0, RADIUS), cx, cy, scale, dist, tilt);
        var b = project(helixPoint(t, Math.PI + MINOR_GROOVE, RADIUS), cx, cy, scale, dist, tilt);
        // The guide RNA: a wider, slower helix shadowing the duplex, standing in
        // for a guide tracking its target.
        var g = project(helixPoint(t * 0.82 + 0.09, 1.1, RADIUS * 1.62), cx, cy, scale, dist, tilt);

        if (prevA) items.push({ kind: "strand", from: prevA, to: a, color: STRAND_A, w: 2.6, z: (prevA.z + a.z) / 2 });
        if (prevB) items.push({ kind: "strand", from: prevB, to: b, color: STRAND_B, w: 2.6, z: (prevB.z + b.z) / 2 });
        if (prevG) items.push({ kind: "guide", from: prevG, to: g, color: GUIDE, w: 1.6, z: (prevG.z + g.z) / 2 });

        if (s % 5 === 0) {
          items.push({ kind: "rung", from: a, to: b, base: bases[s], z: (a.z + b.z) / 2 });
        }

        prevA = a;
        prevB = b;
        prevG = g;
      }

      items.sort(function (m, n) {
        return n.z - m.z;
      });

      ctx.lineCap = "round";

      for (var k = 0; k < items.length; k++) {
        var item = items[k];
        var depth = clamp(item.p ? item.p.f : (item.from.f + item.to.f) / 2, 0.4, 1.6);
        var alpha = clamp((depth - 0.4) / 1.0, 0.06, 1);

        if (item.kind === "particle") {
          ctx.fillStyle = "rgba(180, 235, 226, " + (alpha * 0.5).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(item.p.x, item.p.y, item.r * depth, 0, Math.PI * 2);
          ctx.fill();
        } else if (item.kind === "rung") {
          var color = BASE_COLORS[item.base];
          ctx.strokeStyle = hexToRgba(color, alpha * 0.55);
          ctx.lineWidth = 1.7 * depth;
          ctx.beginPath();
          ctx.moveTo(item.from.x, item.from.y);
          ctx.lineTo(item.to.x, item.to.y);
          ctx.stroke();
        } else {
          // Glow via a wide translucent underlay plus a bright core stroke.
          // ctx.shadowBlur would look marginally softer but forces a full blur
          // pass per segment, which drops the hero to single-digit FPS.
          var isGuide = item.kind === "guide";
          var core = isGuide ? alpha * 0.42 : alpha * 0.92;
          var halo = isGuide ? alpha * 0.1 : alpha * 0.16;

          ctx.strokeStyle = hexToRgba(item.color, halo);
          ctx.lineWidth = item.w * depth * 4.2;
          ctx.beginPath();
          ctx.moveTo(item.from.x, item.from.y);
          ctx.lineTo(item.to.x, item.to.y);
          ctx.stroke();

          ctx.strokeStyle = hexToRgba(item.color, core);
          ctx.lineWidth = item.w * depth;
          ctx.beginPath();
          ctx.moveTo(item.from.x, item.from.y);
          ctx.lineTo(item.to.x, item.to.y);
          ctx.stroke();
        }
      }
    }

    function tick() {
      if (visible) {
        phase += 0.0032;
        draw();
      }
      raf = requestAnimationFrame(tick);
    }

    resize();
    draw();

    if (!reduced) {
      tick();
      document.addEventListener("visibilitychange", function () {
        visible = !document.hidden;
      });
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(
          function (entries) {
            visible = entries[0].isIntersecting && !document.hidden;
          },
          { threshold: 0 }
        ).observe(canvas);
      }
    }

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resize();
        draw();
      }, 120);
    });

    return { draw: draw, resize: resize };
  }

  function hexToRgba(hex, alpha) {
    var num = parseInt(hex.slice(1), 16);
    return "rgba(" + ((num >> 16) & 255) + ", " + ((num >> 8) & 255) + ", " + (num & 255) + ", " + alpha.toFixed(3) + ")";
  }

  return { create: create };
})();
