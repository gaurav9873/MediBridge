'use client'

import type { FieldHelp } from '@medibridge/copy'
import { AlertCircle, Info } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/cn'
import { Tooltip } from './tooltip'

/**
 * Form fields.
 *
 * Note the shape of the API: every field takes a `field: FieldHelp` object
 * imported from @medibridge/copy, not a loose `label` string. That single
 * decision enforces two of the product rules at compile time:
 *
 *   - A field cannot render without helper text, because FieldHelp requires it.
 *   - A field cannot use hardcoded copy, because the object comes from the
 *     copy package — which is also what makes translation possible later.
 *
 *   <TextField field={copy.auth.signUp.fields.gstNumber}
 *             error={errors.gstNumber?.message}
 *             {...register('gstNumber')} />
 *
 * Accessibility is handled here once: label association, aria-describedby
 * pointing at both the helper text and any error, aria-invalid, and an error
 * that announces itself to screen readers.
 */

interface FieldShellProps {
  field: FieldHelp
  /** Validation message. Always a friendly sentence from @medibridge/copy. */
  error?: string
  required?: boolean
  /** Rendered under the input, above the helper text. For live hints. */
  hint?: React.ReactNode
  className?: string
  children: (ids: { inputId: string; describedBy: string; invalid: boolean }) => React.ReactNode
}

export function FormField({
  field,
  error,
  required,
  hint,
  className,
  children,
}: FieldShellProps): React.JSX.Element {
  const reactId = React.useId()
  const inputId = `field-${reactId}`
  const helpId = `${inputId}-help`
  const errorId = `${inputId}-error`
  const invalid = Boolean(error)

  // Point the control at its helper text and, when present, its error.
  const describedBy = [helpId, invalid ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-content-primary">
          {field.label}
          {required && (
            <span className="ml-0.5 text-danger-600" aria-hidden>
              *
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </label>

        {field.tooltip && (
          <Tooltip content={field.tooltip}>
            <button
              type="button"
              // Not in the tab order: the same text is always available in the
              // helper line below, so keyboard users lose nothing by skipping it.
              tabIndex={-1}
              className="text-content-muted hover:text-content-secondary"
              aria-label={`More information about ${field.label}`}
            >
              <Info className="size-4" aria-hidden />
            </button>
          </Tooltip>
        )}
      </div>

      {children({ inputId, describedBy, invalid })}

      {hint}

      {/* Helper text is always rendered — it is guidance, not an error state. */}
      <p id={helpId} className="text-sm text-content-secondary">
        {field.helperText}
      </p>

      {invalid && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-sm font-medium text-danger-700"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

/** Shared visual treatment for every text-like control. */
const controlClasses = (invalid: boolean): string =>
  cn(
    'w-full rounded-[--radius-md] border bg-surface px-3 py-2.5',
    'min-h-[--size-touch] text-base text-content-primary',
    'placeholder:text-content-muted',
    'transition-colors',
    'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60',
    invalid
      ? 'border-danger-600 focus-visible:outline-danger-600'
      : 'border-border-strong hover:border-content-muted',
  )

// ---------------------------------------------------------------------------

export interface TextFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'id' | 'placeholder' | 'prefix'
> {
  field: FieldHelp
  error?: string
  /**
   * Rendered inside the input, e.g. a ₹ symbol.
   * Named `leading`/`trailing` rather than prefix/suffix because `prefix` is
   * already an HTML attribute typed as string, and reusing it breaks the props.
   */
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { field, error, required, leading, trailing, className, ...props },
  ref,
) {
  return (
    <FormField field={field} error={error} required={required}>
      {({ inputId, describedBy, invalid }) => (
        <div className="relative flex items-center">
          {leading && (
            <span className="pointer-events-none absolute left-3 text-content-muted">
              {leading}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            placeholder={field.placeholder}
            className={cn(
              controlClasses(invalid),
              leading && 'pl-9',
              trailing && 'pr-12',
              className,
            )}
            {...props}
          />
          {trailing && (
            <span className="pointer-events-none absolute right-3 text-content-muted">
              {trailing}
            </span>
          )}
        </div>
      )}
    </FormField>
  )
})

// ---------------------------------------------------------------------------

export interface TextAreaFieldProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'id' | 'placeholder'
> {
  field: FieldHelp
  error?: string
}

export const TextAreaField = React.forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ field, error, required, className, rows = 4, ...props }, ref) {
    return (
      <FormField field={field} error={error} required={required}>
        {({ inputId, describedBy, invalid }) => (
          <textarea
            ref={ref}
            id={inputId}
            rows={rows}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            placeholder={field.placeholder}
            className={cn(controlClasses(invalid), 'resize-y', className)}
            {...props}
          />
        )}
      </FormField>
    )
  },
)

// ---------------------------------------------------------------------------

export interface SelectOption {
  value: string
  label: string
}

export interface SelectFieldProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'id' | 'children'
> {
  field: FieldHelp
  error?: string
  options: readonly SelectOption[]
  /** Shown as a disabled first option until something is chosen. */
  placeholder?: string
}

/**
 * A native <select> on purpose.
 *
 * Custom dropdowns look tidier but lose the OS picker on mobile, which is
 * genuinely better for one-handed use — and they routinely break keyboard and
 * screen reader behaviour that the native element gets right for free.
 */
export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField({ field, error, required, options, placeholder, className, ...props }, ref) {
    return (
      <FormField field={field} error={error} required={required}>
        {({ inputId, describedBy, invalid }) => (
          <select
            ref={ref}
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            defaultValue={props.value === undefined ? '' : undefined}
            className={cn(controlClasses(invalid), 'appearance-none pr-10', className)}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.75rem center',
              backgroundSize: '1.25rem',
            }}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </FormField>
    )
  },
)

// ---------------------------------------------------------------------------

export interface CheckboxFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'id' | 'type'
> {
  field: FieldHelp
  error?: string
}

/** Checkboxes put the label beside the box, with helper text underneath. */
export const CheckboxField = React.forwardRef<HTMLInputElement, CheckboxFieldProps>(
  function CheckboxField({ field, error, required, className, ...props }, ref) {
    const reactId = React.useId()
    const inputId = `check-${reactId}`
    const helpId = `${inputId}-help`
    const errorId = `${inputId}-error`
    const invalid = Boolean(error)

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        {/* The whole row is the tap target, not just the 20px box. */}
        <label
          htmlFor={inputId}
          className="flex min-h-[--size-touch] cursor-pointer items-start gap-3 py-1"
        >
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            aria-describedby={[helpId, invalid ? errorId : null].filter(Boolean).join(' ')}
            aria-invalid={invalid || undefined}
            required={required}
            className={cn(
              'mt-0.5 size-5 shrink-0 rounded-[--radius-sm] border-2 accent-brand-600',
              invalid ? 'border-danger-600' : 'border-border-strong',
            )}
            {...props}
          />
          <span className="text-base text-content-primary">
            {field.label}
            {required && (
              <span className="ml-0.5 text-danger-600" aria-hidden>
                *
              </span>
            )}
          </span>
        </label>

        <p id={helpId} className="ml-8 text-sm text-content-secondary">
          {field.helperText}
        </p>

        {invalid && (
          <p
            id={errorId}
            role="alert"
            className="ml-8 flex items-start gap-1.5 text-sm font-medium text-danger-700"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>
    )
  },
)

/** Groups related inputs under a heading, per the "logical sections" rule. */
export function FieldSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <section className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-content-primary">{title}</h2>
        {description && <p className="text-sm text-content-secondary">{description}</p>}
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  )
}
