'use client';

import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@trycompai/design-system';
import Link from 'next/link';

export function InviteStatusCard({
  title,
  description,
  primaryHref,
  primaryLabel,
  children,
}: {
  title: string;
  description: string;
  primaryHref?: string;
  primaryLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card relative w-full max-w-[480px] rounded-sm border p-10 shadow-lg">
      <div className="flex flex-col items-center gap-6 text-center">
        <BrandLogo />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mx-auto max-w-[48ch] text-base leading-relaxed text-muted-foreground">
          {description}
        </p>
        {children}
        {primaryHref && primaryLabel && (
          <Link href={primaryHref} className="w-full">
            <div className="w-full">
              <Button size="sm" width="full">
                {primaryLabel}
              </Button>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
