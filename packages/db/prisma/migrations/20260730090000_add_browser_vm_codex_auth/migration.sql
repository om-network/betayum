ALTER TABLE "OrganizationBrowserVm"
  ADD COLUMN "agentTokenEncrypted" JSONB,
  ADD COLUMN "agentConfiguredAt" TIMESTAMP(3),
  ADD COLUMN "codexConfirmedAt" TIMESTAMP(3);
