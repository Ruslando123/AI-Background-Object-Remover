# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Product design direction

Use the Robinzone “Charged” design system as the durable visual direction for this prototype: dark graphite surfaces, Plus Jakarta Sans for UI, JetBrains Mono for compact metadata, Volt `#C8FF00` as the single primary action/selection accent, pill controls, subtle glow, high contrast, and mobile-first layouts. The supplied design-system HTML and Lovable preview are style references, not screen templates; preserve this product's workflow and functionality when applying them.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable UX decisions

- Display uploaded photos and videos without cropping; keep the media fully visible and size the workspace responsively from the source aspect ratio.
- Photo and Video use a compact dropdown and retain independent files, results, processing state, and settings when switching.
- At 390 × 844, prioritize a large preview plus action selection and primary action in the first viewport; secondary settings may continue below.
- Marketing section headings are centered. The “3 easy steps” section uses compact icon/text cards without illustrative screenshots, and the first three photo examples demonstrate different operations.
- Processing uses a stable disabled primary button, spinner, plain-language stage, and separate progress track. Do not use button-fill progress or internal labels such as `WORKSPACE / 01`.
