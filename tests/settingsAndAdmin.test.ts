import './helpers/mockPrisma';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { ButtonInteraction, ModalSubmitInteraction, PermissionFlagsBits } from 'discord.js';
import { resetMockStore, seedBooking, seedSettings, seedViewer } from './helpers/mockPrisma';
import { getSettings } from '../src/services/settingsService';
import { handleRulesEditAntiFraudButton, handleRulesAntiFraudModal } from '../src/handlers/admin/rulesAdmin';
import { generateBookingsWorkbook } from '../src/services/bookingExportService';
import {
  MIN_VIEWER_DWELL_MINUTES,
  MIN_VIEWER_ACCOUNT_AGE_DAYS,
  MIN_VIEWER_GUILD_AGE_HOURS,
  REQUIRE_HOST_STREAMING,
  MAX_REPEAT_VIEWER_BOOKINGS,
} from '../src/config';
import viJson from '../src/i18n/vi.json';
import enJson from '../src/i18n/en.json';

describe('settingsService, rulesAdmin, bookingExportService & i18n', () => {
  beforeEach(() => {
    resetMockStore();
  });

  describe('settingsService normalization', () => {
    it('chuẩn hóa settings cũ thiếu trường chống gian lận bằng giá trị mặc định', async () => {
      seedSettings({
        rooms: [{ id: 'r1', label: 'Room 1', voiceChannelId: 'vc-1' }],
        timeSlots: ['18:00'],
        slotDurationMinutes: 60,
        registrationWindow: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
        startTime: '2026-01-01T00:00:00.000Z',
        endTime: '2026-12-31T23:59:59.000Z',
      });

      const settings = await getSettings();
      assert.equal(settings.minViewerDwellMinutes, MIN_VIEWER_DWELL_MINUTES);
      assert.equal(settings.minViewerAccountAgeDays, MIN_VIEWER_ACCOUNT_AGE_DAYS);
      assert.equal(settings.minViewerGuildAgeHours, MIN_VIEWER_GUILD_AGE_HOURS);
      assert.equal(settings.requireHostStreaming, REQUIRE_HOST_STREAMING);
      assert.equal(settings.maxRepeatViewerBookings, MAX_REPEAT_VIEWER_BOOKINGS);
    });

    it('fallback về mặc định khi gặp giá trị âm hoặc NaN/sai kiểu', async () => {
      seedSettings({
        rooms: [],
        timeSlots: ['18:00'],
        slotDurationMinutes: 60,
        registrationWindow: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
        startTime: '2026-01-01T00:00:00.000Z',
        endTime: '2026-12-31T23:59:59.000Z',
        minViewerDwellMinutes: -5,
        minViewerAccountAgeDays: Number.NaN,
        minViewerGuildAgeHours: -1,
        maxRepeatViewerBookings: -2,
        requireHostStreaming: 'yes',
      });

      const settings = await getSettings();
      assert.equal(settings.minViewerDwellMinutes, MIN_VIEWER_DWELL_MINUTES);
      assert.equal(settings.minViewerAccountAgeDays, MIN_VIEWER_ACCOUNT_AGE_DAYS);
      assert.equal(settings.minViewerGuildAgeHours, MIN_VIEWER_GUILD_AGE_HOURS);
      assert.equal(settings.maxRepeatViewerBookings, MAX_REPEAT_VIEWER_BOOKINGS);
      assert.equal(settings.requireHostStreaming, REQUIRE_HOST_STREAMING);
    });
  });

  describe('rulesAdmin anti-fraud handlers', () => {
    it('handleRulesEditAntiFraudButton từ chối khi thiếu quyền ManageGuild và mở modal khi có quyền', async () => {
      const replies: string[] = [];
      let shownModalCustomId: string | null = null;

      const noPermInteraction = {
        memberPermissions: { has: () => false },
        reply: async (opts: { content: string }) => {
          replies.push(opts.content);
        },
        showModal: async () => {
          shownModalCustomId = 'should-not-show';
        },
      } as unknown as ButtonInteraction;

      await handleRulesEditAntiFraudButton(noPermInteraction);
      assert.equal(replies.length, 1);
      assert.ok(replies[0].includes('không có quyền'));
      assert.equal(shownModalCustomId, null);

      const permInteraction = {
        memberPermissions: { has: (flag: bigint) => flag === PermissionFlagsBits.ManageGuild },
        reply: async () => {},
        showModal: async (modal: { data?: { custom_id?: string }; toJSON?: () => { custom_id?: string } }) => {
          shownModalCustomId = modal.toJSON ? modal.toJSON().custom_id ?? null : modal.data?.custom_id ?? null;
        },
      } as unknown as ButtonInteraction;

      await handleRulesEditAntiFraudButton(permInteraction);
      assert.equal(shownModalCustomId, 'admin_modal_rules_antifraud');
    });

    it('handleRulesAntiFraudModal kiểm tra quyền, từ chối input sai và cập nhật settings khi hợp lệ', async () => {
      const makeModal = (hasPerm: boolean, streamingVal: string, repeatVal: string) => {
        const replies: string[] = [];
        const interaction = {
          memberPermissions: { has: (flag: bigint) => hasPerm && flag === PermissionFlagsBits.ManageGuild },
          fields: {
            getTextInputValue: (id: string) => (id === 'require_streaming_input' ? streamingVal : repeatVal),
          },
          reply: async (opts: { content: string }) => {
            replies.push(opts.content);
          },
        } as unknown as ModalSubmitInteraction;
        return { interaction, replies };
      };

      // Không có quyền
      const noPerm = makeModal(false, 'co', '1');
      await handleRulesAntiFraudModal(noPerm.interaction);
      assert.ok(noPerm.replies[0].includes('không có quyền'));

      // Sai require_streaming_input
      const badStream = makeModal(true, 'maybe', '1');
      await handleRulesAntiFraudModal(badStream.interaction);
      assert.ok(badStream.replies[0].includes('không hợp lệ'));

      // Sai max_repeat_viewer_input
      const badRepeat = makeModal(true, 'co', '-1');
      await handleRulesAntiFraudModal(badRepeat.interaction);
      assert.ok(badRepeat.replies[0].includes('số nguyên >= 0'));

      // Hợp lệ
      const valid = makeModal(true, 'khong', '2');
      await handleRulesAntiFraudModal(valid.interaction);
      assert.ok(valid.replies[0].includes('Đã cập nhật cấu hình chống gian lận'));

      const settings = await getSettings();
      assert.equal(settings.requireHostStreaming, false);
      assert.equal(settings.maxRepeatViewerBookings, 2);
    });
  });

  describe('bookingExportService.generateBookingsWorkbook', () => {
    it('tạo file Excel hợp lệ chứa đầy đủ các cột chống gian lận mới', async () => {
      seedSettings({
        rooms: [{ id: 'room-1', label: 'Phòng VIP', voiceChannelId: 'vc-1' }],
        timeSlots: ['18:00'],
        slotDurationMinutes: 60,
        registrationWindow: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
        startTime: '2026-01-01T00:00:00.000Z',
        endTime: '2026-12-31T23:59:59.000Z',
      });

      const booking = seedBooking({
        id: 'b-export-1',
        userId: 'host-1',
        roomId: 'room-1',
        status: 'DONE',
        streamSeconds: 1800,
        qualifiedViewers: 2,
        suspicious: true,
        suspiciousReason: 'Viewer lặp lại bất thường',
        isValidLive: false,
      });
      seedViewer({ bookingId: booking.id, userId: 'v-1', dwellSeconds: 600 });
      seedViewer({ bookingId: booking.id, userId: 'v-2', dwellSeconds: 300 });

      const result = await generateBookingsWorkbook('ALL');
      assert.equal(result.count, 1);
      assert.ok(Buffer.isBuffer(result.buffer));
      assert.ok(result.buffer.length > 0);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(result.buffer as unknown as ArrayBuffer);
      const ws = wb.getWorksheet('Bookings');
      assert.ok(ws);

      const headerValues = ws.getRow(1).values as Array<string | undefined>;
      for (const expectedCol of [
        'Phút stream thực tế',
        'Viewer đạt chuẩn',
        'Nghi ngờ gian lận',
        'Lý do nghi ngờ',
        'Chi tiết viewer (ID:phút)',
      ]) {
        assert.ok(headerValues.includes(expectedCol), `Thiếu cột: ${expectedCol}`);
      }

      const row2 = ws.getRow(2).values as Array<unknown>;
      assert.ok(row2.includes(30)); // 1800s -> 30 phút
      assert.ok(row2.includes('Viewer lặp lại bất thường'));
      assert.ok(row2.includes('v-1:10p, v-2:5p'));
    });
  });

  describe('i18n completeness', () => {
    it('vi.json và en.json đều có validity.valid, validity.invalid và mọi key trong vi.json đều có trong en.json', () => {
      const viKeys = Object.keys(viJson);
      const enKeys = new Set(Object.keys(enJson));

      assert.ok(viKeys.includes('validity.valid'));
      assert.ok(viKeys.includes('validity.invalid'));
      assert.ok(enKeys.has('validity.valid'));
      assert.ok(enKeys.has('validity.invalid'));

      const missingInEn = viKeys.filter((k) => !enKeys.has(k));
      assert.deepEqual(missingInEn, []);
    });
  });
});
