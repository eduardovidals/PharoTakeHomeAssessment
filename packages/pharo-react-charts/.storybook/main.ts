import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mergeConfig } from 'vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));

const config = {
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
  typescript: { reactDocgen: 'react-docgen-typescript' },
  viteFinal: (configuration) => {
    return mergeConfig(configuration, {
      plugins: [react(), tailwindcss()],
      resolve: { dedupe: ['react', 'react-dom'] },
      server: {
        host: '127.0.0.1',
        strictPort: true,
        fs: {
          strict: true,
          allow: [root],
          // Retain Vite 8 defaults as well as any builder-owned restrictions.
          deny: [
            ...(configuration.server?.fs?.deny ?? []),
            '.env',
            '.env.*',
            '*.{crt,pem,key,p12,pfx,cer,der}',
            '.npmrc',
            '.yarnrc.yml',
            '**/.git/**',
            '**/.dev-private/**',
            '**/.factory-agent/**',
            '**/.private/**',
            '**/.reference/**',
            '**/.private-skills/**',
            '**/AGENTS.override.md',
          ],
        },
        watch: {
          ignored: [
            '**/.dev-private/**',
            '**/.factory-agent/**',
            '**/.private/**',
            '**/.reference/**',
            '**/.private-skills/**',
            '**/AGENTS.override.md',
          ],
        },
      },
      preview: { host: '127.0.0.1', strictPort: true },
      build: { sourcemap: false },
    });
  },
} satisfies StorybookConfig;

export default config;
