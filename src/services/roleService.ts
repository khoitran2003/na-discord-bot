import { ChannelType, Client, GuildMember, VoiceChannel } from 'discord.js';
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

export interface RoomSample {
  hostPresent: boolean;
  hostStreaming: boolean;
  qualifiedMembers: GuildMember[]; // non-bot, non-host, not deaf/selfDeaf, account age >= minViewerAccountAgeDays, guild age >= minViewerGuildAgeHours, not another live host
  rawViewerCount: number; // non-bot, non-host in channel (for peakViewers backward compat)
}

export interface ViewerFilterOptions {
  minAccountAgeDays: number;
  minGuildAgeHours: number;
  activeHostUserIds?: Set<string>;
  nowMs?: number;
}

/** Lọc danh sách viewer đủ điều kiện chống gian lận từ các thành viên đang ở trong voice channel */
export function filterQualifiedViewers(
  members: Iterable<GuildMember>,
  hostUserId: string,
  options: ViewerFilterOptions
): { qualifiedMembers: GuildMember[]; rawViewerCount: number } {
  const nowMs = options.nowMs ?? Date.now();
  const minAccountAgeMs = options.minAccountAgeDays * 86_400_000;
  const minGuildAgeMs = options.minGuildAgeHours * 3_600_000;
  const qualifiedMembers: GuildMember[] = [];
  let rawViewerCount = 0;

  for (const member of members) {
    if (member.id === hostUserId || member.user.bot) continue;
    rawViewerCount += 1;

    if (member.voice.deaf || member.voice.selfDeaf || member.voice.serverDeaf) continue;
    if (nowMs - member.user.createdTimestamp < minAccountAgeMs) continue;
    if (member.joinedTimestamp == null || nowMs - member.joinedTimestamp < minGuildAgeMs) continue;
    if (options.activeHostUserIds?.has(member.id)) continue;

    qualifiedMembers.push(member);
  }

  return { qualifiedMembers, rawViewerCount };
}

/** Lấy mẫu trạng thái host (có mặt/đang stream) và danh sách viewer đủ điều kiện trong voice channel của phòng */
export async function sampleRoom(
  client: Client,
  roomId: string,
  hostUserId: string,
  options: ViewerFilterOptions
): Promise<RoomSample | null> {
  const channel = await getRoomVoiceChannel(client, roomId);
  if (!channel) return null;

  const hostMember = channel.members.get(hostUserId);
  const hostPresent = Boolean(hostMember);
  const hostStreaming = Boolean(hostMember && (hostMember.voice.streaming || hostMember.voice.selfVideo));
  const { qualifiedMembers, rawViewerCount } = filterQualifiedViewers(
    channel.members.values(),
    hostUserId,
    options
  );

  return {
    hostPresent,
    hostStreaming,
    qualifiedMembers,
    rawViewerCount,
  };
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
