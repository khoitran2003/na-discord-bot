import { Client, GatewayIntentBits, Partials } from 'discord.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // cần để add/remove role
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.GuildMember],
});
