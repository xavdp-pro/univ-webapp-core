# INTENT — univ-webapp-core

> Intent classification: CLASS (mold). Instances are the Shaper apps forked from it.

## What this is

The single mold from which every Shaper web app starts: CRMs, staff wikis,
small business tools, universe front-ends. It holds the stack they all share
and nothing they do not:

- an Express 5 API behind a local proxy, bound to `127.0.0.1`;
- a Vite + React front with one layout, one navigation file, one set of UI
  primitives and two dictionaries (French by default, English);
- sign-in by magic link only, sessions in an httpOnly cookie, MariaDB tables
  created by plain SQL migrations;
- PM2 with two processes named after the app, `.env` as the only place where
  a host differs from another.

A fork copies the repository, renames the app in `package.json`, adds its
business routes and pages, and keeps everything else. When a defect is found
in the shared part, it is repaired here first and carried back to the forks.

## What this is not

- Not a framework or a package: it is copied, then owned by the fork.
- Not a Shaper OS universe: it runs as plain Node processes under PM2, with no
  bricks, images or Podman, so it carries no `manifest.json` (see LINEAGE.md).
- Not a component library: only the primitives every app needs (confirm modal,
  slide-over, select, toasts, theme toggle). Anything business-shaped stays out.
- Not an authentication provider: the allowlist is a table in the app's own
  database, seeded from `.env`. No passwords exist anywhere.

## Rules it enforces

- `HOST` defaults to `127.0.0.1`; the API refuses to start in production on a
  missing or default `JWT_SECRET`.
- The four UI rules of 16 September 2026 (pure ajax, no `alert`/`confirm`/`prompt`,
  no native select, searchable pickers for long lists) are checked by
  `tests/ui-rules.test.js` on every file under `src/`.
- Everything in the repository is written in English.
