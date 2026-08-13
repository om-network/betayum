type BrandLogoProps = {
  size: number;
};

const logoUrl = new URL('../../assets/icon.png', import.meta.url).href;

export function BrandLogo({ size }: BrandLogoProps) {
  return <img src={logoUrl} alt="Betayum" width={size} height={size} />;
}
