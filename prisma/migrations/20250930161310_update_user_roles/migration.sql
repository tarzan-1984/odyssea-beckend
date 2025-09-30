/*
  Warnings:

  - The values [DISPATCHER_EXPEDITE,DISPATCHER_TEAM_LEADER,DISPATCHER_FTL,RECRUITER_TEAM_LEADER,TRACKING_TEAM_LEADER,FLEET_MANAGER] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."UserRole_new" AS ENUM ('DRIVER_UPDATES', 'MODERATOR', 'RECRUITER', 'ADMINISTRATOR', 'NIGHTSHIFT_TRACKING', 'DISPATCHER', 'BILLING', 'SUBSCRIBER', 'ACCOUNTING', 'RECRUITER_TL', 'TRACKING', 'DISPATCHER_TL', 'TRACKING_TL', 'MORNING_TRACKING', 'EXPEDITE_MANAGER', 'DRIVER');
ALTER TABLE "public"."users" ALTER COLUMN "role" TYPE "public"."UserRole_new" USING ("role"::text::"public"."UserRole_new");
ALTER TYPE "public"."UserRole" RENAME TO "UserRole_old";
ALTER TYPE "public"."UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
COMMIT;
