import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { signIn } from './actions';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, { field: 'email' | 'password'; message: string }> = {
  email: { field: 'email', message: 'Enter your email address.' },
  password: { field: 'password', message: 'Enter your password.' },
  invalid: { field: 'password', message: 'That email and password don’t match an account.' },
  busy: { field: 'password', message: 'Too many attempts. Wait a moment, then try again.' },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const problem = error ? ERRORS[error] : undefined;
  const errorFor = (field: 'email' | 'password') =>
    problem?.field === field ? problem.message : undefined;

  return (
    <main id="main" className="auth">
      <h1>Sign in</h1>
      <form action={signIn} className="form" noValidate>
        <input type="hidden" name="next" value={next ?? '/'} />
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
          autoComplete="current-password"
          error={errorFor('password')}
        />
        <Button type="submit">Sign in</Button>
      </form>
      <p>
        New here? <Link href="/sign-up">Create an account</Link>
      </p>
    </main>
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
