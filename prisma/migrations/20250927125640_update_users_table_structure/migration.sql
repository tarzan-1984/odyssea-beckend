-- Update users table to match current Prisma schema
-- This migration ensures the users table has all required columns with correct types and defaults

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    -- Add externalId column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'externalId') THEN
        ALTER TABLE "public"."users" ADD COLUMN "externalId" TEXT;
    END IF;
    
    -- Add deactivateAccount column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'deactivateAccount') THEN
        ALTER TABLE "public"."users" ADD COLUMN "deactivateAccount" BOOLEAN DEFAULT false;
    END IF;
    
    -- Add location column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'location') THEN
        ALTER TABLE "public"."users" ADD COLUMN "location" TEXT;
    END IF;
    
    -- Add city column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'city') THEN
        ALTER TABLE "public"."users" ADD COLUMN "city" TEXT;
    END IF;
    
    -- Add state column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'state') THEN
        ALTER TABLE "public"."users" ADD COLUMN "state" TEXT;
    END IF;
    
    -- Add zip column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'zip') THEN
        ALTER TABLE "public"."users" ADD COLUMN "zip" TEXT;
    END IF;
    
    -- Add lastLoginAt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'lastLoginAt') THEN
        ALTER TABLE "public"."users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
    END IF;
    
    -- Add profilePhoto column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'profilePhoto') THEN
        ALTER TABLE "public"."users" ADD COLUMN "profilePhoto" TEXT;
    END IF;
    
    -- Add phone column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
        ALTER TABLE "public"."users" ADD COLUMN "phone" TEXT;
    END IF;
END $$;

-- Update status column default to INACTIVE
ALTER TABLE "public"."users" ALTER COLUMN "status" SET DEFAULT 'INACTIVE';
