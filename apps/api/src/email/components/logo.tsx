import { Img, Section } from '@react-email/components';

export function Logo() {
  return (
    <Section className="mt-[32px]">
      <Img
        src={'https://cdn.betayum.com/logo.png'}
        width="45"
        height="45"
        alt="Betayum"
        className="mx-auto my-0 block"
      />
    </Section>
  );
}
