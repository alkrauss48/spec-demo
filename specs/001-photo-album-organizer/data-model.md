# Data Model: Photo Album Organizer

**Feature**: `001-photo-album-organizer` | **Date**: 2026-09-25 | **Plan**: [plan.md](./plan.md)

Storage is SQLite (see [research.md](./research.md) R2). Only **User** (managed by Better
Auth) and **Photo** are stored. **Album** and **Date Group** are derived from photos by
query (R3).

```text
User 1 ──── * Photo            (stored)
User 1 ──── * Album            (derived: photos grouped by capture_date)
Album * ──── 1 DateGroup       (derived: albums grouped by capture_date's year-month)
Album 1 ──── * Photo           (derived: photo.capture_date = album.date)
```

---

## User (stored; owned by Better Auth)

Better Auth creates and manages the `user`, `session`, `account`, and `verification` tables.
This feature reads only `user.id`, taken from the server-side session.

| Field | Type | Notes |
|-------|------|-------|
| `id` | TEXT PK | Opaque ID. The only user field this feature uses. |

The user's email address is kept only for sign-in and is never logged (Principle IV).

---

## Photo (stored)

Table `photo`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | TEXT PK | 128-bit random, URL-safe | Also used as the file name on disk. Never derived from user input. |
| `user_id` | TEXT | NOT NULL, FK → `user.id` ON DELETE CASCADE | Owner. Every query filters on it (FR-014). |
| `original_filename` | TEXT | NOT NULL, 1–255 chars, control chars stripped | Shown only to the owner (Key Entities). Never logged, never used as a path. |
| `format` | TEXT | NOT NULL, one of `jpeg`,`png`,`webp`,`heic` | Format **as uploaded**, detected from magic bytes (R5). |
| `stored_format` | TEXT | NOT NULL, one of `jpeg`,`png`,`webp` | Format of the `full` file (HEIC → `jpeg`, R6). |
| `width` | INTEGER | NOT NULL, > 0 | Display width after orientation is applied. Used for `<img width>` to avoid layout shift. |
| `height` | INTEGER | NOT NULL, > 0 | Display height after orientation is applied. |
| `stored_bytes` | INTEGER | NOT NULL, > 0 | Size of the `full` file. |
| `original_sha256` | TEXT | NOT NULL, 64 hex chars | SHA-256 of the original upload bytes (R8). |
| `capture_date` | TEXT | NOT NULL, `YYYY-MM-DD` | Local calendar date. **Album key.** |
| `capture_time` | TEXT | NOT NULL, `YYYY-MM-DDTHH:mm:ss` | Local wall-clock time with no offset. Sort key. Its date part equals `capture_date`. |
| `date_source` | TEXT | NOT NULL, `exif` or `upload` | `upload` means the fallback date was used (FR-005, FR-006). |
| `added_at` | TEXT | NOT NULL, ISO-8601 UTC | Upload time on the server. Breaks sort ties. |

**Indexes and constraints**

- `UNIQUE (user_id, original_sha256)`: duplicate detection (FR-010).
- `INDEX (user_id, capture_date, capture_time, added_at, id)`: album grouping, tile
  previews, and album ordering, all served from one index.

**Not stored (FR-015)**: GPS or location, camera make, model, or serial number, lens
serial, owner or artist name, copyright, comments, XMP, IPTC, maker notes, or thumbnails
embedded in EXIF. None of these exist in the database, in media files (EXIF Orientation is
the only tag kept, in JPEG; R6), or in logs.

**Files on disk** (under `MEDIA_ROOT/<user_id>/`):

| Variant | Path | Content |
|---------|------|---------|
| `full` | `<id>.<stored_format>` | Full resolution, metadata removed (R6). |
| `thumb` | `<id>.thumb.webp` | 400×400 cover crop, no metadata (R9). |

### Validation rules (server-side, in order)

Each rule maps to the rejection code in [contracts/api.openapi.yaml](./contracts/api.openapi.yaml).

1. Authenticated session required → otherwise `401`.
2. `Origin` matches the app origin → otherwise `403 FORBIDDEN_ORIGIN`.
3. Body is at most 50 MB, enforced while streaming → otherwise `413 FILE_TOO_LARGE` (FR-009).
4. Magic bytes are JPEG, PNG, WebP, or HEIC/HEIF → otherwise `415 UNSUPPORTED_TYPE` (FR-008).
5. The image decodes within sharp's pixel limit → otherwise `422 UNREADABLE_IMAGE`.
6. `original_sha256` is not already in the user's library → otherwise `409 DUPLICATE` (FR-010).
7. The user's photo count is below 1,000, checked inside the insert transaction →
   otherwise `409 LIBRARY_LIMIT_REACHED` (FR-011).
8. `timezone` form field is a valid IANA zone → otherwise the server uses `UTC` (not an
   error).

### Capture date resolution (FR-005)

```text
raw = exif.DateTimeOriginal ?? exif.CreateDate            (read from original bytes, before stripping)
if raw is parseable local time
   and raw >= 1900-01-01T00:00:00
   and raw <= now() in the uploader's time zone:
      capture_time = raw; date_source = 'exif'
else:
      capture_time = now() in the uploader's time zone; date_source = 'upload'
capture_date = date part of capture_time
```

### Lifecycle / state

A photo has no user-visible states. The upload pipeline is:

```text
received → validated → hashed → date resolved → metadata stripped → thumb generated
        → [txn: dedupe + limit check + INSERT] → files renamed from tmp into place → stored
Any failure before commit → temp files deleted, nothing stored, rejection returned.
```

Photos are never updated or deleted in this feature (browse-only, see spec Assumptions).

---

## Album (derived)

The group of one user's photos that share a `capture_date`. It has no table and no ID
beyond its date.

| Field | Derivation |
|-------|-----------|
| `date` | `capture_date` (`YYYY-MM-DD`). Also the URL key: `/albums/2026-03-14`. |
| `name` / label | `date` formatted in `en-US` as `MMM d, yyyy` (e.g. "Mar 14, 2026"), FR-004. Formatted from the date string, not with the viewer's time zone. |
| `photo_count` | `COUNT(*)` |
| `preview_photos` | First ≤ 4 photos by `(capture_time, added_at, id)` ascending (FR-003) |
| `has_fallback_dates` | `MAX(date_source = 'upload')`. Lets the tile or album show that some dates were not recorded. |

**Invariants** (true by construction)

- There is exactly one album per user per `capture_date` that has at least one photo
  (FR-004).
- Each photo belongs to exactly one album.

**Ordering**

- Albums within the library: `date` descending (FR-001).
- Photos within an album: `(capture_time, added_at, id)` ascending (FR-012).

---

## Date Group (derived)

| Field | Derivation |
|-------|-----------|
| `year_month` | `substr(capture_date, 1, 7)` (`YYYY-MM`) |
| `label` | "March 2026" (`MMMM yyyy`, en-US) |
| `albums` | Albums whose `date` falls in `year_month`, ordered by `date` descending |

Groups are ordered by `year_month` descending (FR-001).

---

## Library usage (derived)

| Field | Derivation |
|-------|-----------|
| `photo_count` | `COUNT(*) FROM photo WHERE user_id = ?` |
| `photo_limit` | Constant `1000` (FR-011) |

Shown on the library page as, for example, "412 of 1,000 photos".
