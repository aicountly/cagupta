export function isPricingFinalized(q) {
  if (!q) return false;
  if (q.shareable_quotation != null) return Boolean(q.shareable_quotation);
  return q.status === 'final' || q.status === 'sent';
}

export function isDocumentShareable(q) {
  if (!q) return false;
  if (q.shareable_documents != null) return Boolean(q.shareable_documents);
  const docFinal = q.documents_status === 'final';
  const docs = Array.isArray(q.documents_required) ? q.documents_required : [];
  return docFinal && docs.some((d) => String(d).trim());
}

export function isPdfShareable(q) {
  if (!q) return false;
  if (q.shareable != null) return Boolean(q.shareable);
  return isDocumentShareable(q);
}

export function shouldIncludeQuotationInPdf(q) {
  return isPricingFinalized(q);
}

export function pdfShareModeLabel(q) {
  if (shouldIncludeQuotationInPdf(q)) {
    return 'quotation & document checklist';
  }
  return 'document checklist';
}

export function isQuotationShareable(q) {
  if (!q) return false;
  if (q.shareable) return true;
  return isPricingFinalized(q) && isDocumentShareable(q);
}
