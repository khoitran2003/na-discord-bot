/**
 * Test harness i18n + UserPreference (chạy trên Postgres local, KHÔNG kết nối Discord).
 *   DATABASE_URL="postgresql://..." npx tsx scripts/test-i18n.ts
 */
import { t, isLang, Lang } from '../src/i18n';
import vi from '../src/i18n/vi.json';
import en from '../src/i18n/en.json';
import { getUserLanguage, setUserLanguage } from '../src/services/userPreferenceService';
import { prisma } from '../src/prisma';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

async function main() {
  // 1. Key parity vi <-> en
  const viKeys = Object.keys(vi).sort();
  const enKeys = Object.keys(en).sort();
  const missingInEn = viKeys.filter((k) => !(k in en));
  const missingInVi = enKeys.filter((k) => !(k in vi));
  ok('Key parity vi/en', missingInEn.length === 0 && missingInVi.length === 0,
    `viKeys=${viKeys.length} enKeys=${enKeys.length} missingEn=[${missingInEn}] missingVi=[${missingInVi}]`);

  // 2. t() cơ bản vi vs en khác nhau (lấy 1 key bất kỳ có nội dung khác)
  const sampleKey = viKeys[0] as any;
  ok('t() trả vi', typeof t(sampleKey, 'vi') === 'string' && t(sampleKey, 'vi').length > 0, `${sampleKey}="${t(sampleKey, 'vi')}"`);
  ok('t() trả en', typeof t(sampleKey, 'en') === 'string' && t(sampleKey, 'en').length > 0, `${sampleKey}="${t(sampleKey, 'en')}"`);

  // 3. Param substitution
  const paramKey = viKeys.find((k) => /\{[a-zA-Z]+\}/.test((vi as any)[k])) as any;
  if (paramKey) {
    const pname = ((vi as any)[paramKey].match(/\{([a-zA-Z]+)\}/) || [])[1];
    const out = t(paramKey, 'vi', { [pname]: 'XYZ' } as any);
    ok('t() thay {param}', out.includes('XYZ') && !out.includes(`{${pname}}`), `key=${paramKey} -> "${out}"`);
  } else {
    ok('t() thay {param}', true, '(không có key nào chứa param, bỏ qua)');
  }

  // 4. Fallback về vi khi key thiếu ở en (giả lập bằng key không tồn tại)
  ok('t() fallback key lạ trả chính key', t('__nope__' as any, 'en') === '__nope__');

  // 5. isLang guard
  ok('isLang hợp lệ', isLang('vi') && isLang('en') && !isLang('fr') && !isLang(''));

  // 6. userPreferenceService round-trip trên Postgres
  const uid = 'test-user-i18n-001';
  await prisma.userPreference.deleteMany({ where: { userId: uid } });
  const def = await getUserLanguage(uid);
  ok('getUserLanguage mặc định vi khi chưa có', def === 'vi', `got=${def}`);

  await setUserLanguage(uid, 'en' as Lang);
  const afterEn = await getUserLanguage(uid);
  ok('set en -> get en', afterEn === 'en', `got=${afterEn}`);

  await setUserLanguage(uid, 'vi' as Lang);
  const afterVi = await getUserLanguage(uid);
  ok('set vi -> get vi (upsert update)', afterVi === 'vi', `got=${afterVi}`);

  const rowCount = await prisma.userPreference.count({ where: { userId: uid } });
  ok('upsert không nhân đôi row', rowCount === 1, `count=${rowCount}`);

  // cleanup
  await prisma.userPreference.deleteMany({ where: { userId: uid } });

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('TEST CRASHED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
