import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every test file gets its own throwaway database and media directory.
const dir = mkdtempSync(join(tmpdir(), 'photos-test-'));
process.env.DATABASE_PATH = join(dir, 'app.db');
process.env.MEDIA_ROOT = join(dir, 'media');
process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-000';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
