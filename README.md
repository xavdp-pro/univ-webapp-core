# univ-webapp-core

The shared mold for Shaper web apps. Fork it, rename it, add your business
routes and pages; keep the rest. Read `INTENT.md` for what it is and is not,
`AGENTS.md` for the rules an agent follows inside a fork, `LINEAGE.md` for
where each part came from.

## Stack

Node 22 or 24 (target 24, the active LTS; 22 gets security fixes only until
April 2027), ESM. `server/`: Express 5, helmet, express-rate-limit, cookie-parser,
JWT in an httpOnly cookie, MariaDB through mysql2, optional Socket.IO.
`src/`: Vite 8, React 19, react-router 7, Tailwind 4 (`@tailwindcss/vite`),
lucide-react, framer-motion. Tests: vitest + supertest. Processes: PM2.

## Layout

| Path | Role |
| :--- | :--- |
| `server/config.js` | every env read; `HOST` defaults to `127.0.0.1`; production refuses a default `JWT_SECRET` |
| `server/app.js` | the Express app built from explicit dependencies (config, db, auth store, mailer) |
| `server/index.js` | boots the real app: db, seeding of allowed users, optional Socket.IO, listen |
| `server/routes/auth.js` | magic-link request / verify / logout / me |
| `server/lib/` | `db.js` (pool, `ping`), `authStore.js` (SQL behind the auth routes), `mailer.js` (Mailjet or console), `tokens.js`, `realtime.js` |
| `server/migrations/` | numbered `.sql` files and the runner (`npm run migrate`) |
| `src/App.jsx` | routes: `/login`, then everything else behind `ProtectedRoute` inside `Layout` |
| `src/components/` | `Layout`, `Sidebar` (fed by `src/data/nav.js` + `iconMap.js`), `ProtectedRoute`, `LanguageSwitcher` |
| `src/components/ui/` | `ConfirmModal`, `SlideOver`, `Select`, `ToastHost`, `ThemeToggle` |
| `src/pages/` | `Login`, `MagicLink`, `Home`, `Components` (living catalogue of the primitives) |
| `src/api/client.js` | fetch wrapper: JSON, cookie, timeout, 401 → back to login with the reason |
| `src/i18n/` | `fr.json` (default), `en.json`, `translate()`, `I18nProvider` |
| `tests/` | config guard, health with db down, full magic-link flow, UI rules, i18n parity |
| `ecosystem.config.cjs` | PM2: `<app>-api` and `<app>-vite`, named after `package.json` |

## Host convention

```
/apps/<name>/app          this repository (working copy), .env inside
/apps/<name>/.pm2         PM2_HOME of the app's system user
/apps/<name>/etc/...      secrets outside the repo (e.g. mysql/localhost/passwd)
/apps/<name>/log          logs
```

One Unix user per app, named like the app. PM2 runs as that user with
`PM2_HOME=/apps/<name>/.pm2`. The public reverse proxy (Cloudflare tunnel,
nginx) targets `VITE_PORT` in development and `PORT` in production with
`SERVE_DIST=true`.

## Forking into a new app

1. Copy the repository (`git clone`, then point `origin` at the new repo), or
   `cp -a` without `node_modules`, `dist`, `.git`.
2. Rename in one place: `"name"` in `package.json`. PM2 process names, the
   cookie name and the default database user and name follow.
3. On the host: create the system user and the layout above, then the MariaDB
   user and database (same name as the app).
4. `cp .env.example .env` inside `app/` and fill it: `JWT_SECRET`, database
   settings, `AUTH_USERS`, `PUBLIC_URL`, Mailjet keys, ports.
5. `npm install`, then `npm run migrate` to create the auth tables.
6. `npm test` and `npm run build`.
7. `pm2 start ecosystem.config.cjs` (both processes in development) or, in
   production, `SERVE_DIST=true` in `.env` and `pm2 start ecosystem.config.cjs --only <app>-api`.
8. After any `.env` change: `pm2 restart ecosystem.config.cjs --only <app>-api --update-env`
   (a plain restart keeps the old environment).

## Sign-in

Magic link only. `POST /api/auth/magic/request {email}` sends a link
`<PUBLIC_URL><LOGIN_PATH>#<token>` when the address is in `auth_users`
(seeded from `AUTH_USERS` at boot, upsert). The page reads the fragment,
removes it from the address bar and `POST`s `/api/auth/magic/verify {token}`,
which sets the httpOnly session cookie. Tokens are stored as SHA-256 hashes,
expire after `MAGIC_LINK_TTL_MINUTES` and work once. Requests are limited per
address and per IP over `MAGIC_RATE_WINDOW_MINUTES` using `auth_request_log`,
on top of the generic express-rate-limit on `/api` and `/api/auth`. Unknown
addresses get the same answer as known ones. A session ends as soon as the
address leaves `auth_users`.

**Development without Mailjet:** when `MAILJET_API_KEY`/`MAILJET_API_SECRET`
are absent and `NODE_ENV` is not `production`, the link is printed on the
API's console (`pm2 logs <app>-api` or the terminal running `npm run dev:api`).
In production a missing key stops the API at boot.

## Health

`GET /api/health` → `{ ok, service, db: "up" | "down", realtime, ts }`. The
API boots and answers even when MariaDB is unreachable; the pool is created
lazily and `ping()` never throws.

## Realtime

Socket.IO is wired but off. Set `REALTIME_ENABLED=true`, restart the API with
`--update-env`; the front connects after sign-in (`src/lib/realtime.js`,
`getSocket()`), the server authenticates the socket with the session cookie
(`server/lib/realtime.js`, `broadcast()`).

## Theme and language

Colours are tokens in `src/index.css` (`--color-canvas`, `--color-surface`,
`--color-fg`, `--color-accent`, ...) redefined under `html.theme-dark`;
utilities such as `bg-surface` or `text-fg-muted` follow the theme. The saved
theme is applied in `index.html` before first paint. UI strings are keys in
`src/i18n/fr.json` and `src/i18n/en.json` (same keys, checked by a test);
French is the default.

## Navigation

`src/data/nav.js` drives the sidebar. Icons are resolved by name through
`src/components/iconMap.js`: a new icon must be imported from `lucide-react`
**and** added to the map, or the sidebar shows the fallback circle.

## UI rules

Enforced by `tests/ui-rules.test.js` over `src/`: pure ajax (no native form
POST), no `alert`/`confirm`/`prompt`, no native select, searchable picker with
a clear cross for long lists. See `AGENTS.md`.

## Scripts

```bash
npm run dev:api     # API with --watch on server/
npm run dev:vite    # Vite dev server, proxies /api and /socket.io to the API
npm run build       # dist/
npm start           # API only (serves dist/ when SERVE_DIST=true)
npm run migrate     # apply pending server/migrations/*.sql
npm test            # vitest
```
