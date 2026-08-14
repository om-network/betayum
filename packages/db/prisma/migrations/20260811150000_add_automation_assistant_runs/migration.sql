CREATE TYPE "AutomationAssistantRunStatus" AS ENUM ('queued', 'running', 'waiting_for_input', 'completed', 'failed');
CREATE TYPE "AutomationAssistantCommandStatus" AS ENUM ('pending', 'consumed');

CREATE TABLE "AutomationAssistantRun" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('aar'::text),
    "automationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "status" "AutomationAssistantRunStatus" NOT NULL DEFAULT 'queued',
    "triggerRunId" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationAssistantRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationAssistantCommand" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('aac'::text),
    "runId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "status" "AutomationAssistantCommandStatus" NOT NULL DEFAULT 'pending',
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationAssistantCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationAssistantRun_automationId_key" ON "AutomationAssistantRun"("automationId");
CREATE INDEX "AutomationAssistantRun_status_heartbeatAt_idx" ON "AutomationAssistantRun"("status", "heartbeatAt");
CREATE UNIQUE INDEX "AutomationAssistantCommand_clientRequestId_key" ON "AutomationAssistantCommand"("clientRequestId");
CREATE INDEX "AutomationAssistantCommand_runId_status_createdAt_idx" ON "AutomationAssistantCommand"("runId", "status", "createdAt");
ALTER TABLE "AutomationAssistantRun" ADD CONSTRAINT "AutomationAssistantRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "EvidenceAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationAssistantCommand" ADD CONSTRAINT "AutomationAssistantCommand_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationAssistantRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
