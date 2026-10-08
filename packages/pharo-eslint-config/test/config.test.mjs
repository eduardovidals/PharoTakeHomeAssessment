import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { createPharoEslintConfig } from '@pharo/eslint-config';
import prettierOptions from '@pharo/prettier-config';
import { format } from 'prettier';

const rootDirectory = path.resolve(import.meta.dirname, '../../..');

const eslint = new ESLint({
  cwd: rootDirectory,
  overrideConfigFile: true,
  overrideConfig: createPharoEslintConfig({ rootDirectory }),
});

async function lint(source, filePath = 'apps/pharo-dashboard-ui/src/PolicyFixture.tsx') {
  const parser = filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'typescript' : 'babel';
  const formatted = await format(source, { ...prettierOptions, parser });
  const results = await eslint.lintText(formatted, { filePath });

  assert.equal(results.length, 1);

  return results[0];
}

test('public config accepts narrowed types, const assertions and valid React hooks', async () => {
  const result = await lint(`
    import { useState } from 'react';

    const fallback = ['Closing price'] as const;

    export function PriceLabel(props: { label?: string }) {
      const [label] = useState(props.label ?? fallback[0]);
      return <span>{label}</span>;
    }
  `);
  assert.deepEqual(result.messages, []);
});

const violations = [
  {
    name: 'explicit any',
    rule: '@typescript-eslint/no-explicit-any',
    source: 'export const price: any = 100;',
  },
  {
    name: 'non-null assertion',
    rule: '@typescript-eslint/no-non-null-assertion',
    source: "export const label = document.querySelector('h1')!.textContent;",
  },
  {
    name: 'forced as assertion',
    rule: '@typescript-eslint/consistent-type-assertions',
    source: "const raw: unknown = 'price'; export const label = raw as string;",
  },
  {
    name: 'angle bracket assertion',
    rule: '@typescript-eslint/consistent-type-assertions',
    filePath: 'apps/pharo-dashboard-ui/src/PolicyFixture.ts',
    source: "const raw: unknown = 'price'; export const label = <string>raw;",
  },
  {
    name: 'conditional hook',
    rule: 'react-hooks/rules-of-hooks',
    source: `
      import { useState } from 'react';
      export function Invalid(props: { active: boolean }) {
        if (props.active) {
          const [value] = useState(0);
          return <span>{value}</span>;
        }
        return null;
      }
    `,
  },
  {
    name: 'missing query key dependency',
    rule: '@tanstack/query/exhaustive-deps',
    source: `
      import { useQuery } from '@tanstack/react-query';
      export function Invalid(props: { ticker: string }) {
        const { ticker } = props;
        const query = useQuery({
          queryKey: ['prices'],
          queryFn: () => fetch('/api/prices/' + ticker),
        });
        return <span>{query.status}</span>;
      }
    `,
  },
  {
    name: 'query client recreated during render',
    rule: '@tanstack/query/stable-query-client',
    source: `
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      export function Invalid() {
        const client = new QueryClient();
        return <QueryClientProvider client={client}><span>Price</span></QueryClientProvider>;
      }
    `,
  },
  {
    name: 'image without accessible alternative',
    rule: 'jsx-a11y-x/alt-text',
    source: 'export function Invalid() { return <img src="/chart.png" />; }',
  },
];

for (const violation of violations) {
  test(`real ESLint rejects ${violation.name}`, async () => {
    const result = await lint(violation.source, violation.filePath);
    assert(
      result.messages.some(
        (message) => message.ruleId === violation.rule && message.severity === 2,
      ),
      JSON.stringify(result.messages),
    );
  });
}

test('one Prettier owner reports and fixes formatting to the shared public options', async () => {
  const source = 'export const title=  "Closing price"';
  const filePath = 'apps/pharo-dashboard-ui/src/formatting.ts';
  const results = await eslint.lintText(source, { filePath });
  assert(results[0].messages.some((message) => message.ruleId === 'prettier/prettier'));
  const fixing = new ESLint({
    cwd: rootDirectory,
    overrideConfigFile: true,
    overrideConfig: createPharoEslintConfig({ rootDirectory }),
    fix: true,
  });
  const fixed = await fixing.lintText(source, { filePath });
  assert.equal(fixed[0].output, await format(source, { ...prettierOptions, parser: 'typescript' }));
  assert.deepEqual(fixed[0].messages, []);
});

test('only the app generated route and actual private/build outputs are ignored', async () => {
  for (const filePath of [
    '.dev-private/fixture.ts',
    'packages/pharo-react-charts/dist/index.js',
    'apps/pharo-dashboard-ui/src/routeTree.gen.ts',
  ]) {
    assert.equal(await eslint.isPathIgnored(path.join(rootDirectory, filePath)), true, filePath);
  }
  for (const filePath of [
    'apps/pharo-dashboard-ui/src/routes/index.tsx',
    'packages/pharo-react-charts/src/routeTree.gen.ts',
    'packages/pharo-react-components/src/components/Example/Example.test.tsx',
    'packages/pharo-react-charts/src/components/Example/Example.stories.tsx',
  ]) {
    assert.equal(await eslint.isPathIgnored(path.join(rootDirectory, filePath)), false, filePath);
  }
});

test('Node globals are scoped to tooling and browser globals to browser source', async () => {
  const node = await lint('export const cwd = process.cwd();', 'scripts/environment.mjs');
  assert.deepEqual(node.messages, []);
  const browser = await lint(
    'export const title = document.title;',
    'apps/pharo-dashboard-ui/src/environment.jsx',
  );
  assert.deepEqual(browser.messages, []);
  const misplaced = await lint(
    'export const cwd = process.cwd();',
    'apps/pharo-dashboard-ui/src/environment.jsx',
  );
  assert(misplaced.messages.some((message) => message.ruleId === 'no-undef'));
});

test('a consumer must supply an absolute repository root', () => {
  assert.throws(() => createPharoEslintConfig({ rootDirectory: '.' }), /absolute repository path/);
});

const fileRoute = `
  import { createFileRoute } from '@tanstack/react-router';

  export function Dashboard() { return <h1>Prices</h1>; }

  export const Route = createFileRoute('/')({ component: Dashboard });
`;

for (const route of [
  'index.tsx',
  '(dashboard)/index.tsx',
  '(dashboard)/reports/$reportId.tsx',
  'accounts/$accountId/settings.tsx',
]) {
  test(`TanStack file route ${route} may export Route without disabling refresh checks`, async () => {
    const result = await lint(fileRoute, `apps/pharo-dashboard-ui/src/routes/${route}`);
    assert.deepEqual(result.messages, []);
  });
}

const privateRouteFiles = [
  '(dashboard)/-components/Dashboard/Dashboard.tsx',
  '(dashboard)/-components/Dashboard/components/Panel/Panel.tsx',
  '(dashboard)/-hooks/useDashboardActions/Fixture.tsx',
  '(dashboard)/-state/Fixture.tsx',
  '(dashboard)/nested/-support/Fixture.tsx',
  '(dashboard)/-fixture.tsx',
  '(dashboard)/nested/mocks/Fixture.tsx',
];

for (const file of privateRouteFiles) {
  test(`private route-owned source ${file} retains ordinary refresh export rules`, async () => {
    const result = await lint(fileRoute, `apps/pharo-dashboard-ui/src/routes/${file}`);
    assert(
      result.messages.some((message) => message.ruleId === 'react-refresh/only-export-components'),
      JSON.stringify(result.messages),
    );
  });
}

for (const file of [
  ...privateRouteFiles,
  '(dashboard)/index.test.tsx',
  '(dashboard)/index.spec.tsx',
  '(dashboard)/index.stories.tsx',
  '(dashboard)/test/Fixture.tsx',
  '(dashboard)/__tests__/Fixture.tsx',
  '(dashboard)/testing/Fixture.tsx',
]) {
  test(`non-route lane ${file} never receives the Route export allowance`, async () => {
    const config = await eslint.calculateConfigForFile(
      `apps/pharo-dashboard-ui/src/routes/${file}`,
    );
    const options = config.rules['react-refresh/only-export-components']?.[1];
    assert(!options?.allowExportNames?.includes('Route'));
  });
}

test('a route still rejects an unrelated function export', async () => {
  const result = await lint(
    fileRoute + 'export function loadPrices() { return fetch("/api/instruments"); }',
    'apps/pharo-dashboard-ui/src/routes/(dashboard)/reports/$reportId.tsx',
  );
  assert(
    result.messages.some((message) => message.ruleId === 'react-refresh/only-export-components'),
    JSON.stringify(result.messages),
  );
});

test('Route allowance is limited to the application file-route directory', async () => {
  const result = await lint(fileRoute, 'apps/pharo-dashboard-ui/src/components/Dashboard.tsx');
  assert(
    result.messages.some((message) => message.ruleId === 'react-refresh/only-export-components'),
    JSON.stringify(result.messages),
  );
});

test('spacing separates story metadata, the default export, story type and every story', async () => {
  const result = await lint(
    `const meta = {};
export default meta;
type Story = { args?: object };
export const Primary: Story = {};
export const Secondary: Story = {};
export const Quiet: Story = {};`,
    'packages/pharo-react-components/src/components/Example/Example.stories.tsx',
  );

  assert.equal(
    result.messages.filter(
      (message) => message.ruleId === '@stylistic/padding-line-between-statements',
    ).length,
    5,
  );
});

test('spacing separates lifecycle hooks without splitting their callback statements', async () => {
  const result = await lint(
    `import { beforeAll, afterEach, afterAll } from 'vitest';

beforeAll(() => {});
afterEach(() => {});
afterAll(() => {});`,
    'apps/pharo-dashboard-ui/src/example.test.ts',
  );

  assert.equal(
    result.messages.filter(
      (message) => message.ruleId === '@stylistic/padding-line-between-statements',
    ).length,
    2,
  );
});

test('spacing accepts cohesive imports, variables, assertions, barrel exports and JSX', async () => {
  const result = await lint(
    `import assert from 'node:assert/strict';
import type { ReactNode } from 'react';

const uiPort = 4191;
const apiPort = 5190;
assert.notEqual(uiPort, apiPort);
assert.ok(uiPort > 0);

export { uiPort, apiPort };
export type { ReactNode };

export function Example() {
  const options = { first: 'A', second: 'B' };
  const { first, second } = options;
  return <div><span>{first}</span><span>{second}</span></div>;
}`,
    'packages/pharo-react-components/src/components/Example/Example.test.tsx',
  );

  assert.deepEqual(result.messages, []);
});

test('spacing recognizes adjacent parameterized test declarations', async () => {
  for (const name of ['test', 'it', 'describe']) {
    const first = `${name}.each([1])('first %s', () => {});`;
    const second = `${name}.each([2])('second %s', () => {});`;
    const imports = `import { ${name} } from 'vitest';\n\n`;
    const filePath = 'apps/pharo-dashboard-ui/src/example.test.ts';
    const invalid = await lint(`${imports}${first}\n${second}`, filePath);
    const valid = await lint(`${imports}${first}\n\n${second}`, filePath);

    assert.equal(
      invalid.messages.filter(
        (message) => message.ruleId === '@stylistic/padding-line-between-statements',
      ).length,
      1,
    );
    assert.deepEqual(valid.messages, []);
  }
});

test('spacing fixes before attached JSDoc and Prettier leaves exactly one blank line', async () => {
  const source = `/** First documented declaration. */
export type First = string;
/** Second documented declaration. */
export type Second = number;


/** Third documented declaration. */
export type Third = boolean;
`;
  const fixing = new ESLint({
    cwd: rootDirectory,
    overrideConfigFile: true,
    overrideConfig: createPharoEslintConfig({ rootDirectory }),
    fix: true,
  });
  const [result] = await fixing.lintText(source, {
    filePath: 'apps/pharo-dashboard-ui/src/example.ts',
  });

  assert.deepEqual(result.messages, []);
  assert.equal(
    result.output,
    `/** First documented declaration. */
export type First = string;

/** Second documented declaration. */
export type Second = number;

/** Third documented declaration. */
export type Third = boolean;
`,
  );
});

test('spacing fixes are idempotent and preserve internal JSDoc example boundaries', async () => {
  const source = `const initial = 1;
/** Example lifecycle.
 * @example
 * const ready = prepare();
 *
 * ready.dispose();
 */
export function value() { return initial; }
`;
  const fixing = new ESLint({
    cwd: rootDirectory,
    overrideConfigFile: true,
    overrideConfig: createPharoEslintConfig({ rootDirectory }),
    fix: true,
  });
  const options = { filePath: 'apps/pharo-dashboard-ui/src/example.ts' };
  const [first] = await fixing.lintText(source, options);
  const [second] = await fixing.lintText(first.output ?? source, options);

  assert.deepEqual(first.messages, []);
  assert.deepEqual(second.messages, []);
  assert.equal(second.output, undefined);
  assert.match(first.output, /const initial = 1;\n\n\/\*\* Example/);
  assert.match(first.output, /prepare\(\);\n \*\n \* ready.dispose/);
  assert.match(first.output, / \*\/\nexport function/);
});
