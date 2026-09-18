# univ-webapp-core

The shared mold for our Shaper web apps. Fork it, rename it, add your business
routes and pages; keep the rest.

**It installs straight into development mode.** A fresh instance runs the
Vite dev server with hot reload (HMR) next to the API under PM2 watch: you
edit a file on the host and the page in your browser updates by itself, or
the API restarts by itself. That is the normal state of an instance while an
app is being built. When the app is finished, it goes to production on its
own instance (`SERVE_DIST=true`, API only); the development instance stays in
development mode for the next round of work. Read `INTENT.md` for what it is and is not,
`AGENTS.md` for the rules an agent follows inside a fork, `LINEAGE.md` for
where each part came from.

## Stack

Node 22 or 24 (target 24, the active LTS; 22 gets security fixes only until
April 2027), ESM. `server/`: Express 5, helmet, express-rate-limit, cookie-parser,
JWT in an httpOnly cookie, MariaDB through mysql2, optional Socket.IO.
`src/`: Vite 8, React 19, react-router 7, Tailwind 4 (`@tailwindcss/vite`),
lucide-react, framer-motion. Tests: vitest + supertest. Processes: PM2.

## Development mode (the default install)

`pm2 start ecosystem.config.cjs` starts two processes, both named after the app:

| Process | What it watches | What happens on a change |
| :--- | :--- | :--- |
| `<app>-vite` | everything under `src/` (Vite), and `vite.config.js` (PM2) | **HMR**: the browser swaps the changed module in place, React state and scroll kept, no page reload; a change to `vite.config.js` restarts Vite |
| `<app>-api` | `server/` (PM2 `watch`) | **PM2 watch**: the API restarts by itself, typically back within about a second |

Vite serves the pages and proxies `/api/` (and `/socket.io`) to the API, so the
browser talks to a single origin. Nothing else to run: edit, save, look.

**Through a public proxy** (Cloudflare tunnel, nginx), HMR needs its websocket
to come back through the same door:

- `.env`: `VITE_ALLOWED_HOSTS=<public host>`, `VITE_HMR_HOST=<public host>`,
  `VITE_HMR_CLIENT_PORT=443`, `PUBLIC_URL=https://<public host>`;
- the proxy targets `VITE_PORT` and passes the websocket upgrade:

```nginx
location / {
  proxy_pass http://127.0.0.1:<VITE_PORT>;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;   # Vite HMR websocket
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 3600s;
  proxy_buffering off;
}
```

Measured on the reference test instance behind a Cloudflare tunnel and nginx:
a change to `src/pages/Home.jsx` showed in the open page in about 0.3 s with
no reload; a change under `server/` restarted the API in about 1.2 s.

**What the watchers do not pick up**, and what to run instead:

| Change | Run |
| :--- | :--- |
| `.env` | `pm2 restart ecosystem.config.cjs --update-env` (a plain restart keeps the old environment) |
| `package.json` dependencies | `npm install`, then `pm2 restart ecosystem.config.cjs` |
| a new file in `server/migrations/` | `npm run migrate` (the API restart alone does not apply it) |
| `ecosystem.config.cjs` | `pm2 delete ecosystem.config.cjs && pm2 start ecosystem.config.cjs` |

**Production** is a separate instance of the finished app: `npm run build`,
`SERVE_DIST=true`, `pm2 start ecosystem.config.cjs --only <app>-api`, and the
proxy targets `PORT`. No Vite process, no watch.

## Layout

| Path | Role |
| :--- | :--- |
| `server/config.js` | every env read; `HOST` defaults to `127.0.0.1`; production refuses a default `JWT_SECRET` |
| `server/app.js` | the Express app built from explicit dependencies (config, db, auth store, mailer) |
| `server/index.js` | boots the real app: db, seeding of allowed users, optional Socket.IO, listen |
| `server/routes/auth.js` | magic-link request / verify / logout / me; `createAuthMiddleware`, `requireRole` |
| `server/routes/authRequests.js` | example list endpoint `GET /api/auth-requests` (admin) built on `listQuery` |
| `server/routes/users.js` | `GET/POST/PATCH/DELETE /api/users` (admin): the allowlist managed from the app |
| `server/lib/` | `db.js` (pool, `ping`), `authStore.js` (SQL behind the auth and users routes), `seedUsers.js` (the `AUTH_USERS` bootstrap rule), `mailer.js` (Mailjet or console), `tokens.js`, `realtime.js`, `listQuery.js` (safe sort/search/paging for list endpoints) |
| `server/migrations/` | numbered `.sql` files and the runner (`npm run migrate`); `002` adds `active` and `updated_at` to `auth_users` |
| `src/App.jsx` | routes: `/login`, then everything else behind `ProtectedRoute` inside `Layout` |
| `src/components/` | `Layout`, `Sidebar` (fed by `src/data/nav.js` + `iconMap.js`), `ProtectedRoute`, `LanguageSwitcher` |
| `src/components/ui/` | `ConfirmModal`, `SlideOver`, `Select`, `ToastHost`, `ThemeToggle`, `DataTable` (+ `dataTableUtils.js`, `columnVisibility.js`), forms: `Field`, `TextInput`, `TextArea`, `Checkbox`/`Switch`, `useForm` (+ `formValidators.js`) |
| `src/pages/` | `Login`, `MagicLink`, `Home`, `Components` (living catalogue of the primitives), `DataTableDemo`, `AdminUsers` (`/admin/users`) |
| `src/api/client.js` | fetch wrapper: JSON, cookie, timeout, 401 → back to login with the reason |
| `src/i18n/` | `fr.json` (default), `en.json`, `translate()`, `I18nProvider` |
| `tests/` | config guard, health with db down, full magic-link flow, UI rules, i18n parity, `listQuery`, `auth-requests`, `dataTableUtils`, `users` (endpoints, guards, seed rule), `formValidators`, `columnVisibility` |
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
5. `npm install`, then `npm run migrate` to create the auth tables (also after
   pulling a new numbered migration: `002` is needed by the users page).
6. `npm test` and `npm run build`.
7. `pm2 start ecosystem.config.cjs` (both processes in development) or, in
   production, `SERVE_DIST=true` in `.env` and `pm2 start ecosystem.config.cjs --only <app>-api`.
8. After any `.env` change: `pm2 restart ecosystem.config.cjs --only <app>-api --update-env`
   (a plain restart keeps the old environment).

## Sign-in

Magic link only. `POST /api/auth/magic/request {email}` sends a link
`<PUBLIC_URL><LOGIN_PATH>#<token>` when the address is in `auth_users` and
active (see **Users** for how the table is filled). The page reads the fragment,
removes it from the address bar and `POST`s `/api/auth/magic/verify {token}`,
which sets the httpOnly session cookie. Tokens are stored as SHA-256 hashes,
expire after `MAGIC_LINK_TTL_MINUTES` and work once. Requests are limited per
address and per IP over `MAGIC_RATE_WINDOW_MINUTES` using `auth_request_log`,
on top of the generic express-rate-limit on `/api` and `/api/auth`.

**Nothing tells who is on the allowlist.** A valid request is answered at once
with the same body, whatever the address: the lookup, the token and the mail
run after the response, so neither the status nor the timing differs. A mail
failure is logged (`send_failed` in `auth_request_log`), never returned.

**Every request re-reads the user.** The cookie (HS256 JWT, `SESSION_DAYS`)
only proves who signed in; `authMiddleware` then loads the row from
`auth_users`. A deactivated address is out on its next request, on every route
and on Socket.IO, and `requireRole` uses the current role, not the one of
sign-in time. The cost is one indexed `SELECT` per authenticated request.

**Client address.** Limiters and the request log use `req.ip`, which follows
`TRUST_PROXY` = the exact number of proxies in front of the API: `1` behind one
reverse proxy (nginx, or Vite in development), `2` behind Cloudflare plus
nginx, `0` when nothing sits in front. Too high, and a client picks its
address through `X-Forwarded-For`. `cf-connecting-ip` is used only with
`TRUST_CLOUDFLARE_IP=true`, when Cloudflare is the only way in (a tunnel);
anywhere else a client could send it.

**Development without Mailjet:** when `MAILJET_API_KEY`/`MAILJET_API_SECRET`
are absent and `NODE_ENV` is not `production`, the link is printed on the
API's console (`pm2 logs <app>-api` or the terminal running `npm run dev:api`).
In production a missing key stops the API at boot.

## Users

`auth_users` is the allowlist, and `/admin/users` (sidebar group
"Administration", admins only) manages it: a server-mode `DataTable` over
`GET /api/users`, a `SlideOver` form to add or edit (address, display name,
role `admin` | `member`), a `ConfirmModal` to remove. Every route is behind
`authMiddleware` + `requireRole('admin')`; the server validates (address
shape, lowercase, `email` ≤ 190, `displayName` ≤ 120, role whitelist) and
answers `{ error: 'form.invalid', fields: { email: 'form.email' } }` so the
form shows each message under its field; a duplicate address is `409` with
`fields.email = 'users.emailTaken'`.

**Remove = deactivate.** `DELETE /api/users/:email` sets `active = 0`
(migration `002`); the row stays, shown as "removed", and can be restored
with `PATCH { active: true }`. An inactive address gets no magic link and its
running session ends on its next request. Guards, answered `409`: an admin
cannot remove or demote themselves (`users.cannotRemoveSelf`,
`users.cannotDemoteSelf`); the last active admin cannot be removed or demoted
by anyone (`users.lastAdmin`), even by two admins removing each other at the
same moment: the check and the write run in one transaction that locks the
active admin rows (`store.updateUserKeepingAnAdmin`).

**`AUTH_USERS` is a bootstrap list, not a mirror.** At boot the API inserts
each listed address that has no row in `auth_users` yet, with the given name
and role, and leaves every existing row alone, active or not
(`server/lib/seedUsers.js`, `INSERT IGNORE`). Consequences, chosen as the
least surprising set:

- the first admin is created from `.env`; from then on the Users page owns
  the table;
- editing a name or a role in `.env` changes nothing for a user that already
  exists: do it on the page;
- a user removed on the page never comes back at a restart, even if the
  address is still in `AUTH_USERS`: restore them on the page;
- a new address in `AUTH_USERS` is added at the next restart (with
  `--update-env`).

The boot log says `AUTH_USERS: n inserted, m already known (left untouched)`.
`tests/users.test.js` pins the rule.

## Forms

`Field` wraps one control with its label, hint, required mark and the error
under it, wiring `id`, `aria-invalid` and `aria-describedby`; `inline` puts a
`Checkbox` or `Switch` before its label. `TextInput`, `TextArea`, `Checkbox`
and `Switch` are thin, token-coloured controls; `Select` stays the picker.

`useForm({ initialValues, rules, submit, onSuccess })` holds values, touched,
errors, `submitting` and `submitError`. `rules` maps a field to the pure
helpers of `formValidators.js` (`required`, `email`, `minLength`,
`maxLength`, `oneOf`, `pattern`), or pass `validate(values)`. `field(name)`
returns the props to spread on a control, `error(name)` the message to show
(after blur or a submit attempt). `handleSubmit` calls `preventDefault()`,
validates, then runs `submit(values)` (an `api.*` call) or posts JSON to
`endpoint: { method, path }`; field errors answered by the API as
`{ error, fields }` (`ApiError.fields`) land under the matching fields, any
other error in `submitError`. `reset(values)` reloads the form for an edit.
The UI-rules test still wants `preventDefault()` in the file holding the
`<form>`, so pages write `onSubmit={(e) => { e.preventDefault(); form.handleSubmit(e) }}`.
`/components` shows the set; `/admin/users` is the real use.

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

## Data tables

`src/components/ui/DataTable.jsx` is the one table of the mold: declarative
`columns` (`key`, `header` as an i18n key, `accessor`/`render`, `sortable`,
`align`, `width`, `hideBelow`, `mobile` role), `rows`, `rowKey`. Headers sort
on click (asc, desc, none, with `aria-sort`), a search box with a clear cross,
filters rendered with `Select`, paging with a page-size choice, optional row
selection with a bulk-action bar, row click and row actions; a destructive
action declares `confirm` and goes through `ConfirmModal`. Skeleton, empty and
error-with-retry states are built in. Below `md` each row becomes a card, and
the table never overflows horizontally: cells truncate (`wrap: true` to allow
multi-line).

Two modes, one API:

- **client**: pass `rows`; sorting, search, filters and paging run in memory
  (`dataTableUtils.js`, pure and tested);
- **server**: pass `fetcher(params)` resolving `{ rows, total }`. The component
  sends `{ page, pageSize, sort, dir, q, f_<key> }`, debounces the search,
  drops stale answers and keeps the previous rows while the next page loads.
  `api.list(path, params)` is the matching client call.

Column picker: `columnPicker` adds a "Columns" menu (checkboxes in a popover)
to hide or show columns; a column with `hideable: false` stays. The hidden
keys are saved per table `id` in localStorage (`datatable:<id>:hidden`, see
`columnVisibility.js`, pure and tested, silent without storage) and the menu
offers "reset columns". `/data-table` and `/admin/users` use it.

Server side, `server/lib/listQuery.js` turns those params into SQL fragments
without ever interpolating request text: the sort column is looked up in a
map written by the route (`columns: { createdAt: 'created_at' }`), the
direction is `ASC` or `DESC`, page size is clamped (max 100), search and
filters are bound parameters with `%` and `_` escaped (`ESCAPE '!'`).
`runListQuery(db, { query: req.query, spec, select, from })` runs the count
and the page and answers `{ rows, total, page, pageSize, sort, dir, q }`.
`GET /api/auth-requests` (admin) over `auth_request_log` is the worked
example; `/data-table` shows both modes.

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
