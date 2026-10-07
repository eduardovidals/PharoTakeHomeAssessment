import type { Preview } from '@storybook/react-vite';
import type { A11yParameters } from '@storybook/addon-a11y';
import '@pharo/tailwind-plugin';

const preview = {
  tags: ['autodocs'],
  parameters: {
    a11y: { test: 'error' } satisfies A11yParameters,
  },
} satisfies Preview;

export default preview;
