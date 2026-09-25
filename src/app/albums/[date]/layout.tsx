import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { isIsoDate } from '@/lib/dates';
import { NotAuthenticated, requireUser } from '@/server/auth';
import { albumExists } from '@/server/photos/queries';

/**
 * Checks that the album exists for this user before anything streams. It sits outside the
 * segment's loading.tsx boundary, so a missing or someone else's album gets a real 404 status
 * rather than a 200 with the not-found page (FR-014, FR-016).
 */
export default async function AlbumLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  let user: { id: string };
  try {
    user = await requireUser();
  } catch (err) {
    if (err instanceof NotAuthenticated)
      redirect(`/sign-in?next=${encodeURIComponent(`/albums/${date}`)}`);
    throw err;
  }
  if (!isIsoDate(date) || !albumExists(user.id, date)) notFound();
  return children;
}
