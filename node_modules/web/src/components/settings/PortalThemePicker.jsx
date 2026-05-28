import { useTheme } from '../../context/ThemeContext';
import { PORTAL_THEME_LIST } from '../../theme/portalThemes';
import { useNotification } from '../../context/NotificationContext';

function ThemePreviewCard({ theme, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(theme.id)}
      aria-pressed={selected}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: 0,
        border: selected ? `2px solid ${theme.primary}` : '2px solid #E6E8F0',
        borderRadius: 12,
        background: '#fff',
        cursor: 'pointer',
        overflow: 'hidden',
        boxShadow: selected ? `0 4px 16px rgba(${theme.primaryRgb}, 0.15)` : '0 1px 4px rgba(0,0,0,0.04)',
        textAlign: 'left',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <div style={{ display: 'flex', minHeight: 72, background: theme.bg }}>
        <div style={{ width: 48, background: theme.surface, borderRight: `1px solid ${theme.border}`, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ height: 6, borderRadius: 3, background: theme.primaryTint }} />
          <div style={{ height: 6, borderRadius: 3, background: theme.primary, opacity: 0.9 }} />
          <div style={{ height: 6, borderRadius: 3, background: theme.border }} />
        </div>
        <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: theme.primaryTint, border: `1px solid ${theme.border}` }} />
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: theme.border, maxWidth: 80 }} />
          </div>
          <div style={{ width: 64, height: 22, borderRadius: 6, background: theme.primary }} />
        </div>
      </div>
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1F3B', marginBottom: 2 }}>{theme.label}</div>
        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.35 }}>{theme.description}</div>
        {theme.id === 'classic_orange' && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Default</div>
        )}
      </div>
    </button>
  );
}

export default function PortalThemePicker({ compact = false }) {
  const { draftThemeId, themeId, isDirty, saving, selectTheme, resetDraft, saveTheme } = useTheme();
  const { addNotification } = useNotification();

  async function handleSave() {
    try {
      await saveTheme();
      addNotification('Portal theme saved as your default', 'info');
    } catch (err) {
      addNotification(err.message || 'Could not save theme', 'info');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 16 : 20 }}>
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: compact ? 16 : 18, fontWeight: 700, color: '#0B1F3B' }}>
          Portal color theme
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.45, maxWidth: 560 }}>
          Choose a soft accent color for navigation, buttons, and highlights across your portal.
          Your selection is saved as your personal default.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 14,
      }}>
        {PORTAL_THEME_LIST.map((theme) => (
          <ThemePreviewCard
            key={theme.id}
            theme={theme}
            selected={draftThemeId === theme.id}
            onSelect={selectTheme}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saving}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: !isDirty || saving ? '#cbd5e1' : 'var(--portal-primary)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            cursor: !isDirty || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save as default'}
        </button>
        {isDirty && (
          <button
            type="button"
            onClick={resetDraft}
            disabled={saving}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #E6E8F0',
              background: '#fff',
              color: '#475569',
              fontWeight: 600,
              fontSize: 13,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
        )}
        {!isDirty && themeId && (
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Current default: {PORTAL_THEME_LIST.find((t) => t.id === themeId)?.label || 'Classic Orange'}
          </span>
        )}
      </div>
    </div>
  );
}
