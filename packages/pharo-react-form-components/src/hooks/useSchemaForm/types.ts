import type { FieldValues, UseFormProps, UseFormReturn } from 'react-hook-form';

/** Native form options with resolver composition reserved for the supplied schema. */
export type UseSchemaFormOptions<
  Input extends FieldValues,
  Output extends FieldValues = Input,
  Context = unknown,
> = Omit<UseFormProps<Input, Context, Output>, 'resolver'> & {
  /** A competing resolver is forbidden, including properties from wider objects. */
  resolver?: never;
};

/** Native form result: input owns drafts; output owns successful submitted values. */
export type UseSchemaFormResult<
  Input extends FieldValues,
  Output extends FieldValues = Input,
  Context = unknown,
> = UseFormReturn<Input, Context, Output>;
