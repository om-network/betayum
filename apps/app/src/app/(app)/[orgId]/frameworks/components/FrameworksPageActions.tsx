'use client';

import { AddFrameworkModal } from '@/app/(app)/[orgId]/overview/components/AddFrameworkModal';
import { usePermissions } from '@/hooks/use-permissions';
import type { FrameworkEditorFramework } from '@db';
import { Button } from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import { Dialog } from '@trycompai/ui/dialog';
import { useState } from 'react';
import { CreateCustomFrameworkSheet } from './CreateCustomFrameworkSheet';

interface FrameworksPageActionsProps {
  availableFrameworks: Pick<
    FrameworkEditorFramework,
    'id' | 'name' | 'description' | 'version' | 'visible'
  >[];
}

export function FrameworksPageActions({ availableFrameworks }: FrameworksPageActionsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { hasPermission } = usePermissions();

  if (!hasPermission('framework', 'create')) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <CreateCustomFrameworkSheet />
      <Button size="sm" iconLeft={<Add size={16} />} onClick={() => setIsModalOpen(true)}>
        Add Framework
      </Button>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        {isModalOpen && (
          <AddFrameworkModal
            onOpenChange={setIsModalOpen}
            availableFrameworks={availableFrameworks}
          />
        )}
      </Dialog>
    </div>
  );
}
