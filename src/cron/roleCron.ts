import cron from 'node-cron';
import { Client } from 'discord.js';
import { CRON_INTERVAL_MINUTES } from '../config';
import {
  findBookingsToGrant,
  findBookingsToRevoke,
  markAsLive,
  getLiveBookings,
  updatePeakViewersIfHigher,
  finalizeLiveEnd,
  LiveValidityResult,
} from '../services/bookingService';
import { grantRoomAccess, revokeRoomAccess, countRoomViewers, disconnectHostIfPresent } from '../services/roleService';
import { getSettings } from '../services/settingsService';
import { logBookingEvent, logAdminAudit } from '../services/userThreadService';
import { refreshPublicTimeline } from '../services/publicTimelineService';
import { getUserLanguage } from '../services/userPreferenceService';
import { Lang, t } from '../i18n';
import { formatDateTimeVN } from '../utils/time';

function formatResultText(result: LiveValidityResult, lang: Lang): string {
  return t(result.isValid ? 'validity.valid' : 'validity.invalid', lang, {
    duration: result.durationMinutes,
    viewers: result.peakViewers,
  });
}

// Admin audit vẫn giữ tiếng Việt cố định (Admin Portal không đa ngôn ngữ)
function formatResultTextVi(result: LiveValidityResult): string {
  return formatResultText(result, 'vi');
}

export function startRoleCron(client: Client) {
  const expr = `*/${CRON_INTERVAL_MINUTES} * * * *`;

  cron.schedule(expr, async () => {
    const now = new Date();
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

    // Cron 2: hết giờ live -> kick khỏi voice channel (nếu còn ở đó), thu quyền, đánh giá hợp lệ
    const toRevoke = await findBookingsToRevoke(now);
    for (const booking of toRevoke) {
      try {
        await disconnectHostIfPresent(client, booking.userId, booking.roomId);

        const endAt = new Date();
        const result = await finalizeLiveEnd(booking, endAt, 'AUTO_TIMEOUT');

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
        await logAdminAudit(
          client,
          `⏰ <@${booking.userId}> hết giờ live tại **${roomLabel(booking.roomId)}**.\nKết quả: ${formatResultTextVi(result)}`
        );
      } catch (err) {
        console.error(`[roleCron] Lỗi xử lý kết thúc live cho ${booking.userId}:`, err);
      }
    }

    // Chỉ refresh Timeline top-level 1 lần/tick dù có bao nhiêu booking đổi trạng thái (kết quả cuối như nhau, đỡ tốn API call)
    if (timelineDirty) {
      await refreshPublicTimeline(client).catch((err) => console.error('[roleCron] Lỗi refresh public timeline:', err));
    }

    // Cron 3: đo đỉnh viewer cho các booking đang LIVE (sampling theo chu kỳ cron, xem note ở roleCron về độ chính xác)
    const liveBookings = await getLiveBookings();
    for (const booking of liveBookings) {
      try {
        const viewers = await countRoomViewers(client, booking.roomId, booking.userId);
        if (viewers !== null) {
          await updatePeakViewersIfHigher(booking.id, viewers);
        }
      } catch (err) {
        console.error(`[roleCron] Lỗi đo viewer cho booking ${booking.id}:`, err);
      }
    }
  });

  console.log(`[roleCron] Đã khởi động, chạy mỗi ${CRON_INTERVAL_MINUTES} phút.`);
}
