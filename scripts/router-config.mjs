/** @satisfies {Partial<import('@tanstack/router-generator').Config>} */
export const routerConfig = {
  target: 'react',
  autoCodeSplitting: true,
  routesDirectory: './src/routes',
  generatedRouteTree: './src/routeTree.gen.ts',
  routeFileIgnorePrefix: '-',
  routeFileIgnorePattern:
    '\\.(test|spec|stories)\\.[cm]?[jt]sx?$|(^|/)(test|__tests__|mocks|testing)(/|$)',
};
