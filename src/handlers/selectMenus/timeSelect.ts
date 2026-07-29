import { StringSelectMenuInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getValidTimeSlotsForDay } from '../../utils/time';
import { getUserLanguage } from '../../services/userPreferenceService';
import { t } from '../../i18n';

export async function handleTimeSelect(interaction: StringSelectMenuInteraction) {
  const [, roomId, dateStr] = interaction.customId.split(':');
  const slot = interaction.values[0];
  console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) selected time slot: ${slot} (date: ${dateStr}, room: ${roomId}).`);

  const lang = await getUserLanguage(interaction.user.id);
  const candidate = (await getValidTimeSlotsForDay(dateStr)).find((c) => c.slot === slot);
  if (!candidate) {
    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) invalid time slot candidate: ${slot} (date: ${dateStr}, room: ${roomId}).`);
    await interaction.update({
      content: t('register.slotExpired', lang),
      components: [],
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_booking:${roomId}:${dateStr}:${slot}`)
    .setTitle(t('register.modalTitle', lang));

  const contentInput = new TextInputBuilder()
    .setCustomId('livestream_content_input')
    .setLabel(t('register.contentLabel', lang))
    .setPlaceholder(t('register.contentPlaceholder', lang))
    .setStyle(TextInputStyle.Short)
    .setMaxLength(50)
    .setRequired(false);

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}
