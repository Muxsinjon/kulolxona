(() => {
'use strict';
const D = window.KData, I = window.I18N, M = window.Motifs, PotEngine = window.PotEngine;
const t = (k, v) => I.t(k, v);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-5);
const round = (v, n = 3) => +(+v).toFixed(n);

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}

const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

let toastTimer;
function toast(msg) {
  const e = $('#toast');
  e.textContent = msg;
  e.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => e.classList.remove('show'), 2600);
}

const modal = {
  open(content) {
    const card = $('#modalCard');
    card.innerHTML = '';
    card.append(content);
    $('#modal').hidden = false;
    document.body.classList.add('lock');
  },
  close() { $('#modal').hidden = true; document.body.classList.remove('lock'); },
};
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') modal.close(); });
// thumbnails fade in once they have loaded (load/error don't bubble, so listen in the capture phase)
for (const type of ['load', 'error']) document.addEventListener(type, (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('in'); }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) modal.close(); });

function colorName(hex) {
  const hit = D.colors.find(([, h]) => h.toLowerCase() === String(hex).toLowerCase());
  return hit ? t('col_' + hit[0]) : String(hex).toUpperCase();
}
const masterName = (m) => (m ? m.name[I.lang] || m.name.en : '');
const findMaster = (id) => D.masters.find((m) => m.id === id);
const FLAT = { lagan: 0.95, tovoq: 0.85, kosa: 0.62, piyola: 0.5 };
const elevFor = (form) => FLAT[form] ?? 0.28;
const go = (hash) => { location.hash = hash; };

// ------------------------------------------------------------------ share links (design packed into the URL)

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function encode(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  if ('CompressionStream' in window) {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return 'z' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return 'j' + b64url(json);
}
async function decode(str) {
  const bytes = unb64url(str.slice(1));
  if (str[0] === 'z') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function compact(d) {
  const c = JSON.parse(JSON.stringify(d));
  c.R = c.R.map((r) => round(r));
  for (const op of c.ops) for (const k of ['a', 'h']) if (op[k] !== undefined) op[k] = round(op[k]);
  delete c.sample;
  return c;
}
const linkFor = (payload) => location.href.split('#')[0] + '#/view/' + payload;

// ------------------------------------------------------------------ art helpers

function ornamentURL(motif, pal, h = 68) {
  const m = M.get(motif);
  const reps = 6, w = Math.round(m.aspect * h * reps);
  return M.preview(motif, pal, w, h, reps, pal.w).toDataURL();
}
function paintOrnaments() {
  $$('[data-ornament]').forEach((e) => {
    if (e.dataset.done) return;
    const light = e.classList.contains('light');
    e.style.backgroundImage = `url(${ornamentURL(e.dataset.ornament, light ? D.PAL.tun : D.PAL.ishkor)})`;
    e.dataset.done = '1';
  });
}
function motifIcon(canvas, id, pal = D.PAL.ishkor, bg = '#eaf5f6') {
  const S = 128;
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  g.save(); g.translate(14, 14);
  M.get(id).draw(g, S - 28, S - 28, pal, 0);
  g.restore();
}
function drawLogo() {
  const c = $('#logoMark'), g = c.getContext('2d'), S = c.width;
  g.save();
  g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = D.C.kobalt; g.fillRect(0, 0, S, S);
  g.translate(6, 6);
  M.get('gul').draw(g, S - 12, S - 12, { c1: D.C.firuza, c2: D.C.angob, c3: D.C.tun, w: D.C.angob }, 0);
  g.restore();
}
function avatar(m, size = 152) {
  const c = el('canvas', { width: size, height: size });
  const g = c.getContext('2d'), pal = D.PAL[m.pal] || D.PAL.ishkor;
  g.fillStyle = pal.w; g.fillRect(0, 0, size, size);
  g.save(); g.translate(size * 0.08, size * 0.08);
  M.get(m.motif).draw(g, size * 0.84, size * 0.84, pal, 0);
  g.restore();
  g.fillStyle = 'rgba(15,35,71,.35)'; g.fillRect(0, 0, size, size);
  return c;
}
const initials = (m) => m.name.en.split(' ').map((s) => s[0]).join('');
function silhouette(f, W = 88, H = 80) {
  const c = el('canvas', { width: W, height: H }), g = c.getContext('2d');
  const n = 40, pts = [];
  let maxR = 0;
  for (let i = 0; i < n; i++) { const r = f.r(i / (n - 1)); maxR = Math.max(maxR, r); pts.push(r); }
  const reach = f.handle ? 0.5 : 0, sp = f.spout ? 0.6 : 0;
  const s = Math.min((W - 8) / (2 * maxR + reach + sp), (H - 10) / (f.height + (f.lid ? 0.4 : 0)));
  const cx = W / 2 + (sp - reach) * s / 2, base = H - 4;
  const Y = (i) => base - (i / (n - 1)) * f.height * s;
  g.fillStyle = D.C.ishkor; g.strokeStyle = D.C.ishkor; g.lineWidth = 3.2; g.lineCap = 'round';
  if (f.handle) {
    const yT = Y(n * 0.8), yB = Y(n * 0.32), x = cx + pts[Math.round(n * 0.6)] * s;
    g.beginPath(); g.moveTo(cx + pts[Math.round(n * 0.8)] * s - 2, yT);
    g.bezierCurveTo(x + reach * s * 1.3, yT, x + reach * s * 1.3, yB, cx + pts[Math.round(n * 0.32)] * s - 2, yB); g.stroke();
  }
  if (f.spout) {
    const y0 = Y(n * 0.3), x0 = cx - pts[Math.round(n * 0.3)] * s;
    g.beginPath(); g.moveTo(x0 + 2, y0); g.quadraticCurveTo(x0 - sp * s * 0.5, y0 - 2, x0 - sp * s * 0.9, Y(n * 0.95)); g.lineWidth = 4; g.stroke();
  }
  g.beginPath();
  pts.forEach((r, i) => (i ? g.lineTo(cx + r * s, Y(i)) : g.moveTo(cx + r * s, Y(i))));
  for (let i = n - 1; i >= 0; i--) g.lineTo(cx - pts[i] * s, Y(i));
  g.closePath(); g.fill();
  if (f.open) {
    g.fillStyle = D.C.tun;
    g.beginPath(); g.ellipse(cx, Y(n - 1), Math.max(pts[n - 1] * s - 2, 1), Math.max(2, pts[n - 1] * s * 0.18), 0, 0, Math.PI * 2); g.fill();
  }
  if (f.lid) {
    g.fillStyle = D.C.kobalt;
    g.beginPath(); g.ellipse(cx, Y(n - 1) - 1, pts[n - 1] * s, 5, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.arc(cx, Y(n - 1) - 8, 3, 0, Math.PI * 2); g.fill();
  }
  return c;
}

// ------------------------------------------------------------------ offscreen renderer for thumbnails

let thumbEng = null;
function renderDesign(d, size = 480, elev, bg = false) {
  if (!thumbEng) thumbEng = new PotEngine(document.createElement('canvas'), { wheel: false, interactive: false, size: [720, 720], pixelRatio: 1 });
  const e = thumbEng;
  e.surface = 'glaze';
  e.setDesign(d);
  e.spinner.rotation.y = 0.55;
  e.cam.zoom = 1;
  e.flip = e.flipTarget = 0;
  e.renderNow(elev ?? elevFor(d.form));
  return e.snapshot(size, bg);
}
const thumbCache = new Map();
const thumbQueue = [];
let thumbBusy = false;
function queueThumb(key, make, img, opts = {}) {
  if (thumbCache.has(key)) { img.src = thumbCache.get(key); return; }
  thumbQueue.push({ key, make, img, opts });
  pumpThumbs();
}
function pumpThumbs() {
  if (thumbBusy || !thumbQueue.length) return;
  thumbBusy = true;
  setTimeout(() => {
    const job = thumbQueue.shift();
    try {
      if (!thumbCache.has(job.key)) thumbCache.set(job.key, renderDesign(job.make(), job.opts.size || 480, job.opts.elev).toDataURL('image/png'));
      job.img.src = thumbCache.get(job.key);
    } catch (err) { console.error(err); }
    thumbBusy = false;
    pumpThumbs();
  }, 20);
}

// ------------------------------------------------------------------ shared card builders

function sampleCard(s) {
  const img = el('img', { alt: t('s_' + s.id) });
  queueThumb('s:' + s.id, () => D.sampleDesign(s.id), img);
  return el('article', { class: 'card' },
    el('div', { class: 'thumb', onclick: () => go('#/view/sample:' + s.id) }, img, el('span', { class: 'tag', text: t('f_' + s.form) })),
    el('div', { class: 'body' },
      el('h3', { text: t('s_' + s.id) }),
      el('p', { text: t('sd_' + s.id) }),
      el('div', { class: 'acts' },
        el('button', { class: 'btn primary sm', text: t('customize'), onclick: () => Studio.open({ design: D.sampleDesign(s.id), step: 'decorate', name: t('s_' + s.id) }) }),
        el('a', { class: 'btn ghost sm', href: '#/view/sample:' + s.id, text: t('view_3d') }))));
}
function masterCard(m) {
  const forms = el('div', { class: 'forms-list' }, m.forms.map((f) => el('span', { text: t('f_' + f) })));
  const contact = [];
  if (m.telegram) contact.push(el('a', { class: 'btn ghost sm', href: 'https://t.me/' + m.telegram.replace(/^@/, ''), target: '_blank', rel: 'noopener', text: 'Telegram' }));
  if (m.phone) contact.push(el('a', { class: 'btn ghost sm', href: 'tel:' + m.phone, text: t('call') }));
  return el('article', { class: 'mcard' },
    m.demo ? el('span', { class: 'demo-badge', text: t('demo_profile') }) : null,
    el('div', { class: 'avatar' }, avatar(m), el('span', { text: initials(m) })),
    el('div', {}, el('h3', { text: masterName(m) }), el('div', { class: 'meta', text: t('m_meta', { years: m.years, weeks: m.lead }) })),
    el('p', { text: t('ms_' + m.id) }),
    forms,
    el('div', { class: 'acts' },
      el('button', { class: 'btn primary sm', text: t('send_design'), onclick: () => Studio.open({ step: 'order', master: m.id }) }),
      contact));
}
function patternCard(mo, pal) {
  const cv = M.preview(mo.id, pal, 900, 220, 0, pal.w);
  return el('article', { class: 'pcard' }, cv,
    el('div', { class: 'body' },
      el('h3', {}, t('m_' + mo.id), el('small', { text: t(mo.kind === 'border' ? 'k_border' : 'k_motif') })),
      el('p', { text: t('mm_' + mo.id) }),
      el('button', { class: 'btn ghost sm', text: t('use_studio'), onclick: () => Studio.open({ step: 'decorate', dtab: 'patterns', motif: mo.id, pal: pal.id }) })));
}

function summary(d) {
  const bands = [], seen = new Set(), cols = new Set();
  for (const op of d.ops) {
    if (op.t === 'band') {
      const k = op.motif + op.c1 + op.c2;
      if (!seen.has(k)) { seen.add(k); bands.push(op); }
      [op.c1, op.c2, op.c3].forEach((c) => cols.add(c));
    } else if (op.c) cols.add(op.c);
  }
  return { bands, colors: [...cols] };
}

// ------------------------------------------------------------------ QR & order sheet

function qrCanvas(text, px = 240) {
  if (!window.qrcode || text.length > 2300) return null;
  try {
    const qr = window.qrcode(0, 'L');
    qr.addData(text); qr.make();
    const n = qr.getModuleCount(), cell = Math.floor(px / (n + 8)), size = cell * (n + 8);
    const c = el('canvas', { width: size, height: size }), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
    g.fillStyle = '#0f2347';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) g.fillRect((x + 4) * cell, (y + 4) * cell, cell, cell);
    return c;
  } catch { return null; }
}

async function makeSheet(payload, link) {
  const d = payload.d, o = payload.o;
  try { await document.fonts.load('700 60px "Cormorant Garamond"'); } catch { /* fonts optional */ }
  const W = 1240, H = 1754, c = el('canvas', { width: W, height: H }), g = c.getContext('2d');
  const serif = (s) => `700 ${s}px "Cormorant Garamond", Georgia, serif`, sans = (s, w = 600) => `${w} ${s}px Manrope, Arial, sans-serif`;
  g.fillStyle = '#f7f2e8'; g.fillRect(0, 0, W, H);
  const orn = M.preview('islimi', D.PAL.ishkor, W, 64, 0, D.C.angob);
  g.drawImage(orn, 0, 0); g.drawImage(orn, 0, H - 64);
  g.fillStyle = '#13254d'; g.font = serif(68);
  g.fillText(o ? t('sheet_order') : t('sheet_design'), 80, 170);
  g.font = sans(24); g.fillStyle = '#6e7790';
  const date = new Date(o ? o.date : Date.now()).toLocaleDateString(I.lang);
  g.fillText(`${d.name || t('f_' + d.form)}  ·  ${date}${o ? '  ·  ' + o.id : ''}`, 80, 214);

  g.save();
  g.beginPath(); g.arc(420, 620, 340, 0, Math.PI * 2); g.fillStyle = '#efe6d6'; g.fill();
  g.restore();
  g.drawImage(renderDesign(d, 720, undefined, false), 60, 260, 720, 720);

  // spec column
  const eng = thumbEng;
  const m = eng.measure();
  const rows = [
    [t('spec_form'), t('f_' + eng.classify())],
    [t('spec_diam'), `${m.d.toFixed(1)} ${t('u_cm')}`],
    [t('spec_height'), `${m.h.toFixed(1)} ${t('u_cm')}`],
    [t('spec_vol'), d.open ? `${m.litres.toFixed(2)} ${t('u_l')}` : '—'],
    [t('clay'), t('clay_' + d.clay)],
    [t('spec_finish'), t('fin_' + d.finish)],
  ];
  if (o) rows.push([t('qty'), String(o.qty)], [t('spec_master'), masterName(findMaster(o.master))]);
  let y = 300;
  for (const [k, v] of rows) {
    g.font = sans(18, 800); g.fillStyle = '#6e7790'; g.fillText(k.toUpperCase(), 830, y);
    g.font = serif(36); g.fillStyle = '#13254d'; g.fillText(v, 830, y + 38);
    y += 86;
  }

  // patterns
  const sum = summary(d);
  y = 1030;
  g.font = sans(18, 800); g.fillStyle = '#6e7790'; g.fillText(t('spec_patterns').toUpperCase(), 80, y);
  y += 20;
  sum.bands.slice(0, 6).forEach((b, i) => {
    const x = 80 + (i % 2) * 560, yy = y + Math.floor(i / 2) * 84;
    g.drawImage(M.preview(b.motif, b, 200, 60, 0, b.bg || b.w), x, yy);
    g.font = serif(30); g.fillStyle = '#13254d'; g.fillText(t('m_' + b.motif), x + 220, yy + 30);
    g.font = sans(18); g.fillStyle = '#6e7790'; g.fillText(t('z_' + b.zone), x + 220, yy + 56);
  });
  y += Math.ceil(Math.min(sum.bands.length, 6) / 2) * 84 + 30;
  g.font = sans(18, 800); g.fillStyle = '#6e7790'; g.fillText(t('spec_colors').toUpperCase(), 80, y);
  sum.colors.slice(0, 14).forEach((col, i) => {
    g.beginPath(); g.arc(100 + i * 56, y + 40, 22, 0, Math.PI * 2); g.fillStyle = col; g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.15)'; g.stroke();
  });
  y += 100;

  if (o) {
    g.font = sans(18, 800); g.fillStyle = '#6e7790'; g.fillText(t('customer').toUpperCase(), 80, y);
    g.font = serif(34); g.fillStyle = '#13254d';
    g.fillText([o.name, o.contact].filter(Boolean).join('  ·  ') || '—', 80, y + 40);
    if (o.notes) {
      g.font = sans(20, 500); g.fillStyle = '#3a4866';
      wrap(g, o.notes, 80, y + 84, 760, 30, 5);
    }
  }
  const qr = qrCanvas(link, 300);
  if (qr) {
    g.drawImage(qr, W - 380, H - 400, 300, 300);
    g.font = sans(16); g.fillStyle = '#6e7790'; g.textAlign = 'center';
    g.fillText(t('scan_qr'), W - 230, H - 82);
    g.textAlign = 'left';
  }
  g.font = serif(30); g.fillStyle = '#13254d'; g.fillText('Kulolxona · Rishton', 80, H - 100);
  return c;
}
function wrap(g, text, x, y, maxW, lh, maxLines) {
  const words = String(text).split(/\s+/);
  let line = '', n = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y); y += lh; line = w;
      if (++n >= maxLines - 1) break;
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
}
function download(name, url) {
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
}
const fileSafe = (s) => (s || 'kulolxona').replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'kulolxona';

async function shareModal({ payload, title, sub, master }) {
  const code = await encode(payload);
  const link = linkFor(code);
  const d = payload.d;
  const thumb = renderDesign(d, 360, undefined, true).toDataURL('image/jpeg', 0.88);
  const text = payload.o ? t('share_text_order', { name: d.name || t('f_' + d.form) }) : t('share_text', { name: d.name || t('f_' + d.form) });
  const input = el('input', { class: 'text', value: link, readonly: true, onfocus: (e) => e.target.select() });
  const copy = el('button', {
    class: 'btn primary sm', text: t('copy'),
    onclick: async () => { try { await navigator.clipboard.writeText(link); } catch { input.select(); document.execCommand('copy'); } toast(t('copied')); },
  });
  const digits = master?.phone?.replace(/\D/g, '') || '';
  const btns = el('div', { class: 'share-btns' },
    el('a', { class: 'btn ghost sm', target: '_blank', rel: 'noopener', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`, text: 'Telegram' }),
    master?.telegram ? el('a', { class: 'btn ghost sm', target: '_blank', rel: 'noopener', href: 'https://t.me/' + master.telegram.replace(/^@/, ''), text: '@' + master.telegram.replace(/^@/, '') }) : null,
    el('a', { class: 'btn ghost sm', target: '_blank', rel: 'noopener', href: `https://wa.me/${digits}?text=${encodeURIComponent(text + ' ' + link)}`, text: 'WhatsApp' }),
    el('a', { class: 'btn ghost sm', href: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(text + '\n\n' + link)}`, text: t('email') }),
    el('button', { class: 'btn ghost sm', text: t('dl_sheet'), onclick: async () => download(fileSafe(d.name) + '-order.png', (await makeSheet(payload, link)).toDataURL('image/png')) }),
    el('button', { class: 'btn ghost sm', text: t('dl_file'), onclick: () => download(fileSafe(d.name) + '.kulol.json', URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }))) }),
    el('a', { class: 'btn ghost sm', href: '#/view/' + code, onclick: () => modal.close(), text: t('preview_master') }));
  const qr = qrCanvas(link, 240);
  modal.open(el('div', {},
    el('button', { class: 'modal-close', onclick: modal.close, text: '×' }),
    el('h2', { text: title }),
    el('p', { class: 'sub', text: sub }),
    el('div', { class: 'share-grid' },
      el('img', { src: thumb, alt: '' }),
      el('div', {},
        el('div', { class: 'share-link' }, input, copy),
        link.length > 6000 ? el('p', { class: 'tip', text: t('long_link') }) : null,
        location.protocol === 'file:' || /localhost|127\.0\.0\.1/.test(location.hostname) ? el('p', { class: 'tip', text: t('local_link') }) : null,
        btns,
        qr ? el('div', { class: 'qr' }, qr, el('span', { text: t('scan_qr') })) : null))));
  return link;
}

// ================================================================== PAGES

const Home = {
  list: ['lagan_anor', 'koza_bodom', 'kosa_ishkor', 'choynak_baliq', 'guldon_tun', 'tovoq_qush'],
  init() {
    const e = this.eng = new PotEngine($('#heroCanvas'), { wheel: false, interactive: true });
    e.mode = 'view'; e.spin = 0.07;
    const dots = $('#heroDots');
    this.list.forEach((id, i) => dots.append(el('button', { 'aria-label': id, onclick: () => this.load(i) })));
    this.load(0);
    e.start();
    setInterval(() => {
      if (document.body.classList.contains('route-home') && !e.drag && performance.now() - e.lastManual > 5000) this.load((this.idx + 1) % this.list.length);
    }, 8000);
    $$('[data-motif-icon]').forEach((c) => motifIcon(c, c.dataset.motifIcon));
    $('#statMotifs').textContent = M.list.length;
    $('#statForms').textContent = D.forms.length - 1;
    // the "ishkor" artwork: a lagan seen from above
    setTimeout(() => {
      const art = $('#ishkorArt'), g = art.getContext('2d');
      const img = renderDesign(D.sampleDesign('lagan_anor'), 900, 1.45, false);
      g.fillStyle = '#0f2347'; g.fillRect(0, 0, 900, 900);
      const grad = g.createRadialGradient(450, 450, 100, 450, 450, 450);
      grad.addColorStop(0, '#2a5bc2'); grad.addColorStop(1, '#0f2347');
      g.fillStyle = grad; g.fillRect(0, 0, 900, 900);
      g.drawImage(img, -40, -40, 980, 980);
    }, 300);
    this.render();
  },
  load(i) {
    const first = this.idx === undefined;
    this.idx = i;
    $$('#heroDots button').forEach((b, k) => b.classList.toggle('on', k === i));
    const stage = $('.hero-stage');
    // fade out, swap the piece while it is invisible (the texture bake can stutter), then fade back in
    stage.classList.add('swapping');
    clearTimeout(this._swapT);
    this._swapT = setTimeout(() => {
      const id = this.list[this.idx], d = D.sampleDesign(id);
      this.eng.setDesign(d);
      this.eng.renderNow(elevFor(d.form));
      this.eng.popIn();
      $('#heroCaption').textContent = t('s_' + id);
      setTimeout(() => stage.classList.remove('swapping'), 40);
    }, first ? 0 : 380);
  },
  render() {
    const hs = $('#homeSamples'); hs.innerHTML = '';
    ['lagan_anor', 'koza_bodom', 'piyola_qalampir', 'choynak_baliq'].forEach((id) => hs.append(sampleCard(D.samples.find((s) => s.id === id))));
    const hp = $('#homePatterns'); hp.innerHTML = '';
    ['anor', 'bodom', 'islimi', 'girih', 'qalampir', 'baliq', 'tumor', 'gul'].forEach((id) => {
      hp.append(el('a', { href: '#/patterns' }, M.preview(id, D.PAL.ishkor, 300, 152, 0, D.C.angob), el('span', { text: t('m_' + id) })));
    });
    const hm = $('#homeMasters'); hm.innerHTML = '';
    D.masters.slice(0, 4).forEach((m) => hm.append(masterCard(m)));
  },
  relang() { this.render(); $('#heroCaption').textContent = t('s_' + this.list[this.idx]); },
};

const Samples = {
  filter: 'all',
  init() { this.render(); },
  render() {
    const forms = ['all', ...new Set(D.samples.map((s) => s.form))];
    const f = $('#sampleFilter'); f.innerHTML = '';
    forms.forEach((id) => f.append(el('button', {
      class: id === this.filter ? 'on' : '', text: id === 'all' ? t('all') : t('f_' + id),
      onclick: () => { this.filter = id; this.render(); },
    })));
    const grid = $('#samplesGrid'); grid.innerHTML = '';
    D.samples.filter((s) => this.filter === 'all' || s.form === this.filter).forEach((s) => grid.append(sampleCard(s)));
  },
  relang() { this.render(); },
};

const Patterns = {
  pal: 'ishkor',
  init() { this.render(); },
  render() {
    const row = $('#patPalettes'); row.innerHTML = '';
    D.palettes.forEach((p) => row.append(el('button', {
      class: p.id === this.pal ? 'on' : '', title: t('p_' + p.id),
      onclick: () => { this.pal = p.id; this.render(); },
    }, [p.w, p.c1, p.c2, p.c3].map((c) => { const i = el('i'); i.style.background = c; return i; }))));
    const grid = $('#patternsGrid'); grid.innerHTML = '';
    const pal = D.PAL[this.pal];
    M.list.forEach((mo) => grid.append(patternCard(mo, pal)));
  },
  relang() { this.render(); },
};

const Masters = {
  init() { this.render(); },
  render() { const g = $('#mastersGrid'); g.innerHTML = ''; D.masters.forEach((m) => g.append(masterCard(m))); },
  relang() { this.render(); },
};

const About = {
  terms: ['kulol', 'usta', 'charx', 'angob', 'ishkor', 'naqqosh', 'xumdon', 'lagan', 'piyola', 'kosa'],
  init() {
    this.render();
    setTimeout(() => {
      const c = $('#aboutArt'), g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 900);
      grad.addColorStop(0, '#e9f4f4'); grad.addColorStop(1, '#cfe3e6');
      g.fillStyle = grad; g.fillRect(0, 0, 700, 900);
      g.globalAlpha = 0.18;
      const orn = M.preview('girih', D.PAL.ishkor, 700, 140, 0, '#e9f4f4');
      for (let y = 0; y < 900; y += 140) g.drawImage(orn, 0, y);
      g.globalAlpha = 1;
      g.drawImage(renderDesign(D.sampleDesign('koza_bodom'), 760, 0.25, false), -30, 90, 760, 760);
    }, 200);
  },
  render() {
    const dl = $('#glossary'); dl.innerHTML = '';
    this.terms.forEach((k) => dl.append(el('dt', { text: k[0].toUpperCase() + k.slice(1) }), el('dd', { text: t('gl_' + k) })));
  },
  relang() { this.render(); },
};

const My = {
  tab: 'designs',
  init() {
    $$('#myTabs button').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.mtab; this.render(); }));
    $('#importIn').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const d = data.d || data;
        if (!Array.isArray(d.R) || !Array.isArray(d.ops)) throw new Error('bad file');
        d.id = uid();
        Studio.open({ design: d, step: 'decorate' });
        toast(t('imported'));
      } catch { toast(t('import_err')); }
    });
  },
  show() { this.render(); },
  render() {
    $$('#myTabs button').forEach((b) => b.classList.toggle('on', b.dataset.mtab === this.tab));
    $$('[data-mpanel]').forEach((p) => p.classList.toggle('show', p.dataset.mpanel === this.tab));
    const designs = store.get('kx-designs', []);
    const grid = $('#myDesigns'); grid.innerHTML = '';
    $('#myDesignsEmpty').hidden = designs.length > 0;
    designs.forEach((it) => grid.append(el('article', { class: 'card' },
      el('div', { class: 'thumb', onclick: () => Studio.open({ design: JSON.parse(JSON.stringify(it.design)), step: 'decorate' }) },
        el('img', { src: it.thumb, alt: it.name }), el('span', { class: 'tag', text: t('f_' + it.form) })),
      el('div', { class: 'body' },
        el('h3', { text: it.name || t('untitled') }),
        el('p', { text: new Date(it.date).toLocaleString(I.lang) }),
        el('div', { class: 'acts' },
          el('button', { class: 'btn primary sm', text: t('open'), onclick: () => Studio.open({ design: JSON.parse(JSON.stringify(it.design)), step: 'decorate' }) }),
          el('button', { class: 'btn ghost sm', text: t('share'), onclick: () => shareModal({ payload: { k: 'design', d: it.design }, title: t('share_title'), sub: t('share_sub') }) }),
          el('button', {
            class: 'btn danger sm', text: t('delete'),
            onclick: () => { if (!confirm(t('confirm_delete'))) return; store.set('kx-designs', store.get('kx-designs', []).filter((x) => x.id !== it.id)); this.render(); },
          }))))));
    const orders = store.get('kx-orders', []);
    const list = $('#myOrders'); list.innerHTML = '';
    $('#myOrdersEmpty').hidden = orders.length > 0;
    orders.forEach((o) => {
      const m = findMaster(o.master);
      list.append(el('div', { class: 'order' },
        el('img', { src: o.thumb, alt: '' }),
        el('div', {},
          el('h3', { text: `${o.name || t('untitled')} · ${o.id}` }),
          el('p', { text: `${t('spec_master')}: ${masterName(m)} · ${t('qty')}: ${o.qty} · ${new Date(o.date).toLocaleDateString(I.lang)}` }),
          el('p', { text: t('order_sent') })),
        el('div', { class: 'acts' },
          el('a', { class: 'btn ghost sm', href: '#/view/' + o.code, text: t('open') }),
          el('button', {
            class: 'btn ghost sm', text: t('copy'),
            onclick: async () => { try { await navigator.clipboard.writeText(linkFor(o.code)); toast(t('copied')); } catch { toast(linkFor(o.code)); } },
          }),
          el('button', {
            class: 'btn danger sm', text: t('delete'),
            onclick: () => { if (!confirm(t('confirm_delete'))) return; store.set('kx-orders', store.get('kx-orders', []).filter((x) => x.id !== o.id)); this.render(); },
          }))));
    });
  },
  relang() { this.render(); },
};

const View = {
  init() {
    const e = this.eng = new PotEngine($('#viewCanvas'), { wheel: false, interactive: true });
    e.mode = 'view'; e.spin = 0.08;
    e.start();
    $$('[data-vview]').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.vview;
      if (v === 'up') e.tilt(1); else if (v === 'down') e.tilt(-1); else e.toggleFlip();
    }));
  },
  async show(param) {
    let data;
    try {
      if (param.startsWith('sample:')) data = { k: 'sample', id: param.slice(7), d: D.sampleDesign(param.slice(7)) };
      else data = await decode(param);
      if (!data || !data.d || !Array.isArray(data.d.R)) throw new Error('bad');
    } catch {
      $('#viewSheet').innerHTML = '';
      $('#viewSheet').append(el('h1', { text: t('bad_link') }), el('p', { class: 'sub', text: t('bad_link_p') }), el('a', { class: 'btn primary', href: '#/studio', text: t('hero_cta') }));
      return;
    }
    this.data = data; this.code = param;
    this.eng.flipTarget = 0;
    this.eng.setDesign(data.d);
    this.eng.cam.targetElev = elevFor(data.d.form);
    this.render();
  },
  render() {
    const data = this.data;
    if (!data) return;
    const d = data.d, o = data.o, e = this.eng, m = e.measure(), sheet = $('#viewSheet');
    sheet.innerHTML = '';
    const master = o && findMaster(o.master);
    const title = data.k === 'sample' ? t('s_' + data.id) : (d.name || t('f_' + e.classify()));
    sheet.append(
      el('div', { class: 'eyebrow', text: o ? `${t('sheet_order')} · ${o.id}` : data.k === 'sample' ? t('nav_samples') : t('shared_design') }),
      el('h1', { text: title }),
      el('p', { class: 'sub', text: o ? t('order_for', { master: masterName(master), date: new Date(o.date).toLocaleDateString(I.lang) }) : t('view_sub') }),
      el('div', { class: 'specs' },
        [[t('spec_form'), t('f_' + e.classify())], [t('spec_diam'), `${m.d.toFixed(1)} ${t('u_cm')}`],
          [t('spec_height'), `${m.h.toFixed(1)} ${t('u_cm')}`], [t('spec_vol'), d.open ? `${m.litres.toFixed(2)} ${t('u_l')}` : '—'],
          [t('clay'), t('clay_' + d.clay)], [t('spec_finish'), t('fin_' + d.finish)],
          ...(o ? [[t('qty'), String(o.qty)], [t('spec_master'), masterName(master)]] : [])]
          .map(([k, v]) => el('div', {}, el('span', { text: k }), el('b', { text: v })))));
    const sum = summary(d);
    if (sum.bands.length) {
      sheet.append(el('div', { class: 'lbl', text: t('spec_patterns') }), el('div', { class: 'pat-list' },
        sum.bands.map((b) => el('div', {}, M.preview(b.motif, b, 180, 60, 0, b.bg || b.w), el('div', {}, el('b', { text: t('m_' + b.motif) }), el('span', { text: t('z_' + b.zone) }))))));
    }
    if (sum.colors.length) {
      sheet.append(el('div', { class: 'lbl', text: t('spec_colors') }), el('div', { class: 'chips', style: 'margin:8px 0 16px' },
        sum.colors.map((c) => el('button', { type: 'button' }, el('span', { class: 'dot', style: `background:${c}` }), colorName(c)))));
    }
    if (o && (o.name || o.contact || o.notes)) {
      const contact = o.contact || '';
      const tg = contact.match(/^@?([a-z0-9_]{5,})$/i) && !/^\+?\d+$/.test(contact) ? 'https://t.me/' + contact.replace(/^@/, '') : null;
      const tel = /^\+?[\d\s\-()]{7,}$/.test(contact) ? 'tel:' + contact.replace(/[^\d+]/g, '') : null;
      sheet.append(el('div', { class: 'contact-box' },
        el('div', { class: 'lbl', text: t('customer') }),
        o.name ? el('p', {}, el('b', { text: o.name })) : null,
        contact ? el('p', {}, tg || tel ? el('a', { href: tg || tel, target: '_blank', rel: 'noopener', text: contact }) : contact) : null,
        o.notes ? el('p', { text: o.notes }) : null));
    }
    const copyDesign = () => { const c = JSON.parse(JSON.stringify(d)); c.id = uid(); return c; };
    sheet.append(el('div', { class: 'acts' },
      el('button', { class: 'btn primary', text: data.k === 'sample' ? t('customize') : t('open_copy'), onclick: () => Studio.open({ design: copyDesign(), step: 'decorate', name: title }) }),
      el('button', { class: 'btn ghost', text: t('order_this'), onclick: () => Studio.open({ design: copyDesign(), step: 'order', name: title }) }),
      el('button', {
        class: 'btn ghost', text: t('dl_sheet'),
        onclick: async () => download(fileSafe(title) + '.png', (await makeSheet({ d, o }, data.k === 'sample' ? location.href : linkFor(this.code))).toDataURL('image/png')),
      })));
  },
  relang() { this.render(); },
};

// ================================================================== STUDIO

const Studio = {
  pending: null,
  open(intent) { this.pending = intent; if (location.hash.startsWith('#/studio') && this.eng) this.show(); else go('#/studio'); },

  init() {
    const e = this.eng = new PotEngine($('#studioCanvas'), { wheel: true });
    e.cb = {
      beforeChange: () => this.pushUndo(),
      shapeChange: () => this.infoSoon(),
      shapeEnd: () => { this.syncShape(); this.saveSoon(); },
      strokeEnd: (ops) => { this.d.ops.push(...ops); this.renderLayers(); this.saveSoon(); },
      place: (zone, a) => this.place(zone, a),
    };
    this.ui = {
      step: 'shape', dtab: 'patterns', tool: 'shape', motif: 'anor', palId: 'ishkor', pal: { ...D.PAL.ishkor },
      bandH: 0.35, bandN: 0, border: true, bandBg: false, sel: -1,
      brushType: 'brush', brushColor: D.C.kobalt, brushSize: 0.1, dipPart: 'all', spin: 0.6, master: null,
    };
    this.undoStack = []; this.redoStack = [];
    this.bindStatic();
    this.buildDynamic();
    const draft = store.get('kx-draft');
    this.load(draft && Array.isArray(draft.R) && draft.R.length === D.N ? draft : this.fresh('kosa'));
    e.start();
    this.setStep('shape');
  },
  fresh(form) { const d = D.makeDesign(form); d.id = uid(); return d; },
  load(d) {
    if (!d.id) d.id = uid();
    this.d = d;
    this.ui.sel = -1;
    this.eng.setDesign(d);
    this.syncAll();
  },
  show() {
    const p = this.pending;
    this.pending = null;
    if (p) {
      if (p.design) {
        if (this.d.ops.length) this.saveDesign(true);
        if (p.name && !p.design.name) p.design.name = p.name;
        this.undoStack = []; this.redoStack = [];
        this.load(p.design);
        this.saveSoon();
      }
      if (p.motif) { this.ui.motif = p.motif; }
      if (p.pal && D.PAL[p.pal]) { this.ui.palId = p.pal; this.ui.pal = { ...D.PAL[p.pal] }; }
      if (p.master) this.ui.master = p.master;
      if (p.dtab) this.ui.dtab = p.dtab;
      if (p.motif || p.pal) this.buildDynamic();
      this.setStep(p.step || 'shape');
    } else this.applyMode();
  },

  // ---------------------------------------------------- undo / persistence
  pushUndo() {
    this.undoStack.push(JSON.stringify(this.d));
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
  },
  undo() { this._swap(this.undoStack, this.redoStack); },
  redo() { this._swap(this.redoStack, this.undoStack); },
  _swap(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(this.d));
    const sel = this.ui.sel;
    this.load(JSON.parse(from.pop()));
    if (sel >= 0 && sel < this.d.ops.length && this.d.ops[sel].t === 'band') this.select(sel);
    this.saveSoon();
  },
  saveSoon() { clearTimeout(this._saveT); this._saveT = setTimeout(() => store.set('kx-draft', this.d), 500); },
  saveDesign(silent) {
    const list = store.get('kx-designs', []);
    const item = {
      id: this.d.id, name: this.d.name, form: this.eng.classify(), date: Date.now(),
      thumb: renderDesign(this.d, 320, undefined, true).toDataURL('image/jpeg', 0.85), design: compact(this.d),
    };
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list.splice(i, 1);
    list.unshift(item);
    const ok = store.set('kx-designs', list.slice(0, 60));
    if (!silent) toast(ok ? t('saved') : t('save_err'));
  },

  // ---------------------------------------------------- static UI bindings (once)
  bindStatic() {
    const e = this.eng, u = this.ui;
    $$('#studioSteps button').forEach((b) => b.addEventListener('click', () => this.setStep(b.dataset.step)));
    $$('[data-goto]').forEach((b) => b.addEventListener('click', () => this.setStep(b.dataset.goto)));
    $('#designName').addEventListener('input', (ev) => { this.d.name = ev.target.value; this.saveSoon(); });
    $('#undoBtn').onclick = () => this.undo();
    $('#redoBtn').onclick = () => this.redo();
    $('#saveBtn').onclick = () => this.saveDesign();
    $('#shareBtn').onclick = () => shareModal({ payload: { k: 'design', d: compact(this.d) }, title: t('share_title'), sub: t('share_sub') });
    $('#pngBtn').onclick = () => download(fileSafe(this.d.name) + '.png', e.snapshot(1400).toDataURL('image/png'));
    $('#newBtn').onclick = () => {
      if (this.d.ops.length && !confirm(t('confirm_new'))) return;
      if (this.d.ops.length) this.saveDesign(true);
      this.undoStack = []; this.redoStack = [];
      this.load(this.fresh('kosa'));
      this.setStep('shape');
      this.saveSoon();
    };
    $$('.stage [data-view]').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.view;
      if (v === 'up') e.tilt(1); else if (v === 'down') e.tilt(-1);
      else if (v === 'in') e.zoom(0.85); else if (v === 'out') e.zoom(1 / 0.85);
      else e.toggleFlip();
    }));
    window.addEventListener('keydown', (ev) => {
      if (!document.body.classList.contains('route-studio') || /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
      const k = ev.key.toLowerCase();
      if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); ev.shiftKey ? this.redo() : this.undo(); }
      if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); this.redo(); }
      if ((k === 'delete' || k === 'backspace') && u.sel >= 0) { ev.preventDefault(); this.removeOp(u.sel); }
    });

    // shape
    this.seg('#toolSeg', (v) => { u.tool = v; e.shapeTool.tool = v; }, u.tool);
    this.range('#handSize', 0.45, (v) => { e.shapeTool.brush = v; });
    this.range('#pressure', 0.6, (v) => { e.shapeTool.strength = v; });
    const shapeRange = (sel, key) => {
      const inp = $(sel);
      inp.addEventListener('pointerdown', () => this.pushUndo());
      inp.addEventListener('keydown', () => this.pushUndo());
      inp.addEventListener('input', () => { this.d[key] = +inp.value; e.markShape(); this.infoSoon(); });
      inp.addEventListener('change', () => this.saveSoon());
    };
    shapeRange('#heightIn', 'height');
    shapeRange('#wallIn', 'wall');
    for (const key of ['open', 'handle', 'spout', 'lid']) {
      $(`#${key}In`).addEventListener('change', (ev) => {
        this.pushUndo();
        this.d[key] = ev.target.checked;
        e.markShape(); this.syncShape(); this.infoSoon(); this.saveSoon();
      });
    }
    $$('.spinIn').forEach((inp) => {
      inp.value = u.spin;
      inp.addEventListener('input', () => {
        u.spin = +inp.value;
        $$('.spinIn').forEach((o) => { o.value = inp.value; });
        e.spin = u.spin;
      });
    });
    $('#smoothAll').onclick = () => { this.pushUndo(); e.smoothAll(); this.infoSoon(); this.saveSoon(); };

    // decorate
    $$('#decTabs button').forEach((b) => b.addEventListener('click', () => this.setDtab(b.dataset.dtab)));
    const bh = $('#bandH');
    bh.value = u.bandH;
    bh.addEventListener('input', () => {
      u.bandH = +bh.value; e.placeH = u.bandH;
      this.editSel((op) => { op.h = u.bandH; });
    });
    const bn = $('#bandN');
    bn.value = u.bandN;
    bn.addEventListener('input', () => { u.bandN = +bn.value; this.editSel((op) => { op.n = u.bandN; }); this.showN(); });
    $('#bandBorder').checked = u.border;
    $('#bandBorder').addEventListener('change', (ev) => { u.border = ev.target.checked; this.editSel((op) => { op.border = u.border; }); });
    $('#bandBg').addEventListener('change', (ev) => { u.bandBg = ev.target.checked; this.editSel((op) => { op.bg = u.bandBg ? op.w : null; }); });
    $$('#quickZones [data-qz]').forEach((b) => b.addEventListener('click', () => {
      const [zone, a] = b.dataset.qz.split(':');
      if (zone === 'inside' && !this.d.open) { toast(t('need_open')); return; }
      this.place(zone, +a, true);
    }));
    $('#editDone').onclick = () => this.select(-1);
    $('#editDelete').onclick = () => { if (u.sel >= 0) this.removeOp(u.sel); };

    this.seg('#brushSeg', (v) => { u.brushType = v; e.brush.type = v; this.applyMode(); }, u.brushType);
    this.range('#brushSize', u.brushSize, (v) => { u.brushSize = v; e.brush.size = v; e.placeH = v; });
    e.brush = { type: u.brushType, color: u.brushColor, size: u.brushSize };

    this.seg('#dipSeg', (v) => { u.dipPart = v; }, u.dipPart);
    $('#stripBtn').onclick = () => {
      this.pushUndo();
      this.d.ops = this.d.ops.filter((op) => op.t !== 'dip');
      this.select(-1); e.markPaint(); this.renderLayers(); this.saveSoon();
    };
    $('#signBtn').onclick = () => {
      const text = $('#signIn').value.trim();
      this.pushUndo();
      this.d.ops = this.d.ops.filter((op) => op.t !== 'sign');
      if (text) this.d.ops.push(D.sign(text));
      e.markPaint(); this.renderLayers(); this.saveSoon();
      if (text) { if (!e.flipTarget) e.toggleFlip(); toast(t('signed')); }
    };

    // kiln
    $('#fireBtn').onclick = () => this.fire();
    $('#unfireBtn').onclick = () => { this.pushUndo(); this.d.fired = false; e.applyFinish(); e.markPaint(); this.syncKiln(); this.saveSoon(); };

    // order
    const size = $('#sizeCm');
    size.addEventListener('input', () => {
      const m = e.measure();
      this.d.cm = +size.value / (2 * m.maxR);
      this.renderSpecMini(); this.infoSoon(); this.saveSoon();
    });
    $('#sendBtn').onclick = () => this.send();
  },
  seg(sel, onPick, initial) {
    const btns = $$(`${sel} [data-v]`);
    const set = (v) => btns.forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    btns.forEach((b) => b.addEventListener('click', () => { set(b.dataset.v); onPick(b.dataset.v); }));
    set(initial);
  },
  range(sel, initial, onInput) {
    const inp = $(sel);
    inp.value = initial;
    inp.addEventListener('input', () => onInput(+inp.value));
  },

  // ---------------------------------------------------- dynamic (language / palette dependent) UI
  buildDynamic() {
    const u = this.ui, e = this.eng;
    const fg = $('#formsGrid'); fg.innerHTML = '';
    D.forms.forEach((f) => fg.append(el('button', { 'data-form': f.id, title: t('f_' + f.id), onclick: () => this.setForm(f.id) }, silhouette(f), t('f_' + f.id))));
    const cc = $('#clayChips'); cc.innerHTML = '';
    Object.entries(D.clays).forEach(([id, c]) => cc.append(el('button', {
      'data-clay': id, onclick: () => { this.pushUndo(); this.d.clay = id; e.drawClay(); e.markPaint(); this.syncShape(); this.saveSoon(); },
    }, el('span', { class: 'dot', style: `background:${c.wet}` }), t('clay_' + id))));

    const mg = $('#motifGrid'); mg.innerHTML = '';
    M.list.forEach((mo) => mg.append(el('button', {
      'data-motif': mo.id, class: mo.id === u.motif ? 'on' : '',
      onclick: () => { u.motif = mo.id; this.markMotif(); this.editSel((op) => { op.motif = mo.id; }); },
    }, M.preview(mo.id, u.pal, 200, 88, 0, u.pal.w), el('span', { text: t('m_' + mo.id) }))));

    const pr = $('#paletteRow'); pr.innerHTML = '';
    D.palettes.forEach((p) => pr.append(el('button', {
      'data-pal': p.id, class: p.id === u.palId ? 'on' : '', title: t('p_' + p.id),
      onclick: () => {
        u.palId = p.id; u.pal = { ...p };
        this.editSel((op) => { Object.assign(op, { c1: p.c1, c2: p.c2, c3: p.c3, w: p.w }); if (op.bg) op.bg = p.w; });
        this.buildDynamic();
      },
    }, [p.w, p.c1, p.c2, p.c3].map((c) => { const i = el('i'); i.style.background = c; return i; }))));

    const wells = $('#wells'); wells.innerHTML = '';
    [['c1', 'w_main'], ['c2', 'w_accent'], ['c3', 'w_outline'], ['w', 'w_light']].forEach(([k, label]) => {
      const dot = el('i'); dot.style.background = u.pal[k];
      const btn = el('button', { class: 'well', type: 'button' }, dot, t(label));
      btn.onclick = (ev) => {
        ev.stopPropagation();
        this.colorPopover(btn, u.pal[k], (hex) => {
          u.pal[k] = hex; u.palId = 'custom';
          this.editSel((op) => { op[k] = hex; if (k === 'w' && op.bg) op.bg = hex; });
          this.buildDynamic();
        });
      };
      wells.append(btn);
    });

    this.swatches('#brushColors', u.brushColor, (hex) => { u.brushColor = hex; e.brush.color = hex; if (u.brushType === 'wipe') { u.brushType = 'brush'; e.brush.type = 'brush'; $$('#brushSeg [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === 'brush')); this.applyMode(); } });
    this.swatches('#dipColors', null, (hex) => {
      this.pushUndo();
      this.d.ops.push(D.dip(hex, u.dipPart));
      e.markPaint(); this.renderLayers(); this.saveSoon();
    });

    const fin = $('#finishGrid'); fin.innerHTML = '';
    const look = {
      ishkor: 'radial-gradient(circle at 35% 30%, #fff 0 8%, #4fc4c9 18%, #1e8db3 55%, #0f4c6e)',
      glossy: 'radial-gradient(circle at 35% 30%, #fff 0 8%, #6d8fd6 20%, #1f3f91 60%, #0f2347)',
      satin: 'radial-gradient(circle at 35% 30%, #e9eefb 0 10%, #5b78bd 35%, #1f3f91 75%)',
      matte: 'linear-gradient(160deg, #6f86bd, #2c4a8f)',
    };
    Object.keys(D.finishes).forEach((id) => {
      const i = el('i'); i.style.background = look[id];
      fin.append(el('button', { 'data-fin': id, onclick: () => this.setFinish(id) }, i, el('div', {}, el('b', { text: t('fin_' + id) }), el('span', { text: t('find_' + id) }))));
    });

    const mp = $('#masterPick'); mp.innerHTML = '';
    D.masters.forEach((m) => {
      const av = el('span', { class: 'av' }, avatar(m, 76));
      mp.append(el('button', {
        'data-master': m.id, onclick: () => { u.master = m.id; this.syncOrder(); },
      }, av, el('div', {}, el('b', { text: masterName(m) }), el('span', { text: m.forms.map((f) => t('f_' + f)).join(' · ') }))));
    });
    this.syncAll();
  },
  swatches(sel, current, onPick) {
    const box = $(sel); box.innerHTML = '';
    const all = [];
    const mark = (b) => all.forEach((x) => x.classList.toggle('on', x === b));
    D.colors.forEach(([id, hex]) => {
      const b = el('button', { class: 'swatch' + (hex === current ? ' on' : ''), title: t('col_' + id), style: `background:${hex}` });
      b.onclick = () => { mark(b); onPick(hex); };
      box.append(b); all.push(b);
    });
    const wrap = el('label', { class: 'swatch custom', title: t('any_colour') });
    const inp = el('input', { type: 'color', value: '#5b8bd0' });
    inp.addEventListener('change', () => { mark(wrap); wrap.style.background = inp.value; onPick(inp.value); });
    wrap.append(inp);
    box.append(wrap); all.push(wrap);
  },
  colorPopover(anchor, current, onPick) {
    document.querySelector('.popover')?.remove();
    const pop = el('div', { class: 'popover' });
    const sw = el('div', { class: 'swatches' });
    D.colors.forEach(([id, hex]) => sw.append(el('button', {
      class: 'swatch' + (hex === current ? ' on' : ''), title: t('col_' + id), style: `background:${hex}`,
      onclick: () => { onPick(hex); pop.remove(); },
    })));
    const custom = el('label', { class: 'swatch custom', title: t('any_colour') });
    const inp = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(current) ? current : '#5b8bd0' });
    inp.addEventListener('change', () => { onPick(inp.value); pop.remove(); });
    custom.append(inp); sw.append(custom);
    pop.append(sw);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = clamp(r.left + window.scrollX, 8, window.innerWidth - 250) + 'px';
    pop.style.top = r.bottom + window.scrollY + 6 + 'px';
    setTimeout(() => document.addEventListener('click', function off(ev) {
      if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', off); }
    }), 0);
  },
  markMotif() { $$('#motifGrid button').forEach((b) => b.classList.toggle('on', b.dataset.motif === this.ui.motif)); },

  // ---------------------------------------------------- steps & modes
  setStep(s) {
    const u = this.ui, e = this.eng;
    u.step = s;
    $$('#studioSteps button').forEach((b) => b.classList.toggle('on', b.dataset.step === s));
    $$('[data-step-panel]').forEach((p) => p.classList.toggle('show', p.dataset.stepPanel === s));
    e.cam.targetElev = s === 'shape' ? 0.14 : s === 'decorate' ? Math.max(0.42, elevFor(this.d.form)) : 0.38;
    if (s !== 'decorate') this.select(-1);
    if (s === 'decorate') this.setDtab(u.dtab);
    if (s === 'kiln') this.syncKiln();
    if (s === 'order') this.syncOrder();
    this.applyMode();
    $('.panel-body').scrollTop = 0;
  },
  setDtab(tab) {
    this.ui.dtab = tab;
    $$('#decTabs button').forEach((b) => b.classList.toggle('on', b.dataset.dtab === tab));
    $$('[data-dpanel]').forEach((p) => p.classList.toggle('show', p.dataset.dpanel === tab));
    if (tab !== 'patterns') this.select(-1);
    this.markMotif();
    this.applyMode();
  },
  applyMode() {
    const u = this.ui, e = this.eng;
    let mode = 'view', surface = 'glaze', spin = 0.12, hint = 'h_' + u.step;
    if (u.step === 'shape') { mode = 'shape'; surface = 'clay'; spin = u.spin; }
    else if (u.step === 'decorate') {
      spin = u.spin;
      if (u.dtab === 'patterns') { mode = 'place'; e.placeH = u.bandH; hint = 'h_patterns'; }
      else if (u.dtab === 'brush') {
        if (u.brushType === 'ring') { mode = 'place'; e.placeH = u.brushSize; hint = 'h_ring'; }
        else { mode = 'paint'; hint = 'h_brush'; }
      } else hint = 'h_glaze';
    }
    e.mode = mode; e.spin = spin;
    if (e.surface !== surface) e.setSurface(surface);
    e.canvas.style.cursor = mode === 'view' ? 'grab' : mode === 'place' ? 'copy' : 'crosshair';
    $('#studioHint').textContent = t(hint);
  },

  // ---------------------------------------------------- shape
  setForm(id) {
    this.pushUndo();
    const n = D.makeDesign(id);
    for (const k of ['form', 'open', 'handle', 'spout', 'lid', 'cm']) this.d[k] = n[k];
    this.syncShape();
    $('#heightIn').value = n.height;
    $('#wallIn').value = n.wall;
    this.eng.morphTo(n, 0.7, () => { this.syncShape(); this.info(); this.saveSoon(); });
  },
  syncShape() {
    const d = this.d;
    $('#heightIn').value = d.height;
    $('#wallIn').value = d.wall;
    for (const k of ['open', 'handle', 'spout', 'lid']) $(`#${k}In`).checked = !!d[k];
    $('#wallRow').classList.toggle('disabled', !d.open);
    $('#partToggles').classList.toggle('disabled', !d.open);
    $$('#formsGrid button').forEach((b) => b.classList.toggle('on', b.dataset.form === d.form));
    $$('#clayChips button').forEach((b) => b.classList.toggle('on', b.dataset.clay === d.clay));
  },
  infoSoon() {
    if (this._infoQ) return;
    this._infoQ = requestAnimationFrame(() => { this._infoQ = 0; this.info(); });
  },
  info() {
    const e = this.eng, d = this.d;
    if (!d) return;
    const m = e.measure();
    $('#formBadge').textContent = t('f_' + e.classify());
    $('#dims').innerHTML = '';
    $('#dims').append(
      el('div', { text: `Ø ${m.d.toFixed(1)} ${t('u_cm')}  ·  ${t('h_short')} ${m.h.toFixed(1)} ${t('u_cm')}` }),
      d.open ? el('div', { text: `${t('spec_vol')}: ${m.litres.toFixed(2)} ${t('u_l')}` }) : null);
    if (this.ui.step === 'order') this.renderSpecMini();
  },

  // ---------------------------------------------------- decorate
  selOp() { const i = this.ui.sel; return i >= 0 ? this.d.ops[i] : null; },
  select(i) {
    const u = this.ui;
    u.sel = i;
    this.editPushed = false;
    const op = this.selOp();
    this.eng.select(op && op.t === 'band' ? op : null);
    $('#editingBar').hidden = !op;
    if (op) {
      Object.assign(u, { motif: op.motif, bandH: op.h, bandN: op.n || 0, border: !!op.border, bandBg: !!op.bg });
      u.pal = { c1: op.c1, c2: op.c2, c3: op.c3, w: op.w };
      u.palId = (D.palettes.find((p) => p.c1 === op.c1 && p.c2 === op.c2 && p.c3 === op.c3 && p.w === op.w) || {}).id || 'custom';
      $('#bandH').value = op.h; $('#bandN').value = op.n || 0;
      $('#bandBorder').checked = !!op.border; $('#bandBg').checked = !!op.bg;
      $('#editingLabel').textContent = t('editing', { name: t('m_' + op.motif), zone: t('z_' + op.zone) });
      this.buildDynamic();
      return;
    }
    this.renderLayers();
    this.showN();
  },
  editSel(fn) {
    const op = this.selOp();
    if (!op || op.t !== 'band') return false;
    if (!this.editPushed) { this.pushUndo(); this.editPushed = true; }
    fn(op);
    this.eng.markPaint();
    this.eng.select(op);
    $('#editingLabel').textContent = t('editing', { name: t('m_' + op.motif), zone: t('z_' + op.zone) });
    this.renderLayers();
    this.showN();
    this.saveSoon();
    return true;
  },
  showN() {
    const op = this.selOp();
    const n = this.ui.bandN;
    $('#bandNVal').textContent = n ? String(n) : op && op.t === 'band' && this.eng.prof ? `${t('auto')} · ${this.eng.bandCount(op)}` : t('auto');
  },
  place(zone, a, quick) {
    const u = this.ui, e = this.eng;
    if (u.step !== 'decorate') return;
    if (u.dtab === 'brush' && u.brushType === 'ring') {
      this.pushUndo();
      this.d.ops.push(D.ring(zone, a, u.brushSize, u.brushColor));
      e.markPaint(); this.renderLayers(); this.saveSoon();
      return;
    }
    if (u.dtab !== 'patterns' && !quick) return;
    this.pushUndo();
    const op = D.band(u.motif, zone, a, u.bandH, null, {
      c1: u.pal.c1, c2: u.pal.c2, c3: u.pal.c3, w: u.pal.w, n: u.bandN, border: u.border, bg: u.bandBg ? u.pal.w : null,
    });
    this.d.ops.push(op);
    e.markPaint();
    this.select(this.d.ops.length - 1);
    this.editPushed = true;
    this.saveSoon();
  },
  removeOp(i) {
    this.pushUndo();
    this.d.ops.splice(i, 1);
    if (this.ui.sel === i) this.select(-1);
    else if (this.ui.sel > i) this.ui.sel--;
    this.eng.markPaint(); this.renderLayers(); this.saveSoon();
  },
  moveOp(i, dir) {
    const j = i + dir, ops = this.d.ops;
    if (j < 0 || j >= ops.length) return;
    this.pushUndo();
    [ops[i], ops[j]] = [ops[j], ops[i]];
    if (this.ui.sel === i) this.ui.sel = j; else if (this.ui.sel === j) this.ui.sel = i;
    this.eng.markPaint(); this.renderLayers(); this.saveSoon();
  },
  opLabel(op) {
    const dp = { all: 'dp_all', outside: 'dp_out', inside: 'dp_in', parts: 'dp_parts' };
    switch (op.t) {
      case 'band': return `${t('m_' + op.motif)} · ${t('z_' + op.zone)}`;
      case 'dip': return `${t('l_dip')}: ${colorName(op.c)} (${t(dp[op.part] || 'dp_all')})`;
      case 'ring': return `${t('b_ring')} · ${t('z_' + op.zone)}`;
      case 'stroke': return `${t('b_' + op.b)} · ${t('pt_' + op.part)}`;
      case 'sign': return `${t('signature')}: ${op.text}`;
    }
    return op.t;
  },
  renderLayers() {
    const ol = $('#layers'), ops = this.d.ops;
    ol.innerHTML = '';
    $('#layerCount').textContent = ops.length ? `(${ops.length})` : '';
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      const ic = el('span', { class: 'ic' });
      if (op.t === 'band') ic.append(M.preview(op.motif, op, 68, 44, 0, op.bg || op.w));
      else ic.style.background = op.c || D.C.kobalt;
      const btn = (txt, title, fn) => el('button', { title, text: txt, onclick: (ev) => { ev.stopPropagation(); fn(); } });
      const li = el('li', { class: (op.t === 'band' ? 'clickable ' : '') + (i === this.ui.sel ? 'sel' : '') },
        ic, el('span', { text: this.opLabel(op) }),
        el('span', { class: 'ops' }, btn('↑', t('up'), () => this.moveOp(i, 1)), btn('↓', t('down'), () => this.moveOp(i, -1)), btn('✕', t('delete'), () => this.removeOp(i))));
      if (op.t === 'band') li.addEventListener('click', () => { if (this.ui.step === 'decorate' && this.ui.dtab !== 'patterns') this.setDtab('patterns'); this.select(i); });
      ol.append(li);
    }
    if (!ops.length) ol.append(el('li', {}, el('span'), el('span', { text: t('no_layers') }), el('span')));
  },

  // ---------------------------------------------------- kiln
  setFinish(id) {
    this.pushUndo();
    this.d.finish = id;
    this.eng.applyFinish(); this.eng.markPaint();
    this.syncKiln(); this.saveSoon();
  },
  syncKiln() {
    $$('#finishGrid button').forEach((b) => b.classList.toggle('on', b.dataset.fin === this.d.finish));
    $('#firedNote').hidden = !this.d.fired;
    $('#fireBtn').textContent = this.d.fired ? t('refire') : t('fire');
  },
  fire() {
    const e = this.eng;
    if (e.firing) return;
    this.pushUndo();
    this.d.fired = false;
    e.setSurface('glaze'); e.markPaint();
    $('#stage').classList.add('firing');
    $('#fireBtn').disabled = true;
    e.fire((temp) => { $('#temp').textContent = temp; }, () => {
      $('#stage').classList.remove('firing');
      $('#fireBtn').disabled = false;
      this.syncKiln(); this.saveSoon();
      toast(t('fired_toast'));
    });
  },

  // ---------------------------------------------------- order
  syncOrder() {
    $$('#masterPick button').forEach((b) => b.classList.toggle('on', b.dataset.master === this.ui.master));
    const m = this.eng.measure();
    const size = $('#sizeCm');
    size.value = m.d.toFixed(1);
    this.renderSpecMini();
  },
  renderSpecMini() {
    const m = this.eng.measure(), d = this.d;
    $('#sizeVal').textContent = `${m.d.toFixed(1)} ${t('u_cm')}`;
    const box = $('#specMini'); box.innerHTML = '';
    [[`${m.d.toFixed(1)}`, `Ø ${t('u_cm')}`], [`${m.h.toFixed(1)}`, `${t('h_short')} ${t('u_cm')}`], [d.open ? m.litres.toFixed(2) : '—', t('u_l')]]
      .forEach(([v, k]) => box.append(el('div', {}, el('b', { text: v }), el('span', { text: k }))));
  },
  async send() {
    const u = this.ui, d = this.d;
    if (!u.master) { toast(t('err_master')); return; }
    const include = $('#includeContact').checked;
    const name = $('#custName').value.trim(), contact = $('#custContact').value.trim();
    if (include && !contact) { toast(t('err_contact')); $('#custContact').focus(); return; }
    const o = {
      id: 'KX-' + Date.now().toString(36).toUpperCase().slice(-6), date: Date.now(), master: u.master,
      qty: clamp(parseInt($('#qty').value, 10) || 1, 1, 500), notes: $('#notes').value.trim(),
      name: include ? name : '', contact: include ? contact : '',
    };
    const payload = { k: 'order', d: compact(d), o };
    const master = findMaster(u.master);
    const code = await encode(payload);
    const orders = store.get('kx-orders', []);
    orders.unshift({ id: o.id, date: o.date, master: o.master, qty: o.qty, name: d.name || t('f_' + this.eng.classify()), code, thumb: renderDesign(d, 200, undefined, true).toDataURL('image/jpeg', 0.8) });
    store.set('kx-orders', orders.slice(0, 50));
    shareModal({ payload, title: t('order_ready'), sub: t('order_ready_sub', { master: masterName(master) }), master });
  },

  // ---------------------------------------------------- sync everything
  syncAll() {
    if (!this.d) return;
    $('#designName').value = this.d.name || '';
    this.syncShape();
    this.syncKiln();
    this.renderLayers();
    this.showN();
    this.info();
    if (this.ui.step === 'order') this.syncOrder();
  },
  relang() { this.buildDynamic(); this.applyMode(); if (this.ui.sel >= 0) this.select(this.ui.sel); },
};

// ================================================================== router & language

const routes = { home: Home, studio: Studio, samples: Samples, patterns: Patterns, masters: Masters, about: About, my: My, view: View };
const inited = {};
let current = null;
const canTransition = typeof document.startViewTransition === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
if (canTransition) document.documentElement.classList.add('vt');
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  const r = routes[name] ? name : 'home';
  const swap = () => {
    $$('.page').forEach((p) => p.classList.toggle('show', p.dataset.route === r));
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + r));
    document.body.className = 'route-' + r;
    $('#nav').classList.remove('open');
    document.querySelector('.popover')?.remove();
    if (!inited[r]) { inited[r] = true; routes[r].init(); }
    routes[r].show?.(rest.join('/'));
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };
  // crossfade between pages; staying on the same page (e.g. another shared link) just swaps
  if (canTransition && current && current !== r) {
    // the transition waits for the next painted frame; never let a throttled tab hold the page change back
    let done = false;
    const once = () => { if (!done) { done = true; swap(); } };
    document.startViewTransition(once);
    setTimeout(once, 300);
  } else swap();
  current = r;
}
window.addEventListener('hashchange', route);
$('#menuBtn').onclick = () => $('#nav').classList.toggle('open');

function syncLang() {
  $$('#lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === I.lang));
}
$$('#lang button').forEach((b) => b.addEventListener('click', () => I.set(b.dataset.lang)));
I.on(() => {
  syncLang();
  for (const [k, r] of Object.entries(routes)) if (inited[k]) r.relang?.();
});

window.Kulolxona = { Studio, View, Home, encode, decode };   // handy from the browser console

I.apply();
syncLang();
drawLogo();
paintOrnaments();
route();
})();
