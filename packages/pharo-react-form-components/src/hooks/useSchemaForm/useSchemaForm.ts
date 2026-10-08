import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';
import type { ZodType } from 'zod';
import type { UseSchemaFormOptions, UseSchemaFormResult } from './types';

/**
 * Use a Zod schema without erasing its input, transformed output or resolver context.
 * Defaults and options belong to the consumer; the schema owns validation and transforms.
 * @example
 * ```tsx
 * const form = useSchemaForm(z.object({
 *   quantity: z.string().transform((value) => Number(value)),
 * }), { defaultValues: { quantity: '' } });
 *
 * form.handleSubmit((output) => console.log(output.quantity.toFixed(2)));
 * ```
 */
export function useSchemaForm<
  Input extends FieldValues,
  Output extends FieldValues = Input,
  Context = unknown,
>(
  schema: ZodType<Output, Input>,
  options: UseSchemaFormOptions<Input, Output, Context> = {},
): UseSchemaFormResult<Input, Output, Context> {
  if (Object.hasOwn(options, 'resolver')) {
    throw new Error('PHARO-FORMS-SCHEMA-OPTIONS: The supplied schema owns the resolver.');
  }

  return useForm<Input, Context, Output>({
    ...options,
    resolver: zodResolver(schema),
  });
}
