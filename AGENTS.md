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
