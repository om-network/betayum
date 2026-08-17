'use client';

import { Badge, Button } from '@trycompai/design-system';
import { ArrowRight, Reset } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

export type AutomationOverviewItem = {
  action: string;
  automationId?: string;
  resettable?: boolean;
  taskId: string;
  title: string;
};

export function AutomationOverviewColumn({
  emptyMessage,
  icon,
  items,
  isResetting = false,
  onReset,
  orgId,
  title,
}: {
  emptyMessage: string;
  icon: ReactNode;
  items: AutomationOverviewItem[];
  isResetting?: boolean;
  onReset?: (item: AutomationOverviewItem) => void;
  orgId: string;
  title: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, 10);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
        </div>
        <Badge variant="secondary">{items.length}</Badge>
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 && (
          <p className="px-4 py-5 text-sm text-muted-foreground">{emptyMessage}</p>
        )}
        {visibleItems.map((item) => {
          const href = item.automationId
            ? `/${orgId}/tasks/${item.taskId}/automation/${item.automationId}`
            : `/${orgId}/tasks/${item.taskId}/automation/new`;

          return (
            <div key={item.taskId} className="flex items-center gap-1 pr-2">
              <Link
                href={href}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.action}</p>
                </div>
                <ArrowRight className="shrink-0" size={16} />
              </Link>
              {item.resettable && item.automationId && onReset ? (
                <Button
                  aria-label={`Reset ${item.title}`}
                  disabled={isResetting}
                  onClick={() => onReset(item)}
                  size="icon"
                  title={`Reset ${item.title}`}
                  variant="ghost"
                >
                  <Reset size={16} />
                </Button>
              ) : null}
            </div>
          );
        })}
        {items.length > 10 && (
          <div className="flex justify-center px-4 py-2">
            <Button variant="ghost" size="sm" onClick={() => setExpanded((current) => !current)}>
              {expanded ? 'Show less' : `See more (${hiddenCount})`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
