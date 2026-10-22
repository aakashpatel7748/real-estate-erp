import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { areaToSqft, formatDate, formatINR } from '@erp/shared';
import { Company } from '../companies/company.model';
import type { TenantContext } from '../../utils/tenant';
import { getBooking } from '../bookings/bookings.service';
import { getPayment } from '../payments/payments.service';
import { listPlots } from '../plots/plots.service';
import { listPayments } from '../payments/payments.service';
import { listBookings } from '../bookings/bookings.service';

// PDF standard fonts lack the ₹ glyph, so PDFs print "Rs.".
const rs = (paise: number) => `Rs. ${formatINR(paise, { symbol: false })}`;

function pdfResponse(res: Response, filename: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);
  return doc;
}

async function header(doc: PDFKit.PDFDocument, ctx: TenantContext, title: string) {
  const company = await Company.findById(ctx.companyId).lean();
  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(company?.legalName || company?.name || '', { align: 'left' });
  doc.fontSize(9).font('Helvetica').fillColor('#555');
  const addr = [company?.address?.line1, company?.address?.city, company?.address?.state, company?.address?.pincode]
    .filter(Boolean)
    .join(', ');
  if (addr) doc.text(addr);
  if (company?.gstin) doc.text(`GSTIN: ${company.gstin}`);
  doc.moveDown(0.8).fillColor('#000').fontSize(13).font('Helvetica-Bold').text(title, { align: 'center' }).moveDown(0.8);
  doc.font('Helvetica').fontSize(10);
}

function row(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y;
  doc.font('Helvetica-Bold').text(label, 50, y, { width: 160 });
  doc.font('Helvetica').text(value, 210, y, { width: 335 });
  doc.moveDown(0.3);
}

export async function receiptPdf(ctx: TenantContext, id: string, res: Response) {
  const p = (await getPayment(ctx, id)) as unknown as {
    number: string;
    kind: string;
    status: string;
    amountPaise: number;
    allocatedPaise: number;
    advancePaise: number;
    mode: string;
    reference?: string;
    bankName?: string;
    date: Date;
    customerId: { name: string; customerCode: string; phone: string };
    bookingId: { bookingNumber: string };
    projectId: { name: string };
    allocations: { amountPaise: number; reversedAt?: Date; installmentId: { name: string; dueDate: Date } }[];
  };
  const doc = pdfResponse(res, `${p.number}.pdf`);
  await header(doc, ctx, p.kind === 'refund' ? 'REFUND VOUCHER' : 'PAYMENT RECEIPT');
  if (p.status === 'reversed')
    doc.fillColor('#b91c1c').font('Helvetica-Bold').text('REVERSED', { align: 'center' }).fillColor('#000').moveDown(0.5);
  row(doc, p.kind === 'refund' ? 'Voucher No.' : 'Receipt No.', p.number);
  row(doc, 'Date', formatDate(p.date.toISOString().slice(0, 10)));
  row(doc, 'Customer', `${p.customerId?.name} (${p.customerId?.customerCode})`);
  row(doc, 'Project', p.projectId?.name ?? '');
  row(doc, 'Booking', p.bookingId?.bookingNumber ?? '');
  row(doc, 'Amount', rs(p.amountPaise));
  row(doc, 'Mode', `${p.mode.toUpperCase()}${p.reference ? ` – ${p.reference}` : ''}${p.bankName ? ` (${p.bankName})` : ''}`);
  if (p.allocations.length) {
    doc.moveDown(0.6).font('Helvetica-Bold').text('Applied to installments').font('Helvetica').moveDown(0.3);
    for (const a of p.allocations) {
      row(doc, a.installmentId?.name ?? '', `${rs(a.amountPaise)}${a.reversedAt ? ' (reversed)' : ''}`);
    }
  }
  if (p.advancePaise) row(doc, 'Held as advance', rs(p.advancePaise));
  doc
    .moveDown(2)
    .fontSize(8)
    .fillColor('#666')
    .text('This is a computer-generated document. Subject to realisation of cheque/instrument.', { align: 'center' });
  doc.end();
}

export async function allotmentLetterPdf(ctx: TenantContext, id: string, res: Response) {
  const b = (await getBooking(ctx, id)) as unknown as {
    bookingNumber: string;
    status: string;
    bookingDate: Date;
    customerId: {
      name: string;
      phone: string;
      address?: { line1?: string; city?: string; state?: string };
      coApplicants: { name: string }[];
    };
    projectId: { name: string; reraNumber?: string };
    items: {
      plotNumber: string;
      blockCode?: string;
      areaX100: number;
      ratePaisePerSqft: number;
      plcPaise: number;
      lineTotalPaise: number;
    }[];
    grossAmountPaise: number;
    discountPaise: number;
    charges: { name: string; amountPaise: number }[];
    netAmountPaise: number;
    installments: { sequence: number; name: string; dueDate: Date; amountPaise: number }[];
  };
  const doc = pdfResponse(res, `${b.bookingNumber}-allotment.pdf`);
  await header(doc, ctx, b.status === 'reserved' ? 'PROVISIONAL RESERVATION LETTER' : 'ALLOTMENT LETTER');
  row(doc, 'Booking No.', b.bookingNumber);
  row(doc, 'Booking Date', formatDate(b.bookingDate.toISOString().slice(0, 10)));
  row(doc, 'Allottee', b.customerId?.name ?? '');
  if (b.customerId?.coApplicants?.length) row(doc, 'Co-applicant(s)', b.customerId.coApplicants.map((c) => c.name).join(', '));
  row(doc, 'Project', `${b.projectId?.name ?? ''}${b.projectId?.reraNumber ? ` (RERA: ${b.projectId.reraNumber})` : ''}`);
  doc.moveDown(0.5).font('Helvetica-Bold').text('Plot details').font('Helvetica').moveDown(0.3);
  for (const i of b.items) {
    row(
      doc,
      `Plot ${i.blockCode ? `${i.blockCode}-` : ''}${i.plotNumber}`,
      `${areaToSqft(i.areaX100)} sq ft @ ${rs(i.ratePaisePerSqft)}/sq ft${i.plcPaise ? ` + PLC ${rs(i.plcPaise)}` : ''} = ${rs(i.lineTotalPaise)}`,
    );
  }
  doc.moveDown(0.3);
  row(doc, 'Plot value', rs(b.grossAmountPaise));
  if (b.discountPaise) row(doc, 'Discount', `- ${rs(b.discountPaise)}`);
  for (const c of b.charges) row(doc, c.name, rs(c.amountPaise));
  row(doc, 'Total consideration', rs(b.netAmountPaise));
  doc.moveDown(0.5).font('Helvetica-Bold').text('Payment schedule').font('Helvetica').moveDown(0.3);
  for (const i of b.installments)
    row(doc, `${i.sequence}. ${i.name}`, `${formatDate(i.dueDate.toISOString().slice(0, 10))} – ${rs(i.amountPaise)}`);
  doc.moveDown(3).text('Authorised Signatory', 380);
  doc.end();
}

async function sendWorkbook(res: Response, wb: ExcelJS.Workbook, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  await wb.xlsx.write(res);
  res.end();
}

const MAX_EXPORT_ROWS = 10_000;
const rupees = (paise: number) => paise / 100; // display-only conversion for spreadsheet cells

export async function exportPlots(ctx: TenantContext, projectId: string, res: Response) {
  const { items } = await listPlots(ctx, projectId, { page: 1, pageSize: MAX_EXPORT_ROWS });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Plots');
  ws.columns = [
    { header: 'Block', key: 'block', width: 10 },
    { header: 'Plot No.', key: 'plot', width: 12 },
    { header: 'Category', key: 'category', width: 14 },
    { header: 'Facing', key: 'facing', width: 12 },
    { header: 'Area (sq ft)', key: 'area', width: 14 },
    { header: 'Rate (₹/sq ft)', key: 'rate', width: 14 },
    { header: 'PLC %', key: 'plc', width: 8 },
    { header: 'List Price (₹)', key: 'price', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  for (const p of items) {
    ws.addRow({
      block: p.blockCode ?? '',
      plot: p.plotNumber,
      category: p.category,
      facing: p.facing ?? '',
      area: Number(areaToSqft(p.areaX100)),
      rate: rupees(p.ratePaisePerSqft),
      plc: p.plcBp / 100,
      price: rupees(p.listPricePaise),
      status: p.status,
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.getColumn('price').numFmt = '#,##,##0.00';
  await sendWorkbook(res, wb, 'plots.xlsx');
}

export async function exportPayments(
  ctx: TenantContext,
  q: Parameters<typeof listPayments>[1],
  projectId: string | undefined,
  res: Response,
) {
  const { items } = await listPayments(ctx, { ...q, page: 1, pageSize: MAX_EXPORT_ROWS }, projectId);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payments');
  ws.columns = [
    { header: 'Number', key: 'number', width: 22 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Type', key: 'kind', width: 10 },
    { header: 'Customer', key: 'customer', width: 24 },
    { header: 'Booking', key: 'booking', width: 20 },
    { header: 'Mode', key: 'mode', width: 10 },
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Amount (₹)', key: 'amount', width: 16 },
    { header: 'Status', key: 'status', width: 10 },
  ];
  for (const p of items as unknown as {
    number: string;
    date: Date;
    kind: string;
    customerId?: { name: string };
    bookingId?: { bookingNumber: string };
    mode: string;
    reference?: string;
    amountPaise: number;
    status: string;
  }[]) {
    ws.addRow({
      number: p.number,
      date: p.date.toISOString().slice(0, 10),
      kind: p.kind,
      customer: p.customerId?.name ?? '',
      booking: p.bookingId?.bookingNumber ?? '',
      mode: p.mode,
      reference: p.reference ?? '',
      amount: rupees(p.amountPaise),
      status: p.status,
    });
  }
  ws.getRow(1).font = { bold: true };
  await sendWorkbook(res, wb, 'payments.xlsx');
}

export async function exportBookings(
  ctx: TenantContext,
  q: Parameters<typeof listBookings>[1],
  projectId: string | undefined,
  res: Response,
) {
  const { items } = await listBookings(ctx, { ...q, page: 1, pageSize: MAX_EXPORT_ROWS }, projectId);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bookings');
  ws.columns = [
    { header: 'Booking No.', key: 'number', width: 20 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Project', key: 'project', width: 18 },
    { header: 'Customer', key: 'customer', width: 24 },
    { header: 'Plots', key: 'plots', width: 18 },
    { header: 'Net Amount (₹)', key: 'net', width: 16 },
    { header: 'Received (₹)', key: 'received', width: 16 },
    { header: 'Outstanding (₹)', key: 'due', width: 16 },
    { header: 'Status', key: 'status', width: 10 },
  ];
  for (const b of items as unknown as {
    bookingNumber: string;
    bookingDate: Date;
    projectId?: { code: string };
    customerId?: { name: string };
    plots: string[];
    netAmountPaise: number;
    allocatedPaise: number;
    receivedPaise: number;
    status: string;
  }[]) {
    ws.addRow({
      number: b.bookingNumber,
      date: b.bookingDate.toISOString().slice(0, 10),
      project: b.projectId?.code ?? '',
      customer: b.customerId?.name ?? '',
      plots: b.plots.join(', '),
      net: rupees(b.netAmountPaise),
      received: rupees(b.receivedPaise),
      due: ['reserved', 'booked'].includes(b.status) ? rupees(b.netAmountPaise - b.allocatedPaise) : 0,
      status: b.status,
    });
  }
  ws.getRow(1).font = { bold: true };
  await sendWorkbook(res, wb, 'bookings.xlsx');
}
