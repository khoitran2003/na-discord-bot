import { VoiceState } from 'discord.js';
import { getSettings } from '../services/settingsService';
import { findLiveBooking, recordActualStart, finalizeLiveEnd, LiveValidityResult } from '../services/bookingService';
import { revokeRoomAccess } from '../services/roleService';
import { logBookingEvent, logAdminAudit } from '../services/userThreadService';
import { refreshPublicTimeline } from '../services/publicTimelineService';
import { getUserLanguage } from '../services/userPreferenceService';
import { Lang, t } from '../i18n';

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

export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
  if (oldState.channelId === newState.channelId) return; // mute/deafen... không đổi channel -> bỏ qua

  try {
    const userId = newState.id;
    const settings = await getSettings();

    // User vừa VÀO 1 voice channel là phòng đang có booking LIVE của họ -> ghi nhận actualStartAt
    if (newState.channelId) {
      const room = settings.rooms.find((r) => r.voiceChannelId === newState.channelId);
      if (room) {
        const booking = await findLiveBooking(userId, room.id);
        if (booking && !booking.actualStartAt) {
          await recordActualStart(booking.id);
        }
      }
    }

    // User vừa RỜI 1 voice channel là phòng đang có booking LIVE của họ -> coi là chủ động kết thúc live
    if (oldState.channelId) {
      const room = settings.rooms.find((r) => r.voiceChannelId === oldState.channelId);
      if (!room) return;

      const booking = await findLiveBooking(userId, room.id);
      if (!booking) return; // rời voice channel nhưng không phải đang trong slot host live -> bỏ qua

      const endAt = new Date();
      const result = await finalizeLiveEnd(booking, endAt, 'MANUAL');
      if (!result) return; // đã được cron (hết giờ) xử lý gần như cùng lúc -> bỏ qua để tránh báo trùng

      await revokeRoomAccess(newState.client, userId, room.id).catch(() => {});

      const lang = await getUserLanguage(userId);
      await logBookingEvent(
        newState.client,
        userId,
        booking.username,
        t('log.liveEndedManual', lang, { room: room.label, result: formatResultText(result, lang) })
      );
      await logAdminAudit(
        newState.client,
        `🏁 <@${userId}> đã kết thúc live tại **${room.label}** (tự rời voice channel).\nKết quả: ${formatResultTextVi(result)}`
      );

      await refreshPublicTimeline(newState.client);
    }
  } catch (err) {
    console.error('[voiceStateUpdate] Lỗi xử lý:', err);
  }
}
