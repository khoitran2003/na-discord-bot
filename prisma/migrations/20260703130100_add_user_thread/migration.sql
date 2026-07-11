-- CreateTable
CREATE TABLE "UserThread" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
