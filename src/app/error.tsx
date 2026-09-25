'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { reportClientError, routePattern } from '@/components/ui/ErrorReporter';
import { SiteHeader } from '@/components/ui/SiteHeader';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    reportClientError({
      message: error.message || 'Render error',
      stack: error.stack,
      route: routePattern(pathname),
      requestId: error.digest,
    });
  }, [error, pathname]);

  return (
    <>
      <SiteHeader />
      <main id="main" className="page">
        <ErrorState
          heading="We couldn't load your photos."
          message="Something went wrong on our side. Please try again."
          reference={error.digest}
          action={
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  reset();
                  router.refresh();
                })
              }
            >
              Try again
            </Button>
          }
        />
      </main>
    </>
  );
}
