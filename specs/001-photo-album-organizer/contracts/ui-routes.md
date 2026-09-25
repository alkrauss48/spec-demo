# UI Routes Contract: Photo Album Organizer

**Feature**: `001-photo-album-organizer` | **Plan**: [../plan.md](../plan.md)

These are the user-facing pages the feature provides, what each one must render, and its
states. Pages are server-rendered and require a session. An unauthenticated request
redirects to `/sign-in?next=<path>`. Every page has one `<h1>`, a skip link to `<main>`,
and a document `<title>` naming the view.

---

## `/` — Library (US1, US2 · FR-001–FR-003, FR-007, FR-011, FR-016)

**Renders**

- `<h1>Your photos</h1>`, the usage line "N of 1,000 photos", and an **Add photos** button
  (opens the file picker, `multiple`, `accept="image/jpeg,image/png,image/webp,image/heic,image/heif"`).
- One `<section aria-labelledby>` per Date Group, newest first. Each has an `<h2>` label
  ("March 2026") and a `<ul>` of album tiles, newest first.
- **Album tile**: a single `<a href="/albums/{date}">` containing:
  - A preview mosaic of the album's earliest ≤ 4 photos (`/media/photos/{id}/thumb`). The
    layout adapts: 1 photo fills the tile, 2 photos split it, 3 photos use one large and two
    small, 4 photos use a 2×2 grid. No empty cells (US1-AS3).
  - The album label ("Mar 14, 2026") and the photo count ("12 photos" / "1 photo").
  - Accessible name: "Mar 14, 2026, 12 photos". Preview images are decorative (`alt=""`)
    because the link's text already names the album (FR-017).
- **Upload panel** (appears after the user picks files): `<progress>` showing "X of N
  processed" and an `aria-live="polite"` status. When done, a summary: "Added A · Skipped
  as duplicate D · Rejected R", then a list of each rejected or skipped file with its
  message. The library refreshes to show the new albums.

**States**

| State | Condition | Shows |
|-------|-----------|-------|
| Loading | Streaming the server render | Skeleton tiles with fixed sizes (no layout shift), `aria-busy="true"` |
| Empty | 0 photos | EmptyState: "No photos yet", explanation, and a primary **Add photos** button |
| Error | Database read fails | ErrorState: "We couldn't load your photos." and a **Try again** button that re-requests the page |
| Preview failed | A thumbnail fails to load | That mosaic cell shows a neutral placeholder. The tile link still works (edge case) |
| Limit reached | 1,000 photos | Usage line highlighted. **Add photos** stays enabled, but rejected files show the limit message |

**Keyboard**: Tab moves through the skip link, the header's **Sign out** button, **Add
photos**, and each tile in visual order. Enter opens a tile. The focus ring is visible on every tile (US1-AS4).

**Layout**: The grid uses `repeat(auto-fill, minmax(9.5rem, 1fr))`. At 320 px it shows 2
columns with no horizontal scroll.

---

## `/albums/[date]` — Album (US3 · FR-012, FR-006, FR-016)

`date` is `YYYY-MM-DD`. An invalid format, or a date with no photos for this user, returns
the 404 page.

**Renders**

- A back link "← All photos" to `/`, then `<h1>` with the album label ("Mar 14, 2026") and
  the photo count.
- A `<ul>` of thumbnails, ordered by capture time (oldest first). Each item is
  `<a id="photo-{id}" href="/albums/{date}/photos/{id}">` with
  `<img alt="Photo {n} of {total}, taken {h:mm a}" width height loading="lazy">`. When
  `dateSource = upload`, the alt text says "date not recorded, added {date}" instead, and a
  visible badge "Date not recorded" appears (FR-006).
- Focus return: if the URL fragment is `#photo-{id}`, focus moves to that link on load
  (US3-AS3).

**States**: Loading (skeleton grid), Error (ErrorState with retry), and Preview failed
(placeholder cell). There is no Empty state, because an album only exists while it has
photos.

---

## `/albums/[date]/photos/[photoId]` — Single photo (US3 · FR-013, FR-006, FR-016)

A photo that doesn't exist, isn't owned by the user, or isn't in the album for `date`
returns 404.

**Renders**

- `<h1>` visually hidden: "Photo {n} of {total}, Mar 14, 2026".
- `<img src="/media/photos/{id}/full" alt="Photo {n} of {total}, taken {Mar 14, 2026, 11:30 PM}" width height>`,
  or for `dateSource = upload`: `alt="Photo {n} of {total}, date not recorded, added {Mar 20, 2026}"`.
  The image is scaled to fit the viewport (`object-fit: contain`, max 100vw × available
  height) at full original resolution.
- Caption: capture date and time ("Mar 14, 2026, 11:30 PM"), or "Date not recorded, added
  Mar 20, 2026" with the badge.
- Controls (real links, so they work without JavaScript): **Previous**, **Next** (omitted
  at the ends of the album, not disabled), and **Close** → `/albums/{date}#photo-{id}`.
- Keys: `←` previous, `→` next, `Esc` close. Swipe left/right on touch devices.

**States**: Loading ("Loading photo…" over a fixed-aspect box using the stored
width/height), and Error (image fails: placeholder with "This photo couldn't be displayed."
while navigation still works).

---

## `/sign-in`, `/sign-up`

Minimal Better Auth-backed forms with email and password, labeled fields, and errors tied
to fields with `aria-describedby`. They exist only so private libraries can be used. Any
account management beyond sign-up, sign-in, and sign-out is out of scope.

---

## Global

- The 404 page and error boundary use ErrorState, with the request ID shown as "Reference:
  {requestId}" for support. There are no stack traces.
- Accessibility checks (axe, zero serious or critical violations) run on every route and
  state above (SC-006).
