'use client';

import { motion } from 'framer-motion';

export interface LogoSpinnerProps {
  size?: number;
  className?: string;
  raceColor?: string;
  isDisabled?: boolean;
}

export const LogoSpinner = ({ size = 40, className, isDisabled = false }: LogoSpinnerProps) => (
  <div className="flex items-center justify-center">
    <motion.img
      src="/brand/betayum-icon-color.png"
      alt="Betayum"
      width={size}
      height={size}
      className={className}
      {...(isDisabled ? { opacity: 0.5 } : { animate: { scale: [1, 1.1, 1] } })}
      transition={{
        duration: 2,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'easeInOut',
      }}
    />
  </div>
);
