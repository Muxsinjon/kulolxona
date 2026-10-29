// 3D pottery engine: a pot on a wheel (or a plinth), shaped from a radius profile and decorated by
// replaying a list of ops (dips, pattern bands, rings, brush strokes, signature) onto canvas textures.
window.PotEngine = (() => {
  'use strict';
  const { clays: CLAYS, finishes: FINISH, N } = window.KData;
  const TEX = 2048, PART_TEX = 512;
  const SEG = 128, M = 260, RIM_PTS = 9, FLOOR_PTS = 18;
  const PROXY_M = 66, PROXY_SEG = 48;
  const MIN_R = 0.08, MAX_R = 3.4, BEVEL = 0.05;
  const PARTS = ['pot', 'handle', 'spout', 'lid'];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function canvas2d(w, h = w) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function shade(hex, dl) {
    const c = new THREE.Color(hex);
    c.offsetHSL(0, 0, dl);
    return '#' + c.getHexString();
  }
  function rgba(hex, a) {
    const c = new THREE.Color(hex);
    return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`;
  }
  // Clay flecks: one pre-drawn tile used as a pattern (thousands of fillRects per dip were the slow part).
  let speckTile = null;
  const crackleCache = {};
  function speckle(g, x, y, w, h) {
    if (!speckTile) {
      speckTile = canvas2d(512);
      const t = speckTile.getContext('2d'), rand = rng(5);
      for (let i = 0; i < (512 * 512) / 300; i++) {
        t.globalAlpha = rand() * 0.3;
        t.fillStyle = rand() < 0.7 ? '#2a1a10' : '#ffffff';
        t.fillRect(rand() * 512, rand() * 512, 1.6, 1.6);
      }
    }
    g.save();
    g.fillStyle = g.createPattern(speckTile, 'repeat');
    g.fillRect(x, y, w, h);
    g.restore();
  }

  // Lathe geometry with fixed topology whose vertices are rewritten in place, with normals taken
  // straight from the profile. Much cheaper than a new LatheGeometry + computeVertexNormals per frame.
  function makeLathe(n, segs) {
    const g = new THREE.BufferGeometry(), count = (segs + 1) * n;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const uv = new Float32Array(count * 2), idx = [];
    for (let i = 0; i <= segs; i++) for (let j = 0; j < n; j++) { const k = (i * n + j) * 2; uv[k] = i / segs; uv[k + 1] = j / (n - 1); }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < n - 1; j++) {
        const a = i * n + j, b = (i + 1) * n + j, c = (i + 1) * n + j + 1, d = i * n + j + 1;
        idx.push(a, b, d, c, d, b);
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const sin = new Float32Array(segs + 1), cos = new Float32Array(segs + 1);
    for (let i = 0; i <= segs; i++) { const a = (i % segs) / segs * Math.PI * 2; sin[i] = Math.sin(a); cos[i] = Math.cos(a); }
    g.userData = { n, segs, sin, cos };
    return g;
  }
  // pts: array of Vector2 (r, y) of length n, or a picker (j) => Vector2
  function updateLathe(g, pick) {
    const { n, segs, sin, cos } = g.userData;
    const P = g.attributes.position.array, Nm = g.attributes.normal.array;
    for (let j = 0; j < n; j++) {
      const p = pick(j), a = pick(Math.max(j - 1, 0)), b = pick(Math.min(j + 1, n - 1));
      const tr = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tr, ty) || 1;
      const nr = ty / l, ny = -tr / l;           // outward for a profile that runs up the outside
      for (let i = 0; i <= segs; i++) {
        const k = (i * n + j) * 3;
        P[k] = p.x * sin[i]; P[k + 1] = p.y; P[k + 2] = p.x * cos[i];
        Nm[k] = nr * sin[i]; Nm[k + 1] = ny; Nm[k + 2] = nr * cos[i];
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.boundingSphere = null;
    g.boundingBox = null;
  }

  class PotEngine {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.opts = Object.assign({ wheel: true, interactive: true }, opts);
      const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(opts.pixelRatio || Math.min(window.devicePixelRatio, 2));
      r.outputEncoding = THREE.sRGBEncoding;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      this.aniso = r.capabilities.getMaxAnisotropy();

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      this.scene.environment = this._env();
      this._lights();
      this.spinner = new THREE.Group();
      this.scene.add(this.spinner);
      if (this.opts.wheel) this._wheel(); else this._ground();
      this.potGroup = new THREE.Group();
      this.spinner.add(this.potGroup);
      this._clayMaterial();

      this.tex = opts.tex || TEX;
      this.parts = {};
      for (const name of PARTS) {
        const paint = this._paintable(name === 'pot' ? this.tex : PART_TEX);
        const glaze = new THREE.MeshPhysicalMaterial({ map: paint.tex, side: THREE.DoubleSide, roughness: 0.88, color: 0xdbdbdb });
        const mesh = new THREE.Mesh(name === 'pot' ? makeLathe(M, SEG) : new THREE.BufferGeometry(), glaze);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.part = name;
        mesh.visible = name === 'pot';
        this.potGroup.add(mesh);
        this.parts[name] = { name, paint, glaze, mesh, meta: { len: 1, r: 0.1 } };
      }
      // invisible low-poly copy of the pot used for mouse picking (the full mesh has ~66k triangles)
      this.proxy = new THREE.Mesh(makeLathe(PROXY_M, PROXY_SEG), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      this.proxy.visible = false;
      this.potGroup.add(this.proxy);
      this._highlights();
      this._marker();

      this.surface = 'glaze';
      this.mode = 'view';
      this.spin = 0.12;
      this.shapeTool = { tool: 'shape', brush: 0.45, strength: 0.6 };
      this.brush = { type: 'brush', color: '#1f3f91', size: 0.12 };
      this.placeH = 0.35;
      this.cam = { elev: 0.4, targetElev: 0.4, zoom: 1, dist: 9, ty: 0.8 };
      this.flip = 0; this.flipTarget = 0;
      this.morph = null; this.pop = null;
      this.pointer = new THREE.Vector2(9, 9);
      this.raycaster = new THREE.Raycaster();
      this.down = false; this.inside = false; this.drag = null; this.lastManual = 0;
      this.cb = {};
      this.d = null;
      if (this.opts.interactive) this._bindPointer();
      if (!this.opts.size) {
        this._ro = new ResizeObserver(() => this.resize());
        this._ro.observe(canvas.parentElement || canvas);
      }
      this.resize();
    }

    // ------------------------------------------------------------ scene setup
    _env() {
      const pm = new THREE.PMREMGenerator(this.renderer);
      const env = new THREE.Scene();
      const room = new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial({ color: 0x4d4238, side: THREE.BackSide }));
      room.position.y = 5;
      env.add(room);
      const panel = (w, h, x, y, z, k, color = 0xffffff) => {
        const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
        mat.color.multiplyScalar(k);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.position.set(x, y, z); m.lookAt(0, 2, 0);
        env.add(m);
      };
      panel(7, 4, -7, 8, 6, 5);
      panel(4, 3, 8, 4, 3, 2.2, 0xffe2c4);
      panel(14, 1.6, 0, 3, -10, 1.4, 0xd8f0ff);
      const tex = pm.fromScene(env, 0.04).texture;
      pm.dispose();
      return tex;
    }
    _lights() {
      this.scene.add(new THREE.HemisphereLight(0xfff3e6, 0x3a2a20, 0.35));
      const key = this.key = new THREE.DirectionalLight(0xfff1de, 1.45);
      key.position.set(-4, 9, 6);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      Object.assign(key.shadow.camera, { left: -5, right: 5, top: 6, bottom: -4, near: 1, far: 30 });
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.03;
      this.scene.add(key);
      const rim = new THREE.DirectionalLight(0xd6ecff, 0.5);
      rim.position.set(5, 3, -5);
      this.scene.add(rim);
    }
    _wheel() {
      const c = canvas2d(512), g = c.getContext('2d');
      g.fillStyle = '#8d8f91'; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = 'rgba(0,0,0,.18)';
      for (let r = 30; r < 256; r += 26) { g.lineWidth = 1; g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = 'rgba(40,30,20,.45)'; g.lineWidth = 6;
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3;
        g.beginPath(); g.moveTo(256 + Math.cos(a) * 150, 256 + Math.sin(a) * 150); g.lineTo(256 + Math.cos(a) * 240, 256 + Math.sin(a) * 240); g.stroke();
      }
      const rand = rng(3);
      for (let i = 0; i < 220; i++) {
        g.fillStyle = `rgba(150,95,60,${rand() * 0.25})`;
        const a = rand() * Math.PI * 2, r = 120 + rand() * 130;
        g.beginPath(); g.ellipse(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 2 + rand() * 8, 1 + rand() * 3, a + Math.PI / 2, 0, Math.PI * 2); g.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      const metal = new THREE.MeshStandardMaterial({ color: 0x8a8c8e, metalness: 0.7, roughness: 0.4 });
      const top = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.5 });
      const head = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.22, 96), [metal, top, metal]);
      head.position.y = -0.11;
      head.receiveShadow = true;
      this.spinner.add(head);
      const V = THREE.Vector2;
      const pan = new THREE.Mesh(
        new THREE.LatheGeometry([new V(0, -0.45), new V(2.85, -0.45), new V(2.85, 0.04), new V(2.98, 0.1), new V(3.12, 0.04), new V(3.5, -1.2)], 96),
        new THREE.MeshStandardMaterial({ color: 0x2f3a45, roughness: 0.55, side: THREE.DoubleSide }),
      );
      pan.receiveShadow = true;
      this.scene.add(pan);
    }
    _ground() {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.16 }));
      plane.rotation.x = -Math.PI / 2;
      plane.receiveShadow = true;
      this.scene.add(plane);
    }
    _clayMaterial() {
      this.clayCanvas = canvas2d(512);
      this.clayTex = new THREE.CanvasTexture(this.clayCanvas);
      this.clayTex.encoding = THREE.sRGBEncoding;
      this.clayTex.wrapS = THREE.RepeatWrapping;
      this.clayTex.anisotropy = this.aniso;
      this.clayMat = new THREE.MeshStandardMaterial({ map: this.clayTex, roughness: 0.45, side: THREE.DoubleSide });
    }
    _paintable(size) {
      const canvas = canvas2d(size), base = canvas2d(size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.encoding = THREE.sRGBEncoding;
      tex.wrapS = THREE.RepeatWrapping;
      tex.anisotropy = this.aniso;
      return { size, canvas, ctx: canvas.getContext('2d'), base, bctx: base.getContext('2d'), tex };
    }
    _highlights() {
      const mk = (color, opacity) => {
        const m = new THREE.Mesh(makeLathe(40, 96), new THREE.MeshBasicMaterial({
          color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
        }));
        m.visible = false; m.renderOrder = 2;
        this.potGroup.add(m);
        return m;
      };
      this.hoverHL = mk(0xffffff, 0.28);
      this.selHL = mk(0x33d0c8, 0.22);
      this.selBand = null;
    }
    _marker() {
      const m = this.marker = new THREE.Group();
      this.fingertip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf6d2b8, roughness: 0.6, emissive: 0x3a1a08 }));
      this.reach = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false }));
      m.add(this.fingertip, this.reach);
      m.visible = false;
      this.scene.add(m);
    }

    // ------------------------------------------------------------ design
    setDesign(d) {
      this.d = d;
      this.morph = null;
      this.drawClay();
      this.shapeDirty = true;
      this.paintDirty = true;
      this.selBand = null;
      this.applyFinish();
    }
    markShape() { this.shapeDirty = true; this.paintDirty = true; this._hoverKey = null; }
    markPaint() { this.paintDirty = true; }

    drawClay() {
      const clay = CLAYS[this.d.clay] || CLAYS.rishton;
      const g = this.clayCanvas.getContext('2d'), S = 512, rand = rng(11);
      g.globalAlpha = 1; g.fillStyle = clay.wet; g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 2) {
        const a = 0.03 + 0.09 * rand() * rand();
        g.fillStyle = rand() < 0.55 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.7})`;
        g.fillRect(0, y, S, 1 + ((rand() * 2) | 0));
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.05})`;
        g.beginPath(); g.ellipse(rand() * S, rand() * S, 10 + rand() * 40, 2 + rand() * 6, 0, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = clay.fleck;
      for (let i = 0; i < 1600; i++) { g.globalAlpha = rand() * 0.5; g.fillRect(rand() * S, rand() * S, 1.5, 1.5); }
      g.globalAlpha = 1;
      this.clayTex.needsUpdate = true;
    }

    setSurface(s) { this.surface = s; this.applyFinish(); }

    applyFinish() {
      if (!this.d) return;
      const f = FINISH[this.d.finish] || FINISH.glossy;
      for (const p of Object.values(this.parts)) {
        const m = p.glaze;
        if (this.d.fired) {
          m.roughness = f.roughness; m.clearcoat = f.clearcoat; m.clearcoatRoughness = f.clearcoatRoughness;
          m.color.set(f.tint);
        } else {
          m.roughness = 0.88; m.clearcoat = 0; m.color.setScalar(0.86);
        }
        m.emissive.setHex(0);
        p.mesh.material = this.surface === 'clay' ? this.clayMat : m;
      }
    }

    // ------------------------------------------------------------ profile & geometry
    hAt(i) { return BEVEL + (i / (N - 1)) * (this.d.height - BEVEL); }
    radiusAt(y) {
      const d = this.d, f = ((y - BEVEL) / (d.height - BEVEL)) * (N - 1);
      if (f <= 0) return d.R[0];
      if (f >= N - 1) return d.R[N - 1];
      const i = Math.floor(f), t = f - i;
      return d.R[i] * (1 - t) + d.R[i + 1] * t;
    }
    slopeAt(y) { const e = 0.03; return (this.radiusAt(y + e) - this.radiusAt(y - e)) / (2 * e); }
    innerR(y) {
      const tw = Math.min(this.d.wall, this.d.R[N - 1] * 0.8);
      return Math.max(this.radiusAt(y) - tw * Math.min(Math.hypot(1, this.slopeAt(y)), 2.5), 0.03);
    }
    floorY() { return Math.min(this.d.wall * 1.3, this.d.height * 0.6); }

    buildProfile() {
      const d = this.d, H = d.height, R = d.R;
      const raw = [];
      const r0 = Math.max(R[0] - BEVEL, 0.02);
      for (let k = 0; k <= 12; k++) raw.push([r0 * k / 12, 0]);
      const mk = { foot: raw.length - 1 };
      for (let i = 0; i < N; i++) raw.push([R[i], this.hAt(i)]);
      mk.rim = raw.length - 1;
      const rTop = R[N - 1];
      if (d.open) {
        const tw = Math.min(d.wall, rTop * 0.8), cx = rTop - tw / 2;
        for (let k = 1; k < RIM_PTS; k++) {
          const a = (k / RIM_PTS) * Math.PI;
          raw.push([cx + Math.cos(a) * tw / 2, H + Math.sin(a) * tw / 2]);
        }
        mk.rimEnd = raw.length;
        const fy = this.floorY();
        let lastR = 0;
        for (let k = 0; k < N; k++) {
          const y = H - (k / (N - 1)) * (H - fy);
          lastR = this.innerR(y);
          raw.push([lastR, y]);
        }
        mk.floor = raw.length - 1;
        for (let k = 1; k <= FLOOR_PTS; k++) raw.push([lastR * (1 - k / FLOOR_PTS), fy]);
      } else {
        const dome = Math.min(0.1, H * 0.06);
        for (let k = 1; k <= 8; k++) {
          const u = k / 8;
          raw.push([rTop * (1 - u), H + dome * Math.sin(u * Math.PI / 2)]);
        }
        mk.rimEnd = mk.floor = raw.length - 1;
      }
      const cum = [0];
      for (let j = 1; j < raw.length; j++) cum.push(cum[j - 1] + Math.hypot(raw[j][0] - raw[j - 1][0], raw[j][1] - raw[j - 1][1]));
      const L = cum[cum.length - 1];
      const pts = [];
      let j = 0;
      for (let m = 0; m < M; m++) {
        const s = (L * m) / (M - 1);
        while (j < raw.length - 2 && cum[j + 1] < s) j++;
        const t = clamp((s - cum[j]) / (cum[j + 1] - cum[j] || 1), 0, 1);
        pts.push(new THREE.Vector2(lerp(raw[j][0], raw[j + 1][0], t), lerp(raw[j][1], raw[j + 1][1], t)));
      }
      this.prof = { pts, L, sFoot: cum[mk.foot], sRim: cum[mk.rim], sRimEnd: cum[mk.rimEnd], sFloor: cum[mk.floor] };
    }
    rAtS(s) {
      const p = this.prof, f = clamp(s / p.L, 0, 1) * (M - 1);
      const i = Math.min(Math.floor(f), M - 2), t = f - i;
      return lerp(p.pts[i].x, p.pts[i + 1].x, t);
    }
    zoneRange(zone) {
      const p = this.prof;
      switch (zone) {
        case 'bottom': return [0, p.sFoot];
        case 'outer': return [p.sFoot, p.sRim];
        case 'rim': return this.d.open ? [p.sRim, p.sRimEnd] : [p.sRim, p.L];
        case 'inside': return this.d.open ? [p.sRimEnd, p.L] : null;
      }
      return null;
    }
    sToZone(s) {
      for (const z of ['bottom', 'outer', 'rim', 'inside']) {
        const r = this.zoneRange(z);
        if (r && s >= r[0] && s <= r[1]) return { zone: z, a: (s - r[0]) / Math.max(r[1] - r[0], 1e-6) };
      }
      return { zone: 'outer', a: 0.5 };
    }
    bandRange(op) {
      const z = this.zoneRange(op.zone);
      if (!z) return null;
      const sc = lerp(z[0], z[1], op.a);
      return [clamp(sc - op.h / 2, z[0], z[1]), clamp(sc + op.h / 2, z[0], z[1])];
    }
    rows(s0, s1, S = this.tex) {
      const L = this.prof.L;
      return [Math.floor((1 - s1 / L) * S), Math.ceil((1 - s0 / L) * S)];
    }
    hasPart(name) {
      const d = this.d;
      if (name === 'pot') return true;
      if (!d.open) return false;
      if (name === 'lid') return !!d.lid;
      return !!d[name] && d.height > 0.5;
    }

    rebuild() {
      this.buildProfile();
      const pts = this.prof.pts;
      updateLathe(this.parts.pot.mesh.geometry, (j) => pts[j]);
      updateLathe(this.proxy.geometry, (j) => pts[Math.round((j * (M - 1)) / (PROXY_M - 1))]);
      for (const n of ['handle', 'spout', 'lid']) {
        const on = this.hasPart(n);
        this.parts[n].mesh.visible = on;
        if (on) this._setGeo(n, this[`_${n}Geo`]());
      }
      this.shapeDirty = false;
      this._updateSel();
    }
    _setGeo(name, geo) {
      const mesh = this.parts[name].mesh;
      mesh.geometry.dispose();
      mesh.geometry = geo;
    }
    _handleGeo() {
      const d = this.d, H = d.height;
      const yTop = H * 0.8, yBot = H * 0.32;
      const rT = this.radiusAt(yTop), rB = this.radiusAt(yBot);
      const reach = 0.35 + H * 0.16, out = Math.max(rT, rB) + reach, sink = d.wall * 0.5;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(rT - sink, yTop, 0),
        new THREE.Vector3(rT + reach * 0.55, yTop + 0.05 + H * 0.02, 0),
        new THREE.Vector3(out, yTop * 0.62 + yBot * 0.38, 0),
        new THREE.Vector3(Math.max(rT, rB) + reach * 0.6, yBot + (yTop - yBot) * 0.12, 0),
        new THREE.Vector3(rB - sink, yBot, 0),
      ]);
      const radius = clamp(0.06 + H * 0.025, 0.07, 0.16);
      Object.assign(this.parts.handle.meta, { len: curve.getLength(), r: radius });
      return new THREE.TubeGeometry(curve, 64, radius, 14, false);
    }
    _spoutGeo() {
      const d = this.d, H = d.height;
      const y0 = H * 0.3, r0 = this.radiusAt(y0), len = 0.5 + H * 0.35;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-(r0 - d.wall), y0, 0),
        new THREE.Vector3(-(r0 + len * 0.3), y0 + len * 0.25, 0),
        new THREE.Vector3(-(r0 + len * 0.62), y0 + len * 0.7, 0),
        new THREE.Vector3(-(r0 + len * 0.85), y0 + len * 1.05, 0),
      ]);
      const TS = 40, RS = 14;
      const geo = new THREE.TubeGeometry(curve, TS, 1, RS, false);
      const pos = geo.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
      const rA = clamp(0.1 + H * 0.06, 0.12, 0.26), rB = rA * 0.4;
      for (let i = 0; i <= TS; i++) {
        curve.getPointAt(i / TS, c);
        const rad = lerp(rA, rB, i / TS);
        for (let j = 0; j <= RS; j++) {
          const k = i * (RS + 1) + j;
          v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(rad).add(c);
          pos.setXYZ(k, v.x, v.y, v.z);
        }
      }
      geo.computeVertexNormals();
      Object.assign(this.parts.spout.meta, { len: curve.getLength(), r: (rA + rB) / 2 });
      return geo;
    }
    _lidGeo() {
      const d = this.d, H = d.height, rt = d.R[N - 1], t = Math.min(d.wall, rt * 0.8);
      const re = rt - t * 0.1, dome = 0.12 + rt * 0.25, kn = clamp(rt * 0.18, 0.08, 0.2);
      const V = THREE.Vector2, pts = [], kc = H + dome + kn * 1.1;
      pts.push(new V(0, kc + kn));
      for (let k = 1; k <= 6; k++) {
        const a = Math.PI / 2 - (k / 6) * Math.PI * 0.9;
        pts.push(new V(Math.cos(a) * kn, kc + Math.sin(a) * kn));
      }
      pts.push(new V(kn * 0.45, H + dome + 0.02));
      for (let k = 1; k <= 14; k++) {
        const u = k / 14;
        pts.push(new V(kn * 0.45 + (re - kn * 0.45) * u, H + 0.03 + dome * Math.cos(u * Math.PI / 2)));
      }
      pts.push(new V(re, H + 0.02), new V(rt - t - 0.01, H + 0.02), new V(rt - t - 0.02, H - 0.1), new V(0, H - 0.1));
      Object.assign(this.parts.lid.meta, { len: dome + re, r: re * 0.6 });
      return new THREE.LatheGeometry(pts, 96);
    }

    // a thin shell following the profile between s0 and s1, used to highlight a band
    // a thin shell floating just off the surface between s0 and s1
    _showShell(mesh, range) {
      if (!range || range[1] - range[0] < 1e-3) { mesh.visible = false; return; }
      const [s0, s1] = range, n = mesh.geometry.userData.n, off = 0.012, pts = [];
      for (let k = 0; k < n; k++) {
        const s = lerp(s0, s1, k / (n - 1));
        const f = clamp(s / this.prof.L, 0, 1) * (M - 1), i = Math.min(Math.floor(f), M - 2);
        const a = this.prof.pts[i], b = this.prof.pts[i + 1], t = f - i;
        const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
        pts.push(new THREE.Vector2(Math.max(lerp(a.x, b.x, t) + (ty / l) * off, 0), lerp(a.y, b.y, t) - (tx / l) * off));
      }
      updateLathe(mesh.geometry, (j) => pts[j]);
      mesh.visible = true;
    }
    select(op) { this.selBand = op; this._updateSel(); }
    _updateSel() {
      if (!this.prof) return;
      this._showShell(this.selHL, this.selBand ? this.bandRange(this.selBand) : null);
    }

    // ------------------------------------------------------------ decoration replay
    repaint() {
      const d = this.d, clay = CLAYS[d.clay] || CLAYS.rishton;
      if (this.shapeDirty) this.rebuild();
      for (const p of Object.values(this.parts)) this._fill(p.paint, null, clay.bisque, clay.fleck, rng(7));
      d.ops.forEach((op, i) => this._op(op, i));
      if (d.fired && d.finish === 'ishkor') for (const p of Object.values(this.parts)) this._crackle(p.paint, rng(99 + p.paint.size));
      for (const p of Object.values(this.parts)) p.paint.tex.needsUpdate = true;
      this.paintDirty = false;
      this._updateSel();
    }
    _fill(P, rows, color, fleck, rand, extra) {
      const S = P.size, y0 = rows ? clamp(rows[0], 0, S) : 0, y1 = rows ? clamp(rows[1], 0, S) : S, h = y1 - y0;
      if (h <= 0) return;
      const b = P.bctx;
      b.globalAlpha = 1; b.fillStyle = color; b.fillRect(0, y0, S, h);
      speckle(b, 0, y0, S, h);
      if (extra) extra(b);
      P.ctx.globalAlpha = 1;
      P.ctx.drawImage(P.base, 0, y0, S, h, 0, y0, S, h);
    }
    _op(op, i) {
      const pot = this.parts.pot.paint, p = this.prof, rand = rng(1000 + i * 7919);
      switch (op.t) {
        case 'dip': {
          const fleck = shade(op.c, -0.15), part = op.part || 'all';
          const sMid = (p.sRim + p.sRimEnd) / 2;
          const clay = CLAYS[this.d.clay] || CLAYS.rishton;
          // glaze thins and "breaks" over the lip
          const rimBreak = (b) => {
            const [y0, y1] = this.rows(p.sRim, p.sRimEnd);
            const grad = b.createLinearGradient(0, y0 - 8, 0, y1 + 8);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(0.5, rgba(clay.bisque, 0.4));
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            b.fillStyle = grad; b.fillRect(0, y0 - 8, pot.size, y1 - y0 + 16);
          };
          if (part === 'all') this._fill(pot, null, op.c, fleck, rand, rimBreak);
          else if (part === 'outside') this._fill(pot, this.rows(0, sMid), op.c, fleck, rand);
          else if (part === 'inside' && this.d.open) this._fill(pot, this.rows(sMid, p.L), op.c, fleck, rand);
          if (part === 'all' || part === 'outside' || part === 'parts') {
            for (const n of ['handle', 'spout', 'lid']) this._fill(this.parts[n].paint, null, op.c, fleck, rand);
          }
          break;
        }
        case 'band': this._band(pot, op); break;
        case 'ring': {
          const r = this.bandRange(op);
          if (!r) break;
          const [y0, y1] = this.rows(r[0], r[1]);
          pot.ctx.fillStyle = op.c;
          pot.ctx.fillRect(0, y0, pot.size, Math.max(2, y1 - y0));
          break;
        }
        case 'stroke': {
          const part = this.parts[op.part];
          if (!part) break;
          const st = this._strokeState(op.part, op.b, op.c, rand);
          const k = op.part === 'pot' ? this.tex / TEX : 1;   // pot strokes are stored in full-size texture pixels
          for (let q = 0; q < op.p.length; q += 4) this._strokeTo(st, op.p[q] * k, op.p[q + 1] * k, op.p[q + 2] * k, op.p[q + 3] * k);
          break;
        }
        case 'sign': this._sign(pot, op); break;
      }
    }
    bandCount(op) {
      const r = this.bandRange(op);
      if (!r) return 0;
      if (op.n > 0) return op.n;
      const m = window.Motifs.get(op.motif);
      const [s0, s1] = r;
      if (op.zone === 'inside' && s1 >= this.prof.L - 1e-3) return 8;
      const rRef = Math.max(this.rAtS(s0) * 0.62 + this.rAtS(s1) * 0.38, 0.05);
      return clamp(Math.round((2 * Math.PI * rRef) / ((s1 - s0) * m.aspect)), 3, 72);
    }
    _band(P, op) {
      const r = this.bandRange(op), motif = window.Motifs.get(op.motif);
      if (!r || !motif) return;
      const [s0, s1] = r, L = this.prof.L, S = P.size, g = P.ctx, wh = s1 - s0;
      if (wh < 1e-3) return;
      const n = this.bandCount(op);
      const rRef = Math.max(this.rAtS(s0) * 0.62 + this.rAtS(s1) * 0.38, 0.05);
      const ww = (2 * Math.PI * rRef) / n, tw = S / n, y0 = (1 - s1 / L) * S, th = (wh / L) * S;
      const colors = { c1: op.c1, c2: op.c2, c3: op.c3, w: op.w || '#f4f0e6' };
      g.save();
      g.beginPath(); g.rect(0, y0, S, th); g.clip();
      if (op.bg) { g.fillStyle = op.bg; g.fillRect(0, y0, S, th); }
      for (let k = -1; k <= n; k++) {
        g.save();
        g.translate(k * tw, y0);
        if (op.zone === 'inside') { g.translate(0, th); g.scale(1, -1); }   // motifs point toward the rim
        g.scale(tw / ww, th / wh);
        motif.draw(g, ww, wh, colors, ((k % n) + n) % n);
        g.restore();
      }
      if (op.border) {
        const bw = Math.max(2, (0.02 / L) * S);
        g.fillStyle = op.c3;
        g.fillRect(0, y0, S, bw);
        g.fillRect(0, y0 + th - bw, S, bw);
      }
      g.restore();
    }
    _sign(P, op) {
      if (!op.text) return;
      const p = this.prof, s0 = p.sFoot * 0.2, s1 = p.sFoot * 0.8;
      const L = p.L, S = P.size, g = P.ctx;
      const rRef = Math.max(this.rAtS((s0 + s1) / 2), 0.1), circ = 2 * Math.PI * rRef;
      const pxPerU = S / circ, pxPerV = S / L;        // texture pixels per world unit, around / along
      const y0 = (1 - s1 / L) * S, th = ((s1 - s0) / L) * S;
      const text = `${op.text} · Rishton`;
      g.save();
      g.translate(S / 2, y0 + th / 2);
      g.scale(pxPerU / pxPerV, 1);                      // undo the texture's anisotropy so letters keep their shape
      let fs = th * 0.72;
      g.font = `700 ${fs}px "Cormorant Garamond", Georgia, serif`;
      const max = (circ * 0.9) * pxPerV;
      const w = g.measureText(text).width;
      if (w > max) { fs *= max / w; g.font = `700 ${fs}px "Cormorant Garamond", Georgia, serif`; }
      g.fillStyle = op.c || '#1f3f91';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 0, 0);
      g.restore();
    }
    _crackle(P, rand) {
      // the crackle never changes for a given texture size, so it is drawn once and stamped from then on
      const S = P.size;
      crackleCache[S] = crackleCache[S] || this._drawCrackle(S, rand);
      P.ctx.drawImage(crackleCache[S], 0, 0);
    }
    _drawCrackle(S, rand) {
      const c = canvas2d(S), g = c.getContext('2d'), n = Math.round(1500 * (S / TEX) ** 2) + 120;
      g.save();
      g.lineWidth = Math.max(0.7, 1.1 * S / TEX);
      g.strokeStyle = 'rgba(12,40,55,0.15)';
      g.beginPath();                        // one path, one stroke: far cheaper than stroking each crack
      for (let i = 0; i < n; i++) {
        let x = rand() * S, y = rand() * S, a = rand() * Math.PI * 2;
        g.moveTo(x, y);
        const steps = 3 + ((rand() * 6) | 0);
        for (let k = 0; k < steps; k++) {
          a += (rand() - 0.5) * 1.4;
          const len = S * (0.004 + rand() * 0.01);
          x += Math.cos(a) * len; y += Math.sin(a) * len;
          g.lineTo(x, y);
        }
      }
      g.stroke();
      g.restore();
      return c;
    }

    // ------------------------------------------------------------ brush
    _strokeState(part, b, c, rand) {
      const P = this.parts[part].paint;
      return { P, part, b, c, rand, last: null, carry: 0, wipe: b === 'wipe' ? P.ctx.createPattern(P.base, 'no-repeat') : null };
    }
    // returns true when the point should be recorded
    _strokeTo(st, x, y, rx, ry) {
      const S = st.P.size;
      if (!st.last || Math.abs(x - st.last.x) > S * 0.5) {
        this._stamp(st, x, y, rx, ry);
        st.last = { x, y }; st.carry = 0;
        return true;
      }
      const dx = x - st.last.x, dy = y - st.last.y, dist = Math.hypot(dx / rx, dy / ry);
      if (dist < 0.05) return false;
      if (st.b === 'dots') {
        st.carry += dist;
        if (st.carry >= 3) { this._stamp(st, x, y, rx, ry); st.carry = 0; }
      } else {
        const steps = Math.ceil(dist / 0.3);
        for (let k = 1; k <= steps; k++) this._stamp(st, st.last.x + dx * k / steps, st.last.y + dy * k / steps, rx, ry);
      }
      st.last = { x, y };
      return true;
    }
    _stamp(st, x, y, rx, ry) {
      const g = st.P.ctx, S = st.P.size, xs = [x];
      if (x - rx < 0) xs.push(x + S);
      if (x + rx > S) xs.push(x - S);
      for (const cx of xs) {
        if (st.b === 'sponge') {
          g.fillStyle = st.c;
          const n = Math.min(14 + (rx * ry) / 30, 90), dot = Math.max(1, Math.min(rx, ry) * 0.18);
          for (let i = 0; i < n; i++) {
            const a = st.rand() * Math.PI * 2, d = Math.sqrt(st.rand());
            g.globalAlpha = 0.25 + st.rand() * 0.4;
            g.beginPath(); g.ellipse(cx + Math.cos(a) * d * rx, y + Math.sin(a) * d * ry, dot * rx / Math.max(rx, ry), dot * ry / Math.max(rx, ry), 0, 0, Math.PI * 2); g.fill();
          }
        } else {
          const k = st.b === 'dots' ? 0.6 : 1;
          g.globalAlpha = st.b === 'brush' ? 0.88 : 1;
          g.fillStyle = st.b === 'wipe' ? st.wipe : st.c;
          g.beginPath(); g.ellipse(cx, y, rx * k, ry * k, 0, 0, Math.PI * 2); g.fill();
        }
      }
      g.globalAlpha = 1;
    }
    _paintTick() {
      const hit = this._hit();
      if (!hit) { if (this.stroke) this.stroke.st.last = null; return; }
      const P = this.parts[hit.part].paint, S = P.size;
      const x = hit.uv.x * S, y = (1 - hit.uv.y) * S;
      let rx, ry;
      const size = this.brush.size;
      if (hit.part === 'pot') {
        const local = this.potGroup.worldToLocal(hit.point.clone());
        const r = Math.max(Math.hypot(local.x, local.z), 0.15);
        rx = (size / (2 * Math.PI * r)) * S;
        ry = (size / this.prof.L) * S;
      } else {
        const meta = this.parts[hit.part].meta;
        rx = (size / meta.len) * S;
        ry = (size / (2 * Math.PI * meta.r)) * S;
      }
      rx = clamp(rx, 1.5, S * 0.25); ry = clamp(ry, 1.5, S * 0.25);
      if (!this.stroke || this.stroke.part !== hit.part) {
        const op = { t: 'stroke', part: hit.part, b: this.brush.type, c: this.brush.color, p: [] };
        this.strokeOps.push(op);
        this.stroke = { part: hit.part, op, st: this._strokeState(hit.part, op.b, op.c, rng(Date.now() & 0xffff)) };
      }
      if (this._strokeTo(this.stroke.st, x, y, rx, ry)) {
        const k = hit.part === 'pot' ? TEX / this.tex : 1;
        this.stroke.op.p.push(Math.round(x * k), Math.round(y * k), Math.round(rx * k * 10) / 10, Math.round(ry * k * 10) / 10);
      }
      P.tex.needsUpdate = true;
    }

    // ------------------------------------------------------------ shaping
    _shapeHit() {
      const n = new THREE.Vector3(this.camera.position.x, 0, this.camera.position.z).normalize();
      const plane = new THREE.Plane(n, 0), hit = new THREE.Vector3();
      this.raycaster.setFromCamera(this.pointer, this.camera);
      if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
      const r = Math.hypot(hit.x, hit.z);
      if (hit.y < -0.3 || hit.y > this.d.height + 1 || r > MAX_R + 1) return null;
      return { r, y: hit.y, point: hit };
    }
    _shapeTick(dt) {
      const hit = this._shapeHit();
      if (!hit) return;
      const d = this.d, R = d.R, T = this.shapeTool;
      const target = clamp(hit.r, MIN_R, MAX_R), rate = 1 - Math.exp(-dt * T.strength * 12);
      const prev = T.tool === 'smooth' ? R.slice() : null;
      let changed = false;
      for (let i = 0; i < N; i++) {
        const w = Math.exp(-(((this.hAt(i) - hit.y) / T.brush) ** 2));
        if (w < 0.01) continue;
        let goal = target;
        if (T.tool === 'smooth') goal = (prev[Math.max(i - 1, 0)] + prev[i] * 2 + prev[Math.min(i + 1, N - 1)]) / 4;
        else if ((T.tool === 'push' && goal > R[i]) || (T.tool === 'pull' && goal < R[i])) continue;
        const next = clamp(R[i] + (goal - R[i]) * w * rate, MIN_R, MAX_R);
        if (next !== R[i]) { R[i] = +next.toFixed(4); changed = true; }
      }
      if (changed) { this.markShape(); this.cb.shapeChange?.(); }
    }
    smoothAll(passes = 6) {
      const R = this.d.R;
      for (let k = 0; k < passes; k++) {
        const c = R.slice();
        for (let i = 1; i < N - 1; i++) R[i] = +((c[i - 1] + c[i] * 2 + c[i + 1]) / 4).toFixed(4);
      }
      this.markShape();
    }

    // ------------------------------------------------------------ input
    _setPointer(e) {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.moved = true;
    }
    _hit() {
      if (!this.prof) return null;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      // the body is picked on the low-poly proxy; handle, spout and lid are small enough to test directly
      const targets = [this.proxy, ...['handle', 'spout', 'lid'].map((n) => this.parts[n].mesh).filter((m) => m.visible)];
      const hit = this.raycaster.intersectObjects(targets, false)[0];
      if (!hit || !hit.uv) return null;
      if (hit.object !== this.proxy) return { part: hit.object.userData.part, uv: hit.uv, point: hit.point };
      // exact angle from the hit point, so brush dabs land where the cursor is
      const local = this.potGroup.worldToLocal(hit.point.clone());
      let u = Math.atan2(local.x, local.z) / (Math.PI * 2);
      if (u < 0) u += 1;
      const s = hit.uv.y * this.prof.L;
      return Object.assign({ part: 'pot', uv: new THREE.Vector2(u, hit.uv.y), point: hit.point, s }, this.sToZone(s));
    }
    _bindPointer() {
      const c = this.canvas;
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('pointerdown', (e) => {
        c.setPointerCapture(e.pointerId);
        this._setPointer(e);
        const orbit = e.button === 1 || e.button === 2 || this.mode === 'view' || this.mode === 'none';
        if (orbit) { this.drag = { x: e.clientX, y: e.clientY }; return; }
        if (e.button !== 0 || this.firing || !this.d) return;
        if (this.mode === 'shape') { this.cb.beforeChange?.(); this.down = true; }
        else if (this.mode === 'paint') { this.cb.beforeChange?.(); this.down = true; this.stroke = null; this.strokeOps = []; }
        else if (this.mode === 'place') {
          const h = this._hit();
          if (h && h.part === 'pot') this.cb.place?.(h.zone, h.a);
        }
      });
      c.addEventListener('pointermove', (e) => {
        this.inside = true;
        this._setPointer(e);
        if (this.drag) {
          const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
          this.cam.targetElev = clamp(this.cam.targetElev + dy * 0.006, -0.1, 1.45);
          this.spinner.rotation.y += dx * 0.01;
          this.drag.x = e.clientX; this.drag.y = e.clientY;
          this.lastManual = performance.now();
        }
      });
      const end = () => {
        if (this.down && this.mode === 'paint' && this.strokeOps?.length) this.cb.strokeEnd?.(this.strokeOps.filter((o) => o.p.length));
        if (this.down && this.mode === 'shape') this.cb.shapeEnd?.();
        this.down = false; this.drag = null; this.stroke = null; this.strokeOps = [];
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      c.addEventListener('pointerleave', () => { this.inside = false; });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.cam.zoom = clamp(this.cam.zoom * Math.exp(e.deltaY * 0.001), 0.4, 2.2);
      }, { passive: false });
    }
    tilt(dir) { this.cam.targetElev = clamp(this.cam.targetElev + dir * 0.2, -0.1, 1.45); }
    zoom(f) { this.cam.zoom = clamp(this.cam.zoom * f, 0.4, 2.2); }
    toggleFlip() { this.flipTarget = this.flipTarget ? 0 : 1; return this.flipTarget; }

    // ------------------------------------------------------------ camera & loop
    fitDistance() {
      const d = this.d;
      let maxR = 0;
      for (const r of d.R) maxR = Math.max(maxR, r);
      if (this.hasPart('handle')) maxR += 0.4 + d.height * 0.16;
      if (this.hasPart('spout')) maxR += 0.3 + d.height * 0.2;
      const v = THREE.MathUtils.degToRad(this.camera.fov) / 2, h = Math.atan(Math.tan(v) * this.camera.aspect);
      const needH = (d.height + 1.2) / (2 * Math.tan(v)), needW = (2 * maxR + 1.4) / (2 * Math.tan(h));
      return Math.max(5, needH, needW);
    }
    _camTick(dt, snap) {
      const k = snap ? 1 : 1 - Math.exp(-dt * 5), c = this.cam, d = this.d;
      c.elev += (c.targetElev - c.elev) * k;
      if (!(this.down && this.mode === 'shape')) {
        c.dist += (this.fitDistance() * c.zoom - c.dist) * k;
        const ty = lerp(d.height * 0.42, d.height * 0.5 + 0.35, this.flip);
        c.ty += (ty - c.ty) * k;
      }
      this.camera.position.set(0, c.ty + Math.sin(c.elev) * c.dist, Math.cos(c.elev) * c.dist);
      this.camera.lookAt(0, c.ty, 0);
    }
    _flipTick(dt, snap) {
      const k = snap ? 1 : 1 - Math.exp(-dt * 4);
      this.flip += (this.flipTarget - this.flip) * k;
      this.potGroup.rotation.x = this.flip * Math.PI;
      this.potGroup.position.y = this.flip * (this.d.height + 0.35);
    }
    _hoverTick() {
      const show = this.inside && !this.drag && !this.firing;
      if (this.mode === 'shape' && show) {
        const hit = this._shapeHit();
        this.marker.visible = !!hit;
        if (hit) {
          this.marker.position.copy(hit.point);
          this.reach.scale.y = this.shapeTool.brush * 2;
          this.fingertip.material.emissive.setHex(this.down ? 0x6a2a08 : 0x3a1a08);
        }
      } else this.marker.visible = false;
      if (this.mode === 'place' && show) {
        // the pot is round, so a still cursor keeps pointing at the same band: only re-pick on movement
        if (!this.moved && this._hoverKey && this._hoverKey.endsWith(':' + this.placeH)) return;
        this.moved = false;
        const h = this._hit();
        if (h && h.part === 'pot') {
          const op = { zone: h.zone, a: h.a, h: this.placeH };
          const key = `${h.zone}:${h.a.toFixed(3)}:${this.placeH}`;
          if (key !== this._hoverKey) { this._hoverKey = key; this._showShell(this.hoverHL, this.bandRange(op)); }
          this.canvas.style.cursor = 'copy';
          return;
        }
      }
      this._hoverKey = null;
      this.hoverHL.visible = false;
      if (this.mode === 'place') this.canvas.style.cursor = 'default';
    }
    fire(onTick, onDone) {
      this.firing = { t: 0, dur: 4.5, onTick, onDone };
    }
    _fireTick(dt) {
      const F = this.firing, f = FINISH[this.d.finish] || FINISH.glossy;
      F.t += dt;
      const p = Math.min(F.t / F.dur, 1), heat = Math.sin(p * Math.PI), q = clamp((p - 0.4) / 0.6, 0, 1);
      const tint = new THREE.Color(f.tint);
      for (const part of Object.values(this.parts)) {
        const m = part.glaze;
        m.emissive.setRGB(1, 0.38, 0.1).multiplyScalar(heat * 0.55);
        m.roughness = lerp(0.88, f.roughness, q);
        m.clearcoat = lerp(0, f.clearcoat, q);
        m.clearcoatRoughness = f.clearcoatRoughness;
        m.color.setScalar(0.86).lerp(tint, q);
      }
      this.key.color.setHSL(0.08, 0.6 + heat * 0.4, 0.9 - heat * 0.2);
      F.onTick?.(Math.round(20 + 1180 * Math.sin(Math.min(p / 0.6, 1) * Math.PI / 2) * (p > 0.6 ? 1 - ((p - 0.6) / 0.4) * 0.95 : 1)), p);
      if (p >= 1) {
        this.firing = null;
        this.d.fired = true;
        this.key.color.setHex(0xfff1de);
        this.markPaint();
        this.applyFinish();
        F.onDone?.();
      }
    }

    // ease the current shape into a new one (used when switching forms)
    morphTo(target, dur = 0.7, done) {
      const d = this.d;
      this.morph = {
        t: 0, dur, done, fromR: d.R.slice(), toR: target.R.slice(),
        from: [d.height, d.wall], to: [target.height, target.wall],
      };
    }
    _morphTick(dt) {
      const m = this.morph, d = this.d;
      m.t += dt;
      const p = Math.min(m.t / m.dur, 1);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      for (let i = 0; i < N; i++) d.R[i] = +lerp(m.fromR[i], m.toR[i], e).toFixed(4);
      d.height = lerp(m.from[0], m.to[0], e);
      d.wall = lerp(m.from[1], m.to[1], e);
      this.markShape();
      this.cb.shapeChange?.();
      if (p >= 1) { this.morph = null; m.done?.(); }
    }
    // a small "settle onto the wheel" entrance for a newly shown piece
    popIn() { this.pop = 0; }
    _popTick(dt) {
      this.pop = Math.min(1, this.pop + dt / 0.8);
      const e = 1 - Math.pow(1 - this.pop, 3);
      this.potGroup.scale.setScalar(0.86 + 0.14 * e);
      this.spinner.rotation.y += (1 - e) * dt * 4;
      if (this.pop >= 1) this.pop = null;
    }

    frame(now) {
      const dt = clamp((now - (this.last || now)) / 1000, 0, 0.05);
      this.last = now;
      if (!this.d) return;
      if (this.morph) this._morphTick(dt);
      if (this.shapeDirty) this.rebuild();
      // wet clay hides the decoration, so the (expensive) repaint can wait until the glaze is visible
      if (this.paintDirty && this.surface === 'glaze') this.repaint();
      if (now - this.lastManual > 1500 && !this.drag) this.spinner.rotation.y += this.spin * Math.PI * 2 * dt;
      if (this.down && !this.drag) {
        if (this.mode === 'shape') this._shapeTick(dt);
        else if (this.mode === 'paint') this._paintTick();
      }
      if (this.firing) this._fireTick(dt);
      if (this.pop !== null) this._popTick(dt);
      this._flipTick(dt);
      this._hoverTick();
      this._camTick(dt);
      this.renderer.render(this.scene, this.camera);
    }
    start() {
      if (this.running) return;
      this.running = true;
      const tick = (now) => {
        if (!this.running) return;
        requestAnimationFrame(tick);
        if (this.canvas.offsetParent === null || document.hidden) { this.last = now; return; }
        this.frame(now);
      };
      requestAnimationFrame(tick);
    }
    stop() { this.running = false; }

    resize() {
      let w, h;
      if (this.opts.size) [w, h] = this.opts.size;
      else { const el = this.canvas.parentElement || this.canvas; w = el.clientWidth; h = el.clientHeight; }
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    // render immediately with the camera settled (used for thumbnails and pictures)
    renderNow(elev) {
      if (!this.d) return;
      if (this.shapeDirty) this.rebuild();
      if (this.paintDirty) this.repaint();
      if (elev !== undefined) this.cam.targetElev = elev;
      this._flipTick(0, true);
      this._camTick(0, true);
      this.renderer.render(this.scene, this.camera);
    }
    snapshot(size, bg = true) {
      this.renderNow();
      const src = this.canvas, side = Math.min(src.width, src.height);
      const out = canvas2d(size), g = out.getContext('2d');
      if (bg) {
        const grad = g.createRadialGradient(size / 2, size * 0.4, size * 0.05, size / 2, size * 0.45, size * 0.75);
        grad.addColorStop(0, '#fbf7ef'); grad.addColorStop(0.65, '#ece3d3'); grad.addColorStop(1, '#d9cbb4');
        g.fillStyle = grad; g.fillRect(0, 0, size, size);
      }
      g.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, size, size);
      return out;
    }

    // real-world size of the piece
    measure() {
      const d = this.d, cm = d.cm || 8;
      let maxR = 0;
      for (const r of d.R) maxR = Math.max(maxR, r);
      let vol = 0;
      if (d.open) {
        const fy = this.floorY(), steps = 80, dy = (d.height - fy) / steps;
        for (let k = 0; k < steps; k++) { const r = this.innerR(fy + (k + 0.5) * dy); vol += Math.PI * r * r * dy; }
      }
      return { h: d.height * cm, d: maxR * 2 * cm, rim: d.R[N - 1] * 2 * cm, litres: (vol * cm ** 3) / 1000, maxR };
    }

    // a rough name for the current shape
    classify() {
      const d = this.d;
      if (!d.open) return 'loy';
      const R = d.R;
      let maxR = 0, bodyMax = 0, neckMin = Infinity;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        maxR = Math.max(maxR, R[i]);
        if (t < 0.7) bodyMax = Math.max(bodyMax, R[i]);
        if (t > 0.45 && t < 0.97) neckMin = Math.min(neckMin, R[i]);
      }
      const top = R[N - 1], ratio = d.height / (2 * maxR);
      if (ratio < 0.13) return 'lagan';
      if (ratio < 0.24) return 'tovoq';
      if (ratio < 0.55) return top > maxR * 0.85 ? (maxR * 2 * (d.cm || 8) < 12 ? 'piyola' : 'kosa') : 'xum';
      if (this.hasPart('spout')) return 'choynak';
      if (this.hasPart('handle')) return ratio > 1.12 ? 'koza' : 'krujka';
      if (neckMin < bodyMax * 0.72 && top > neckMin * 1.05) return ratio > 1.1 ? 'guldon' : 'xum';
      if (top < maxR * 0.7) return 'xum';
      if (ratio > 1.25) return 'guldon';
      return 'piyola';
    }
  }

  PotEngine.TEX = TEX;
  return PotEngine;
})();
