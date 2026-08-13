import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './brand-logo';

describe('BrandLogo', () => {
  it('renders the requested icon variant and dimensions', () => {
    render(<BrandLogo variant="black" width={32} height={32} />);

    const logo = screen.getByAltText('Betayum');
    expect(logo.getAttribute('src')).toContain('betayum-icon-black.png');
    expect(logo.getAttribute('width')).toBe('32');
    expect(logo.getAttribute('height')).toBe('32');
  });
});
// @vitest-environment jsdom
