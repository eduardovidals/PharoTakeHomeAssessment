import assert from 'node:assert/strict';
import { test } from 'node:test';
import options from '@pharo/prettier-config';
import { format } from 'prettier';

test('the public export formats JavaScript consistently and idempotently', async () => {
  const source = 'export const title= "Closing price"\r\n';
  const actual = await format(source, { ...options, parser: 'babel' });

  assert.equal(actual, "export const title = 'Closing price';\n");
  assert.equal(await format(actual, { ...options, parser: 'babel' }), actual);
});

test('the same public options format TypeScript const assertions', async () => {
  const actual = await format('export const palette={primary:"#00217f"} as const', {
    ...options,
    parser: 'typescript',
  });

  assert.equal(actual, "export const palette = { primary: '#00217f' } as const;\n");
});

test('Markdown paragraphs unwrap manual line breaks without wrapping at the print width', async () => {
  const lines = [
    'A package describes its exported interfaces and the responsibilities of each module.',
    'Its documentation uses complete paragraphs that remain stable when a sentence is edited.',
  ];
  const actual = await format(lines.join('\n'), { ...options, parser: 'markdown' });

  assert.equal(actual, lines.join(' ') + '\n');
});
