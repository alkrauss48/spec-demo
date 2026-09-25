# Quickstart & Validation: Photo Album Organizer

**Feature**: `001-photo-album-organizer` | **Plan**: [plan.md](./plan.md)

How to run the feature locally and prove it works end to end. For the full contracts, see
[contracts/ui-routes.md](./contracts/ui-routes.md) and
[contracts/api.openapi.yaml](./contracts/api.openapi.yaml). For field rules, see
[data-model.md](./data-model.md).

## Prerequisites

- Node.js 22 LTS and npm 10+
- Playwright browsers: `npx playwright install --with-deps chromium webkit`
- About 1 GB of free disk space for the media directory during load tests

## Setup

```bash
npm install
cp .env.example .env.local        # fill BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate                # applies db/migrations/*.sql to DATABASE_PATH
npm run dev                       # http://localhost:3000
```

Environment variables (all from `.env.local`; no secrets are committed):

| Variable | Example | Purpose |
|----------|---------|---------|
| `DATABASE_PATH` | `./data/app.db` | SQLite file |
| `MEDIA_ROOT` | `./data/media` | Photo storage root |
| `BETTER_AUTH_SECRET` | *(random)* | Session signing |
| `BETTER_AUTH_URL` | `http://localhost:3000` | App origin, also used for the Origin check |

## Quality gates (constitution, "Development Workflow & Quality Gates")

```bash
npm run lint          # ESLint + Prettier check: 0 errors
npm run typecheck     # tsc --noEmit, strict: 0 errors
npm test              # Vitest unit + integration
npm run test:e2e      # Playwright incl. axe scans and keyboard-only flows
npm audit --audit-level=high
```

All five must pass.

## Validation scenarios

The fixture photos live in `tests/fixtures/photos/` (see research.md R15). Each scenario
below is automated in `tests/e2e/`. The manual steps are listed so a reviewer can check by
hand.

| # | Proves | Steps | Expected |
|---|--------|-------|----------|
| V1 | Empty state (edge case, FR-016) | Sign up as a new user, then open `/` | "No photos yet" with an **Add photos** button. Usage shows "0 of 1,000 photos" |
| V2 | Date placement (US2-AS1, SC-003) | Add `2026-03-14_a.jpg`, `2026-03-14_b.jpg`, `2026-03-02.jpg`, `2026-01-20.heic` | Headings "March 2026" above "January 2026". Tiles "Mar 14, 2026 · 2 photos", then "Mar 2, 2026 · 1 photo" under March. "Jan 20, 2026 · 1 photo" under January |
| V3 | Joins existing album (US2-AS2) | Add `2026-03-14_c.png` | No new tile. "Mar 14, 2026" now shows 3 photos |
| V4 | Adaptive tile preview (US1-AS2/AS3, FR-003) | Check tiles with 1, 3, and 4+ photos | No empty or broken cells. The 4+ tile shows the 4 earliest photos |
| V5 | Fallback date (US2-AS3, FR-006) | Add `no-date.jpg` and `future-date.jpg` | Both land in today's album (uploader's time zone) with the "Date not recorded" badge in the album and photo views |
| V6 | Time zone (edge case) | Add `2026-03-14_2330.jpg` with the browser set to `Asia/Tokyo` | Placed in "Mar 14, 2026", not Mar 15 |
| V7 | Rejections and summary (US2-AS4/AS5, FR-007–FR-009) | Add `notes.pdf`, `too-big-51mb.jpg`, `ok.webp` together | Progress shows, then the summary "Added 1 · Skipped 0 · Rejected 2" with each file named and the reason given |
| V8 | Duplicate (FR-010) | Add `2026-03-14_a.jpg` again | "Skipped as duplicate: 2026-03-14_a.jpg". Count unchanged |
| V9 | Metadata removed (FR-015) | Add `gps-serial-comment.jpg`, then download `/media/photos/{id}/full` and run `npx exifr <file>` (or `exiftool`) | No GPS, serial, owner, comment, XMP, or IPTC fields. Pixel dimensions equal the original. Photo is upright. The database row and server log line have none of these values |
| V10 | Album view and viewer (US3-AS1–AS3, FR-012/013) | Open "Mar 14, 2026", select the 2nd photo, press → then ←, then Esc | Thumbnails oldest first. The viewer shows the full-resolution image scaled to fit. Keys move between photos. Esc returns to the album with focus on the 2nd photo |
| V11 | Keyboard and a11y (US1-AS4, FR-017, SC-006) | Tab through `/`, an album, and a photo with no mouse. The axe run covers each route and state | Every tile is reachable with a visible focus ring and announces "Mar 14, 2026, 3 photos". axe: 0 serious or critical violations |
| V12 | Narrow screen (edge case) | Set viewport width to 320 px on `/` and on an album | 2-column grid, no horizontal scroll |
| V13 | Privacy (FR-014) | As user B, request user A's `/albums/2026-03-14`, `/media/photos/{A's id}/full`, and `/media/photos/{A's id}/thumb` | Each returns 404. Nothing reveals that user A's data exists |
| V14 | Library limit (FR-011) | Seed user C with 998 photos (`npm run seed -- --user c@example.test --photos 998`), then add 5 new photos | 2 added, 3 rejected with "…limit of 1,000 photos". Usage shows "1,000 of 1,000 photos" |
| V15 | Load and error states (FR-016) | Run `test:e2e` with the route-mocking fixtures that delay or fail the database or media responses | Skeletons while loading. ErrorState with **Try again** on failure. Placeholder when a thumbnail fails |

## Performance checks (constitution budgets, SC-001/002/004)

```bash
npm run seed -- --user perf@example.test --photos 1000 --albums 100
npm run seed -- --user perf-large@example.test --photos 1000 --albums 1 --start 2026-03-14
npm run build && npm start
npm run perf:lighthouse     # Lighthouse CI, mobile preset (Moto G Power, 4G) against / (perf@) and /albums/2026-03-14 (perf-large@)
npm run perf:upload         # Playwright: 100 mixed JPEG/HEIC fixtures in one action on a throttled 50 Mbps profile, then 20 PNG/WebP and >10 MB files for write p95
```

| Metric | Budget | Where |
|--------|--------|-------|
| LCP on `/` (100 albums) | ≤ 2.5 s p75 | Lighthouse (SC-002) |
| INP / CLS | ≤ 200 ms / ≤ 0.1 | Lighthouse and Playwright interaction trace, incl. scrolling a 1,000-photo album |
| Initial JS per route | ≤ 200 KB compressed | `next build` output, checked by `npm run perf:bundle` |
| Page render time on the server (read) | p95 ≤ 300 ms | `library.render` and `album.render` `duration_ms`, measured by `tests/perf/read-latency.spec.ts` (T091) |
| Media reads `thumb` / `full` (read) | p95 ≤ 300 ms (`full`: to headers sent; `thumb`: total response) | `media.served.duration_ms` (`full`), `media.completed.total_ms` (`thumb`), measured by T091 |
| `POST /api/photos` (write) | p95 ≤ 500 ms for JPEG/PNG/WebP ≤ 10 MB | `photo.upload.accepted.duration_ms`. HEIC is tracked separately; see plan's Complexity Tracking |
| 100-photo upload | ≤ 2 min | `perf:upload` (SC-004) |

## Observability check (Principle V)

While running V2–V8, tail the server log (`npm run dev | npx pino-pretty`, which works on
any JSON-lines log) and confirm:

- Each request line has `level`, `ts`, and `requestId`.
- The events `photo.upload.accepted`, `photo.upload.rejected` (with `reason`),
  `photo.upload.duplicate`, `library.render`, and `media.served` appear.
- No line contains an original file name, email address, EXIF value, or capture date.
  `npm run test:log-privacy` greps the captured test logs for fixture file names and EXIF
  values, and fails if it finds any.
