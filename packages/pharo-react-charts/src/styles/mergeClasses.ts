import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Internal chart class merger preserving semantic text size and color together.
 * Only the chart's used Pharo scales extend the standard Tailwind conflict rules;
 * consumer height and width overrides apply to the actual measured container.
 */
export const mergeClasses = extendTailwindMerge({
  extend: {
    theme: {
      text: ['pharo-xs', 'pharo-sm'],
      font: ['pharo-body'],
      spacing: ['pharo-4', 'pharo-chart-height'],
    },
  },
});
