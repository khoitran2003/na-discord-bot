# 🎙️ Livestream Booking Discord Bot

Bot Discord tự động hóa quy trình đăng ký lịch host livestream, tự động cấp/thu quyền quản lý Voice Channel (`Move Members`, `Mute Members`) theo khung giờ đăng ký, đồng thời tự động đánh giá thời lượng và đỉnh viewer của buổi live.

---

## 🛠️ Công nghệ sử dụng

- **Language**: TypeScript (Node.js)
- **Discord Framework**: `discord.js` v14
- **Database**: SQLite via Prisma ORM
- **Scheduler**: `node-cron`
- **Timezone**: `dayjs` (Asia/Ho_Chi_Minh)
- **Runtime**: `tsx` (Dev mode) / `node` (Production)

---

## 📁 Cấu trúc Project

```
livestream-booking-bot/
├── prisma/
│   └── schema.prisma         # Schema cơ sở dữ liệu (Booking, Setting, UserThread)
├── src/
│   ├── index.ts              # Entry point chính của bot
│   ├── client.ts             # Khởi tạo Discord Client & Intents
│   ├── config.ts             # Biến môi trường & Giá trị mặc định (Seed settings)
│   ├── deployCommands.ts     # Script đăng ký Slash Commands với Discord API
│   ├── commands/
│   │   ├── setup.ts          # Slash command /setup (cho kênh Đăng ký)
│   │   └── adminPortal.ts    # Slash command /admin-portal (cho Admin)
│   ├── handlers/             # Bộ xử lý tương tác (Buttons, Select Menus, Modals)
│   │   ├── interactionCreate.ts  # Router điều hướng mọi tương tác
│   │   ├── voiceStateUpdate.ts   # Lắng nghe người dùng join/leave Voice Channel
│   │   ├── admin/            # Xử lý các chức năng trên Admin Portal
│   │   └── user/             # Xử lý luồng đăng ký/hủy/xem lịch của User
│   ├── services/             # Logic nghiệp vụ
│   │   ├── bookingService.ts       # Quản lý Đăng ký (Tạo, Hủy, Check trùng/hạn mức)
│   │   ├── settingsService.ts      # Quản lý Cấu hình động trong DB
│   │   ├── roleService.ts          # Cấp/Thu quyền trên Voice Channel
│   │   ├── userThreadService.ts    # Tạo & Gửi log vào Private Thread của User
│   │   └── publicTimelineService.ts# Cập nhật bảng Timeline công khai
│   ├── cron/
│   │   └── roleCron.ts       # Cron job kiểm tra cấp/thu quyền & check viewer định kỳ
│   └── utils/
│       └── time.ts           # Xử lý thời gian, múi giờ Việt Nam (Asia/Ho_Chi_Minh)
├── .env.example              # File mẫu cấu hình biến môi trường
├── package.json              # Khai báo dependencies và scripts
└── tsconfig.json             # Cấu hình biên dịch TypeScript
```

---

## 📋 Yêu cầu tiền đề (Prerequisites)

1. **Node.js**: Phiên bản >= 18.0.0.
2. **NPM** (hoặc Yarn/PNPM): Đã đi kèm với Node.js.
3. **Discord Bot Application**:
   - Đã tạo Application trên [Discord Developer Portal](https://discord.com/developers/applications).
   - Đã bật các **Privileged Gateway Intents**:
     - `SERVER MEMBERS INTENT`
     - `MESSAGE CONTENT INTENT`

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy (Step-by-Step)

### 📌 Bước 1 — Clone Repository & Cài đặt Dependencies

Mở terminal tại thư mục dự án và chạy:

```bash
npm install
```

---

### 📌 Bước 2 — Cấu hình Biến môi trường (`.env`)

1. Tạo file `.env` từ file mẫu `.env.example`:

```bash
cp .env.example .env
```

2. Mở file `.env` và điền các thông tin tương ứng:

```env
# Discord Bot Credentials
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_guild_id_here

# Channel IDs (Copy ID các kênh từ Discord)
REGISTER_CHANNEL_ID=channel_id_dang_ky_host_milestone
SUMMARY_CHANNEL_ID=channel_id_check_time_live
ADMIN_PORTAL_CHANNEL_ID=channel_id_admin_portal
NOTI_CHANNEL_ID=channel_id_thong_bao_chung

# Database (Mặc định dùng SQLite local)
DATABASE_URL="file:./dev.db"
```

> 💡 **Cách lấy ID trên Discord**: Bật **Developer Mode** (User Settings > Advanced > Developer Mode) -> Chuột phải vào Server hoặc Kênh -> Chọn **Copy ID**.

> ⚠️ **Lưu ý quan trọng về Quyền của Bot (Bot Permissions)**:
> - Bot sử dụng **Permission Overwrite** trực tiếp trên các kênh Voice (cấp quyền `Move Members` và `Mute Members` cho Host trong khung giờ live).
> - Role của Bot trên Server **cần có sẵn các quyền**: `Manage Roles`, `Manage Permissions`, `Move Members`, `Mute Members`, `View Channel`, `Send Messages`, `Manage Threads`, `Embed Links`.

---

### 📌 Bước 3 — Khởi tạo Database (Prisma Migration)

Chạy lệnh bên dưới để tạo file cơ sở dữ liệu SQLite (`dev.db`) và áp dụng schema:

```bash
npm run prisma:migrate
```

*Nếu đây là lần đầu chạy, Prisma sẽ tự động tạo migration `init` và sinh client.*

---

### 📌 Bước 4 — Đăng ký Slash Commands (`/setup` & `/admin-portal`)

Đăng ký các lệnh điều khiển với Discord API (chạy 1 lần ban đầu, hoặc mỗi khi bạn chỉnh sửa định nghĩa command):

```bash
npm run deploy-commands
```

Khi chạy thành công, terminal sẽ xuất hiện: `✅ Đăng ký command thành công.`

---

### 📌 Bước 5 — Khởi chạy Bot ở chế độ Development

Chạy bot ở chế độ xem thay đổi trực tiếp (Hot Reload):

```bash
npm run dev
```

Nếu cấu hình đúng, terminal sẽ báo:
```text
🤖 Bot <Tên_Bot> đã sẵn sàng hoạt động!
⏰ Đã khởi chạy Cron job kiểm tra slot live.
```

---

### 📌 Bước 6 — Thiết lập Bảng điều khiển trên Discord Server

1. **Khởi tạo Admin Portal** (Dành cho Admin/Quản lý Server):
   - Đến kênh tương ứng với `ADMIN_PORTAL_CHANNEL_ID`.
   - Gõ lệnh `/admin-portal` và nhấn Enter.
   - Bảng điều khiển **Admin Portal** xuất hiện. Bấm nút **Quản lý phòng** 🚪 để thêm danh sách phòng và ID Voice Channel tương ứng.
   - Cấu hình thêm Khung giờ, Rule đăng ký, Rule live hợp lệ nếu cần.

2. **Khởi tạo Bảng Đăng ký cho Thành viên**:
   - Đến kênh tương ứng với `REGISTER_CHANNEL_ID`.
   - Gõ lệnh `/setup` và nhấn Enter.
   - Bot sẽ gửi một Tin nhắn giao diện gồm 3 nút bấm:
     - 📅 **Đăng ký / Đổi lịch**
     - ❌ **Hủy lịch đăng ký**
     - 📋 **Lịch đăng ký của tôi**

---

## 🏗️ Build & Chạy Production

Để đóng gói và khởi chạy bot trong môi trường chính thức (Production):

1. **Biên dịch mã nguồn TypeScript**:
   ```bash
   npm run build
   ```

2. **Chạy ứng dụng đã biên dịch**:
   ```bash
   npm start
   ```

3. **(Khuyến nghị) Khởi chạy nền với PM2**:
   Để bot tự động chạy ngầm và tự khởi động lại khi crash hoặc khi restart server:
   ```bash
   npm install -g pm2
   pm2 start dist/index.js --name livestream-booking-bot
   pm2 save
   pm2 startup
   ```

---

## 📜 Danh sách các Lệnh Command Line (Scripts)

| Lệnh Script | Mô tả |
| :--- | :--- |
| `npm run dev` | Chạy Bot ở chế độ Development với hot-reload (`tsx watch`) |
| `npm run build` | Biên dịch TypeScript trong `src/` sang JavaScript trong `dist/` |
| `npm start` | Chạy file đã biên dịch `dist/index.js` |
| `npm run deploy-commands` | Đăng ký Slash Commands (`/setup`, `/admin-portal`) lên Discord |
| `npm run prisma:migrate` | Chạy migration cơ sở dữ liệu SQLite |
| `npm run prisma:generate` | Sinh Prisma Client dựa trên `schema.prisma` |
| `npm run prisma:studio` | Mở giao diện web Prisma Studio để quản lý/xem dữ liệu DB trực tiếp |

---

## 🔄 Luồng hoạt động chính (Features & Workflow)

1. **Luồng Đăng ký của Member**:
   - Bấm nút **Đăng ký / Đổi lịch** -> Chọn **Ngày** -> Chọn **Phòng** -> Chọn **Khung giờ** -> Nhập **Nội dung Live** (Modal).
   - Hệ thống tự động re-validate tránh trùng slot (Race condition).
   - Đăng ký thành công -> Bot gửi log xác nhận vào **Private Thread** riêng của User và tự động cập nhật **Bảng Timeline công khai**.

2. **Quản lý Quyền Tự động (Cron Job)**:
   - **Bắt đầu slot**: Bot tự động cấp quyền `Move Members` và `Mute Members` cho Host trên kênh Voice tương ứng.
   - **Kết thúc slot**: Bot ngắt kết nối (kick) Host khỏi phòng Voice nếu còn ở trong phòng, thu hồi quyền và đánh giá độ hợp lệ của buổi live (Thời gian live tối thiểu & Peak viewers).

3. **Bảng điều khiển Admin Portal**:
   - Quản lý danh sách phòng live & ID Voice Channel.
   - Thêm/bớt khung giờ live trong ngày.
   - Điều chỉnh tham số rule (Hạn mức slot/ngày, hạn mức slot active, thời gian mở cửa sổ đăng ký,...).
   - Xem danh sách Booking & Hủy slot của bất kỳ ai.
   - Gửi thông báo chung (Broadcast) tới `NOTI_CHANNEL_ID`.
