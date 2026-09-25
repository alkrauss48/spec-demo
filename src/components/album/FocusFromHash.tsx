'use client';

import { useEffect } from 'react';

const HASH_RE = /^#photo-[A-Za-z0-9_-]{22}$/;

/** Moves focus to the thumbnail named in the URL fragment, so closing the viewer returns there (US3-AS3). */
export function FocusFromHash() {
  useEffect(() => {
    const focusFromHash = () => {
      if (!HASH_RE.test(location.hash)) return;
      const link = document.getElementById(location.hash.slice(1));
      if (!link) return;
      link.scrollIntoView({ block: 'center' });
      link.focus();
    };
    focusFromHash();
    window.addEventListener('hashchange', focusFromHash);
    return () => window.removeEventListener('hashchange', focusFromHash);
  }, []);
  return null;
}
