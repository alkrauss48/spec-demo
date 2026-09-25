import type { ReactNode } from 'react';
import styles from './states.module.css';

/** A friendly error with an optional retry and support reference. Never shows a stack. */
export function ErrorState({
  heading,
  message,
  action,
  reference,
  headingLevel = 1,
}: {
  heading: string;
  message?: string;
  action?: ReactNode;
  reference?: string;
  headingLevel?: 1 | 2;
}) {
  const H = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section className={styles.state} role="alert">
      <H>{heading}</H>
      {message && <p>{message}</p>}
      {action}
      {reference && <p className={styles.reference}>Reference: {reference}</p>}
    </section>
  );
}
