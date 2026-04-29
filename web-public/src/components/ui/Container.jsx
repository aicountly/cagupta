export default function Container({ as: Tag = 'div', className = '', children, ...rest }) {
  const cls = className ? `container ${className}` : 'container';
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
