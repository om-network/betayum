ALTER TABLE "Organization" ADD COLUMN "clerkOrganizationId" TEXT;

CREATE UNIQUE INDEX "Organization_clerkOrganizationId_key" ON "Organization"("clerkOrganizationId");
