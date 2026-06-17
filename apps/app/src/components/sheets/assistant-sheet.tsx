'use client';

import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  Sheet,
  SheetContent,
} from '@trycompai/design-system';
import { useMediaQuery } from '@trycompai/ui/hooks';

import '@/styles/editor.css';
import { useQueryState } from 'nuqs';
import { Chat } from '../ai/chat';

export function AssistantSheet() {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const [isOpen, setIsOpen] = useQueryState('assistant', {
    history: 'push',
    parse: (value) => value === 'true',
    serialize: (value) => value.toString(),
  });

  if (isDesktop) {
    return (
      <Sheet open={isOpen ?? false} onOpenChange={(open) => void setIsOpen(open)}>
        <SheetContent>
          <Chat />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Drawer open={isOpen ?? false} onOpenChange={(open) => void setIsOpen(open)}>
      <DrawerTitle hidden>Assistant</DrawerTitle>
      <DrawerContent>
        <div className="p-6">
          <Chat />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
