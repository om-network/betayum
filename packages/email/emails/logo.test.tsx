import { render } from '@react-email/render';
import { brandConfig } from '@trycompai/utils/brand';
import { Logo } from '../components/logo';

describe('Logo', () => {
  afterEach(() => {
    Object.defineProperty(brandConfig.assets, 'logoUrl', {
      value: undefined,
      writable: true,
    });
  });

  it('omits the image when no logo URL is configured', async () => {
    Object.defineProperty(brandConfig.assets, 'logoUrl', {
      value: undefined,
      writable: true,
    });

    expect(await render(<Logo />)).not.toContain('<img');
  });

  it('uses the exact configured logo URL', async () => {
    brandConfig.assets.logoUrl = 'https://assets.example.com/betayum.png';

    expect(await render(<Logo />)).toContain('https://assets.example.com/betayum.png');
  });
});
