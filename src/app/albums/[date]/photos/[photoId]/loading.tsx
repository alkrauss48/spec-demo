import { LoadingState } from '@/components/ui/LoadingState';

/** "Loading photo…" over a fixed-aspect box (FR-016). */
export default function PhotoLoading() {
  return (
    <main id="main" className="page">
      <LoadingState label="Loading photo…">
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 'min(100%, 48rem)',
            margin: '0 auto',
            aspectRatio: '4 / 3',
            background: 'var(--color-skeleton)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <p aria-hidden="true">Loading photo…</p>
        </div>
      </LoadingState>
    </main>
  );
}
