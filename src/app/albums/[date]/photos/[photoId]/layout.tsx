import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireUser } from '@/server/auth';
import { PHOTO_ID_RE } from '@/server/photos/ids';
import { getPhotoInAlbum } from '@/server/photos/queries';

/** Same as the album layout: a missing, other user's, or other album's photo is a real 404. */
export default async function PhotoLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ date: string; photoId: string }>;
}) {
  const { date, photoId } = await params;
  const user = await requireUser(); // the album layout has already redirected signed-out visitors
  if (!PHOTO_ID_RE.test(photoId) || !getPhotoInAlbum(user.id, date, photoId)) notFound();
  return children;
}
