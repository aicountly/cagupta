import { useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';

/**
 * Full-screen overlay with live OpenAI deltas (reasoning/content when the API emits them),
 * plus server planner log lines from SSE.
 */
export default function AiDraftPlannerModal({
  open,
  serverLines,
  modelReasoning,
  modelAssistant,
  running,
  summary,
  errorMsg,
  onClose,
}) {
  const logRef = useRef(null);
  const reasoningRef = useRef(null);
  const assistantRef = useRef(null);

  useEffect(() => {
    const scroll = (r) => {
      const el = r.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    };
    scroll(logRef);
    scroll(reasoningRef);
    scroll(assistantRef);
  }, [serverLines, modelReasoning, modelAssistant, open]);

  if (!open) return null;

  const showConnecting = running
    && serverLines.length === 0
    && !modelReasoning
    && !modelAssistant;

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
          width: 'min(900px, 100%)',
          maxHeight: 'min(88vh, 680px)',
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
                Model stream (Chat Completions) when available; reasoning fields depend on the model.
                Separate panel shows server-side steps (DB, spacing).
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
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            gap: 0,
          }}
        >
          {/* Model stream row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 1,
              minHeight: 140,
              maxHeight: '32vh',
              borderBottom: '1px solid #1e293b',
            }}
          >
            <div style={{ background: '#1e1b4b', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#c4b5fd', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                Reasoning hints
              </div>
              <pre
                ref={reasoningRef}
                style={{
                  flex: 1,
                  margin: 0,
                  padding: '0 10px 10px',
                  overflow: 'auto',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: '#ddd6fe',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {modelReasoning || '\u200b'}
              </pre>
            </div>
            <div style={{ background: '#0f172a', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#93c5fd', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                Model output tokens
              </div>
              <pre
                ref={assistantRef}
                style={{
                  flex: 1,
                  margin: 0,
                  padding: '0 10px 10px',
                  overflow: 'auto',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: '#e2e8f0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {modelAssistant || '\u200b'}
              </pre>
            </div>
          </div>

          {/* Server log */}
          <div
            ref={logRef}
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              lineHeight: 1.55,
              background: '#020617',
              colorScheme: 'dark',
              minHeight: 120,
            }}
          >
            {showConnecting && (
              <span style={{ color: '#94a3b8' }}>Connecting…</span>
            )}
            {serverLines.map((ln, i) => (
              <div
                key={`${i}-${ln.slice(0, 36)}`}
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: '#cbd5e1',
                  paddingBottom: 2,
                }}
              >
                {ln}
              </div>
            ))}
          </div>
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
