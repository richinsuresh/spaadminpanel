// src/lib/dateTime.ts
//
// Centralized, timezone-safe date/time helpers for India Standard Time (IST).
//
// WHY THIS FILE EXISTS:
// `new Date().toISOString().split('T')[0]` is used all over this codebase to
// get "today's date", but `.toISOString()` always converts to UTC. Since IST
// is UTC+5:30, anything that happens between 12:00 AM and 5:29 AM IST gets
// its calendar date computed as the PREVIOUS day (UTC hasn't rolled over
// yet), silently filing that session/sale/package under the wrong date.
//
// This file is safe to import from BOTH client components ('use client')
// and server code (API routes running on Vercel, which default to UTC) —
// getISTDateString() explicitly cancels out whatever timezone the runtime
// happens to be in before applying the IST offset, so it gives the same
// correct answer everywhere.

const IST_OFFSET_MINUTES = 5.5 * 60;
export const IST_TIME_ZONE = 'Asia/Kolkata';

/**
 * Returns the IST calendar date (YYYY-MM-DD) for a given moment, or for
 * right now if no date is passed. Use this anywhere you'd otherwise write
 * `new Date().toISOString().split('T')[0]`.
 */
export const getISTDateString = (date?: Date | string | null): string => {
  const now = date ? (typeof date === 'string' ? new Date(date) : date) : new Date();
  if (isNaN(now.getTime())) return '';
  const localOffset = now.getTimezoneOffset(); // 0 on Vercel/UTC servers, varies in-browser
  const istTime = new Date(now.getTime() + (IST_OFFSET_MINUTES + localOffset) * 60 * 1000);
  return istTime.toISOString().split('T')[0];
};

/** Today's date in IST, as YYYY-MM-DD. */
export const getISTToday = (): string => getISTDateString();

/** Formats a timestamp as an IST time, e.g. "08:17 PM". Always IST regardless of viewer's device timezone. */
export const formatISTTime = (d: string | Date | null | undefined): string => {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: IST_TIME_ZONE,
  });
};

/** Formats a timestamp as a short IST date + time, e.g. "13 Aug, 08:17 PM". */
export const formatISTDateTime = (d: string | Date | null | undefined): string => {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: IST_TIME_ZONE,
  });
};

/** Formats a timestamp as an IST date only, e.g. "13 Aug 2026". */
export const formatISTDate = (d: string | Date | null | undefined): string => {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: IST_TIME_ZONE,
  });
};

/**
 * Adds N months to a date and returns the result as an IST calendar date
 * string (YYYY-MM-DD). Use this instead of `.toISOString().split('T')[0]`
 * after doing month/day arithmetic on a Date object.
 */
export const addMonthsAsISTDateString = (base: Date, months: number): string => {
  const result = new Date(base.getTime());
  result.setMonth(result.getMonth() + months);
  return getISTDateString(result);
};
