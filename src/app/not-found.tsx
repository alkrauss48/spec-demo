import Link from 'next/link';
import type { Metadata } from 'next';
import { ErrorState } from '@/components/ui/ErrorState';

export const metadata: Metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <main id="main" className="page">
      <ErrorState
        heading="That page couldn't be found."
        message="It may not exist, or it isn't part of your library."
        action={<Link href="/">Back to your photos</Link>}
      />
    </main>
  );
}
