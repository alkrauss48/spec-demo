import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ErrorReporter } from '@/components/ui/ErrorReporter';
import '@/styles/tokens.css';

export const metadata: Metadata = {
  title: { template: '%s · Photos', default: 'Photos' },
};

// No session lookup here. Under a loading.tsx boundary, a dynamic call in the root layout
// could be left unresolved during router.refresh(), so the refreshed page never committed.
// Pages render the header (with Sign out) themselves, after requireUser().
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        {children}
        <ErrorReporter />
      </body>
    </html>
  );
}
