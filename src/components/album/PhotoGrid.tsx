import { SafeImage } from '@/components/ui/SafeImage';
import { albumLabel, timeLabel } from '@/lib/dates';
import type { AlbumPhoto } from '@/server/photos/queries';
import styles from './PhotoGrid.module.css';

export function photoAlt(photo: AlbumPhoto, when: string): string {
  const position = `Photo ${photo.n} of ${photo.total}`;
  return photo.dateSource === 'upload'
    ? `${position}, date not recorded, added ${albumLabel(photo.captureTime.slice(0, 10))}`
    : `${position}, taken ${when}`;
}

/** An album's thumbnails in capture order; each links to the viewer (FR-012, FR-017). */
export function PhotoGrid({ date, photos }: { date: string; photos: AlbumPhoto[] }) {
  return (
    <ul className={styles.grid}>
      {photos.map((photo) => (
        <li key={photo.id} className={styles.item}>
          <a
            id={`photo-${photo.id}`}
            href={`/albums/${date}/photos/${photo.id}`}
            className={styles.link}
          >
            <SafeImage
              src={`/media/photos/${photo.id}/thumb`}
              alt={photoAlt(photo, timeLabel(photo.captureTime))}
              width={400}
              height={400}
              loading="lazy"
              className={styles.image}
            />
            {photo.dateSource === 'upload' && (
              <span className={`badge ${styles.badge}`} aria-hidden="true">
                Date not recorded
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
