import './helpers/mockPrisma';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetMockStore, seedBooking, seedSettings, seedViewer, mockStore } from './helpers/mockPrisma';
import { evaluateLiveValidity, finalizeLiveEnd } from '../src/services/bookingService';
import { MIN_LIVE_DURATION_MINUTES } from '../src/config';

function baseSettings(overrides: Record<string, unknown> = {}) {
  return {
    rooms: [{ id: 'room-1', label: 'Phòng 1', voiceChannelId: 'vc-1' }],
    timeSlots: ['18:00', '19:00'],
    slotDurationMinutes: 60,
    registrationWindow: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
    startTime: '2026-01-01T00:00:00.000Z',
    endTime: '2026-12-31T23:59:59.000Z',
    maxActiveSlotsPerUser: 5,
    maxSlotsPerDayPerUser: 1,
    cronIntervalMinutes: 1,
    minLiveDurationMinutes: MIN_LIVE_DURATION_MINUTES,
    minViewers: 3,
    minViewerDwellMinutes: 5,
    minViewerAccountAgeDays: 7,
    minViewerGuildAgeHours: 24,
    requireHostStreaming: true,
    maxRepeatViewerBookings: 0,
    publicTimelineMessageIds: [],
    ...overrides,
  };
}

describe('bookingService anti-fraud & finalizeLiveEnd', () => {
  beforeEach(() => {
    resetMockStore();
  });

  it('mặc định MIN_LIVE_DURATION_MINUTES là 45 phút', () => {
    assert.equal(MIN_LIVE_DURATION_MINUTES, 45);
  });

  it('host AFK trong voice 45 phút không bật stream (streamSeconds = 0, requireHostStreaming = true) -> durationMinutes = 0, isValid = false', async () => {
    seedSettings(baseSettings({ requireHostStreaming: true }));
    const startTime = new Date('2026-06-01T11:00:00.000Z');
    const actualStartAt = new Date('2026-06-01T11:00:00.000Z');
    const endAt = new Date('2026-06-01T11:45:00.000Z');

    const booking = seedBooking({
      id: 'b-afk',
      userId: 'host-1',
      startTime,
      endTime: endAt,
      actualStartAt,
      peakViewers: 5,
      streamSeconds: 0,
    });
    seedViewer({ bookingId: booking.id, userId: 'v-1', dwellSeconds: 600 });
    seedViewer({ bookingId: booking.id, userId: 'v-2', dwellSeconds: 600 });
    seedViewer({ bookingId: booking.id, userId: 'v-3', dwellSeconds: 600 });

    const res = await evaluateLiveValidity(booking, endAt);
    assert.equal(res.durationMinutes, 0);
    assert.equal(res.streamMinutes, 0);
    assert.equal(res.qualifiedViewers, 3);
    assert.equal(res.isValid, false);
  });

  it('host chưa từng vào voice (actualStartAt = null, streamSeconds = 0) -> KHÔNG fallback về startTime, durationMinutes = 0, isValid = false', async () => {
    // Kiểm tra cả trường hợp requireHostStreaming = false để chắc chắn không fallback về startTime
    seedSettings(baseSettings({ requireHostStreaming: false }));
    const startTime = new Date('2026-06-01T11:00:00.000Z');
    const endAt = new Date('2026-06-01T12:00:00.000Z');

    const booking = seedBooking({
      id: 'b-nojoin',
      userId: 'host-1',
      startTime,
      endTime: endAt,
      actualStartAt: null,
      peakViewers: 4,
      streamSeconds: 0,
    });
    seedViewer({ bookingId: booking.id, userId: 'v-1', dwellSeconds: 600 });
    seedViewer({ bookingId: booking.id, userId: 'v-2', dwellSeconds: 600 });
    seedViewer({ bookingId: booking.id, userId: 'v-3', dwellSeconds: 600 });

    const res = await evaluateLiveValidity(booking, endAt);
    assert.equal(res.durationMinutes, 0);
    assert.equal(res.isValid, false);
  });

  it('host stream/cam 44 phút (streamSeconds = 2640) khi minLiveDurationMinutes = 45 -> isValid = false', async () => {
    seedSettings(baseSettings({ minLiveDurationMinutes: 45 }));
    const startTime = new Date('2026-06-01T11:00:00.000Z');
    const endAt = new Date('2026-06-01T12:00:00.000Z');

    const booking = seedBooking({
      id: 'b-44m',
      userId: 'host-1',
      startTime,
      endTime: endAt,
      actualStartAt: startTime,
      peakViewers: 4,
      streamSeconds: 2640,
    });
    seedViewer({ bookingId: booking.id, userId: 'v-1', dwellSeconds: 300 });
    seedViewer({ bookingId: booking.id, userId: 'v-2', dwellSeconds: 420 });
    seedViewer({ bookingId: booking.id, userId: 'v-3', dwellSeconds: 900 });

    const res = await evaluateLiveValidity(booking, endAt);
    assert.equal(res.durationMinutes, 44);
    assert.equal(res.streamMinutes, 44);
    assert.equal(res.qualifiedViewers, 3);
    assert.equal(res.isValid, false);
  });

  it('host stream 45 phút (streamSeconds = 2700) + 3 viewer dwellSeconds >= 300 -> isValid = true, qualifiedViewers = 3', async () => {
    seedSettings(baseSettings());
    const startTime = new Date('2026-06-01T11:00:00.000Z');
    const endAt = new Date('2026-06-01T12:00:00.000Z');

    const booking = seedBooking({
      id: 'b-valid',
      userId: 'host-1',
      startTime,
      endTime: endAt,
      actualStartAt: startTime,
      peakViewers: 4,
      streamSeconds: 2700,
    });
    seedViewer({ bookingId: booking.id, userId: 'v-1', dwellSeconds: 300 });
    seedViewer({ bookingId: booking.id, userId: 'v-2', dwellSeconds: 420 });
    seedViewer({ bookingId: booking.id, userId: 'v-3', dwellSeconds: 900 });

    const res = await evaluateLiveValidity(booking, endAt);
    assert.equal(res.durationMinutes, 45);
    assert.equal(res.streamMinutes, 45);
    assert.equal(res.qualifiedViewers, 3);
    assert.equal(res.isValid, true);
    assert.equal(res.suspicious, false);
  });

  it('viewer clone vào ra nhanh (dwellSeconds = 120 < 300) -> qualifiedViewers = 0, isValid = false', async () => {
    seedSettings(baseSettings());
    const startTime = new Date('2026-06-01T11:00:00.000Z');
    const endAt = new Date('2026-06-01T12:00:00.000Z');

    const booking = seedBooking({
      id: 'b-clone',
      userId: 'host-1',
      startTime,
      endTime: endAt,
      actualStartAt: startTime,
      peakViewers: 3,
      streamSeconds: 2400,
    });
    seedViewer({ bookingId: booking.id, userId: 'v-1', dwellSeconds: 120 });
    seedViewer({ bookingId: booking.id, userId: 'v-2', dwellSeconds: 120 });
    seedViewer({ bookingId: booking.id, userId: 'v-3', dwellSeconds: 120 });

    const res = await evaluateLiveValidity(booking, endAt);
    assert.equal(res.qualifiedViewers, 0);
    assert.equal(res.isValid, false);
  });

  it('phát hiện viewer lặp lại (maxRepeatViewerBookings = 1): viewer đã đạt chuẩn ở 2 buổi DONE trước của cùng host bị loại & suspicious = true', async () => {
    seedSettings(baseSettings({ maxRepeatViewerBookings: 1 }));

    // 2 buổi DONE trước của host-1
    const prior1 = seedBooking({ id: 'b-prior-1', userId: 'host-1', status: 'DONE', roleGranted: false });
    const prior2 = seedBooking({ id: 'b-prior-2', userId: 'host-1', status: 'DONE', roleGranted: false });
    // v-repeat đạt chuẩn ở cả 2 buổi trước
    seedViewer({ bookingId: prior1.id, userId: 'v-repeat', dwellSeconds: 300 });
    seedViewer({ bookingId: prior2.id, userId: 'v-repeat', dwellSeconds: 400 });
    // v-once chỉ xem 1 buổi trước (<= 1, vẫn hợp lệ)
    seedViewer({ bookingId: prior1.id, userId: 'v-once', dwellSeconds: 300 });

    const endAt = new Date('2026-06-01T12:00:00.000Z');
    const current = seedBooking({
      id: 'b-current',
      userId: 'host-1',
      status: 'LIVE',
      actualStartAt: new Date('2026-06-01T11:00:00.000Z'),
      peakViewers: 4,
      streamSeconds: 2700,
    });
    seedViewer({ bookingId: current.id, userId: 'v-repeat', dwellSeconds: 600 });
    seedViewer({ bookingId: current.id, userId: 'v-once', dwellSeconds: 600 });
    seedViewer({ bookingId: current.id, userId: 'v-fresh-1', dwellSeconds: 600 });
    seedViewer({ bookingId: current.id, userId: 'v-fresh-2', dwellSeconds: 600 });

    const res = await evaluateLiveValidity(current, endAt);
    assert.equal(res.qualifiedViewers, 3); // v-repeat bị loại, còn v-once + 2 fresh
    assert.equal(res.isValid, true);
    assert.equal(res.suspicious, true);
    assert.ok(res.suspiciousReason && res.suspiciousReason.includes('1 viewer vượt ngưỡng 1 lần'));
  });

  it('finalizeLiveEnd race-safety: trả về null nếu updateMany ảnh hưởng 0 dòng (booking đã DONE trước đó)', async () => {
    seedSettings(baseSettings());
    const endAt = new Date('2026-06-01T12:00:00.000Z');
    const alreadyDone = seedBooking({
      id: 'b-done',
      userId: 'host-1',
      status: 'DONE',
      roleGranted: false,
      streamSeconds: 1800,
    });

    const firstResult = await finalizeLiveEnd(alreadyDone, endAt, 'AUTO_TIMEOUT');
    assert.equal(firstResult, null);

    // Nếu đang LIVE, lần 1 thành công, lần 2 trả về null
    const liveBooking = seedBooking({
      id: 'b-live-race',
      userId: 'host-1',
      status: 'LIVE',
      roleGranted: true,
      streamSeconds: 2700,
    });
    seedViewer({ bookingId: liveBooking.id, userId: 'v-1', dwellSeconds: 300 });
    seedViewer({ bookingId: liveBooking.id, userId: 'v-2', dwellSeconds: 300 });
    seedViewer({ bookingId: liveBooking.id, userId: 'v-3', dwellSeconds: 300 });

    const r1 = await finalizeLiveEnd(liveBooking, endAt, 'AUTO_TIMEOUT');
    assert.ok(r1 !== null);
    assert.equal(r1.isValid, true);
    assert.equal(mockStore.bookings.find((b) => b.id === 'b-live-race')?.status, 'DONE');

    const r2 = await finalizeLiveEnd(liveBooking, endAt, 'MANUAL');
    assert.equal(r2, null);
  });
});
