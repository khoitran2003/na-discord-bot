import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import { getSettings } from '../services/settingsService';
import { env } from '../config';
import { DAY_LABELS, formatTimeSlotsSummary } from '../utils/time';

export const data = new SlashCommandBuilder()
  .setName('admin-portal')
  .setDescription('Đăng bảng điều khiển cấu hình bot vào kênh hiện tại')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (interaction.channelId !== env.adminPortalChannelId) {
    await interaction.reply({
      content: `Access Denied`,
      ephemeral: true,
    });
    return;
  }

  console.log(`[Command] User ${interaction.user.tag} (${interaction.user.id}) executed /admin-portal command.`);
  const channel = interaction.channel as TextChannel;
  const embed = await buildAdminPortalEmbed();
  const row = buildAdminPortalButtons();

  await channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ Đã đăng bảng điều khiển Admin Portal.', ephemeral: true });
}

export async function buildAdminPortalEmbed(): Promise<EmbedBuilder> {
  const settings = await getSettings();

  return new EmbedBuilder()
    .setTitle('⚙️ Admin Portal')
    .setColor('#5865F2')
    .setDescription(
      `**Cấu hình hiện tại**\n` +
      `📍 Số phòng: **${settings.rooms.length}**\n` +
      `🕐 Khung giờ: **${formatTimeSlotsSummary(settings.timeSlots)}**\n` +
      `⏱️ Thời lượng slot: **${settings.slotDurationMinutes} phút**\n` +
      `📅 Đặt trước tối đa: **${settings.bookableDaysAhead} ngày**\n` +
      `⏳ Đặt trước tối thiểu: **${settings.minHoursBeforeBooking} giờ**\n` +
      `📆 Tối đa slot/ngày/user: **${settings.maxSlotsPerDayPerUser}**\n` +
      `🗓️ Cửa sổ đăng ký: **${DAY_LABELS[settings.registrationWindow.openDay]} → ${DAY_LABELS[settings.registrationWindow.closeDay]}**\n\n` +
      `Dùng các nút bên dưới để chỉnh sửa. Thay đổi có hiệu lực ngay, không cần restart bot.`
    );
}

export function buildAdminPortalButtons(): ActionRowBuilder<ButtonBuilder> {
  const roomsButton = new ButtonBuilder()
    .setCustomId('admin_manage_rooms')
    .setLabel('Quản lý phòng')
    .setEmoji('🚪')
    .setStyle(ButtonStyle.Primary);

  const timeslotsButton = new ButtonBuilder()
    .setCustomId('admin_manage_timeslots')
    .setLabel('Quản lý khung giờ')
    .setEmoji('🕐')
    .setStyle(ButtonStyle.Primary);

  const rulesButton = new ButtonBuilder()
    .setCustomId('admin_manage_rules')
    .setLabel('Quản lý rule đăng ký')
    .setEmoji('📋')
    .setStyle(ButtonStyle.Primary);

  const viewBookingsButton = new ButtonBuilder()
    .setCustomId('admin_view_bookings:PENDING:0')
    .setLabel('Xem danh sách Booking')
    .setEmoji('📋')
    .setStyle(ButtonStyle.Secondary);

  const broadcastButton = new ButtonBuilder()
    .setCustomId('admin_broadcast')
    .setLabel('Gửi thông báo')
    .setEmoji('📢')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    roomsButton,
    timeslotsButton,
    rulesButton,
    viewBookingsButton,
    broadcastButton
  );
}
