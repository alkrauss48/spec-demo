import { signOut } from '@/app/sign-in/actions';
import { Button } from './Button';

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="secondary">
        Sign out
      </Button>
    </form>
  );
}
