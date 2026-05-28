'use server';

import { authActionClient } from '@/actions/safe-action';
import { uploadTaskFileSchema } from '@/actions/schema';
import { revalidatePath, revalidateTag } from 'next/cache';

export const revalidateUpload = authActionClient
  .inputSchema(uploadTaskFileSchema)
  .metadata({
    name: 'upload-task-file',
    track: {
      event: 'upload-task-file',
      channel: 'server',
    },
  })
  .action(async ({ parsedInput, ctx }) => {
    const { riskId, taskId } = parsedInput;
    const { organizationId } = ctx;

    if (!organizationId) {
      throw new Error('Unauthorized');
    }

    revalidatePath(`/${organizationId}/risk/${riskId}`);
    revalidatePath(`/${organizationId}/risk/${riskId}/tasks/${taskId}`);
    revalidateTag('risk-cache', 'max');

    return {
      riskId,
      taskId,
    };
  });
