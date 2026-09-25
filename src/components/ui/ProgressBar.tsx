import { useId } from 'react';

/** A native `<progress>` with a visible "X of N processed" label. */
export function ProgressBar({ value, max }: { value: number; max: number }) {
  const id = useId();
  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <span id={id}>
        {value} of {max} processed
      </span>
      <progress aria-labelledby={id} value={value} max={max} style={{ width: '100%' }} />
    </div>
  );
}
