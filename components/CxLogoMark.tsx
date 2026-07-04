'use client';

// CX: CxClub Studio logo mark — replaces the ycode "Y" SVG mark wherever the
// builder shows its own brand (header button, welcome/setup screen).
// The source asset (public/cxclub-icon.png) is a white icon on a transparent
// background, so spots that don't already sit on a dark surface use `chip`
// to wrap it in a fixed-dark tile for contrast in both light and dark theme.

import Image from 'next/image';
import { cn } from '@/lib/utils';

interface CxLogoMarkProps {
  size?: number;
  className?: string;
  chip?: boolean;
}

export default function CxLogoMark({ size = 20, className, chip = false }: CxLogoMarkProps) {
  const icon = (
    <Image
      src="/cxclub-icon.png"
      alt="CxClub Studio"
      width={size}
      height={size}
      className={cn('shrink-0', !chip && className)}
      priority
    />
  );

  if (!chip) return icon;

  return (
    <div className={cn('flex items-center justify-center rounded-md bg-neutral-900', className)}>
      {icon}
    </div>
  );
}
