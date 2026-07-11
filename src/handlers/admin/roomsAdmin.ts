import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getSettings, updateSettings } from '../../services/settingsService';
import { requireManageGuild } from '../../utils/permissions';

export async function handleManageRoomsButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const settings = await getSettings();
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin_room_select')
    .setPlaceholder('Chọn phòng để sửa/xóa')
    .addOptions(
      settings.rooms.length > 0
        ? settings.rooms.map((r) => ({ label: r.label, description: r.voiceChannelId, value: r.id }))
        : [{ label: '(chưa có phòng nào)', value: 'noop' }]
    );

  const addButton = new ButtonBuilder()
    .setCustomId('admin_room_add')
    .setLabel('Thêm phòng mới')
    .setEmoji('➕')
    .setStyle(ButtonStyle.Success);

  const rows = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    new ActionRowBuilder<ButtonBuilder>().addComponents(addButton),
  ];

  await interaction.reply({
    content: `**Quản lý phòng** (${settings.rooms.length} phòng hiện có):`,
    components: rows,
    ephemeral: true,
  });
}

export async function handleRoomSelectAdmin(interaction: StringSelectMenuInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const roomId = interaction.values[0];
  if (roomId === 'noop') {
    await interaction.update({ content: 'Chưa có phòng nào, bấm "Thêm phòng mới" để tạo.', components: [] });
    return;
  }

  const settings = await getSettings();
  const room = settings.rooms.find((r) => r.id === roomId);
  if (!room) {
    await interaction.update({ content: '⚠️ Phòng này không còn tồn tại.', components: [] });
    return;
  }

  const editButton = new ButtonBuilder()
    .setCustomId(`admin_room_edit:${roomId}`)
    .setLabel('Sửa')
    .setEmoji('✏️')
    .setStyle(ButtonStyle.Primary);
  const deleteButton = new ButtonBuilder()
    .setCustomId(`admin_room_delete:${roomId}`)
    .setLabel('Xóa')
    .setEmoji('🗑️')
    .setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(editButton, deleteButton);

  await interaction.update({
    content: `**${room.label}**\nID: \`${room.id}\`\nVoice Channel: \`${room.voiceChannelId}\``,
    components: [row],
  });
}

function buildRoomModal(
  customId: string,
  title: string,
  existing?: { id: string; label: string; voiceChannelId: string }
): ModalBuilder {
  const idInput = new TextInputBuilder()
    .setCustomId('room_id_input')
    .setLabel('Room ID (định danh, không dấu cách)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  if (existing) idInput.setValue(existing.id);

  const labelInput = new TextInputBuilder()
    .setCustomId('room_label_input')
    .setLabel('Tên hiển thị')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  if (existing) labelInput.setValue(existing.label);

  const voiceInput = new TextInputBuilder()
    .setCustomId('room_voice_channel_input')
    .setLabel('Voice Channel ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  if (existing) voiceInput.setValue(existing.voiceChannelId);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(idInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(labelInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(voiceInput)
    );
}

export async function handleRoomAddButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;
  await interaction.showModal(buildRoomModal('admin_modal_room_add', 'Thêm phòng mới'));
}

export async function handleRoomEditButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const [, roomId] = interaction.customId.split(':');
  const settings = await getSettings();
  const room = settings.rooms.find((r) => r.id === roomId);
  if (!room) {
    await interaction.reply({ content: '⚠️ Phòng này không còn tồn tại.', ephemeral: true });
    return;
  }

  await interaction.showModal(buildRoomModal(`admin_modal_room_edit:${roomId}`, 'Sửa phòng', room));
}

export async function handleRoomAddModal(interaction: ModalSubmitInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const id = interaction.fields.getTextInputValue('room_id_input').trim();
  const label = interaction.fields.getTextInputValue('room_label_input').trim();
  const voiceChannelId = interaction.fields.getTextInputValue('room_voice_channel_input').trim();

  const settings = await getSettings();
  if (settings.rooms.some((r) => r.id === id)) {
    await interaction.reply({ content: `⚠️ Room ID \`${id}\` đã tồn tại, chọn ID khác.`, ephemeral: true });
    return;
  }

  const rooms = [...settings.rooms, { id, label, voiceChannelId }];
  await updateSettings({ rooms });
  await interaction.reply({ content: `✅ Đã thêm phòng **${label}**.`, ephemeral: true });
}

export async function handleRoomEditModal(interaction: ModalSubmitInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const [, originalId] = interaction.customId.split(':');
  const id = interaction.fields.getTextInputValue('room_id_input').trim();
  const label = interaction.fields.getTextInputValue('room_label_input').trim();
  const voiceChannelId = interaction.fields.getTextInputValue('room_voice_channel_input').trim();

  const settings = await getSettings();
  if (id !== originalId && settings.rooms.some((r) => r.id === id)) {
    await interaction.reply({ content: `⚠️ Room ID \`${id}\` đã tồn tại, chọn ID khác.`, ephemeral: true });
    return;
  }

  const rooms = settings.rooms.map((r) => (r.id === originalId ? { id, label, voiceChannelId } : r));
  await updateSettings({ rooms });
  await interaction.reply({ content: `✅ Đã cập nhật phòng **${label}**.`, ephemeral: true });
}

export async function handleRoomDeleteButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const [, roomId] = interaction.customId.split(':');
  const settings = await getSettings();
  const room = settings.rooms.find((r) => r.id === roomId);
  if (!room) {
    await interaction.update({ content: '⚠️ Phòng này không còn tồn tại.', components: [] });
    return;
  }

  const confirmButton = new ButtonBuilder()
    .setCustomId(`admin_room_delete_confirm:${roomId}`)
    .setLabel('Xác nhận xóa')
    .setStyle(ButtonStyle.Danger);
  const cancelButton = new ButtonBuilder()
    .setCustomId('admin_room_delete_cancel')
    .setLabel('Hủy')
    .setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

  await interaction.update({ content: `⚠️ Xác nhận xóa phòng **${room.label}**?`, components: [row] });
}

export async function handleRoomDeleteConfirm(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const [, roomId] = interaction.customId.split(':');
  const settings = await getSettings();

  if (settings.rooms.length <= 1) {
    await interaction.update({
      content: '⚠️ Không thể xóa phòng cuối cùng — phải còn ít nhất 1 phòng để user có thể đăng ký.',
      components: [],
    });
    return;
  }

  const room = settings.rooms.find((r) => r.id === roomId);
  const rooms = settings.rooms.filter((r) => r.id !== roomId);
  await updateSettings({ rooms });

  await interaction.update({ content: `✅ Đã xóa phòng **${room?.label ?? roomId}**.`, components: [] });
}

export async function handleRoomDeleteCancel(interaction: ButtonInteraction) {
  await interaction.update({ content: 'Đã hủy thao tác xóa.', components: [] });
}
