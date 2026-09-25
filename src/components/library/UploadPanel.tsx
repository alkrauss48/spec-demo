'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { reportClientError } from '@/components/ui/ErrorReporter';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import styles from './UploadPanel.module.css';

const INPUT_ID = 'add-photos-input';
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const CONCURRENCY = 3;

type Outcome =
  | { kind: 'added' }
  | { kind: 'duplicate'; name: string }
  | { kind: 'rejected'; name: string; message: string };

type Run = { total: number; done: number; outcomes: Outcome[]; finished: boolean };

async function uploadOne(file: File, timezone: string): Promise<Outcome> {
  if (file.size > MAX_FILE_BYTES) {
    // The server enforces this too; checking here saves sending up to 50 MB for nothing.
    return {
      kind: 'rejected',
      name: file.name,
      message: `${file.name} is larger than the 50 MB limit.`,
    };
  }
  const body = new FormData();
  body.append('file', file);
  body.append('timezone', timezone);
  let res: Response;
  try {
    res = await fetch('/api/photos', { method: 'POST', body });
  } catch {
    return {
      kind: 'rejected',
      name: file.name,
      message: `${file.name} couldn't be uploaded. Check your connection and try again.`,
    };
  }
  if (res.status === 201) return { kind: 'added' };
  let error: { code?: string; message?: string } = {};
  try {
    error = (await res.json()) as typeof error;
  } catch {
    // Not JSON: fall through to the generic message.
  }
  if (error.code === 'DUPLICATE') return { kind: 'duplicate', name: file.name };
  if (res.status >= 500) {
    reportClientError({
      message: `Upload failed with ${res.status}`,
      route: '/',
      requestId: res.headers.get('x-request-id') ?? undefined,
    });
  }
  return {
    kind: 'rejected',
    name: file.name,
    message:
      error.message ?? `${file.name} couldn't be uploaded. Check your connection and try again.`,
  };
}

/** The Add photos button, file picker, progress, and completion summary (FR-007, R11). */
export function UploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [run, setRun] = useState<Run | null>(null);
  const busy = run !== null && !run.finished;
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []); // hydrated: the picker's handlers are attached

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = ''; // so the same file can be picked again
    if (files.length === 0) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const outcomes: Outcome[] = new Array(files.length);
    let done = 0;
    setRun({ total: files.length, done: 0, outcomes: [], finished: false });

    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const index = next++;
        try {
          outcomes[index] = await uploadOne(files[index]!, timezone);
        } catch (err) {
          reportClientError({
            message: err instanceof Error ? err.message : 'Upload error',
            route: '/',
          });
          outcomes[index] = {
            kind: 'rejected',
            name: files[index]!.name,
            message: `${files[index]!.name} couldn't be uploaded. Check your connection and try again.`,
          };
        }
        done++;
        setRun({ total: files.length, done, outcomes: [], finished: false });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
    setRun({ total: files.length, done, outcomes, finished: true });
    router.refresh();
  }

  const added = run?.outcomes.filter((o) => o.kind === 'added').length ?? 0;
  const duplicates = run?.outcomes.filter((o) => o.kind === 'duplicate') ?? [];
  const rejected = run?.outcomes.filter((o) => o.kind === 'rejected') ?? [];

  const summary = `Added ${added} · Skipped as duplicate ${duplicates.length} · Rejected ${rejected.length}`;

  return (
    <div className={styles.root} data-upload-ready={ready || undefined}>
      <div className={styles.controls}>
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          Add photos
        </Button>
        <input
          ref={inputRef}
          id={INPUT_ID}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => void onFiles(e.currentTarget.files)}
        />
      </div>
      {/* Always present, so screen readers announce changes to it. */}
      <VisuallyHidden>
        <span role="status" aria-live="polite">
          {run && !run.finished && `${run.done} of ${run.total} processed`}
          {run?.finished && summary}
        </span>
      </VisuallyHidden>
      {run && (
        <div className={styles.panel}>
          {!run.finished && <ProgressBar value={run.done} max={run.total} />}
          {run.finished && (
            <p className={styles.summary} data-testid="upload-summary">
              {summary}
            </p>
          )}
          {run.finished && duplicates.length + rejected.length > 0 && (
            <ul className={styles.problems} data-testid="upload-problems">
              {duplicates.map((o, i) => (
                <li key={`d${i}`}>Skipped as duplicate: {o.name}</li>
              ))}
              {rejected.map((o, i) => (
                <li key={`r${i}`}>{o.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** A second Add photos button, for the empty state, that opens the same picker. */
export function AddPhotosButton() {
  return <Button onClick={() => document.getElementById(INPUT_ID)?.click()}>Add photos</Button>;
}
