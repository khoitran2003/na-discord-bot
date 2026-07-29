import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import dayjs from 'dayjs';
import { getSettings } from '../../services/settingsService';
import { formatDateTimeVN, getBookableDays, getValidTimeSlotsForDay, isRegistrationOpen } from '../../utils/time';
import { getUserLanguage } from '../../services/userPreferenceService';
import { t } from '../../i18n';

export async function handleRegisterButton(interaction: ButtonInteraction) {
  const isPagination = interaction.customId.startsWith('btn_register_dates:');
  const requestedPage = isPagination ? Number(interaction.customId.split(':')[1]) : 0;
  const page = Number.isInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
  console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) clicked register button.`);
  const [settings, lang] = await Promise.all([getSettings(), getUserLanguage(interaction.user.id)]);

  if (!(await isRegistrationOpen())) {
    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) registration rejected: registration is closed.`);
    const content = t('register.closed', lang, {
      start: formatDateTimeVN(settings.registrationWindow.start),
      end: formatDateTimeVN(settings.registrationWindow.end),
    });
    if (isPagination) await interaction.update({ content, components: [] });
    else await interaction.reply({ content, ephemeral: true });
    return;
  }

  if (settings.rooms.length === 0) {
    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) registration rejected: no rooms configured.`);
    const content = t('register.noRooms', lang);
    if (isPagination) await interaction.update({ content, components: [] });
    else await interaction.reply({ content, ephemeral: true });
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
    const content = t('register.noValidDays', lang);
    if (isPagination) await interaction.update({ content, components: [] });
    else await interaction.reply({ content, ephemeral: true });
    return;
  }

  const pageSize = 25;
  const totalPages = Math.ceil(days.length / pageSize);
  const safePage = Math.min(page, totalPages - 1);
  const chunk = days.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`reg_select_date:${safePage}`)
    .setPlaceholder(t('register.selectDatePlaceholder', lang))
    .addOptions(chunk.map((d) => ({ label: dayjs(d).locale(lang).format('dddd, DD/MM/YYYY'), value: d })));
  const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  const components: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [menuRow];

  if (totalPages > 1) {
    const previous = new ButtonBuilder()
      .setCustomId(`btn_register_dates:${Math.max(0, safePage - 1)}`)
      .setLabel(t('register.previousDates', lang))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0);
    const next = new ButtonBuilder()
      .setCustomId(`btn_register_dates:${Math.min(totalPages - 1, safePage + 1)}`)
      .setLabel(t('register.nextDates', lang))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === totalPages - 1);
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(previous, next));
  }

  const content = t('register.step1', lang);
  if (isPagination) await interaction.update({ content, components });
  else await interaction.reply({ content, components, ephemeral: true });
}
