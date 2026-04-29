import { Link } from 'react-router-dom';

const VARIANTS = {
  primary: 'btn btn--primary',
  secondary: 'btn btn--secondary',
  ghost: 'btn btn--ghost',
  onDark: 'btn btn--on-dark',
};

const SIZES = {
  md: '',
  sm: 'btn--sm',
  lg: 'btn--lg',
};

/**
 * Polymorphic call-to-action button.
 *  - `to`   => internal route (uses <Link>)
 *  - `href` => external/anchor link (uses <a>)
 *  - else   => regular <button>
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  to,
  href,
  external = false,
  className = '',
  children,
  ...rest
}) {
  const cls = [VARIANTS[variant] || VARIANTS.primary, SIZES[size], className]
    .filter(Boolean)
    .join(' ');

  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a
        href={href}
        className={cls}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...rest}
      >
        {children}
      </a>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
