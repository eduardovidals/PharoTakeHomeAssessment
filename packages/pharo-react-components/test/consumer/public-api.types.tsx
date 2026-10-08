import { createRef } from 'react';
import {
  PharoButton,
  PharoComboBox,
  PharoDialog,
  PharoSegmentedControl,
  PharoSpinner,
  PharoTextField,
  type PharoButtonProps,
  type PharoComboBoxInputProps,
  type PharoTextFieldInputProps,
  type PharoDialogProps,
  type PharoSegmentedControlProps,
  type PharoSegmentedOption,
} from '@pharo/react-components';

const inputRef = createRef<HTMLInputElement>();
const hints: PharoTextFieldInputProps = {
  autoComplete: 'email',
  inputMode: 'email',
  placeholder: 'Email',
  className: 'text-pharo-sm',
};
const comboHints: PharoComboBoxInputProps = { autoComplete: 'off', spellCheck: false };
const buttonProps: PharoButtonProps = { variant: 'quiet', size: 'sm', onPress: () => undefined };
const items = [{ code: 1, label: 'One' }];
type Layout = 'list' | 'grid';
const layouts: readonly PharoSegmentedOption<Layout>[] = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
];
const layoutProps: PharoSegmentedControlProps<Layout> = {
  label: 'Layout',
  options: layouts,
  value: 'list',
  onChange: () => undefined,
};
const details: PharoDialogProps = {
  triggerId: 'public-details',
  triggerLabel: 'View details',
  title: 'Details',
  isOpen: false,
  onOpenChange: () => undefined,
  children: <p>Consumer content</p>,
};

export function PublicConsumer() {
  return (
    <>
      <PharoButton {...buttonProps}>
        {({ isPressed }) => (isPressed ? 'Pressed' : 'Continue')}
      </PharoButton>
      <PharoTextField
        label="Email"
        name="email"
        inputRef={inputRef}
        inputProps={hints}
        className={({ isInvalid }) => (isInvalid ? 'invalid-field' : 'valid-field')}
      />
      <PharoComboBox
        label="Number"
        defaultItems={items}
        itemKey={(item) => item.code}
        itemText={(item) => item.label}
        inputRef={inputRef}
        inputProps={comboHints}
      />
      <PharoSpinner
        label="Updating"
        className={({ isIndeterminate }) => (isIndeterminate ? 'busy' : '')}
      />
      <PharoDialog {...details} />
      <PharoSegmentedControl {...layoutProps} />
    </>
  );
}

// Wider variables must not bypass field ownership in the built declarations.
const ownedValue = { value: 'overridden', placeholder: 'A hint' };
// @ts-expect-error The outer text field owns its value.
export const invalidValue = <PharoTextField label="Name" inputProps={ownedValue} />;
const ownedName = { name: 'overridden', autoComplete: 'off' };
export const invalidName = (
  <PharoComboBox
    label="Number"
    items={items}
    itemKey={(item) => item.code}
    itemText={(item) => item.label}
    // @ts-expect-error The outer combobox owns its name.
    inputProps={ownedName}
  />
);
const ownedRef = { ref: inputRef };
// @ts-expect-error Use inputRef to reach the real input.
export const invalidRef = <PharoTextField label="Name" inputProps={ownedRef} />;
const ownedAssociation = { 'aria-describedby': 'competing-description' };
// @ts-expect-error Description associations belong to the field.
export const invalidAssociation = <PharoTextField label="Name" inputProps={ownedAssociation} />;
const ownedId = { id: 'competing-id' };
export const invalidId = (
  <PharoComboBox
    label="Number"
    items={items}
    itemKey={(item) => item.code}
    itemText={(item) => item.label}
    // @ts-expect-error The combobox owns its input identity and associations.
    inputProps={ownedId}
  />
);
// @ts-expect-error Spinner is always indeterminate.
export const invalidProgress = <PharoSpinner value={50} />;
// @ts-expect-error Supported button appearances are deliberately finite.
export const invalidAppearance = <PharoButton variant="danger">Remove</PharoButton>;
// @ts-expect-error Exclusive values must belong to the declared domain.
export const invalidLayout: PharoSegmentedControlProps<Layout> = { ...layoutProps, value: 'map' };
// @ts-expect-error Generic choices do not own application chart modes.
export const invalidChartMode = <PharoSegmentedControl {...layoutProps} performance />;
// @ts-expect-error The trigger association must be an actual stable string ID.
export const invalidDialogTrigger = <PharoDialog {...details} triggerId={42} />;
// @ts-expect-error The consumer owns open state; there is no second default-open store.
export const invalidDefaultOpen = <PharoDialog {...details} defaultOpen />;
