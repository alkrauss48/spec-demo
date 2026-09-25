import { photoCountLabel } from '@/lib/dates';
import type { AlbumSummary } from '@/server/photos/queries';
import styles from './AlbumTile.module.css';
import { TileMosaic } from './TileMosaic';

/** One album as a single link; its accessible name reads "Mar 14, 2026, 12 photos". */
export function AlbumTile({ album, eager = false }: { album: AlbumSummary; eager?: boolean }) {
  const count = photoCountLabel(album.photoCount);
  return (
    <a
      href={`/albums/${album.date}`}
      className={styles.tile}
      aria-label={`${album.label}, ${count}`}
    >
      <TileMosaic previews={album.previews} eager={eager} />
      <span className={styles.text}>
        <span className={styles.label}>{album.label}</span>
        <span className={styles.count}>{count}</span>
      </span>
    </a>
  );
}
