CREATE TYPE "BrowserVmState" AS ENUM (
  'provisioning',
  'starting',
  'running',
  'stopping',
  'stopped',
  'error'
);

CREATE TYPE "BrowserViewerSessionStatus" AS ENUM (
  'provisioning',
  'ready',
  'active',
  'completed',
  'cancelled',
  'expired',
  'failed'
);

CREATE TABLE "OrganizationBrowserVm" (
  "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('bvm'::text),
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "zone" TEXT NOT NULL,
  "instanceName" TEXT NOT NULL,
  "instanceId" TEXT,
  "internalIp" TEXT,
  "state" "BrowserVmState" NOT NULL DEFAULT 'provisioning',
  "operationName" TEXT,
  "errorMessage" TEXT,
  "lastActivityAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationBrowserVm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrowserViewerSession" (
  "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('bvs'::text),
  "browserVmId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "leaseKey" TEXT,
  "status" "BrowserViewerSessionStatus" NOT NULL DEFAULT 'provisioning',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrowserViewerSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationBrowserVm_organizationId_key"
  ON "OrganizationBrowserVm"("organizationId");
CREATE UNIQUE INDEX "OrganizationBrowserVm_instanceName_key"
  ON "OrganizationBrowserVm"("instanceName");
CREATE INDEX "OrganizationBrowserVm_state_idx"
  ON "OrganizationBrowserVm"("state");
CREATE INDEX "OrganizationBrowserVm_lastActivityAt_idx"
  ON "OrganizationBrowserVm"("lastActivityAt");
CREATE INDEX "BrowserViewerSession_browserVmId_status_idx"
  ON "BrowserViewerSession"("browserVmId", "status");
CREATE UNIQUE INDEX "BrowserViewerSession_leaseKey_key"
  ON "BrowserViewerSession"("leaseKey");
CREATE INDEX "BrowserViewerSession_connectionId_idx"
  ON "BrowserViewerSession"("connectionId");
CREATE INDEX "BrowserViewerSession_userId_idx"
  ON "BrowserViewerSession"("userId");
CREATE INDEX "BrowserViewerSession_expiresAt_idx"
  ON "BrowserViewerSession"("expiresAt");

ALTER TABLE "OrganizationBrowserVm"
  ADD CONSTRAINT "OrganizationBrowserVm_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrowserViewerSession"
  ADD CONSTRAINT "BrowserViewerSession_browserVmId_fkey"
  FOREIGN KEY ("browserVmId") REFERENCES "OrganizationBrowserVm"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrowserViewerSession"
  ADD CONSTRAINT "BrowserViewerSession_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
