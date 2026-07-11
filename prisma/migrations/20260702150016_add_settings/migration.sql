-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "data" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
