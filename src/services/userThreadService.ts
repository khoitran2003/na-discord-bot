import { ChannelType, Client, TextChannel, ThreadAutoArchiveDuration, ThreadChannel } from 'discord.js';
import { env } from '../config';
import { prisma } from '../prisma';

export async function getOrCreateUserThread(client: Client, userId: string, username: string): Promise<ThreadChannel> {
  const existing = await prisma.userThread.findUnique({ where: { userId } });
  if (existing) {
    const thread = await client.channels.fetch(existing.threadId).catch(() => null);
    if (thread && thread.isThread()) return thread as ThreadChannel;
    // Thread cũ đã bị xóa thủ công trên Discord -> tạo lại, rơi xuống nhánh dưới
  }

  const parent = (await client.channels.fetch(env.summaryChannelId)) as TextChannel;
  const thread = await parent.threads.create({
    name: `lich-${username}`,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    reason: 'Thread cá nhân theo dõi booking',
  });
  await thread.members.add(userId);

  await prisma.userThread.upsert({
    where: { userId },
    update: { threadId: thread.id },
    create: { userId, threadId: thread.id },
  });

  return thread;
}

/** Log 1 sự kiện booking (đăng ký, hủy, bắt đầu/kết thúc live...) vào thread riêng của user */
export async function logBookingEvent(client: Client, userId: string, username: string, message: string): Promise<void> {
  try {
    const thread = await getOrCreateUserThread(client, userId, username);
    await thread.send(message);
  } catch (err) {
    console.error(`[UserThread] Không thể log event vào thread của user ${userId}:`, err);
  }
}

/** Log 1 sự kiện booking vào kênh admin portal, để admin có audit trail tổng hợp của mọi user */
export async function logAdminAudit(client: Client, message: string): Promise<void> {
  try {
    const channel = (await client.channels.fetch(env.adminPortalChannelId).catch(() => null)) as TextChannel | null;
    if (channel) await channel.send(message);
  } catch (err) {
    console.error('[UserThread] Không thể log admin audit:', err);
  }
}
