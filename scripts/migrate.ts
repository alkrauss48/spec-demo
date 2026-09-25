import { getMigrations } from 'better-auth/db/migration';
import { getAuth } from '../src/server/auth';
import { runMigrations } from '../src/server/db';

/** Better Auth's tables first (photo.user_id references user.id), then ours. */
export async function migrate(): Promise<void> {
  const { runMigrations: runAuthMigrations } = await getMigrations(getAuth().options);
  await runAuthMigrations();
  runMigrations();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(
    () => console.log('Migrations applied'),
    (err: unknown) => {
      console.error(err);
      process.exit(1);
    },
  );
}
