import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { render, within } from '@testing-library/react';
import { createMemoryHistory } from '@tanstack/react-router';
import { expect, test } from 'vitest';
import { createAppRouter } from '../../router';
import { createAppQueryClient } from '../../queryClient';
import { AppProviders } from './AppProviders';

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

// A real route load proves the file-router/provider composition in an isolated graph.
test('mounts its file route and keeps application instances isolated', async () => {
  const firstCache = createAppQueryClient();
  const secondCache = createAppQueryClient();
  const firstHistory = createMemoryHistory({ initialEntries: ['/'] });
  const secondHistory = createMemoryHistory({ initialEntries: ['/'] });
  const first = createAppRouter(firstCache, firstHistory);
  const second = createAppRouter(secondCache, secondHistory);
  first.update({ Wrap: CacheWitness, context: first.options.context });
  second.update({ Wrap: CacheWitness, context: second.options.context });
  firstCache.setQueryData(['isolation-witness'], 42);
  const view = render(null);
  try {
    await first.load();
    await second.load();
    view.rerender(<AppProviders router={first} />);
    expect(
      await within(view.container).findByRole('heading', { name: 'Instrument price dashboard' }),
    ).toBeVisible();
    expect(first.options.context.queryClient).toBe(firstCache);
    expect(within(view.container).getByLabelText('Cache witness')).toHaveTextContent('42');
    view.rerender(<AppProviders router={second} />);
    expect(await within(view.container).findByLabelText('Cache witness')).toHaveTextContent(
      'empty',
    );
    expect(second.options.context.queryClient.getQueryData(['isolation-witness'])).toBeUndefined();
  } finally {
    view.unmount();
    await Promise.all([firstCache.cancelQueries(), secondCache.cancelQueries()]);
    firstCache.clear();
    secondCache.clear();
    firstHistory.destroy();
    secondHistory.destroy();
  }
});
