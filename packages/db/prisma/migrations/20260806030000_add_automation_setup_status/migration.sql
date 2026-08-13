CREATE TYPE "AutomationSetupStatus" AS ENUM (
  'building',
  'ready',
  'action_needed',
  'failed'
);

ALTER TABLE "EvidenceAutomation"
ADD COLUMN "setupStatus" "AutomationSetupStatus";
