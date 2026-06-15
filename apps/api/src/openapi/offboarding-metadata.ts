import type { PublicOperationMetadata } from './types';

export const OFFBOARDING_OPERATION_METADATA: Record<
  string,
  PublicOperationMetadata
> = {
  OffboardingChecklistController_getPendingOffboardings_v1: {
    summary: 'List pending offboardings',
    description:
      'List organization members who still have incomplete offboarding checklist items so teams can finish access removal and evidence collection.',
  },
  OffboardingChecklistController_getTemplate_v1: {
    summary: 'Get offboarding template',
    description:
      'Retrieve the organization offboarding checklist template used to standardize access removal, equipment return, and evidence collection.',
  },
  OffboardingChecklistController_createTemplateItem_v1: {
    summary: 'Create offboarding item',
    description:
      'Create an offboarding checklist template item so administrators can track required steps for departing workforce members.',
  },
  OffboardingChecklistController_updateTemplateItem_v1: {
    summary: 'Update offboarding item',
    description:
      'Update an offboarding checklist template item to refine required access removal, evidence, or workforce compliance steps.',
  },
  OffboardingChecklistController_deleteTemplateItem_v1: {
    summary: 'Delete offboarding item',
    description:
      'Delete an offboarding checklist template item that no longer applies to the organization workforce compliance process.',
  },
  OffboardingChecklistController_getMemberChecklist_v1: {
    summary: 'Get member offboarding checklist',
    description:
      'Retrieve one member offboarding checklist with completion status, evidence records, and remaining access revocation work.',
  },
  OffboardingChecklistController_exportAllEvidence_v1: {
    summary: 'Export all offboarding evidence',
    description:
      'Download a zip archive of offboarding evidence across the organization for audits, access reviews, and workforce compliance records.',
  },
  OffboardingChecklistController_exportEvidence_v1: {
    summary: 'Export member offboarding evidence',
    description:
      'Download a zip archive of offboarding evidence for one workforce member, including checklist completion and access revocation records.',
  },
  OffboardingChecklistController_completeItem_v1: {
    summary: 'Complete offboarding item',
    description:
      'Mark one member offboarding checklist item as complete and attach evidence that supports the access or compliance step.',
  },
  OffboardingChecklistController_uncompleteItem_v1: {
    summary: 'Undo offboarding completion',
    description:
      'Remove a checklist completion marker when an offboarding step was completed by mistake or requires updated evidence.',
  },
  OffboardingChecklistController_uploadEvidence_v1: {
    summary: 'Upload offboarding evidence',
    description:
      'Attach evidence to an offboarding checklist item so workforce access removal and compliance activity can be audited.',
  },
  OffboardingChecklistController_getAccessRevocations_v1: {
    summary: 'List access revocations',
    description:
      'List vendor access revocation status for an offboarded member so administrators can confirm all connected systems were removed.',
  },
  OffboardingChecklistController_revokeAllVendorAccess_v1: {
    summary: 'Confirm all access revoked',
    description:
      'Mark every tracked vendor access item as revoked for one member after administrators complete offboarding access removal.',
  },
  OffboardingChecklistController_revokeVendorAccess_v1: {
    summary: 'Confirm vendor access revoked',
    description:
      'Mark one vendor access item as revoked for a member and optionally attach evidence that documents the completed offboarding step.',
  },
  OffboardingChecklistController_undoVendorRevocation_v1: {
    summary: 'Undo access revocation',
    description:
      'Undo a vendor access revocation marker when an offboarding record was confirmed by mistake or needs updated evidence.',
  },
};
