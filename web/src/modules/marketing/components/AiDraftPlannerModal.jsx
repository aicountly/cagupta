import { useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';

/**
 * Full-screen overlay showing live log lines from POST /generate-ai-drafts (SSE).
 * OpenAI “reasoning” is not streamed here — only server-side steps (topic, draft, DB, spacing).
 */
export default function AiDraftPlannerModal({
  open,
  lines,
  running,
  summary,
  errorMsg,
  onClose,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-planner-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(720px, 100%)',
          maxHeight: 'min(85vh, 640px)',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {running && (
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#F37920' }} />
            )}
            <div>
              <h2 id="ai-planner-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                AI blog planner
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                Live log from the server (steps and OpenAI status). Model reasoning is not streamed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            style={{
              border: 'none',
              background: running ? '#f1f5f9' : '#e2e8f0',
              borderRadius: 8,
              padding: 8,
              cursor: running ? 'not-allowed' : 'pointer',
              lineHeight: 0,
              color: '#475569',
            }}
            title={running ? 'Wait until generation finishes' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 14,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.55,
            background: '#0f172a',
            colorScheme: 'dark',
          }}
        >
          {lines.length === 0 && running && (
            <span style={{ color: '#94a3b8' }}>Connecting…</span>
          )}
          {lines.map((ln, i) => (
            <div key={`${i}-${ln.slice(0, 40)}`} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#e2e8f0' }}>
              {ln}
            </div>
          ))}
        </div>

        {(summary || errorMsg) && (
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid #e2e8f0',
              fontSize: 13,
              color: errorMsg ? '#b91c1c' : '#0f172a',
              background: errorMsg ? '#fef2f2' : '#f0fdf4',
            }}
          >
            <strong>{errorMsg ? 'Error' : 'Result'}</strong>
            {' — '}
            {errorMsg || summary}
          </div>
        )}
      </div>
    </div>
  );
}
