-- CreateTable
CREATE TABLE "public"."message_templates" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_templates_externalId_idx" ON "public"."message_templates"("externalId");

-- AddForeignKey
ALTER TABLE "public"."message_templates" ADD CONSTRAINT "message_templates_externalId_fkey" FOREIGN KEY ("externalId") REFERENCES "public"."users"("externalId") ON DELETE CASCADE ON UPDATE CASCADE;
