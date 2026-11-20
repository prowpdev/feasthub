import { jsPDF } from 'jspdf';
import type { Quotation, Restaurant } from '../types/catering';

export function downloadQuotationPdf(params: {
  restaurant: Pick<Restaurant, 'name' | 'tagline' | 'email' | 'phone' | 'address'>;
  quotation: Quotation;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  eventDate: string;
  eventVenue: string;
  guestCount: number;
  inquiryReference: string;
}): void {
  const {
    restaurant,
    quotation,
    customerName,
    customerEmail,
    customerPhone,
    eventDate,
    eventVenue,
    guestCount,
    inquiryReference,
  } = params;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  let y = 48;

  // Header Band
  doc.setFillColor(27, 67, 50); // #1B4332 Deep Botanical Olive
  doc.rect(0, 0, pageWidth, 88, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(restaurant.name, margin, 40);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(restaurant.tagline, margin, 57);
  doc.text(`${restaurant.phone}  ·  ${restaurant.email}`, margin, 72);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('CATERING QUOTATION', pageWidth - margin, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(quotation.quotation_number, pageWidth - margin, 59, { align: 'right' });
  doc.text(`Valid Until: ${quotation.valid_until}`, pageWidth - margin, 73, { align: 'right' });

  y = 114;
  doc.setTextColor(28, 25, 23);

  // Two-column Client & Event Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('PREPARED FOR', margin, y);
  doc.text('EVENT DETAILS', pageWidth / 2 + 12, y);

  y += 15;
  doc.setTextColor(28, 25, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(customerName, margin, y);
  doc.text(`${eventDate}  ·  ${guestCount} Guests`, pageWidth / 2 + 12, y);

  y += 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(customerEmail, margin, y);
  doc.text(`Venue: ${eventVenue}`, pageWidth / 2 + 12, y);

  y += 14;
  doc.text(customerPhone, margin, y);
  doc.text(`Inquiry Ref: ${inquiryReference}`, pageWidth / 2 + 12, y);

  y += 26;

  // Table Header
  doc.setFillColor(244, 244, 242);
  doc.rect(margin, y, pageWidth - margin * 2, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(68, 64, 60);
  doc.text('ITEM & DESCRIPTION', margin + 10, y + 16);
  doc.text('QTY', pageWidth - margin - 175, y + 16, { align: 'right' });
  doc.text('UNIT PRICE', pageWidth - margin - 95, y + 16, { align: 'right' });
  doc.text('TOTAL', pageWidth - margin - 10, y + 16, { align: 'right' });

  y += 34;

  // Item Rows
  doc.setTextColor(28, 25, 23);
  for (const item of quotation.items) {
    if (y > 670) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(item.title, margin + 10, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(String(item.quantity), pageWidth - margin - 175, y, { align: 'right' });
    doc.text(`$${Number(item.unit_price).toFixed(2)}`, pageWidth - margin - 95, y, { align: 'right' });
    doc.text(`$${Number(item.line_total).toFixed(2)}`, pageWidth - margin - 10, y, { align: 'right' });

    if (item.description) {
      y += 13;
      doc.setFontSize(8.5);
      doc.setTextColor(87, 83, 78);
      const wrapped = doc.splitTextToSize(item.description, 300);
      doc.text(wrapped, margin + 10, y);
      y += (wrapped.length - 1) * 11;
      doc.setTextColor(28, 25, 23);
    }

    y += 14;
    doc.setDrawColor(231, 229, 228);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  }

  // Totals Block
  y += 6;
  const labelX = pageWidth - margin - 180;
  const valX = pageWidth - margin - 10;

  const drawTotalRow = (label: string, amount: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11.5 : 9.5);
    doc.text(label, labelX, y);
    doc.text(`$${amount.toFixed(2)}`, valX, y, { align: 'right' });
    y += bold ? 20 : 16;
  };

  drawTotalRow('Subtotal', Number(quotation.subtotal));
  if (Number(quotation.delivery_fee) > 0) drawTotalRow('Delivery & Logistics', Number(quotation.delivery_fee));
  if (Number(quotation.service_charge) > 0) drawTotalRow('Service & Hospitality Charge', Number(quotation.service_charge));
  if (Number(quotation.discount_amount) > 0) drawTotalRow('Promotional Discount', -Number(quotation.discount_amount));
  drawTotalRow('Estimated Taxes', Number(quotation.tax_amount));

  doc.setDrawColor(27, 67, 50);
  doc.line(labelX, y - 6, pageWidth - margin, y - 6);
  y += 4;
  doc.setTextColor(27, 67, 50);
  drawTotalRow('Grand Total', Number(quotation.grand_total), true);

  // Payment Terms & Conditions
  y += 18;
  if (y > 680) {
    doc.addPage();
    y = 48;
  }
  doc.setTextColor(28, 25, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('PAYMENT TERMS', margin, y);
  y += 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(68, 64, 60);
  const ptLines = doc.splitTextToSize(quotation.payment_terms, pageWidth - margin * 2);
  doc.text(ptLines, margin, y);
  y += ptLines.length * 12 + 12;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(28, 25, 23);
  doc.text('TERMS & CONDITIONS', margin, y);
  y += 13;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(68, 64, 60);
  const tcLines = doc.splitTextToSize(quotation.terms_conditions, pageWidth - margin * 2);
  doc.text(tcLines, margin, y);

  // Footer
  doc.setFontSize(8.5);
  doc.setTextColor(120, 113, 108);
  doc.text(`${restaurant.name} · ${restaurant.address} · Prepared by ${quotation.created_by_name}`, margin, 760);

  doc.save(`${quotation.quotation_number}.pdf`);
}
