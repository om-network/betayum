ALTER TABLE "Member" ADD COLUMN "clerkUserId" TEXT;
ALTER TABLE "Member" ADD COLUMN "clerkOrganizationId" TEXT;
ALTER TABLE "Member" ADD COLUMN "clerkMembershipId" TEXT;

CREATE UNIQUE INDEX "Member_clerkMembershipId_key" ON "Member"("clerkMembershipId");
CREATE UNIQUE INDEX "Member_clerkOrganizationId_clerkUserId_key" ON "Member"("clerkOrganizationId", "clerkUserId");
