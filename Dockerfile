# Sử dụng Node.js LTS slim image
FROM node:20-slim

# Cài đặt openssl cho Prisma và ca-certificates cho các request HTTPS
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Thiết lập thư mục làm việc
WORKDIR /app

# Sao chép file package.json và package-lock.json
COPY package*.json ./

# Cài đặt toàn bộ dependencies (bao gồm devDependencies để biên dịch TS và chạy Prisma)
RUN npm ci

# Sao chép cấu hình Prisma và sinh client
COPY prisma ./prisma/
RUN npx prisma generate

# Sao chép mã nguồn và cấu hình tsconfig
COPY tsconfig.json ./
COPY src ./src/

# Biên dịch mã nguồn TypeScript
RUN npm run build

# Tạo thư mục lưu trữ Database SQLite (để mount volume ngoài host)
RUN mkdir -p /app/data

# Thiết lập biến môi trường mặc định cho Database
ENV DATABASE_URL="file:/app/data/dev.db"

# Khởi chạy migration và chạy bot
CMD ["sh", "-c", "npx prisma migrate deploy && npm run deploy-commands && npm start"]
