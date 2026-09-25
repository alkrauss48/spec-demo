import type { Metadata } from 'next';
import { SignOutButton } from '@/components/ui/SignOutButton';
import { SiteHeader } from '@/components/ui/SiteHeader';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FocusFromHash } from '@/components/album/FocusFromHash';
import { PhotoGrid } from '@/components/album/PhotoGrid';
import { albumLabel, isIsoDate, photoCountLabel } from '@/lib/dates';
import { NotAuthenticated, requireUser } from '@/server/auth';
import { log, requestIdFrom, withRequestContext } from '@/server/log';
import { getAlbumPhotos, maybeDelayForTest } from '@/server/photos/queries';

type Params = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { date } = await params;
  return { title: isIsoDate(date) ? albumLabel(date) : 'Not found' };
}

export default async function AlbumPage({ params }: Params) {
  const start = performance.now();
  const { date } = await params;
  const reqHeaders = await headers();
  return withRequestContext(requestIdFrom(reqHeaders), async () => {
    let user: { id: string };
    try {
      user = await requireUser(reqHeaders);
    } catch (err) {
      if (err instanceof NotAuthenticated)
        redirect(`/sign-in?next=${encodeURIComponent(`/albums/${date}`)}`);
      throw err;
    }
    if (!isIsoDate(date)) notFound();
    await maybeDelayForTest(reqHeaders);

    // An album exists only while it has photos, so an empty result is "not found" (FR-016).
    const photos = getAlbumPhotos(user.id, date);
    if (photos.length === 0) notFound();
    log.info('album.render', {
      userId: user.id,
      duration_ms: Math.round(performance.now() - start),
    });

    return (
      <>
        <SiteHeader>
          <SignOutButton />
        </SiteHeader>
        <main id="main" className="page">
          <Link href="/" className="back-link">
            ← All photos
          </Link>
          <h1>
            {albumLabel(date)} <span className="usage">· {photoCountLabel(photos.length)}</span>
          </h1>
          <PhotoGrid date={date} photos={photos} />
          <FocusFromHash />
        </main>
      </>
    );
  });
}
