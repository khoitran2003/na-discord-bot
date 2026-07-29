import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/vi';
import { TIMEZONE } from '../config';
import { getSettings } from '../services/settingsService';
import { Lang } from '../i18n';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.locale('vi');

// Admin Portal giữ nguyên tiếng Việt (không đa ngôn ngữ) -> dùng thẳng DAY_LABELS
export const DAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const EN_DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Tên thứ trong tuần theo ngôn ngữ user đã chọn — dùng cho các tin nhắn ephemeral đa ngôn ngữ */
export function getDayLabel(day: number, lang: Lang): string {
  return lang === 'en' ? EN_DAY_LABELS[day] : DAY_LABELS[day];
}

export function now() {
  return dayjs().tz(TIMEZONE);
}

const ADMIN_DATETIME_FORMAT = 'YYYY-MM-DD HH:mm';

/** Parse datetime do admin nhập theo giờ Việt Nam và trả về ISO-8601 để lưu DB. */
export function parseAdminDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) return null;

  const parsed = dayjs.tz(trimmed, ADMIN_DATETIME_FORMAT, TIMEZONE);
  if (!parsed.isValid() || parsed.format(ADMIN_DATETIME_FORMAT) !== trimmed) return null;
  return parsed.toISOString();
}

/** Format mốc ISO thành định dạng dùng trong input Admin Portal. */
export function formatAdminDateTime(value: string): string {
  return dayjs(value).tz(TIMEZONE).format(ADMIN_DATETIME_FORMAT);
}

/** Có đang nằm trong khoảng datetime cho phép đăng ký không. */
export async function isRegistrationOpen(): Promise<boolean> {
  const settings = await getSettings();
  const n = now();
  const registrationStart = dayjs(settings.registrationWindow.start);
  const registrationEnd = dayjs(settings.registrationWindow.end);
  return !n.isBefore(registrationStart) && !n.isAfter(registrationEnd);
}

/** Danh sách ngày nằm trong khoảng slot đầu tiên -> slot cuối cùng và chưa ở quá khứ. */
export async function getBookableDays(): Promise<string[]> {
  const settings = await getSettings();
  const configuredStart = dayjs(settings.startTime).tz(TIMEZONE).startOf('day');
  const configuredEnd = dayjs(settings.endTime).tz(TIMEZONE).startOf('day');
  let cursor = configuredStart.isAfter(now().startOf('day')) ? configuredStart : now().startOf('day');
  const days: string[] = [];

  while (!cursor.isAfter(configuredEnd)) {
    days.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return days;
}

/** Với 1 ngày cụ thể, trả về các slot chưa qua và nằm trong hai biên datetime đã cấu hình. */
export async function getValidTimeSlotsForDay(
  dateStr: string
): Promise<{ slot: string; start: Date; end: Date }[]> {
  const settings = await getSettings();
  const result: { slot: string; start: Date; end: Date }[] = [];
  const current = now();
  const allowedStart = dayjs(settings.startTime);
  const allowedEnd = dayjs(settings.endTime);

  for (const slot of settings.timeSlots) {
    const start = dayjs.tz(`${dateStr} ${slot}`, 'YYYY-MM-DD HH:mm', TIMEZONE);
    const end = start.add(settings.slotDurationMinutes, 'minute');

    if (start.isAfter(current) && !start.isBefore(allowedStart) && !start.isAfter(allowedEnd)) {
      result.push({ slot, start: start.toDate(), end: end.toDate() });
    }
  }
  return result;
}

export function formatDateTimeVN(d: Date | string): string {
  return dayjs(d).tz(TIMEZONE).format('DD/MM/YYYY HH:mm');
}

/** Tính khoảng cách nhỏ nhất (tính bằng phút) giữa các mốc giờ trong timeSlots */
export function calculateMinDeltaT(timeSlots: string[]): number | null {
  if (timeSlots.length < 2) return null;

  const minutesList = [...new Set(timeSlots)]
    .map((t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    })
    .sort((a, b) => a - b);

  if (minutesList.length < 2) return null;

  let minDelta = Infinity;
  for (let i = 0; i < minutesList.length - 1; i++) {
    const diff = minutesList[i + 1] - minutesList[i];
    if (diff < minDelta) {
      minDelta = diff;
    }
  }

  return minDelta === Infinity ? null : minDelta;
}

/** Format ngắn gọn danh sách timeSlots để hiển thị không vượt quá giới hạn ký tự Discord */
export function formatTimeSlotsSummary(timeSlots: string[], maxLength: number = 300): string {
  if (!timeSlots || timeSlots.length === 0) return '(chưa có)';
  const fullStr = timeSlots.join(', ');
  if (fullStr.length <= maxLength) return fullStr;

  const first = timeSlots[0];
  const last = timeSlots[timeSlots.length - 1];
  const sample = timeSlots.slice(0, 8).join(', ');
  return `${sample} ... ${last} (tổng ${timeSlots.length} khung giờ từ ${first} đến ${last})`;
}
