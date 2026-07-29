/**
 * One-time data migration: SQLite (dev.db) -> PostgreSQL (via Prisma).
 *
 * SQLite (Prisma) lưu DateTime dạng epoch-milliseconds và Boolean dạng 0/1,
 * nên KHÔNG thể COPY/CSV thẳng vào Postgres timestamp. Script đọc từ SQLite,
 * convert epoch-ms -> Date và 0/1 -> boolean, rồi upsert vào Postgres qua Prisma.
 * Upsert => chạy lại nhiều lần an toàn (idempotent), không nhân đôi dữ liệu.
 *
 * Cách chạy (từ thư mục dự án, sau khi đã prisma migrate deploy + generate):
 *   DATABASE_URL="postgresql://user:pass@host:port/db" \
 *     node scripts/migrate-sqlite-to-postgres.mjs ./prisma/dev.db
 *
 * Yêu cầu: Node >= 22 (dùng node:sqlite bundled).
 */
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';

const sqlitePath = process.argv[2] || './prisma/dev.db';
const db = new DatabaseSync(sqlitePath, { readOnly: true });
const prisma = new PrismaClient();

const toDate = (v) => (v == null ? null : new Date(Number(v)));
const toBool = (v) => (v == null ? null : Boolean(v));

async function main() {
  console.log(`[migrate] source sqlite: ${sqlitePath}`);

  // --- Booking ---
  const bookings = db.prepare('SELECT * FROM Booking').all();
  for (const b of bookings) {
    const data = {
      userId: b.userId,
      username: b.username,
      roomId: b.roomId,
      startTime: toDate(b.startTime),
      endTime: toDate(b.endTime),
      status: b.status,
      roleGranted: toBool(b.roleGranted),
      livestreamContent: b.livestream_content ?? '',
      actualStartAt: toDate(b.actualStartAt),
      actualEndAt: toDate(b.actualEndAt),
      peakViewers: b.peakViewers ?? 0,
      isValidLive: toBool(b.isValidLive),
      endReason: b.endReason ?? null,
      createdAt: toDate(b.createdAt),
      updatedAt: toDate(b.updatedAt),
    };
    await prisma.booking.upsert({ where: { id: b.id }, update: data, create: { id: b.id, ...data } });
  }
  console.log(`[migrate] Booking: ${bookings.length}`);

  // --- Setting ---
  const settings = db.prepare('SELECT * FROM Setting').all();
  for (const s of settings) {
    const data = { data: s.data, updatedAt: toDate(s.updatedAt) };
    await prisma.setting.upsert({ where: { id: s.id }, update: data, create: { id: s.id, ...data } });
  }
  console.log(`[migrate] Setting: ${settings.length}`);

  // --- UserThread ---
  const threads = db.prepare('SELECT * FROM UserThread').all();
  for (const t of threads) {
    const data = { threadId: t.threadId, createdAt: toDate(t.createdAt) };
    await prisma.userThread.upsert({ where: { userId: t.userId }, update: data, create: { userId: t.userId, ...data } });
  }
  console.log(`[migrate] UserThread: ${threads.length}`);

  // --- UserPreference (bảng mới, chỉ migrate nếu tồn tại ở nguồn) ---
  const hasPref = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='UserPreference'")
    .get();
  if (hasPref) {
    const prefs = db.prepare('SELECT * FROM UserPreference').all();
    for (const p of prefs) {
      await prisma.userPreference.upsert({
        where: { userId: p.userId },
        update: { language: p.language },
        create: { userId: p.userId, language: p.language },
      });
    }
    console.log(`[migrate] UserPreference: ${prefs.length}`);
  } else {
    console.log('[migrate] UserPreference: (không có ở nguồn, bỏ qua)');
  }

  console.log('[migrate] DONE');
}

main()
  .catch((e) => {
    console.error('[migrate] FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    db.close();
    await prisma.$disconnect();
  });
