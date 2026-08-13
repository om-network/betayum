import Link from 'next/link';
import { BrandLogo } from './brand-logo';

export function SidebarLogo({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <div className="flex items-center transition-all duration-300">
      <Link href="/" suppressHydrationWarning>
        <BrandLogo width={40} height={40} className="transition-transform duration-300" />
      </Link>
    </div>
  );
}
