import { useEffect, useState } from 'react';
import { Mail, Smartphone, MessageSquare, Send, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { buildQuotationPdfBlob, downloadQuotationPdf } from '../../utils/quotationPdfExport';
import { shareLeadQuotation } from '../../modules/crm/services/quotationService';
import logoSrc from '../../assets/cropped_logo.png';

const CHANNELS = [
  { id: 'email', label: 'Email', icon: Mail, color: '#2563eb', bg: '#eff6ff', desc: 'PDF attached + secure download link' },
  { id: 'sms', label: 'SMS', icon: Smartphone, color: '#7c3aed', bg: '#f5f3ff', desc: 'Send download link via SMS' },
  { id: 'wa_web', label: 'WA Web', icon: MessageSquare, color: '#16a34a', bg: '#f0fdf4', desc: 'Send via connected WhatsApp session' },
  { id: 'wa_api', label: 'WA API', icon: MessageSquare, color: 'var(--portal-primary)', bg: 'var(--portal-primary-tint)', desc: 'WhatsApp Business API' },
];

export default function QuotationShareModal({
  open,
  onClose,
  lead,
  quotation,
  onShared,
}) {
  const [channel, setChannel] = useState('email');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientMobile, setRecipientMobile] = useState('');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open || !lead || !quotation) return;
    setRecipientName(lead.contactName || '');
    setRecipientEmail(lead.email || '');
    setRecipientMobile(lead.phone || '');
    setResult(null);
    setChannel('email');
  }, [open, lead, quotation]);

  useEffect(() => {
    if (!open || !lead || !quotation) {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      return undefined;
    }

    let cancelled = false;
    setPdfLoading(true);

    buildQuotationPdfBlob({
      contactName: lead.contactName,
      engagementTypeName: quotation.engagement_type_name || lead.engagementTypeName || '',
      snapshot: quotation.pricing_snapshot,
      documents: quotation.documents_required || [],
      logoSrc,
    })
      .then((blob) => {
        if (cancelled) return;
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!cancelled) setPdfUrl(null);
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id, quotation?.id, quotation?.updated_at]);

  if (!open || !lead || !quotation) return null;

  async function handleDownload() {
    await downloadQuotationPdf({
      contactName: lead.contactName,
      engagementTypeName: quotation.engagement_type_name || lead.engagementTypeName || '',
      snapshot: quotation.pricing_snapshot,
      documents: quotation.documents_required || [],
      logoSrc,
    });
  }

  async function handleShare() {
    if ((channel === 'email' || channel === 'wa_api') && !recipientEmail && !recipientMobile) {
      setResult({ success: false, message: 'Please enter recipient email or mobile.' });
      return;
    }
    if ((channel === 'sms' || channel === 'wa_web') && !recipientMobile) {
      setResult({ success: false, message: 'Please enter recipient mobile number.' });
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const blob = await buildQuotationPdfBlob({
        contactName: lead.contactName,
        engagementTypeName: quotation.engagement_type_name || lead.engagementTypeName || '',
        snapshot: quotation.pricing_snapshot,
        documents: quotation.documents_required || [],
        logoSrc,
      });

      const fd = new FormData();
      fd.append('pdf', blob, 'quotation.pdf');
      fd.append('channel', channel);
      fd.append('recipient_name', recipientName);
      fd.append('recipient_email', recipientEmail);
      fd.append('recipient_mobile', recipientMobile);

      const data = await shareLeadQuotation(lead.id, quotation.id, fd);
      setResult({
        success: true,
        message: `Quotation shared via ${CHANNELS.find((c) => c.id === channel)?.label || channel}!`,
        shareUrl: data?.share_url,
      });
      onShared?.();
    } catch (e) {
      setResult({ success: false, message: e.message || 'Failed to share quotation.' });
    } finally {
      setSending(false);
    }
  }

  const selectedChannel = CHANNELS.find((c) => c.id === channel);

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalBox}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>View / Share PDF</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              {lead.contactName} — merged quotation &amp; document checklist
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 360 }}>
          <div style={previewPane}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>PDF preview</span>
              <button type="button" onClick={handleDownload} style={downloadBtn}>
                <Download size={14} /> Download
              </button>
            </div>
            {pdfLoading && <div style={{ color: '#64748b', fontSize: 13, padding: 24 }}>Generating preview…</div>}
            {!pdfLoading && pdfUrl && (
              <iframe title="Quotation PDF preview" src={pdfUrl} style={iframeStyle} />
            )}
            {!pdfLoading && !pdfUrl && (
              <div style={{ color: '#dc2626', fontSize: 13, padding: 24 }}>Could not generate PDF preview.</div>
            )}
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', margin: '0 0 8px' }}>Share via</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                const active = channel === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChannel(c.id)}
                    style={{
                      ...channelBtn,
                      borderColor: active ? c.color : '#e2e8f0',
                      background: active ? c.bg : '#fff',
                    }}
                  >
                    <Icon size={16} color={c.color} />
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{c.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedChannel && (
              <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 12px' }}>{selectedChannel.desc}</p>
            )}

            <label style={labelStyle}>Recipient name</label>
            <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} style={inputStyle} />

            {(channel === 'email' || channel === 'wa_api') && (
              <>
                <label style={labelStyle}>Email</label>
                <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} style={inputStyle} />
              </>
            )}

            {(channel === 'sms' || channel === 'wa_web' || channel === 'wa_api') && (
              <>
                <label style={labelStyle}>Mobile</label>
                <input type="tel" value={recipientMobile} onChange={(e) => setRecipientMobile(e.target.value)} style={inputStyle} />
              </>
            )}

            {result && (
              <div style={{
                ...resultBox,
                background: result.success ? '#f0fdf4' : '#fef2f2',
                borderColor: result.success ? '#86efac' : '#fecaca',
                color: result.success ? '#166534' : '#991b1b',
              }}>
                {result.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{result.message}</div>
                  {result.shareUrl && (
                    <div style={{ fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>{result.shareUrl}</div>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleShare}
              disabled={sending || pdfLoading}
              style={sendBtn}
            >
              <Send size={15} />
              {sending ? 'Sending…' : 'Send to client'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const modalBox = {
  background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 920,
  maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
};
const closeBtn = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' };
const previewPane = {
  border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#f8fafc',
  display: 'flex', flexDirection: 'column', minHeight: 320,
};
const iframeStyle = { flex: 1, width: '100%', minHeight: 280, border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff' };
const downloadBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
  background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
};
const channelBtn = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8,
  border: '2px solid #e2e8f0', cursor: 'pointer', background: '#fff',
};
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, marginTop: 8 };
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6,
  border: '1px solid #cbd5e1', fontSize: 13,
};
const resultBox = {
  display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 8,
  border: '1px solid', marginTop: 12, marginBottom: 8,
};
const sendBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, width: '100%',
  justifyContent: 'center', padding: '10px 16px', borderRadius: 8, border: 'none',
  background: 'var(--portal-primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
};
