import { Client, EmbedBuilder, Message, TextChannel, escapeMarkdown } from 'discord.js';
import dayjs from 'dayjs';
import { env, TIMEZONE } from '../config';
import { getSettings, updateSettings } from './settingsService';
import { getUpcomingActiveBookings } from './bookingService';
import { getDayLabel } from '../utils/time';

type UpcomingBookings = Awaited<ReturnType<typeof getUpcomingActiveBookings>>;

const EMPTY_TEXT = 'Hiện chưa có lịch nào được đăng ký. / No sessions scheduled yet.';
const TIMELINE_TITLE = '📋 Lịch live sắp tới / Upcoming Live Schedule';
// Embed description tối đa 4096 ký tự. Chừa khoảng an toàn cho thay đổi format về sau và giữ tổng
// kích thước embed thấp hơn giới hạn 6000 ký tự.
const MAX_DESCRIPTION_LENGTH = 4000;

interface TimelineSection {
  header: string;
  lines: string[];
}

// Tin nhắn Timeline là public/shared (mọi user xem chung), không thể cá nhân hóa theo ngôn ngữ người xem
// -> hiện song ngữ cố định (VI / EN inline trên cùng 1 dòng), khác với các tin nhắn ephemeral khác vốn
// dịch theo ngôn ngữ đã lưu của từng user riêng.
function buildDateSections(bookings: UpcomingBookings, roomMention: (roomId: string) => string): TimelineSection[] {
  // bookings đã được sắp xếp tăng dần theo startTime từ getUpcomingActiveBookings(), nên gom theo ngày vẫn giữ đúng thứ tự giờ trong ngày
  // startTime là mốc UTC tuyệt đối trong DB -> luôn phải .tz(TIMEZONE) trước khi format, không thì lệch giờ theo timezone hệ thống chạy bot
  const grouped = new Map<string, UpcomingBookings>();
  for (const b of bookings) {
    const key = dayjs(b.startTime).tz(TIMEZONE).format('YYYY-MM-DD');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(b);
  }

  return [...grouped.keys()].sort().map((dateKey) => {
    const day = dayjs(dateKey).day();
    const dayLabel = `${getDayLabel(day, 'vi')} / ${getDayLabel(day, 'en')}`;
    const header = `📅 **${dayjs(dateKey).format('DD/MM')} (${dayLabel})**`;
    const lines = grouped.get(dateKey)!.map((b) => {
      const time = dayjs(b.startTime).tz(TIMEZONE).format('HH:mm');
      const contentSuffix = b.livestreamContent ? ` — ${escapeMarkdown(b.livestreamContent)}` : '';
      return `• ${time} — ${roomMention(b.roomId)} — <@${b.userId}>${contentSuffix}`;
    });
    return { header, lines };
  });
}

/** Chia một dòng bất thường quá dài mà không làm mất dữ liệu. Với dữ liệu bình thường hàm trả đúng 1 phần. */
function splitLongLine(line: string, maxLength: number): string[] {
  const parts: string[] = [];
  for (let offset = 0; offset < line.length; offset += maxLength) {
    parts.push(line.slice(offset, offset + maxLength));
  }
  return parts.length > 0 ? parts : [''];
}

/** Chia section theo ranh giới từng booking; nếu qua trang sẽ lặp lại header để người đọc không mất ngữ cảnh. */
function splitSection(section: TimelineSection): string[] {
  const fragments: string[] = [];
  const continuedHeader = `${section.header} *(tiếp / continued)*`;
  let current = section.header;

  for (const rawLine of section.lines) {
    const maxLineLength = MAX_DESCRIPTION_LENGTH - continuedHeader.length - 1;
    for (const line of splitLongLine(rawLine, maxLineLength)) {
      const candidate = `${current}\n${line}`;
      if (candidate.length > MAX_DESCRIPTION_LENGTH) {
        fragments.push(current);
        current = `${continuedHeader}\n${line}`;
      } else {
        current = candidate;
      }
    }
  }

  fragments.push(current);
  return fragments;
}

/** Pack các fragment thành batch Embed, luôn bảo đảm description <= MAX_DESCRIPTION_LENGTH. */
export function buildTimelineChunks(
  bookings: UpcomingBookings,
  roomMention: (roomId: string) => string
): string[] {
  if (bookings.length === 0) return [EMPTY_TEXT];

  const fragments = buildDateSections(bookings, roomMention).flatMap(splitSection);
  const chunks: string[] = [];
  let current = '';

  for (const fragment of fragments) {
    const candidate = current ? `${current}\n\n${fragment}` : fragment;
    if (candidate.length > MAX_DESCRIPTION_LENGTH) {
      chunks.push(current);
      current = fragment;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

function buildTimelineEmbed(description: string, index: number, total: number, bookingCount: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setDescription(description)
    .setFooter({ text: `Phần ${index + 1}/${total} • ${bookingCount} lịch • Giờ Việt Nam (UTC+7)` });

  if (index === 0) embed.setTitle(TIMELINE_TITLE);
  return embed;
}

function hasSameTimelineContent(
  message: Message,
  description: string,
  index: number,
  total: number,
  bookingCount: number
): boolean {
  const current = message.embeds[0];
  const expectedFooter = `Phần ${index + 1}/${total} • ${bookingCount} lịch • Giờ Việt Nam (UTC+7)`;
  return (
    message.embeds.length === 1 &&
    message.components.length === 0 &&
    current.description === description &&
    current.title === (index === 0 ? TIMELINE_TITLE : null) &&
    current.footer?.text === expectedFooter
  );
}

/**
 * Post/update Timeline TOP-LEVEL trong SUMMARY_CHANNEL_ID — công khai cho toàn bộ user xem chung
 * (khác với logBookingEvent/userThreadService.ts vốn ghi vào Private Thread riêng từng user trong cùng channel).
 * Lịch dày có thể vượt quá 4096 ký tự (giới hạn Embed description) -> chia thành nhiều message nối tiếp
 * theo vị trí (không cắt bớt nội dung), edit-in-place từng message theo đúng vị trí đã lưu thay vì xóa+gửi
 * lại toàn bộ mỗi lần refresh (đỡ spam nhiều message một lúc khi lịch có nhiều ngày). Danh sách message id
 * theo thứ tự được lưu ở `publicTimelineMessageIds` trong DynamicSettings để định vị đúng qua các lần
 * restart bot và tự tạo lại nếu message ở vị trí đó bị xóa thủ công.
 */
async function renderPublicTimeline(client: Client): Promise<void> {
  const channel = (await client.channels.fetch(env.summaryChannelId).catch(() => null)) as TextChannel | null;
  if (!channel) return;

  const [bookings, settings] = await Promise.all([getUpcomingActiveBookings(), getSettings()]);
  const roomMention = (roomId: string) => {
    const voiceChannelId = settings.rooms.find((r) => r.id === roomId)?.voiceChannelId;
    return voiceChannelId ? `<#${voiceChannelId}>` : roomId;
  };

  const chunks = buildTimelineChunks(bookings, roomMention);

  const existingIds = settings.publicTimelineMessageIds;
  const newIds: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const embed = buildTimelineEmbed(chunks[i], i, chunks.length, bookings.length);

    const existingMsg = existingIds[i] ? await channel.messages.fetch(existingIds[i]).catch(() => null) : null;

    if (existingMsg) {
      // Không gọi API edit nếu nội dung không đổi, giảm đáng kể request khi cron refresh lặp lại.
      if (!hasSameTimelineContent(existingMsg, chunks[i], i, chunks.length, bookings.length)) {
        await existingMsg.edit({ embeds: [embed], components: [], allowedMentions: { parse: [] } });
      }
      newIds.push(existingMsg.id);
    } else {
      // Chưa có message ở vị trí này, hoặc message cũ đã bị xóa thủ công -> gửi mới
      const sent = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      newIds.push(sent.id);
    }
  }

  // Lịch mỏng lại (ít chunk hơn trước) -> xóa message dư ở cuối, không để rác
  for (let i = chunks.length; i < existingIds.length; i++) {
    const msg = await channel.messages.fetch(existingIds[i]).catch(() => null);
    await msg?.delete().catch(() => {});
  }

  if (existingIds.length !== newIds.length || existingIds.some((id, index) => id !== newIds[index])) {
    await updateSettings({ publicTimelineMessageIds: newIds });
  }
}

// Booking/cancel/cron có thể gọi refresh gần như đồng thời. Các request đến trong lúc đang render được
// gộp thành tối đa một lượt render kế tiếp: không tạo message trùng và không xếp hàng N lượt refresh dư.
let activeRefresh: Promise<void> | null = null;
let refreshRequested = false;

export function refreshPublicTimeline(client: Client): Promise<void> {
  refreshRequested = true;

  if (!activeRefresh) {
    activeRefresh = (async () => {
      do {
        refreshRequested = false;
        await renderPublicTimeline(client);
      } while (refreshRequested);
    })().finally(() => {
      activeRefresh = null;
    });
  }

  return activeRefresh;
}
