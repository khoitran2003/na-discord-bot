import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { DynamicSettings, getSettings, updateSettings } from '../../services/settingsService';
import { requireManageGuild } from '../../utils/permissions';
import { calculateMinDeltaT, formatAdminDateTime, formatDateTimeVN, parseAdminDateTime } from '../../utils/time';

export async function handleManageRulesButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const settings = await getSettings();
  const numbersButton = new ButtonBuilder()
    .setCustomId('admin_rules_edit_numbers')
    .setLabel('Sửa rule số')
    .setEmoji('✏️')
    .setStyle(ButtonStyle.Primary);
  const scheduleButton = new ButtonBuilder()
    .setCustomId('admin_rules_edit_schedule')
    .setLabel('Sửa mốc thời gian')
    .setEmoji('🗓️')
    .setStyle(ButtonStyle.Primary);
  const liveValidityButton = new ButtonBuilder()
    .setCustomId('admin_rules_edit_live_validity')
    .setLabel('Sửa rule live hợp lệ')
    .setEmoji('📺')
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(numbersButton, scheduleButton, liveValidityButton);

  await interaction.reply({
    content:
      `**Rule đăng ký hiện tại**\n` +
      `📆 Tối đa slot/ngày/user: **${settings.maxSlotsPerDayPerUser}**\n` +
      `⏱️ Thời lượng slot: **${settings.slotDurationMinutes} phút**\n` +
      `🗓️ Cửa sổ đăng ký: **${formatDateTimeVN(settings.registrationWindow.start)} → ${formatDateTimeVN(settings.registrationWindow.end)}**\n` +
      `▶️ Giờ bắt đầu: **${formatDateTimeVN(settings.startTime)}**\n` +
      `⏹️ Giờ kết thúc: **${formatDateTimeVN(settings.endTime)}**\n` +
      `📺 Live hợp lệ: tối thiểu **${settings.minLiveDurationMinutes} phút**, đỉnh **${settings.minViewers} viewer**`,
    components: [row],
    ephemeral: true,
  });
}

export async function handleRulesEditNumbersButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const settings = await getSettings();
  const fields: [string, string, number][] = [
    ['max_per_day_input', 'Tối đa slot/ngày/user', settings.maxSlotsPerDayPerUser],
    ['slot_duration_input', 'Thời lượng mỗi slot (phút)', settings.slotDurationMinutes],
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
  max_per_day_input: 'maxSlotsPerDayPerUser',
  slot_duration_input: 'slotDurationMinutes',
};

export async function handleRulesNumbersModal(interaction: ModalSubmitInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const parsed: Partial<DynamicSettings> = {};
  const invalidFields: string[] = [];

  for (const [inputId, settingKey] of Object.entries(NUMBER_FIELD_MAP)) {
    const raw = interaction.fields.getTextInputValue(inputId);
    const n = Number(raw);
    const isInvalid = !Number.isInteger(n) || n <= 0;
    if (isInvalid) {
      invalidFields.push(raw);
    } else {
      (parsed as Record<string, number>)[settingKey] = n;
    }
  }

  if (invalidFields.length > 0) {
    await interaction.reply({
      content: `⚠️ Giá trị nhập không hợp lệ (các tham số phải là số nguyên > 0). Giá trị sai: ${invalidFields.join(', ')}`,
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

export async function handleRulesEditScheduleButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const settings = await getSettings();
  const modal = new ModalBuilder()
    .setCustomId('admin_modal_rules_schedule')
    .setTitle('Sửa các mốc thời gian');

  const fields: [string, string, string][] = [
    ['registration_start_input', 'Mở đăng ký (YYYY-MM-DD HH:mm)', settings.registrationWindow.start],
    ['registration_end_input', 'Đóng đăng ký (YYYY-MM-DD HH:mm)', settings.registrationWindow.end],
    ['start_time_input', 'Slot đầu tiên (YYYY-MM-DD HH:mm)', settings.startTime],
    ['end_time_input', 'Slot cuối cùng (YYYY-MM-DD HH:mm)', settings.endTime],
  ];

  for (const [customId, label, value] of fields) {
    const input = new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setValue(formatAdminDateTime(value))
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  await interaction.showModal(modal);
}

export async function handleRulesScheduleModal(interaction: ModalSubmitInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const registrationStart = parseAdminDateTime(interaction.fields.getTextInputValue('registration_start_input'));
  const registrationEnd = parseAdminDateTime(interaction.fields.getTextInputValue('registration_end_input'));
  const startTime = parseAdminDateTime(interaction.fields.getTextInputValue('start_time_input'));
  const endTime = parseAdminDateTime(interaction.fields.getTextInputValue('end_time_input'));

  if (!registrationStart || !registrationEnd || !startTime || !endTime) {
    await interaction.reply({
      content: '⚠️ Datetime không hợp lệ. Vui lòng nhập đúng định dạng `YYYY-MM-DD HH:mm` theo giờ Việt Nam.',
      ephemeral: true,
    });
    return;
  }

  if (new Date(registrationStart) >= new Date(registrationEnd)) {
    await interaction.reply({ content: '⚠️ Thời điểm đóng đăng ký phải sau thời điểm mở đăng ký.', ephemeral: true });
    return;
  }

  if (new Date(startTime) > new Date(endTime)) {
    await interaction.reply({ content: '⚠️ Giờ kết thúc phải bằng hoặc sau giờ bắt đầu.', ephemeral: true });
    return;
  }

  await updateSettings({ registrationWindow: { start: registrationStart, end: registrationEnd }, startTime, endTime });

  await interaction.reply({
    content:
      `✅ Đã cập nhật các mốc thời gian.\n` +
      `🗓️ Cửa sổ đăng ký: **${formatDateTimeVN(registrationStart)} → ${formatDateTimeVN(registrationEnd)}**\n` +
      `▶️ Slot đầu tiên: **${formatDateTimeVN(startTime)}**\n` +
      `⏹️ Slot cuối cùng: **${formatDateTimeVN(endTime)}**`,
    ephemeral: true,
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
