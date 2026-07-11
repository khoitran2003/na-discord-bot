import { client } from './client';
import { env } from './config';
import { handleInteraction } from './handlers/interactionCreate';
import { handleVoiceStateUpdate } from './handlers/voiceStateUpdate';
import { startRoleCron } from './cron/roleCron';

client.once('clientReady', () => {
  console.log(`✅ Bot đã online: ${client.user?.tag}`);
  startRoleCron(client);
});

client.on('interactionCreate', handleInteraction);
client.on('voiceStateUpdate', handleVoiceStateUpdate);

client.login(env.token).catch((err) => {
  console.error('❌ Không login được, kiểm tra lại DISCORD_TOKEN:', err);
  process.exit(1);
});
