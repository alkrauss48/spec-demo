'use client';

import { useEffect } from 'react';

type Report = { message: string; stack?: string; route: string; requestId?: string };

/** Turns a concrete path into its route pattern so no dates or IDs are reported. */
export function routePattern(pathname: string): string {
  if (/^\/albums\/[^/]+\/photos\/[^/]+/.test(pathname)) return '/albums/[date]/photos/[photoId]';
  if (/^\/albums\/[^/]+/.test(pathname)) return '/albums/[date]';
  if (pathname === '/' || pathname === '/sign-in' || pathname === '/sign-up') return pathname;
  return '[other]';
}

export function reportClientError(report: Report): void {
  try {
    const body = JSON.stringify({
      message: report.message.slice(0, 500),
      route: report.route.slice(0, 200),
      ...(report.stack ? { stack: report.stack.slice(0, 4000) } : {}),
      ...(report.requestId ? { requestId: report.requestId.slice(0, 64) } : {}),
    });
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never throw.
  }
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError({
        message: event.message || 'Unknown error',
        stack: event.error instanceof Error ? event.error.stack : undefined,
        route: routePattern(location.pathname),
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportClientError({
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        route: routePattern(location.pathname),
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
