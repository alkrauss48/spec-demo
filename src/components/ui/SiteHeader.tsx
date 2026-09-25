import type { ReactNode } from 'react';

/**
 * The site header. Signed-in pages pass a Sign out control; the auth, loading, and error
 * views render it without one. It lives in each page rather than the root layout, so the
 * layout never waits on the session (see layout.tsx).
 */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="site-header">
      <span className="site-name">Photos</span>
      {children}
    </header>
  );
}
