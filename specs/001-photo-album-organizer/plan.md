# Implementation Plan: Photo Album Organizer

**Branch**: `001-photo-album-organizer` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-photo-album-organizer/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

This is a private, per-user web photo organizer. Users upload photos. Each photo is dated
from its recorded local capture time (falling back to the upload date), its location and
other personal metadata are removed without lowering quality, and it is filed into an
automatic one-album-per-day grouping. The library shows albums as tiles with previews,
grouped under month headings, newest first. Albums open to a capture-ordered grid and a
keyboard-navigable full-resolution viewer.

**Technical approach**: A single Next.js 15 (App Router) TypeScript application. Pages are
Server Components that read SQLite directly (better-sqlite3, parameterized SQL). Albums and
month groups are **derived by query**, not stored, so "exactly one album per day" holds by
construction. Uploads go one file per request to a route handler that checks magic bytes,
hashes the file for duplicates, reads EXIF with exifr, and removes metadata **losslessly at
the container level** (JPEG/PNG/WebP). HEIC is converted to a full-resolution JPEG at
quality 95. The handler generates one 400 px WebP preview with sharp and inserts the row in
a transaction that enforces duplicate and 1,000-photo limits. Files live on local disk and
are served only through an ownership-checked route. Details and rejected alternatives are
in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 22 LTS

**Primary Dependencies**: Next.js 15 (App Router) with React 19; better-sqlite3; Better
Auth (email and password); sharp (preview generation, HEIC → JPEG encoding); exifr
(capture-date read); heic-decode (HEIC decode, WebAssembly)

**Storage**: SQLite file (`DATABASE_PATH`) for users, sessions, and photos. Local
filesystem (`MEDIA_ROOT`) for the `full` and `thumb` image files

**Testing**: Vitest (unit and integration), Playwright with @axe-core/playwright (E2E,
keyboard, a11y, 320 px), Lighthouse CI (performance budgets), and a reference photo fixture
set for SC-003

**Target Platform**: A Node.js 22 server on Linux with a persistent disk. Browsers: the
latest two versions of Chrome, Edge, Firefox, and Safari, plus iOS Safari 17+ and Chrome for
Android

**Project Type**: Web application (single full-stack Next.js project)

**Performance Goals**: LCP ≤ 2.5 s on `/` with 100 albums (SC-002). INP ≤ 200 ms, including
scrolling a 1,000-photo album. 100 photos uploaded and filed in ≤ 2 min (SC-004). Finding an
album by date in under 10 s (SC-001)

**Constraints**: ≤ 200 KB initial JS per route. Read p95 ≤ 300 ms, write p95 ≤ 500 ms (HEIC
exception below). No personal metadata in stored files, the database, or logs (FR-015).
Full resolution kept. 50 MB per file. WCAG 2.2 AA. Works from 320 px

**Scale/Scope**: ≤ 1,000 photos per user (≈ 100 albums typical, up to 1,000 photos in one
album). 3 main views plus sign-in/sign-up. 3 HTTP endpoints plus Better Auth routes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / Gate | Pre-research | Post-design | Evidence |
|---|------------------|:---:|:---:|----------|
| I | **Spec-Driven Development**: spec approved, no `[NEEDS CLARIFICATION]`, stories have acceptance criteria | ✅ | ✅ | spec.md has 3 clarifications resolved and none open. Every contract item cites a US or FR. `tasks.md` still to be produced by `/speckit-tasks` before any code |
| II | **Simplicity (YAGNI)**: smallest solution, platform defaults, each dependency justified | ✅ | ✅ | A single project. No ORM, no styling library, no virtualization library, no object storage, no logger dependency. Albums derived rather than stored. Every dependency and the custom metadata module are justified in Complexity Tracking |
| III | **Accessibility & UX consistency**: WCAG 2.2 AA, axe in CI, shared components and tokens, loading/empty/error states, 320 px | ✅ | ✅ | ui-routes.md defines accessible names, keyboard behavior, and focus return, plus Loading/Empty/Error for every view. `tokens.css` and `src/components/ui/` are the shared set (R14). V11, V12, and V15 in quickstart |
| IV | **Security & Privacy**: server-side validation, output encoding, parameterized queries, no committed secrets, server-side authorization, data minimization, no personal data in logs, dependency audit | ✅ | ✅ | Magic-byte and size validation on the server (R5). React escaping by default, and no `dangerouslySetInnerHTML`. Prepared statements only (R2). Secrets come from env. Every query is scoped by user, and other users' resources return 404 (R10). Origin check on POST. EXIF is removed with an allow-list (R6). Logs exclude file names and EXIF (R16). `npm audit` gate |
| V | **Observability**: JSON logs with level, timestamp, and request ID; errors with context; friendly user errors; signals named | ✅ | ✅ | R16 names the logger, request-ID middleware, `/api/client-errors`, and the signal list. Error schema returns only safe messages plus `requestId` |
| — | **Performance budgets**: work that affects budgets identified and measured | ✅ | ⚠️ Exception | Budget-sensitive items: tile previews (LCP), large album (INP), upload processing (write p95). The measurement plan is in quickstart. **HEIC uploads exceed write p95 ≤ 500 ms**, so the exception is documented below |

**Gate result**: PASS. The one budget exception is recorded, with justification, in
Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-photo-album-organizer/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── api.openapi.yaml #   HTTP endpoints: upload, media, client errors
│   └── ui-routes.md     #   Pages, states, accessibility and keyboard contract
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout, skip link, tokens, error reporter
│   ├── page.tsx                      # Library (/)
│   ├── loading.tsx | error.tsx | not-found.tsx
│   ├── albums/[date]/
│   │   ├── page.tsx                  # Album view
│   │   └── photos/[photoId]/page.tsx # Single-photo viewer
│   ├── sign-in/page.tsx | sign-up/page.tsx
│   ├── api/
│   │   ├── auth/[...all]/route.ts    # Better Auth handler
│   │   ├── photos/route.ts           # POST upload
│   │   └── client-errors/route.ts    # POST client error report
│   └── media/photos/[photoId]/[variant]/route.ts  # GET thumb|full (owner only)
├── components/
│   ├── ui/                           # Shared set: Button, ProgressBar, EmptyState, ErrorState, LoadingState, VisuallyHidden
│   ├── library/                      # DateGroup, AlbumTile, TileMosaic, UploadPanel (client)
│   └── album/                        # PhotoGrid, FocusFromHash (client), PhotoViewer, ViewerKeys (client)
├── server/
│   ├── db.ts                         # better-sqlite3 connection + migration runner
│   ├── auth.ts                       # Better Auth config, requireUser()
│   ├── log.ts                        # JSON logger, request context
│   ├── photos/
│   │   ├── detect-format.ts          # magic bytes
│   │   ├── capture-date.ts           # exifr read + fallback rules
│   │   ├── strip-metadata.ts         # lossless JPEG/PNG/WebP allow-list rewrite
│   │   ├── convert-heic.ts           # heic-decode → sharp JPEG q95 4:4:4
│   │   ├── preview.ts                # sharp 400×400 WebP
│   │   ├── ingest.ts                 # pipeline + transaction (dedupe, limit, insert)
│   │   └── queries.ts                # library groups, album photos, photo neighbors, usage
│   └── media-store.ts                # MEDIA_ROOT paths, temp write, atomic rename
├── lib/
│   └── dates.ts                      # album/group label formatting, local-time helpers (shared client/server)
├── styles/tokens.css
└── middleware.ts                     # request ID, auth redirect for pages

db/migrations/                        # 0001_photo.sql (Better Auth tables via its CLI migration)

tests/
├── fixtures/photos/                  # reference set (dates, GPS, HEIC/PNG/WebP, non-image, duplicate, 51 MB)
├── unit/                             # detect-format, capture-date, strip-metadata, queries, dates
├── integration/                      # POST /api/photos, media auth, limit & duplicate races
└── e2e/                              # US1–US3 scenarios, keyboard, axe, 320px, states, privacy
scripts/
└── seed.ts                           # load/perf seeding (quickstart V14 and perf)
```

**Structure Decision**: A single full-stack Next.js project at the repository root. The spec
describes one web application with no separate clients, so splitting into
frontend/backend packages would add build and deploy surface with no benefit (Principle II).
Server-only code sits in `src/server/` (imported only by Server Components and route
handlers), which keeps the metadata, database, and auth code out of client bundles.

## Complexity Tracking

> The constitution requires every new dependency, layer, or pattern, and every budget
> exception, to be justified here. This is a new project, so every runtime dependency is
> listed.

| Item | Why Needed | Simpler Alternative Rejected Because |
|------|------------|-------------------------------------|
| Next.js 15 + React 19 | One deployable for pages and endpoints. Server Components keep client JS small for the LCP and 200 KB budgets | Express + templates would mean hand-building upload progress, focus handling, and components. An SPA + API is two projects with worse LCP (R1) |
| better-sqlite3 | Transactional storage for photos and sessions with zero ops | A JSON file store can't enforce the uniqueness and limit rules atomically. Postgres is an extra service (R2) |
| Better Auth | Private libraries (FR-014) need accounts and sessions. The spec defers to a "standard approach" | Hand-rolled auth is a security risk. Auth.js credentials support is discouraged (R10) |
| sharp | Preview generation and HEIC → JPEG encoding, fast and native | Browser-side resizing can't be trusted and still needs server validation. Pure-JS resizers are too slow for 100-photo batches |
| exifr | Reads capture date from JPEG/PNG/WebP/HEIC | sharp exposes only raw EXIF bytes. Writing an EXIF/IFD parser is more custom code than it's worth (R7) |
| heic-decode | FR-008 requires HEIC. sharp's prebuilt binaries can't decode HEVC | Rejecting HEIC violates FR-008. System libheif makes deployment platform-dependent (R6) |
| Custom `strip-metadata.ts` (about 200 lines) | FR-015 requires removing all personal metadata **without** lowering quality | sharp re-encoding lowers JPEG quality. exiftool-vendored bundles Perl and spawns a process per upload. piexifjs misses XMP and IPTC (R6) |
| **Budget exception**: `POST /api/photos` p95 > 500 ms for HEIC and for very large files | HEIC decoding in WebAssembly takes about 1–2 s for 12 MP, and hashing, stripping, and previewing a 50 MB file is I/O-bound. These costs are inherent to FR-008 and FR-009 | Async/background processing would add a job queue and a "processing" state the spec doesn't have. The budget still applies to JPEG/PNG/WebP ≤ 10 MB, and HEIC is tracked as its own metric. The user-facing goal SC-004 (100 photos ≤ 2 min) remains mandatory. **Needs project owner approval** per the constitution |
