import Image from 'next/image';

type BrandLogoProps = {
  variant?: 'color' | 'black' | 'white';
  width?: number;
  height?: number;
  className?: string;
};

export function BrandLogo({
  variant = 'color',
  width = 40,
  height = 40,
  className,
}: BrandLogoProps) {
  return (
    <Image
      src={`/brand/betayum-icon-${variant}.png`}
      alt="Betayum"
      width={width}
      height={height}
      className={className}
    />
  );
}
