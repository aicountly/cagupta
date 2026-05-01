/**
 * ShareButton — Inline share icon button that opens the ShareModal.
 *
 * Usage:
 *   <ShareButton
 *     documentId={doc.id}
 *     documentName={doc.filename}
 *     clientId={client.id}
 *     clientEmail={client.email}
 *     clientMobile={client.mobile}
 *   />
 */
import { useState } from 'react';
import { Share2 } from 'lucide-react';
import ShareModal from './ShareModal';

export default function ShareButton({
  documentId,
  documentName,
  clientId,
  clientName,
  clientEmail,
  clientMobile,
  size = 14,
  style: extraStyle = {},
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Share document"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '4px 8px', cursor: 'pointer', color: '#64748b',
          transition: 'all 0.15s',
          ...extraStyle,
        }}
      >
        <Share2 size={size} />
      </button>
      <ShareModal
        open={open}
        onClose={() => setOpen(false)}
        documentId={documentId}
        documentName={documentName}
        clientId={clientId}
        clientName={clientName}
        clientEmail={clientEmail}
        clientMobile={clientMobile}
      />
    </>
  );
}
