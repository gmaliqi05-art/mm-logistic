/**
 * §16 ArbZG / §17 MiLoG working-time record builder.
 *
 * Both laws require the employer to keep a per-employee per-day record
 * of working hours that can be handed to the supervisory authority
 * (Gewerbeaufsicht / Zollverwaltung) on request:
 *
 *   §16(2) ArbZG — records of any work that exceeds 8h/day must be
 *                  kept for at least 2 years and "made available" to
 *                  the supervisory authority.
 *   §17(1) MiLoG — Beginn, Ende and Dauer of daily work time must be
 *                  recorded within 7 days; kept for at least 2 years.
 *                  Penalties under §21 MiLoG reach €30,000 per
 *                  violation.
 *
 * The laws do not mandate a specific file format — they require that
 * the records are "in writing" (Schriftform) and producible on
 * request. A CSV with one row per employee per day, including the
 * fields below, satisfies both audits in every German tax adviser
 * template we surveyed:
 *
 *   Datum         — ISO date (YYYY-MM-DD)
 *   Wochentag     — weekday name in German (the audit is German)
 *   Mitarbeiter   — full name
 *   Mitarbeiter-ID — uuid, so the row remains identifiable if the
 *                    name changes (married names, anonymisation, ...).
 *   Beginn        — HH:MM
 *   Ende          — HH:MM
 *   Pause (min)   — break minutes
 *   Arbeitszeit (h) — total worked hours (net of break)
 *   Mehrarbeit (h) — overtime hours above STANDARD_HOURS
 *   Sonn-/Feiertag — Ja/Nein (§9 ArbZG flag — sets the row apart
 *                    when the authority spot-checks §11(3))
 *   Notiz         — admin note (free text)
 *
 * Output is RFC 4180 CSV: header row, CRLF line terminators, fields
 * containing commas / quotes / newlines are double-quoted and inner
 * quotes are doubled. Comma is the separator because that matches the
 * existing exportCSV() in HRWorkHours.tsx and is unambiguous in
 * Excel/LibreOffice when opened via the "from text" wizard.
 *
 * This module is intentionally pure — no DB, no React, no i18n.
 * Callers pull the rows and pass them to buildArbzg16Csv().
 */

const WEEKDAY_DE = [
  'Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag',
];

export interface Arbzg16Row {
  /** Naked DATE (YYYY-MM-DD). */
  date: string;
  /** Employee display name. */
  userName: string;
  /** Employee uuid — preserves identity if the name changes. */
  userId: string;
  /** HH:MM:SS or HH:MM. */
  startTime: string | null;
  /** HH:MM:SS or HH:MM. */
  endTime: string | null;
  /** Break minutes recorded for the day. */
  breakMinutes: number;
  /** Worked hours (net of break). */
  totalHours: number;
  /** Overtime hours above the standard day. */
  overtimeHours: number;
  /** True when the row falls on Sunday or matches a public_holidays row. */
  sundayOrHoliday: boolean;
  /** Admin note (free text). */
  notes: string | null;
}

/** RFC 4180-safe CSV field escaping. */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.length === 0) return '';
  // Quote when the field contains the separator, a quote, CR, or LF.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function trimTimeToHM(t: string | null): string {
  if (!t) return '';
  return t.slice(0, 5);
}

/**
 * Builds the §16 ArbZG / §17 MiLoG-compliant CSV from a list of rows.
 * Caller is responsible for sorting the rows in the order they want
 * the auditor to see them (typically date ASC, then userName ASC).
 *
 * Header row is in German because the audience is the German
 * supervisory authority. The fact-finding interface in mm-logistic
 * is multilingual; the export is not.
 */
export function buildArbzg16Csv(rows: ReadonlyArray<Arbzg16Row>): string {
  const headers = [
    'Datum',
    'Wochentag',
    'Mitarbeiter',
    'Mitarbeiter-ID',
    'Beginn',
    'Ende',
    'Pause (min)',
    'Arbeitszeit (h)',
    'Mehrarbeit (h)',
    'Sonn-/Feiertag',
    'Notiz',
  ];

  const lines: string[] = [headers.join(',')];
  for (const r of rows) {
    const weekdayIdx = (() => {
      const d = new Date(`${r.date}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return -1;
      return d.getUTCDay();
    })();
    const weekday = weekdayIdx >= 0 ? WEEKDAY_DE[weekdayIdx] : '';
    lines.push([
      escapeCsvField(r.date),
      escapeCsvField(weekday),
      escapeCsvField(r.userName),
      escapeCsvField(r.userId),
      escapeCsvField(trimTimeToHM(r.startTime)),
      escapeCsvField(trimTimeToHM(r.endTime)),
      escapeCsvField(r.breakMinutes),
      escapeCsvField(r.totalHours.toFixed(2)),
      escapeCsvField(r.overtimeHours.toFixed(2)),
      escapeCsvField(r.sundayOrHoliday ? 'Ja' : 'Nein'),
      escapeCsvField(r.notes ?? ''),
    ].join(','));
  }
  // RFC 4180 — CRLF line endings. Excel imports them cleanly on every
  // OS; \n alone causes Windows Excel to merge rows.
  return lines.join('\r\n') + '\r\n';
}

export interface BurlGRow {
  userName: string;
  userId: string;
  leaveTypeName: string;
  year: number;
  allocatedDays: number;
  carriedOverDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
}

/**
 * §15 BUrlG documentation: per-employee per-leave-type yearly
 * statement. The law requires the employer to keep a record of leave
 * entitlement granted, leave taken and leave remaining — the format
 * is not fixed but a per-year summary CSV is the canonical template.
 *
 * Same RFC 4180 convention as buildArbzg16Csv. German header for
 * the German audience.
 */
export function buildBurlGCsv(rows: ReadonlyArray<BurlGRow>): string {
  const headers = [
    'Jahr',
    'Mitarbeiter',
    'Mitarbeiter-ID',
    'Urlaubsart',
    'Anspruch',
    'Übertrag (Vorjahr)',
    'Genommen',
    'Beantragt',
    'Verbleibend',
  ];
  const lines: string[] = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      escapeCsvField(r.year),
      escapeCsvField(r.userName),
      escapeCsvField(r.userId),
      escapeCsvField(r.leaveTypeName),
      escapeCsvField(r.allocatedDays.toFixed(1)),
      escapeCsvField(r.carriedOverDays.toFixed(1)),
      escapeCsvField(r.usedDays.toFixed(1)),
      escapeCsvField(r.pendingDays.toFixed(1)),
      escapeCsvField(r.remainingDays.toFixed(1)),
    ].join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
