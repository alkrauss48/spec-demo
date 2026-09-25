# Research: Photo Album Organizer

**Feature**: `001-photo-album-organizer` | **Date**: 2026-09-25 | **Plan**: [plan.md](./plan.md)

No technology stack was given with the plan request and the repository has no application
code yet, so every Technical Context item started as NEEDS CLARIFICATION. Each is resolved
below. The guiding constraint is Constitution Principle II: one deployable, platform
defaults, as few dependencies as possible.

---

## R1. Application framework and language

- **Decision**: One TypeScript (strict) web application on **Next.js 15 (App Router) with
  React 19**, running on **Node.js 22 LTS**.
- **Rationale**: One codebase and one deployable serve both the UI and the upload/media
  endpoints, which avoids a separate frontend and backend. Server Components render the
  library and album views on the server from the database, so these views ship very little
  client JavaScript (needed for the 200 KB per-route budget and the 2.5 s LCP). Route
  handlers cover the few HTTP endpoints. Strict TypeScript meets the type-check gate.
- **Alternatives considered**:
  - *Separate SPA (Vite + React) plus an Express API*: two projects, client-side rendering
    hurts LCP, and it needs more glue. Rejected on simplicity and performance grounds.
  - *SvelteKit*: a good fit, with smaller bundles. Rejected only because React and Next.js
    have the larger ecosystem for accessibility testing and auth libraries. Either would
    satisfy the constitution.
  - *Server-rendered templates with no framework (Express + EJS)*: the fewest dependencies,
    but it would mean hand-building upload progress, focus management, and component reuse.

## R2. Persistence

- **Decision**: **SQLite** through **better-sqlite3**, using hand-written parameterized SQL
  (prepared statements) and plain `.sql` migration files applied in order at startup.
- **Rationale**: The scale is small (1,000 photos per user) and there is one server
  process. SQLite needs no extra service to run, and its transactions make the
  1,000-photo limit and duplicate checks atomic. Prepared statements meet the
  parameterized-query rule without an ORM.
- **Alternatives considered**:
  - *PostgreSQL*: adds an operational service the current scale does not need. We can
    migrate later if multi-instance deployment becomes a requirement.
  - *Drizzle/Prisma ORM*: typed queries and migrations, but it is one more dependency and
    build step for about 6 queries. Rejected (YAGNI).

## R3. Albums: stored table vs. derived view

- **Decision**: **Albums are not stored.** An album is the group of a user's photos that
  share the same local capture date (`GROUP BY capture_date`). Date groups (month and year)
  are derived the same way.
- **Rationale**: FR-004 requires "exactly one album per calendar day that has at least one
  photo." Deriving albums makes that true by construction: no album rows can go stale,
  duplicate, or end up empty, and there is no create-if-missing race during concurrent
  uploads. At 1,000 photos per user, the grouping query costs well under a millisecond with
  an index on `(user_id, capture_date, capture_time)`.
- **Alternatives considered**: An `albums` table with a foreign key from photos. It would
  need upsert logic, count maintenance, and cleanup, all for no benefit at this scale.
  Rejected.

## R4. Photo file storage

- **Decision**: Store files on the **local filesystem** under a directory set by
  `MEDIA_ROOT`. Name each file by a random photo ID (never the original file name), with
  two files per photo: `full` (full resolution, metadata removed) and `thumb` (preview).
  Files are served only through an authenticated route handler that checks ownership.
- **Rationale**: This is the simplest storage that works for a single server and 1,000
  photos per user (about 5–10 GB worst case per user). Serving files through the app keeps
  the authorization check on every request (Principle IV, FR-014).
- **Alternatives considered**: S3-compatible object storage with signed URLs. It scales
  better and supports multiple instances, but adds an SDK, credentials, and a service. We
  can adopt it later behind the same `media` module without changing any contract.

## R5. Supported formats and detection (FR-008, FR-009)

- **Decision**: Accept **JPEG, PNG, WebP, and HEIC/HEIF**. Detect the format from the
  file's **magic bytes**, not the extension or the client-supplied MIME type. Reject
  anything else with `UNSUPPORTED_TYPE`. Enforce the 50 MB limit on the server while
  streaming the request body (`FILE_TOO_LARGE`). Also confirm the image decodes, with
  sharp's pixel limit guarding against decompression bombs.
- **Rationale**: Magic-byte detection is the server-side validation Principle IV requires.
  The file picker's `accept` attribute is only a UX aid.

## R6. Removing metadata without losing quality (FR-015)

- **Decision**:
  - **JPEG, PNG, WebP**: **lossless container-level stripping** in a small in-house module
    (`src/server/photos/strip-metadata.ts`). It rewrites the file keeping only an
    allow-list of image-data segments or chunks. Pixel data is never decoded or re-encoded.
    - JPEG: keep SOI, APP0 (JFIF), APP2 (ICC profile), APP14 (Adobe color-transform
      flag, needed to decode CMYK/YCCK JPEGs correctly), DQT, DHT, SOF*, DRI, SOS and scan
      data, and EOI. Drop APP1 (EXIF/XMP), APP13 (IPTC), the rest of APP3–APP15, and COM. If the
      original EXIF Orientation is not 1, write a new minimal APP1 EXIF block containing
      **only** the Orientation tag, so the photo still displays upright.
    - PNG: keep IHDR, PLTE, IDAT, IEND, tRNS, gAMA, cHRM, sRGB, iCCP, sBIT, pHYs, bKGD.
      Drop everything else (eXIf, tEXt, zTXt, iTXt, tIME, …).
    - WebP: keep VP8, VP8L, VP8X, ALPH, ICCP, ANIM, ANMF. Drop EXIF and XMP, clear the
      matching VP8X flags, and fix the RIFF size.
  - **HEIC/HEIF**: decode with **heic-decode** (libheif compiled to WebAssembly), then
    encode a full-resolution JPEG at quality 95 with 4:4:4 chroma using sharp. sharp writes
    no metadata by default. The HEIC original is not kept. heic-decode applies the HEIF
    `irot`/`imir` transforms, so the output is upright and the HEIC's EXIF Orientation is
    ignored (width and height come from the decoded image).
- **Rationale**: The spec requires removing all personal metadata *and* keeping full
  resolution and visible quality. Re-encoding JPEG/PNG/WebP through an image library would
  strip the metadata but lower quality (generational JPEG loss). An allow-list, rather than
  a deny-list, removes unknown or vendor metadata blocks by default. Browsers outside
  Safari cannot display HEIC, and removing metadata from inside the HEIF container
  losslessly is complex, so a quality-95, 4:4:4 JPEG at full resolution is the practical,
  visually lossless option.
- **Verification**: Tests run the stripped output through `exifr` and assert that no GPS,
  serial number, owner, comment, XMP, or IPTC fields remain. They also assert that the
  pixel dimensions are unchanged, and that decoded pixels are identical for
  JPEG/PNG/WebP.
- **Alternatives considered**:
  - *sharp re-encode for all formats*: simple, but it lowers quality. Violates FR-015.
    Rejected.
  - *exiftool (exiftool-vendored)*: complete and lossless, but it bundles a Perl runtime
    and spawns a child process for every upload. Too heavy for three formats with simple
    containers. Rejected.
  - *piexifjs*: JPEG only, and deletes EXIF but not XMP or IPTC. Insufficient.

## R7. Reading the capture date (FR-005, time-zone and future-date edge cases)

- **Decision**: Read metadata from the **original upload bytes, before stripping**, with
  **exifr**. The capture timestamp comes from `DateTimeOriginal`, falling back to
  `CreateDate`. It is interpreted as **local wall-clock time** (offset tags are ignored), so
  a photo taken at 11:30 PM stays on its own day. The resulting `capture_date`
  (`YYYY-MM-DD`) and `capture_time` (`YYYY-MM-DDTHH:mm:ss`) are stored as plain strings with
  no time zone.
  - **Fallback** (no date, unparseable date, earlier than 1900-01-01, or later than "now"
    in the uploader's time zone): use the upload moment converted to the uploader's local
    time and set `date_source = 'upload'`. The client sends its IANA time zone with each
    upload. The server checks it against `Intl.supportedValuesOf('timeZone')` and uses UTC
    if it is invalid or missing.
- **Rationale**: This matches the spec's rule that "a photo's date is the local date
  recorded on the photo." exifr is small, has no dependencies, and reads EXIF from JPEG,
  PNG, WebP, and HEIC.
- **Alternatives considered**: sharp's `metadata()` exposes only the raw EXIF buffer, so a
  parser is still needed. `exif-reader` handles only raw EXIF and has no HEIC container
  support.

## R8. Duplicate detection (FR-010)

- **Decision**: Compute the **SHA-256 of the original uploaded bytes** and enforce a
  `UNIQUE (user_id, original_sha256)` constraint. A match returns `DUPLICATE` and nothing is
  stored.
- **Rationale**: "Exact duplicate photo files" means identical bytes. Hashing the original,
  not the stripped copy, keeps detection working even though stored copies have their
  metadata removed (spec edge case). A hash reveals nothing about the metadata.

## R9. Previews and thumbnails (FR-002, FR-003, FR-013, SC-002)

- **Decision**: Generate **one preview size per photo**: a 400×400 center-cropped WebP
  (quality 75, auto-rotated with EXIF Orientation), created with **sharp** from the stripped
  full-size file during upload. It is used both for the album-tile 2×2 mosaic and for the
  album grid. The single-photo view loads the `full` file scaled with CSS (FR-013).
  All media responses are sent with `Cache-Control: private, max-age=31536000, immutable`,
  because a photo ID's bytes never change.
- **Rationale**: One size covers both uses (a tile cell is about 150–200 CSS px, so 400 px
  covers 2× displays). A preview is about 20–30 KB, so the first screen (≈12 tiles × 4
  previews) is ≈1.2 MB of images at most, with the first row loaded eagerly and the rest
  lazily. That fits the LCP budget.
- **Alternatives considered**: `next/image` on-demand optimization. It adds a cache layer
  and a second resize pipeline, and its authorization is harder to reason about. Plain
  `<img>` with explicit `width`/`height` and `loading="lazy"` is enough.

## R10. Authentication and authorization (FR-014)

- **Decision**: **Better Auth** with email-and-password accounts and database sessions,
  stored in the same SQLite database (httpOnly, Secure, SameSite=Lax cookie). Every page,
  route handler, and media request resolves the session on the server, and **every photo
  query is scoped by `user_id`**. A request for another user's photo returns **404**, not
  403, so the photo's existence cannot be inferred. State-changing requests also check the
  `Origin` header.
- **Rationale**: The spec assumes "the standard approach chosen during planning." Better
  Auth is self-contained (no email or OAuth provider needed to run the demo) and works
  directly with better-sqlite3. Account management beyond sign-up, sign-in, and sign-out is
  out of scope.
- **Alternatives considered**: *Auth.js* (credentials-provider support is limited and
  discouraged). *Hand-rolled sessions* (password hashing, session rotation, and CSRF are
  easy to get wrong, so this is the wrong place for custom code).

## R11. Upload flow, progress, and limits (FR-007, FR-011, SC-004)

- **Decision**: The browser sends **one `multipart/form-data` request per file** to
  `POST /api/photos`, at most **3 at a time**. It shows a `<progress>` bar ("12 of 40
  processed") and a live region, then a summary of added, skipped-as-duplicate, and
  rejected files, naming each rejected file with its reason. The server processes each file
  inside one SQLite transaction that checks the count against 1,000 and inserts the row.
  Files are written to a temporary path and renamed into place only after the transaction
  commits.
- **Rationale**: Uploading per file gives natural per-file progress and per-file error
  reporting, and keeps server memory bounded (≤ 3 × 50 MB). The FR-011 rule "the photos
  that fit are added, the rest are rejected" follows directly from checking the limit per
  file inside a transaction.
- **Performance note**: HEIC decoding in WebAssembly is the slowest step (roughly 1–2 s for
  a 12 MP photo). SC-004 (100 photos in 2 minutes) will be measured with a mixed JPEG/HEIC
  fixture set. If it misses, the fix is to raise upload concurrency or move decoding to a
  worker thread, not to change any contract. Note that iOS Safari often converts HEIC to
  JPEG itself during upload.

## R12. Large albums and responsiveness (edge case: 1,000 photos in one album)

- **Decision**: Render the album grid on the server with native `loading="lazy"` images,
  fixed `width`/`height` (no layout shift), and CSS `content-visibility: auto` on grid rows.
  No virtualization library.
- **Rationale**: 1,000 lightweight `<li><a><img>` items is a modest DOM. Native lazy
  loading plus `content-visibility` keeps scrolling smooth without extra JavaScript.
  Revisit only if an INP measurement exceeds 200 ms.

## R13. Single-photo view and focus return (FR-013, US3-AS3)

- **Decision**: The photo viewer is its **own route**,
  `/albums/[date]/photos/[photoId]`, with previous/next links, ←/→ key handling, Escape to
  close, and swipe on touch. Closing goes to `/albums/[date]#photo-[photoId]`. A small
  client component on the album page moves focus to the anchored thumbnail's link.
- **Rationale**: A route-based viewer works with browser back and forward, needs no modal
  focus trap, and keeps the album page mostly server-rendered. Focus restoration relies on
  the URL fragment, which is simple and testable.
- **Alternatives considered**: A `<dialog>` lightbox over the album page. It has a native
  focus trap, but needs client state, URL syncing, and more JavaScript. Rejected on
  simplicity.

## R14. UI components, styling, and design tokens (Principle III)

- **Decision**: **CSS Modules** (built into Next.js) plus a single `tokens.css` of CSS
  custom properties (colors meeting AA contrast, spacing, radii, focus ring, and
  breakpoints). This feature creates the shared component set in `src/components/ui/`
  (Button, ProgressBar, EmptyState, ErrorState, LoadingState, VisuallyHidden).
- **Rationale**: There is no existing design system, so this feature establishes one with
  no styling dependency. The grid uses `repeat(auto-fill, minmax(…))`, so it reflows down to
  a 320 px width.
- **Alternatives considered**: Tailwind CSS or a component library. More dependencies and
  build configuration than a handful of components needs.

## R15. Testing

- **Decision**:
  - **Vitest**: unit tests (metadata stripping, date extraction and fallback, album
    grouping, format detection) and integration tests (upload route handler against a
    temporary SQLite database and media directory).
  - **Playwright** with **@axe-core/playwright**: end-to-end tests for every acceptance
    scenario in User Stories 1–3, keyboard-only runs, 320 px viewport checks, and axe scans
    (zero serious or critical violations) on the library, album, photo, and empty/error
    states.
  - **Reference photo fixtures** (`tests/fixtures/photos/`): photos with known capture
    dates, GPS, serial numbers, and comments; no date; a future date; late-night
    timestamps; HEIC, PNG, and WebP samples; a non-image file; and a byte-identical
    duplicate. This is the reference set for SC-003.
- **Rationale**: This covers the "each acceptance criterion has a test" and automated a11y
  gates with the standard tools for this stack.

## R16. Observability (Principle V)

- **Decision**: A minimal in-house structured logger (`src/server/log.ts`, about 30 lines)
  that writes one JSON line per event with `level`, `ts`, `requestId`, `event`, and
  sanitized fields. Next.js middleware assigns or propagates `x-request-id`. Client errors
  are captured by React error boundaries and `window.onerror` and posted to
  `POST /api/client-errors`, which logs them after sanitizing.
  - **Never logged**: original file names, EXIF contents, capture dates, email addresses, or
    session tokens. Only photo IDs, user IDs, byte sizes, formats, and reason codes are
    logged.
  - **Signals that confirm the feature works**: `photo.upload.accepted` (format, bytes,
    date_source, duration_ms), `photo.upload.rejected` (reason code),
    `photo.upload.duplicate`, `library.render` (album_count, duration_ms),
    `album.render` (duration_ms), `photo.render` (duration_ms),
    `media.served` (variant, status, duration_ms), `media.completed` (variant, status,
    total_ms), `client.error`.
- **Alternatives considered**: *pino*. Very good, but a dependency for what is a few lines
  of `JSON.stringify` at this scale. It is a drop-in replacement if log volume grows.

## R17. Browser support

- **Decision**: The latest two versions of Chrome, Edge, Firefox, and Safari, plus iOS
  Safari 17+ and Chrome for Android.
- **Rationale**: This covers `content-visibility`, `loading="lazy"`,
  `Intl.DateTimeFormat().resolvedOptions().timeZone`, and CSS grid with no polyfills.
