import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PharoSpinner } from './PharoSpinner';

describe('PharoSpinner', () => {
  it('has a default accessible name without a fabricated numeric percentage', () => {
    render(<PharoSpinner />);

    expect(screen.getByRole('progressbar', { name: 'Loading' })).not.toHaveAttribute(
      'aria-valuenow',
    );
  });

  it.each(['sm', 'md'])('supports %s sizing, an explicit name, and consumer classes', (size) => {
    if (size !== 'sm' && size !== 'md') throw new Error('Invalid fixture.');

    render(<PharoSpinner size={size} label="Updating details" className="consumer-progress" />);

    expect(screen.getByRole('progressbar', { name: 'Updating details' })).toHaveClass(
      'consumer-progress',
    );
  });

  it('preserves supported className render arguments', () => {
    render(
      <PharoSpinner
        className={({ isIndeterminate }) =>
          isIndeterminate ? 'indeterminate-probe' : 'determinate-probe'
        }
      />,
    );

    expect(screen.getByRole('progressbar', { name: 'Loading' })).toHaveClass('indeterminate-probe');
  });
});
