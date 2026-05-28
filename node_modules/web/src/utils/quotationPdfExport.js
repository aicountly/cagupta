import jsPDF from 'jspdf';
import {
  PRICING_MODELS,
  FEE_TYPES,
  nullableNum,
  computeTotal,
} from './quotationPricing';

const NAVY = [26, 60, 110];
const ORANGE = [243, 121, 32];
const SLATE = [71, 85, 105];
const TEXT = [15, 23, 42];

function formatInrPdf(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return '—';
  const amt = x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Rs.\u00A0${amt}`;
}

function safeFilePart(s) {
  const t = String(s || 'Client')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 72);
  return t || 'Client';
}

async function fetchLogoDataUrl(logoSrc) {
  if (!logoSrc) return null;
  try {
    const res = await fetch(logoSrc);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function describeAdditionalItem(item) {
  const parts = [];
  const feeType = item.fee_type || FEE_TYPES.FIXED;
  if (feeType === FEE_TYPES.FIXED || feeType === FEE_TYPES.BOTH) {
    const fixed = nullableNum(item.fixed_amount);
    if (fixed != null && fixed > 0) parts.push(`${formatInrPdf(fixed)} per event`);
  }
  if (feeType === FEE_TYPES.HOURLY || feeType === FEE_TYPES.BOTH) {
    const rate = nullableNum(item.hourly_rate);
    if (rate != null && rate > 0) parts.push(`${formatInrPdf(rate)}/hr`);
  }
  return parts.join(' + ');
}

function buildPricingLines(snapshot) {
  const lines = [];
  const model = snapshot?.pricing_model || PRICING_MODELS.FIXED;

  if (model === PRICING_MODELS.FIXED) {
    lines.push(['Professional fee', formatInrPdf(nullableNum(snapshot.base_amount))]);
  } else if (model === PRICING_MODELS.PER_HOUR) {
    lines.push(['Hourly rate', `${formatInrPdf(nullableNum(snapshot.hourly_rate))}/hr`]);
    const hours = nullableNum(snapshot.estimated_hours);
    if (hours != null && hours > 0) {
      lines.push(['Estimated hours', String(hours)]);
    }
    const total = computeTotal(snapshot);
    if (total != null) lines.push(['Estimated total', formatInrPdf(total)]);
  } else if (model === PRICING_MODELS.FIXED_PLUS) {
    lines.push(['Base fee', formatInrPdf(nullableNum(snapshot.base_amount))]);
    for (const item of snapshot.additional_items || []) {
      if (!item.label) continue;
      const desc = describeAdditionalItem(item);
      if (!desc) continue;
      const label = item.include_in_share
        ? `Included: ${item.label}`
        : `Additional if ${item.label} occurs`;
      lines.push([label, desc]);
    }
    const total = computeTotal(snapshot);
    if (total != null) {
      lines.push(['Quoted total (included items)', formatInrPdf(total)]);
    }
  }

  return lines;
}

function addPageFooter(doc, pageW, margin) {
  const pageH = doc.internal.pageSize.getHeight();
  const pageNum = doc.internal.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  doc.text(
    'CA Rahul Gupta | Rahul B Gupta & Co. | office@carahulgupta.in',
    pageW / 2,
    pageH - 10,
    { align: 'center' },
  );
  doc.text(`Page ${pageNum}`, pageW - margin, pageH - 10, { align: 'right' });
}

function drawSectionTitle(doc, y, margin, pageW, title) {
  doc.setFillColor(...NAVY);
  doc.rect(margin, y, pageW - margin * 2, 8, 'F');
  doc.setFillColor(...ORANGE);
  doc.rect(margin, y, 3, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(title, margin + 6, y + 5.5);
  return y + 14;
}

/**
 * Build branded quotation + documents PDF as Blob.
 */
export async function buildQuotationPdfBlob({
  contactName,
  engagementTypeName,
  snapshot,
  documents = [],
  logoSrc,
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  let y = margin;

  const logoDataUrl = await fetchLogoDataUrl(logoSrc);
  const imgH = 16;
  const imgW = 44;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', margin, y, imgW, imgH);
    } catch {
      try {
        doc.addImage(logoDataUrl, 'JPEG', margin, y, imgW, imgH);
      } catch { /* skip */ }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...TEXT);
  doc.text('CA Rahul Gupta', margin + imgW + 6, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text('Rahul B Gupta & Co.', margin + imgW + 6, y + 12);
  doc.text('Chartered Accountants', margin + imgW + 6, y + 17);

  y += imgH + 6;
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text('Quotation & Document Checklist', margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...SLATE);
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`Prepared for: ${contactName || 'Client'}`, margin, y);
  y += 5;
  if (engagementTypeName) {
    doc.text(`Engagement: ${engagementTypeName}`, margin, y);
    y += 5;
  }
  doc.text(`Date: ${today}`, margin, y);
  y += 10;

  y = drawSectionTitle(doc, y, margin, pageW, 'Quotation');

  const pricingLines = buildPricingLines(snapshot);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT);

  for (const [label, value] of pricingLines) {
    if (y > pageH - 30) {
      addPageFooter(doc, pageW, margin);
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold');
    doc.text(String(label), margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), pageW - margin, y, { align: 'right' });
    y += 7;
  }

  y += 4;
  const docLines = (documents || []).map((d) => String(d).trim()).filter(Boolean);

  if (docLines.length) {
    if (y > pageH - 40) {
      addPageFooter(doc, pageW, margin);
      doc.addPage();
      y = margin;
    }
    y = drawSectionTitle(doc, y, margin, pageW, 'Documents Required');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    doc.text('Please provide the following documents to proceed with the engagement:', margin, y);
    y += 8;

    docLines.forEach((line, idx) => {
      if (y > pageH - 25) {
        addPageFooter(doc, pageW, margin);
        doc.addPage();
        y = margin;
      }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...ORANGE);
      doc.text(`${idx + 1}.`, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...TEXT);
      const wrapped = doc.splitTextToSize(line, pageW - margin * 2 - 10);
      doc.text(wrapped, margin + 8, y);
      y += wrapped.length * 5 + 3;
    });
  }

  y += 6;
  if (y > pageH - 35) {
    addPageFooter(doc, pageW, margin);
    doc.addPage();
    y = margin;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  const note = doc.splitTextToSize(
    'This quotation is valid for 30 days from the date above unless otherwise agreed. '
    + 'Fees are exclusive of applicable taxes and out-of-pocket expenses unless stated.',
    pageW - margin * 2,
  );
  doc.text(note, margin, y);

  addPageFooter(doc, pageW, margin);

  return doc.output('blob');
}

export async function downloadQuotationPdf(params) {
  const blob = await buildQuotationPdfBlob(params);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Quotation_${safeFilePart(params.contactName)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export { safeFilePart };
