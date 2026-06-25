import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type { AutomationSecretRef } from './automation-types';

@Injectable()
export class AutomationSecretsService {
  async verifySecretRefs({
    organizationId,
    secretRefs,
  }: {
    organizationId: string;
    secretRefs: AutomationSecretRef[];
  }) {
    if (secretRefs.length === 0) {
      return;
    }

    const secrets = await db.secret.findMany({
      where: {
        organizationId,
        OR: secretRefs.map((secretRef) => ({
          name: secretRef.name,
          ...(secretRef.category ? { category: secretRef.category } : {}),
        })),
      },
      select: {
        name: true,
        category: true,
      },
    });

    const missing = secretRefs.find((secretRef) => {
      if (!secretRef.category) {
        return !secrets.some((secret) => secret.name === secretRef.name);
      }

      return !secrets.some(
        (secret) =>
          secret.name === secretRef.name &&
          secret.category === secretRef.category,
      );
    });

    if (!missing) {
      return;
    }

    throw new NotFoundException('Automation secret not found');
  }
}
