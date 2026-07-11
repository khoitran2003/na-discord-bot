import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { DynamicSettings, getSettings, updateSettings } from '../../services/settingsService';
import { requireManageGuild } from '../../utils/permissions';
import { DAY_LABELS, calculateMinDeltaT } from '../../utils/time';

export async function handleManageRulesButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const settings = await getSettings();
  const numbersButton = new ButtonBuilder()
    .setCustomId('admin_rules_edit_numbers')
    .setLabel('Sửa rule số')
    .setEmoji('✏️')
    .setStyle(ButtonStyle.Primary);
  const windowButton = new ButtonBuilder()
    .setCustomId('admin_rules_edit_window')
    .setLabel('Sửa khung giờ mở đăng ký')
    .setEmoji('🗓️')
    .setStyle(ButtonStyle.Primary);
  const liveValidityButton = new ButtonBuilder()
    .setCustomId('admin_rules_edit_live_validity')
    .setLabel('Sửa rule live hợp lệ')
    .setEmoji('📺')
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(numbersButton, windowButton, liveValidityButton);

  await interaction.reply({
    content:
      `**Rule đăng ký hiện tại**\n` +
      `⏳ Đặt trước tối thiểu: **${settings.minHoursBeforeBooking} giờ**\n` +
      `📆 Tối đa slot/ngày/user: **${settings.maxSlotsPerDayPerUser}**\n` +
      `⏱️ Thời lượng slot: **${settings.slotDurationMinutes} phút**\n` +
      `📅 Đặt trước tối đa: **${settings.bookableDaysAhead} ngày**\n` +
      `🗓️ Cửa sổ đăng ký: **${DAY_LABELS[settings.registrationWindow.openDay]} → ${DAY_LABELS[settings.registrationWindow.closeDay]}**\n` +
      `📺 Live hợp lệ: tối thiểu **${settings.minLiveDurationMinutes} phút**, đỉnh **${settings.minViewers} viewer**`,
    components: [row],
    ephemeral: true,
  });
}

export async function handleRulesEditNumbersButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const settings = await getSettings();
  const fields: [string, string, number][] = [
    ['min_hours_input', 'Số giờ tối thiểu trước khi đặt', settings.minHoursBeforeBooking],
    ['max_per_day_input', 'Tối đa slot/ngày/user', settings.maxSlotsPerDayPerUser],
    ['slot_duration_input', 'Thời lượng mỗi slot (phút)', settings.slotDurationMinutes],
    ['days_ahead_input', 'Số ngày tối đa được đặt trước', settings.bookableDaysAhead],
  ];

  const modal = new ModalBuilder().setCustomId('admin_modal_rules_numbers').setTitle('Sửa rule đăng ký');
  for (const [customId, label, value] of fields) {
    const input = new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setValue(String(value))
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  await interaction.showModal(modal);
}

const NUMBER_FIELD_MAP: Record<string, keyof DynamicSettings> = {
  min_hours_input: 'minHoursBeforeBooking',
  max_per_day_input: 'maxSlotsPerDayPerUser',
  slot_duration_input: 'slotDurationMinutes',
  days_ahead_input: 'bookableDaysAhead',
};

export async function handleRulesNumbersModal(interaction: ModalSubmitInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const parsed: Partial<DynamicSettings> = {};
  const invalidFields: string[] = [];

  for (const [inputId, settingKey] of Object.entries(NUMBER_FIELD_MAP)) {
    const raw = interaction.fields.getTextInputValue(inputId);
    const n = Number(raw);
    const isInvalid = inputId === 'min_hours_input' ? (!Number.isInteger(n) || n < 0) : (!Number.isInteger(n) || n <= 0);
    if (isInvalid) {
      invalidFields.push(raw);
    } else {
      (parsed as Record<string, number>)[settingKey] = n;
    }
  }

  if (invalidFields.length > 0) {
    await interaction.reply({
      content: `⚠️ Giá trị nhập không hợp lệ (giờ tối thiểu phải >= 0, các tham số khác phải > 0). Giá trị sai: ${invalidFields.join(', ')}`,
      ephemeral: true,
    });
    return;
  }

  const settings = await getSettings();
  if (parsed.slotDurationMinutes !== undefined) {
    const minDelta = calculateMinDeltaT(settings.timeSlots);
    if (minDelta !== null && parsed.slotDurationMinutes > minDelta) {
      await interaction.reply({
        content: `⚠️ Thời lượng slot (${parsed.slotDurationMinutes} phút) không được lớn hơn khoảng cách nhỏ nhất giữa các khung giờ hiện tại (${minDelta} phút).`,
        ephemeral: true,
      });
      return;
    }
  }

  await updateSettings(parsed);
  await interaction.reply({ content: '✅ Đã cập nhật rule đăng ký.', ephemeral: true });
}

export async function handleRulesEditWindowButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin_select_open_day')
    .setPlaceholder('Chọn ngày mở đăng ký')
    .addOptions(DAY_LABELS.map((label, i) => ({ label, value: String(i) })));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  await interaction.reply({
    content: '**Bước 1/2:** Chọn ngày mở đăng ký trong tuần:',
    components: [row],
    ephemeral: true,
  });
}

export async function handleOpenDaySelect(interaction: StringSelectMenuInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const openDay = interaction.values[0];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`admin_select_close_day:${openDay}`)
    .setPlaceholder('Chọn ngày đóng đăng ký')
    .addOptions(DAY_LABELS.map((label, i) => ({ label, value: String(i) })));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  await interaction.update({
    content: `**Bước 2/2:** Đã chọn mở: **${DAY_LABELS[Number(openDay)]}**. Giờ chọn ngày đóng:`,
    components: [row],
  });
}

export async function handleCloseDaySelect(interaction: StringSelectMenuInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const [, openDayStr] = interaction.customId.split(':');
  const openDay = Number(openDayStr);
  const closeDay = Number(interaction.values[0]);

  await updateSettings({ registrationWindow: { openDay, openHour: 0, closeDay, closeHour: 0 } });

  await interaction.update({
    content: `✅ Đã cập nhật cửa sổ đăng ký: **${DAY_LABELS[openDay]} 00:00 → ${DAY_LABELS[closeDay]} 00:00**.`,
    components: [],
  });
}

export async function handleRulesEditLiveValidityButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const settings = await getSettings();
  const modal = new ModalBuilder().setCustomId('admin_modal_rules_live_validity').setTitle('Sửa rule live hợp lệ');

  const durationInput = new TextInputBuilder()
    .setCustomId('min_live_duration_input')
    .setLabel('Thời lượng live tối thiểu (phút)')
    .setStyle(TextInputStyle.Short)
    .setValue(String(settings.minLiveDurationMinutes))
    .setRequired(true);
  const viewersInput = new TextInputBuilder()
    .setCustomId('min_viewers_input')
    .setLabel('Đỉnh viewer tối thiểu (không tính host)')
    .setStyle(TextInputStyle.Short)
    .setValue(String(settings.minViewers))
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(viewersInput)
  );

  await interaction.showModal(modal);
}

export async function handleRulesLiveValidityModal(interaction: ModalSubmitInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const minLiveDurationMinutes = Number(interaction.fields.getTextInputValue('min_live_duration_input'));
  const minViewers = Number(interaction.fields.getTextInputValue('min_viewers_input'));

  if (!Number.isInteger(minLiveDurationMinutes) || minLiveDurationMinutes < 0 || !Number.isInteger(minViewers) || minViewers < 0) {
    await interaction.reply({
      content: '⚠️ Giá trị nhập không hợp lệ (phải là số nguyên >= 0).',
      ephemeral: true,
    });
    return;
  }

  const settings = await getSettings();
  const minDelta = calculateMinDeltaT(settings.timeSlots);
  const maxAllowedDuration = minDelta !== null ? Math.min(settings.slotDurationMinutes, minDelta) : settings.slotDurationMinutes;

  if (minLiveDurationMinutes > maxAllowedDuration) {
    await interaction.reply({
      content: `❌ Thời lượng live tối thiểu (${minLiveDurationMinutes} phút) không được lớn hơn khoảng cách nhỏ nhất giữa các khung giờ (${maxAllowedDuration} phút).`,
      ephemeral: true,
    });
    return;
  }

  await updateSettings({ minLiveDurationMinutes, minViewers });
  await interaction.reply({ content: '✅ Đã cập nhật rule live hợp lệ.', ephemeral: true });
}
