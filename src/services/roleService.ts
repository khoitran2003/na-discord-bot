import { ChannelType, Client, VoiceChannel } from 'discord.js';
import { env } from '../config';
import { getSettings } from './settingsService';

async function getRoomVoiceChannel(client: Client, roomId: string): Promise<VoiceChannel | null> {
  const settings = await getSettings();
  const room = settings.rooms.find((r) => r.id === roomId);
  if (!room) return null;

  const guild = await client.guilds.fetch(env.guildId);
  const channel = await guild.channels.fetch(room.voiceChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) return null;
  return channel as VoiceChannel;
}

/** Cấp quyền Move/Mute CHỈ ở đúng voice channel của phòng này cho đúng user này */
export async function grantRoomAccess(client: Client, userId: string, roomId: string): Promise<boolean> {
  const channel = await getRoomVoiceChannel(client, roomId);
  if (!channel) return false;

  await channel.permissionOverwrites.create(userId, {
    MoveMembers: true,
    MuteMembers: true,
  });

  return true;
}

/** Thu quyền CHỈ ở đúng voice channel của phòng này cho đúng user này */
export async function revokeRoomAccess(client: Client, userId: string, roomId: string): Promise<boolean> {
  const channel = await getRoomVoiceChannel(client, roomId);
  if (!channel) return false;

  await channel.permissionOverwrites.delete(userId).catch(() => {
    // Overwrite có thể đã bị xóa trước đó (VD cron chạy trùng), bỏ qua lỗi này
  });

  return true;
}

/** Đếm số viewer hiện tại trong voice channel của phòng (trừ host) — null nếu không xác định được channel */
export async function countRoomViewers(client: Client, roomId: string, hostUserId: string): Promise<number | null> {
  const channel = await getRoomVoiceChannel(client, roomId);
  if (!channel) return null;

  return [...channel.members.values()].filter((m) => m.id !== hostUserId).length;
}

/** Nếu host vẫn đang ở trong voice channel của phòng này, kick họ ra (hết giờ live theo lịch đã đặt) */
export async function disconnectHostIfPresent(client: Client, userId: string, roomId: string): Promise<void> {
  const channel = await getRoomVoiceChannel(client, roomId);
  if (!channel) return;

  const member = channel.members.get(userId);
  if (member) {
    await member.voice.disconnect('Hết giờ live theo lịch đã đặt').catch(() => {});
  }
}
