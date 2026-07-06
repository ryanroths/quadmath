# RyFly Sim → QuadMath Integration — Claude Code Handoff

## Context
- Site: quadmath.com — static HTML/JS, GitHub Pages, single repo
- Design system: bg #0D0E12, panel #15171D, orange #FF4D1A, green #3DDC97
- Fonts: JetBrains Mono / Space Grotesk / Inter
- Sim: `ryfly-sim.html` — single-file Three.js FPV sim (place in repo root as `sim.html`)

## Tasks

### 1. Add sim to repo
- Copy `ryfly-sim.html` → `sim.html` in repo root
- Create `assets/` dir if missing; sim loads `assets/manifest.json` + GLB files (Kenney City Kit Commercial, CC0)
- Verify relative path: sim fetches `assets/manifest.json` — must resolve from sim.html location

### 2. Replace FPV footage section on index.html
- Find existing footage/video section
- Replace with sim promo section (see snippet in `sim-promo-section.html`)
- Match existing section structure/classes — inspect index.html first, adapt snippet classes to site conventions
- Keep section anchor/nav link working if navbar links to old section id

### 3. Promo section requirements
- Heading: "RYFLY SIM"
- Tagline: free browser FPV sim — Betaflight rates, race mode, angle+acro, dreamland portal
- Feature list (short): real physics, radio calibration (TX16S/EdgeTX), 3-lap race, lofi soundtrack, playground bash spot
- CTA button → `sim.html`, orange (#FF4D1A), hover invert
- Requirement note: desktop + gamepad or radio (USB joystick mode). Keyboard fallback exists but weak
- No autoplay video/iframe of sim — link out only (gamepad focus issues in iframe)

### 4. Checks before commit
- `sim.html` loads standalone on Pages (Three.js from cdnjs, GLTFLoader from jsdelivr — both fine on Pages)
- localStorage calibration works (Pages = real origin, OK)
- GLB total size sane (<30MB); if missing, sim falls back to procedural city — acceptable, note in status text
- Mobile: sim page loads but unusable — acceptable; promo section should say desktop required
- No console errors on index.html after section swap

### 5. Do NOT
- Do not iframe the sim into index.html
- Do not restructure rest of site
- Do not touch Tune Advisor section or Formspree contact section
