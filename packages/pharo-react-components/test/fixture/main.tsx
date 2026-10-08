import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Key } from 'react-aria-components';
import {
  PharoButton,
  PharoDialog,
  PharoMultiComboBox,
  PharoSegmentedControl,
  PharoSpinner,
  type PharoSelectionAction,
} from '@pharo/react-components';
import './styles.css';

const varieties = Array.from({ length: 24 }, (_, index) => ({
  id: index + 1,
  name: `Variety ${String(index + 1).padStart(2, '0')}`,
}));

function MultipleChoices() {
  const [keys, setKeys] = useState<readonly Key[]>(['retired']);
  const [query, setQuery] = useState('');
  const [submissions, setSubmissions] = useState(0);
  const [failNext, setFailNext] = useState(false);

  const handleAction = async (action: PharoSelectionAction) => {
    if (failNext) {
      setFailNext(false);

      throw new Error('Private fixture rejection');
    }

    setKeys((previous) =>
      action.kind === 'add'
        ? [...previous, action.key]
        : action.kind === 'clear'
          ? []
          : previous.filter((key) => !action.keys.includes(key)),
    );

    return 'committed' as const;
  };

  return (
    <section
      aria-label="Multiple choices"
      className="space-y-pharo-4 rounded-pharo-card bg-pharo-surface p-pharo-4 pharo-shadow-card"
    >
      <h2 className="text-pharo-lg font-semibold">Multiple choices</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmissions((value) => value + 1);
        }}
      >
        <PharoMultiComboBox
          label="Plant varieties"
          items={varieties.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))}
          itemKey={(item) => item.id}
          itemText={(item) => item.name}
          selectedKeys={keys}
          selectedText={(key) =>
            varieties.find((item) => item.id === key)?.name ?? `Unknown ${key}`
          }
          inputValue={query}
          onInputChange={setQuery}
          onSelectionAction={handleAction}
          maxSelected={4}
          errorMessage="Could not update varieties. Try again."
          placeholder="Search varieties"
        />
        <button type="submit">Submit varieties</button>
      </form>
      <p data-testid="variety-submissions">Variety submissions: {submissions}</p>
      <PharoButton variant="secondary" onPress={() => setFailNext(true)}>
        Reject next selection
      </PharoButton>
      <PharoButton variant="secondary" onPress={() => setKeys([24, 'shared'])}>
        Restore shared selection
      </PharoButton>
    </section>
  );
}

function Consumer() {
  const [presses, setPresses] = useState(0);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [layout, setLayout] = useState<'list' | 'grid' | 'map'>('list');

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
      <MultipleChoices />
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
      <section
        aria-labelledby="choices-heading"
        className="space-y-pharo-4 rounded-pharo-card bg-pharo-surface p-pharo-4 pharo-shadow-card"
      >
        <h2 id="choices-heading" className="text-pharo-lg font-semibold">
          Overlays and choices
        </h2>
        <PharoSegmentedControl
          label="Collection layout"
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'list', label: 'List' },
            { value: 'map', label: 'Map', isDisabled: true },
            { value: 'grid', label: 'Grid' },
          ]}
        />
        <p>Current layout: {layout}</p>
        <PharoDialog
          triggerId="collection-details"
          triggerLabel="View collection details"
          title="Collection details"
          isOpen={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
        >
          <div className="space-y-pharo-4">
            <p>All recorded collection details are available below.</p>
            {Array.from({ length: 60 }, (_, index) => (
              <p key={index}>Detail row {index + 1}: consumer content remains inside the dialog.</p>
            ))}
            <PharoButton variant="secondary">Last content action</PharoButton>
          </div>
        </PharoDialog>
      </section>
    </main>
  );
}

const root = document.getElementById('root');

if (!root) throw new Error('Consumer root is missing.');

createRoot(root).render(<Consumer />);
