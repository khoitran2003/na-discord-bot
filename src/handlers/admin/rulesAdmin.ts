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
  const antiFraudButton = new ButtonBuilder()
    .setCustomId('admin_rules_edit_antifraud')
    .setLabel('Sửa chống gian lận')
    .setEmoji('🛡️')
    .setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    numbersButton,
    scheduleButton,
    liveValidityButton,
    antiFraudButton
  );

  await interaction.reply({
    content:
      `**Rule đăng ký hiện tại**\n` +
      `📆 Tối đa slot/ngày/user: **${settings.maxSlotsPerDayPerUser}**\n` +
      `⏱️ Thời lượng slot: **${settings.slotDurationMinutes} phút**\n` +
      `🗓️ Cửa sổ đăng ký: **${formatDateTimeVN(settings.registrationWindow.start)} → ${formatDateTimeVN(settings.registrationWindow.end)}**\n` +
      `▶️ Giờ bắt đầu: **${formatDateTimeVN(settings.startTime)}**\n` +
      `⏹️ Giờ kết thúc: **${formatDateTimeVN(settings.endTime)}**\n` +
      `📺 Live hợp lệ: tối thiểu **${settings.minLiveDurationMinutes} phút**, tối thiểu **${settings.minViewers} viewer đạt chuẩn**\n` +
      `🛡️ Chống gian lận: Bắt buộc share/cam: **${settings.requireHostStreaming ? 'Có' : 'Không'}** | Viewer ở lại ≥ **${settings.minViewerDwellMinutes}p** | Tuổi acc ≥ **${settings.minViewerAccountAgeDays} ngày** | Ở server ≥ **${settings.minViewerGuildAgeHours}h** | Giới hạn lặp viewer: **${settings.maxRepeatViewerBookings === 0 ? 'Tắt' : settings.maxRepeatViewerBookings + ' lần'}**`,
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

  const fields: [string, string, number][] = [
    ['min_live_duration_input', 'Thời lượng live tối thiểu (phút)', settings.minLiveDurationMinutes],
    ['min_viewers_input', 'Viewer đạt chuẩn tối thiểu (không tính host)', settings.minViewers],
    ['min_dwell_input', 'Thời gian viewer ở lại tối thiểu (phút)', settings.minViewerDwellMinutes],
    ['min_account_age_input', 'Tuổi tài khoản viewer tối thiểu (ngày)', settings.minViewerAccountAgeDays],
    ['min_guild_age_input', 'Thời gian viewer ở server tối thiểu (giờ)', settings.minViewerGuildAgeHours],
  ];

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

export async function handleRulesLiveValidityModal(interaction: ModalSubmitInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const minLiveDurationMinutes = Number(interaction.fields.getTextInputValue('min_live_duration_input'));
  const minViewers = Number(interaction.fields.getTextInputValue('min_viewers_input'));
  const minViewerDwellMinutes = Number(interaction.fields.getTextInputValue('min_dwell_input'));
  const minViewerAccountAgeDays = Number(interaction.fields.getTextInputValue('min_account_age_input'));
  const minViewerGuildAgeHours = Number(interaction.fields.getTextInputValue('min_guild_age_input'));

  const values = [
    minLiveDurationMinutes,
    minViewers,
    minViewerDwellMinutes,
    minViewerAccountAgeDays,
    minViewerGuildAgeHours,
  ];

  if (values.some((v) => !Number.isInteger(v) || v < 0)) {
    await interaction.reply({
      content: '⚠️ Giá trị nhập không hợp lệ (tất cả phải là số nguyên >= 0).',
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

  await updateSettings({
    minLiveDurationMinutes,
    minViewers,
    minViewerDwellMinutes,
    minViewerAccountAgeDays,
    minViewerGuildAgeHours,
  });
  await interaction.reply({ content: '✅ Đã cập nhật rule live hợp lệ.', ephemeral: true });
}

export async function handleRulesEditAntiFraudButton(interaction: ButtonInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const settings = await getSettings();
  const modal = new ModalBuilder().setCustomId('admin_modal_rules_antifraud').setTitle('Sửa chống gian lận');

  const requireStreamingInput = new TextInputBuilder()
    .setCustomId('require_streaming_input')
    .setLabel('Bắt buộc share stream/cam? (co/khong)')
    .setStyle(TextInputStyle.Short)
    .setValue(settings.requireHostStreaming ? 'co' : 'khong')
    .setRequired(true);

  const maxRepeatViewerInput = new TextInputBuilder()
    .setCustomId('max_repeat_viewer_input')
    .setLabel('Giới hạn lặp viewer giữa các buổi (0=tắt)')
    .setStyle(TextInputStyle.Short)
    .setValue(String(settings.maxRepeatViewerBookings))
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(requireStreamingInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(maxRepeatViewerInput)
  );

  await interaction.showModal(modal);
}

const TRUE_STRINGS = new Set(['co', 'có', 'true', '1', 'yes']);
const FALSE_STRINGS = new Set(['khong', 'không', 'false', '0', 'no']);

export async function handleRulesAntiFraudModal(interaction: ModalSubmitInteraction) {
  if (!(await requireManageGuild(interaction))) return;

  const rawRequireStreaming = interaction.fields.getTextInputValue('require_streaming_input').trim().toLowerCase();
  let requireHostStreaming: boolean;
  if (TRUE_STRINGS.has(rawRequireStreaming)) {
    requireHostStreaming = true;
  } else if (FALSE_STRINGS.has(rawRequireStreaming)) {
    requireHostStreaming = false;
  } else {
    await interaction.reply({
      content: '⚠️ Giá trị "Bắt buộc share stream/cam" không hợp lệ. Vui lòng nhập `co` hoặc `khong`.',
      ephemeral: true,
    });
    return;
  }

  const maxRepeatViewerBookings = Number(interaction.fields.getTextInputValue('max_repeat_viewer_input').trim());
  if (!Number.isInteger(maxRepeatViewerBookings) || maxRepeatViewerBookings < 0) {
    await interaction.reply({
      content: '⚠️ Giới hạn lặp viewer phải là số nguyên >= 0.',
      ephemeral: true,
    });
    return;
  }

  await updateSettings({ requireHostStreaming, maxRepeatViewerBookings });
  await interaction.reply({
    content:
      `✅ Đã cập nhật cấu hình chống gian lận.\n` +
      `🛡️ Bắt buộc share/cam: **${requireHostStreaming ? 'Có' : 'Không'}**\n` +
      `🔁 Giới hạn lặp viewer: **${maxRepeatViewerBookings === 0 ? 'Tắt' : `${maxRepeatViewerBookings} lần`}**`,
    ephemeral: true,
  });
}
