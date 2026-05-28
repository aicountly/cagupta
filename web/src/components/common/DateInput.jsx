import { forwardRef } from 'react';

function openDatePicker(el) {
  if (typeof el?.showPicker !== 'function') return;
  try {
    el.showPicker();
  } catch {
    /* insecure context / not allowed */
  }
}

const DateInput = forwardRef(function DateInput({ onClick, onFocus, className, ...props }, ref) {
  const handleClick = (e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    openDatePicker(e.currentTarget);
  };

  const handleFocus = (e) => {
    onFocus?.(e);
    if (e.defaultPrevented) return;
    openDatePicker(e.currentTarget);
  };

  const mergedClassName = ['date-input-clickable', className].filter(Boolean).join(' ');

  return (
    <input
      ref={ref}
      type="date"
      {...props}
      className={mergedClassName}
      onClick={handleClick}
      onFocus={handleFocus}
    />
  );
});

export default DateInput;
