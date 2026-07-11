import { REST, Routes } from 'discord.js';
import { env } from './config';
import { data as setupCommand } from './commands/setup';
import { data as adminPortalCommand } from './commands/adminPortal';

const commands = [setupCommand.toJSON(), adminPortalCommand.toJSON()];

const rest = new REST().setToken(env.token);

async function main() {
  console.log('Đang đăng ký slash command...');
  await rest.put(Routes.applicationGuildCommands(env.clientId, env.guildId), { body: commands });
  console.log('✅ Đăng ký command thành công.');
}

main().catch(console.error);
