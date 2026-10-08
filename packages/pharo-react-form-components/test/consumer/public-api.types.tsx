import {
  PharoFormComboBox,
  PharoFormTextField,
  useSchemaForm,
  type PharoTextFieldInputProps,
  type PharoComboBoxInputProps,
  type UseSchemaFormOptions,
  type UseSchemaFormResult,
} from '@pharo/react-form-components';
import { z } from 'zod';

const schema = z.object({
  profile: z.object({ name: z.string() }),
  optional: z.string().optional(),
  amount: z.string().transform(Number),
  count: z.number(),
  tags: z.array(z.string()),
  nullable: z.string().nullable(),
});

type Input = z.input<typeof schema>;

type Output = z.output<typeof schema>;

type Context = { locale: string };

const plants = [{ id: 'fern', name: 'Fern' }];

const itemKey = (item: (typeof plants)[number]) => item.id;

const itemText = (item: (typeof plants)[number]) => item.name;

const textHints: PharoTextFieldInputProps = { autoComplete: 'name', inputMode: 'text' };

const comboHints: PharoComboBoxInputProps = { placeholder: 'Search', onInput: () => undefined };

export function TypedConsumer() {
  const options: UseSchemaFormOptions<Input, Output, Context> = {
    context: { locale: 'en' },
    defaultValues: { profile: { name: 'Ada' }, amount: '12' },
  };
  const form: UseSchemaFormResult<Input, Output, Context> = useSchemaForm(schema, options);

  form.setValue('amount', '15');
  // @ts-expect-error The input draft remains a string before the schema transform.
  form.setValue('amount', 15);
  form.handleSubmit((value) => {
    value.amount.toFixed(2);
    // @ts-expect-error Successful output is numeric after the schema transform.
    value.amount.toUpperCase();
  });

  return (
    <>
      <PharoFormTextField
        control={form.control}
        name="profile.name"
        label="Name"
        inputProps={textHints}
      />
      <PharoFormTextField control={form.control} name="optional" label="Optional" />
      <PharoFormTextField control={form.control} name="amount" label="Amount" />
      <PharoFormComboBox
        control={form.control}
        name="optional"
        label="Plant"
        items={plants}
        itemKey={itemKey}
        itemText={itemText}
        inputProps={comboHints}
      />
      {/* @ts-expect-error Numeric paths are not valid string bindings. */}
      <PharoFormTextField control={form.control} name="count" label="Count" />
      {/* @ts-expect-error Array paths are not valid string bindings. */}
      <PharoFormTextField control={form.control} name="tags" label="Tags" />
      {/* @ts-expect-error Nullable values need normalization in the owning schema. */}
      <PharoFormTextField control={form.control} name="nullable" label="Nullable" />
      <PharoFormComboBox
        control={form.control}
        // @ts-expect-error Object paths are not valid string selections.
        name="profile"
        label="Plant"
        items={plants}
        itemKey={itemKey}
        itemText={itemText}
      />
      <PharoFormComboBox
        control={form.control}
        name="optional"
        label="Plant"
        items={plants}
        // @ts-expect-error Item keys must be strings.
        itemKey={() => 42}
        itemText={itemText}
      />
    </>
  );
}

export function RejectedOverrides() {
  const form = useSchemaForm(z.object({ name: z.string() }), { defaultValues: { name: '' } });
  const outerText = { value: 'competing' };
  const outerCombo = { selectedKey: 'competing' };
  const nested = { 'aria-label': 'competing' };
  const competingOptions = { resolver: () => ({ values: {}, errors: {} }) };

  // @ts-expect-error Wider options cannot replace the schema resolver.
  useSchemaForm(z.object({ name: z.string() }), competingOptions);

  return (
    <>
      {/* @ts-expect-error Wider props cannot replace a controller-owned value. */}
      <PharoFormTextField control={form.control} name="name" label="Name" {...outerText} />
      {/* @ts-expect-error Wider props cannot replace controller selection. */}
      <PharoFormComboBox
        control={form.control}
        name="name"
        label="Plant"
        items={plants}
        itemKey={itemKey}
        itemText={itemText}
        {...outerCombo}
      />
      {/* @ts-expect-error Native input hints cannot replace accessible naming. */}
      <PharoFormTextField control={form.control} name="name" label="Name" inputProps={nested} />
    </>
  );
}
