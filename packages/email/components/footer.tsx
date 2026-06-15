import { Hr, Link, Section, Text } from '@react-email/components';
import { brandConfig } from '@trycompai/utils/brand';

export function Footer() {
  return (
    <Section className="w-full">
      <Hr />

      <Text className="font-regular text-[14px]">
        AI that handles compliance for you -{' '}
        <Link href={`${brandConfig.domains.marketing}?utm_source=email&utm_medium=footer`}>
          {brandConfig.displayName}
        </Link>
        .
      </Text>

      <Text className="text-xs text-[#B8B8B8]">
        {brandConfig.displayName} | 2261 Market Street, San Francisco, CA 94114
      </Text>
    </Section>
  );
}
