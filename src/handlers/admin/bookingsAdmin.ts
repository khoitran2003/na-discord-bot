import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import {
  AdminBookingStatusFilter,
  adminCancelBooking,
  BookingError,
  getBookingsForAdmin,
} from '../../services/bookingService';
import { getSettings } from '../../services/settingsService';
import { logBookingEvent, logAdminAudit } from '../../services/userThreadService';
import { refreshPublicTimeline } from '../../services/publicTimelineService';
import { notifyUserDM } from '../../services/userNotifyService';
import { getUserLanguage } from '../../services/userPreferenceService';
import { t } from '../../i18n';
import { formatDateTimeVN } from '../../utils/time';
import { requireManageGuild } from '../../utils/permissions';
import { BookingStatus } from '../../types';
import { generateBookingsWorkbook } from '../../services/bookingExportService';

const PAGE_SIZE = 10;

type StatusFilter = AdminBookingStatusFilter;

const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'LIVE'];

const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Đang chờ', value: 'PENDING' },
  { label: 'Đang live', value: 'LIVE' },
  { label: 'Đã xong', value: 'DONE' },
  { label: 'Đã hủy', value: 'CANCELLED' },
];

const STATUS_EMOJI: Record<BookingStatus, string> = {
  PENDING: '🟡',
  LIVE: '🔴',
  DONE: '⚪',
  CANCELLED: '❌',
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Đang chờ',
  LIVE: 'Đang live',
  DONE: 'Đã xong',
  CANCELLED: 'Đã hủy',
};

function parseStatusFilter(value: string): StatusFilter {
  return STATUS_FILTER_OPTIONS.some((f) => f.value === value) ? (value as StatusFilter) : 'PENDING';
}

async function buildBookingsView(statusFilter: StatusFilter, page: number) {
  const safePage = Math.max(page, 0);
  const [{ items, total, totalPages }, settings] = await Promise.all([
    getBookingsForAdmin({ status: statusFilter, page: safePage, pageSize: PAGE_SIZE }),
    getSettings(),
  ]);

  const roomLabel = (roomId: string) => settings.rooms.find((r) => r.id === roomId)?.label ?? roomId;

  const lines = items.length
    ? items.map((b) => {
        const status = b.status as BookingStatus;
        const emoji = STATUS_EMOJI[status] ?? '⚪';
        const label = STATUS_LABEL[status] ?? status;
        const ingameRoleId = b.ingameRoleId?.toString() ?? 'N/A';
        return `${emoji} <@${b.userId}> — ID nhân vật: \`${ingameRoleId}\` — **${roomLabel(b.roomId)}** — ${formatDateTimeVN(b.startTime)}→${formatDateTimeVN(b.endTime)} — ${label}`;
      })
    : ['(không có booking nào)'];

  const embed = new EmbedBuilder()
    .setTitle('📋 Danh sách Booking')
    .setColor('#5865F2')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Trang ${safePage + 1}/${totalPages} — Tổng ${total} booking` });

  const prevButton = new ButtonBuilder()
    .setCustomId(`admin_view_bookings:${statusFilter}:${safePage - 1}`)
    .setLabel('Trước')
    .setEmoji('⬅️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(safePage <= 0);

  const nextButton = new ButtonBuilder()
    .setCustomId(`admin_view_bookings:${statusFilter}:${safePage + 1}`)
    .setLabel('Sau')
    .setEmoji('➡️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(safePage + 1 >= totalPages);

  const exportButton = new ButtonBuilder()
    .setCustomId(`admin_export_bookings:${statusFilter}`)
    .setLabel('Export Excel')
    .setEmoji('📊')
    .setStyle(ButtonStyle.Success);

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton, exportButton);

  const filterMenu = new StringSelectMenuBuilder()
    .setCustomId('admin_view_bookings_filter')
    .setPlaceholder('Lọc theo trạng thái')
    .addOptions(
      STATUS_FILTER_OPTIONS.map((f) => ({
        label: f.label,
        value: f.value,
        default: f.value === statusFilter,
      }))
    );
  const filterRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(filterMenu);

  const components = [navRow, filterRow];

  const cancellable = items.filter((b) => ACTIVE_STATUSES.includes(b.status as BookingStatus));
  if (cancellable.length > 0) {
    const cancelMenu = new StringSelectMenuBuilder()
      .setCustomId(`admin_cancel_booking:${statusFilter}:${safePage}`)
      .setPlaceholder('Chọn booking để hủy')
      .addOptions(
        cancellable.map((b) => ({
          label: `${roomLabel(b.roomId)} — ${formatDateTimeVN(b.startTime)} — ${b.username}`.slice(0, 100),
          value: b.id,
        }))
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(cancelMenu));
  }

  return { embed, components };
}

export async function handleViewBookingsButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const [, statusRaw, pageStr] = interaction.customId.split(':');
  const statusFilter = parseStatusFilter(statusRaw);
  const page = Number(pageStr) || 0;

  const { embed, components } = await buildBookingsView(statusFilter, page);

  // Nút bấm từ Admin Portal (message công khai, không ephemeral) -> tạo reply ephemeral mới, giữ nguyên panel gốc.
  // Nút Trước/Sau bấm trên chính message ephemeral đã hiện -> update tại chỗ.
  if (interaction.message.flags.has(MessageFlags.Ephemeral)) {
    await interaction.update({ embeds: [embed], components });
  } else {
    await interaction.reply({ embeds: [embed], components, ephemeral: true });
  }
}

export async function handleViewBookingsFilterSelect(interaction: StringSelectMenuInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const statusFilter = parseStatusFilter(interaction.values[0]);
  const { embed, components } = await buildBookingsView(statusFilter, 0);
  await interaction.update({ embeds: [embed], components });
}

export async function handleExportBookingsButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const [, statusRaw] = interaction.customId.split(':');
  const statusFilter = parseStatusFilter(statusRaw);
  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await generateBookingsWorkbook(statusFilter);
    const attachment = new AttachmentBuilder(result.buffer, { name: result.fileName });

    await interaction.editReply({
      content: `✅ Đã xuất **${result.count}** booking (${statusFilter === 'ALL' ? 'tất cả trạng thái' : STATUS_LABEL[statusFilter]}).`,
      files: [attachment],
    });
  } catch (error) {
    console.error('[AdminExportBookings] Lỗi tạo file Excel:', error);
    await interaction.editReply({ content: '❌ Không thể tạo file Excel. Vui lòng thử lại sau.' });
  }
}

export async function handleCancelBookingSelect(interaction: StringSelectMenuInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const [, statusRaw, pageStr] = interaction.customId.split(':');
  const statusFilter = parseStatusFilter(statusRaw);
  const page = Number(pageStr) || 0;
  const bookingId = interaction.values[0];

  try {
    const booking = await adminCancelBooking(bookingId);
    const settings = await getSettings();
    const room = settings.rooms.find((r) => r.id === booking.roomId)?.label ?? booking.roomId;
    const timeLabel = formatDateTimeVN(booking.startTime);
    const affectedUserLang = await getUserLanguage(booking.userId);

    const dmOk = await notifyUserDM(
      interaction.client,
      booking.userId,
      t('dm.adminCancelled', affectedUserLang, { room, time: timeLabel })
    );

    await logBookingEvent(
      interaction.client,
      booking.userId,
      booking.username,
      t('log.adminCancelled', affectedUserLang, { room, time: timeLabel })
    );

    await logAdminAudit(
      interaction.client,
      `🗑️ Admin đã hủy lịch của <@${booking.userId}> — **${room}** — ${timeLabel}${dmOk ? '' : ' (⚠️ DM thất bại)'}`
    );

    await refreshPublicTimeline(interaction.client).catch((err) =>
      console.error('[AdminCancelBooking] Lỗi refresh public timeline (kiểm tra quyền Send Messages/Embed Links của bot tại SUMMARY_CHANNEL_ID):', err)
    );
  } catch (err) {
    if (err instanceof BookingError) {
      // Admin Portal giữ nguyên tiếng Việt -> luôn dịch bằng 'vi' bất kể admin đã tự chọn ngôn ngữ gì ở /setup
      await interaction.update({ content: `❌ ${t(`errors.${err.code}` as const, 'vi', err.params)}`, embeds: [], components: [] });
      return;
    }
    console.error('[AdminCancelBooking] Lỗi hủy booking:', err);
    await interaction.update({ content: t('errors.generic', 'vi'), embeds: [], components: [] });
    return;
  }

  const { embed, components } = await buildBookingsView(statusFilter, page);
  await interaction.update({ embeds: [embed], components });
}
