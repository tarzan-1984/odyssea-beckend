-- CreateTable: push_tokens
CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "platform" TEXT,
  "deviceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_key" ON "push_tokens"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_userId_token_key" ON "push_tokens"("userId","token");

-- Foreign key to users
ALTER TABLE "push_tokens"
ADD CONSTRAINT "push_tokens_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


