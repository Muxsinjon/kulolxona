// Static content for the site: clays, glazes, Rishton forms, palettes, sample pieces and masters.
window.KData = (() => {
  'use strict';
  const N = 72;   // profile samples per pot (must match engine.js)

  const clays = {
    rishton: { wet: '#8e4c2e', bisque: '#c47c55', fleck: '#6a3418' },
    oq:      { wet: '#cfc9bf', bisque: '#f2eee6', fleck: '#b9b2a6' },
    kulrang: { wet: '#7f776c', bisque: '#d3c8b6', fleck: '#5b544b' },
  };

  const finishes = {
    ishkor: { roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, tint: '#e3f5f3' },
    glossy: { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, tint: '#ffffff' },
    satin:  { roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3, tint: '#ffffff' },
    matte:  { roughness: 0.85, clearcoat: 0, clearcoatRoughness: 0.5, tint: '#ffffff' },
  };

  // Traditional Rishton colours (names are translated through i18n keys col_<id>)
  const colors = [
    ['angob', '#f4f0e6'], ['ishkor', '#1e8db3'], ['firuza', '#33b5ae'], ['kobalt', '#1f3f91'],
    ['tun', '#0f2347'], ['yashil', '#3d8a4c'], ['zaytun', '#7d8a3a'], ['oxra', '#d4a03a'],
    ['jigar', '#7a4422'], ['anor', '#a8322b'], ['pushti', '#d98c8c'], ['qora', '#1d1b1b'],
  ];
  const C = Object.fromEntries(colors);

  const palettes = [
    { id: 'ishkor', c1: C.ishkor, c2: C.kobalt, c3: '#0e2756', w: C.angob },
    { id: 'firuza', c1: C.firuza, c2: '#1e6fa8', c3: '#123d5c', w: C.angob },
    { id: 'bog', c1: C.yashil, c2: C.oxra, c3: '#4a2a14', w: '#f2ead8' },
    { id: 'anor', c1: C.anor, c2: C.yashil, c3: '#3e160e', w: '#f4ecdf' },
    { id: 'oltin', c1: C.oxra, c2: C.jigar, c3: '#3a2210', w: '#f6efdc' },
    { id: 'tun', c1: '#f2ead8', c2: C.firuza, c3: '#0b1733', w: C.kobalt },
  ];
  const PAL = Object.fromEntries(palettes.map((p) => [p.id, p]));

  const g = (t, m, s) => Math.exp(-(((t - m) / s) ** 2));
  const forms = [
    { id: 'lagan',   cm: 8,   height: 0.55, wall: 0.11, open: true, r: (t) => 1.3 + 1.55 * Math.pow(t, 0.55) },
    { id: 'tovoq',   cm: 8,   height: 0.85, wall: 0.11, open: true, r: (t) => 1.0 + 1.15 * Math.pow(t, 0.6) },
    { id: 'kosa',    cm: 7,   height: 1.25, wall: 0.12, open: true, r: (t) => 0.62 + 1.0 * Math.sqrt(t) },
    { id: 'piyola',  cm: 5.5, height: 1.0,  wall: 0.08, open: true, r: (t) => 0.5 + 0.42 * Math.pow(t, 0.7) },
    { id: 'koza',    cm: 9,   height: 2.9,  wall: 0.12, open: true, handle: true,
      r: (t) => 0.42 + 0.72 * g(t, 0.38, 0.27) + 0.16 * g(t, 1, 0.08) },
    { id: 'guldon',  cm: 9,   height: 3.2,  wall: 0.12, open: true,
      r: (t) => 0.36 + 0.78 * g(t, 0.33, 0.25) + 0.22 * g(t, 1, 0.1) },
    { id: 'choynak', cm: 9,   height: 1.6,  wall: 0.1,  open: true, handle: true, spout: true, lid: true,
      r: (t) => 0.55 + 0.55 * g(t, 0.42, 0.38) },
    { id: 'xum',     cm: 12,  height: 3.0,  wall: 0.14, open: true,
      r: (t) => 0.62 + 0.92 * g(t, 0.5, 0.36) + 0.12 * g(t, 1, 0.07) },
    { id: 'krujka',  cm: 6,   height: 1.7,  wall: 0.1,  open: true, handle: true,
      r: (t) => 0.78 + 0.08 * t + 0.03 * Math.sin(t * Math.PI) },
    { id: 'loy',     cm: 8,   height: 1.8,  wall: 0.14, open: false,
      r: (t) => 1.05 - 0.12 * Math.pow(t, 6) + 0.04 * Math.sin(t * 3) },
  ];
  const FORM = Object.fromEntries(forms.map((f) => [f.id, f]));

  function makeDesign(formId, extra = {}) {
    const f = FORM[formId] || FORM.kosa;
    const R = [];
    for (let i = 0; i < N; i++) R.push(+f.r(i / (N - 1)).toFixed(4));
    return Object.assign({
      v: 1, name: '', form: f.id, R, height: f.height, wall: f.wall, open: !!f.open,
      handle: !!f.handle, spout: !!f.spout, lid: !!f.lid, clay: 'rishton', finish: 'ishkor',
      fired: false, cm: f.cm, ops: [],
    }, extra);
  }

  // ---- op helpers used by samples (and by the studio when placing patterns)
  const band = (motif, zone, a, h, pal, extra = {}) => {
    const p = PAL[pal] || PAL.ishkor;
    return Object.assign({ t: 'band', motif, zone, a, h, n: 0, c1: p.c1, c2: p.c2, c3: p.c3, w: p.w, bg: null, border: true }, extra);
  };
  const dip = (c, part = 'all') => ({ t: 'dip', c, part });
  const ring = (zone, a, h, c) => ({ t: 'ring', zone, a, h, c });
  const sign = (text) => ({ t: 'sign', text, c: C.kobalt });

  const samples = [
    {
      id: 'lagan_anor', form: 'lagan', finish: 'ishkor',
      ops: [dip(C.angob), ring('rim', 0.5, 0.4, C.kobalt),
        band('kungura', 'inside', 0.05, 0.2, 'ishkor', { border: false }),
        band('islimi', 'inside', 0.25, 0.42, 'ishkor'),
        band('anor', 'inside', 0.58, 0.62, 'ishkor', { n: 8 }),
        band('gul', 'inside', 0.95, 0.5, 'ishkor', { n: 8, border: false }),
        band('nuqta', 'outer', 0.55, 0.3, 'ishkor'), sign('Kulolxona')],
    },
    {
      id: 'kosa_ishkor', form: 'kosa', finish: 'ishkor',
      ops: [dip(C.angob), dip(C.ishkor, 'outside'),
        band('tolqin', 'inside', 0.06, 0.16, 'ishkor', { border: false }),
        band('bodom', 'inside', 0.36, 0.5, 'ishkor'),
        band('girih', 'inside', 0.92, 0.55, 'ishkor', { n: 8, border: false }),
        band('barg', 'outer', 0.55, 0.42, 'tun', { border: false })],
    },
    {
      id: 'piyola_qalampir', form: 'piyola', finish: 'ishkor',
      ops: [dip(C.angob), ring('rim', 0.5, 0.3, C.kobalt),
        band('qalampir', 'outer', 0.5, 0.55, 'anor'),
        ring('outer', 0.06, 0.06, C.kobalt),
        band('gul', 'inside', 0.92, 0.42, 'ishkor', { n: 6, border: false })],
    },
    {
      id: 'koza_bodom', form: 'koza', finish: 'ishkor',
      ops: [dip(C.angob), dip(C.kobalt, 'parts'),
        band('kungura', 'outer', 0.9, 0.24, 'ishkor', { border: false }),
        band('islimi', 'outer', 0.73, 0.32, 'ishkor'),
        band('bodom', 'outer', 0.43, 0.75, 'ishkor'),
        band('tumor', 'outer', 0.13, 0.3, 'ishkor'), ring('rim', 0.5, 0.3, C.kobalt)],
    },
    {
      id: 'choynak_baliq', form: 'choynak', finish: 'glossy',
      ops: [dip(C.angob), dip(C.firuza, 'parts'),
        band('tolqin', 'outer', 0.86, 0.2, 'firuza', { border: false }),
        band('baliq', 'outer', 0.52, 0.5, 'firuza'),
        band('tangacha', 'outer', 0.14, 0.26, 'firuza')],
    },
    {
      id: 'tovoq_qush', form: 'tovoq', finish: 'glossy',
      ops: [dip('#f2ead8'), ring('rim', 0.5, 0.4, C.jigar),
        band('panjara', 'inside', 0.1, 0.24, 'bog'),
        band('qush', 'inside', 0.48, 0.6, 'bog', { n: 6 }),
        band('gul', 'inside', 0.95, 0.42, 'bog', { n: 8, border: false })],
    },
    {
      id: 'guldon_tun', form: 'guldon', finish: 'ishkor',
      ops: [dip(C.kobalt),
        band('zanjir', 'outer', 0.93, 0.16, 'tun', { border: false }),
        band('gul', 'outer', 0.62, 0.55, 'tun'),
        band('mehrob', 'outer', 0.26, 0.62, 'tun')],
    },
    {
      id: 'xum_mehrob', form: 'xum', finish: 'satin',
      ops: [dip('#f4ecdf'), dip(C.anor, 'inside'),
        band('kungura', 'outer', 0.88, 0.3, 'anor', { border: false }),
        band('mehrob', 'outer', 0.52, 1.0, 'anor'),
        band('barg', 'outer', 0.15, 0.3, 'anor')],
    },
    {
      id: 'krujka_girih', form: 'krujka', finish: 'glossy',
      ops: [dip(C.angob), dip(C.kobalt, 'parts'), dip(C.kobalt, 'inside'),
        band('girih', 'outer', 0.5, 0.62, 'firuza', { bg: null }),
        ring('outer', 0.94, 0.06, C.kobalt), ring('outer', 0.06, 0.06, C.kobalt)],
    },
  ];

  function sampleDesign(id) {
    const s = samples.find((x) => x.id === id);
    if (!s) return null;
    return makeDesign(s.form, { name: '', sample: s.id, finish: s.finish, fired: true, ops: JSON.parse(JSON.stringify(s.ops)) });
  }

  // Demo workshops. Replace with real partner masters (names, Telegram usernames, phones).
  const masters = [
    { id: 'm1', name: { uz: 'Bahodir Qosimov', en: 'Bahodir Qosimov', ru: 'Баходир Касымов' }, years: 31,
      forms: ['lagan', 'tovoq', 'kosa'], motif: 'girih', pal: 'ishkor', lead: '3–4', telegram: '', phone: '', demo: true },
    { id: 'm2', name: { uz: 'Malika Yoʻldosheva', en: 'Malika Yoldosheva', ru: 'Малика Юлдашева' }, years: 18,
      forms: ['piyola', 'kosa', 'choynak'], motif: 'gul', pal: 'firuza', lead: '2–3', telegram: '', phone: '', demo: true },
    { id: 'm3', name: { uz: 'Sherzod Islomov', en: 'Sherzod Islomov', ru: 'Шерзод Исламов' }, years: 24,
      forms: ['koza', 'xum', 'guldon'], motif: 'mehrob', pal: 'anor', lead: '4–6', telegram: '', phone: '', demo: true },
    { id: 'm4', name: { uz: 'Nodira Karimova', en: 'Nodira Karimova', ru: 'Нодира Каримова' }, years: 12,
      forms: ['choynak', 'krujka', 'piyola'], motif: 'bodom', pal: 'bog', lead: '2–4', telegram: '', phone: '', demo: true },
  ];

  return { N, clays, finishes, colors, C, palettes, PAL, forms, FORM, makeDesign, band, dip, ring, sign, samples, sampleDesign, masters };
})();
