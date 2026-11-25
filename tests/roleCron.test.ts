import './helpers/mockPrisma';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, Client, GuildMember } from 'discord.js';
import { resetMockStore, seedBooking, seedSettings, seedViewer, mockStore } from './helpers/mockPrisma';
import { runRoleCronTick } from '../src/cron/roleCron';
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

function makeVoiceMember(opts: {
  id: string;
  bot?: boolean;
  streaming?: boolean;
  selfVideo?: boolean;
  deaf?: boolean;
  selfDeaf?: boolean;
  createdTimestamp: number;
  joinedTimestamp: number | null;
}): GuildMember {
  return {
    id: opts.id,
    user: {
      bot: opts.bot ?? false,
      createdTimestamp: opts.createdTimestamp,
    },
    voice: {
      streaming: opts.streaming ?? false,
      selfVideo: opts.selfVideo ?? false,
      deaf: opts.deaf ?? false,
      selfDeaf: opts.selfDeaf ?? false,
      serverDeaf: false,
      disconnect: async () => {},
    },
    joinedTimestamp: opts.joinedTimestamp,
  } as unknown as GuildMember;
}

function makeMockClient(membersList: GuildMember[]): Client {
  const membersMap = new Map<string, GuildMember>(membersList.map((m) => [m.id, m]));
  const voiceChannel = {
    type: ChannelType.GuildVoice,
    members: membersMap,
    permissionOverwrites: {
      create: async () => {},
      delete: async () => {},
    },
  };

  const mockThread = {
    id: 'thread-1',
    isThread: () => true,
    send: async () => ({}),
    members: { add: async () => {} },
  };

  const mockSummaryChannel = {
    isThread: () => false,
    send: async () => ({}),
    threads: {
      create: async () => mockThread,
    },
  };

  return {
    guilds: {
      fetch: async () => ({
        channels: {
          fetch: async (channelId: string) => (channelId === 'vc-1' ? voiceChannel : null),
        },
      }),
    },
    channels: {
      fetch: async (channelId: string) => (channelId === 'thread-1' ? mockThread : mockSummaryChannel),
    },
  } as unknown as Client;
}

describe('roleCron.runRoleCronTick', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');
  const nowMs = now.getTime();
  const oldAcc = nowMs - 30 * 86_400_000;
  const oldGuild = nowMs - 72 * 3_600_000;

  beforeEach(() => {
    resetMockStore();
  });

  it('khi host có mặt trong voice nhưng streaming = false và selfVideo = false: KHÔNG tăng streamSeconds và KHÔNG ghi nhận viewer', async () => {
    seedSettings(baseSettings());
    const booking = seedBooking({
      id: 'b-not-streaming',
      userId: 'host-1',
      roomId: 'room-1',
      status: 'LIVE',
      startTime: new Date(nowMs - 1800_000),
      endTime: new Date(nowMs + 1800_000),
      actualStartAt: new Date(nowMs - 600_000),
      streamSeconds: 120,
    });

    const client = makeMockClient([
      makeVoiceMember({ id: 'host-1', streaming: false, selfVideo: false, createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'v-1', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'v-2', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
    ]);

    await runRoleCronTick(client, now);

    const updated = mockStore.bookings.find((b) => b.id === booking.id)!;
    assert.equal(updated.streamSeconds, 120);
    assert.equal(mockStore.bookingViewers.length, 0);
    // peakViewers vẫn cập nhật rawViewerCount
    assert.equal(updated.peakViewers, 2);
  });

  it('khi host đang stream: tự động ghi actualStartAt nếu null, tăng streamSeconds, cộng dwellSeconds cho viewer đạt chuẩn và lọc bot/deaf/new-acc/other-host', async () => {
    seedSettings(baseSettings());
    const booking = seedBooking({
      id: 'b-streaming',
      userId: 'host-1',
      roomId: 'room-1',
      status: 'LIVE',
      startTime: new Date(nowMs - 1800_000),
      endTime: new Date(nowMs + 1800_000),
      actualStartAt: null, // giả lập bot restart recovery
      streamSeconds: 0,
    });
    // Một host khác đang LIVE ở phòng khác
    seedBooking({
      id: 'b-other-host',
      userId: 'host-2',
      roomId: 'room-2',
      status: 'LIVE',
      startTime: new Date(nowMs - 1800_000),
      endTime: new Date(nowMs + 1800_000),
    });

    const client = makeMockClient([
      makeVoiceMember({ id: 'host-1', streaming: true, createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'bot-1', bot: true, createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'v-deaf', selfDeaf: true, createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'v-new', createdTimestamp: nowMs - 2 * 86_400_000, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'host-2', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'v-ok-1', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'v-ok-2', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
    ]);

    await runRoleCronTick(client, now);

    const updated = mockStore.bookings.find((b) => b.id === booking.id)!;
    assert.ok(updated.actualStartAt !== null);
    assert.equal(updated.streamSeconds, 60);

    const viewers = mockStore.bookingViewers.filter((v) => v.bookingId === booking.id);
    assert.deepEqual(
      viewers.map((v) => ({ userId: v.userId, dwellSeconds: v.dwellSeconds })),
      [
        { userId: 'v-ok-1', dwellSeconds: 60 },
        { userId: 'v-ok-2', dwellSeconds: 60 },
      ]
    );
  });

  it('ở tick cuối (endTime <= now): sampling chạy TRƯỚC finalizeLiveEnd nên tick cuối được tính vào kết quả hợp lệ', async () => {
    seedSettings(baseSettings({ minLiveDurationMinutes: 45, minViewers: 3, minViewerDwellMinutes: 5 }));
    const booking = seedBooking({
      id: 'b-final-tick',
      userId: 'host-1',
      roomId: 'room-1',
      status: 'LIVE',
      roleGranted: true,
      startTime: new Date(nowMs - 3_600_000),
      endTime: now, // đúng lúc hết giờ
      actualStartAt: new Date(nowMs - 2_700_000),
      streamSeconds: 2640, // 44 phút -> thiếu 1 tick 60s để đủ 45 phút
      peakViewers: 3,
    });
    // 3 viewer đã có 240s -> thiếu 1 tick 60s để đủ 300s (5 phút)
    seedViewer({ bookingId: booking.id, userId: 'v-1', dwellSeconds: 240 });
    seedViewer({ bookingId: booking.id, userId: 'v-2', dwellSeconds: 240 });
    seedViewer({ bookingId: booking.id, userId: 'v-3', dwellSeconds: 240 });

    const client = makeMockClient([
      makeVoiceMember({ id: 'host-1', selfVideo: true, createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'v-1', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'v-2', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'v-3', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
    ]);

    await runRoleCronTick(client, now);

    const finalized = mockStore.bookings.find((b) => b.id === booking.id)!;
    assert.equal(finalized.status, 'DONE');
    assert.equal(finalized.endReason, 'AUTO_TIMEOUT');
    assert.equal(finalized.streamSeconds, 2700);
    assert.equal(finalized.qualifiedViewers, 3);
    assert.equal(finalized.isValidLive, true);
  });

  it('khi host chỉ bật camera (selfVideo: true, streaming: false): vẫn tính vào streamSeconds và dwellSeconds của viewer', async () => {
    seedSettings(baseSettings());
    const booking = seedBooking({
      id: 'b-cam-only',
      userId: 'host-1',
      roomId: 'room-1',
      status: 'LIVE',
      startTime: new Date(nowMs - 1800_000),
      endTime: new Date(nowMs + 1800_000),
      actualStartAt: new Date(nowMs - 600_000),
      streamSeconds: 0,
    });

    const client = makeMockClient([
      makeVoiceMember({ id: 'host-1', streaming: false, selfVideo: true, createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeVoiceMember({ id: 'v-1', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
    ]);

    await runRoleCronTick(client, now);

    const updated = mockStore.bookings.find((b) => b.id === booking.id)!;
    assert.equal(updated.streamSeconds, 60);
    const viewer = mockStore.bookingViewers.find((v) => v.bookingId === booking.id && v.userId === 'v-1');
    assert.equal(viewer?.dwellSeconds, 60);
  });

  it('khi host tắt rồi bật lại stream/cam qua nhiều tick: streamSeconds cộng dồn liên tục không bị reset', async () => {
    seedSettings(baseSettings());
    const booking = seedBooking({
      id: 'b-toggle',
      userId: 'host-1',
      roomId: 'room-1',
      status: 'LIVE',
      startTime: new Date(nowMs - 1800_000),
      endTime: new Date(nowMs + 1800_000),
      actualStartAt: new Date(nowMs - 600_000),
      streamSeconds: 0,
    });

    const host = makeVoiceMember({
      id: 'host-1',
      streaming: true,
      selfVideo: false,
      createdTimestamp: oldAcc,
      joinedTimestamp: oldGuild,
    });
    const viewer = makeVoiceMember({ id: 'v-1', createdTimestamp: oldAcc, joinedTimestamp: oldGuild });
    const client = makeMockClient([host, viewer]);

    // Tick 1: streaming = true -> 60s
    await runRoleCronTick(client, new Date(nowMs + 60_000));
    assert.equal(mockStore.bookings.find((b) => b.id === booking.id)!.streamSeconds, 60);

    // Tick 2: tắt cả stream và cam -> giữ nguyên 60s
    host.voice.streaming = false;
    host.voice.selfVideo = false;
    await runRoleCronTick(client, new Date(nowMs + 120_000));
    assert.equal(mockStore.bookings.find((b) => b.id === booking.id)!.streamSeconds, 60);

    // Tick 3: bật lại chỉ camera -> cộng dồn lên 120s
    host.voice.selfVideo = true;
    await runRoleCronTick(client, new Date(nowMs + 180_000));
    assert.equal(mockStore.bookings.find((b) => b.id === booking.id)!.streamSeconds, 120);

    // Tick 4: tắt lại -> vẫn 120s
    host.voice.selfVideo = false;
    await runRoleCronTick(client, new Date(nowMs + 240_000));
    assert.equal(mockStore.bookings.find((b) => b.id === booking.id)!.streamSeconds, 120);

    // Tick 5: bật lại stream -> cộng dồn lên 180s
    host.voice.streaming = true;
    await runRoleCronTick(client, new Date(nowMs + 300_000));
    assert.equal(mockStore.bookings.find((b) => b.id === booking.id)!.streamSeconds, 180);
  });
});
