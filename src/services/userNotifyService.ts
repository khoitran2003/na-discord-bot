import { Client } from 'discord.js';

/** Gửi DM cho user. Trả false (không throw) nếu fail — user tắt DM từ member lạ là chuyện bình thường. */
export async function notifyUserDM(client: Client, userId: string, message: string): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId);
    await user.send(message);
    return true;
  } catch {
    return false;
  }
}
