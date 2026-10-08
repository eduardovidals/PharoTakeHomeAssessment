import { createRef } from 'react';
import {
  PharoButton,
  PharoDialog,
  PharoSegmentedControl,
  PharoSpinner,
  PharoMultiComboBox,
  PharoTagGroup,
  type PharoMultiComboBoxProps,
  type PharoButtonProps,
  type PharoDialogProps,
  type PharoSegmentedControlProps,
  type PharoSegmentedOption,
} from '@pharo/react-components';

const inputRef = createRef<HTMLInputElement>();

const buttonProps: PharoButtonProps = { variant: 'quiet', size: 'sm', onPress: () => undefined };

const items = [{ code: 1, label: 'One' }];

const multipleProps: PharoMultiComboBoxProps<(typeof items)[number]> = {
  label: 'Numbers',
  items,
  itemKey: (item) => item.code,
  itemText: (item) => item.label,
  selectedKeys: [1, 'unlisted'],
  selectedText: String,
  inputValue: '',
  onInputChange: () => undefined,
  onSelectionAction: async () => 'committed' as const,
  maxSelected: 5,
};

export const multipleConsumer = (
  <PharoMultiComboBox
    {...multipleProps}
    inputRef={inputRef}
    renderItem={(item) => <strong>{item.label}</strong>}
  />
);

export const readOnlyTags = <PharoTagGroup label="Saved keys" items={[{ id: 1, text: 'One' }]} />;

// @ts-expect-error The multiple picker cannot accept a competing single-selection owner.
export const invalidSingleKey = <PharoMultiComboBox {...multipleProps} selectedKey={1} />;

export const invalidDefaultKeys = (
  // @ts-expect-error Selection is controlled, not initialized by an internal second store.
  <PharoMultiComboBox {...multipleProps} defaultSelectedKeys={[1]} />
);

// @ts-expect-error Financial validation belongs to the application.
export const invalidTickerDomain = <PharoMultiComboBox {...multipleProps} tickerRegex={/^TICK/} />;

// @ts-expect-error Generic selection has no Router coupling.
export const invalidPickerRouter = <PharoMultiComboBox {...multipleProps} router={{}} />;

// @ts-expect-error The optional cap is numeric.
export const invalidPickerCap = <PharoMultiComboBox {...multipleProps} maxSelected="3" />;

export const invalidPickerOutcome = (
  // @ts-expect-error A callback explicitly states whether the action committed.
  <PharoMultiComboBox {...multipleProps} onSelectionAction={() => undefined} />
);

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
      <PharoSpinner
        label="Updating"
        className={({ isIndeterminate }) => (isIndeterminate ? 'busy' : '')}
      />
      <PharoDialog {...details} />
      <PharoSegmentedControl {...layoutProps} />
    </>
  );
}

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
