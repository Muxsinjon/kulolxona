# Kulolxona · Rishton

A digital pottery workshop for Rishton ceramics. Shape a piece on a 3D potter's wheel, decorate it with traditional Rishton patterns, fire it in the kiln, and send the design to a master as a link.

Languages: Uzbek, English, Russian.

## Run locally

```bash
python -m http.server 8123
```

Then open http://localhost:8123.

## Files

- `js/engine.js`: 3D pot engine (three.js r128): shaping, pattern bands, brush, kiln
- `js/motifs.js`: the 17 Rishton motifs
- `js/data.js`: forms, colours, palettes, sample pieces and master profiles
- `js/i18n.js`: translations
- `js/app.js`: pages, studio, sharing and orders

Master profiles in `js/data.js` are demo data. Replace them with real masters before launch.
