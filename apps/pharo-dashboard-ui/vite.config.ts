import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { z } from 'zod';
import { routerConfig } from '../../scripts/router-config.mjs';

const apiPort = z.coerce
  .number()
  .int()
  .min(1024)
  .max(65535)
  .parse(process.env.PHARO_API_PORT ?? 5080);

const proxy = { '/api': `http://127.0.0.1:${apiPort}`, '/health': `http://127.0.0.1:${apiPort}` };

export default defineConfig({
  plugins: [tanstackRouter(routerConfig), react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy,
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
    fs: {
      allow: [fileURLToPath(new URL('../..', import.meta.url))],
      deny: [
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
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  build: { sourcemap: false },
});
