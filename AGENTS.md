# Agent Instructions

## Project Facts

This repository contains a Cloudflare Worker for CrossPoint Reader e-ink devices. The Worker renders a calendar and weather display as an 8-bit grayscale BMP. Runtime code and Wrangler config live under `worker/`.

## Commands

- `cd worker && npm install`: install Worker dependencies if a package manifest is added or restored.
- `cd worker && npx wrangler dev`: run the Worker locally.
- `cd worker && npx wrangler deploy`: deploy the Worker.

## Repository Map

- `worker/src/index.ts`: single-file Worker and BMP generation logic.
- `worker/wrangler.toml`: Worker name, entry point, account, and display vars.
- `assets/`: README imagery.

## Agent Workflow

- Keep the BMP output dimensions and e-ink readability constraints in mind for visual changes.
- Store Google Calendar credentials in Wrangler secrets or `.dev.vars`; do not commit real API keys or calendar IDs.
- Prefer small, inspectable rendering changes because device display regressions are hard to spot without an image sample.

## Current executable surface

Read `.agents/rules/repo.md`. `worker/src/index.ts` is the Worker and `worker/wrangler.toml` defines its configuration. There is currently no `package.json` or lockfile, so the README's package-install workflow cannot run in this checkout. Don't add a toolchain dependency as an incidental documentation fix. With a compatible Wrangler already available, `cd worker && wrangler dev` is the local development entry point; note the exact version used. There is no declared test, lint, typecheck, or build script.

The response contract is an 8-bit 480×800 BMP calendar display. Mock calendar behavior does not necessarily eliminate weather/network fetches; inspect the requested path before calling it. For an authorized runtime change, check the returned content type/dimensions and inspect the rendered image. Calendar credentials/IDs and event content remain private. Instructions to publish a calendar or deploy a Worker are account/publication actions, not prerequisites for source-only checks.

## Completing work

Carry the authorized change through the relevant checks and repair failures it causes. Make routine, reversible implementation choices using existing patterns; ask only when missing information, a material product decision, or an authorization boundary prevents the next step. Existing authorization remains valid within its scope. If blocked, name the exact action and missing prerequisite, retain concise evidence, and continue independent work.

Choose verification proportional to the change. For instructions or prose, inspect changed paths, links, and local instruction precedence and run `git diff --check -- <changed-paths>`; don't install dependencies or run the application solely for a prose edit. For behavior changes, exercise the affected behavior and applicable checks below, then broaden only for failures or unresolved risk. Report files changed, checks actually run and their results, commands only inspected, and remaining limitations. A build or source inspection alone does not prove runtime behavior. Continue through already-authorized follow-through; stop at explicit review checkpoints or boundaries requiring new authorization.
