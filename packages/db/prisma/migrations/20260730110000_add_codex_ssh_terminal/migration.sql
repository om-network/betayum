CREATE TYPE "CodexTerminalSessionStatus" AS ENUM (
  'provisioning',
  'ready',
  'active',
  'completed',
  'cancelled',
  'expired',
  'failed'
);

ALTER TABLE "OrganizationBrowserVm"
  ADD COLUMN "codexSshPrivateKeyEncrypted" JSONB,
  ADD COLUMN "codexSshPublicKey" TEXT,
  ADD COLUMN "codexSshConfiguredAt" TIMESTAMP(3),
  ADD COLUMN "codexSshHostFingerprint" TEXT;

CREATE TABLE "CodexTerminalSession" (
  "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('cts'::text),
  "browserVmId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "leaseKey" TEXT,
  "status" "CodexTerminalSessionStatus" NOT NULL DEFAULT 'provisioning',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CodexTerminalSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CodexTerminalSession_browserVmId_fkey"
    FOREIGN KEY ("browserVmId") REFERENCES "OrganizationBrowserVm"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CodexTerminalSession_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CodexTerminalSession_leaseKey_key"
  ON "CodexTerminalSession"("leaseKey");
CREATE INDEX "CodexTerminalSession_browserVmId_status_idx"
  ON "CodexTerminalSession"("browserVmId", "status");
CREATE INDEX "CodexTerminalSession_connectionId_idx"
  ON "CodexTerminalSession"("connectionId");
CREATE INDEX "CodexTerminalSession_userId_idx"
  ON "CodexTerminalSession"("userId");
CREATE INDEX "CodexTerminalSession_expiresAt_idx"
  ON "CodexTerminalSession"("expiresAt");
