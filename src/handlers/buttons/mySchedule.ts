import { ActionRowBuilder, ButtonInteraction, StringSelectMenuBuilder } from 'discord.js';
import { getUserActiveBookings } from '../../services/bookingService';
import { formatDateTimeVN } from '../../utils/time';
import { getSettings } from '../../services/settingsService';
import { getUserLanguage } from '../../services/userPreferenceService';
import { t } from '../../i18n';

export async function handleMyScheduleButton(interaction: ButtonInteraction) {
  console.log(`[MySchedule] User ${interaction.user.tag} (${interaction.user.id}) clicked my schedule button.`);
  const [bookings, lang] = await Promise.all([getUserActiveBookings(interaction.user.id), getUserLanguage(interaction.user.id)]);

  if (bookings.length === 0) {
    await interaction.reply({ content: t('schedule.empty', lang), ephemeral: true });
    return;
  }

  const settings = await getSettings();
  const lines = bookings.map((b) => {
    const room = settings.rooms.find((r) => r.id === b.roomId)?.label ?? b.roomId;
    const status = b.status === 'LIVE' ? t('schedule.statusLive', lang) : t('schedule.statusPending', lang);
    const contentSuffix = b.livestreamContent ? ` — *${b.livestreamContent}*` : '';
    const ingameRoleIdSuffix = b.ingameRoleId
      ? t('schedule.ingameRoleIdSuffix', lang, { ingameRoleId: b.ingameRoleId.toString() })
      : '';
    return `${status} — **${room}** — ${formatDateTimeVN(b.startTime)} → ${formatDateTimeVN(b.endTime)}${contentSuffix}${ingameRoleIdSuffix}`;
  });

  await interaction.reply({
    content: t('schedule.list', lang, { lines: lines.join('\n') }),
    ephemeral: true,
  });
}
