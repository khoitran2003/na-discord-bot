import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getSettings, updateSettings } from '../../services/settingsService';
import { requireManageGuild } from '../../utils/permissions';
import { calculateMinDeltaT, formatTimeSlotsSummary } from '../../utils/time';

const TIME_FORMAT_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function handleManageTimeslotsButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const settings = await getSettings();
  const editButton = new ButtonBuilder()
    .setCustomId('admin_timeslots_edit')
    .setLabel('Sửa danh sách')
    .setEmoji('✏️')
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(editButton);

  await interaction.reply({
    content: `**Khung giờ hiện tại** (${settings.timeSlots.length}):\n${formatTimeSlotsSummary(settings.timeSlots)}`,
    components: [row],
    ephemeral: true,
  });
}

export async function handleTimeslotsEditButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const settings = await getSettings();
  const input = new TextInputBuilder()
    .setCustomId('timeslots_input')
    .setLabel('Mỗi khung giờ 1 dòng, định dạng HH:mm')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(settings.timeSlots.join('\n'))
    .setRequired(true);

  const modal = new ModalBuilder()
    .setCustomId('admin_modal_timeslots')
    .setTitle('Sửa khung giờ')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

  await interaction.showModal(modal);
}

export async function handleTimeslotsModal(interaction: ModalSubmitInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const raw = interaction.fields.getTextInputValue('timeslots_input');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    await interaction.reply({ content: '⚠️ Phải có ít nhất 1 khung giờ.', ephemeral: true });
    return;
  }

  const invalid = lines.filter((l) => !TIME_FORMAT_REGEX.test(l));
  if (invalid.length > 0) {
    await interaction.reply({ content: `⚠️ Các dòng sau sai định dạng HH:mm: ${invalid.join(', ')}`, ephemeral: true });
    return;
  }

  const timeSlots = [...new Set(lines)].sort();
  const minDelta = calculateMinDeltaT(timeSlots);
  const currentSettings = await getSettings();
  const updateData: Parameters<typeof updateSettings>[0] = { timeSlots };

  let autoNotice = '';
  if (minDelta !== null) {
    updateData.slotDurationMinutes = minDelta;
    autoNotice = `\n⏱️ Thời lượng slot tự động cập nhật thành **${minDelta} phút** (min khoảng cách giữa các khung giờ).`;
    if (currentSettings.minLiveDurationMinutes > minDelta) {
      updateData.minLiveDurationMinutes = minDelta;
      autoNotice += `\n📺 Thời lượng live hợp lệ tự động điều chỉnh thành **${minDelta} phút** (để <= min delta t).`;
    }
  }

  await updateSettings(updateData);
  await interaction.reply({
    content: `✅ Đã cập nhật ${timeSlots.length} khung giờ: ${formatTimeSlotsSummary(timeSlots)}${autoNotice}`,
    ephemeral: true,
  });
}
