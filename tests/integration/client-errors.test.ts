import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/client-errors/route';
import { authedRequest, createUser, freshDb, type TestUser } from './helpers';

let user: TestUser;

beforeAll(async () => {
  await freshDb();
  user = await createUser();
});

afterEach(() => vi.restoreAllMocks());

function captureLogs() {
  const lines: Record<string, unknown>[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
    return true;
  });
  return lines;
}

const post = (body: unknown, cookie?: string) =>
  POST(authedRequest('/api/client-errors', { method: 'POST', body, cookie }));

test('401 without a session', async () => {
  expect((await post({ message: 'x', route: '/' })).status).toBe(401);
});

test('400 on extra properties, missing fields, or over-long values', async () => {
  expect((await post({ message: 'x', route: '/', extra: 1 }, user.cookie)).status).toBe(400);
  expect((await post({ message: 'x' }, user.cookie)).status).toBe(400);
  expect((await post({ message: 'x'.repeat(501), route: '/' }, user.cookie)).status).toBe(400);
  expect((await post({ message: 'x', route: '/', stack: 5 }, user.cookie)).status).toBe(400);
  expect((await post('not an object', user.cookie)).status).toBe(400);
});

test('204 on a valid body, logged as client.error without query strings', async () => {
  const lines = captureLogs();
  const res = await post(
    {
      message: 'Failed to fetch https://app.test/albums/2026-03-14?token=secret',
      route: '/albums/[date]',
      stack: 'Error: boom\n    at https://app.test/_next/chunk.js?v=123:1:2',
    },
    user.cookie,
  );
  expect(res.status).toBe(204);
  const line = lines.find((l) => l.event === 'client.error');
  expect(line).toBeDefined();
  expect(JSON.stringify(line)).not.toContain('token=secret');
  expect(JSON.stringify(line)).not.toContain('?v=123');
  expect(line).toMatchObject({ level: 'warn', route: '/albums/[date]', userId: user.id });
});

test('the 21st report in a minute is accepted but not logged', async () => {
  const fresh = await createUser();
  const lines = captureLogs();
  for (let i = 0; i < 20; i++) {
    expect((await post({ message: `e${i}`, route: '/' }, fresh.cookie)).status).toBe(204);
  }
  expect(lines.filter((l) => l.event === 'client.error')).toHaveLength(20);
  expect((await post({ message: 'e21', route: '/' }, fresh.cookie)).status).toBe(204);
  expect(lines.filter((l) => l.event === 'client.error')).toHaveLength(20);
});
