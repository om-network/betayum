interface MemberWithRole {
  id: string;
  role: string | null;
}

interface FilterMembersByOwnerOrAdminParams<TMember extends MemberWithRole> {
  members: TMember[];
  /**
   * Optional current assignee ID to always include (even if not owner/admin),
   * so existing assignments/active filters remain visible.
   */
  currentAssigneeId?: string | null;
}

export function hasBuiltInOwnerOrAdminRole(role: string | null | undefined): boolean {
  return (role ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .some((item) => item === 'owner' || item === 'admin');
}

/**
 * Filters members to only include those with owner or admin roles.
 * Roles are stored as comma-separated strings (e.g., "owner,admin" or "employee").
 */
export function filterMembersByOwnerOrAdmin<TMember extends MemberWithRole>({
  members,
  currentAssigneeId,
}: FilterMembersByOwnerOrAdminParams<TMember>): TMember[] {
  return members.filter((member) => {
    // Always include current assignee to preserve existing assignments
    if (currentAssigneeId && member.id === currentAssigneeId) {
      return true;
    }

    return hasBuiltInOwnerOrAdminRole(member.role);
  });
}
