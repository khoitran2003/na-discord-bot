#!/usr/bin/env bash
#
# Deploy Phase 5 — CODE deploy lên SERVER (ladingpage / 61.28.233.119).
#
# BỐI CẢNH (đã xác minh qua SSH tunnel 2026-07-11):
#   - Postgres prod (schema `livestream`) ĐÃ CÓ đủ bảng Booking/Setting/UserThread + data thật.
#   - Bảng UserPreference ĐÃ ĐƯỢC TẠO + ghi vào _prisma_migrations (migration 20260711070000_add_user_preference).
#   => KHÔNG cần migrate DB, TUYỆT ĐỐI KHÔNG migrate data từ dev.db (prod có data riêng).
#   => Server chỉ cần cập nhật CODE (i18n) + generate client + build + đăng ký lại command + restart.
#
# Chuẩn bị trên server (repo không dùng git; .env đã có sẵn trên server, chmod 600):
#   Sync source, LOẠI .env (giữ secret server) và LOẠI prisma/migrations (giữ 0_init của server):
#     rsync -av --exclude node_modules --exclude dist --exclude .env \
#           --exclude 'prisma/migrations' --exclude 'prisma/*.db' \
#           ./ ladingpage:/var/www/livestream-book-bot/
#
set -euo pipefail
cd "$(dirname "$0")/.."   # về thư mục gốc dự án

echo "[deploy] Nạp .env"
set -a; . ./.env; set +a
: "${DATABASE_URL:?DATABASE_URL chưa set trong .env}"
case "$DATABASE_URL" in
  *"schema=livestream"*) echo "[deploy] DATABASE_URL trỏ Postgres schema=livestream ✓" ;;
  postgresql://*|postgres://*) echo "[deploy] ⚠️  DATABASE_URL là Postgres nhưng THIẾU ?schema=livestream — kiểm tra lại!" ;;
  *) echo "[deploy] ❌ DATABASE_URL không phải Postgres: $DATABASE_URL"; exit 1 ;;
esac

echo "[deploy] 1/4 npm ci"
npm ci

echo "[deploy] 2/4 prisma generate (client biết model UserPreference)"
npx prisma generate
echo "[deploy] (thông tin) migrate status — DB đã provisioned sẵn, KHÔNG chạy migrate deploy:"
npx prisma migrate status || true

echo "[deploy] 3/4 build TypeScript"
npm run build

echo "[deploy] 4/4 đăng ký slash commands"
npm run deploy-commands

echo "[deploy] ✅ Xong. Restart bot theo hạ tầng server:"
echo "    pm2 restart livestream-booking-bot   (nếu dùng pm2)"
echo "    hoặc: docker compose up -d --build"
echo "    hoặc: npm start"
