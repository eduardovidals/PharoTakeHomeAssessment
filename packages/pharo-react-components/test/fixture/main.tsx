import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Key } from 'react-aria-components';
import { PharoButton, PharoComboBox, PharoSpinner, PharoTextField } from '@pharo/react-components';
import './styles.css';

const plants = [
  { id: 'orchid', name: 'Orchid' },
  { id: 'fern', name: 'Fern' },
  { id: 'maple', name: 'Maple' },
  { id: 'long', name: 'A particularly long botanical variety name that should wrap comfortably' },
];
const plantKey = (plant: (typeof plants)[number]) => plant.id;
const plantText = (plant: (typeof plants)[number]) => plant.name;

function Consumer() {
  const [presses, setPresses] = useState(0);
  const [name, setName] = useState('Ada');
  const [selected, setSelected] = useState<Key | null>(null);
  const [emptySelected, setEmptySelected] = useState<Key | null>(null);
  const [retiredChanges, setRetiredChanges] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <main className="mx-auto max-w-3xl space-y-pharo-8 p-pharo-6 font-pharo-body text-pharo-base text-pharo-foreground">
      <header>
        <p className="text-pharo-sm text-pharo-muted">Public package consumer</p>
        <h1 className="text-pharo-title font-semibold">Accessible controls, composed together</h1>
      </header>
      <section
        aria-labelledby="actions-heading"
        className="space-y-pharo-4 rounded-pharo-card bg-pharo-surface p-pharo-4 pharo-shadow-card"
      >
        <h2 id="actions-heading" className="text-pharo-lg font-semibold">
          Actions
        </h2>
        <div className="flex flex-wrap items-center gap-pharo-4">
          <PharoButton onPress={() => setPresses((value) => value + 1)}>Save changes</PharoButton>
          <PharoButton isDisabled onPress={() => setPresses((value) => value + 100)}>
            Unavailable
          </PharoButton>
          <PharoButton variant="secondary">Secondary action</PharoButton>
          <PharoButton variant="quiet">Quiet action</PharoButton>
          <PharoButton size="sm" className="ps-pharo-8 pe-pharo-8 rounded-pharo-pill">
            Small custom action
          </PharoButton>
          <PharoButton isPending>Saving changes</PharoButton>
        </div>
        <p role="status">Saved {presses} times</p>
      </section>
      <section
        aria-labelledby="fields-heading"
        className="space-y-pharo-4 rounded-pharo-card bg-pharo-surface p-pharo-4 pharo-shadow-card"
      >
        <h2 id="fields-heading" className="text-pharo-lg font-semibold">
          Fields
        </h2>
        <PharoTextField
          label="Display name"
          name="displayName"
          value={name}
          onChange={setName}
          description="Shown next to your contributions."
          inputProps={{ autoComplete: 'name' }}
        />
        <PharoTextField
          label="Email address"
          isInvalid
          description="Use an address you can access."
          errorMessage="Enter a valid email address."
          inputRef={inputRef}
          inputProps={{ inputMode: 'email', autoComplete: 'email' }}
          className={({ isInvalid }) => (isInvalid ? 'consumer-invalid' : '')}
        />
        <PharoButton variant="secondary" onPress={() => inputRef.current?.focus()}>
          Focus email field
        </PharoButton>
        <PharoTextField label="Read-only note" isReadOnly defaultValue="Published" />
        <PharoTextField label="Disabled note" isDisabled defaultValue="Unavailable" />
        <PharoComboBox
          label="Plant"
          defaultItems={plants}
          itemKey={plantKey}
          itemText={plantText}
          selectedKey={selected}
          onSelectionChange={setSelected}
          description="Choose a plant for the collection."
          disabledKeys={['maple']}
        />
        <p data-testid="selection">Selected: {selected ?? 'none'}</p>
        <PharoComboBox
          label="Empty collection"
          items={[]}
          itemKey={plantKey}
          itemText={plantText}
          selectedKey={emptySelected}
          onSelectionChange={setEmptySelected}
        />
        <p data-testid="empty-selection">Selected empty key: {emptySelected ?? 'none'}</p>
        <PharoComboBox
          label="Retired selection"
          defaultItems={plants}
          itemKey={plantKey}
          itemText={plantText}
          defaultSelectedKey="fern"
          disabledKeys={['fern']}
          onSelectionChange={() => setRetiredChanges((value) => value + 1)}
        />
        <p data-testid="retired-changes">Retired selection changes: {retiredChanges}</p>
      </section>
      <section
        aria-labelledby="progress-heading"
        className="space-y-pharo-4 rounded-pharo-card bg-pharo-surface p-pharo-4 pharo-shadow-card"
      >
        <h2 id="progress-heading" className="text-pharo-lg font-semibold">
          Progress
        </h2>
        <PharoSpinner label="Updating preferences" />
        <PharoSpinner size="sm" label="Loading preview" />
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Consumer root is missing.');
createRoot(root).render(<Consumer />);
