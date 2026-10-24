import { downloadText } from './download';
import { t } from '@/i18n';

/**
 * A monthly calendar reminder as an .ics file (product review: reminders, zero-backend
 * option). The file is built on the device and opened by the user's calendar app.
 */
export function monthlyReminderIcs({
  firstDate,
  dayOfMonth,
  url,
  stamp,
  uid,
}: {
  /** `YYYY-MM-DD` of the first reminder. */
  firstDate: string;
  dayOfMonth: number;
  url: string;
  /** UTC timestamp for DTSTAMP, `YYYYMMDDTHHMMSSZ`. */
  stamp: string;
  uid: string;
}): string {
  const d = firstDate.replaceAll('-', '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FI Tracker//Monthly update//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`,
    `RRULE:FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth}`,
    `SUMMARY:${t('FI Tracker monthly update')}`,
    `DESCRIPTION:${t("Update balances and last month's pay and spending (about 3 minutes): {url}", { url })}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${t('FI Tracker monthly update')}`,
    'TRIGGER:PT9H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** The next date on `dayOfMonth` (1–28) after today. */
export function nextReminderDate(todayDate: string, dayOfMonth: number): string {
  const [y, m, d] = todayDate.split('-').map(Number);
  const next =
    d < dayOfMonth ? new Date(Date.UTC(y, m - 1, dayOfMonth)) : new Date(Date.UTC(y, m, dayOfMonth));
  return next.toISOString().slice(0, 10);
}

export function downloadMonthlyReminder(todayDate: string, dayOfMonth = 1): void {
  const url = `${window.location.origin}${window.location.pathname}#/update`;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const text = monthlyReminderIcs({
    firstDate: nextReminderDate(todayDate, dayOfMonth),
    dayOfMonth,
    url,
    stamp,
    uid: `fi-tracker-monthly-${stamp}@fi-tracker`,
  });
  downloadText('fi-tracker-monthly-update.ics', text, 'text/calendar');
}
