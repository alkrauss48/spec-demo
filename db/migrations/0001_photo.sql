CREATE TABLE photo (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 255),
  format            TEXT NOT NULL CHECK (format IN ('jpeg', 'png', 'webp', 'heic')),
  stored_format     TEXT NOT NULL CHECK (stored_format IN ('jpeg', 'png', 'webp')),
  width             INTEGER NOT NULL CHECK (width > 0),
  height            INTEGER NOT NULL CHECK (height > 0),
  stored_bytes      INTEGER NOT NULL CHECK (stored_bytes > 0),
  original_sha256   TEXT NOT NULL CHECK (length(original_sha256) = 64),
  capture_date      TEXT NOT NULL,
  capture_time      TEXT NOT NULL CHECK (substr(capture_time, 1, 10) = capture_date),
  date_source       TEXT NOT NULL CHECK (date_source IN ('exif', 'upload')),
  added_at          TEXT NOT NULL,
  UNIQUE (user_id, original_sha256)
);

CREATE INDEX photo_album_idx ON photo (user_id, capture_date, capture_time, added_at, id);
