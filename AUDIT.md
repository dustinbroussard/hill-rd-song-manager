# Repository Audit Report — Hill Rd. Song Manager

Date: 2025-10-28

Scope: Frontend PWA (HTML/CSS/JS). No Flask/React present in this repository; dominant stack is vanilla JavaScript with a service worker and multiple views (`index.html`, `editor/`, `performance/`). Vendor libraries are provided in `lib/`.

## Summary

Overall, the app is a solid client‑side PWA with offline support and a feature‑rich UI. The codebase lacks automated linting and CI, and there was a minor XSS risk in Performance Mode where `song.title` was interpolated via `innerHTML`. This report documents issues found, fixes applied, and recommendations.

## Issues Found and Fixes

### 1) Potential XSS in Performance Mode
- Location: `performance/performance.js` — `this.performanceSongInfo.innerHTML = \`<h2>${song.title}</h2>...\``
- Severity: High (user‑provided titles could inject HTML)
- Fix: Added a local `escapeHtml` helper and applied it to `song.title` when setting `innerHTML`.
- Patch: See diff modifying `performance/performance.js`.

### 2) No Linting Configuration
- Location: Repository root (missing ESLint config and CI)
- Severity: Medium (increases risk of regressions and style drift)
- Fix: Added `.eslintrc.json`, `.eslintignore`, npm scripts (`lint`, `lint:fix`) and GitHub Actions workflow to run lint on PRs and pushes.
- Patch: Added `.eslintrc.json`, `.eslintignore`, updated `package.json`, and `.github/workflows/ci.yml`.
- Notes: Vendor directories (`lib/`, assets, minified files) are ignored.

### 3) Service Worker Robustness
- Location: `sw.js`
- Severity: Low
- Status: No code change required. The SW already caches the app shell and falls back to cache on network failure. Strategy mixes cache-first for same-origin with network update; acceptable for this PWA. Consider cache‑busting and versioning on release.

### 4) Global Access to Utilities
- Locations: `config.js`, `script.js`, `editor/editor.js`
- Severity: Low
- Observation: `ClipboardManager` is used in multiple places. `script.js` defines it; `config.js` references it in event handlers only triggered after main script loads. This is safe in current load order. If reordering scripts, ensure `ClipboardManager` is available or guard its usage.

## Recommended Improvements (Not Applied)

- Input sanitization: Ensure any other user‑provided strings rendered via `innerHTML` use escaping or `textContent`. The main screen uses `escapeHtml` where needed; continue this pattern.
- Testing: Add a lightweight test harness (e.g., Jest + jsdom) for escaping and utility functions. This would require adding dev dependencies and test files.
- Performance: `script.js` is large; consider modularizing application code and deferring vendor libraries with `defer` or lazy‑loading editor/performance bundles per route. Add code splitting if moving to a bundler.
- Accessibility: Toasts are using `role="status"` in the editor. Ensure similar patterns across all toasts (performance page currently uses a minimal toast without ARIA role).
- PWA: Consider precaching additional assets (fonts/CSS) or using Workbox for a more structured strategy (runtime caching, versioning). Avoid mixing `string` and `Request` keys in caches, or normalize consistently.

## Compliance & Tooling

- ESLint: Configured with `eslint:recommended`, browser env, and globals for `Sortable`, `Fuse`, `mammoth`, and `ClipboardManager`.
- Style: Consider adding Prettier for formatting consistency (not added here to avoid new deps beyond ESLint).
- CI: GitHub Actions pipeline runs `npm ci` and `npm run lint` on pushes/PRs.

## Dependency Changes

- Dev Dependencies:
  - `eslint` (reason: add static analysis / linting in CI and locally)

## How to Run

- Lint: `npm run lint`
- Fix (where safe): `npm run lint:fix`
- Serve locally (example): `npx http-server -p 8080` (or any static server)

## Patch Summary

- Security: Escaped `song.title` in Performance Mode (XSS fix).
- Tooling: Added ESLint config/ignore; CI workflow; npm scripts for linting.

## Closing Notes

If you’d like, I can follow up by:
- Adding Jest + jsdom tests for `escapeHtml` and helper utilities.
- Introducing Workbox for SW management and cache versioning.
- Extracting app code from `script.js` into smaller modules and adding a simple bundler.

