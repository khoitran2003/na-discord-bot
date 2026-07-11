import { PermissionFlagsBits, RepliableInteraction } from 'discord.js';

/**
 * Defense-in-depth: kiểm tra lại quyền ManageGuild ngay trong handler,
 * phòng trường hợp channel permission bị set sai hoặc tin nhắn Admin Portal bị share nhầm.
 */
export async function requireManageGuild(interaction: RepliableInteraction): Promise<boolean> {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }
  await interaction
    .reply({ content: '⛔ Bạn không có quyền dùng chức năng này.', ephemeral: true })
    .catch(() => {});
  return false;
}
