import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { downloadPublicQuotationPdf } from '../services/quotationService';

export default function SharedQuotationDownload() {
  const { token } = useParams();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid download link.');
      return;
    }

    downloadPublicQuotationPdf(token)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'quotation.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus('done');
        setMessage('Your quotation PDF download should begin shortly.');
      })
      .catch((e) => {
        setStatus('error');
        setMessage(e.message || 'Could not download quotation.');
      });
  }, [token]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc', padding: 24, fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 32, maxWidth: 420, width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center',
      }}>
        <img src="/cropped_logo.png" alt="CA Rahul Gupta" style={{ height: 48, marginBottom: 16 }} onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 style={{ fontSize: 18, margin: '0 0 8px', color: '#1a3c6e' }}>Quotation download</h1>
        {status === 'loading' && <p style={{ color: '#64748b' }}>Preparing your document…</p>}
        {status === 'done' && <p style={{ color: '#166534' }}>{message}</p>}
        {status === 'error' && <p style={{ color: '#dc2626' }}>{message}</p>}
      </div>
    </div>
  );
}
