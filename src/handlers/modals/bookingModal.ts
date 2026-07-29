import { ModalSubmitInteraction } from 'discord.js';
import { getValidTimeSlotsForDay, formatDateTimeVN } from '../../utils/time';
import { createBooking, BookingError } from '../../services/bookingService';
import { getSettings } from '../../services/settingsService';
import { logBookingEvent, logAdminAudit } from '../../services/userThreadService';
import { refreshPublicTimeline } from '../../services/publicTimelineService';
import { getUserLanguage } from '../../services/userPreferenceService';
import { t } from '../../i18n';

export async function handleBookingModal(interaction: ModalSubmitInteraction) {
  if (!interaction.isFromMessage()) return;

  const parts = interaction.customId.split(':');
  const roomId = parts[1];
  const dateStr = parts[2];
  const slot = parts.slice(3).join(':');
  const livestreamContent = interaction.fields.getTextInputValue('livestream_content_input');
  console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) submitted booking modal (room: ${roomId}, date: ${dateStr}, slot: ${slot}, content: "${livestreamContent}").`);
  const [settings, lang] = await Promise.all([getSettings(), getUserLanguage(interaction.user.id)]);
  const room = settings.rooms.find((r) => r.id === roomId);

  const candidate = (await getValidTimeSlotsForDay(dateStr)).find((c) => c.slot === slot);
  if (!candidate) {
    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) modal slot candidate invalid: ${slot} (date: ${dateStr}, room: ${roomId}).`);
    await interaction.update({
      content: t('register.slotExpired', lang),
      components: [],
    });
    return;
  }

  try {
    const booking = await createBooking({
      userId: interaction.user.id,
      username: interaction.user.username,
      roomId,
      startTime: candidate.start,
      endTime: candidate.end,
      livestreamContent,
    });

    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) booking created successfully: ID ${booking.id}.`);

    const roomLabel = room?.label ?? roomId;
    const start = formatDateTimeVN(booking.startTime);
    const end = formatDateTimeVN(booking.endTime);
    const contentLine = booking.livestreamContent ? t('register.contentLine', lang, { content: booking.livestreamContent }) : '';
    const contentSuffix = booking.livestreamContent ? ` — ${booking.livestreamContent}` : '';

    await interaction.update({
      content: t('register.success', lang, { room: roomLabel, start, end, contentLine }),
      components: [],
    });

    await logBookingEvent(
      interaction.client,
      booking.userId,
      booking.username,
      t('log.registerSuccess', lang, { room: roomLabel, start, end, contentSuffix })
    );

    await logAdminAudit(
      interaction.client,
      `📥 <@${booking.userId}> vừa đăng ký lịch — **${roomLabel}** — ${start}→${end}${contentSuffix}`
    );

    await refreshPublicTimeline(interaction.client).catch((err) =>
      console.error('[Register] Lỗi refresh public timeline (kiểm tra quyền Send Messages/Embed Links của bot tại SUMMARY_CHANNEL_ID):', err)
    );
  } catch (err) {
    if (err instanceof BookingError) {
      console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) booking failed (BookingError): ${err.code}`);
      await interaction.update({ content: `❌ ${t(`errors.${err.code}` as const, lang, err.params)}`, components: [] });
      return;
    }
    console.error(`[Register] User ${interaction.user.tag} (${interaction.user.id}) booking failed with system error:`, err);
    await interaction.update({ content: t('errors.generic', lang), components: [] });
  }
}
