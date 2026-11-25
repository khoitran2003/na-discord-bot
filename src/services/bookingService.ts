import { prisma } from '../prisma';
import { BookingStatus } from '../types';
import { getSettings } from './settingsService';
import dayjs from 'dayjs';
import { Prisma } from '@prisma/client';

export type BookingErrorCode =
  | 'SLOT_TAKEN'
  | 'REGISTRATION_CLOSED'
  | 'SLOT_OUTSIDE_SCHEDULE'
  | 'MAX_PER_DAY'
  | 'MAX_ACTIVE'
  | 'INVALID_INGAME_ROLE_ID'
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
const MAX_BIGINT = 9223372036854775807n;

function parseIngameRoleId(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new BookingError('INVALID_INGAME_ROLE_ID');
  }

  const ingameRoleId = BigInt(normalized);
  if (ingameRoleId <= 0n || ingameRoleId > MAX_BIGINT) {
    throw new BookingError('INVALID_INGAME_ROLE_ID');
  }

  return ingameRoleId;
}

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
  const current = new Date();

  if (current < new Date(settings.registrationWindow.start) || current > new Date(settings.registrationWindow.end)) {
    throw new BookingError('REGISTRATION_CLOSED');
  }
  if (
    startTime <= current ||
    startTime < new Date(settings.startTime) ||
    startTime > new Date(settings.endTime)
  ) {
    throw new BookingError('SLOT_OUTSIDE_SCHEDULE');
  }

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
  ingameRoleId: string;
}) {
  const ingameRoleId = parseIngameRoleId(params.ingameRoleId);
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
      ingameRoleId,
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

export async function getUpcomingActiveBookings(reference = new Date()) {
  return prisma.booking.findMany({
    // Giữ booking đang LIVE và booking tương lai; loại booking active đã hết giờ nhưng cron chưa kịp xử lý.
    where: { status: { in: ACTIVE_STATUSES }, endTime: { gt: reference } },
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
  streamMinutes: number;
  peakViewers: number;
  qualifiedViewers: number;
  isValid: boolean;
  suspicious: boolean;
  suspiciousReason: string | null;
}

/** Ghi nhận thời lượng host đang bật stream/camera (giây) và set actualStartAt nếu chưa có */
export async function recordStreamTick(bookingId: string, seconds: number): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.booking.updateMany({
      where: { id: bookingId, actualStartAt: null },
      data: { actualStartAt: now },
    }),
    prisma.booking.update({
      where: { id: bookingId },
      data: { streamSeconds: { increment: seconds } },
    }),
  ]);
}

/** Cộng dồn thời gian xem (giây) cho từng viewer đủ điều kiện trong buổi live */
export async function recordViewerTicks(bookingId: string, userIds: string[], seconds: number): Promise<void> {
  if (userIds.length === 0) return;

  await prisma.$transaction(
    userIds.map((userId) =>
      prisma.bookingViewer.upsert({
        where: { bookingId_userId: { bookingId, userId } },
        create: { bookingId, userId, dwellSeconds: seconds },
        update: { dwellSeconds: { increment: seconds } },
      })
    )
  );
}

/** Danh sách userId của các host đang LIVE, dùng để loại trừ cross-room viewer */
export async function getLiveHostUserIds(): Promise<Set<string>> {
  const liveBookings = await prisma.booking.findMany({
    where: { status: 'LIVE' },
    select: { userId: true },
  });
  return new Set(liveBookings.map((b) => b.userId));
}

/** Tính thời lượng live thực tế + so với rule (minLiveDurationMinutes/minViewers/anti-fraud) để xác định hợp lệ */
export async function evaluateLiveValidity(
  booking: {
    id: string;
    userId: string;
    actualStartAt: Date | null;
    startTime: Date;
    peakViewers: number;
    streamSeconds: number;
  },
  endAt: Date
): Promise<LiveValidityResult> {
  const [settings, viewers] = await Promise.all([
    getSettings(),
    prisma.bookingViewer.findMany({ where: { bookingId: booking.id } }),
  ]);

  const streamMinutes = Math.floor(booking.streamSeconds / 60);
  const durationMinutes = settings.requireHostStreaming
    ? streamMinutes
    : booking.actualStartAt
      ? Math.max(0, Math.round((endAt.getTime() - booking.actualStartAt.getTime()) / 60000))
      : 0;

  const minDwellSeconds = settings.minViewerDwellMinutes * 60;
  const dwellQualifiedViewers = viewers.filter((v) => v.dwellSeconds >= minDwellSeconds);
  let qualifiedViewers = dwellQualifiedViewers.length;
  let suspicious = false;
  let suspiciousReason: string | null = null;

  if (settings.maxRepeatViewerBookings > 0 && dwellQualifiedViewers.length > 0) {
    const viewerIds = dwellQualifiedViewers.map((v) => v.userId);
    const repeatCounts = await prisma.bookingViewer.groupBy({
      by: ['userId'],
      where: {
        userId: { in: viewerIds },
        dwellSeconds: { gte: minDwellSeconds },
        booking: {
          userId: booking.userId,
          status: 'DONE',
          id: { not: booking.id },
        },
      },
      _count: { bookingId: true },
    });

    const repeatCountByUser = new Map(repeatCounts.map((r) => [r.userId, r._count.bookingId]));
    const nonRepeatViewers = dwellQualifiedViewers.filter(
      (v) => (repeatCountByUser.get(v.userId) ?? 0) <= settings.maxRepeatViewerBookings
    );
    const excludedCount = dwellQualifiedViewers.length - nonRepeatViewers.length;

    if (excludedCount > 0) {
      qualifiedViewers = nonRepeatViewers.length;
      suspicious = true;
      suspiciousReason = `Viewer lặp lại bất thường (${excludedCount} viewer vượt ngưỡng ${settings.maxRepeatViewerBookings} lần)`;
    }
  }

  const isValid = durationMinutes >= settings.minLiveDurationMinutes && qualifiedViewers >= settings.minViewers;

  return {
    durationMinutes,
    streamMinutes,
    peakViewers: booking.peakViewers,
    qualifiedViewers,
    isValid,
    suspicious,
    suspiciousReason,
  };
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
  booking: {
    id: string;
    userId: string;
    actualStartAt: Date | null;
    startTime: Date;
    peakViewers: number;
    streamSeconds: number;
  },
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
      qualifiedViewers: result.qualifiedViewers,
      suspicious: result.suspicious,
      suspiciousReason: result.suspiciousReason,
      endReason,
    },
  });

  return count > 0 ? result : null;
}

export type AdminBookingStatusFilter = BookingStatus | 'ALL';

export interface AdminBookingFilters {
  status?: AdminBookingStatusFilter;
}

function buildAdminBookingWhere(filters: AdminBookingFilters): Prisma.BookingWhereInput {
  return filters.status && filters.status !== 'ALL' ? { status: filters.status } : {};
}

/** Danh sách booking cho Admin Portal: cùng filter với export, có phân trang cho Discord UI. */
export async function getBookingsForAdmin(params: AdminBookingFilters & {
  page: number;
  pageSize: number;
}) {
  const where = buildAdminBookingWhere(params);

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

/** Export luôn lấy toàn bộ bản ghi khớp filter, không áp dụng pagination của Discord UI. */
export async function getBookingsForAdminExport(filters: AdminBookingFilters) {
  return prisma.booking.findMany({
    where: buildAdminBookingWhere(filters),
    include: { viewers: { select: { userId: true, dwellSeconds: true, firstSeen: true } } },
    orderBy: [{ startTime: 'desc' }, { id: 'asc' }],
  });
}
