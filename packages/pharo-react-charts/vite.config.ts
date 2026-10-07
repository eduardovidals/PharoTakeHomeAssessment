import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'index',
    },
    sourcemap: false,
    minify: false,
    // Consumers own React, focused D3 modules, and the single theme CSS import.
    rolldownOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom',
        'd3-array',
        'd3-scale',
        'd3-shape',
        'd3-time-format',
        'tailwind-merge',
      ],
    },
  },
});
