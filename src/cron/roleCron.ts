import cron from 'node-cron';
import { Client } from 'discord.js';
import { CRON_INTERVAL_MINUTES } from '../config';
import {
  findBookingsToGrant,
  findBookingsToRevoke,
  markAsLive,
  getLiveBookings,
  recordActualStart,
  recordStreamTick,
  recordViewerTicks,
  updatePeakViewersIfHigher,
  finalizeLiveEnd,
  LiveValidityResult,
} from '../services/bookingService';
import { grantRoomAccess, revokeRoomAccess, sampleRoom, disconnectHostIfPresent } from '../services/roleService';
import { getSettings } from '../services/settingsService';
import { logBookingEvent, logAdminAudit } from '../services/userThreadService';
import { refreshPublicTimeline } from '../services/publicTimelineService';
import { getUserLanguage } from '../services/userPreferenceService';
import { Lang, t } from '../i18n';
import { formatDateTimeVN } from '../utils/time';

function formatResultText(result: LiveValidityResult, lang: Lang): string {
  return t(result.isValid ? 'validity.valid' : 'validity.invalid', lang, {
    duration: result.durationMinutes,
    viewers: result.qualifiedViewers,
    peak: result.peakViewers,
  });
}

// Admin audit vẫn giữ tiếng Việt cố định (Admin Portal không đa ngôn ngữ)
function formatResultTextVi(result: LiveValidityResult): string {
  return formatResultText(result, 'vi');
}

export async function runRoleCronTick(client: Client, now = new Date()): Promise<void> {
  const settings = await getSettings();
  const roomLabel = (roomId: string) => settings.rooms.find((r) => r.id === roomId)?.label ?? roomId;
  let timelineDirty = false;

  // Cron 1: cấp quyền cho slot vừa đến giờ
  const toGrant = await findBookingsToGrant(now);
  for (const booking of toGrant) {
    try {
      await grantRoomAccess(client, booking.userId, booking.roomId);
      await markAsLive(booking.id);
      timelineDirty = true;
      console.log(`[roleCron] Đã cấp quyền cho ${booking.userId} (booking ${booking.id})`);
      const grantLang = await getUserLanguage(booking.userId);
      await logBookingEvent(
        client,
        booking.userId,
        booking.username,
        t('log.liveStarted', grantLang, {
          room: roomLabel(booking.roomId),
          start: formatDateTimeVN(booking.startTime),
          end: formatDateTimeVN(booking.endTime),
        })
      );
      await logAdminAudit(
        client,
        `🔴 <@${booking.userId}> đã bắt đầu live — **${roomLabel(booking.roomId)}** — ${formatDateTimeVN(booking.startTime)}→${formatDateTimeVN(booking.endTime)}`
      );
    } catch (err) {
      console.error(`[roleCron] Lỗi cấp quyền cho ${booking.userId}:`, err);
    }
  }

  // Cron 3 (chạy trước Cron 2): lấy mẫu trạng thái host + viewer đủ điều kiện để không mất tick cuối trước khi finalize
  const liveBookings = await getLiveBookings();
  const activeHostUserIds = new Set(liveBookings.map((b) => b.userId));
  const tickSeconds = CRON_INTERVAL_MINUTES * 60;

  for (const booking of liveBookings) {
    try {
      const sample = await sampleRoom(client, booking.roomId, booking.userId, {
        minAccountAgeDays: settings.minViewerAccountAgeDays,
        minGuildAgeHours: settings.minViewerGuildAgeHours,
        activeHostUserIds,
        nowMs: now.getTime(),
      });
      if (!sample || !sample.hostPresent) continue;

      if (!booking.actualStartAt) {
        await recordActualStart(booking.id);
      }
      if (sample.rawViewerCount > 0) {
        await updatePeakViewersIfHigher(booking.id, sample.rawViewerCount);
      }

      const isStreaming = settings.requireHostStreaming ? sample.hostStreaming : true;
      if (isStreaming) {
        await recordStreamTick(booking.id, tickSeconds);
        booking.streamSeconds += tickSeconds;
        if (sample.qualifiedMembers.length > 0) {
          await recordViewerTicks(
            booking.id,
            sample.qualifiedMembers.map((m) => m.id),
            tickSeconds
          );
        }
      }
    } catch (err) {
      console.error(`[roleCron] Lỗi sampling booking ${booking.id}:`, err);
    }
  }

  // Cron 2: hết giờ live -> kick khỏi voice channel (nếu còn ở đó), thu quyền, đánh giá hợp lệ
  const toRevoke = await findBookingsToRevoke(now);
  for (const booking of toRevoke) {
    try {
      await disconnectHostIfPresent(client, booking.userId, booking.roomId);

      const result = await finalizeLiveEnd(booking, now, 'AUTO_TIMEOUT');

      await revokeRoomAccess(client, booking.userId, booking.roomId);

      if (!result) continue; // đã được voiceStateUpdate xử lý gần như cùng lúc -> bỏ qua để tránh báo trùng

      timelineDirty = true;
      console.log(`[roleCron] Đã kết thúc live hết giờ cho ${booking.userId} (booking ${booking.id})`);
      const revokeLang = await getUserLanguage(booking.userId);
      await logBookingEvent(
        client,
        booking.userId,
        booking.username,
        t('log.liveEndedAuto', revokeLang, { room: roomLabel(booking.roomId), result: formatResultText(result, revokeLang) })
      );
      const suspiciousNote = result.suspicious && result.suspiciousReason ? `\n⚠️ Nghi ngờ: ${result.suspiciousReason}` : '';
      await logAdminAudit(
        client,
        `⏰ <@${booking.userId}> hết giờ live tại **${roomLabel(booking.roomId)}**.\nKết quả: ${formatResultTextVi(result)}${suspiciousNote}`
      );
    } catch (err) {
      console.error(`[roleCron] Lỗi xử lý kết thúc live cho ${booking.userId}:`, err);
    }
  }

  // Chỉ refresh Timeline top-level 1 lần/tick dù có bao nhiêu booking đổi trạng thái (kết quả cuối như nhau, đỡ tốn API call)
  if (timelineDirty) {
    await refreshPublicTimeline(client).catch((err) => console.error('[roleCron] Lỗi refresh public timeline:', err));
  }
}

export function startRoleCron(client: Client) {
  const expr = `*/${CRON_INTERVAL_MINUTES} * * * *`;

  cron.schedule(expr, () => runRoleCronTick(client));

  console.log(`[roleCron] Đã khởi động, chạy mỗi ${CRON_INTERVAL_MINUTES} phút.`);
}
