// Date labels and local-time helpers. Every function works on plain `YYYY-MM-DD` /
// `YYYY-MM-DDTHH:mm:ss` strings and never uses the viewer's time zone, so a photo taken at
// 11:30 PM stays on its own day wherever it is viewed (FR-004, R7).

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const PHOTO_LIMIT = 1000;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Strict `YYYY-MM-DD` that is also a real calendar date. */
export function isIsoDate(s: string): boolean {
  const m = ISO_DATE_RE.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** `2026-03-14` → `Mar 14, 2026` */
export function albumLabel(date: string): string {
  const [y, m, d] = date.split('-');
  return `${SHORT_MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

/** `2026-03` → `March 2026` */
export function groupLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  return `${LONG_MONTHS[Number(m) - 1]} ${y}`;
}

/** `2026-03-14T23:30:05` → `11:30 PM` */
export function timeLabel(captureTime: string): string {
  const [hh, mm] = captureTime.slice(11, 16).split(':');
  const hour = Number(hh);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${mm} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** `2026-03-14T23:30:05` → `Mar 14, 2026, 11:30 PM` */
export function dateTimeLabel(captureTime: string): string {
  return `${albumLabel(captureTime.slice(0, 10))}, ${timeLabel(captureTime)}`;
}

export function photoCountLabel(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'photo' : 'photos'}`;
}

export function usageLabel(n: number): string {
  return `${n.toLocaleString('en-US')} of ${PHOTO_LIMIT.toLocaleString('en-US')} photos`;
}

/** The current local wall-clock time in an IANA zone, as `YYYY-MM-DDTHH:mm:ss`. */
export function nowInZone(ianaZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}
