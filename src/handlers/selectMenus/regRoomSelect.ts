import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction } from 'discord.js';
import { getValidTimeSlotsForDay } from '../../utils/time';
import { isSlotTaken } from '../../services/bookingService';
import { getSettings } from '../../services/settingsService';
import { getUserLanguage } from '../../services/userPreferenceService';
import { t } from '../../i18n';

export async function handleRegRoomSelect(interaction: StringSelectMenuInteraction) {
  const [, dateStr] = interaction.customId.split(':');
  const roomId = interaction.values[0];
  console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) selected room: ${roomId} for date: ${dateStr}.`);

  const [settings, lang] = await Promise.all([getSettings(), getUserLanguage(interaction.user.id)]);
  const room = settings.rooms.find((r) => r.id === roomId);
  const candidates = await getValidTimeSlotsForDay(dateStr);

  if (candidates.length === 0) {
    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) no candidate slots (too soon) on date: ${dateStr} for room: ${roomId}.`);
    await interaction.update({
      content: t('register.tooSoon', lang),
      components: [],
    });
    return;
  }

  // Lọc bỏ những slot đã có người đặt (query DB song song)
  const availability = await Promise.all(
    candidates.map(async (c) => ({ ...c, taken: await isSlotTaken(roomId, c.start) }))
  );
  const available = availability.filter((c) => !c.taken);

  if (available.length === 0) {
    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) has no slots available on date: ${dateStr} for room: ${roomId}.`);
    await interaction.update({
      content: t('register.roomFull', lang),
      components: [],
    });
    return;
  }

  // Discord giới hạn mỗi StringSelectMenuBuilder tối đa 25 options.
  // Mỗi message tối đa 5 ActionRow => tối đa 5 * 25 = 125 slot.
  const CHUNK_SIZE = 25;
  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

  for (let i = 0; i < available.length && rows.length < 5; i += CHUNK_SIZE) {
    const chunk = available.slice(i, i + CHUNK_SIZE);
    const firstSlot = chunk[0].slot;
    const lastSlot = chunk[chunk.length - 1].slot;

    const placeholder =
      available.length <= CHUNK_SIZE
        ? t('register.selectTimePlaceholder', lang)
        : t('register.selectTimePlaceholderRange', lang, { first: firstSlot, last: lastSlot });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`reg_select_time:${roomId}:${dateStr}:${Math.floor(i / CHUNK_SIZE)}`)
      .setPlaceholder(placeholder)
      .addOptions(chunk.map((c) => ({ label: `${c.slot}`, value: c.slot })));

    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }

  await interaction.update({
    content: t('register.step3', lang, { room: room?.label ?? roomId }),
    components: rows,
  });
}
