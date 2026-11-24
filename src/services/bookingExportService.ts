import ExcelJS from 'exceljs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { TIMEZONE } from '../config';
import { BookingStatus } from '../types';
import { AdminBookingStatusFilter, getBookingsForAdminExport } from './bookingService';
import { getSettings } from './settingsService';

dayjs.extend(utc);
dayjs.extend(timezone);

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Đang chờ',
  LIVE: 'Đang live',
  DONE: 'Đã xong',
  CANCELLED: 'Đã hủy',
};

const END_REASON_LABELS: Record<string, string> = {
  MANUAL: 'Kết thúc thủ công',
  AUTO_TIMEOUT: 'Tự động hết giờ',
};

const STATUS_COLORS: Record<BookingStatus, string> = {
  PENDING: 'FFFFC000',
  LIVE: 'FFFF4D4F',
  DONE: 'FF70AD47',
  CANCELLED: 'FFA5A5A5',
};

/** Excel không lưu timezone; chuyển timestamp sang Date mang wall-clock Asia/Ho_Chi_Minh. */
function toExcelDate(value: Date | null): Date | null {
  if (!value) return null;
  const local = dayjs(value).tz(TIMEZONE);
  return new Date(Date.UTC(local.year(), local.month(), local.date(), local.hour(), local.minute(), local.second()));
}

export interface BookingExportResult {
  buffer: Buffer;
  count: number;
  fileName: string;
}

export async function generateBookingsWorkbook(
  status: AdminBookingStatusFilter
): Promise<BookingExportResult> {
  const [bookings, settings] = await Promise.all([
    getBookingsForAdminExport({ status }),
    getSettings(),
  ]);
  const roomLabels = new Map(settings.rooms.map((room) => [room.id, room.label]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Livestream Booking Bot';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Bookings', {
    properties: { tabColor: { argb: 'FF5865F2' } },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  worksheet.columns = [
    { header: 'Booking ID', key: 'id', width: 27 },
    { header: 'Discord User ID', key: 'userId', width: 22 },
    { header: 'ID nhân vật ingame', key: 'ingameRoleId', width: 22 },
    { header: 'Username', key: 'username', width: 22 },
    { header: 'Phòng live', key: 'roomLabel', width: 22 },
    { header: 'Room ID', key: 'roomId', width: 18 },
    { header: 'Nội dung livestream', key: 'content', width: 38 },
    { header: 'Giờ bắt đầu', key: 'startTime', width: 20 },
    { header: 'Giờ kết thúc', key: 'endTime', width: 20 },
    { header: 'Trạng thái', key: 'statusLabel', width: 16 },
    { header: 'Mã trạng thái', key: 'status', width: 16 },
    { header: 'Bắt đầu thực tế', key: 'actualStartAt', width: 20 },
    { header: 'Kết thúc thực tế', key: 'actualEndAt', width: 20 },
    { header: 'Peak viewers', key: 'peakViewers', width: 14 },
    { header: 'Live hợp lệ', key: 'isValidLive', width: 16 },
    { header: 'Lý do kết thúc', key: 'endReason', width: 20 },
    { header: 'Đã cấp quyền', key: 'roleGranted', width: 15 },
    { header: 'Ngày tạo', key: 'createdAt', width: 20 },
    { header: 'Ngày cập nhật', key: 'updatedAt', width: 20 },
  ];

  for (const booking of bookings) {
    const statusCode = booking.status as BookingStatus;
    const row = worksheet.addRow({
      id: booking.id,
      userId: booking.userId,
      ingameRoleId: booking.ingameRoleId?.toString() ?? '',
      username: booking.username,
      roomLabel: roomLabels.get(booking.roomId) ?? booking.roomId,
      roomId: booking.roomId,
      content: booking.livestreamContent || '',
      startTime: toExcelDate(booking.startTime),
      endTime: toExcelDate(booking.endTime),
      statusLabel: STATUS_LABELS[statusCode] ?? booking.status,
      status: booking.status,
      actualStartAt: toExcelDate(booking.actualStartAt),
      actualEndAt: toExcelDate(booking.actualEndAt),
      peakViewers: booking.peakViewers,
      isValidLive: booking.isValidLive === null ? 'Chưa đánh giá' : booking.isValidLive ? 'Hợp lệ' : 'Không hợp lệ',
      endReason: booking.endReason ? END_REASON_LABELS[booking.endReason] ?? booking.endReason : '',
      roleGranted: booking.roleGranted ? 'Có' : 'Không',
      createdAt: toExcelDate(booking.createdAt),
      updatedAt: toExcelDate(booking.updatedAt),
    });

    row.height = 20;
    row.font = { name: 'Arial', size: 10 };
    row.alignment = { vertical: 'middle' };
    row.getCell('statusLabel').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: STATUS_COLORS[statusCode] ?? 'FFD9E2F3' },
    };
    row.getCell('statusLabel').font = {
      name: 'Arial',
      size: 10,
      bold: true,
      color: { argb: statusCode === 'PENDING' ? 'FF000000' : 'FFFFFFFF' },
    };
  }

  const header = worksheet.getRow(1);
  header.height = 26;
  header.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5865F2' } };
  header.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.autoFilter = { from: 'A1', to: 'S1' };
  for (const key of ['id', 'userId', 'ingameRoleId', 'roomId']) {
    worksheet.getColumn(key).numFmt = '@';
  }
  worksheet.getColumn('content').alignment = { vertical: 'top', wrapText: true };
  worksheet.getColumn('peakViewers').numFmt = '#,##0';

  for (const key of ['startTime', 'endTime', 'actualStartAt', 'actualEndAt', 'createdAt', 'updatedAt']) {
    worksheet.getColumn(key).numFmt = 'dd/mm/yyyy hh:mm';
    worksheet.getColumn(key).alignment = { vertical: 'middle', horizontal: 'center' };
  }

  const rawBuffer = await workbook.xlsx.writeBuffer();
  const filterSuffix = status === 'ALL' ? 'all' : status.toLowerCase();
  const dateSuffix = dayjs().tz(TIMEZONE).format('YYYY-MM-DD');

  return {
    buffer: Buffer.from(rawBuffer),
    count: bookings.length,
    fileName: `livestream_bookings_${filterSuffix}_${dateSuffix}.xlsx`,
  };
}
