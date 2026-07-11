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
import { getDayLabel, isRegistrationOpen, formatTimeSlotsSummary } from '../utils/time';
import { getSettings } from '../services/settingsService';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Đăng tin nhắn đăng ký lịch host livestream vào kênh hiện tại')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction) {
  console.log(`[Command] User ${interaction.user.tag} (${interaction.user.id}) executed /setup command.`);
  const channel = interaction.channel as TextChannel;
  const embed = await buildSetupEmbed();
  const row = buildSetupButtons();

  await channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ Đã đăng tin nhắn đăng ký.', ephemeral: true });
}

// Tin nhắn /setup gốc là public/shared (mọi user cùng xem chung 1 embed), không thể cá nhân hóa theo
// ngôn ngữ người xem -> hiện song ngữ xếp chồng cố định (khối VI đầy đủ, rồi tới khối EN đầy đủ),
// khác với các bước SAU khi bấm nút (ephemeral) vốn dịch theo ngôn ngữ đã lưu của từng user riêng.
export async function buildSetupEmbed(): Promise<EmbedBuilder> {
  const [open, settings] = await Promise.all([isRegistrationOpen(), getSettings()]);

  const roomsLine = settings.rooms.length > 0 ? settings.rooms.map((r) => r.label).join(', ') : '(chưa có phòng nào / none yet)';
  const timeSlotsLine = formatTimeSlotsSummary(settings.timeSlots);
  const { openDay, closeDay } = settings.registrationWindow;

  const viBlock =
    `**🇻🇳 Trạng thái**\n${open ? '🟢 Đang mở đăng ký' : '🔴 Sự kiện đang tạm dừng — chờ BTC mở lại.'}\n\n` +
    `**Phòng live**\n${roomsLine}\n\n` +
    `**Khung giờ live** (mỗi slot ${settings.slotDurationMinutes} phút)\n${timeSlotsLine}\n\n` +
    `**Quy định đăng ký**\n` +
    `🗓️ Khung giờ đăng ký: **${getDayLabel(openDay, 'vi')} → ${getDayLabel(closeDay, 'vi')}** hàng tuần\n` +
    `📅 Đặt trước tối đa: **${settings.bookableDaysAhead} ngày**\n` +
    `⏳ Đặt trước tối thiểu: **${settings.minHoursBeforeBooking} giờ**\n` +
    `📆 Tối đa **${settings.maxSlotsPerDayPerUser}** slot/ngày mỗi người\n\n` +
    `Bấm **Đăng ký / Đổi lịch** bên dưới để chọn phòng, ngày và giờ live.`;

  const enBlock =
    `**🇬🇧 Status**\n${open ? '🟢 Registration is open' : '🔴 Event is paused — waiting for the organizers to reopen.'}\n\n` +
    `**Live rooms**\n${roomsLine}\n\n` +
    `**Live time slots** (each slot is ${settings.slotDurationMinutes} min)\n${timeSlotsLine}\n\n` +
    `**Registration rules**\n` +
    `🗓️ Registration window: **${getDayLabel(openDay, 'en')} → ${getDayLabel(closeDay, 'en')}**, weekly\n` +
    `📅 Book up to **${settings.bookableDaysAhead} day(s)** ahead\n` +
    `⏳ At least **${settings.minHoursBeforeBooking} hour(s)** in advance\n` +
    `📆 Max **${settings.maxSlotsPerDayPerUser}** slot(s)/day per person\n\n` +
    `Tap **Register / Reschedule** below to pick a room, date and time.`;

  return new EmbedBuilder()
    .setTitle('🎙️ Host Stream — Thông báo & Hướng dẫn / Announcements & Guide')
    .setColor(open ? '#57F287' : '#0099ff')
    .setDescription(`${viBlock}\n\n━━━━━━━━━━\n\n${enBlock}`);
}

export function buildSetupButtons(): ActionRowBuilder<ButtonBuilder> {
  const btnRegister = new ButtonBuilder()
    .setCustomId('btn_register')
    .setLabel('Đăng ký / Đổi lịch — Register')
    .setEmoji('📝')
    .setStyle(ButtonStyle.Primary);

  const btnCancel = new ButtonBuilder()
    .setCustomId('btn_cancel')
    .setLabel('Hủy — Cancel')
    .setEmoji('🗑️')
    .setStyle(ButtonStyle.Danger);

  const btnMySchedule = new ButtonBuilder()
    .setCustomId('btn_my_schedule')
    .setLabel('Lịch của tôi — My Schedule')
    .setEmoji('📅')
    .setStyle(ButtonStyle.Secondary);

  const btnLanguage = new ButtonBuilder()
    .setCustomId('btn_language')
    .setLabel('Ngôn ngữ — Language')
    .setEmoji('🌐')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(btnRegister, btnCancel, btnMySchedule, btnLanguage);
}
