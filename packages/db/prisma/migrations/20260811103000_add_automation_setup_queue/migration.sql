CREATE TYPE "AutomationSetupQueueStatus" AS ENUM ('active', 'completed');
CREATE TYPE "AutomationSetupItemStatus" AS ENUM (
  'queued',
  'building',
  'ready',
  'action_needed',
  'failed'
);

ALTER TABLE "EvidenceAutomation"
ADD COLUMN "setupStatusUpdatedAt" TIMESTAMP(3);

UPDATE "EvidenceAutomation"
SET
  "setupStatus" = 'failed',
  "setupTask" = COALESCE(
    "setupTask",
    'Automation setup was interrupted before the durable queue was enabled.'
  ),
  "setupStatusUpdatedAt" = NOW()
WHERE "setupStatus" = 'building';

CREATE TABLE "AutomationSetupQueue" (
  "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('asq'::text),
  "organizationId" TEXT NOT NULL,
  "status" "AutomationSetupQueueStatus" NOT NULL DEFAULT 'active',
  "currentPosition" INTEGER NOT NULL DEFAULT 0,
  "currentItemId" TEXT,
  "triggerRunId" TEXT,
  "requestedByUserId" TEXT NOT NULL,
  "heartbeatAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AutomationSetupQueue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationSetupQueueItem" (
  "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('asi'::text),
  "queueId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "automationId" TEXT,
  "position" INTEGER NOT NULL,
  "status" "AutomationSetupItemStatus" NOT NULL DEFAULT 'queued',
  "remarks" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationSetupQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationSetupQueue_organizationId_key"
ON "AutomationSetupQueue"("organizationId");
CREATE UNIQUE INDEX "AutomationSetupQueueItem_queueId_position_key"
ON "AutomationSetupQueueItem"("queueId", "position");
CREATE UNIQUE INDEX "AutomationSetupQueueItem_queueId_taskId_key"
ON "AutomationSetupQueueItem"("queueId", "taskId");
CREATE INDEX "AutomationSetupQueueItem_taskId_idx"
ON "AutomationSetupQueueItem"("taskId");
CREATE INDEX "AutomationSetupQueueItem_automationId_idx"
ON "AutomationSetupQueueItem"("automationId");

ALTER TABLE "AutomationSetupQueue"
ADD CONSTRAINT "AutomationSetupQueue_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationSetupQueueItem"
ADD CONSTRAINT "AutomationSetupQueueItem_queueId_fkey"
FOREIGN KEY ("queueId") REFERENCES "AutomationSetupQueue"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationSetupQueueItem"
ADD CONSTRAINT "AutomationSetupQueueItem_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationSetupQueueItem"
ADD CONSTRAINT "AutomationSetupQueueItem_automationId_fkey"
FOREIGN KEY ("automationId") REFERENCES "EvidenceAutomation"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
