-- Existing bookings predate this required booking-flow input, so the column remains nullable for backward compatibility.
ALTER TABLE "Booking" ADD COLUMN "ingameRoleId" BIGINT;
