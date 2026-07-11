import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/vi';
import { TIMEZONE } from '../config';
import { getSettings } from '../services/settingsService';
import { Lang } from '../i18n';

dayjs.extend(utc);
dayjs.extend(timezone);
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

/** Có đang trong khung giờ mở đăng ký không (VD: CN 00:00 -> Thứ 3 00:00) */
export async function isRegistrationOpen(): Promise<boolean> {
  const settings = await getSettings();
  const n = now();
  const day = n.day(); // 0=CN ... 6=Th7
  const { openDay, closeDay } = settings.registrationWindow;

  if (openDay <= closeDay) {
    return day >= openDay && day < closeDay;
  }
  // Trường hợp cửa sổ vắt qua tuần (VD mở Thứ 6, đóng Thứ 2)
  return day >= openDay || day < closeDay;
}

/** Danh sách các ngày (YYYY-MM-DD) được phép chọn, tính từ hôm nay */
export async function getBookableDays(): Promise<string[]> {
  const settings = await getSettings();
  const days: string[] = [];
  for (let i = 0; i < settings.bookableDaysAhead; i++) {
    days.push(now().add(i, 'day').format('YYYY-MM-DD'));
  }
  return days;
}

/** Với 1 ngày cụ thể, trả về các slot giờ còn hợp lệ (chưa qua, và cách hiện tại >= minHoursBeforeBooking) */
export async function getValidTimeSlotsForDay(
  dateStr: string
): Promise<{ slot: string; start: Date; end: Date }[]> {
  const settings = await getSettings();
  const result: { slot: string; start: Date; end: Date }[] = [];
  const minAllowed = now().add(settings.minHoursBeforeBooking, 'hour');

  for (const slot of settings.timeSlots) {
    const start = dayjs.tz(`${dateStr} ${slot}`, 'YYYY-MM-DD HH:mm', TIMEZONE);
    const end = start.add(settings.slotDurationMinutes, 'minute');

    if (start.isAfter(minAllowed)) {
      result.push({ slot, start: start.toDate(), end: end.toDate() });
    }
  }
  return result;
}

export function formatDateTimeVN(d: Date): string {
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
