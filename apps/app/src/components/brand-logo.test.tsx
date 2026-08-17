import { render, screen } from '@testing-library/react';
import { BrandLogo } from './brand-logo';

describe('BrandLogo', () => {
  it('renders the requested wordmark variant and dimensions', () => {
    render(<BrandLogo kind="wordmark" variant="white" width={120} height={48} />);

    const logo = screen.getByAltText('Betayum');
    expect(logo.getAttribute('src')).toContain('betayum-wordmark-white.png');
    expect(logo.getAttribute('width')).toBe('120');
    expect(logo.getAttribute('height')).toBe('48');
  });
});
