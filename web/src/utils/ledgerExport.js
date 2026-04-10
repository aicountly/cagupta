import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const TXN_TYPE_LABELS = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  tds_provisional: 'TDS (Prov.)',
  tds_final: 'TDS (Final)',
  rebate: 'Rebate',
  credit_note: 'Credit Note',
  opening_balance: 'Opening Bal.',
  brought_forward: 'B/F',
  payment_expense: 'Payment Exp.',
};

function txnTypeLabel(type) {
  return TXN_TYPE_LABELS[type] || String(type || '—');
}

function safeFilePart(s) {
  const t = String(s || 'Client')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 72);
  return t || 'Client';
}

function formatInrPdf(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return '—';
  return `₹${x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ledgerRowDate(e) {
  const d = e.txnDate || e.date || '';
  if (typeof d !== 'string') return '—';
  const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : d.slice(0, 10) || '—';
}

function numOrEmpty(v) {
  const n = Number(v);
  if (v == null || v === '' || Number.isNaN(n) || n === 0) return null;
  return n;
}

/**
 * Excel export: debit, credit, balance columns are true numeric cells (type `n`) so SUM etc. work.
 * Empty Dr/Cr cells are omitted (blank) rather than text placeholders.
 */
export function exportLedgerExcel({
  rows,
  clientName,
  fyLabel,
  dateFrom,
  dateTo,
}) {
  if (!rows?.length) return;

  const ws = {};
  let r = 0;
  const set = (row, col, cell) => {
    const addr = XLSX.utils.encode_cell({ r: row, c: col });
    ws[addr] = cell;
  };

  set(r, 0, { t: 's', v: 'Client ledger statement' });
  r += 1;
  set(r, 0, { t: 's', v: `Client: ${clientName || '—'}` });
  r += 1;
  set(r, 0, { t: 's', v: `Financial year: ${fyLabel || '—'}` });
  r += 1;
  const rangeParts = [];
  if (dateFrom) rangeParts.push(`From ${dateFrom}`);
  if (dateTo) rangeParts.push(`To ${dateTo}`);
  if (rangeParts.length) {
    set(r, 0, { t: 's', v: rangeParts.join(' · ') });
    r += 1;
  }
  set(r, 0, { t: 's', v: `Generated: ${new Date().toISOString().slice(0, 10)}` });
  r += 2;

  const headerRow = r;
  const headers = ['Date', 'Entry type', 'Narration', 'Billing profile', 'Debit (₹)', 'Credit (₹)', 'Balance (₹)'];
  headers.forEach((h, c) => set(headerRow, c, { t: 's', v: h }));

  const numFmt = '#,##0.00';
  let dataRow = headerRow + 1;
  for (const e of rows) {
    const c0 = 0;
    set(dataRow, c0 + 0, { t: 's', v: ledgerRowDate(e) });
    set(dataRow, c0 + 1, { t: 's', v: txnTypeLabel(e.txnType) });
    set(dataRow, c0 + 2, { t: 's', v: String(e.narration ?? '').slice(0, 500) || '—' });
    set(dataRow, c0 + 3, { t: 's', v: String(e.billingProfileCode || '').trim() || '—' });

    const dr = numOrEmpty(e.debit);
    const cr = numOrEmpty(e.credit);
    if (dr != null) {
      set(dataRow, c0 + 4, { t: 'n', v: dr, z: numFmt });
    }
    if (cr != null) {
      set(dataRow, c0 + 5, { t: 'n', v: cr, z: numFmt });
    }
    const bal = Number(e.balance);
    set(dataRow, c0 + 6, {
      t: 'n',
      v: Number.isNaN(bal) ? 0 : bal,
      z: numFmt,
    });

    dataRow += 1;
  }

  const lastRow = dataRow - 1;
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: lastRow, c: 6 },
  });
  ws['!cols'] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 36 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ledger');

  const fy = safeFilePart(fyLabel?.replace(/\s+/g, '_') || 'FY');
  const name = safeFilePart(clientName);
  XLSX.writeFile(wb, `Ledger_${name}_${fy}.xlsx`);
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

/**
 * Client-ready PDF: logo, header block, and aligned ledger table.
 */
export async function exportLedgerPdf({
  rows,
  clientName,
  fyLabel,
  dateFrom,
  dateTo,
  logoSrc,
}) {
  if (!rows?.length) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const y0 = margin;
  let y = y0;

  const logoDataUrl = await fetchLogoDataUrl(logoSrc);
  const imgH = 14;
  const imgW = 40;
  let logoPlaced = false;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', margin, y0, imgW, imgH);
      logoPlaced = true;
    } catch {
      try {
        doc.addImage(logoDataUrl, 'JPEG', margin, y0, imgW, imgH);
        logoPlaced = true;
      } catch {
        /* skip logo if format unsupported */
      }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  const titleX = logoPlaced ? margin + imgW + 6 : margin;
  const titleY = logoPlaced ? y0 + imgH * 0.72 : y0 + 5;
  doc.text('Account ledger statement', titleX, titleY);
  y = y0 + (logoPlaced ? imgH : 8) + 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const meta = [
    `Client: ${clientName || '—'}`,
    `Financial year: ${fyLabel || '—'}`,
  ];
  if (dateFrom || dateTo) {
    meta.push(`Period: ${dateFrom || '…'} to ${dateTo || '…'}`);
  }
  meta.push(`Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`);
  meta.forEach((line) => {
    doc.text(line, margin, y);
    y += 5;
  });
  y += 4;

  const body = rows.map((e) => [
    ledgerRowDate(e),
    txnTypeLabel(e.txnType),
    String(e.narration ?? '').slice(0, 120) || '—',
    String(e.billingProfileCode || '').trim() || '—',
    e.debit ? formatInrPdf(e.debit) : '—',
    e.credit ? formatInrPdf(e.credit) : '—',
    formatInrPdf(e.balance),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Entry type', 'Narration', 'Billing profile', 'Debit (Dr)', 'Credit (Cr)', 'Balance']],
    body,
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 26 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 28 },
      4: { halign: 'right', cellWidth: 30 },
      5: { halign: 'right', cellWidth: 30 },
      6: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
    showHead: 'everyPage',
  });

  const pageCount = doc.internal.getNumberOfPages();
  const footY = doc.internal.pageSize.getHeight() - 8;
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, footY, { align: 'right' });
  }

  const fy = safeFilePart(fyLabel?.replace(/\s+/g, '_') || 'FY');
  const name = safeFilePart(clientName);
  doc.save(`Ledger_${name}_${fy}.pdf`);
}
