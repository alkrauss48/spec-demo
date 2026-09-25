import type { DateGroup as Group } from '@/server/photos/queries';
import { AlbumTile } from './AlbumTile';
import styles from './DateGroup.module.css';

/** Tiles in the first row or so load eagerly for LCP (SC-002); the rest are lazy. */
const EAGER_TILES = 4;

export function DateGroup({ group, eager = false }: { group: Group; eager?: boolean }) {
  const headingId = `group-${group.yearMonth}`;
  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <h2 id={headingId}>{group.label}</h2>
      <ul className={styles.grid}>
        {group.albums.map((album, i) => (
          <li key={album.date}>
            <AlbumTile album={album} eager={eager && i < EAGER_TILES} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export const gridClassName = styles.grid;
