'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ViewerLinks } from './PhotoViewer';

const MIN_SWIPE_PX = 50;

/** ← / → / Esc, and horizontal swipes, for the photo viewer (FR-013, R13). */
export function ViewerKeys({ links }: { links: ViewerLinks }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const go = (href: string | null) => {
      if (href) router.push(href);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft') go(links.prev);
      else if (e.key === 'ArrowRight') go(links.next);
      else if (e.key === 'Escape') go(links.close);
    };

    let start: { x: number; y: number } | null = null;
    const point = (e: TouchEvent) => e.changedTouches?.[0];
    const onTouchStart = (e: TouchEvent) => {
      const t = point(e);
      start = t ? { x: t.clientX, y: t.clientY } : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = point(e);
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      start = null;
      if (Math.abs(dx) >= MIN_SWIPE_PX && Math.abs(dx) > Math.abs(dy))
        go(dx < 0 ? links.next : links.prev);
    };

    window.addEventListener('keydown', onKey);
    setReady(true);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [links, router]);

  // Marks when the key and swipe handlers are live (tests wait for it after navigating).
  return ready ? <span hidden data-viewer-keys="" /> : null;
}
