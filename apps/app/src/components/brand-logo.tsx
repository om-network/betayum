import Image from 'next/image';

type BrandLogoProps = {
  kind?: 'icon' | 'wordmark';
  variant?: 'color' | 'black' | 'white';
  width?: number;
  height?: number;
  className?: string;
};

export function BrandLogo({
  kind = 'icon',
  variant = 'color',
  width = kind === 'icon' ? 40 : 100,
  height = kind === 'icon' ? 40 : 40,
  className,
}: BrandLogoProps) {
  return (
    <Image
      src={`/brand/betayum-${kind}-${variant}.png`}
      alt="Betayum"
      width={width}
      height={height}
      className={className}
    />
  );
}
