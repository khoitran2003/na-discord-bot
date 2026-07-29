import { prisma } from '../prisma';
import {
  TIME_SLOTS,
  SLOT_DURATION_MINUTES,
  DEFAULT_SCHEDULE_DURATION_DAYS,
  MAX_ACTIVE_SLOTS_PER_USER,
  MAX_SLOTS_PER_DAY_PER_USER,
  CRON_INTERVAL_MINUTES,
  MIN_LIVE_DURATION_MINUTES,
  MIN_VIEWERS,
  TIMEZONE,
} from '../config';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const SETTINGS_ID = 'global';

export interface DynamicSettings {
  rooms: { id: string; label: string; voiceChannelId: string }[];
  timeSlots: string[];
  slotDurationMinutes: number;
  registrationWindow: { start: string; end: string };
  startTime: string;
  endTime: string;
  maxActiveSlotsPerUser: number;
  maxSlotsPerDayPerUser: number;
  cronIntervalMinutes: number;
  minLiveDurationMinutes: number;
  minViewers: number;
  publicTimelineMessageIds: string[];
}

type StoredSettings = Record<string, unknown>;

function buildDefaultDateTimeSettings(reference = dayjs().tz(TIMEZONE)) {
  const sortedSlots = [...TIME_SLOTS].sort();
  const firstSlot = sortedSlots[0] ?? '00:00';
  const lastSlot = sortedSlots[sortedSlots.length - 1] ?? '23:59';
  let firstStart = dayjs.tz(`${reference.format('YYYY-MM-DD')} ${firstSlot}`, 'YYYY-MM-DD HH:mm', TIMEZONE);

  if (!firstStart.isAfter(reference)) {
    firstStart = firstStart.add(1, 'day');
  }

  const lastStart = dayjs.tz(
    `${firstStart.add(DEFAULT_SCHEDULE_DURATION_DAYS - 1, 'day').format('YYYY-MM-DD')} ${lastSlot}`,
    'YYYY-MM-DD HH:mm',
    TIMEZONE
  );

  return {
    registrationWindow: {
      start: reference.startOf('minute').toISOString(),
      end: lastStart.toISOString(),
    },
    startTime: firstStart.toISOString(),
    endTime: lastStart.toISOString(),
  };
}

// Giá trị mặc định/seed lấy từ config.ts, dùng khi DB chưa có row Setting nào (lần đầu chạy).
// Riêng "rooms" không có default — admin bắt buộc phải thêm phòng qua Admin Portal trước khi mở đăng ký.
const DEFAULT_SETTINGS: DynamicSettings = {
  rooms: [],
  timeSlots: TIME_SLOTS,
  slotDurationMinutes: SLOT_DURATION_MINUTES,
  ...buildDefaultDateTimeSettings(),
  maxActiveSlotsPerUser: MAX_ACTIVE_SLOTS_PER_USER,
  maxSlotsPerDayPerUser: MAX_SLOTS_PER_DAY_PER_USER,
  cronIntervalMinutes: CRON_INTERVAL_MINUTES,
  minLiveDurationMinutes: MIN_LIVE_DURATION_MINUTES,
  minViewers: MIN_VIEWERS,
  publicTimelineMessageIds: [],
};

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && dayjs(value).isValid();
}

function isRegistrationWindow(value: unknown): value is DynamicSettings['registrationWindow'] {
  if (!value || typeof value !== 'object') return false;
  const window = value as Record<string, unknown>;
  return isDateTime(window.start) && isDateTime(window.end) && new Date(window.start) < new Date(window.end);
}

function buildLegacyDateTimeSettings(raw: StoredSettings) {
  const reference = dayjs().tz(TIMEZONE);
  const legacyDays =
    typeof raw.bookableDaysAhead === 'number' && raw.bookableDaysAhead > 0
      ? raw.bookableDaysAhead
      : DEFAULT_SCHEDULE_DURATION_DAYS;
  const legacyMinimumHours =
    typeof raw.minHoursBeforeBooking === 'number' && raw.minHoursBeforeBooking >= 0
      ? raw.minHoursBeforeBooking
      : 0;
  const end = reference.add(legacyDays, 'day');

  return {
    registrationWindow: { start: reference.toISOString(), end: end.toISOString() },
    startTime: reference.add(legacyMinimumHours, 'hour').toISOString(),
    endTime: end.toISOString(),
  };
}

/**
 * Chuẩn hóa dữ liệu JSON cũ tại runtime để bot vẫn khởi động an toàn nếu migration DB
 * chưa được chạy. Chỉ loại bỏ ba cấu hình cũ; tất cả setting khác (kể cả key mở rộng)
 * được giữ nguyên.
 */
function normalizeSettings(raw: StoredSettings): { settings: DynamicSettings; changed: boolean } {
  const normalized: StoredSettings = { ...DEFAULT_SETTINGS, ...raw };
  const legacyFallback = buildLegacyDateTimeSettings(raw);
  let changed = false;

  if (!isRegistrationWindow(raw.registrationWindow)) {
    normalized.registrationWindow = legacyFallback.registrationWindow;
    changed = true;
  }
  if (!isDateTime(raw.startTime)) {
    normalized.startTime = legacyFallback.startTime;
    changed = true;
  }
  if (!isDateTime(raw.endTime)) {
    normalized.endTime = legacyFallback.endTime;
    changed = true;
  }

  if (new Date(normalized.startTime as string) > new Date(normalized.endTime as string)) {
    normalized.startTime = legacyFallback.startTime;
    normalized.endTime = legacyFallback.endTime;
    changed = true;
  }

  if (!Array.isArray(raw.publicTimelineMessageIds) || !raw.publicTimelineMessageIds.every((id) => typeof id === 'string')) {
    normalized.publicTimelineMessageIds =
      typeof raw.publicTimelineMessageId === 'string' ? [raw.publicTimelineMessageId] : [];
    changed = true;
  }

  if ('publicTimelineMessageId' in normalized) {
    delete normalized.publicTimelineMessageId;
    changed = true;
  }

  for (const legacyKey of ['bookableDaysAhead', 'minHoursBeforeBooking']) {
    if (legacyKey in normalized) {
      delete normalized[legacyKey];
      changed = true;
    }
  }

  return { settings: normalized as unknown as DynamicSettings, changed };
}

let cached: DynamicSettings | null = null;

export async function getSettings(): Promise<DynamicSettings> {
  if (cached) return cached;

  const row = await prisma.setting.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) {
    await prisma.setting.create({ data: { id: SETTINGS_ID, data: JSON.stringify(DEFAULT_SETTINGS) } });
    cached = DEFAULT_SETTINGS;
    return cached;
  }

  const { settings, changed } = normalizeSettings(JSON.parse(row.data) as StoredSettings);
  if (changed) {
    await prisma.setting.update({ where: { id: SETTINGS_ID }, data: { data: JSON.stringify(settings) } });
  }
  cached = settings;
  return settings;
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
