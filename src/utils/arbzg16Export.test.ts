import { describe, expect, it } from 'vitest';
import {
  buildArbzg16Csv,
  buildBurlGCsv,
  escapeCsvField,
  type Arbzg16Row,
  type BurlGRow,
} from './arbzg16Export';

describe('escapeCsvField', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('passes plain values through', () => {
    expect(escapeCsvField('foo')).toBe('foo');
    expect(escapeCsvField(42)).toBe('42');
    expect(escapeCsvField(0)).toBe('0');
  });

  it('quotes values containing commas', () => {
    expect(escapeCsvField('Smith, John')).toBe('"Smith, John"');
  });

  it('quotes and doubles inner quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes values containing newlines / CR', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });
});

describe('buildArbzg16Csv', () => {
  const sampleRow: Arbzg16Row = {
    date: '2026-06-15',
    userName: 'Anna Müller',
    userId: '11111111-1111-1111-1111-111111111111',
    startTime: '08:00:00',
    endTime: '17:00:00',
    breakMinutes: 60,
    totalHours: 8,
    overtimeHours: 0,
    sundayOrHoliday: false,
    notes: null,
  };

  it('produces the German header row first', () => {
    const csv = buildArbzg16Csv([]);
    expect(csv.split('\r\n')[0]).toBe(
      'Datum,Wochentag,Mitarbeiter,Mitarbeiter-ID,Beginn,Ende,Pause (min),Arbeitszeit (h),Mehrarbeit (h),Sonn-/Feiertag,Notiz'
    );
  });

  it('serializes a single row with weekday + trimmed times', () => {
    const csv = buildArbzg16Csv([sampleRow]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toBe(
      '2026-06-15,Montag,Anna Müller,11111111-1111-1111-1111-111111111111,08:00,17:00,60,8.00,0.00,Nein,'
    );
  });

  it('uses CRLF between rows and trailing CRLF', () => {
    const csv = buildArbzg16Csv([sampleRow, { ...sampleRow, date: '2026-06-16' }]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n').length).toBe(4); // header + 2 rows + trailing empty
  });

  it('flags Sunday/holiday rows as Ja', () => {
    const csv = buildArbzg16Csv([{ ...sampleRow, sundayOrHoliday: true }]);
    expect(csv).toContain(',Ja,');
  });

  it('escapes commas in name and notes', () => {
    const csv = buildArbzg16Csv([{ ...sampleRow, userName: 'Smith, John', notes: 'a, b' }]);
    expect(csv).toContain('"Smith, John"');
    expect(csv).toContain('"a, b"');
  });

  it('falls back to empty start/end when null', () => {
    const csv = buildArbzg16Csv([{ ...sampleRow, startTime: null, endTime: null }]);
    expect(csv.split('\r\n')[1]).toContain(',,,'); // empty start, empty end, then break
  });

  it('formats overtime to 2 decimals', () => {
    const csv = buildArbzg16Csv([{ ...sampleRow, totalHours: 10.5, overtimeHours: 2.5 }]);
    expect(csv).toContain(',10.50,2.50,');
  });
});

describe('buildBurlGCsv', () => {
  const r: BurlGRow = {
    userName: 'Anna Müller',
    userId: '11111111-1111-1111-1111-111111111111',
    leaveTypeName: 'Erholungsurlaub',
    year: 2026,
    allocatedDays: 24,
    carriedOverDays: 2,
    usedDays: 10,
    pendingDays: 1,
    remainingDays: 15,
  };

  it('produces the German header row', () => {
    expect(buildBurlGCsv([]).split('\r\n')[0]).toBe(
      'Jahr,Mitarbeiter,Mitarbeiter-ID,Urlaubsart,Anspruch,Übertrag (Vorjahr),Genommen,Beantragt,Verbleibend'
    );
  });

  it('formats counts to 1 decimal', () => {
    const csv = buildBurlGCsv([r]);
    expect(csv.split('\r\n')[1]).toBe(
      '2026,Anna Müller,11111111-1111-1111-1111-111111111111,Erholungsurlaub,24.0,2.0,10.0,1.0,15.0'
    );
  });
});
