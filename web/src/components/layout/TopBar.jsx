export default function TopBar({ title }) {
  return (
    <header style={styles.bar}>
      <h1 style={styles.title}>{title}</h1>
      <div style={styles.right}>
        <span style={styles.badge}>🔔</span>
        <span style={styles.env}>Prototype — Mock Data</span>
      </div>
    </header>
  );
}

const styles = {
  bar: { height: 56, background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 },
  title: { margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' },
  right: { display: 'flex', alignItems: 'center', gap: 16 },
  badge: { fontSize: 18, cursor: 'pointer' },
  env: { fontSize: 11, background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 4, fontWeight: 600 },
};
