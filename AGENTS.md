# AGENTS.md — working in a fork of univ-webapp-core

You are in a Shaper web app cast from `univ-webapp-core`. Read `INTENT.md`,
then `README.md`, before touching anything.

## Language

- You speak French with the operator. Everything written into the repository
  (code, comments, commit messages, docs, i18n keys) is English. UI strings
  live in `src/i18n/*.json`; French is the default dictionary.

## Boundaries

- One agent at a time on a fork. Before writing a shared file, re-read it.
- Secrets never enter the repository: `.env` is ignored, `.env.example` holds
  names and comments only. Mailjet keys, `JWT_SECRET` and the database
  password stay on the host (`.env` or `/apps/<name>/etc/...`).
- No personal names, client names or real e-mail addresses in the repository.
- `HOST` stays `127.0.0.1`. The API is reached only through the local proxy;
  never bind `0.0.0.0` to "make it reachable".

## UI rules (set in stone, 16 September 2026)

1. Pure ajax: never a native form POST. A `<form>` is tolerated only when
   `onSubmit` calls `preventDefault()`; otherwise use a button and `api.*`.
2. Never `alert`, `confirm` or `prompt`: use `ConfirmModal` and `toast()`.
3. Never a raw native select: use `components/ui/Select`.
4. Long lists get a searchable picker with a clear cross (`Select` does it
   above `SEARCH_THRESHOLD`).

`npm test` runs `tests/ui-rules.test.js` over `src/`; it must stay green.

## Layout and navigation

- The window never scrolls; `<main>` in `Layout` does. Scroll-to-top on route
  change lives there.
- Grid cells holding `<pre>` keep `min-w-0` (mobile overflow trap).
- New menu entry: add it to `src/data/nav.js`; a new icon is imported from
  `lucide-react` AND mapped in `src/components/iconMap.js`.
- New page: `src/pages/`, routed in `src/App.jsx` under `ProtectedRoute`.
- New API route: `server/routes/`, mounted in `server/app.js` behind
  `authMiddleware`; new tables go in a new numbered file under
  `server/migrations/`, applied with `npm run migrate`. Never edit an applied
  migration.
- All env reads go through `server/config.js`.

## Running

```bash
npm install
npm test
npm run build
pm2 start ecosystem.config.cjs
pm2 restart ecosystem.config.cjs --only <app>-api --update-env   # after editing .env
```

A plain `pm2 restart <app>-api` keeps the old environment: always pass the
ecosystem file and `--update-env` after a `.env` change.

## Commits

The human is the author; you are a `Co-Authored-By` trailer naming your engine
and version. Small, atomic commits; tests green before each.
