import { ActionRowBuilder, ButtonInteraction, StringSelectMenuBuilder } from 'discord.js';
import dayjs from 'dayjs';
import { getSettings } from '../../services/settingsService';
import { getBookableDays, getDayLabel, getValidTimeSlotsForDay, isRegistrationOpen } from '../../utils/time';
import { getUserLanguage } from '../../services/userPreferenceService';
import { t } from '../../i18n';

export async function handleRegisterButton(interaction: ButtonInteraction) {
  console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) clicked register button.`);
  const [settings, lang] = await Promise.all([getSettings(), getUserLanguage(interaction.user.id)]);

  if (!(await isRegistrationOpen())) {
    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) registration rejected: registration is closed.`);
    await interaction.reply({
      content: t('register.closed', lang, { openDay: getDayLabel(settings.registrationWindow.openDay, lang) }),
      ephemeral: true,
    });
    return;
  }

  if (settings.rooms.length === 0) {
    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) registration rejected: no rooms configured.`);
    await interaction.reply({
      content: t('register.noRooms', lang),
      ephemeral: true,
    });
    return;
  }

  // Chỉ hiện những ngày còn ít nhất 1 khung giờ về mặt lý thuyết hợp lệ (chưa xét phòng cụ thể)
  const bookableDays = await getBookableDays();
  const dayChecks = await Promise.all(
    bookableDays.map(async (d) => ({ d, hasCandidate: (await getValidTimeSlotsForDay(d)).length > 0 }))
  );
  const days = dayChecks.filter((x) => x.hasCandidate).map((x) => x.d);

  if (days.length === 0) {
    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) registration rejected: no valid days.`);
    await interaction.reply({ content: t('register.noValidDays', lang), ephemeral: true });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('reg_select_date')
    .setPlaceholder(t('register.selectDatePlaceholder', lang))
    .addOptions(days.map((d) => ({ label: dayjs(d).locale(lang).format('dddd, DD/MM/YYYY'), value: d })));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  await interaction.reply({
    content: t('register.step1', lang),
    components: [row],
    ephemeral: true,
  });
}
