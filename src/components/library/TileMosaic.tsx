import { SafeImage } from '@/components/ui/SafeImage';
import type { Preview } from '@/server/photos/queries';
import styles from './TileMosaic.module.css';

/** Adaptive preview of an album's 1–4 earliest photos. Decorative: the tile link names it. */
export function TileMosaic({ previews, eager = false }: { previews: Preview[]; eager?: boolean }) {
  const shown = previews.slice(0, 4);
  return (
    <div className={styles.mosaic} data-count={shown.length}>
      {shown.map((p) => (
        <div key={p.id} className={styles.cell} data-cell="">
          <SafeImage
            src={`/media/photos/${p.id}/thumb`}
            alt=""
            width={400}
            height={400}
            loading={eager ? 'eager' : 'lazy'}
            className={styles.image}
          />
        </div>
      ))}
    </div>
  );
}
