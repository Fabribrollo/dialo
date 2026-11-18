import './segmented.css';

export default function Segmented({ options, value, onChange, label, dark = false, className = '' }) {
  const total = options.reduce((s, o) => s + (o.weight ?? 1), 0);
  let before = 0;
  for (const o of options) {
    if (o.value === value) break;
    before += o.weight ?? 1;
  }
  const actual = options.find((o) => o.value === value);
  const lens = { left: `calc(4px + (100% - 8px) * ${before / total})`, width: `calc((100% - 8px) * ${(actual?.weight ?? 1) / total})` };

  return (
    <div className={`lg segm ${dark ? 'segm-dk' : ''} ${className}`} role="tablist" aria-label={label}>
      <span className={`lens lg segm-lens ${dark ? 'dk' : ''}`} style={lens} />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className="seg"
          style={{ flex: o.weight ?? 1 }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
