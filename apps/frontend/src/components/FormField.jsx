import { useId } from 'react';

export default function FormField({ label, error, as: Control = 'input', ...props }) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <Control id={id} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...props} />
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
