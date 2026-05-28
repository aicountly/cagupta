import { useCallback, useEffect, useState } from 'react';
import {
  fetchWorkHoldContact,
  fetchWorkHoldOrganization,
  updateWorkHoldContact,
  updateWorkHoldOrganization,
  createWorkHoldExceptionContact,
  createWorkHoldExceptionOrganization,
  deleteWorkHoldException,
} from '../services/workHoldService';
import DestructiveConfirmModal from '../../../components/common/DestructiveConfirmModal';

const card = {
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 1px 4px rgba(0,0,0,.06)',
  border: '1px solid #E6E8F0',
  padding: 20,
  marginBottom: 16,
};

const title = { fontSize: 13, fontWeight: 700, color: '#0B1F3B', marginBottom: 12 };
const muted = { fontSize: 12, color: '#64748b', marginBottom: 8 };
const btnPrimary = {
  padding: '8px 16px',
  background: 'var(--portal-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
const btnGhost = {
  padding: '8px 16px',
  background: '#fff',
  color: '#64748b',
  border: '1px solid #E6E8F0',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
const input = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #E6E8F0',
  borderRadius: 8,
  fontSize: 13,
  boxSizing: 'border-box',
};

function formatTs(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function windowExpired(row) {
  if ((row.exception_kind || '') !== 'window' || !row.expires_at) return false;
  return new Date(row.expires_at) <= new Date();
}

/**
 * @param {{ variant: 'contact'|'organization', entityId: number, canMutate: boolean }} props
 */
export default function WorkHoldSection({ variant, entityId, canMutate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [exKind, setExKind] = useState('service');
  const [exServiceId, setExServiceId] = useState('');
  const [exExpiresLocal, setExExpiresLocal] = useState('');
  const [revokeExceptionId, setRevokeExceptionId] = useState(null);
  const [revokeExceptionBusy, setRevokeExceptionBusy] = useState(false);
  const [revokeExceptionErr, setRevokeExceptionErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const payload =
        variant === 'contact'
          ? await fetchWorkHoldContact(entityId)
          : await fetchWorkHoldOrganization(entityId);
      setData(payload);
    } catch (e) {
      setErr(e.message || 'Could not load work hold.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [variant, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hold = data?.hold;
  const exceptions = data?.exceptions || [];
  const audit = data?.audit || [];

  async function onSetHold(active) {
    setBusy(true);
    setErr(null);
    try {
      const body = { active, notes: active ? (notes.trim() || null) : undefined };
      const next =
        variant === 'contact'
          ? await updateWorkHoldContact(entityId, body)
          : await updateWorkHoldOrganization(entityId, body);
      setData(next);
      if (!active) setNotes('');
    } catch (e) {
      setErr(e.message || 'Update failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onAddException(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (exKind === 'service') {
        const sid = parseInt(exServiceId, 10);
        if (!Number.isFinite(sid) || sid <= 0) {
          setErr('Enter a valid service ID.');
          setBusy(false);
          return;
        }
        const body = { exception_kind: 'service', service_id: sid, notes: null };
        if (variant === 'contact') {
          await createWorkHoldExceptionContact(entityId, body);
        } else {
          await createWorkHoldExceptionOrganization(entityId, body);
        }
      } else {
        if (!exExpiresLocal) {
          setErr('Choose an expiry date/time for the window.');
          setBusy(false);
          return;
        }
        const iso = new Date(exExpiresLocal).toISOString();
        const body = { exception_kind: 'window', expires_at: iso, notes: null };
        if (variant === 'contact') {
          await createWorkHoldExceptionContact(entityId, body);
        } else {
          await createWorkHoldExceptionOrganization(entityId, body);
        }
      }
      await load();
      setExServiceId('');
      setExExpiresLocal('');
    } catch (ex) {
      setErr(ex.message || 'Could not add exception.');
    } finally {
      setBusy(false);
    }
  }

  async function executeRevokeException() {
    if (revokeExceptionId == null) return;
    setRevokeExceptionBusy(true);
    setRevokeExceptionErr('');
    setErr(null);
    try {
      await deleteWorkHoldException(revokeExceptionId);
      setRevokeExceptionId(null);
      await load();
    } catch (ex) {
      setRevokeExceptionErr(ex.message || 'Could not remove exception.');
    } finally {
      setRevokeExceptionBusy(false);
    }
  }

  function openRevokeException(id) {
    setRevokeExceptionErr('');
    setRevokeExceptionId(id);
  }

  if (loading && !data) {
    return (
      <div style={card}>
        <p style={muted}>Loading work hold…</p>
      </div>
    );
  }

  return (
    <>
    <div>
      {err && (
        <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
          {err}
        </div>
      )}

      <div style={card}>
        <div style={title}>Work hold status</div>
        <p style={muted}>
          When active, new engagements and timesheets are blocked unless Accounts adds a temporary exception (one service
          or a time window).
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 999,
              background: hold?.active ? '#fef3c7' : '#dcfce7',
              color: hold?.active ? '#92400e' : '#166534',
            }}
          >
            {hold?.active ? 'On hold' : 'Not on hold'}
          </span>
          {hold?.set_at && (
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Since {formatTs(hold.set_at)}
              {hold?.set_by_name ? ` · ${hold.set_by_name}` : ''}
            </span>
          )}
        </div>
        {hold?.notes ? (
          <div style={{ fontSize: 13, color: '#334155', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{hold.notes}</div>
        ) : null}

        {canMutate && (
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Notes (shown when activating hold)
            </label>
            <textarea
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              rows={3}
              style={{ ...input, resize: 'vertical', minHeight: 72 }}
              placeholder="Reason or reference for Accounts…"
              disabled={busy}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }} disabled={busy || hold?.active} onClick={() => void onSetHold(true)}>
                Place on hold
              </button>
              <button type="button" style={{ ...btnGhost, opacity: busy ? 0.7 : 1 }} disabled={busy || !hold?.active} onClick={() => void onSetHold(false)}>
                Release hold
              </button>
            </div>
          </div>
        )}

        {!canMutate && (
          <p style={{ ...muted, marginTop: 8, marginBottom: 0 }}>
            Only Super Admin or Accounts can change work hold. You can view status and exceptions here.
          </p>
        )}
      </div>

      <div style={card}>
        <div style={title}>Temporary exceptions</div>
        {exceptions.length === 0 ? (
          <p style={muted}>No exceptions recorded.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '6px 8px' }}>Kind</th>
                  <th style={{ padding: '6px 8px' }}>Detail</th>
                  <th style={{ padding: '6px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {exceptions.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid #f1f5f9', color: windowExpired(row) ? '#94a3b8' : '#334155' }}>
                    <td style={{ padding: '8px' }}>{row.exception_kind}</td>
                    <td style={{ padding: '8px' }}>
                      {row.exception_kind === 'service' ? `Service #${row.service_id}` : `Until ${formatTs(row.expires_at)}`}
                      {windowExpired(row) ? ' (expired)' : ''}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      {canMutate && (
                        <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: 12 }} disabled={busy || revokeExceptionBusy} onClick={() => openRevokeException(row.id)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canMutate && hold?.active && (
          <form onSubmit={onAddException} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Add exception</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ fontSize: 12 }}>
                Kind
                <select value={exKind} onChange={(ev) => setExKind(ev.target.value)} style={{ ...input, marginTop: 4, display: 'block', maxWidth: 200 }} disabled={busy}>
                  <option value="service">One service (by ID)</option>
                  <option value="window">Time window</option>
                </select>
              </label>
              {exKind === 'service' ? (
                <label style={{ fontSize: 12, flex: '1 1 160px' }}>
                  Service ID
                  <input value={exServiceId} onChange={(ev) => setExServiceId(ev.target.value)} style={{ ...input, marginTop: 4 }} disabled={busy} placeholder="e.g. 1234" />
                </label>
              ) : (
                <label style={{ fontSize: 12, flex: '1 1 220px' }}>
                  Expires (local)
                  <input type="datetime-local" value={exExpiresLocal} onChange={(ev) => setExExpiresLocal(ev.target.value)} style={{ ...input, marginTop: 4 }} disabled={busy} />
                </label>
              )}
              <button type="submit" style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }} disabled={busy}>
                Add
              </button>
            </div>
          </form>
        )}
      </div>

      <div style={card}>
        <div style={title}>Audit log</div>
        {audit.length === 0 ? (
          <p style={muted}>No audit entries yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 280, overflowY: 'auto' }}>
            {audit.map((a) => (
              <li key={a.id} style={{ fontSize: 12, padding: '8px 0', borderBottom: '1px solid #f8fafc', color: '#475569' }}>
                <strong style={{ color: '#0f172a' }}>{a.action}</strong>
                <span style={{ color: '#94a3b8', marginLeft: 8 }}>{formatTs(a.created_at)}</span>
                {a.actor_name ? <span style={{ marginLeft: 8 }}>· {a.actor_name}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>

    <DestructiveConfirmModal
      open={revokeExceptionId != null}
      title="Remove work-hold exception?"
      tone="warning"
      confirmLabel="Remove"
      busy={revokeExceptionBusy}
      error={revokeExceptionErr}
      onClose={() => !revokeExceptionBusy && setRevokeExceptionId(null)}
      onConfirm={executeRevokeException}
    >
      <p style={{ margin: 0 }}>
        Clients on work hold resume normal blocking rules for this scope after the exception is removed.
      </p>
    </DestructiveConfirmModal>
    </>
  );
}