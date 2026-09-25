# Photo Album Organizer

A private, per-user web photo library. You upload photos; each one is dated from the local
capture time recorded in it (or the upload date when there isn't one), its location and other
personal metadata are removed without lowering quality, and it is filed into an automatic
one-album-per-day grouping. The library shows albums as tiles grouped under month headings,
newest first. Albums open to a capture-ordered grid and a keyboard-, pointer-, and
swipe-navigable full-resolution viewer.

The spec, plan, and design notes live in [`specs/001-photo-album-organizer/`](specs/001-photo-album-organizer/).

## Prerequisites

- Node.js 22 LTS or later and npm 10+
- For end-to-end tests: `npx playwright install --with-deps chromium webkit`
- About 1 GB of free disk space for the media directory during load tests

## Setup

```bash
npm install
cp .env.example .env.local        # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate                # creates the auth tables and applies db/migrations/*.sql
npm run dev                       # http://localhost:3000
```

| Variable             | Example                 | Purpose                                               |
| -------------------- | ----------------------- | ----------------------------------------------------- |
| `DATABASE_PATH`      | `./data/app.db`         | SQLite file                                           |
| `MEDIA_ROOT`         | `./data/media`          | Photo storage root                                    |
| `BETTER_AUTH_SECRET` | _(random, ≥ 32 chars)_  | Session signing. Never commit it.                     |
| `BETTER_AUTH_URL`    | `http://localhost:3000` | App origin; uploads must come from it (Origin check). |

To try it with data, sign up in the browser, then seed that account:

```bash
npm run seed -- --user you@example.com --photos 200 --albums 20
```

## Quality gates

These are the constitution's merge gates; CI (`.github/workflows/ci.yml`) runs all of them.

```bash
npm run lint              # ESLint + Prettier
npm run typecheck         # tsc --noEmit (strict)
npm test                  # Vitest: unit + integration
npm run test:e2e          # Playwright (Chromium + WebKit): every acceptance scenario, keyboard, axe, 320 px
npm run test:log-privacy  # no personal data in the server log captured by test:e2e
npm audit --omit=dev --audit-level=high
npm run build && npm run perf:bundle   # ≤ 200 KB compressed initial JS per route
npm run perf:upload       # 100-photo upload (SC-004), write p95, large-album INP, read p95
npm run perf:lighthouse   # LCP/CLS on / and a 1,000-photo album (seed the perf users first; see quickstart.md)
```

The Playwright servers run on ports 3100 and 3101 with throwaway databases under
`test-results/`, so they don't touch your local data.

## Privacy guarantees

- **Metadata is removed before anything is stored.** JPEG, PNG, and WebP files are rewritten
  losslessly with an allow-list of image-data segments, so pixels are unchanged; GPS, serial
  numbers, owner and artist names, comments, XMP, IPTC, and embedded thumbnails are dropped.
  A JPEG keeps only its Orientation tag. HEIC is converted to a full-resolution JPEG at
  quality 95 with no metadata. The capture date is read first, from the original.
- **Libraries are private.** Every query is scoped to the signed-in user, and media is served
  only through an ownership-checked route. Another user's album, photo, or file returns the
  same 404 as one that doesn't exist, so nothing reveals that it exists.
- **No personal data in logs.** The server logs JSON lines with an allow-list of fields
  (IDs, sizes, formats, reason codes, timings). File names, EXIF values, capture dates, email
  addresses, and tokens are never logged; `npm run test:log-privacy` checks this.
- Secrets come only from the environment. Uploads are validated on the server by magic bytes
  and size, and state-changing requests must come from the app's own origin.

## Deployment notes

- Run one Node.js process with a persistent disk for `DATABASE_PATH` and `MEDIA_ROOT`.
- Serve it over HTTPS (`BETTER_AUTH_URL` with `https:`), which also turns on `Secure`
  session cookies.
- Uploads are single requests of up to 50 MB; make sure a reverse proxy in front allows that
  body size.
