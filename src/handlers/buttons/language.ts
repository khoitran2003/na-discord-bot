import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle } from 'discord.js';
import { setUserLanguage } from '../../services/userPreferenceService';
import { isLang, t } from '../../i18n';

export async function handleLanguageButton(interaction: ButtonInteraction) {
  const btnVi = new ButtonBuilder().setCustomId('set_lang:vi').setLabel('🇻🇳 Tiếng Việt').setStyle(ButtonStyle.Secondary);
  const btnEn = new ButtonBuilder().setCustomId('set_lang:en').setLabel('🇬🇧 English').setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnVi, btnEn);

  // Chưa biết ngôn ngữ user chọn trước đó (hoặc chính là bước để chọn) -> prompt này giữ song ngữ cố định
  await interaction.reply({
    content: 'Chọn ngôn ngữ bạn muốn dùng / Choose your preferred language:',
    components: [row],
    ephemeral: true,
  });
}

export async function handleSetLanguage(interaction: ButtonInteraction) {
  const [, langRaw] = interaction.customId.split(':');
  const lang = isLang(langRaw) ? langRaw : 'vi';

  await setUserLanguage(interaction.user.id, lang);
  await interaction.update({ content: t('language.saved', lang), components: [] });
}
