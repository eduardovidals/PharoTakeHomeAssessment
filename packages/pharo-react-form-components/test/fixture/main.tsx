import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PharoButton } from '@pharo/react-components';
import { PharoFormComboBox, PharoFormTextField, useSchemaForm } from '@pharo/react-form-components';
import { z } from 'zod';
import './styles.css';

const plants = [
  { id: 'fern', name: 'Fern' },
  { id: 'orchid', name: 'Orchid' },
  {
    id: 'long',
    name: 'A particularly long botanical variety name that wraps inside the available width',
  },
];

const plantKey = (plant: (typeof plants)[number]) => plant.id;

const plantText = (plant: (typeof plants)[number]) => plant.name;

function SelectionForm() {
  const form = useSchemaForm(
    z.object({
      name: z.string().trim().min(2, 'Enter at least two characters.'),
      plant: z
        .string()
        .min(1, 'Choose a plant.')
        .transform((value) => value.toUpperCase()),
    }),
    { defaultValues: { name: '', plant: '' } },
  );
  const [submitted, setSubmitted] = useState('Not submitted');

  return (
    <form
      noValidate
      aria-labelledby="selection-heading"
      className="space-y-pharo-4 rounded-pharo-card bg-pharo-surface p-pharo-4 pharo-shadow-card"
      onSubmit={form.handleSubmit((value) => setSubmitted(`Submitted ${JSON.stringify(value)}`))}
    >
      <h2 id="selection-heading" className="text-pharo-lg font-semibold">
        Add a plant to your collection
      </h2>
      <PharoFormTextField
        control={form.control}
        name="name"
        label="Collection name"
        description="Give your collection a readable name."
        inputProps={{ autoComplete: 'off' }}
      />
      <PharoFormComboBox
        control={form.control}
        name="plant"
        label="Plant"
        description="Choose one plant. Filtering alone does not change your selection."
        defaultItems={plants}
        itemKey={plantKey}
        itemText={plantText}
      />
      <output aria-label="Committed plant">{JSON.stringify(form.watch('plant'))}</output>
      <PharoButton type="submit">Add plant</PharoButton>
      <p role="status" aria-label="Collection submission">
        {submitted}
      </p>
    </form>
  );
}

function OptionalForm() {
  const form = useSchemaForm(
    z.object({
      preferences: z.object({ note: z.string().optional(), plant: z.string().optional() }),
    }),
    { defaultValues: { preferences: {} } },
  );
  const [submitted, setSubmitted] = useState('Not submitted');
  const [inputEvents, setInputEvents] = useState(0);

  return (
    <form
      noValidate
      aria-labelledby="optional-heading"
      className="space-y-pharo-4 rounded-pharo-card bg-pharo-surface p-pharo-4 pharo-shadow-card"
      onSubmit={form.handleSubmit((value) => setSubmitted(JSON.stringify(value)))}
    >
      <h2 id="optional-heading" className="text-pharo-lg font-semibold">
        Optional preferences
      </h2>
      <PharoFormTextField control={form.control} name="preferences.note" label="Optional note" />
      <PharoFormComboBox
        control={form.control}
        name="preferences.plant"
        label="Optional plant"
        defaultItems={plants}
        itemKey={plantKey}
        itemText={plantText}
        inputProps={{ onInput: () => setInputEvents((count) => count + 1) }}
      />
      <output aria-label="Optional draft">
        {JSON.stringify({ values: form.watch(), dirty: form.formState.isDirty })}
      </output>
      <output aria-label="Consumer input events">{inputEvents}</output>
      <PharoButton type="submit">Inspect optional values</PharoButton>
      <p role="status" aria-label="Optional submission">
        {submitted}
      </p>
    </form>
  );
}

function DisabledReadOnlyForm() {
  const [fieldDisabled, setFieldDisabled] = useState(true);
  const [formDisabled, setFormDisabled] = useState(false);
  const form = useSchemaForm(
    z.object({
      disabledNote: z.string().optional(),
      disabledPlant: z.string().optional(),
      readOnlyNote: z.string().min(1),
      readOnlyPlant: z.string().min(1),
    }),
    {
      defaultValues: {
        disabledNote: 'Preserved note',
        disabledPlant: 'fern',
        readOnlyNote: 'Published note',
        readOnlyPlant: 'orchid',
      },
      disabled: formDisabled,
    },
  );
  const [submitted, setSubmitted] = useState('Not submitted');

  return (
    <form
      noValidate
      aria-labelledby="state-heading"
      className="space-y-pharo-4 rounded-pharo-card bg-pharo-surface p-pharo-4 pharo-shadow-card"
      onSubmit={form.handleSubmit((value) => setSubmitted(JSON.stringify(value)))}
    >
      <h2 id="state-heading" className="text-pharo-lg font-semibold">
        Disabled and read-only behavior
      </h2>
      <PharoFormTextField
        control={form.control}
        name="disabledNote"
        label="Disabled note"
        isDisabled={fieldDisabled}
      />
      <PharoFormComboBox
        control={form.control}
        name="disabledPlant"
        label="Disabled plant"
        defaultItems={plants}
        itemKey={plantKey}
        itemText={plantText}
        isDisabled={fieldDisabled}
      />
      <PharoFormTextField
        control={form.control}
        name="readOnlyNote"
        label="Locked note"
        isReadOnly
      />
      <PharoFormComboBox
        control={form.control}
        name="readOnlyPlant"
        label="Locked plant"
        defaultItems={plants}
        itemKey={plantKey}
        itemText={plantText}
        isReadOnly
      />
      <div className="flex flex-wrap gap-pharo-3">
        <PharoButton
          type="button"
          variant="secondary"
          onPress={() => setFieldDisabled((value) => !value)}
        >
          {fieldDisabled ? 'Enable disabled fields' : 'Disable fields'}
        </PharoButton>
        <PharoButton
          type="button"
          variant="secondary"
          onPress={() => setFormDisabled((value) => !value)}
        >
          {formDisabled ? 'Enable form' : 'Disable form'}
        </PharoButton>
        <PharoButton type="submit">Submit state example</PharoButton>
      </div>
      <p role="status" aria-label="State submission">
        {submitted}
      </p>
    </form>
  );
}

function LongLabelForm() {
  const form = useSchemaForm(z.object({ plant: z.string() }), {
    defaultValues: { plant: '' },
  });

  return (
    <form
      aria-labelledby="long-heading"
      className="space-y-pharo-4 rounded-pharo-card bg-pharo-surface p-pharo-4 pharo-shadow-card"
    >
      <h2 id="long-heading" className="text-pharo-lg font-semibold">
        Long content
      </h2>
      <PharoFormComboBox
        control={form.control}
        name="plant"
        label="The plant variety selected for your shared indoor collection"
        description="Long labels and explanations stay associated with the field at narrow widths."
        defaultItems={plants}
        itemKey={plantKey}
        itemText={plantText}
      />
    </form>
  );
}

function Consumer() {
  return (
    <main className="mx-auto max-w-2xl space-y-pharo-6 p-pharo-4 font-pharo-body text-pharo-base text-pharo-foreground">
      <header>
        <p className="text-pharo-sm text-pharo-muted">Built public package consumer</p>
        <h1 className="text-pharo-title font-semibold">Schema-bound accessible forms</h1>
      </header>
      <SelectionForm />
      <OptionalForm />
      <DisabledReadOnlyForm />
      <LongLabelForm />
    </main>
  );
}

const root = document.getElementById('root');

if (!root) throw new Error('Form consumer root is missing.');

createRoot(root).render(<Consumer />);
