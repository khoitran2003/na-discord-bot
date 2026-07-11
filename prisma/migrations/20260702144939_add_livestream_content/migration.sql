-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "roleGranted" BOOLEAN NOT NULL DEFAULT false,
    "livestream_content" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Booking" ("createdAt", "endTime", "id", "roleGranted", "roomId", "startTime", "status", "updatedAt", "userId", "username") SELECT "createdAt", "endTime", "id", "roleGranted", "roomId", "startTime", "status", "updatedAt", "userId", "username" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");
CREATE INDEX "Booking_roomId_startTime_idx" ON "Booking"("roomId", "startTime");
CREATE INDEX "Booking_status_idx" ON "Booking"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
