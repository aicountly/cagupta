import { forwardRef } from 'react';

const DateInput = forwardRef(function DateInput({ onClick, ...props }, ref) {
  const handleClick = (e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    const el = e.currentTarget;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
      } catch {
        /* insecure context / not allowed */
      }
    }
  };

  return <input ref={ref} type="date" {...props} onClick={handleClick} />;
});

export default DateInput;
