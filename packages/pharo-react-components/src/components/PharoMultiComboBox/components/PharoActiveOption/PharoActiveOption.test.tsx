import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { PharoMultiComboBox } from '../../PharoMultiComboBox';

function FocusExample() {
  const [query, setQuery] = useState('');

  return (
    <PharoMultiComboBox
      label="Letters"
      items={['Alpha', 'Alpine', 'Beta']
        .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
        .map((name) => ({ name }))}
      itemKey={(item) => item.name}
      itemText={(item) => item.name}
      selectedKeys={[]}
      selectedText={String}
      inputValue={query}
      onInputChange={setQuery}
      onSelectionAction={() => 'unchanged'}
    />
  );
}

it('resets for a changed query without overriding subsequent arrow navigation', async () => {
  const user = userEvent.setup();
  render(<FocusExample />);
  const input = screen.getByRole('combobox');

  await user.type(input, 'Al');

  const first = await screen.findByRole('option', { name: 'Alpha' });

  await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant', first.id));

  await user.keyboard('{ArrowDown}');

  expect(input).toHaveAttribute(
    'aria-activedescendant',
    screen.getByRole('option', { name: 'Alpine' }).id,
  );

  await user.type(input, 'zzz');

  await waitFor(() => expect(input).not.toHaveAttribute('aria-activedescendant'));
});
