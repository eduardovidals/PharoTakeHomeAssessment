/** One readable value in an exclusive choice. */
export interface PharoSegmentedOption<Value extends string> {
  /** Stable value emitted to the consumer. */
  readonly value: Value;
  /** Visible and accessible option label. */
  readonly label: string;
  /** Keep the option visible while preventing selection. */
  readonly isDisabled?: boolean;
}

/** Controlled exclusive choice using React Aria radio semantics. */
export interface PharoSegmentedControlProps<Value extends string> {
  /** Visible label describing the choice. */
  readonly label: string;
  /** Ordered choices, with unique values. */
  readonly options: readonly PharoSegmentedOption<Value>[];
  /** The consumer-owned selected value. */
  readonly value: Value;
  /** Called when the user selects an enabled option. */
  readonly onChange: (value: Value) => void;
  /** Disable all changes without hiding the current value. */
  readonly isDisabled?: boolean;
  /** Complete utility classes overriding the outer group. */
  readonly className?: string;
}
