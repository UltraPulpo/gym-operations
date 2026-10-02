import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import styles from './shared.module.css';

export type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'danger';
};

export function Button({
  type = 'button',
  variant = 'primary',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={[styles.button, styles[variant], className]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

export type LinkProps = ComponentProps<'a'> & { href: string };

export function Link({ className, ...props }: LinkProps) {
  return (
    <a
      {...props}
      className={[styles.link, className].filter(Boolean).join(' ')}
    />
  );
}

export interface FieldFeedbackProps {
  label: string;
  hint?: string;
  error?: string;
}

export type InputFieldProps = Omit<
  ComponentProps<'input'>,
  'children' | 'type'
> &
  FieldFeedbackProps & {
    type?:
      | 'text'
      | 'email'
      | 'number'
      | 'tel'
      | 'url'
      | 'search'
      | 'date'
      | 'time'
      | 'datetime-local';
  };
export type SelectFieldProps = ComponentProps<'select'> & FieldFeedbackProps;
export type TextareaFieldProps = ComponentProps<'textarea'> &
  FieldFeedbackProps;
export type CheckboxFieldProps = Omit<
  ComponentProps<'input'>,
  'children' | 'type'
> &
  FieldFeedbackProps;

function useFieldIds(
  id: string | undefined,
  hint: string | undefined,
  error: string | undefined,
  describedBy: string | undefined,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return {
    id: fieldId,
    hintId: `${fieldId}-hint`,
    errorId: `${fieldId}-error`,
    describedBy:
      [describedBy, hint && `${fieldId}-hint`, error && `${fieldId}-error`]
        .filter(Boolean)
        .join(' ') || undefined,
  };
}

function FieldFeedback({
  hint,
  error,
  hintId,
  errorId,
}: Pick<FieldFeedbackProps, 'hint' | 'error'> & {
  hintId: string;
  errorId: string;
}) {
  return (
    <>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </>
  );
}

export function InputField({
  label,
  hint,
  error,
  id,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: InputFieldProps) {
  const ids = useFieldIds(id, hint, error, describedBy);
  return (
    <div className={styles.field}>
      <label htmlFor={ids.id}>{label}</label>
      <input
        {...props}
        id={ids.id}
        className={[styles.control, className].filter(Boolean).join(' ')}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : invalid}
      />
      <FieldFeedback {...ids} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  id,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: SelectFieldProps) {
  const ids = useFieldIds(id, hint, error, describedBy);
  return (
    <div className={styles.field}>
      <label htmlFor={ids.id}>{label}</label>
      <select
        {...props}
        id={ids.id}
        className={[styles.control, className].filter(Boolean).join(' ')}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : invalid}
      />
      <FieldFeedback {...ids} hint={hint} error={error} />
    </div>
  );
}

export function TextareaField({
  label,
  hint,
  error,
  id,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: TextareaFieldProps) {
  const ids = useFieldIds(id, hint, error, describedBy);
  return (
    <div className={styles.field}>
      <label htmlFor={ids.id}>{label}</label>
      <textarea
        {...props}
        id={ids.id}
        className={[styles.control, className].filter(Boolean).join(' ')}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : invalid}
      />
      <FieldFeedback {...ids} hint={hint} error={error} />
    </div>
  );
}

export function CheckboxField({
  label,
  hint,
  error,
  id,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: CheckboxFieldProps) {
  const ids = useFieldIds(id, hint, error, describedBy);
  return (
    <div className={styles.field}>
      <div className={styles.checkbox}>
        <input
          {...props}
          type="checkbox"
          id={ids.id}
          className={className}
          aria-describedby={ids.describedBy}
          aria-invalid={error ? true : invalid}
        />
        <label htmlFor={ids.id}>{label}</label>
      </div>
      <FieldFeedback {...ids} hint={hint} error={error} />
    </div>
  );
}

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  caption: string;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  emptyMessage?: string;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  emptyMessage = 'No records to display.',
}: DataTableProps<T>) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export interface DataListProps {
  label: string;
  items: readonly { id: string; content: ReactNode }[];
  emptyMessage?: string;
}

export function DataList({
  label,
  items,
  emptyMessage = 'No items to display.',
}: DataListProps) {
  return items.length ? (
    <ul aria-label={label} className={styles.list}>
      {items.map((item) => (
        <li key={item.id}>{item.content}</li>
      ))}
    </ul>
  ) : (
    <p role="status">{emptyMessage}</p>
  );
}
