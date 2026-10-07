import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, test } from 'vitest';
import { renderApp } from '../../../test/renderApp';

interface WitnessProps {
  children: ReactNode;
}

function CacheWitness(props: WitnessProps) {
  const { children } = props;
  const client = useQueryClient();
  return (
    <>
      <output aria-label="Cache witness">
        {client.getQueryData<number>(['isolation-witness']) ?? 'empty'}
      </output>
      {children}
    </>
  );
}

test('mounts its file route with the router cache and isolates application instances', async () => {
  const first = await renderApp({
    configure(app) {
      app.queryClient.setQueryData(['isolation-witness'], 42);
      app.router.update({ Wrap: CacheWitness, context: app.router.options.context });
    },
  });
  const second = await renderApp({
    configure(app) {
      app.router.update({ Wrap: CacheWitness, context: app.router.options.context });
    },
  });

  expect(
    await first.view.findByRole('heading', { name: 'Instrument price dashboard' }),
  ).toBeVisible();
  expect(first.router.options.context.queryClient).toBe(first.queryClient);
  expect(second.router.options.context.queryClient).toBe(second.queryClient);
  expect(first.queryClient).not.toBe(second.queryClient);
  expect(first.history).not.toBe(second.history);
  expect(first.view.getByLabelText('Cache witness')).toHaveTextContent('42');
  expect(await second.view.findByLabelText('Cache witness')).toHaveTextContent('empty');
  expect(second.queryClient.getQueryData(['isolation-witness'])).toBeUndefined();

  await first.dispose();
  expect(second.view.getByRole('heading')).toBeVisible();
  await second.dispose();
});
