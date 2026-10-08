import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Merge consumer overrides without treating Pharo type sizes as text colors.
 * The registered scales match the public theme; unrelated Tailwind groups keep
 * their standard behavior. This helper has no theme or React provider dependency.
 */
export const mergeClasses = extendTailwindMerge({
  extend: {
    theme: {
      text: ['pharo-xs', 'pharo-sm', 'pharo-base', 'pharo-lg', 'pharo-title', 'pharo-display'],
      font: ['pharo-body', 'pharo-mono'],
      spacing: [
        'pharo-1',
        'pharo-2',
        'pharo-3',
        'pharo-4',
        'pharo-6',
        'pharo-8',
        'pharo-12',
        'pharo-control',
        'pharo-header',
        'pharo-plot-mobile',
        'pharo-plot-desktop',
        'pharo-dialog-inset',
        'pharo-workspace',
        'pharo-matrix',
        'pharo-dialog',
        'pharo-chart-height',
      ],
      radius: ['pharo-control', 'pharo-card', 'pharo-pill'],
    },
    classGroups: {
      shadow: ['pharo-shadow-card', 'pharo-shadow-overlay'],
    },
  },
});
