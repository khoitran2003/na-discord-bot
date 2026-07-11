import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import dayjs from 'dayjs';
import { env, TIMEZONE } from '../config';
import { getSettings, updateSettings } from './settingsService';
import { getUpcomingActiveBookings } from './bookingService';
import { getDayLabel } from '../utils/time';

type UpcomingBookings = Awaited<ReturnType<typeof getUpcomingActiveBookings>>;

// Tin nhắn Timeline là public/shared (1 message duy nhất cho mọi user xem chung), không thể cá nhân hóa
// theo ngôn ngữ người xem -> hiện song ngữ cố định (VI / EN inline trên cùng 1 dòng), khác với các tin
// nhắn ephemeral khác vốn dịch theo ngôn ngữ đã lưu của từng user riêng.
function buildTimelineContent(bookings: UpcomingBookings, roomMention: (roomId: string) => string): string {
  if (bookings.length === 0) {
    return 'Hiện chưa có lịch nào được đăng ký. / No sessions scheduled yet.';
  }

  // bookings đã được sắp xếp tăng dần theo startTime từ getUpcomingActiveBookings(), nên gom theo ngày vẫn giữ đúng thứ tự giờ trong ngày
  // startTime là mốc UTC tuyệt đối trong DB -> luôn phải .tz(TIMEZONE) trước khi format, không thì lệch giờ theo timezone hệ thống chạy bot
  const grouped = new Map<string, UpcomingBookings>();
  for (const b of bookings) {
    const key = dayjs(b.startTime).tz(TIMEZONE).format('YYYY-MM-DD');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(b);
  }

  const blocks = [...grouped.keys()].sort().map((dateKey) => {
    const day = dayjs(dateKey).day();
    const dayLabel = `${getDayLabel(day, 'vi')} / ${getDayLabel(day, 'en')}`;
    const header = `📅 **${dayjs(dateKey).format('DD/MM')} (${dayLabel})**`;
    const lines = grouped.get(dateKey)!.map((b) => {
      const time = dayjs(b.startTime).tz(TIMEZONE).format('HH:mm');
      return `• ${time} — ${roomMention(b.roomId)} — <@${b.userId}>`;
    });
    return `${header}\n${lines.join('\n')}`;
  });

  return blocks.join('\n\n');
}

/**
 * Post tin nhắn Timeline TOP-LEVEL MỚI trong SUMMARY_CHANNEL_ID — công khai cho toàn bộ user xem chung
 * (khác với logBookingEvent/userThreadService.ts vốn ghi vào Private Thread riêng từng user trong cùng channel).
 * Luôn xóa message Timeline cũ rồi gửi message mới (thay vì edit tại chỗ), để mỗi lần booking đổi đều có
 * thông báo mới nổi lên đầu channel thay vì âm thầm sửa 1 message cũ mà Discord không notify. Message id
 * được lưu vào DynamicSettings để nhận diện message cũ cần xóa qua các lần restart bot.
 */
export async function refreshPublicTimeline(client: Client): Promise<void> {
  const channel = (await client.channels.fetch(env.summaryChannelId).catch(() => null)) as TextChannel | null;
  if (!channel) return;

  const [bookings, settings] = await Promise.all([getUpcomingActiveBookings(), getSettings()]);
  const roomMention = (roomId: string) => {
    const voiceChannelId = settings.rooms.find((r) => r.id === roomId)?.voiceChannelId;
    return voiceChannelId ? `<#${voiceChannelId}>` : roomId;
  };

  const embed = new EmbedBuilder()
    .setTitle('📋 Lịch live sắp tới / Upcoming Live Schedule')
    .setColor('#5865F2')
    .setDescription(buildTimelineContent(bookings, roomMention).slice(0, 4096));

  if (settings.publicTimelineMessageId) {
    const existing = await channel.messages.fetch(settings.publicTimelineMessageId).catch(() => null);
    await existing?.delete().catch(() => {});
    // Tin nhắn cũ có thể đã bị xóa thủ công trên Discord từ trước -> existing là null, bỏ qua bước xóa
  }

  const sent = await channel.send({ embeds: [embed] });
  await updateSettings({ publicTimelineMessageId: sent.id });
}
