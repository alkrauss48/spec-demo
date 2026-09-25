import type { CSSProperties } from 'react';
import { Button } from '@/components/ui/Button';
import { SafeImage } from '@/components/ui/SafeImage';
import { albumLabel, dateTimeLabel } from '@/lib/dates';
import type { ViewerPhoto } from '@/server/photos/queries';
import { photoAlt } from './PhotoGrid';
import styles from './PhotoViewer.module.css';

export type ViewerLinks = { prev: string | null; next: string | null; close: string };

export function viewerLinks(date: string, photo: ViewerPhoto): ViewerLinks {
  return {
    prev: photo.prevId ? `/albums/${date}/photos/${photo.prevId}` : null,
    next: photo.nextId ? `/albums/${date}/photos/${photo.nextId}` : null,
    close: `/albums/${date}#photo-${photo.id}`,
  };
}

/** The full-resolution photo scaled to fit, its date, and real Previous/Next/Close links (FR-013). */
export function PhotoViewer({ photo, links }: { photo: ViewerPhoto; links: ViewerLinks }) {
  const undated = photo.dateSource === 'upload';
  const ratio = { '--ratio': `${photo.width} / ${photo.height}` } as CSSProperties;
  return (
    <div className={styles.viewer}>
      <div className={styles.frame} style={ratio}>
        <SafeImage
          src={`/media/photos/${photo.id}/full`}
          alt={photoAlt(photo, dateTimeLabel(photo.captureTime))}
          width={photo.width}
          height={photo.height}
          className={styles.image}
          fallbackLabel="This photo couldn't be displayed."
        />
      </div>
      <p className={styles.caption}>
        {undated ? (
          <>
            <span className="badge">Date not recorded</span>
            <span>Date not recorded, added {albumLabel(photo.captureTime.slice(0, 10))}</span>
          </>
        ) : (
          <span>{dateTimeLabel(photo.captureTime)}</span>
        )}
      </p>
      <nav className={styles.nav} aria-label="Photo navigation">
        {links.prev && (
          <Button href={links.prev} variant="secondary">
            Previous
          </Button>
        )}
        <Button href={links.close} variant="secondary">
          Close
        </Button>
        {links.next && (
          <Button href={links.next} variant="secondary">
            Next
          </Button>
        )}
      </nav>
    </div>
  );
}
