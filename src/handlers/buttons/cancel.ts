import { ActionRowBuilder, ButtonInteraction, StringSelectMenuBuilder, StringSelectMenuInteraction } from 'discord.js';
import { getUserActiveBookings, cancelBooking, BookingError } from '../../services/bookingService';
import { formatDateTimeVN } from '../../utils/time';
import { getSettings } from '../../services/settingsService';
import { logBookingEvent, logAdminAudit } from '../../services/userThreadService';
import { refreshPublicTimeline } from '../../services/publicTimelineService';
import { getUserLanguage } from '../../services/userPreferenceService';
import { t } from '../../i18n';

export async function handleCancelButton(interaction: ButtonInteraction) {
  console.log(`[Cancel] User ${interaction.user.tag} (${interaction.user.id}) clicked cancel button.`);
  const [bookings, lang] = await Promise.all([getUserActiveBookings(interaction.user.id), getUserLanguage(interaction.user.id)]);

  if (bookings.length === 0) {
    console.log(`[Cancel] User ${interaction.user.tag} (${interaction.user.id}) has no active bookings to cancel.`);
    await interaction.reply({ content: t('cancel.noActive', lang), ephemeral: true });
    return;
  }

  const settings = await getSettings();
  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_cancel')
    .setPlaceholder(t('cancel.selectPlaceholder', lang))
    .addOptions(
      bookings.map((b) => {
        const room = settings.rooms.find((r) => r.id === b.roomId)?.label ?? b.roomId;
        return {
          label: `${room} — ${formatDateTimeVN(b.startTime)}`,
          value: b.id,
        };
      })
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  await interaction.reply({ content: t('cancel.selectPrompt', lang), components: [row], ephemeral: true });
}

export async function handleCancelSelect(interaction: StringSelectMenuInteraction) {
  const bookingId = interaction.values[0];
  console.log(`[Cancel] User ${interaction.user.tag} (${interaction.user.id}) selected booking to cancel: ${bookingId}.`);
  const lang = await getUserLanguage(interaction.user.id);
  try {
    const booking = await cancelBooking(interaction.user.id, bookingId);
    console.log(`[Cancel] User ${interaction.user.tag} (${interaction.user.id}) cancelled booking ${bookingId} successfully.`);
    await interaction.update({ content: t('cancel.success', lang), components: [] });

    const settings = await getSettings();
    const room = settings.rooms.find((r) => r.id === booking.roomId)?.label ?? booking.roomId;
    const start = formatDateTimeVN(booking.startTime);
    const end = formatDateTimeVN(booking.endTime);

    await logBookingEvent(
      interaction.client,
      booking.userId,
      booking.username,
      t('log.selfCancel', lang, { room, start, end })
    );

    await logAdminAudit(
      interaction.client,
      `🗑️ <@${booking.userId}> đã tự hủy lịch — **${room}** — ${start}→${end}`
    );

    await refreshPublicTimeline(interaction.client).catch((err) =>
      console.error('[Cancel] Lỗi refresh public timeline (kiểm tra quyền Send Messages/Embed Links của bot tại SUMMARY_CHANNEL_ID):', err)
    );
  } catch (err) {
    if (err instanceof BookingError) {
      console.log(`[Cancel] User ${interaction.user.tag} (${interaction.user.id}) cancel failed (BookingError): ${err.code}`);
      await interaction.update({ content: `❌ ${t(`errors.${err.code}` as const, lang, err.params)}`, components: [] });
      return;
    }
    console.error(`[Cancel] User ${interaction.user.tag} (${interaction.user.id}) cancel failed with system error:`, err);
    await interaction.update({ content: t('errors.generic', lang), components: [] });
  }
}
