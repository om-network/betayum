ALTER TABLE "EvidenceAutomation"
ADD COLUMN "scriptDraft" TEXT,
ADD COLUMN "allowedTools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
