'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authErrorCode, getAuth } from '@/server/auth';

/** Only same-origin relative paths; rejects absolute URLs and `//host` or `/\host` tricks. */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value.startsWith('/sign-in') || value.startsWith('/sign-up')) return '/';
  return value;
}

export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));
  const back = (error: string) =>
    `/sign-in?error=${error}${next === '/' ? '' : `&next=${encodeURIComponent(next)}`}`;

  if (!email) redirect(back('email'));
  if (!password) redirect(back('password'));

  let error: string | undefined;
  try {
    await getAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (err) {
    // Wrong email and wrong password look the same, so accounts can't be probed.
    error = authErrorCode(err) === 'busy' ? 'busy' : 'invalid';
  }
  redirect(error ? back(error) : next);
}

export async function signOut(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect('/sign-in');
}
