---

description: "Task list for the Photo Album Organizer feature"
---

# Tasks: Photo Album Organizer

**Input**: Design documents from `/specs/001-photo-album-organizer/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.openapi.yaml, contracts/ui-routes.md, quickstart.md

**Tests**: Included. The spec does not ask for TDD by name, but the constitution's quality
gate 3 requires "each acceptance criterion in the spec is covered by at least one test",
and plan.md / research.md R15 define the test stack. Within each story, write the tests
first and confirm they fail before implementing.

**Organization**: Tasks are grouped by user story so each story can be implemented and
tested on its own. Every task names the story (`[USn]`) or the requirement (FR/SC/R/V
number) it fulfills (Constitution Principle I).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- References: `FR-xxx` = spec requirement, `Rn` = research.md decision, `Vn` = quickstart
  validation scenario, `SC-xxx` = success criterion

## Path Conventions

Single full-stack Next.js project at the repository root (plan.md "Structure Decision"):
`src/`, `db/migrations/`, `tests/`, `scripts/`. Server-only code lives in `src/server/` and
must start with `import 'server-only'`.

## Files added during task breakdown

Every file these tasks create is now in plan.md's source tree. These were added while
breaking down the tasks, so their reasons are recorded here for a reviewer (Principle II):

- `src/components/ui/SafeImage.tsx`: a client `<img>` wrapper that swaps in a neutral
  placeholder on `onError`. It is used by TileMosaic, PhotoGrid, and PhotoViewer (three
  uses, so it is a shared component), and it covers the "Preview failed" states in
  ui-routes.md.
- `src/components/ui/ErrorReporter.tsx`: the client error reporter the plan puts in
  `layout.tsx`, kept in its own file because it needs `'use client'`.
- `src/app/sign-in/actions.ts` and `src/app/sign-up/actions.ts`: Server Actions that call
  Better Auth's server API, so the auth pages ship no auth client bundle.
- `src/server/env.ts` and `src/server/photos/ids.ts`: environment validation and photo ID
  generation, split out so the code that uses them stays small.
- `scripts/` checks, `tests/perf/`, `lighthouserc.json`, and `.github/workflows/ci.yml`: the
  performance, privacy, and CI gates the constitution requires.


## Implementation notes (added during /speckit-implement)

Deviations from the tasks as written, each for a reason found while building (Principle I:
the plan's source tree and Complexity Tracking were updated to match):

- **Route groups and ownership layouts** (T047, T073, T077): the library page and loading
  state live in `src/app/(library)/`, the album page in `albums/[date]/(album)/`, and the
  album and photo ownership checks run in `albums/[date]/layout.tsx` and
  `photos/[photoId]/layout.tsx`. Under a `loading.tsx` boundary, `notFound()` streams with
  HTTP 200; checking before the boundary gives real 404s (V13).
- **Header out of the root layout** (T018, T025): `SiteHeader` and `SignOutButton` are
  rendered by each page. A session lookup in the root layout could be left unresolved during
  `router.refresh()`, so the refreshed library never committed.
- **Reload after uploads** (T065): when photos were added, `UploadPanel` saves the summary to
  `sessionStorage` and reloads, instead of calling `router.refresh()`. A refresh that updates
  content inside the library's streamed loading boundary sometimes never commits in
  Next 15.5 (its bundled React 19.2 canary): identical RSC payloads commit or stall
  depending on how the chunks arrive. This was reproducible on WebKit and under load.
- **`/api/photos` skips middleware** (T015, T064): when middleware runs, Next.js buffers the
  request body for it and truncates past 10 MB. The route sets its own request ID.
- **Better Auth on its own connection, transactions off** (T013): see plan.md Complexity
  Tracking (`kysely`).
- **Blocking metadata** (`htmlLimitedBots: /.*/` in next.config.ts): `<title>` is in the
  initial HTML instead of streamed afterwards, which axe checks (SC-006).
- **WebP capture dates** (T058): exifr can't parse the WebP container, so the `EXIF`
  chunk's TIFF payload is extracted (`webpExif` in strip-metadata.ts) and passed to exifr.
- **Orientation**: only JPEG keeps an Orientation tag (R6), so only JPEG display sizes are
  swapped for orientation 5–8. PNG/WebP files with a non-default EXIF orientation are
  stored as-is (rare for camera output).
- **Grid columns** (T046, T071): `minmax(min(9.5rem, calc(50% - gap)), 1fr)`. At 320 px
  the content box is 288 px, where two 9.5 rem columns don't fit.
- **Test hooks** (T049): besides `E2E_FAIL_DB`, the E2E servers honor an `x-e2e-delay-ms`
  request header (≤ 10 s) so loading states can be observed. Both need
  `E2E_TEST_HOOKS=1`, which only the Playwright servers set. Better Auth's rate limit is also
  off on those servers, because every parallel test signs up from 127.0.0.1.
- **Ports** (T005): the Playwright servers use 3100 and 3101, so a dev server on 3000 doesn't
  collide. Perf specs run only with `PERF=1` (`npm run perf:upload`), so `test:e2e` stays fast.
- **Sign-in and sign-up** (T016, T017): Server Actions redirect back with an error code, so
  those pages ship no page-specific client JS.
- **Audit gate** (T086): `npm audit --omit=dev --audit-level=high` blocks. The full audit
  still reports `extract-zip` via Lighthouse CI and puppeteer (dev-only, no fixed version),
  as a CI warning.
- **Fixtures**: `perf-12mp.heic` (4032×3024, about 1.5 MB, made with macOS `sips`) was added
  for T084, since the reference HEIC is too small to represent camera photos.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and tooling

- [X] T001 Initialize the Next.js 15 App Router TypeScript project at the repo root: create `package.json` with runtime deps `next@15`, `react@19`, `react-dom@19`, `better-sqlite3`, `better-auth`, `sharp`, `exifr`, `heic-decode`, `server-only`, and dev deps `typescript@5`, `@types/node@22`, `@types/react`, `@types/better-sqlite3`, `vitest`, `@playwright/test`, `@axe-core/playwright`, `@lhci/cli`, `puppeteer`, `eslint`, `eslint-config-next`, `prettier`, `tsx`; set `"engines": { "node": ">=22" }`; add scripts `dev`, `build`, `start`, `lint` (`next lint && prettier --check .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:e2e` (`playwright test`), `db:migrate` (`tsx scripts/migrate.ts`), `seed` (`tsx scripts/seed.ts`), `perf:lighthouse` (`lhci autorun`), `perf:upload` (`playwright test tests/perf`), `perf:bundle` (`tsx scripts/check-bundle.ts`), `test:log-privacy` (`tsx scripts/check-log-privacy.ts`) in package.json (Quality Gates 1–3, plan "Technical Context")
- [X] T002 Create `tsconfig.json` (`strict: true`, `noUncheckedIndexedAccess: true`, path alias `@/*` → `src/*`) and `next.config.ts` (`serverExternalPackages: ['better-sqlite3', 'sharp']`, `poweredByHeader: false`, security headers `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, and a Content-Security-Policy with `img-src 'self' blob:`) in tsconfig.json and next.config.ts (Quality Gate 2, Principle IV security headers)
- [X] T003 [P] Configure ESLint (`next/core-web-vitals`, `next/typescript`, plus `react/no-danger: error` to forbid `dangerouslySetInnerHTML`, Principle IV) and Prettier in `eslint.config.mjs`, `.prettierrc`, and `.prettierignore`
- [X] T004 [P] Configure Vitest with two projects, `unit` (`tests/unit/**/*.test.ts`) and `integration` (`tests/integration/**/*.test.ts`, each run with a temp `DATABASE_PATH` and `MEDIA_ROOT` from `tests/setup/env.ts`), resolving the `@/*` alias and stubbing `server-only`, in vitest.config.ts and tests/setup/env.ts (Quality Gate 3, R15)
- [X] T005 [P] Configure Playwright with `chromium` and `webkit` projects, a `webServer` that runs `npm run build && npm start` (the only build step) against a throwaway `DATABASE_PATH`/`MEDIA_ROOT` under `test-results/`, `testDir: tests` covering `tests/e2e` and `tests/perf`, and server stdout captured to `test-results/server.log` (used by T081); and a second `webServer` that runs `npm start -- -p 3001` (reusing the same build, never building again) with its own throwaway `DATABASE_PATH`/`MEDIA_ROOT` and `E2E_TEST_HOOKS=1 E2E_FAIL_DB=1`, which error-state tests reach by setting `baseURL` to `http://localhost:3001` (T049), in playwright.config.ts (Quality Gate 3, R15, V15)
- [X] T006 [P] Create `.env.example` with `DATABASE_PATH=./data/app.db`, `MEDIA_ROOT=./data/media`, `BETTER_AUTH_SECRET=` (empty, with a comment: generate with `openssl rand -base64 32`), `BETTER_AUTH_URL=http://localhost:3000`; add `.gitignore` entries for `data/`, `.env*.local`, `.next/`, `test-results/`, `playwright-report/`, `.lighthouseci/` in .env.example and .gitignore (Principle IV: secrets via env)
- [X] T007 [P] Create the environment loader that reads and validates `DATABASE_PATH`, `MEDIA_ROOT`, `BETTER_AUTH_SECRET` (required, at least 32 chars), and `BETTER_AUTH_URL` (valid URL; its origin is the app origin for the Origin check) at startup and throws a clear error if any are missing, never logging their values, in src/server/env.ts (Principle IV: secrets via env, never logged)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database, auth, logging, media serving, shared UI, and test fixtures that every
story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database and storage

- [X] T008 Implement the better-sqlite3 connection singleton (WAL mode, `foreign_keys = ON`, `busy_timeout = 5000`) and a migration runner that applies `db/migrations/*.sql` in filename order once each, recorded in a `schema_migrations` table, in src/server/db.ts; add the CLI entry point that runs it (and Better Auth's migration, see T013) in scripts/migrate.ts (FR-004, FR-014, R2)
- [X] T009 Write migration `photo` table exactly per data-model.md in db/migrations/0001_photo.sql: `id TEXT PRIMARY KEY` ("128-bit random, URL-safe"); `user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE`; `original_filename TEXT NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 255)` ("1–255 chars, control chars stripped"); `format TEXT NOT NULL CHECK (format IN ('jpeg','png','webp','heic'))`; `stored_format TEXT NOT NULL CHECK (stored_format IN ('jpeg','png','webp'))`; `width INTEGER NOT NULL CHECK (width > 0)`; `height INTEGER NOT NULL CHECK (height > 0)`; `stored_bytes INTEGER NOT NULL CHECK (stored_bytes > 0)`; `original_sha256 TEXT NOT NULL CHECK (length(original_sha256) = 64)` ("64 hex chars"); `capture_date TEXT NOT NULL` (`YYYY-MM-DD`); `capture_time TEXT NOT NULL` (`YYYY-MM-DDTHH:mm:ss`, with `CHECK (substr(capture_time,1,10) = capture_date)`); `date_source TEXT NOT NULL CHECK (date_source IN ('exif','upload'))`; `added_at TEXT NOT NULL` (ISO-8601 UTC); plus `UNIQUE (user_id, original_sha256)` and `CREATE INDEX photo_album_idx ON photo (user_id, capture_date, capture_time, added_at, id)` (FR-004, FR-005, FR-010, FR-014, R2)
- [X] T010 [P] Implement the media store in src/server/media-store.ts: `userDir(userId)` under `MEDIA_ROOT/<user_id>/`, `fullPath(id, storedFormat)` → `<id>.<stored_format>`, `thumbPath(id)` → `<id>.thumb.webp`, `writeTemp(bytes)` → a random `.tmp` path in the user dir, `commit(tmpPath, finalPath)` via atomic `rename`, and `discard(tmpPaths)`; reject any id that doesn't match `^[A-Za-z0-9_-]{22}$` so no path is ever built from user input (R4)
- [X] T011 [P] Implement `newPhotoId()` returning a 128-bit random, URL-safe base64 ID (22 chars, `crypto.randomBytes(16).toString('base64url')`) in src/server/photos/ids.ts (FR-014, R4: unguessable IDs)

### Logging and request context (Principle V, R16)

- [X] T012 [P] Implement the JSON-lines logger in src/server/log.ts (about 30 lines): `log.info|warn|error(event, fields)` writes one line with `level`, `ts` (ISO UTC), `requestId`, `event`, and fields; an allow-list of field names (`userId`, `photoId`, `bytes`, `format`, `date_source`, `duration_ms`, `total_ms`, `reason`, `variant`, `status`, `album_count`, `route`, `message`, `stack`) drops anything else so file names, EXIF values, capture dates, emails, and tokens can never be logged; `requestId` comes from an `AsyncLocalStorage` context exported as `withRequestContext(requestId, fn)` and from the `x-request-id` request header (Principle V, R16, FR-015)

### Authentication (FR-014, R10)

- [X] T013 Configure Better Auth with email-and-password, the better-sqlite3 database from src/server/db.ts, httpOnly + Secure + SameSite=Lax session cookies, and the `nextCookies()` plugin; export `auth`, and `requireUser()` which resolves the session from `headers()` and returns `{ id }` or throws a `NotAuthenticated` error; wire Better Auth's schema migration into scripts/migrate.ts; in src/server/auth.ts (FR-014, R10)
- [X] T014 Mount the Better Auth handler with `toNextJsHandler(auth)` exporting `GET` and `POST` in src/app/api/auth/[...all]/route.ts (FR-014, R10)
- [X] T015 Implement middleware in src/middleware.ts: generate a request ID (`crypto.randomUUID()`) unless a valid `x-request-id` (≤ 64 chars, `[A-Za-z0-9-]`) is supplied, set it on the forwarded request headers and the response; for page routes (not `/api/*`, `/media/*`, `/_next/*`, `/sign-in`, `/sign-up`) redirect to `/sign-in?next=<path>` when the Better Auth session cookie is absent (the real check is still `requireUser()` on the server, per Principle IV)
- [X] T016 [P] Build the sign-in page and its Server Action in src/app/sign-in/page.tsx and src/app/sign-in/actions.ts: labeled email and password fields, errors tied to fields with `aria-describedby`, one `<h1>`, `<title>Sign in</title>`, a link to `/sign-up`, and a redirect to a validated same-origin `next` path (reject absolute URLs and `//` prefixes) on success (ui-routes.md "/sign-in") (FR-014, FR-017, R10)
- [X] T017 [P] Build the sign-up page and its Server Action in src/app/sign-up/page.tsx and src/app/sign-up/actions.ts with the same field, error, and heading rules as T016, redirecting to `/` on success (ui-routes.md "/sign-up") (FR-014, FR-017, R10)
- [X] T018 Add a sign-out control (a `<form>` posting a Server Action that calls `auth.api.signOut` and redirects to `/sign-in`) to the root layout header in src/app/layout.tsx (depends on T025) (FR-014, R10)

### Shared UI set and design tokens (Principle III, R14)

- [X] T019 [P] Define design tokens as CSS custom properties in src/styles/tokens.css: color palette with text/background pairs meeting WCAG 2.2 AA contrast (≥ 4.5:1 text, ≥ 3:1 UI), neutral placeholder color, spacing scale, radii, a 3px focus ring token applied via `:focus-visible` globally, and breakpoints; include a `prefers-reduced-motion` rule disabling transitions (Principle III, R14, FR-017)
- [X] T020 [P] Create `Button` (native `<button>` or `<a>` via an `href` prop, primary/secondary variants, visible focus ring) in src/components/ui/Button.tsx and src/components/ui/Button.module.css (Principle III, R14, FR-017)
- [X] T021 [P] Create `VisuallyHidden` (clip-pattern screen-reader-only span) in src/components/ui/VisuallyHidden.tsx (Principle III, FR-017)
- [X] T022 [P] Create `ProgressBar` wrapping a native `<progress>` with a visible label ("X of N processed") and `aria-labelledby` in src/components/ui/ProgressBar.tsx (FR-007, Principle III)
- [X] T023 [P] Create `EmptyState` (heading, explanation text, optional action slot), `ErrorState` (heading, message, optional **Try again** action, optional "Reference: {requestId}" line, never a stack trace), and `LoadingState` (skeleton container with `aria-busy="true"` and a `VisuallyHidden` "Loading…" label, taking fixed-size skeleton children so there is no layout shift) in src/components/ui/EmptyState.tsx, src/components/ui/ErrorState.tsx, src/components/ui/LoadingState.tsx, and src/components/ui/states.module.css (FR-016, Principle III, Principle V)
- [X] T024 [P] Create client component `SafeImage` (`'use client'`): renders `<img>` with required `width`, `height`, `alt`, optional `loading`; on `onError` replaces it with a neutral placeholder `<div role="img" aria-label={fallbackLabel}>` of the same box size (or `aria-hidden` when `alt=""`) in src/components/ui/SafeImage.tsx (FR-016, FR-017, edge case "Photo fails to load")
- [X] T025 Build the root layout in src/app/layout.tsx: `<html lang="en">`, import src/styles/tokens.css, a skip link "Skip to main content" targeting `<main id="main">`, default `<title>` template `%s · Photos`, and mount `ErrorReporter` (T026) (Principle III, FR-017 skip link, Principle V)
- [X] T026 [P] Create client component `ErrorReporter` in src/components/ui/ErrorReporter.tsx: registers `window.onerror` and `unhandledrejection` listeners and exports `reportClientError({ message, stack, route, requestId })`, which `POST`s to `/api/client-errors` with `keepalive: true`, sending the route **pattern** (e.g. `/albums/[date]`), not the concrete URL (Principle V)
- [X] T027 Implement `POST /api/client-errors` in src/app/api/client-errors/route.ts per contracts/api.openapi.yaml: `requireUser()` → 401; validate the JSON body with `additionalProperties: false`, `message` maxLength 500, `route` maxLength 200, `stack` maxLength 4000, `requestId` maxLength 64 → otherwise 400 `BAD_REQUEST`; strip query strings from any URL in `message`/`stack`; limit to 20 reports per session per minute with an in-memory map (extra reports return 204 and are dropped); log event `client.error`; return 204 (Principle V, Principle IV)
- [X] T028 Create the global error boundary and 404 page in src/app/error.tsx (client; calls `reportClientError`, renders `ErrorState` "We couldn't load your photos." with **Try again** calling `reset()` then `router.refresh()`, and shows "Reference: {digest}") and src/app/not-found.tsx (`ErrorState` "That page couldn't be found." with a link back to `/`), per ui-routes.md "Global" (FR-016, Principle V)

### Shared date helpers (FR-004, R7)

- [X] T029 [P] Implement shared date helpers in src/lib/dates.ts, all pure string functions that never use the viewer's time zone: `isIsoDate(s)` (strict `YYYY-MM-DD` plus a real calendar date), `albumLabel('2026-03-14')` → `"Mar 14, 2026"` (en-US `MMM d, yyyy`), `groupLabel('2026-03')` → `"March 2026"` (en-US `MMMM yyyy`), `timeLabel('2026-03-14T23:30:05')` → `"11:30 PM"`, `dateTimeLabel(...)` → `"Mar 14, 2026, 11:30 PM"`, `photoCountLabel(n)` → `"1 photo"`/`"12 photos"`, `usageLabel(n)` → `"412 of 1,000 photos"`, and `nowInZone(ianaZone)` → local `YYYY-MM-DDTHH:mm:ss` for a zone (via `Intl.DateTimeFormat` parts) (FR-004, R7, edge case "Time zones")

### Media serving (FR-013, FR-014, R4, R9) — used by US1 and US3

- [X] T030 Implement `getOwnedPhoto(userId, photoId)` (prepared statement `SELECT id, stored_format FROM photo WHERE id = ? AND user_id = ?`) in src/server/photos/queries.ts (FR-014, R4)
- [X] T031 Implement `GET /media/photos/[photoId]/[variant]` in src/app/media/photos/[photoId]/[variant]/route.ts: `requireUser()` → 401 JSON `UNAUTHENTICATED`; `photoId` must match `^[A-Za-z0-9_-]{22}$` and `variant` must be `thumb` or `full`, and a missing, malformed, or other user's photo returns 404 `NOT_FOUND` (indistinguishable, FR-014); stream the file with `Content-Type` (`thumb` → `image/webp`, `full` → from `stored_format`), `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`; log `media.served` with `variant`, `status`, and `duration_ms` (from the request start until the response headers are returned and streaming begins, which stands in for time-to-first-byte); when the stream ends or errors, also log `media.completed` with `variant`, `status`, and `total_ms` (request start to last byte), the total response time the plan uses for `thumb`
- [X] T032 [P] Implement the preview generator `makeThumb(fullBytes)` in src/server/photos/preview.ts: sharp with `limitInputPixels` set, `.rotate()` (apply EXIF Orientation), `.resize(400, 400, { fit: 'cover', position: 'centre' })`, `.webp({ quality: 75 })`, with no metadata written (R9)

### Test infrastructure and fixtures (R15)

- [X] T033 [P] Create the reference photo fixture generator and manifest in tests/fixtures/photos/generate.ts and tests/fixtures/photos/manifest.json. The generator uses sharp `withExif`/`withXmp` plus hand-built PNG chunks and WebP RIFF chunks to write: `2026-03-14_a.jpg`, `2026-03-14_b.jpg` (DateTimeOriginal 2026:03:14 09:00:00 and 10:00:00), `2026-03-02.jpg`, `2026-03-14_c.png` (eXIf chunk), `ok.webp` (EXIF + XMP chunks), `2026-03-14_2330.jpg` (23:30:00), `no-date.jpg`, `future-date.jpg` (2099), `pre-1900.jpg`, `gps-serial-comment.jpg` (GPS, BodySerialNumber, Artist, UserComment, XMP, IPTC APP13, COM, Orientation 6), `too-big-51mb.jpg` (padded to 51 MB, generated at test time and not committed), `broken.jpg` (valid SOI, truncated), `cmyk-adobe.jpg` (a CMYK JPEG with an Adobe APP14 segment), and `notes.pdf`. Also commit a small public-domain `2026-01-20.heic` with a known DateTimeOriginal, and `2026-01-21-rotated.heic` (a portrait iPhone-style HEIC with an `irot` box and EXIF Orientation 6, public domain or generated with `heif-enc`) whose expected display `width < height` is recorded in the manifest. The manifest lists each file's expected `capture_date`, `date_source`, and the metadata values that must be absent. This is the SC-003 reference set
- [X] T034 [P] Create integration test helpers in tests/integration/helpers.ts: `freshDb()` (run migrations against a temp file), `createUser(email)` (via `auth.api.signUpEmail`), `sessionCookieFor(user)`, and `uploadRequest(file, { cookie, origin, timezone })` that builds a `Request` with `multipart/form-data` for calling route handlers directly (Quality Gate 3, R15)
- [X] T035 [P] Create Playwright fixtures in tests/e2e/fixtures.ts: a `signedInPage` fixture that signs up a unique user through `/sign-up`, an `expectNoA11yViolations(page)` helper using `@axe-core/playwright` that fails on any `serious` or `critical` violation (SC-006), an `expectNoHorizontalScroll(page)` helper, and an `uploadFixtures(page, names[])` helper that sets files on the Add photos input

### Seed data (used by US1–US3 and perf)

- [X] T042 Implement the seed script in scripts/seed.ts with CLI flags `--user <email>`, `--photos <n>` (≤ 1000), `--albums <n>`, and `--start <YYYY-MM-DD>`: create the user if missing via `auth.api.signUpEmail` (password taken from `SEED_PASSWORD`, default `password1234` for local use only), generate distinct solid-color JPEGs with sharp spread across the requested number of days, write `full` and `thumb` (via `makeThumb`) through src/server/media-store.ts, and insert rows with unique `original_sha256`, `date_source = 'exif'`, and plausible `capture_time`s; export the core as `seedPhotos(opts)` for tests, where `opts` is either `{ count, albums, start }` (as the CLI uses) or an explicit `photos: { captureTime: 'YYYY-MM-DDTHH:mm:ss', dateSource?: 'exif' | 'upload' }[]` list. For `dateSource: 'upload'`, set `added_at` to the same local moment as `captureTime`, so the photo lands in its "added" day's album, matching FR-005 (quickstart V14 and perf; used by T041, T055, T068, T069, T082, T085)

### Foundational tests

- [X] T036 [P] Unit-test src/lib/dates.ts in tests/unit/dates.test.ts: labels for `2026-03-14`, `2026-03`, 23:30 → "11:30 PM", singular/plural counts, "1,000" formatting, `isIsoDate` rejecting `2026-02-30` and `2026-3-4`, and `nowInZone('Asia/Tokyo')` vs `nowInZone('America/Chicago')` giving different local dates around midnight UTC (fake timers) (FR-004, edge case "Time zones")
- [X] T037 [P] Integration-test media authorization in tests/integration/media-auth.test.ts: no session → 401; user B requesting user A's `thumb` and `full` → 404 with the same body as a nonexistent ID; malformed ID and variant `original` → 404; owner → 200 with the exact `Cache-Control`, `nosniff`, and `Content-Type` headers (FR-014, V13)
- [X] T038 [P] Integration-test `POST /api/client-errors` in tests/integration/client-errors.test.ts: 401 without a session, 400 on extra properties or an over-long `message`, 204 on a valid body, the 21st report in one minute returns 204 and is not logged, and the logged line has no query string (Principle V)
- [X] T039 [P] Unit-test the logger in tests/unit/log.test.ts: every line is valid JSON with `level`, `ts`, `requestId`, `event`; non-allow-listed fields (`fileName`, `email`, `exif`, `captureDate`) are dropped (R16, FR-015)

**Checkpoint**: A user can sign up, sign in, and sign out; the database and media route work; shared UI, logger, and fixtures are ready. User story work can begin.

---

## Phase 3: User Story 1 - Browse albums as date-grouped tiles (Priority: P1) 🎯 MVP

**Goal**: The library page `/` shows the user's albums as tiles grouped under month-and-year
headings, newest first, each with an adaptive preview mosaic of its ≤ 4 earliest photos, its
date label, and its photo count, with loading, empty, and error states.

**Independent Test**: Seed a user with photos spanning several months (`npm run seed`), sign
in, open `/`, and confirm the tiles appear under the right month headings, newest first,
each with a preview, date, and count (V1, V4, V11 on `/`, V12 on `/`). No upload code is
needed.

### Tests for User Story 1 ⚠️ write first, confirm they fail

- [X] T040 [P] [US1] Unit-test library queries in tests/unit/queries.test.ts against a temp DB seeded with rows: `getLibraryGroups(userId)` returns groups ordered by `year_month` descending and albums by `date` descending (FR-001); `photo_count` per album; `preview_photos` are the first ≤ 4 by `(capture_time, added_at, id)` ascending, including the tie-break on `added_at` and then `id` (FR-003); another user's rows never appear (FR-014); `getUsage(userId)` returns `{ photoCount, photoLimit: 1000 }`
- [X] T041 [P] [US1] Write the E2E library spec in tests/e2e/us1-library.spec.ts, seeding data through `scripts/seed.ts` helpers: AS1 ("March 2026" `<h2>` above "January 2026", each tile under its month); AS2 (a 5-photo album's tile has 4 preview images, the label "Mar 14, 2026", and "5 photos"); AS3 (1-, 2-, and 3-photo tiles have no empty cells and no broken images, V4); AS4 (keyboard-only: the first Tab stop is the skip link, and the tiles are reached in visual order after the header controls; visible focus ring on each tile; tile accessible name "Mar 14, 2026, 3 photos", V11; don't assert on **Add photos**, which US2 adds in T066); V1 empty state "No photos yet" and "0 of 1,000 photos"; V12 at 320 px width shows 2 columns with no horizontal scroll; "Preview failed" (route-abort one thumb → placeholder, and the tile link still navigates); Error state (mock a DB failure via a test-only env flag → ErrorState with **Try again**, V15); Loading state (skeleton with `aria-busy`); limit-reached highlighting at 1,000 photos; and `expectNoA11yViolations` on the populated, empty, and error states (SC-006)

### Implementation for User Story 1

- [X] T043 [US1] Implement `getLibraryGroups(userId)` and `getUsage(userId)` in src/server/photos/queries.ts using prepared statements scoped by `user_id`: one grouped query (`GROUP BY capture_date` with `COUNT(*)`) plus one windowed query (`ROW_NUMBER() OVER (PARTITION BY capture_date ORDER BY capture_time, added_at, id)` ≤ 4) for previews, both served by `photo_album_idx`; assemble into `DateGroup[]` of `{ yearMonth, label, albums: { date, label, photoCount, previews: { id, width, height }[] }[] }` using src/lib/dates.ts (data-model.md "Album", "Date Group", "Library usage")
- [X] T044 [P] [US1] Create `TileMosaic` in src/components/library/TileMosaic.tsx and src/components/library/TileMosaic.module.css: takes 1–4 previews and lays them out as 1 → full tile, 2 → split, 3 → one large plus two small, 4 → 2×2 grid, with no empty cells (US1-AS3); each image is a `SafeImage` with `src=/media/photos/{id}/thumb`, `alt=""` (decorative), `width={400} height={400}`, and `loading="eager"` only when an `eager` prop is set (first row, SC-002), otherwise `lazy`
- [X] T045 [P] [US1] Create `AlbumTile` in src/components/library/AlbumTile.tsx and src/components/library/AlbumTile.module.css: a single `<a href="/albums/{date}">` containing `TileMosaic`, the album label, and `photoCountLabel(count)`, so the link's accessible name reads "Mar 14, 2026, 12 photos" (use a `VisuallyHidden` comma if needed); a visible `:focus-visible` ring from tokens (US1-AS2, US1-AS4, FR-002, FR-017)
- [X] T046 [US1] Create `DateGroup` in src/components/library/DateGroup.tsx and src/components/library/DateGroup.module.css: `<section aria-labelledby>` with an `<h2>` group label and a `<ul>` of `AlbumTile`s; the grid uses `repeat(auto-fill, minmax(9.5rem, 1fr))` so it shows 2 columns at 320 px (ui-routes.md "Layout"); pass `eager` to the first tiles of the first group (depends on T045)
- [X] T047 [US1] Build the library page in src/app/page.tsx as a Server Component: `requireUser()`; `<title>Your photos</title>`; `<main id="main">` with `<h1>Your photos</h1>` and the usage line `usageLabel(count)`, highlighted with a class when `count >= 1000`; when there are 0 photos, render `EmptyState` "No photos yet" with an explanation (the **Add photos** action is added by US2 in T065); otherwise render one `DateGroup` per group; log `library.render` with `album_count` and `duration_ms` (FR-001, FR-002, FR-011 usage display, FR-016)
- [X] T048 [P] [US1] Create the library loading skeleton in src/app/loading.tsx: `LoadingState` with a heading placeholder and 12 fixed-size tile skeletons in the same grid, so there is no layout shift (FR-016, CLS ≤ 0.1)
- [X] T049 [US1] Add a test-only failure hook in src/server/photos/queries.ts: a `maybeFailForTest()` helper that throws when `process.env.E2E_TEST_HOOKS === '1'` and `process.env.E2E_FAIL_DB === '1'`, both read at request time. Don't gate it on `NODE_ENV`: Playwright runs `next start`, which is production mode (T005). `getLibraryGroups` calls it. `E2E_TEST_HOOKS` must never appear in deployment config or `.env.example`. This lets T041's error-state case reach src/app/error.tsx (FR-016, V15)
- [X] T050 [US1] Run `npm test -- tests/unit/queries.test.ts` and `npx playwright test tests/e2e/us1-library.spec.ts` and confirm all US1 tests pass (SC-006 on `/`)

**Checkpoint**: The library view is complete and testable on its own with seeded data (MVP part 1).

---

## Phase 4: User Story 2 - Add photos and have them placed into albums by date (Priority: P1)

**Goal**: Users pick multiple files; each is uploaded to `POST /api/photos`, validated,
dated from its local EXIF capture time (or the upload fallback), stripped of personal
metadata losslessly (HEIC → JPEG q95), deduplicated, limited to 1,000 per user, and filed
into the album for its date. The library shows progress and a completion summary.

**Independent Test**: Starting from an empty library, add photos from three different days
and confirm three albums appear with each photo in the album for its date (V2, V3, V5–V9,
V14). Visible "Date not recorded" badges are confirmed in US3; within US2, the fallback is
verified through the API response `dateSource: "upload"` and placement in today's album.

### Tests for User Story 2 ⚠️ write first, confirm they fail

- [X] T051 [P] [US2] Unit-test format detection in tests/unit/detect-format.test.ts: JPEG (`FF D8 FF`), PNG (`89 50 4E 47 0D 0A 1A 0A`), WebP (`RIFF....WEBP`), HEIC/HEIF (`ftyp` box with brand `heic`, `heix`, `hevc`, `heim`, `heis`, `mif1`, `msf1`) are recognized; PDF, GIF, empty buffer, a `.jpg`-named PDF, and an AVIF `ftyp` are rejected (R5, FR-008)
- [X] T052 [P] [US2] Unit-test capture-date resolution in tests/unit/capture-date.test.ts using the fixture manifest: `DateTimeOriginal` wins, `CreateDate` is the fallback, offset tags are ignored so `2026-03-14_2330.jpg` stays on `2026-03-14` in any zone (V6); no date, unparseable, before `1900-01-01T00:00:00`, and after now-in-uploader's-zone → `date_source = 'upload'` with `capture_time = nowInZone(tz)` (V5); an invalid `timezone` falls back to `UTC`; and `capture_date` always equals the date part of `capture_time` (FR-005, data-model.md "Capture date resolution")
- [X] T053 [P] [US2] Unit-test metadata stripping in tests/unit/strip-metadata.test.ts: for each JPEG/PNG/WebP fixture, run the output through `exifr.parse(…, { gps: true, xmp: true, iptc: true, icc: false })` and assert no GPS, BodySerialNumber, LensSerialNumber, Artist, Copyright, UserComment, ImageDescription, MakerNote, XMP, IPTC, or embedded thumbnail remains; JPEG keeps only an Orientation tag when the original Orientation ≠ 1 and none when it is 1; JPEG has no COM, APP3–APP13, or APP15 segments; `cmyk-adobe.jpg` keeps its APP14 segment; PNG has no `eXIf`/`tEXt`/`zTXt`/`iTXt`/`tIME` chunks; WebP has no `EXIF`/`XMP ` chunks, has the matching VP8X flags cleared, and its RIFF size equals the file length − 8; decoded pixels (sharp `.raw()`) are byte-identical to the input's and dimensions are unchanged (FR-015, R6)
- [X] T054 [P] [US2] Unit-test HEIC conversion in tests/unit/convert-heic.test.ts: `2026-01-20.heic` → a JPEG with the same pixel dimensions (after orientation), and exifr finds no metadata in the output; and the decoded JPEG pixels compared with the `heic-decode` RGBA output have a PSNR ≥ 40 dB, computed in the test from the raw buffers ("visually indistinguishable", FR-015); and for `2026-01-21-rotated.heic`, the output JPEG has no Orientation tag, is portrait (`width < height`), and matches the manifest dimensions, and ingesting it via `ingestPhoto` stores `width`/`height` equal to the `full` file's actual pixel dimensions (FR-008, FR-015, R6)
- [X] T055 [P] [US2] Integration-test `POST /api/photos` in tests/integration/upload.test.ts per contracts/api.openapi.yaml: 201 `UploadResult` for JPEG, PNG, WebP, and HEIC with correct `captureDate`, `dateSource`, `album.label`, `album.created` (true for a new day, false when joining, US2-AS1/AS2), and `usage`; 401 without a session; 403 `FORBIDDEN_ORIGIN` with a missing or foreign `Origin`; 413 `FILE_TOO_LARGE` for 51 MB, rejected while streaming, before the whole body is read (FR-009); 415 `UNSUPPORTED_TYPE` for `notes.pdf` with `fileName` and the exact message (FR-008); 422 `UNREADABLE_IMAGE` for `broken.jpg`; 409 `DUPLICATE` on re-upload (FR-010); a 998-photo seeded user sending 5 concurrent uploads → exactly 2 × 201 and 3 × 409 `LIBRARY_LIMIT_REACHED` and a final count of 1000 (FR-011, V14); two concurrent identical uploads → exactly one 201; after every rejection, no row and no file (including `.tmp`) remain in `MEDIA_ROOT`; the stored `full` file and the DB row contain none of the manifest's forbidden metadata values (FR-015, V9); `original_filename` has control characters stripped and is truncated to 255 chars; every response has `x-request-id`
- [X] T056 [P] [US2] Write the E2E upload spec in tests/e2e/us2-upload.spec.ts: V2 (four fixtures → headings and tiles "Mar 14, 2026 · 2 photos", "Mar 2, 2026 · 1 photo", "Jan 20, 2026 · 1 photo"); V3 (`2026-03-14_c.png` joins, count becomes 3, no new tile); V5 (`no-date.jpg` and `future-date.jpg` land in today's album in the browser's zone); V6 (`timezoneId: 'Asia/Tokyo'` context, the 23:30 photo lands in "Mar 14, 2026"); V7 (`notes.pdf`, `too-big-51mb.jpg`, `ok.webp` → `<progress>` visible, then "Added 1 · Skipped as duplicate 0 · Rejected 2" with each file named and its reason); V8 (duplicate → "Skipped as duplicate: 2026-03-14_a.jpg", count unchanged); V14 (998 seeded + 5 → 2 added, 3 rejected with the limit message, usage "1,000 of 1,000 photos"); the empty-state **Add photos** button opens the picker; keyboard-only upload via Enter on **Add photos**; the full library Tab order is skip link → **Sign out** → **Add photos** → the first tile (ui-routes.md "Keyboard"); the live region announces progress and the summary; `expectNoA11yViolations` during and after upload (US2-AS1–AS5, FR-007)

### Implementation for User Story 2

- [X] T057 [P] [US2] Implement `detectFormat(head: Uint8Array): 'jpeg' | 'png' | 'webp' | 'heic' | null` from the first 32 bytes' magic numbers in src/server/photos/detect-format.ts, never looking at the file name or client MIME type (R5, FR-008)
- [X] T058 [P] [US2] Implement `resolveCaptureDate(originalBytes, timezone, now = new Date())` in src/server/photos/capture-date.ts: validate `timezone` against `Intl.supportedValuesOf('timeZone')` (else `'UTC'`); `exifr.parse(bytes, { pick: ['DateTimeOriginal', 'CreateDate'], reviveValues: false })` so raw `YYYY:MM:DD HH:mm:ss` strings are read as local wall-clock time with offsets ignored; accept only if parseable, `>= 1900-01-01T00:00:00`, and `<= nowInZone(timezone)`; otherwise `capture_time = nowInZone(timezone)` and `date_source = 'upload'`; return `{ captureDate, captureTime, dateSource }` (FR-005, FR-006, R7)
- [X] T059 [US2] Implement lossless JPEG stripping `stripJpeg(bytes, orientation)` in src/server/photos/strip-metadata.ts: walk markers and keep only SOI, APP0 (JFIF), APP2 (ICC), APP14 (Adobe color-transform flag, no personal data), DQT, DHT, SOF0–SOF15 (excluding DHT `C4`, JPG `C8`, DAC `CC`), DRI, SOS plus entropy-coded scan data up to and including EOI; drop APP1, APP3–APP13, APP15, and COM; when `orientation !== 1`, insert right after APP0 (or SOI) a newly built minimal APP1 `Exif\0\0` TIFF block with IFD0 holding only tag 0x0112 Orientation; throw `UnreadableImage` on malformed segments (R6, FR-015)
- [X] T060 [US2] Add lossless PNG stripping `stripPng(bytes)` to src/server/photos/strip-metadata.ts: keep only chunks `IHDR`, `PLTE`, `IDAT`, `IEND`, `tRNS`, `gAMA`, `cHRM`, `sRGB`, `iCCP`, `sBIT`, `pHYs`, `bKGD` and copy them byte-for-byte with original CRCs; drop everything else, including `eXIf`, `tEXt`, `zTXt`, `iTXt`, `tIME` (depends on T059, same file)
- [X] T061 [US2] Add lossless WebP stripping `stripWebp(bytes)` and the `stripMetadata(bytes, format, orientation)` dispatcher to src/server/photos/strip-metadata.ts: keep only RIFF chunks `VP8 `, `VP8L`, `VP8X`, `ALPH`, `ICCP`, `ANIM`, `ANMF` (with even-length padding); drop `EXIF` and `XMP `; clear the EXIF (bit 3) and XMP (bit 2) flags in VP8X; rewrite the RIFF size as the file length − 8 (depends on T060, same file)
- [X] T062 [P] [US2] Implement `convertHeic(bytes)` in src/server/photos/convert-heic.ts: decode with `heic-decode` (primary image) to RGBA, then `sharp(raw, { raw: { width, height, channels: 4 } }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' })` with no metadata; return `{ bytes, width, height }`, where `width`/`height` are the dimensions of the decoded output. heic-decode (libheif) applies the container's `irot`/`imir` transforms during decoding, so the output is already upright and the JPEG carries no Orientation tag (FR-008, R6, and the HEIC budget exception in plan.md)
- [X] T063 [US2] Implement the ingest pipeline `ingestPhoto({ userId, bytes, originalFilename, timezone })` in src/server/photos/ingest.ts, in the order given by data-model.md "Validation rules" and "Lifecycle": `detectFormat` → `UNSUPPORTED_TYPE`; `sharp(bytes, { limitInputPixels: 268_402_689 }).metadata()` (for HEIC, after conversion) → `UNREADABLE_IMAGE` on failure; SHA-256 of the **original** bytes (R8); `resolveCaptureDate` on the **original** bytes; for JPEG/PNG/WebP, read Orientation with exifr, call `stripMetadata(bytes, format, orientation)`, and compute display `width`/`height` from sharp metadata, swapping them for orientation 5–8; for HEIC, call `convertHeic` and use its `width`/`height` as they are, ignoring any EXIF Orientation (the pixels are already upright); `makeThumb`; write both files to temp paths; then one `db.transaction` that checks for an existing `(user_id, original_sha256)` → `DUPLICATE`, checks `COUNT(*) < 1000` → `LIBRARY_LIMIT_REACHED`, and does the `INSERT` (also catching `SQLITE_CONSTRAINT_UNIQUE` → `DUPLICATE`), running as `BEGIN IMMEDIATE` so concurrent uploads serialize; after commit, `rename` temp files into place; on any failure, discard temp files; sanitize `original_filename` (strip control chars, trim, truncate to 255, default `"photo"`); return `{ photo, album: { date, label, photoCount, created }, usage }` (FR-004, FR-005, FR-009–FR-011, FR-015)
- [X] T064 [US2] Implement `POST /api/photos` in src/app/api/photos/route.ts per contracts/api.openapi.yaml: `requireUser()` → 401 `UNAUTHENTICATED`; `Origin` must equal the `BETTER_AUTH_URL` origin → 403 `FORBIDDEN_ORIGIN`; reject `Content-Length` > 50 MB + 64 KB multipart overhead up front, and otherwise count bytes through a `TransformStream` that errors past the limit → 413 `FILE_TOO_LARGE` (FR-009); parse `multipart/form-data` from the limited stream; require exactly one `file` part (else 400 `BAD_REQUEST`), and re-check `file.size ≤ 50 * 1024 * 1024`; call `ingestPhoto`; map errors to 409/413/415/422 with the user-facing messages from the contract examples, each naming the file (FR-008); unexpected errors → 500 `INTERNAL` with `requestId` and nothing stored; log `photo.upload.accepted` (`format`, `bytes`, `date_source`, `duration_ms`), `photo.upload.rejected` (`reason`), or `photo.upload.duplicate`, never the file name; return 201 `UploadResult`
- [X] T065 [US2] Create client component `UploadPanel` in src/components/library/UploadPanel.tsx and src/components/library/UploadPanel.module.css: an **Add photos** `Button` that opens a hidden `<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif">`; uploads each file as `FormData { file, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }` with at most 3 requests in flight; shows `ProgressBar` "X of N processed" and an `aria-live="polite"` status; at the end shows "Added A · Skipped as duplicate D · Rejected R" and a list of each skipped or rejected file with the server's `message` (or "{name} couldn't be uploaded. Check your connection and try again." on a network error); calls `router.refresh()` when done so new albums appear; reports unexpected errors via `reportClientError` (FR-007, R11)
- [X] T066 [US2] Wire `UploadPanel` into the library page header (next to the usage line) and into the empty state's action slot, so the "No photos yet" `EmptyState` has a primary **Add photos** button, in src/app/page.tsx (depends on T047, T065; edge case "Empty library")
- [X] T067 [US2] Run `npm test -- tests/unit/detect-format.test.ts tests/unit/capture-date.test.ts tests/unit/strip-metadata.test.ts tests/unit/convert-heic.test.ts tests/integration/upload.test.ts` and `npx playwright test tests/e2e/us2-upload.spec.ts` and confirm all US2 tests pass, including the SC-003 reference-set placement assertions

**Checkpoint**: US1 + US2 together form the MVP: users can upload photos and browse them as date-grouped tiles.

---

## Phase 5: User Story 3 - Open an album and view its photos (Priority: P2)

**Goal**: Selecting a tile opens `/albums/[date]` with capture-ordered thumbnails; selecting a
thumbnail opens `/albums/[date]/photos/[photoId]`, a full-resolution viewer with
Previous/Next/Close links, ←/→/Esc keys, and swipe; closing returns focus to the opened
thumbnail.

**Independent Test**: Seed an album with 10 photos, open it, confirm 10 thumbnails in
capture-time order, open one, step forward and back, and close back to the album with focus
on that photo (V10, V11 album/photo, V12 album, V13 album route).

### Tests for User Story 3 ⚠️ write first, confirm they fail

- [X] T068 [P] [US3] Add album and neighbor query tests to tests/unit/album-queries.test.ts: `getAlbumPhotos(userId, date)` returns photos ordered by `(capture_time, added_at, id)` ascending (FR-012) with `n`/`total`, and an empty result for another user's date; `getPhotoInAlbum(userId, date, photoId)` returns the photo with its `prevId`/`nextId` (null at the ends), and `null` when the photo belongs to another user or to a different date
- [X] T069 [P] [US3] Write the E2E album and viewer spec in tests/e2e/us3-album.spec.ts. Seed with explicit photos via `seedPhotos` (T042): 10 on `2026-03-14` at 09:00, 10:00, … 18:00 (`exif`) and one at `2026-03-20T12:00:00` (`upload`); the "Date not recorded" checks use the `2026-03-20` album. AS1 (selecting a tile opens the album, `<h1>` "Mar 14, 2026" with the count, thumbnails oldest first); AS2 (selecting the 2nd photo shows the `full` image scaled to fit with `naturalWidth` equal to the stored width, and the caption "Mar 14, 2026, 10:00 AM"; → goes to the 3rd, ← back to the 2nd; Previous is absent on the 1st and Next on the last; pointer clicks on the links; a touch swipe via `page.touchscreen`/dispatched touch events moves photos); AS3 (Esc and **Close** return to `/albums/2026-03-14#photo-{id}` with `document.activeElement` being that thumbnail's link, V10); the "Date not recorded" badge and alt text "date not recorded, added {date}" on a fallback-dated photo in the album and viewer (FR-006, V5); V13 (user B gets 404 for user A's `/albums/2026-03-14` and `/albums/2026-03-14/photos/{id}`); an invalid date `/albums/2026-13-01` and a photo ID from a different album → 404; V12 at 320 px on the album shows no horizontal scroll; the viewer placeholder "This photo couldn't be displayed." when `full` fails while navigation still works; the album loading skeleton; the album and viewer error states (V15), run against the failing server on port 3001 (T005, T049); keyboard-only completion of the whole flow and `expectNoA11yViolations` on the album, viewer, and 404 (SC-006, FR-017)

### Implementation for User Story 3

- [X] T070 [US3] Implement `getAlbumPhotos(userId, date)` and `getPhotoInAlbum(userId, date, photoId)` in src/server/photos/queries.ts as prepared statements scoped by `user_id` and `capture_date` using `photo_album_idx`, returning `{ id, width, height, captureTime, dateSource, addedAt, n, total }`, with `prevId`/`nextId` computed by `LAG`/`LEAD` over `(capture_time, added_at, id)`; both functions call `maybeFailForTest()` (T049) so T069's error-state cases work (FR-012, FR-013, FR-014)
- [X] T071 [P] [US3] Create `PhotoGrid` in src/components/album/PhotoGrid.tsx and src/components/album/PhotoGrid.module.css: a `<ul>` using the same `auto-fill` grid; each `<li>` has `<a id="photo-{id}" href="/albums/{date}/photos/{id}">` wrapping a `SafeImage` `src=/media/photos/{id}/thumb`, `width={400} height={400}`, `loading="lazy"`, and alt `"Photo {n} of {total}, taken {h:mm a}"`, or for `dateSource = 'upload'` alt `"Photo {n} of {total}, date not recorded, added {Mar 20, 2026}"` plus a visible "Date not recorded" badge (FR-006, FR-017); rows use `content-visibility: auto` with `contain-intrinsic-size` for the 1,000-photo case (R12)
- [X] T072 [P] [US3] Create client component `FocusFromHash` in src/components/album/FocusFromHash.tsx: on mount and on `hashchange`, if `location.hash` matches `#photo-[A-Za-z0-9_-]{22}`, call `scrollIntoView({ block: 'center' })` and `focus()` on that link (US3-AS3, R13)
- [X] T073 [US3] Build the album page in src/app/albums/[date]/page.tsx: `requireUser()`; `notFound()` unless `isIsoDate(params.date)` and the album has photos for this user; `generateMetadata` title is the album label; render a "← All photos" link to `/`, `<main id="main">` with `<h1>` album label plus `photoCountLabel`, `PhotoGrid`, and `FocusFromHash`; log `album.render` with `duration_ms` (FR-012, FR-016; no Empty state, per ui-routes.md) (depends on T070, T071, T072)
- [X] T074 [P] [US3] Create the album loading skeleton in src/app/albums/[date]/loading.tsx: `LoadingState` with a heading placeholder and a fixed-size thumbnail skeleton grid (FR-016)
- [X] T075 [P] [US3] Create `PhotoViewer` in src/components/album/PhotoViewer.tsx and src/components/album/PhotoViewer.module.css: a `SafeImage` `src=/media/photos/{id}/full` with stored `width`/`height`, alt `"Photo {n} of {total}, taken {dateTimeLabel(captureTime)}"` (or the "date not recorded, added {date}" variant, FR-017), `object-fit: contain`, `max-width: 100vw`, and a max height of the available viewport height, inside a fixed-aspect box so there's no layout shift, with `fallbackLabel="This photo couldn't be displayed."`; the caption `dateTimeLabel(captureTime)`, or "Date not recorded, added {date}" with the badge (FR-006, FR-013); real `<a>` links **Previous** and **Next** (omitted at the ends, not disabled) and **Close** → `/albums/{date}#photo-{id}`
- [X] T076 [P] [US3] Create client component `ViewerKeys` in src/components/album/ViewerKeys.tsx: `keydown` on `window` maps `ArrowLeft` → prev href, `ArrowRight` → next href, `Escape` → close href via `router.push` (ignored when modifier keys are held or focus is in a form field); touch swipe via `touchstart`/`touchend` with a horizontal travel of at least 50 px that exceeds the vertical travel → prev/next (FR-013, R13)
- [X] T077 [US3] Build the single-photo page in src/app/albums/[date]/photos/[photoId]/page.tsx: `requireUser()`; `notFound()` unless `isIsoDate(date)` and `getPhotoInAlbum` returns a photo (covers missing, other user's, and wrong-album photos, FR-014); a visually hidden `<h1>` "Photo {n} of {total}, Mar 14, 2026"; `<title>` the same text; render `PhotoViewer` and `ViewerKeys`; log `photo.render` with `duration_ms` (depends on T070, T075, T076)
- [X] T078 [P] [US3] Create the viewer loading state in src/app/albums/[date]/photos/[photoId]/loading.tsx: `LoadingState` with the text "Loading photo…" over a fixed-aspect placeholder box (FR-016)
- [X] T079 [US3] Run `npm test -- tests/unit/album-queries.test.ts` and `npx playwright test tests/e2e/us3-album.spec.ts` and confirm all US3 tests pass

**Checkpoint**: All three user stories work and are independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Performance budgets, privacy verification, CI gates, and documentation

- [X] T080 [P] Add a cross-route accessibility sweep in tests/e2e/a11y.spec.ts that runs `expectNoA11yViolations` on `/sign-in`, `/sign-up`, `/` (empty, populated, error), an album, a photo, and the 404 page, in both Chromium and WebKit (SC-006, Principle III)
- [X] T081 [P] Implement the log privacy check in scripts/check-log-privacy.ts: read `test-results/server.log` (from T005), fail if any line isn't JSON with `level`/`ts`/`requestId`, or if any line contains a fixture file name, a manifest EXIF value (GPS coordinates, serial number, artist, comment), a `YYYY-MM-DD` capture date from the manifest, an `@` email address, or a session token (FR-015, R16, quickstart "Observability check")
- [X] T082 [P] Configure Lighthouse CI in lighthouserc.json: mobile preset (Moto G Power, simulated 4G), a `puppeteerScript` that clears cookies and signs in the seed user for the URL being audited: `perf@example.test` for `/` (100 albums) and `perf-large@example.test` for `/albums/2026-03-14` (1,000 photos), both seeded with T042 as in quickstart.md, and assertions `largest-contentful-paint ≤ 2500`, `cumulative-layout-shift ≤ 0.1` (SC-002, constitution budgets; INP is covered by T085, since Lighthouse navigation runs don't measure INP); plus a helper in `scripts/lighthouse-auth.cjs` for the sign-in script
- [X] T083 [P] Implement the bundle budget check in scripts/check-bundle.ts: after `next build`, sum the gzip size of each route's initial JS chunks from `.next/app-build-manifest.json` and fail if any route exceeds 200 KB compressed (constitution budget)
- [X] T084 [P] Write the upload performance test in tests/perf/upload.spec.ts: throttle to 50 Mbps via CDP `Network.emulateNetworkConditions`, upload 100 mixed JPEG/HEIC fixtures (copies with unique bytes) in one action, and assert every photo appears in its album within 120 s (SC-004); then, not counted toward the 120 s, upload a second batch of 20 files (10 PNG/WebP ≤ 10 MB, and 10 JPEG/PNG/WebP between 10 and 50 MB); from `test-results/server.log`, record the p95 `duration_ms` of `photo.upload.accepted` for JPEG/PNG/WebP ≤ 10 MB (assert ≤ 500 ms), and separately for JPEG/PNG/WebP > 10 MB and for HEIC (plan.md budget exception, feeds T089)
- [X] T085 [P] Add an INP check for large albums in tests/perf/large-album.spec.ts: seed 1,000 photos on one day, open the album, scroll to the bottom with `page.mouse.wheel`, and measure interaction latency with a `PerformanceObserver` for `event` entries, asserting ≤ 200 ms (edge case "Large album", R12)
- [X] T091 [P] Write the read-latency test in tests/perf/read-latency.spec.ts: using the `perf@example.test` seed user (T042), request `/`, one album page, 200 `thumb` URLs, and 50 `full` URLs; compute p95 in `test-results/server.log` from `duration_ms` on the `library.render` and `album.render` events, from `media.served.duration_ms` for `full` (time until headers are sent), and from `media.completed.total_ms` for `thumb` (total response time) and assert ≤ 300 ms (constitution "API response time", plan.md Constraints)
- [X] T086 Create the CI workflow in .github/workflows/ci.yml running, on pull requests, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npx playwright install --with-deps chromium webkit`, `npm run test:e2e`, `npm run test:log-privacy`, `npm audit --audit-level=high`, a secret scan with `gitleaks/gitleaks-action`, `npm run build`, `npm run perf:bundle`, `npm run perf:upload` (runs `tests/perf`: T084, T085, T091), and `npm run perf:lighthouse` (constitution "Development Workflow & Quality Gates" 1–6)
- [X] T087 [P] Write README.md at the repo root: what the app does, prerequisites, setup and env vars (mirroring quickstart.md), the quality-gate commands, and the privacy guarantees (metadata stripping, per-user 404s, no personal data in logs) (Quality Gate 7, Principle IV)
- [X] T088 Review every `src/server/**` query for a `user_id = ?` filter and every SQL string for parameter placeholders (no string interpolation), confirm no `dangerouslySetInnerHTML` and no secrets exist anywhere in `src/`, and fix any gaps (Principle IV, FR-014)
- [ ] T089 **Merge blocker.** Record the project owner's decision on the `POST /api/photos` HEIC/large-file write-p95 budget exception (approver and date) in the Complexity Tracking table in specs/001-photo-album-organizer/plan.md, using the measurements from T084 (constitution "Performance Budgets")
- [ ] T090 Run the full quickstart.md validation: setup, all five quality gates, scenarios V1–V15 by hand, the performance checks, and the observability check; record any failure as a new task in this file before merging (Quality Gates 1–7, V1–V15)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. Start immediately.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks all user stories.**
- **US1 (Phase 3)** and **US2 (Phase 4)**: Both depend only on Foundational and can run in
  parallel. They touch two shared files, so coordinate there:
  - `src/server/photos/queries.ts`: T043/T049 (US1) and T070 (US3) add functions; do them
    one at a time. T070 calls `maybeFailForTest()` from T049, so T049 must land before T070.
  - `src/app/page.tsx`: T066 (US2) edits the page from T047 (US1). If US2 is built first,
    T066 waits for T047.
- **US3 (Phase 5)**: Depends on Foundational, plus T049's `maybeFailForTest()` helper (T070). It uses seeded data, so it doesn't need
  US2. It links from US1's tiles, but its own tests navigate to album URLs directly.
- **Polish (Phase 6)**: Depends on all stories. T089 depends on T084. T086 depends on T084, T085, and T091.

### User Story Dependencies

- **US1 (P1)**: Independent. Uses `scripts/seed.ts` (T042, Foundational) for data.
- **US2 (P1)**: Independent for upload and placement. Its **Add photos** entry point (T066)
  plugs into the US1 page. The visible "Date not recorded" badge for US2-AS3 is rendered by
  US3 (T071, T075); within US2, the fallback is checked through the API and album placement.
- **US3 (P2)**: Independent. Uses seeded data. Needs T049's test hook before T070.

### Within Each User Story

- Tests are written first and must FAIL before implementation.
- Queries → components → pages → wiring → story test run.
- strip-metadata tasks T059 → T060 → T061 are sequential (same file).
- T063 (ingest) needs T057, T058, T061, T062, and Foundational T010, T011, T032.
- T064 (route) needs T063. T065 (UploadPanel) can be built in parallel with T057–T064
  against the contract.

### Key Foundational Chains

- T008 → T009 → T013 → T014/T016/T017 (the database before auth)
- T012 → T015, T027, T031 (the logger before anything that logs)
- T019 → T020–T024 → T025 → T018, T028
- T010 + T030 → T031
- T008 + T009 + T010 + T013 + T032 → T042 (seed needs the database, media store, auth, and previews)

---

## Parallel Examples

### Phase 2 (after T008, T009, T012, T013)

```bash
Task: "Sign-in page in src/app/sign-in/page.tsx"                 # T016
Task: "Sign-up page in src/app/sign-up/page.tsx"                 # T017
Task: "Button / VisuallyHidden / ProgressBar / states / SafeImage in src/components/ui/"  # T020–T024
Task: "Date helpers in src/lib/dates.ts"                          # T029
Task: "Preview generator in src/server/photos/preview.ts"         # T032
Task: "Fixture generator in tests/fixtures/photos/generate.ts"    # T033
```

### User Story 1

```bash
# Tests first:
Task: "Library query tests in tests/unit/queries.test.ts"          # T040
Task: "E2E library spec in tests/e2e/us1-library.spec.ts"          # T041
# Then components in parallel (after T043):
Task: "TileMosaic in src/components/library/TileMosaic.tsx"        # T044
Task: "AlbumTile in src/components/library/AlbumTile.tsx"          # T045
Task: "Library loading skeleton in src/app/loading.tsx"            # T048
```

### User Story 2

```bash
# Tests first:
Task: "detect-format tests"  Task: "capture-date tests"  Task: "strip-metadata tests"
Task: "convert-heic tests"   Task: "upload integration tests"  Task: "E2E upload spec"   # T051–T056
# Then independent modules:
Task: "detectFormat in src/server/photos/detect-format.ts"         # T057
Task: "resolveCaptureDate in src/server/photos/capture-date.ts"    # T058
Task: "convertHeic in src/server/photos/convert-heic.ts"           # T062
Task: "stripJpeg → stripPng → stripWebp (one developer, same file)" # T059–T061
Task: "UploadPanel in src/components/library/UploadPanel.tsx"      # T065
```

### User Story 3

```bash
Task: "Album query tests" Task: "E2E album spec"                   # T068, T069
Task: "PhotoGrid"  Task: "FocusFromHash"  Task: "PhotoViewer"  Task: "ViewerKeys"   # T071, T072, T075, T076
Task: "Album loading"  Task: "Viewer loading"                      # T074, T078
```

---

## Implementation Strategy

### MVP First (US1 + US2, both P1)

1. Phase 1: Setup
2. Phase 2: Foundational (critical; it blocks every story)
3. Phase 3: US1. **Stop and validate** with seeded data (T050).
4. Phase 4: US2. **Stop and validate** (T067). US1 + US2 is the MVP the spec describes
   ("together they form the minimum viable product").
5. Demo or deploy.

### Incremental Delivery

1. Setup + Foundational → sign-in works and the foundation is ready
2. + US1 → browse seeded libraries (demoable with `npm run seed`)
3. + US2 → real uploads (MVP)
4. + US3 → album and viewer
5. + Polish → budgets, CI gates, and the quickstart sign-off

### Parallel Team Strategy

After Foundational: Developer A takes US1, Developer B takes US2 (starting with the
strip-metadata and ingest work, the largest part), and Developer C takes US3. Coordinate on
`queries.ts` and `page.tsx` as noted above.

---

## Notes

- [P] tasks touch different files and have no dependency on incomplete tasks.
- Every task cites its story or requirement for traceability (Principle I).
- Commit after each task or logical group, on the `001-photo-album-organizer` branch (no
  direct pushes to `main`).
- If implementation shows the spec is wrong, update spec.md first, then the code.
