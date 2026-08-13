import { Img, Section } from '@react-email/components';
import { brandConfig } from '@trycompai/utils/brand';

export function Logo() {
  if (!brandConfig.assets.logoUrl) return null;

  return (
    <Section className="mt-[32px]">
      <Img
        src={brandConfig.assets.logoUrl}
        width="45"
        height="45"
        alt={brandConfig.displayName}
        className="mx-auto my-0 block"
      />
    </Section>
  );
}
