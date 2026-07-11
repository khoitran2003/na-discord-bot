import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction } from 'discord.js';
import { getSettings } from '../../services/settingsService';
import { getValidTimeSlotsForDay } from '../../utils/time';
import { countUserBookingsOnDay, isSlotTaken } from '../../services/bookingService';
import { getUserLanguage } from '../../services/userPreferenceService';
import { t } from '../../i18n';

export async function handleRegDateSelect(interaction: StringSelectMenuInteraction) {
  const dateStr = interaction.values[0];
  console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) selected date: ${dateStr}.`);

  const [settings, lang] = await Promise.all([getSettings(), getUserLanguage(interaction.user.id)]);

  // Check sớm rule "N slot/ngày" ngay khi vừa chọn ngày, chặn luôn nếu đã đạt giới hạn.
  // assertCanBook() ở bước tạo booking cuối cùng vẫn giữ nguyên check này để chống race-condition.
  const sameDayCount = await countUserBookingsOnDay(interaction.user.id, dateStr);
  if (sameDayCount >= settings.maxSlotsPerDayPerUser) {
    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) rejected at date step: already has ${sameDayCount} booking(s) on ${dateStr}.`);
    await interaction.update({
      content: t('register.sameDayLimitReached', lang, { count: sameDayCount, max: settings.maxSlotsPerDayPerUser }),
      components: [],
    });
    return;
  }

  const candidateSlots = await getValidTimeSlotsForDay(dateStr);

  // Với mỗi phòng, check xem còn ít nhất 1 slot trống trong ngày đó không
  const roomsWithAvailability = await Promise.all(
    settings.rooms.map(async (room) => {
      const takenFlags = await Promise.all(candidateSlots.map((c) => isSlotTaken(room.id, c.start)));
      const hasFreeSlot = takenFlags.some((taken) => !taken);
      return { room, hasFreeSlot };
    })
  );

  const availableRooms = roomsWithAvailability.filter((r) => r.hasFreeSlot).map((r) => r.room);

  if (availableRooms.length === 0) {
    console.log(`[Register] User ${interaction.user.tag} (${interaction.user.id}) no rooms available on date: ${dateStr}.`);
    await interaction.update({
      content: t('register.noRoomsAvailable', lang),
      components: [],
    });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`reg_select_room:${dateStr}`)
    .setPlaceholder(t('register.selectRoomPlaceholder', lang))
    .addOptions(availableRooms.map((r) => ({ label: r.label, value: r.id })));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  await interaction.update({
    content: t('register.step2', lang),
    components: [row],
  });
}
