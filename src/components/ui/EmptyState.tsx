import type { ReactNode } from 'react';
import styles from './states.module.css';

export function EmptyState({
  heading,
  children,
  action,
}: {
  heading: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={styles.state} aria-labelledby="empty-heading">
      <h2 id="empty-heading">{heading}</h2>
      <p>{children}</p>
      {action}
    </section>
  );
}
