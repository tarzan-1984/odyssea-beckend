-- Add readBy JSON column to messages table
ALTER TABLE "messages" ADD COLUMN "readBy" JSONB;

-- Migrate existing isRead data to readBy format
-- For messages where isRead = true, add the receiver to readBy array
UPDATE "messages" 
SET "readBy" = CASE 
    WHEN "isRead" = true AND "receiverId" IS NOT NULL THEN 
        jsonb_build_array(jsonb_build_object('userId', "receiverId", 'readAt', "createdAt"))
    WHEN "isRead" = true AND "receiverId" IS NULL THEN 
        -- For group chats, we can't determine who read it, so leave empty
        jsonb_build_array()
    ELSE 
        jsonb_build_array()
END
WHERE "isRead" = true;

-- Drop the old isRead column
ALTER TABLE "messages" DROP COLUMN "isRead";
