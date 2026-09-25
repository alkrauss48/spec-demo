import { LoadingState, Skeleton } from '@/components/ui/LoadingState';

/** A heading placeholder and a fixed-size thumbnail grid (FR-016). */
export default function AlbumLoading() {
  return (
    <main id="main" className="page">
      <LoadingState label="Loading album…">
        <Skeleton width="7rem" height="1.5rem" />
        <Skeleton width="14rem" height="2.1rem" />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(var(--tile-min), calc(50% - var(--space-2))), 1fr))',
            gap: 'var(--space-2)',
          }}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              style={{
                aspectRatio: '1',
                background: 'var(--color-skeleton)',
                borderRadius: 'var(--radius-md)',
              }}
            />
          ))}
        </div>
      </LoadingState>
    </main>
  );
}
