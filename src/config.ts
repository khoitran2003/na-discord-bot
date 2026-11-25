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

// Số ngày dùng để tạo khoảng thời gian mặc định khi DB chưa có Setting.
// Đây chỉ là giá trị seed nội bộ; admin sẽ quản lý các mốc datetime trực tiếp trên Admin Portal.
export const DEFAULT_SCHEDULE_DURATION_DAYS = 7;

// Mỗi user tối đa bao nhiêu slot đang active (đang chờ/đã live) cùng lúc
export const MAX_ACTIVE_SLOTS_PER_USER = 5;

// Mỗi user chỉ được 1 slot / ngày
export const MAX_SLOTS_PER_DAY_PER_USER = 1;

// Cron chạy check cấp/thu quyền mỗi X phút
export const CRON_INTERVAL_MINUTES = 1;

// Thời lượng live tối thiểu (phút) để 1 buổi live được tính là hợp lệ
export const MIN_LIVE_DURATION_MINUTES = 45;

// Đỉnh số viewer tối thiểu (không tính host) trong buổi live để được tính là hợp lệ
export const MIN_VIEWERS = 3;

// Chống gian lận: thời gian viewer phải ở lại phòng tối thiểu (phút) để được tính là hợp lệ
export const MIN_VIEWER_DWELL_MINUTES = 5;

// Chống gian lận: tuổi tài khoản Discord tối thiểu của viewer (ngày)
export const MIN_VIEWER_ACCOUNT_AGE_DAYS = 7;

// Chống gian lận: thời gian viewer đã tham gia server tối thiểu (giờ)
export const MIN_VIEWER_GUILD_AGE_HOURS = 24;

// Chống gian lận: chỉ tính thời lượng live khi host đang bật stream/camera
export const REQUIRE_HOST_STREAMING = true;

// Chống gian lận: số lần tối đa 1 viewer được tính hợp lệ cho cùng 1 host ở các buổi trước (0 = tắt)
export const MAX_REPEAT_VIEWER_BOOKINGS = 0;

export const TIMEZONE = 'Asia/Ho_Chi_Minh';
