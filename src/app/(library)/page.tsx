import type { Metadata } from 'next';
import { SignOutButton } from '@/components/ui/SignOutButton';
import { SiteHeader } from '@/components/ui/SiteHeader';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { DateGroup } from '@/components/library/DateGroup';
import { AddPhotosButton, UploadPanel } from '@/components/library/UploadPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { PHOTO_LIMIT, usageLabel } from '@/lib/dates';
import { NotAuthenticated, requireUser } from '@/server/auth';
import { log, requestIdFrom, withRequestContext } from '@/server/log';
import { getLibraryGroups, getUsage, maybeDelayForTest } from '@/server/photos/queries';

export const metadata: Metadata = { title: 'Your photos' };

export default async function LibraryPage() {
  const start = performance.now();
  const reqHeaders = await headers();
  return withRequestContext(requestIdFrom(reqHeaders), async () => {
    let user: { id: string };
    try {
      user = await requireUser(reqHeaders);
    } catch (err) {
      if (err instanceof NotAuthenticated) redirect('/sign-in?next=/');
      throw err;
    }
    await maybeDelayForTest(reqHeaders);

    const { photoCount } = getUsage(user.id);
    const groups = getLibraryGroups(user.id);
    const albumCount = groups.reduce((n, g) => n + g.albums.length, 0);
    log.info('library.render', {
      userId: user.id,
      album_count: albumCount,
      duration_ms: Math.round(performance.now() - start),
    });

    return (
      <>
        <SiteHeader>
          <SignOutButton />
        </SiteHeader>
        <main id="main" className="page">
          <div className="library-header">
            <div>
              <h1>Your photos</h1>
              <p className="usage" data-limit-reached={photoCount >= PHOTO_LIMIT}>
                {usageLabel(photoCount)}
              </p>
            </div>
            <UploadPanel />
          </div>
          {photoCount === 0 ? (
            <EmptyState heading="No photos yet" action={<AddPhotosButton />}>
              Add photos from your device. Each one is placed in an album for the day it was taken.
            </EmptyState>
          ) : (
            groups.map((group, i) => (
              <DateGroup key={group.yearMonth} group={group} eager={i === 0} />
            ))
          )}
        </main>
      </>
    );
  });
}
