import { forwardRef } from 'react';

/** Keep only digits and at most one decimal point with up to 2 fractional digits. */
function sanitizeAmount(raw) {
  if (raw === '') return '';
  const cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  const whole = cleaned.slice(0, dot);
  const frac = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return `${whole}.${frac}`;
}

const AmountInput = forwardRef(function AmountInput({ value, onChange, ...props }, ref) {
  const handleChange = (e) => {
    const next = sanitizeAmount(e.target.value);
    if (next === e.target.value) {
      onChange?.(e);
      return;
    }
    onChange?.({ ...e, target: { ...e.target, value: next } });
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value ?? ''}
      onChange={handleChange}
      {...props}
    />
  );
});

export default AmountInput;
