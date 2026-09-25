import { gridClassName } from '@/components/library/DateGroup';
import { LoadingState, Skeleton } from '@/components/ui/LoadingState';
import { SiteHeader } from '@/components/ui/SiteHeader';

/** Fixed-size skeleton tiles in the library grid, so nothing shifts when content arrives. */
export default function LibraryLoading() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="page">
        <LoadingState label="Loading your photos…">
          <Skeleton width="12rem" height="2.1rem" />
          <Skeleton width="9rem" height="1.5rem" />
          <ul className={gridClassName}>
            {Array.from({ length: 12 }, (_, i) => (
              <li key={i}>
                <div
                  style={{
                    aspectRatio: '1',
                    background: 'var(--color-skeleton)',
                    borderRadius: 'var(--radius-md)',
                  }}
                />
                <Skeleton width="70%" height="1rem" />
              </li>
            ))}
          </ul>
        </LoadingState>
      </main>
    </>
  );
}
