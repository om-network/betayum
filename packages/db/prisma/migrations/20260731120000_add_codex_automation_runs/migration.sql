CREATE TYPE "CodexAutomationRunStatus" AS ENUM (
  'pending',
  'dispatched',
  'completed',
  'promoting',
  'promoted',
  'failed',
  'timed_out'
);

CREATE TABLE "CodexAutomationRun" (
  "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('car'::text),
  "organizationId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "browserVmId" TEXT NOT NULL,
  "triggerRunId" TEXT,
  "triggerWaitpointId" TEXT,
  "status" "CodexAutomationRunStatus" NOT NULL DEFAULT 'pending',
  "prompt" TEXT NOT NULL,
  "evidenceDescription" TEXT NOT NULL,
  "capabilityTokenHash" TEXT NOT NULL,
  "capabilityExpiresAt" TIMESTAMP(3) NOT NULL,
  "pubsubMessageId" TEXT,
  "pubsubTopic" TEXT,
  "summary" TEXT,
  "errorMessage" TEXT,
  "completedAt" TIMESTAMP(3),
  "promotedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CodexAutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CodexAutomationScreenshot" (
  "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('cas'::text),
  "runId" TEXT NOT NULL,
  "stagedObjectKey" TEXT NOT NULL,
  "finalObjectKey" TEXT,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "attachmentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CodexAutomationScreenshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CodexAutomationRun_triggerWaitpointId_key" ON "CodexAutomationRun"("triggerWaitpointId");
CREATE UNIQUE INDEX "CodexAutomationRun_capabilityTokenHash_key" ON "CodexAutomationRun"("capabilityTokenHash");
CREATE UNIQUE INDEX "CodexAutomationRun_pubsubMessageId_key" ON "CodexAutomationRun"("pubsubMessageId");
CREATE INDEX "CodexAutomationRun_organizationId_status_idx" ON "CodexAutomationRun"("organizationId", "status");
CREATE INDEX "CodexAutomationRun_taskId_createdAt_idx" ON "CodexAutomationRun"("taskId", "createdAt");
CREATE UNIQUE INDEX "CodexAutomationScreenshot_attachmentId_key" ON "CodexAutomationScreenshot"("attachmentId");
CREATE UNIQUE INDEX "CodexAutomationScreenshot_runId_stagedObjectKey_key" ON "CodexAutomationScreenshot"("runId", "stagedObjectKey");
CREATE INDEX "CodexAutomationScreenshot_runId_idx" ON "CodexAutomationScreenshot"("runId");

ALTER TABLE "CodexAutomationRun" ADD CONSTRAINT "CodexAutomationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodexAutomationRun" ADD CONSTRAINT "CodexAutomationRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodexAutomationRun" ADD CONSTRAINT "CodexAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "EvidenceAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodexAutomationRun" ADD CONSTRAINT "CodexAutomationRun_browserVmId_fkey" FOREIGN KEY ("browserVmId") REFERENCES "OrganizationBrowserVm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CodexAutomationScreenshot" ADD CONSTRAINT "CodexAutomationScreenshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CodexAutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodexAutomationScreenshot" ADD CONSTRAINT "CodexAutomationScreenshot_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
