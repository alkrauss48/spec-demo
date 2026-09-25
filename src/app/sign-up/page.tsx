import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { signUp } from './actions';
import { SiteHeader } from '@/components/ui/SiteHeader';

export const metadata: Metadata = { title: 'Create an account' };

const ERRORS: Record<string, { field: 'email' | 'password'; message: string }> = {
  email: { field: 'email', message: 'Enter an email address like name@example.com.' },
  password: { field: 'password', message: 'Use a password of at least 8 characters.' },
  taken: { field: 'email', message: 'That email can’t be used. Try signing in instead.' },
  busy: { field: 'password', message: 'Too many attempts. Wait a moment, then try again.' },
  failed: { field: 'password', message: 'Your account couldn’t be created. Please try again.' },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const problem = error ? ERRORS[error] : undefined;
  const errorFor = (field: 'email' | 'password') =>
    problem?.field === field ? problem.message : undefined;

  return (
    <>
      <SiteHeader />
      <main id="main" className="auth">
        <h1>Create an account</h1>
        <form action={signUp} className="form" noValidate>
          <Field
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            error={errorFor('email')}
          />
          <Field
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters."
            error={errorFor('password')}
          />
          <Button type="submit">Create account</Button>
        </form>
        <p>
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </main>
    </>
  );
}

function Field(props: {
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  error?: string;
  hint?: string;
}) {
  const { name, label, type, autoComplete, error, hint } = props;
  const describedBy = [hint && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(' ');
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {hint && (
        <p id={`${name}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {error && (
        <p id={`${name}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
