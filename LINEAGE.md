# LINEAGE — where the mold comes from

Harvested on 18 September 2026 from three running Shaper apps, stripped of
business logic, client data and personal names. Repository names only.

| Part of the mold | Source | What changed |
| :--- | :--- | :--- |
| `server/config.js` | wikishaper-v1 (`server/config.js`) | every env read moved here; `HOST` default is now `127.0.0.1` (was `0.0.0.0`); the production guard throws instead of exiting so it is testable; DB and mail settings added |
| `server/routes/auth.js`, `server/lib/tokens.js` | wikishaper-v1 (`server/routes/auth.js`, `server/lib/tokens.js`) | same flow (request, hashed single-use token, fragment, verify, cookie, per-address and per-IP limits); persistence moved behind `server/lib/authStore.js`; error messages became i18n keys; dependencies injected |
| `server/lib/mailer.js` | wikishaper-v1 (`server/lib/mailjet.js`) | Mailjet send kept; console mailer added for development; refuses production without keys; comment-notification mail dropped |
| `server/lib/db.js` | wikishaper-v1 (`server/lib/db.js`) | lazy pool kept; `ensureSchema` replaced by SQL migrations; `ping()` added for `/api/health`; password from env or file instead of a hard-coded host path |
| `server/migrations/001_auth.sql` | wikishaper-v1 (`ensureSchema`) | the three auth tables as plain SQL, wiki prefix removed |
| helmet, express-rate-limit, `trust proxy` | crmdemo-v1 (`src/server.js`) | same middleware, limits configurable from env |
| `server/lib/realtime.js` | wikishaper-v1 (`server/lib/realtime.js`) | cookie-authenticated Socket.IO kept; page-chat rooms removed; off unless `REALTIME_ENABLED=true` |
| `ecosystem.config.cjs` | wikishaper-v1 | two processes `<app>-api` / `<app>-vite`; the name now comes from `package.json`; ports and public host from `.env` |
| `vite.config.js` | wikishaper-v1, crmdemo-v1 | loopback bind, `/api` and `/socket.io` proxy, HMR host from env instead of a hard-coded domain |
| `src/components/Layout.jsx` | wikishaper-v1 | scrolling `<main>`, scroll-to-top on route change, back-to-top button, mobile header; page chat removed |
| `src/components/Sidebar.jsx`, `src/data/nav.js`, `src/components/iconMap.js` | wikishaper-v1 (`Sidebar.jsx`, `data/wikiNav.js`) | data-driven groups and explicit icon map kept; labels became i18n keys; theme and language controls added |
| `src/components/ui/ToastHost.jsx` | wikishaper-v1 (`ToastHost.jsx`) | imperative `toast()` kept; colours moved to tokens |
| `src/components/ui/ConfirmModal.jsx` | crm-v1 (`ConfirmModal.jsx`) | `open` prop, typed confirmation and Escape handling kept; strings translated; colours moved to tokens |
| `src/components/ui/SlideOver.jsx` | crm-v1 (`SlideOver.jsx`) | full width on phones kept; animation moved to framer-motion; optional footer added |
| `src/components/ui/Select.jsx` | crm-v1 / crmdemo-v1 (`Select.jsx`, identical) | keyboard navigation and search kept; automatic search threshold made explicit (`SEARCH_THRESHOLD`); clear cross on the field added; strings translated |
| `src/components/ui/ThemeToggle.jsx`, `src/index.css` | crmdemo-v1 (`ThemeToggle.jsx`, `index.css`) | `theme-dark` class on `<html>` kept; the `!important` overrides of Tailwind colours replaced by design tokens (`--color-*`) that the utilities reference; theme applied before first paint in `index.html` |
| `src/components/ProtectedRoute.jsx` | crm-v1 (`ProtectedRoute.jsx`) | zustand token store replaced by the cookie session and `AuthProvider`; remembers the wanted page |
| `src/i18n/` | crmdemo-v1 (`src/i18n/index.js`, `useLocaleStore.js`) | `translate()` with nested keys, interpolation and French fallback kept; zustand replaced by a React context; Spanish dropped |
| `src/hooks/useEscapeKey.js`, `src/hooks/useMediaQuery.js` | crm-v1 / crmdemo-v1 | unchanged apart from the mobile breakpoint |
| `src/api/client.js` | wikishaper-v1 (`src/api/client.js`) | fetch with timeout kept; 401 now emits `auth:unauthorized` with the server's reason; errors carry `status` and `code` |
| `src/pages/Login.jsx`, `src/pages/MagicLink.jsx` | wikishaper-v1 | participant picker replaced by an e-mail field; fragment handling kept; reason banner added |
| `tests/` | crmdemo-v1 (vitest + supertest layout) | new tests; the flow runs on an in-memory store and a fake mailer |
| `src/components/ui/DataTable.jsx` | crm-v1 (`src/pages/Clients.jsx`, `src/pages/Interventions.jsx`), crmdemo-v1 (`src/pages/Claims.jsx`), crmxavdp-v1 (`src/pages/Claims.jsx`, `src/pages/AllRecords.jsx`) | no shared table existed: each page hand-wrote its `SortHeader`, compare function and cards. Kept: header-click sort with the natural-order compare, filters as one state object that resets the page, the mobile card shape (primary line, secondary line, meta grid, actions row) and typed confirmation for destructive actions. Added: the `none` state and `aria-sort`, direction icons, debounced search with a clear cross (250 ms in `AllRecords`), stale-response guard, previous rows kept while loading, skeleton / empty / error-with-retry states, selection with a bulk bar, sticky header, a fixed-layout table that truncates instead of overflowing, CSS breakpoint (`md`) instead of `useIsMobile` to avoid the wrong-layout flash |
| `src/components/ui/dataTableUtils.js` | crm-v1 (`src/pages/Clients.jsx` compare function), crm-v1 (`src/pages/BillingDocuments.jsx` paging maths) | pure functions extracted so they run in plain Node; page/pageSize instead of limit/offset on the wire |
| `server/lib/listQuery.js` | crm-v1 (`src/routes/billingDocumentsRoutes.js` `buildWhere`, clamp idiom; `src/routes/logRoutes.js`), crm-v1 (`src/lib/secretsVault.js` list) | the CRMs bound the search but interpolated `LIMIT`/`OFFSET` after `Number()` and never escaped LIKE wildcards; here every request value is a bound parameter, sort comes from a whitelist map, LIKE is escaped, page size is clamped and repeated parameters are rejected |
| `server/routes/authRequests.js` | crm-v1 (`src/routes/logRoutes.js`, admin log list) | same shape (admin-only paged log) over the mold's own `auth_request_log`; `{ rows, total }` instead of `{ logs, total }` |

| `src/components/ui/Field.jsx`, `TextInput.jsx`, `TextArea.jsx`, `Checkbox.jsx`, `useForm.js`, `formValidators.js` | written for the mold (18 September 2026) | no harvest: the running apps each hand-wrote their inputs and validation. One `Field` owns label, hint, error and the aria wiring; the rules are pure so the same file could run server side; server field errors (`{ error, fields }`) map back onto the fields |
| `src/components/ui/columnVisibility.js`, the picker in `DataTable.jsx` | written for the mold | hidden keys per table id in localStorage, `hideable: false` pins a column, reset action; the storage round trip never throws |
| `server/routes/users.js`, `server/lib/seedUsers.js`, `server/migrations/002_users_active.sql`, `src/pages/AdminUsers.jsx` | written for the mold | the allowlist managed from the app: soft removal (`active`), self and last-admin guards, `AUTH_USERS` reduced to a bootstrap list that inserts missing rows and never updates or revives one |

## Why there is no manifest.json

The V1.14 universe manifest schema (`software/schemas/universe-manifest.schema.json`)
requires at least one `brick-*` entry, each with an `img-*` image, an intent
and a perimeter, plus a total `bootOrder`. A web app cast from this mold runs
as two PM2 processes with no container image and no brick; declaring one would
be invention. The manifest is therefore omitted until the class contract has
a shape for plain-process apps.
