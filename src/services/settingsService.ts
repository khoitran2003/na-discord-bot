import { prisma } from '../prisma';
import {
  TIME_SLOTS,
  SLOT_DURATION_MINUTES,
  REGISTRATION_WINDOW,
  BOOKABLE_DAYS_AHEAD,
  MIN_HOURS_BEFORE_BOOKING,
  MAX_ACTIVE_SLOTS_PER_USER,
  MAX_SLOTS_PER_DAY_PER_USER,
  CRON_INTERVAL_MINUTES,
  MIN_LIVE_DURATION_MINUTES,
  MIN_VIEWERS,
} from '../config';

const SETTINGS_ID = 'global';

export interface DynamicSettings {
  rooms: { id: string; label: string; voiceChannelId: string }[];
  timeSlots: string[];
  slotDurationMinutes: number;
  registrationWindow: { openDay: number; openHour: number; closeDay: number; closeHour: number };
  bookableDaysAhead: number;
  minHoursBeforeBooking: number;
  maxActiveSlotsPerUser: number;
  maxSlotsPerDayPerUser: number;
  cronIntervalMinutes: number;
  minLiveDurationMinutes: number;
  minViewers: number;
  publicTimelineMessageId: string | null;
}

// Giá trị mặc định/seed lấy từ config.ts, dùng khi DB chưa có row Setting nào (lần đầu chạy).
// Riêng "rooms" không có default — admin bắt buộc phải thêm phòng qua Admin Portal trước khi mở đăng ký.
const DEFAULT_SETTINGS: DynamicSettings = {
  rooms: [],
  timeSlots: TIME_SLOTS,
  slotDurationMinutes: SLOT_DURATION_MINUTES,
  registrationWindow: REGISTRATION_WINDOW,
  bookableDaysAhead: BOOKABLE_DAYS_AHEAD,
  minHoursBeforeBooking: MIN_HOURS_BEFORE_BOOKING,
  maxActiveSlotsPerUser: MAX_ACTIVE_SLOTS_PER_USER,
  maxSlotsPerDayPerUser: MAX_SLOTS_PER_DAY_PER_USER,
  cronIntervalMinutes: CRON_INTERVAL_MINUTES,
  minLiveDurationMinutes: MIN_LIVE_DURATION_MINUTES,
  minViewers: MIN_VIEWERS,
  publicTimelineMessageId: null,
};

let cached: DynamicSettings | null = null;

export async function getSettings(): Promise<DynamicSettings> {
  if (cached) return cached;

  const row = await prisma.setting.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) {
    await prisma.setting.create({ data: { id: SETTINGS_ID, data: JSON.stringify(DEFAULT_SETTINGS) } });
    cached = DEFAULT_SETTINGS;
    return cached;
  }

  const parsed: DynamicSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(row.data) };
  cached = parsed;
  return parsed;
}

export async function updateSettings(partial: Partial<DynamicSettings>): Promise<DynamicSettings> {
  const current = await getSettings();
  const next: DynamicSettings = { ...current, ...partial };

  await prisma.setting.upsert({
    where: { id: SETTINGS_ID },
    update: { data: JSON.stringify(next) },
    create: { id: SETTINGS_ID, data: JSON.stringify(next) },
  });

  cached = next;
  return next;
}
