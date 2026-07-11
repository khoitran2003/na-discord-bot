import { prisma } from '../prisma';
import { Lang, isLang } from '../i18n';

export async function getUserLanguage(userId: string): Promise<Lang> {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  return pref && isLang(pref.language) ? pref.language : 'vi';
}

export async function setUserLanguage(userId: string, language: Lang): Promise<void> {
  await prisma.userPreference.upsert({
    where: { userId },
    update: { language },
    create: { userId, language },
  });
}
