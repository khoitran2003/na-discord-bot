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

  const ingameRoleIdInput = new TextInputBuilder()
    .setCustomId('ingame_role_id_input')
    .setLabel(t('register.ingameRoleIdLabel', lang))
    .setPlaceholder(t('register.ingameRoleIdPlaceholder', lang))
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(19)
    .setRequired(true);

  const contentRow = new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput);
  const ingameRoleIdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(ingameRoleIdInput);
  modal.addComponents(contentRow, ingameRoleIdRow);

  await interaction.showModal(modal);
}
