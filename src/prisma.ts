import { PrismaClient } from '@prisma/client';

// Singleton - tránh mở nhiều connection khi hot-reload trong dev
export const prisma = new PrismaClient();
