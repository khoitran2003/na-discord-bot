import 'dotenv/config';

/**
 * Giá trị seed mặc định cho DynamicSettings (xem settingsService.ts), chỉ dùng lần đầu bot chạy
 * khi DB chưa có Setting row. Sau đó mọi thay đổi phải qua Admin Portal (/admin-portal), sửa file
 * này không có tác dụng. Riêng danh sách phòng KHÔNG có default — phải tự thêm qua Admin Portal.
 */

export const env = {
  token: process.env.DISCORD_TOKEN!,
  clientId: process.env.DISCORD_CLIENT_ID!,
  guildId: process.env.DISCORD_GUILD_ID!,
  registerChannelId: process.env.REGISTER_CHANNEL_ID!,
  summaryChannelId: process.env.SUMMARY_CHANNEL_ID!,
  adminPortalChannelId: process.env.ADMIN_PORTAL_CHANNEL_ID!,
  notiChannelId: process.env.NOTI_CHANNEL_ID!,
};

// Khung giờ live trong ngày (giờ VN, 24h format). Mỗi entry là 1 slot dài SLOT_DURATION_MINUTES.
export const TIME_SLOTS = [
  '18:00',
  '19:00',
  '20:00',
  '21:00',
];

export const SLOT_DURATION_MINUTES = 60;

// Cửa sổ mở đăng ký trong tuần: 0 = Chủ Nhật ... 6 = Thứ Bảy
export const REGISTRATION_WINDOW = {
  openDay: 0,   // Chủ Nhật
  openHour: 0,
  closeDay: 6,  // Thứ 7
  closeHour: 0,
};

// Số ngày tới được phép đăng ký (từ hôm nay), để giới hạn dropdown chọn Ngày
export const BOOKABLE_DAYS_AHEAD = 7;

// Không cho đặt slot cách giờ hiện tại dưới X giờ
export const MIN_HOURS_BEFORE_BOOKING = 0;

// Mỗi user tối đa bao nhiêu slot đang active (đang chờ/đã live) cùng lúc
export const MAX_ACTIVE_SLOTS_PER_USER = 5;

// Mỗi user chỉ được 1 slot / ngày
export const MAX_SLOTS_PER_DAY_PER_USER = 1;

// Cron chạy check cấp/thu quyền mỗi X phút
export const CRON_INTERVAL_MINUTES = 1;

// Thời lượng live tối thiểu (phút) để 1 buổi live được tính là hợp lệ
export const MIN_LIVE_DURATION_MINUTES = 30;

// Đỉnh số viewer tối thiểu (không tính host) trong buổi live để được tính là hợp lệ
export const MIN_VIEWERS = 3;

export const TIMEZONE = 'Asia/Ho_Chi_Minh';
