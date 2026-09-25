import type { ReactNode } from 'react';
import styles from './states.module.css';
import { VisuallyHidden } from './VisuallyHidden';

/** A skeleton container. Children should be fixed-size so nothing shifts when content loads. */
export function LoadingState({
  label = 'Loading…',
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.loading} aria-busy="true">
      <VisuallyHidden>{label}</VisuallyHidden>
      {children}
    </div>
  );
}

export function Skeleton({ width, height }: { width: string; height: string }) {
  return <div className={styles.skeleton} style={{ width, height }} aria-hidden="true" />;
}
