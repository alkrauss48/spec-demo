/**
 * Fails if the captured server log (test-results/server.log, written by the Playwright web
 * server in T005) has a malformed JSON log line or anything personal in it (FR-015, R16).
 *
 *   npm run test:log-privacy
 */
import { readFileSync } from 'node:fs';
import { MANIFEST } from '../tests/fixtures/photos/generate';

const LOG = process.argv[2] ?? 'test-results/server.log';

type Problem = { line: number; why: string };

export function checkLog(text: string): Problem[] {
  const problems: Problem[] = [];
  const fileNames = Object.keys(MANIFEST);
  const values = [...new Set(Object.values(MANIFEST).flatMap((e) => e.forbidden ?? []))];
  const dates = [
    ...new Set(Object.values(MANIFEST).flatMap((e) => (e.capture_date ? [e.capture_date] : []))),
  ];
  // Things that look personal whatever the source: an email address or a session token.
  const patterns: [RegExp, string][] = [
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, 'an email address'],
    [/session_token/i, 'a session token'],
    [/"(?:token|password|secret)"\s*:/i, 'a credential field'],
    [/-?\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/, 'GPS coordinates'],
  ];

  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const n = i + 1;
    // Our own log lines are JSON; Next.js startup and build output is plain text.
    if (line.startsWith('{')) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        for (const key of ['level', 'ts', 'requestId', 'event']) {
          if (!(key in entry)) problems.push({ line: n, why: `JSON log line without "${key}"` });
        }
      } catch {
        problems.push({ line: n, why: 'malformed JSON log line' });
      }
    }
    for (const name of fileNames)
      if (line.includes(name)) problems.push({ line: n, why: `fixture file name ${name}` });
    for (const value of values)
      if (line.includes(value)) problems.push({ line: n, why: `EXIF value "${value}"` });
    for (const date of dates)
      if (line.includes(date)) problems.push({ line: n, why: `capture date ${date}` });
    for (const [re, why] of patterns) if (re.test(line)) problems.push({ line: n, why });
  });
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let text: string;
  try {
    text = readFileSync(LOG, 'utf8');
  } catch {
    console.error(`No log at ${LOG}. Run npm run test:e2e first.`);
    process.exit(1);
  }
  const problems = checkLog(text);
  const jsonLines = text.split('\n').filter((l) => l.trim().startsWith('{')).length;
  if (problems.length > 0) {
    for (const p of problems.slice(0, 50)) console.error(`${LOG}:${p.line}: ${p.why}`);
    console.error(`${problems.length} problem(s) in ${jsonLines} log lines`);
    process.exit(1);
  }
  if (jsonLines === 0) {
    console.error(`${LOG} has no JSON log lines; nothing was checked`);
    process.exit(1);
  }
  console.log(`OK: ${jsonLines} log lines, no personal data`);
}
