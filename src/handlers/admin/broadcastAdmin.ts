import {
  ActionRowBuilder,
  ButtonInteraction,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { env } from '../../config';
import { requireManageGuild } from '../../utils/permissions';

// Bắt kiểu gõ "#ten-kenh" (không phải mention hợp lệ "<#id>") — cảnh báo nhẹ, không chặn gửi.
const SUSPICIOUS_CHANNEL_MENTION_REGEX = /(?<!<)#[a-zA-Z0-9_-]+/;

export async function handleBroadcastButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const titleInput = new TextInputBuilder()
    .setCustomId('broadcast_title')
    .setLabel('Tiêu đề')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const contentInput = new TextInputBuilder()
    .setCustomId('broadcast_content')
    .setLabel('Nội dung')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Gắn link kênh bằng <#channelId>, VD: <#123456789012345678>')
    .setRequired(true);

  const modal = new ModalBuilder()
    .setCustomId('admin_broadcast_modal')
    .setTitle('Gửi thông báo')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput)
    );

  await interaction.showModal(modal);
}

export async function handleBroadcastModal(interaction: ModalSubmitInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const title = interaction.fields.getTextInputValue('broadcast_title');
  const content = interaction.fields.getTextInputValue('broadcast_content');

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(content)
    .setColor('#5865F2')
    .setFooter({ text: 'Thông báo từ BTC' })
    .setTimestamp();

  const channel = (await interaction.client.channels.fetch(env.notiChannelId)) as TextChannel | null;
  if (!channel) {
    await interaction.reply({ content: '❌ Không tìm thấy kênh thông báo, kiểm tra lại NOTI_CHANNEL_ID.', ephemeral: true });
    return;
  }

  await channel.send({ embeds: [embed] });

  const warning = SUSPICIOUS_CHANNEL_MENTION_REGEX.test(content)
    ? '\n⚠️ Có vẻ bạn gõ `#tên-kênh` thay vì `<#channelId>` — Discord sẽ không tự chuyển thành link kênh. Thông báo vẫn đã được gửi.'
    : '';

  await interaction.reply({ content: `✅ Đã gửi thông báo.${warning}`, ephemeral: true });
}
