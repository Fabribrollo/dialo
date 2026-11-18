import { useId, useState } from 'react';
import Icon from './Icon.jsx';
import './field.css';

export default function Field({ label, error, note, maxLength, as: Control = 'input', suffix, children, className = '', ...props }) {
  const id = useId();
  const pieId = `${id}-pie`;
  const length = String(props.value ?? '').length;
  const showCounter = Control === 'textarea' && maxLength;
  const pie = error || note || showCounter;

  return (
    <div className={`fld ${className}`}>
      <label className="fl" htmlFor={id}>{label}</label>
      <span className={`inp inp-${Control} ${error ? 'inp-error' : ''} ${props.disabled ? 'inp-disabled' : ''}`}>
        <Control id={id} maxLength={maxLength} aria-invalid={Boolean(error)} aria-describedby={pie ? pieId : undefined} {...props}>
          {children}
        </Control>
        {Control === 'select' && <Icon name="chevron" size={18} stroke={2} />}
        {suffix}
      </span>
      {error ? (
        <span id={pieId} className="fld-error"><Icon name="error" size={15} stroke={2} />{error}</span>
      ) : note ? (
        <span id={pieId} className="fld-note">{note}</span>
      ) : showCounter ? (
        <span id={pieId} className="fld-note">{length} / {maxLength}</span>
      ) : null}
    </div>
  );
}

export function PasswordField(props) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      {...props}
      type={visible ? 'text' : 'password'}
      suffix={
        <button type="button" className="fld-eye pr" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible((v) => !v)}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>
        </button>
      }
    />
  );
}

export function CheckField({ label, checked, onChange, ...props }) {
  return (
    <label className="chkf">
      <input type="checkbox" className="chkf-input" checked={checked} onChange={onChange} {...props} />
      <span className="chk" aria-hidden="true">{checked && <Icon name="check" size={15} stroke={2.6} />}</span>
      <span className="chkf-label">{label}</span>
    </label>
  );
}
