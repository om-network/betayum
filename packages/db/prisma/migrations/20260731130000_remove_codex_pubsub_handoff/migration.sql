DROP INDEX IF EXISTS "CodexAutomationRun_pubsubMessageId_key";

ALTER TABLE "CodexAutomationRun"
  DROP COLUMN IF EXISTS "pubsubMessageId",
  DROP COLUMN IF EXISTS "pubsubTopic";
