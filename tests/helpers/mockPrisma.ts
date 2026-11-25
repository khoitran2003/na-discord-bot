// Thiết lập env giả trước khi bất kỳ module nào trong src/ import config.ts
process.env.DISCORD_TOKEN ??= 'test-token';
process.env.DISCORD_CLIENT_ID ??= 'test-client-id';
process.env.DISCORD_GUILD_ID ??= 'test-guild-id';
process.env.REGISTER_CHANNEL_ID ??= 'test-register-channel';
process.env.SUMMARY_CHANNEL_ID ??= 'test-summary-channel';
process.env.ADMIN_PORTAL_CHANNEL_ID ??= 'test-admin-portal-channel';
process.env.NOTI_CHANNEL_ID ??= 'test-noti-channel';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

import { mock } from 'node:test';
import { prisma } from '../../src/prisma';
import { clearSettingsCache } from '../../src/services/settingsService';

export interface MockBookingRecord {
  id: string;
  userId: string;
  username: string;
  ingameRoleId: bigint | null;
  roomId: string;
  startTime: Date;
  endTime: Date;
  status: string;
  roleGranted: boolean;
  livestreamContent: string;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  peakViewers: number;
  streamSeconds: number;
  qualifiedViewers: number;
  suspicious: boolean;
  suspiciousReason: string | null;
  isValidLive: boolean | null;
  endReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockBookingViewerRecord {
  bookingId: string;
  userId: string;
  dwellSeconds: number;
  firstSeen: Date;
}

export interface MockSettingRecord {
  id: string;
  data: string;
  updatedAt: Date;
}

export interface MockUserThreadRecord {
  userId: string;
  threadId: string;
  createdAt: Date;
}

export interface MockUserPreferenceRecord {
  userId: string;
  language: string;
}

export const mockStore = {
  bookings: [] as MockBookingRecord[],
  bookingViewers: [] as MockBookingViewerRecord[],
  settings: [] as MockSettingRecord[],
  userThreads: [] as MockUserThreadRecord[],
  userPreferences: [] as MockUserPreferenceRecord[],
};

let bookingSeq = 0;

function matchScalarOrFilter(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (expected === null) return actual === null;
  if (typeof expected === 'object' && !(expected instanceof Date)) {
    const f = expected as Record<string, unknown>;
    if ('in' in f && Array.isArray(f.in)) {
      if (!f.in.includes(actual)) return false;
    }
    if ('not' in f) {
      if (actual === f.not) return false;
    }
    if ('lt' in f) {
      const a = actual instanceof Date ? actual.getTime() : Number(actual);
      const b = f.lt instanceof Date ? f.lt.getTime() : Number(f.lt);
      if (!(a < b)) return false;
    }
    if ('lte' in f) {
      const a = actual instanceof Date ? actual.getTime() : Number(actual);
      const b = f.lte instanceof Date ? f.lte.getTime() : Number(f.lte);
      if (!(a <= b)) return false;
    }
    if ('gt' in f) {
      const a = actual instanceof Date ? actual.getTime() : Number(actual);
      const b = f.gt instanceof Date ? f.gt.getTime() : Number(f.gt);
      if (!(a > b)) return false;
    }
    if ('gte' in f) {
      const a = actual instanceof Date ? actual.getTime() : Number(actual);
      const b = f.gte instanceof Date ? f.gte.getTime() : Number(f.gte);
      if (!(a >= b)) return false;
    }
    return true;
  }
  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();
  }
  return actual === expected;
}

function matchBookingWhere(record: MockBookingRecord, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (!matchScalarOrFilter((record as unknown as Record<string, unknown>)[key], value)) {
      return false;
    }
  }
  return true;
}

function matchViewerWhere(record: MockBookingViewerRecord, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (key === 'booking' && value && typeof value === 'object') {
      const parent = mockStore.bookings.find((b) => b.id === record.bookingId);
      if (!parent || !matchBookingWhere(parent, value as Record<string, unknown>)) {
        return false;
      }
      continue;
    }
    if (!matchScalarOrFilter((record as unknown as Record<string, unknown>)[key], value)) {
      return false;
    }
  }
  return true;
}

function applyBookingUpdate(record: MockBookingRecord, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date) && 'increment' in value) {
      const current = Number((record as unknown as Record<string, unknown>)[key] ?? 0);
      (record as unknown as Record<string, unknown>)[key] = current + Number((value as { increment: number }).increment);
    } else if (value !== undefined) {
      (record as unknown as Record<string, unknown>)[key] = value;
    }
  }
  record.updatedAt = new Date();
}

export function installPrismaMocks(): void {
  const p = prisma as unknown as Record<string, unknown>;

  p.$transaction = mock.fn(async (arg: unknown) => {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    if (typeof arg === 'function') {
      return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
    }
    return [];
  });

  const bookingDelegate = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    count: async () => 0,
    create: async () => ({}),
    update: async () => ({}),
    updateMany: async () => ({ count: 0 }),
  };
  p.booking = bookingDelegate;

  const bookingViewerDelegate = {
    findMany: async () => [],
    upsert: async () => ({}),
    groupBy: async () => [],
  };
  p.bookingViewer = bookingViewerDelegate;

  const settingDelegate = {
    findUnique: async () => null,
    create: async () => ({}),
    update: async () => ({}),
    upsert: async () => ({}),
  };
  p.setting = settingDelegate;

  const userThreadDelegate = {
    findUnique: async () => null,
    upsert: async () => ({}),
  };
  p.userThread = userThreadDelegate;

  const userPreferenceDelegate = {
    findUnique: async () => null,
    upsert: async () => ({}),
  };
  p.userPreference = userPreferenceDelegate;

  mock.method(bookingDelegate, 'findMany', async (args?: {
    where?: Record<string, unknown>;
    include?: { viewers?: unknown };
    select?: Record<string, boolean>;
    orderBy?: unknown;
    skip?: number;
    take?: number;
  }) => {
    let rows = mockStore.bookings.filter((b) => matchBookingWhere(b, args?.where));

    if (args?.orderBy) {
      const orders = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
      rows = [...rows].sort((a, b) => {
        for (const ord of orders as Record<string, 'asc' | 'desc'>[]) {
          for (const [field, dir] of Object.entries(ord)) {
            const va = (a as unknown as Record<string, unknown>)[field];
            const vb = (b as unknown as Record<string, unknown>)[field];
            const cmp =
              va instanceof Date && vb instanceof Date
                ? va.getTime() - vb.getTime()
                : String(va ?? '').localeCompare(String(vb ?? ''));
            if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
          }
        }
        return 0;
      });
    }

    if (typeof args?.skip === 'number') rows = rows.slice(args.skip);
    if (typeof args?.take === 'number') rows = rows.slice(0, args.take);

    return rows.map((row) => {
      if (args?.select) {
        const selected: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args.select)) {
          if (v) selected[k] = (row as unknown as Record<string, unknown>)[k];
        }
        return selected;
      }
      if (args?.include?.viewers) {
        const viewers = mockStore.bookingViewers.filter((v) => v.bookingId === row.id);
        return { ...row, viewers };
      }
      return { ...row };
    });
  });

  mock.method(bookingDelegate, 'findFirst', async (args?: { where?: Record<string, unknown> }) => {
    const found = mockStore.bookings.find((b) => matchBookingWhere(b, args?.where));
    return found ? { ...found } : null;
  });

  mock.method(bookingDelegate, 'findUnique', async (args: { where: { id: string } }) => {
    const found = mockStore.bookings.find((b) => b.id === args.where.id);
    return found ? { ...found } : null;
  });

  mock.method(bookingDelegate, 'count', async (args?: { where?: Record<string, unknown> }) => {
    return mockStore.bookings.filter((b) => matchBookingWhere(b, args?.where)).length;
  });

  mock.method(bookingDelegate, 'create', async (args: { data: Partial<MockBookingRecord> }) => {
    bookingSeq += 1;
    const now = new Date();
    const record: MockBookingRecord = {
      id: args.data.id ?? `booking-${bookingSeq}`,
      userId: args.data.userId ?? 'user-1',
      username: args.data.username ?? 'user1',
      ingameRoleId: args.data.ingameRoleId ?? null,
      roomId: args.data.roomId ?? 'room-1',
      startTime: args.data.startTime ?? now,
      endTime: args.data.endTime ?? new Date(now.getTime() + 3_600_000),
      status: args.data.status ?? 'PENDING',
      roleGranted: args.data.roleGranted ?? false,
      livestreamContent: args.data.livestreamContent ?? '',
      actualStartAt: args.data.actualStartAt ?? null,
      actualEndAt: args.data.actualEndAt ?? null,
      peakViewers: args.data.peakViewers ?? 0,
      streamSeconds: args.data.streamSeconds ?? 0,
      qualifiedViewers: args.data.qualifiedViewers ?? 0,
      suspicious: args.data.suspicious ?? false,
      suspiciousReason: args.data.suspiciousReason ?? null,
      isValidLive: args.data.isValidLive ?? null,
      endReason: args.data.endReason ?? null,
      createdAt: args.data.createdAt ?? now,
      updatedAt: args.data.updatedAt ?? now,
    };
    mockStore.bookings.push(record);
    return { ...record };
  });

  mock.method(bookingDelegate, 'update', async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    const record = mockStore.bookings.find((b) => b.id === args.where.id);
    if (!record) throw new Error(`Booking not found: ${args.where.id}`);
    applyBookingUpdate(record, args.data);
    return { ...record };
  });

  mock.method(bookingDelegate, 'updateMany', async (args: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
    let count = 0;
    for (const record of mockStore.bookings) {
      if (matchBookingWhere(record, args.where)) {
        applyBookingUpdate(record, args.data);
        count += 1;
      }
    }
    return { count };
  });

  mock.method(bookingViewerDelegate, 'findMany', async (args?: { where?: Record<string, unknown> }) => {
    return mockStore.bookingViewers.filter((v) => matchViewerWhere(v, args?.where)).map((v) => ({ ...v }));
  });

  mock.method(
    prisma.bookingViewer,
    'upsert',
    async (args: {
      where: { bookingId_userId: { bookingId: string; userId: string } };
      create: Partial<MockBookingViewerRecord>;
      update: Record<string, unknown>;
    }) => {
      const { bookingId, userId } = args.where.bookingId_userId;
      let record = mockStore.bookingViewers.find((v) => v.bookingId === bookingId && v.userId === userId);
      if (!record) {
        record = {
          bookingId,
          userId,
          dwellSeconds: args.create.dwellSeconds ?? 0,
          firstSeen: args.create.firstSeen ?? new Date(),
        };
        mockStore.bookingViewers.push(record);
      } else {
        for (const [key, value] of Object.entries(args.update)) {
          if (value && typeof value === 'object' && 'increment' in value) {
            const current = Number((record as unknown as Record<string, unknown>)[key] ?? 0);
            (record as unknown as Record<string, unknown>)[key] =
              current + Number((value as { increment: number }).increment);
          } else if (value !== undefined) {
            (record as unknown as Record<string, unknown>)[key] = value;
          }
        }
      }
      return { ...record };
    }
  );

  mock.method(
    prisma.bookingViewer,
    'groupBy',
    async (args: { by: string[]; where?: Record<string, unknown>; _count?: { bookingId?: boolean } }) => {
      const matching = mockStore.bookingViewers.filter((v) => matchViewerWhere(v, args.where));
      const counts = new Map<string, Set<string>>();
      for (const row of matching) {
        if (!counts.has(row.userId)) counts.set(row.userId, new Set());
        counts.get(row.userId)!.add(row.bookingId);
      }
      return [...counts.entries()].map(([userId, bookingIds]) => ({
        userId,
        _count: { bookingId: bookingIds.size },
      }));
    }
  );

  mock.method(settingDelegate, 'findUnique', async (args: { where: { id: string } }) => {
    const found = mockStore.settings.find((s) => s.id === args.where.id);
    return found ? { ...found } : null;
  });

  mock.method(settingDelegate, 'create', async (args: { data: { id: string; data: string } }) => {
    const record: MockSettingRecord = { id: args.data.id, data: args.data.data, updatedAt: new Date() };
    mockStore.settings.push(record);
    return { ...record };
  });

  mock.method(settingDelegate, 'update', async (args: { where: { id: string }; data: { data: string } }) => {
    const record = mockStore.settings.find((s) => s.id === args.where.id);
    if (!record) throw new Error(`Setting not found: ${args.where.id}`);
    record.data = args.data.data;
    record.updatedAt = new Date();
    return { ...record };
  });

  mock.method(
    prisma.setting,
    'upsert',
    async (args: { where: { id: string }; update: { data: string }; create: { id: string; data: string } }) => {
      let record = mockStore.settings.find((s) => s.id === args.where.id);
      if (record) {
        record.data = args.update.data;
        record.updatedAt = new Date();
      } else {
        record = { id: args.create.id, data: args.create.data, updatedAt: new Date() };
        mockStore.settings.push(record);
      }
      return { ...record };
    }
  );

  mock.method(userThreadDelegate, 'findUnique', async (args: { where: { userId: string } }) => {
    const found = mockStore.userThreads.find((t) => t.userId === args.where.userId);
    return found ? { ...found } : null;
  });

  mock.method(
    prisma.userThread,
    'upsert',
    async (args: { where: { userId: string }; update: { threadId: string }; create: { userId: string; threadId: string } }) => {
      let record = mockStore.userThreads.find((t) => t.userId === args.where.userId);
      if (record) {
        record.threadId = args.update.threadId;
      } else {
        record = { userId: args.create.userId, threadId: args.create.threadId, createdAt: new Date() };
        mockStore.userThreads.push(record);
      }
      return { ...record };
    }
  );

  mock.method(userPreferenceDelegate, 'findUnique', async (args: { where: { userId: string } }) => {
    const found = mockStore.userPreferences.find((p) => p.userId === args.where.userId);
    return found ? { ...found } : null;
  });

  mock.method(
    prisma.userPreference,
    'upsert',
    async (args: { where: { userId: string }; update: { language: string }; create: { userId: string; language: string } }) => {
      let record = mockStore.userPreferences.find((p) => p.userId === args.where.userId);
      if (record) {
        record.language = args.update.language;
      } else {
        record = { userId: args.create.userId, language: args.create.language };
        mockStore.userPreferences.push(record);
      }
      return { ...record };
    }
  );
}

export function resetMockStore(): void {
  mockStore.bookings.length = 0;
  mockStore.bookingViewers.length = 0;
  mockStore.settings.length = 0;
  mockStore.userThreads.length = 0;
  mockStore.userPreferences.length = 0;
  bookingSeq = 0;
  clearSettingsCache();
}

export function seedBooking(overrides: Partial<MockBookingRecord> = {}): MockBookingRecord {
  bookingSeq += 1;
  const now = new Date();
  const record: MockBookingRecord = {
    id: overrides.id ?? `booking-${bookingSeq}`,
    userId: overrides.userId ?? 'host-1',
    username: overrides.username ?? 'host1',
    ingameRoleId: overrides.ingameRoleId ?? null,
    roomId: overrides.roomId ?? 'room-1',
    startTime: overrides.startTime ?? new Date(now.getTime() - 3_600_000),
    endTime: overrides.endTime ?? now,
    status: overrides.status ?? 'LIVE',
    roleGranted: overrides.roleGranted ?? true,
    livestreamContent: overrides.livestreamContent ?? 'Test Stream',
    actualStartAt: overrides.actualStartAt !== undefined ? overrides.actualStartAt : new Date(now.getTime() - 3_600_000),
    actualEndAt: overrides.actualEndAt ?? null,
    peakViewers: overrides.peakViewers ?? 0,
    streamSeconds: overrides.streamSeconds ?? 0,
    qualifiedViewers: overrides.qualifiedViewers ?? 0,
    suspicious: overrides.suspicious ?? false,
    suspiciousReason: overrides.suspiciousReason ?? null,
    isValidLive: overrides.isValidLive ?? null,
    endReason: overrides.endReason ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
  mockStore.bookings.push(record);
  return record;
}

export function seedViewer(overrides: Partial<MockBookingViewerRecord> & { bookingId: string; userId: string }): MockBookingViewerRecord {
  const record: MockBookingViewerRecord = {
    bookingId: overrides.bookingId,
    userId: overrides.userId,
    dwellSeconds: overrides.dwellSeconds ?? 0,
    firstSeen: overrides.firstSeen ?? new Date(),
  };
  mockStore.bookingViewers.push(record);
  return record;
}

export function seedSettings(data: Record<string, unknown>): void {
  clearSettingsCache();
  const idx = mockStore.settings.findIndex((s) => s.id === 'global');
  const row: MockSettingRecord = { id: 'global', data: JSON.stringify(data), updatedAt: new Date() };
  if (idx >= 0) {
    mockStore.settings[idx] = row;
  } else {
    mockStore.settings.push(row);
  }
}

installPrismaMocks();
