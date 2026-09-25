'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authErrorCode, getAuth } from '@/server/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export async function signUp(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!EMAIL_RE.test(email)) redirect('/sign-up?error=email');
  if (password.length < MIN_PASSWORD) redirect('/sign-up?error=password');

  let error: string | undefined;
  try {
    await getAuth().api.signUpEmail({
      body: { email, password, name: email.split('@')[0] ?? 'user' },
      headers: await headers(),
    });
  } catch (err) {
    error = authErrorCode(err);
  }
  redirect(error ? `/sign-up?error=${error}` : '/');
}
