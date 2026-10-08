import { createRef } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { afterEach, expect, test, vi } from 'vitest';
import { createApiClient } from '../../../../../../api/client';
import { createAppQueryClient } from '../../../../../../app/queryClient';
import { server } from '../../../../../../test/mocks/server';
import { DashboardToolbar } from './DashboardToolbar';
import type { DashboardToolbarProps } from './types';

const clients = new Set<ReturnType<typeof createAppQueryClient>>();
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.clear();
});

function renderToolbar(overrides: Partial<DashboardToolbarProps> = {}) {
  server.use(http.get('*/api/instruments', () => HttpResponse.json(['AAA', 'BBB'])));
  const client = createAppQueryClient();
  clients.add(client);
  const onAction = vi.fn<DashboardToolbarProps['onAction']>().mockResolvedValue('committed');
  const props: DashboardToolbarProps = {
    apiClient: createApiClient({ baseURL: 'http://localhost/api' }),
    selectedTickers: [],
    mode: 'price',
    appearances: new Map(),
    windows: [],
    onAction,
    ...overrides,
  };
  render(
    <QueryClientProvider client={client}>
      <DashboardToolbar {...props} />
    </QueryClientProvider>,
  );
  return { onAction };
}

const firstWindow = {
  id: 'AAA',
  label: 'AAA',
  firstTimestamp: Date.UTC(2024, 2, 10),
  lastTimestamp: Date.UTC(2024, 2, 11),
  baseTimestamp: Date.UTC(2024, 2, 10),
  observationCount: 2,
};

test('keeps empty selection useful without inventing dates or duplicating its count', async () => {
  renderToolbar();
  expect(screen.getByRole('combobox', { name: 'Compare instruments' })).toBeVisible();
  expect(screen.getAllByText('0/3.')).toHaveLength(1);
  expect(screen.queryByText(/observations|2024|2026/)).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: 'Performance' }));
  expect(screen.getByRole('radio', { name: 'Price' })).toBeChecked();
});

test('shows one truthful shared range and count and safely recovers rejected view intentions', async () => {
  const { onAction } = renderToolbar({
    selectedTickers: ['AAA', 'BBB'],
    windows: [firstWindow, { ...firstWindow, id: 'BBB', label: 'BBB' }],
  });
  expect(screen.getAllByText('Mar 10 – Mar 11, 2024 (UTC)')).toHaveLength(1);
  expect(screen.getAllByText('2 observations')).toHaveLength(1);
  onAction.mockRejectedValueOnce(new Error('PRIVATE_ROUTING_DETAIL'));
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: 'Performance' }));
  expect(
    await screen.findByText('The chart view could not be updated. Please try again.'),
  ).toBeVisible();
  expect(screen.queryByText(/PRIVATE_ROUTING_DETAIL/)).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Price' })).toBeChecked();
  await user.click(screen.getByRole('radio', { name: 'Performance' }));
  await waitFor(() =>
    expect(
      screen.queryByText('The chart view could not be updated. Please try again.'),
    ).not.toBeInTheDocument(),
  );
  expect(onAction).toHaveBeenLastCalledWith({ type: 'set-view', view: 'performance' });
});

test('does not reuse the first range or count when available windows differ', () => {
  renderToolbar({
    windows: [firstWindow, { ...firstWindow, id: 'BBB', label: 'BBB', observationCount: 1 }],
  });
  expect(screen.getByText('Recorded windows differ.')).toBeVisible();
  expect(screen.queryByText('2 observations')).not.toBeInTheDocument();
  expect(screen.queryByText('Mar 10 – Mar 11, 2024 (UTC)')).not.toBeInTheDocument();
});

test('qualifies an available window without implying missing selections share its data', () => {
  renderToolbar({ selectedTickers: ['AAA', 'UNKNOWN', 'BBB'], windows: [firstWindow] });
  expect(screen.getByText('Available histories: 1 of 3.')).toBeVisible();
  expect(screen.getAllByText('Mar 10 – Mar 11, 2024 (UTC)')).toHaveLength(1);
  expect(screen.getAllByText('2 observations')).toHaveLength(1);
});

test('exposes the actual editable input through the toolbar and picker ref seam', () => {
  const pickerInputRef = createRef<HTMLInputElement>();
  renderToolbar({ pickerInputRef });
  expect(pickerInputRef.current).toBe(
    screen.getByRole('combobox', { name: 'Compare instruments' }),
  );
});
