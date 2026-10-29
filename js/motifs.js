// Rishton ornament library.
// Every motif draws one repeat tile into a box of w x h *world units* (the engine scales the
// canvas so shapes come out undistorted on the pot). Colours: c1 main, c2 accent, c3 outline,
// w = "window" colour used for light inner shapes (usually the white engobe).
window.Motifs = (() => {
  'use strict';
  const TAU = Math.PI * 2;

  function paint(g, fill, line, lw) {
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (line && lw) {
      g.strokeStyle = line; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round';
      g.stroke();
    }
  }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function leafPath(g, x, y, len, ang, wid = 0.36) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.45, -len * wid, len, 0);
    g.quadraticCurveTo(len * 0.45, len * wid, 0, 0);
    g.restore();
  }
  function spiral(g, cx, cy, r0, turns, start, dir) {
    g.beginPath();
    for (let k = 0; k <= 40; k++) {
      const t = k / 40, a = start + dir * t * turns * TAU, r = r0 * (1 - t * 0.82);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
  }
  // Fit a 100 x bh design box, centred and uniformly scaled, into the tile. Optionally mirrored.
  function fit(g, w, h, bh, mirror) {
    const s = Math.min(w / 100, h / bh);
    g.translate((w - 100 * s) / 2, (h - bh * s) / 2);
    g.scale(s, s);
    if (mirror) { g.translate(100, 0); g.scale(-1, 1); }
  }

  const list = [
    {
      id: 'anor', aspect: 1, kind: 'motif',
      draw(g, w, h, c) {
        g.save(); fit(g, w, h, 100);
        leafPath(g, 34, 72, 30, Math.PI * 0.82); paint(g, c.c2, c.c3, 2.6);
        leafPath(g, 66, 72, 30, Math.PI * 0.18); paint(g, c.c2, c.c3, 2.6);
        g.beginPath();
        [[40, 33], [35, 15], [45, 25], [50, 10], [55, 25], [65, 15], [60, 33]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.closePath(); paint(g, c.c1, c.c3, 2.6);
        circle(g, 50, 56, 26); paint(g, c.c1, c.c3, 3);
        g.beginPath(); g.ellipse(50, 59, 15, 13, 0, 0, TAU); paint(g, c.w, c.c3, 2);
        g.fillStyle = c.c2;
        [[50, 51], [43, 56], [57, 56], [50, 61], [44, 65], [56, 65], [50, 68]].forEach(([x, y]) => {
          g.beginPath(); g.ellipse(x, y, 2.6, 3.2, 0, 0, TAU); g.fill();
        });
        g.restore();
      },
    },
    {
      id: 'bodom', aspect: 0.9, kind: 'motif',
      draw(g, w, h, c, i) {
        g.save(); fit(g, w, h, 100, i % 2);
        const path = () => {
          g.beginPath(); g.moveTo(23, 62);
          g.arc(45, 62, 22, Math.PI, 0, true);
          g.bezierCurveTo(67, 40, 70, 25, 60, 9);
          g.bezierCurveTo(52, 22, 25, 30, 23, 62);
          g.closePath();
        };
        g.fillStyle = c.c2;
        for (let k = 0; k < 5; k++) {
          const a = Math.PI * (0.15 + 0.175 * k);
          circle(g, 45 + Math.cos(a) * 30, 62 + Math.sin(a) * 30, 2.8); g.fill();
        }
        path(); paint(g, c.c1, c.c3, 3);
        g.save(); g.translate(46, 58); g.scale(0.55, 0.55); g.translate(-46, -58); path(); paint(g, c.w, c.c3, 3.6); g.restore();
        circle(g, 45, 64, 4.5); paint(g, c.c2, c.c3, 1.6);
        g.restore();
      },
    },
    {
      id: 'qalampir', aspect: 0.7, kind: 'motif',
      draw(g, w, h, c, i) {
        g.save(); fit(g, w, h, 100, i % 2);
        g.beginPath(); g.moveTo(46, 22);
        g.bezierCurveTo(28, 42, 34, 72, 62, 92);
        g.bezierCurveTo(52, 70, 54, 45, 59, 24);
        g.closePath(); paint(g, c.c1, c.c3, 3);
        g.beginPath(); g.moveTo(45, 33); g.quadraticCurveTo(40, 54, 52, 74); paint(g, null, c.w, 2.4);
        g.beginPath(); g.ellipse(52, 21, 10, 5.5, 0.15, 0, TAU); paint(g, c.c2, c.c3, 2.2);
        g.beginPath(); g.moveTo(53, 16); g.quadraticCurveTo(57, 7, 66, 6); paint(g, null, c.c2, 3.4);
        g.restore();
      },
    },
    {
      id: 'tumor', aspect: 0.9, kind: 'motif',
      draw(g, w, h, c) {
        g.save(); fit(g, w, h, 100);
        g.beginPath(); g.rect(30, 12, 40, 11); paint(g, c.c2, c.c3, 2.4);
        g.beginPath(); g.moveTo(20, 25); g.lineTo(80, 25); g.lineTo(50, 78); g.closePath(); paint(g, c.c1, c.c3, 3);
        g.beginPath(); g.moveTo(35, 32); g.lineTo(65, 32); g.lineTo(50, 60); g.closePath(); paint(g, c.w, c.c3, 2);
        circle(g, 50, 40, 4); paint(g, c.c2, null);
        for (const [x, y] of [[40, 92], [50, 95], [60, 92]]) {
          g.beginPath(); g.moveTo(50, 78); g.lineTo(x, y - 3); paint(g, null, c.c3, 2);
          circle(g, x, y, 3.2); paint(g, c.c2, c.c3, 1.4);
        }
        g.restore();
      },
    },
    {
      id: 'gul', aspect: 1, kind: 'motif',
      draw(g, w, h, c) {
        g.save(); fit(g, w, h, 100);
        for (let k = 0; k < 8; k++) {
          const a = k * TAU / 8 + TAU / 16;
          g.beginPath(); g.ellipse(50 + Math.cos(a) * 32, 50 + Math.sin(a) * 32, 7, 3.6, a, 0, TAU); paint(g, c.c2, c.c3, 1.4);
        }
        for (let k = 0; k < 8; k++) {
          const a = k * TAU / 8;
          g.beginPath(); g.ellipse(50 + Math.cos(a) * 23, 50 + Math.sin(a) * 23, 18, 9, a, 0, TAU); paint(g, c.c1, c.c3, 2.6);
          g.beginPath(); g.ellipse(50 + Math.cos(a) * 25, 50 + Math.sin(a) * 25, 8, 3, a, 0, TAU); paint(g, c.w, null);
        }
        circle(g, 50, 50, 11); paint(g, c.c2, c.c3, 2.4);
        circle(g, 50, 50, 4.5); paint(g, c.w, null);
        g.restore();
      },
    },
    {
      id: 'baliq', aspect: 1.6, kind: 'motif',
      draw(g, w, h, c, i) {
        g.save(); fit(g, w, h, 60, i % 2);
        g.beginPath(); g.moveTo(74, 30); g.lineTo(95, 13); g.quadraticCurveTo(88, 30, 95, 47); g.closePath(); paint(g, c.c2, c.c3, 2.2);
        g.beginPath(); g.moveTo(38, 16); g.quadraticCurveTo(48, 3, 59, 15); g.closePath(); paint(g, c.c2, c.c3, 2);
        g.beginPath(); g.moveTo(8, 30); g.quadraticCurveTo(45, 1, 79, 30); g.quadraticCurveTo(45, 59, 8, 30); g.closePath(); paint(g, c.c1, c.c3, 2.6);
        for (const x of [40, 50, 60, 70]) for (const y of [24, 36]) {
          if (x === 70 && y === 24) continue;
          g.beginPath(); g.arc(x, y, 5, Math.PI * 0.5, Math.PI * 1.5); paint(g, null, c.w, 1.6);
        }
        g.beginPath(); g.arc(26, 30, 10, -Math.PI * 0.42, Math.PI * 0.42); paint(g, null, c.c3, 2);
        circle(g, 18, 27, 4.2); paint(g, c.w, c.c3, 1.4);
        circle(g, 18, 27, 1.8); paint(g, c.c3, null);
        g.restore();
      },
    },
    {
      id: 'qush', aspect: 1.25, kind: 'motif',
      draw(g, w, h, c, i) {
        g.save(); fit(g, w, h, 80, i % 2);
        g.beginPath(); g.moveTo(70, 46); g.lineTo(97, 28); g.lineTo(93, 44); g.lineTo(98, 58); g.closePath(); paint(g, c.c2, c.c3, 2.2);
        g.beginPath(); g.moveTo(50, 63); g.lineTo(47, 75); g.moveTo(59, 63); g.lineTo(61, 75); paint(g, null, c.c3, 2.4);
        g.beginPath(); g.ellipse(54, 48, 26, 17, -0.15, 0, TAU); paint(g, c.c1, c.c3, 2.6);
        circle(g, 28, 32, 11); paint(g, c.c1, c.c3, 2.4);
        g.beginPath(); g.moveTo(18, 29); g.lineTo(5, 34); g.lineTo(18, 37); g.closePath(); paint(g, c.c2, c.c3, 1.8);
        g.beginPath(); g.moveTo(42, 45); g.quadraticCurveTo(60, 20, 80, 40); g.quadraticCurveTo(62, 52, 42, 45); g.closePath(); paint(g, c.c2, c.c3, 2);
        g.beginPath(); g.moveTo(52, 41); g.quadraticCurveTo(62, 32, 72, 40); paint(g, null, c.w, 1.6);
        g.beginPath(); g.moveTo(31, 21); g.quadraticCurveTo(34, 11, 42, 13); paint(g, null, c.c3, 2);
        circle(g, 25, 30, 2.6); paint(g, c.w, null);
        g.restore();
      },
    },
    {
      id: 'mehrob', aspect: 0.75, kind: 'motif',
      draw(g, w, h, c) {
        const m = Math.min(w, h), lw = m * 0.03;
        const arch = (l, r, top, spring, bottom) => {
          g.beginPath(); g.moveTo(l, bottom); g.lineTo(l, spring);
          g.quadraticCurveTo(l, top + (spring - top) * 0.35, w / 2, top);
          g.quadraticCurveTo(r, top + (spring - top) * 0.35, r, spring);
          g.lineTo(r, bottom); g.closePath();
        };
        g.beginPath(); g.rect(0, h * 0.88, w, h * 0.12); paint(g, c.c2, null);
        arch(w * 0.07, w * 0.93, h * 0.06, h * 0.46, h * 0.88); paint(g, c.c1, c.c3, lw);
        arch(w * 0.22, w * 0.78, h * 0.24, h * 0.54, h * 0.88); paint(g, c.w, c.c3, lw * 0.8);
        g.beginPath(); g.moveTo(w / 2, h * 0.24); g.lineTo(w / 2, h * 0.52); paint(g, null, c.c3, lw * 0.7);
        const r = m * 0.09;
        g.beginPath(); g.moveTo(w / 2, h * 0.52); g.quadraticCurveTo(w / 2 + r * 1.3, h * 0.6, w / 2, h * 0.6 + r * 1.1);
        g.quadraticCurveTo(w / 2 - r * 1.3, h * 0.6, w / 2, h * 0.52); paint(g, c.c2, c.c3, lw * 0.7);
      },
    },
    {
      id: 'kungura', aspect: 1, kind: 'border',
      draw(g, w, h, c) {
        const lw = Math.min(w, h) * 0.035;
        g.beginPath();
        [[0, 1], [0, 0.65], [0.18, 0.65], [0.18, 0.35], [0.36, 0.35], [0.36, 0.05], [0.64, 0.05], [0.64, 0.35],
          [0.82, 0.35], [0.82, 0.65], [1, 0.65], [1, 1]].forEach(([x, y], i) => i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h));
        g.closePath(); paint(g, c.c1, c.c3, lw);
        const d = Math.min(w, h) * 0.11;
        g.beginPath(); g.moveTo(w / 2, h * 0.42 - d); g.lineTo(w / 2 + d * 0.8, h * 0.42); g.lineTo(w / 2, h * 0.42 + d); g.lineTo(w / 2 - d * 0.8, h * 0.42); g.closePath();
        paint(g, c.w, c.c3, lw * 0.6);
      },
    },
    {
      id: 'islimi', aspect: 2, kind: 'border',
      draw(g, w, h, c) {
        const m = Math.min(w, h), lw = m * 0.045, A = h * 0.2, cy = h * 0.5;
        const yAt = (x) => cy - A * Math.sin(TAU * x / w);
        leafPath(g, w * 0.08, yAt(w * 0.08), m * 0.36, -2.3); paint(g, c.c1, c.c3, lw * 0.6);
        leafPath(g, w * 0.58, yAt(w * 0.58), m * 0.36, 2.3 - Math.PI); paint(g, c.c1, c.c3, lw * 0.6);
        g.beginPath();
        for (let k = 0; k <= 48; k++) { const x = (k / 48) * w; k ? g.lineTo(x, yAt(x)) : g.moveTo(x, yAt(x)); }
        paint(g, null, c.c2, lw);
        const rr = Math.min(w * 0.11, h * 0.17);
        g.beginPath(); g.moveTo(w * 0.25, cy - A); g.quadraticCurveTo(w * 0.32, cy - A - rr * 0.9, w * 0.4 + rr, h * 0.22);
        paint(g, null, c.c2, lw * 0.8);
        spiral(g, w * 0.4, h * 0.22, rr, 1.15, 0, -1); paint(g, null, c.c2, lw * 0.8);
        g.beginPath(); g.moveTo(w * 0.75, cy + A); g.quadraticCurveTo(w * 0.82, cy + A + rr * 0.9, w * 0.9 + rr, h * 0.78);
        paint(g, null, c.c2, lw * 0.8);
        spiral(g, w * 0.9, h * 0.78, rr, 1.15, 0, 1); paint(g, null, c.c2, lw * 0.8);
        circle(g, w * 0.4, h * 0.22, rr * 0.28); paint(g, c.c1, null);
        circle(g, w * 0.9, h * 0.78, rr * 0.28); paint(g, c.c1, null);
      },
    },
    {
      id: 'barg', aspect: 1.4, kind: 'border',
      draw(g, w, h, c) {
        const m = Math.min(w, h), cy = h / 2, L = Math.min(w * 0.62, h * 0.6);
        g.beginPath(); g.moveTo(0, cy); g.lineTo(w, cy); paint(g, null, c.c3, m * 0.05);
        leafPath(g, w * 0.05, cy, L, -0.8); paint(g, c.c1, c.c3, m * 0.03);
        leafPath(g, w * 0.55, cy, L, 0.8); paint(g, c.c2, c.c3, m * 0.03);
        circle(g, w * 0.32, cy + h * 0.3, m * 0.06); paint(g, c.c2, null);
        circle(g, w * 0.82, cy - h * 0.3, m * 0.06); paint(g, c.c1, null);
      },
    },
    {
      id: 'tolqin', aspect: 2, kind: 'border',
      draw(g, w, h, c) {
        const cols = [c.c1, c.c2, c.c1];
        for (let k = 0; k < 3; k++) {
          const y0 = h * (0.24 + 0.26 * k), amp = h * 0.11;
          g.beginPath();
          for (let j = 0; j <= 40; j++) { const x = (j / 40) * w, y = y0 + amp * Math.sin(TAU * x / w + k * 1.1); j ? g.lineTo(x, y) : g.moveTo(x, y); }
          paint(g, null, cols[k], h * 0.075);
        }
        circle(g, w * 0.5, h * 0.12, Math.min(w, h) * 0.045); paint(g, c.c3, null);
      },
    },
    {
      id: 'tangacha', aspect: 1, kind: 'border',
      draw(g, w, h, c) {
        const r = Math.min(w / 2, h * 0.42), lw = Math.min(w, h) * 0.03;
        const scale = (x, y) => {
          g.beginPath(); g.arc(x, y, r, 0, Math.PI); g.closePath(); paint(g, c.c1, c.c3, lw);
          g.beginPath(); g.arc(x, y, r * 0.62, 0, Math.PI); g.closePath(); paint(g, c.c2, null);
          circle(g, x, y + r * 0.25, r * 0.12); paint(g, c.w, null);
        };
        scale(w / 2, h * 0.08);
        scale(0, h * 0.55); scale(w, h * 0.55);
      },
    },
    {
      id: 'panjara', aspect: 1, kind: 'border',
      draw(g, w, h, c) {
        const m = Math.min(w, h);
        g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.lineTo(0, h / 2); g.closePath();
        paint(g, null, c.c1, m * 0.07);
        g.beginPath(); g.moveTo(w / 2, h * 0.3); g.lineTo(w * 0.68, h / 2); g.lineTo(w / 2, h * 0.7); g.lineTo(w * 0.32, h / 2); g.closePath();
        paint(g, c.c2, c.c3, m * 0.025);
        for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) { circle(g, x, y, m * 0.09); paint(g, c.c3, null); }
      },
    },
    {
      id: 'nuqta', aspect: 1, kind: 'border',
      draw(g, w, h, c) {
        const r = Math.min(w * 0.32, h * 0.36), cy = h / 2, lw = Math.min(w, h) * 0.035;
        circle(g, w / 2, cy, r); paint(g, c.c1, c.c3, lw);
        circle(g, w / 2, cy, r * 0.38); paint(g, c.w, null);
        circle(g, 0, cy, r * 0.28); paint(g, c.c2, null);
        circle(g, w, cy, r * 0.28); paint(g, c.c2, null);
      },
    },
    {
      id: 'zanjir', aspect: 1.6, kind: 'border',
      draw(g, w, h, c) {
        const m = Math.min(w, h);
        g.beginPath(); g.ellipse(0, h / 2, w * 0.2, h * 0.34, 0, 0, TAU); paint(g, null, c.c2, m * 0.1);
        g.beginPath(); g.ellipse(w, h / 2, w * 0.2, h * 0.34, 0, 0, TAU); paint(g, null, c.c2, m * 0.1);
        g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.38, h * 0.24, 0, 0, TAU); paint(g, null, c.c1, m * 0.1);
        circle(g, w / 2, h / 2, m * 0.06); paint(g, c.c3, null);
      },
    },
    {
      id: 'girih', aspect: 1, kind: 'motif',
      draw(g, w, h, c) {
        const m = Math.min(w, h);
        g.beginPath();
        g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2);
        paint(g, null, c.c3, m * 0.025);
        const d = m * 0.14;
        for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
          g.beginPath(); g.moveTo(x, y - d); g.lineTo(x + d, y); g.lineTo(x, y + d); g.lineTo(x - d, y); g.closePath();
          paint(g, c.c2, c.c3, m * 0.02);
        }
        g.save(); fit(g, w, h, 100);
        g.beginPath();
        for (let k = 0; k < 16; k++) {
          const a = k * TAU / 16 - Math.PI / 2, r = k % 2 ? 27 : 44;
          k ? g.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r) : g.moveTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r);
        }
        g.closePath(); paint(g, c.c1, c.c3, 2.6);
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = k * TAU / 8 + TAU / 16 - Math.PI / 2;
          k ? g.lineTo(50 + Math.cos(a) * 20, 50 + Math.sin(a) * 20) : g.moveTo(50 + Math.cos(a) * 20, 50 + Math.sin(a) * 20);
        }
        g.closePath(); paint(g, c.w, c.c3, 2);
        circle(g, 50, 50, 8); paint(g, c.c2, c.c3, 1.6);
        g.restore();
      },
    },
  ];

  const byId = Object.fromEntries(list.map((m) => [m.id, m]));

  // Flat preview strip of a motif, used for the pattern picker, CSS ornaments and the order sheet.
  function preview(id, colors, pxW, pxH, repeats = 0, bg) {
    const m = byId[id];
    if (!repeats) repeats = Math.max(1, Math.round(pxW / (m.aspect * pxH)));
    const c = document.createElement('canvas');
    c.width = pxW; c.height = pxH;
    const g = c.getContext('2d');
    g.fillStyle = bg || colors.w; g.fillRect(0, 0, pxW, pxH);
    const tw = pxW / repeats;
    const ww = m.aspect, wh = 1;     // world units: band height 1
    for (let k = -1; k <= repeats; k++) {
      g.save(); g.translate(k * tw, 0); g.scale(tw / ww, pxH / wh);
      m.draw(g, ww, wh, colors, ((k % repeats) + repeats) % repeats);
      g.restore();
    }
    return c;
  }

  return { list, get: (id) => byId[id], preview };
})();
