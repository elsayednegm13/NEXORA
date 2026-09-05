# NEXORA Portfolio — Phase 2

## Status
Design system + frontend foundation implemented from the approved visual direction.

## Included
- `frontend/index.html` — working Home prototype.
- `frontend/css/design-system.css` — shared tokens and primitives.
- `frontend/css/app.css` — responsive public-site composition.
- `frontend/js/data.js` — temporary frontend data contract.
- `frontend/js/app.js` — language, theme, mobile navigation, reveal motion and project rendering.
- `frontend/assets/brand/` — selected official NEXORA brand assets from the provided Brand Kit.
- `docs/DESIGN_SYSTEM.md` — design rules.
- `docs/approved-visual-reference.png` — approved concept reference.

## Scope rules honored
- No design, personal profile content, services, colors, or layout was copied from the old portfolio.
- Only project data was taken from `ziad223/ziaad-portfolio`.
- Founder records are temporary mock data.
- Package content is temporary and intentionally not treated as final pricing.
- No PHP backend, database, dashboard or API has been added yet in this phase.

## Run locally
From the `frontend` directory:

```bash
python3 -m http.server 4173
```

Open:

```text
http://localhost:4173
```

## Next gate
Approve the implemented Home experience on desktop and mobile, then proceed to the Work archive + Project detail + Contact prototype before freezing the frontend data contract for PHP/API development.
