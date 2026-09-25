import type { Metadata } from 'next';
import { SignOutButton } from '@/components/ui/SignOutButton';
import { SiteHeader } from '@/components/ui/SiteHeader';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { PhotoViewer, viewerLinks } from '@/components/album/PhotoViewer';
import { ViewerKeys } from '@/components/album/ViewerKeys';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { albumLabel, isIsoDate } from '@/lib/dates';
import { NotAuthenticated, requireUser } from '@/server/auth';
import { log, requestIdFrom, withRequestContext } from '@/server/log';
import { PHOTO_ID_RE } from '@/server/photos/ids';
import { getPhotoInAlbum, maybeDelayForTest } from '@/server/photos/queries';

type Params = { params: Promise<{ date: string; photoId: string }> };

const heading = (n: number, total: number, date: string) =>
  `Photo ${n} of ${total}, ${albumLabel(date)}`;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { date, photoId } = await params;
  if (!isIsoDate(date) || !PHOTO_ID_RE.test(photoId)) return { title: 'Not found' };
  try {
    const user = await requireUser();
    const photo = getPhotoInAlbum(user.id, date, photoId);
    return { title: photo ? heading(photo.n, photo.total, date) : 'Not found' };
  } catch {
    return { title: 'Photo' };
  }
}

export default async function PhotoPage({ params }: Params) {
  const start = performance.now();
  const { date, photoId } = await params;
  const reqHeaders = await headers();
  return withRequestContext(requestIdFrom(reqHeaders), async () => {
    let user: { id: string };
    try {
      user = await requireUser(reqHeaders);
    } catch (err) {
      if (err instanceof NotAuthenticated) {
        redirect(`/sign-in?next=${encodeURIComponent(`/albums/${date}/photos/${photoId}`)}`);
      }
      throw err;
    }
    if (!isIsoDate(date) || !PHOTO_ID_RE.test(photoId)) notFound();
    await maybeDelayForTest(reqHeaders);

    // Missing, another user's, and another album's photos are all "not found" (FR-014).
    const photo = getPhotoInAlbum(user.id, date, photoId);
    if (!photo) notFound();
    log.info('photo.render', {
      userId: user.id,
      photoId,
      duration_ms: Math.round(performance.now() - start),
    });
    const links = viewerLinks(date, photo);

    return (
      <>
        <SiteHeader>
          <SignOutButton />
        </SiteHeader>
        <main id="main" className="page">
          <VisuallyHidden as="h1">{heading(photo.n, photo.total, date)}</VisuallyHidden>
          <PhotoViewer photo={photo} links={links} />
          <ViewerKeys links={links} />
        </main>
      </>
    );
  });
}
