import { prisma } from '../prisma';
import { BookingStatus } from '../types';
import { getSettings } from './settingsService';
import dayjs from 'dayjs';

export type BookingErrorCode =
  | 'SLOT_TAKEN'
  | 'MAX_PER_DAY'
  | 'MAX_ACTIVE'
  | 'NOT_FOUND_OWN'
  | 'CANNOT_CANCEL'
  | 'NOT_FOUND_ADMIN'
  | 'CANNOT_CANCEL_ADMIN';

/** Mang error code thay vì message tiếng Việt cứng, để handler tự dịch theo ngôn ngữ user qua t(`errors.${code}`, lang, params) */
export class BookingError extends Error {
  constructor(
    public code: BookingErrorCode,
    public params?: Record<string, string | number>
  ) {
    super(code);
  }
}

const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'LIVE'];

/** Slot đã có người đặt chưa (cùng phòng, cùng giờ bắt đầu, còn active) */
export async function isSlotTaken(roomId: string, startTime: Date): Promise<boolean> {
  const existing = await prisma.booking.findFirst({
    where: { roomId, startTime, status: { in: ACTIVE_STATUSES } },
  });
  return !!existing;
}

/** Đếm số booking active (PENDING/LIVE) của user trong 1 ngày cụ thể (dateStr: YYYY-MM-DD) */
export async function countUserBookingsOnDay(userId: string, dateStr: string): Promise<number> {
  const dayStart = dayjs(dateStr).startOf('day').toDate();
  const dayEnd = dayjs(dateStr).endOf('day').toDate();

  return prisma.booking.count({
    where: {
      userId,
      status: { in: ACTIVE_STATUSES },
      startTime: { gte: dayStart, lte: dayEnd },
    },
  });
}

/** Kiểm tra toàn bộ rule trước khi cho user đặt slot mới. Throw BookingError nếu vi phạm. */
export async function assertCanBook(userId: string, roomId: string, startTime: Date, endTime: Date) {
  const settings = await getSettings();
  const dateStr = dayjs(startTime).format('YYYY-MM-DD');

  const [activeCount, sameDayCount, taken] = await Promise.all([
    prisma.booking.count({ where: { userId, status: { in: ACTIVE_STATUSES } } }),
    countUserBookingsOnDay(userId, dateStr),
    isSlotTaken(roomId, startTime),
  ]);

  if (taken) {
    throw new BookingError('SLOT_TAKEN');
  }
  if (sameDayCount >= settings.maxSlotsPerDayPerUser) {
    throw new BookingError('MAX_PER_DAY', { max: settings.maxSlotsPerDayPerUser, count: sameDayCount });
  }
  if (activeCount >= settings.maxActiveSlotsPerUser) {
    throw new BookingError('MAX_ACTIVE', { max: settings.maxActiveSlotsPerUser, count: activeCount });
  }
}

export async function createBooking(params: {
  userId: string;
  username: string;
  roomId: string;
  startTime: Date;
  endTime: Date;
  livestreamContent: string;
}) {
  await assertCanBook(params.userId, params.roomId, params.startTime, params.endTime);

  return prisma.booking.create({
    data: {
      userId: params.userId,
      username: params.username,
      roomId: params.roomId,
      startTime: params.startTime,
      endTime: params.endTime,
      status: 'PENDING',
      livestreamContent: params.livestreamContent,
    },
  });
}

export async function cancelBooking(userId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.userId !== userId) {
    throw new BookingError('NOT_FOUND_OWN');
  }
  if (booking.status === 'DONE' || booking.status === 'CANCELLED') {
    throw new BookingError('CANNOT_CANCEL');
  }
  return prisma.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
}

/** Admin hủy booking bất kỳ, bỏ qua check chủ sở hữu (khác cancelBooking() dành cho user tự hủy) */
export async function adminCancelBooking(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw new BookingError('NOT_FOUND_ADMIN');
  }
  if (booking.status === 'DONE' || booking.status === 'CANCELLED') {
    throw new BookingError('CANNOT_CANCEL_ADMIN');
  }
  return prisma.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
}

export async function getUserActiveBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId, status: { in: ACTIVE_STATUSES } },
    orderBy: { startTime: 'asc' },
  });
}

export async function getUpcomingActiveBookings() {
  return prisma.booking.findMany({
    where: { status: { in: ACTIVE_STATUSES } },
    orderBy: { startTime: 'asc' },
  });
}

/** Slot cần cấp quyền: PENDING, đã đến giờ bắt đầu, chưa được cấp role */
export async function findBookingsToGrant(now: Date) {
  return prisma.booking.findMany({
    where: { status: 'PENDING', roleGranted: false, startTime: { lte: now } },
  });
}

/** Slot cần thu quyền: đã cấp role, đã qua giờ kết thúc, chưa DONE */
export async function findBookingsToRevoke(now: Date) {
  return prisma.booking.findMany({
    where: { status: 'LIVE', roleGranted: true, endTime: { lte: now } },
  });
}

export async function markAsLive(bookingId: string) {
  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'LIVE', roleGranted: true },
  });
}

export type LiveEndReason = 'MANUAL' | 'AUTO_TIMEOUT';

export interface LiveValidityResult {
  durationMinutes: number;
  peakViewers: number;
  isValid: boolean;
}

/** Tính thời lượng live thực tế + so với rule (minLiveDurationMinutes/minViewers) để xác định hợp lệ */
export async function evaluateLiveValidity(
  booking: { actualStartAt: Date | null; startTime: Date; peakViewers: number },
  endAt: Date
): Promise<LiveValidityResult> {
  const settings = await getSettings();
  const start = booking.actualStartAt ?? booking.startTime; // fallback nếu vì lý do gì đó chưa track được actualStartAt (VD host chưa từng vào voice)
  const durationMinutes = Math.max(0, Math.round((endAt.getTime() - start.getTime()) / 60000));
  const isValid = durationMinutes >= settings.minLiveDurationMinutes && booking.peakViewers >= settings.minViewers;

  return { durationMinutes, peakViewers: booking.peakViewers, isValid };
}

/** Booking đang LIVE của đúng user này tại đúng phòng này (dùng để track actualStartAt/actualEndAt qua voiceStateUpdate) */
export async function findLiveBooking(userId: string, roomId: string) {
  return prisma.booking.findFirst({ where: { userId, roomId, status: 'LIVE' } });
}

/** Ghi nhận thời điểm host thực sự vào voice channel, chỉ ghi lần đầu (không ghi đè nếu đã có) */
export async function recordActualStart(bookingId: string): Promise<void> {
  await prisma.booking.updateMany({
    where: { id: bookingId, actualStartAt: null },
    data: { actualStartAt: new Date() },
  });
}

/** Cập nhật đỉnh viewer nếu số hiện tại cao hơn đỉnh đã ghi nhận trước đó */
export async function updatePeakViewersIfHigher(bookingId: string, currentViewers: number): Promise<void> {
  await prisma.booking.updateMany({
    where: { id: bookingId, peakViewers: { lt: currentViewers } },
    data: { peakViewers: currentViewers },
  });
}

/** Booking đang LIVE, dùng cho cron quét đỉnh viewer định kỳ */
export async function getLiveBookings() {
  return prisma.booking.findMany({ where: { status: 'LIVE' } });
}

/**
 * Kết thúc 1 buổi live: đánh giá hợp lệ rồi chuyển DONE, ghi actualEndAt/isValidLive/endReason.
 * Update có điều kiện where status:'LIVE' để tránh xử lý trùng nếu cron (hết giờ) và voiceStateUpdate
 * (user tự rời) cùng chạm 1 booking gần như cùng lúc — trả về null nếu booking đã được finalize trước đó.
 */
export async function finalizeLiveEnd(
  booking: { id: string; actualStartAt: Date | null; startTime: Date; peakViewers: number },
  endAt: Date,
  endReason: LiveEndReason
): Promise<LiveValidityResult | null> {
  const result = await evaluateLiveValidity(booking, endAt);

  const { count } = await prisma.booking.updateMany({
    where: { id: booking.id, status: 'LIVE' },
    data: {
      status: 'DONE',
      roleGranted: false,
      actualEndAt: endAt,
      isValidLive: result.isValid,
      endReason,
    },
  });

  return count > 0 ? result : null;
}

/** Danh sách booking cho Admin Portal: lọc theo status (hoặc tất cả) + phân trang */
export async function getBookingsForAdmin(params: {
  status?: BookingStatus | 'ALL';
  page: number;
  pageSize: number;
}) {
  const where = params.status && params.status !== 'ALL' ? { status: params.status } : {};

  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { startTime: 'desc' },
      skip: params.page * params.pageSize,
      take: params.pageSize,
    }),
    prisma.booking.count({ where }),
  ]);

  return { items, total, totalPages: Math.max(Math.ceil(total / params.pageSize), 1) };
}
