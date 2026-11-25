-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "streamSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "qualifiedViewers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "suspicious" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "suspiciousReason" TEXT;

-- CreateTable
CREATE TABLE "BookingViewer" (
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dwellSeconds" INTEGER NOT NULL DEFAULT 0,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingViewer_pkey" PRIMARY KEY ("bookingId","userId")
);

-- CreateIndex
CREATE INDEX "BookingViewer_userId_idx" ON "BookingViewer"("userId");

-- AddForeignKey
ALTER TABLE "BookingViewer" ADD CONSTRAINT "BookingViewer_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
