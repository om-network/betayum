import { z } from 'zod';

const personSchema = z
  .object({ id: z.string(), user: z.object({ name: z.string().nullable() }) })
  .nullable();
const requirementSchema = z.object({
  requirement: z
    .object({ identifier: z.string(), name: z.string(), description: z.string() })
    .nullable(),
  customRequirement: z
    .object({ identifier: z.string(), name: z.string(), description: z.string() })
    .nullable(),
  frameworkInstance: z.object({
    framework: z.object({ name: z.string() }).nullable(),
    customFramework: z.object({ name: z.string() }).nullable(),
  }),
});

export const automationTaskContextSchema = z.object({
  task: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.string(),
    department: z.string().nullable(),
    frequency: z.string().nullable(),
    reviewDate: z.string().nullable(),
    lastCompletedAt: z.string().nullable(),
    assignee: personSchema,
    approver: personSchema,
    organization: z.object({ name: z.string(), website: z.string().nullable() }),
    controls: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        policies: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })),
        requirementsMapped: z.array(requirementSchema),
      }),
    ),
    vendors: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })),
    risks: z.array(z.object({ id: z.string(), title: z.string(), status: z.string() })),
    findings: z.array(
      z.object({
        id: z.string(),
        status: z.string(),
        severity: z.string(),
        content: z.string(),
        revisionNote: z.string().nullable(),
        updatedAt: z.string(),
      }),
    ),
    evidenceAutomations: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        setupStatus: z.string().nullable(),
        runs: z.array(
          z.object({
            id: z.string(),
            status: z.string(),
            success: z.boolean().nullable(),
            createdAt: z.string(),
          }),
        ),
        codexRuns: z.array(
          z.object({
            id: z.string(),
            status: z.string(),
            summary: z.string().nullable(),
            errorMessage: z.string().nullable(),
            createdAt: z.string(),
            screenshots: z.array(z.object({ attachmentId: z.string().nullable() })),
          }),
        ),
      }),
    ),
  }),
  attachments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number().optional(),
      createdAt: z.string(),
      sourceRunId: z.string().nullable(),
    }),
  ),
  browserVm: z
    .object({
      state: z.string(),
      projectId: z.string(),
      codexConfirmedAt: z.string().nullable(),
      lastActivityAt: z.string().nullable(),
    })
    .nullable(),
});

export type AutomationTaskContext = z.infer<typeof automationTaskContextSchema>;

export function formatTaskContext(context: AutomationTaskContext): string {
  const payload = {
    task: context.task,
    attachments: context.attachments,
    browserVm: context.browserVm,
  };
  return JSON.stringify(payload, null, 2);
}
