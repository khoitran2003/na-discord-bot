import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const token = process.env.DISCORD_TOKEN;
const channelId = process.env.SUMMARY_CHANNEL_ID;

if (!token || !channelId) {
  console.error('❌ Thiếu DISCORD_TOKEN hoặc SUMMARY_CHANNEL_ID trong file .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
  console.log(`🤖 Bot online: ${client.user?.tag}`);

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      console.error('❌ Kênh SUMMARY_CHANNEL_ID không hợp lệ hoặc không phải TextChannel');
      process.exit(1);
    }

    console.log(`🔍 Đang lấy danh sách active threads trong kênh: #${channel.name}...`);
    const fetched = await channel.threads.fetchActive();
    const threads = Array.from(fetched.threads.values());

    console.log(`📊 Tìm thấy ${threads.length} active threads.`);

    if (threads.length === 0) {
      console.log('✅ Không có active threads nào cần dọn dẹp.');
      process.exit(0);
    }

    console.log('🧹 Đang tiến hành xóa tất cả active threads...');
    let count = 0;
    for (const thread of threads) {
      try {
        await thread.delete();
        count++;
        console.log(`[${count}/${threads.length}] Đã xóa thread: ${thread.name} (${thread.id})`);
      } catch (err) {
        console.error(`❌ Lỗi khi xóa thread ${thread.name}:`, err);
      }
    }

    console.log(`✅ Hoàn thành! Đã xóa thành công ${count}/${threads.length} threads.`);
  } catch (error) {
    console.error('❌ Gặp lỗi trong quá trình dọn dẹp:', error);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(token);
