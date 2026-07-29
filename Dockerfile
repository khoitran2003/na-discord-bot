# Node.js LTS slim image
FROM node:20-slim

# openssl cho Prisma, ca-certificates cho HTTPS request
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài dependencies (gồm devDependencies để biên dịch TS + chạy Prisma)
COPY package*.json ./
RUN npm ci

# Sinh Prisma client (schema dùng provider postgresql)
COPY prisma ./prisma/
RUN npx prisma generate

# Biên dịch TypeScript
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# DATABASE_URL (Postgres) lấy từ .env / env_file lúc runtime — KHÔNG hardcode ở đây.
# Áp migration lên Postgres rồi đăng ký slash-command và chạy bot.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run deploy-commands && npm start"]
