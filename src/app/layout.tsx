import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorReporter } from '@/components/ui/ErrorReporter';
import { getAuth } from '@/server/auth';
import '@/styles/tokens.css';

export const metadata: Metadata = {
  title: { template: '%s · Photos', default: 'Photos' },
};

async function signOut() {
  'use server';
  await getAuth().api.signOut({ headers: await headers() });
  redirect('/sign-in');
}

async function isSignedIn(): Promise<boolean> {
  try {
    return (await getAuth().api.getSession({ headers: await headers() })) !== null;
  } catch {
    return false;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const signedIn = await isSignedIn();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <span className="site-name">Photos</span>
          {signedIn && (
            <form action={signOut}>
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          )}
        </header>
        {children}
        <ErrorReporter />
      </body>
    </html>
  );
}
