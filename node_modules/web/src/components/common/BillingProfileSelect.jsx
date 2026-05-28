import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getBillingProfiles, getBillingProfileByCode } from '../../constants/billingProfiles';

const MENU_Z = 11000;

function formatProfileLabel(p, showGstSuffix) {
  const base = `${p.code} – ${p.name}`;
  if (showGstSuffix && p.gstRegistered) return `${base} (GST)`;
  return base;
}

/**
 * Billing firm picker that wraps long names instead of widening native <select> menus.
 * Uses a fixed-position portal so lists are not clipped inside overflow:auto modals.
 */
export default function BillingProfileSelect({
  value,
  onChange,
  placeholder = '— Select Billing Profile —',
  style = {},
  disabled = false,
  showGstSuffix = false,
}) {
  const profiles = getBillingProfiles();
  const selected = value ? getBillingProfileByCode(value) : null;
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setMenuPos(null);
      return undefined;
    }
    const update = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const width = Math.min(Math.max(r.width, 200), vw - 16);
      const left = Math.min(Math.max(8, r.left), vw - width - 8);
      setMenuPos({
        left,
        top: r.bottom + 4,
        width,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function handleMouseDown(e) {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  const displayText = selected ? formatProfileLabel(selected, showGstSuffix) : placeholder;

  const buttonStyles = {
    margin: 0,
    WebkitAppearance: 'none',
    appearance: 'none',
    ...style,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? '#f1f5f9' : '#fff',
    opacity: disabled ? 0.75 : 1,
    textAlign: 'left',
    fontFamily: 'inherit',
    lineHeight: 1.35,
  };

  const itemBase = {
    display: 'block',
    width: '100%',
    margin: 0,
    padding: '10px 12px',
    border: 'none',
    borderBottom: '1px solid #f1f5f9',
    background: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: 13,
    color: '#334155',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: 1.35,
    fontFamily: 'inherit',
  };

  const maxH =
    menuPos && typeof window !== 'undefined'
      ? Math.min(320, window.innerHeight - menuPos.top - 12)
      : 320;

  const menu =
    open &&
    menuPos &&
    createPortal(
      <div
        ref={menuRef}
        role="listbox"
        style={{
          position: 'fixed',
          left: menuPos.left,
          top: menuPos.top,
          width: menuPos.width,
          maxHeight: maxH,
          overflowY: 'auto',
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          zIndex: MENU_Z,
        }}
      >
        <button
          type="button"
          role="option"
          aria-selected={!value}
          style={{
            ...itemBase,
            fontWeight: !value ? 600 : 400,
            color: !value ? '#0f172a' : '#64748b',
          }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('');
            setOpen(false);
          }}
        >
          {placeholder}
        </button>
        {profiles.map((p) => {
          const label = formatProfileLabel(p, showGstSuffix);
          const isSel = p.code === value;
          return (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={isSel}
              style={{
                ...itemBase,
                borderBottom: '1px solid #f8fafc',
                fontWeight: isSel ? 600 : 400,
                background: isSel ? '#f0f4ff' : '#fff',
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(p.code);
                setOpen(false);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={buttonStyles}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        <span style={{ flex: 1, whiteSpace: 'normal', wordBreak: 'break-word' }}>{displayText}</span>
        <span style={{ flexShrink: 0, color: '#64748b', fontSize: 11, lineHeight: '18px' }} aria-hidden>
          ▾
        </span>
      </button>
      {menu}
    </>
  );
}
