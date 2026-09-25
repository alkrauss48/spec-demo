'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  loading?: 'eager' | 'lazy';
  className?: string;
  /** Accessible text for the placeholder when the image fails; defaults to `alt`. */
  fallbackLabel?: string;
};

/** An `<img>` that swaps in a same-size neutral placeholder if it fails to load. */
export function SafeImage({ src, alt, width, height, loading, className, fallbackLabel }: Props) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // A server-rendered image can fail before React hydrates and attaches onError.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);
  if (failed) {
    const label = fallbackLabel ?? alt;
    return (
      <div
        className={className}
        data-image-failed=""
        style={{ aspectRatio: `${width} / ${height}`, background: 'var(--color-placeholder)' }}
        {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      >
        {fallbackLabel && (
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              height: '100%',
              padding: 'var(--space-3)',
              textAlign: 'center',
              color: 'var(--color-text)',
            }}
          >
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- R9: plain <img>, not next/image
    <img
      ref={ref}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
