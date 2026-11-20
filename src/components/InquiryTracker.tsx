import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CheckCircle2,
  Download,
  FileText,
  Search,
  XCircle,
} from 'lucide-react';
import { trackLookupSchema, type TrackLookupValues } from '../lib/validation';
import { downloadQuotationPdf } from '../lib/pdfGenerator';
import type {
  Booking,
  CateringInquiry,
  InquiryItemRecord,
  InquiryStatus,
  Quotation,
  Restaurant,
} from '../types/catering';

interface InquiryTrackerProps {
  restaurantSlug: string;
  initialReference?: string;
  initialContact?: string;
}

const TIMELINE_STAGES: InquiryStatus[] = [
  'Request Received',
  'Under Review',
  'Quotation Sent',
  'Awaiting Customer Confirmation',
  'Confirmed',
  'Completed',
];

export function InquiryTracker({
  restaurantSlug,
  initialReference = '',
  initialContact = '',
}: InquiryTrackerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [revisionNote, setRevisionNote] = useState('');
  const [showRevisionBox, setShowRevisionBox] = useState(false);
  const [responding, setResponding] = useState(false);

  const [result, setResult] = useState<{
    restaurant: Restaurant;
    inquiry: CateringInquiry;
    items: InquiryItemRecord[];
    quotation: Quotation | null;
    booking: Booking | null;
  } | null>(null);

  const form = useForm<TrackLookupValues>({
    resolver: zodResolver(trackLookupSchema),
    defaultValues: {
      reference: initialReference,
      contact: initialContact,
    },
  });

  useEffect(() => {
    if (initialReference && initialContact) {
      form.setValue('reference', initialReference);
      form.setValue('contact', initialContact);
      performLookup(initialReference, initialContact);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReference, initialContact, restaurantSlug]);

  async function performLookup(reference: string, contact: string) {
    setLoading(true);
    setError(null);
    setActionMsg(null);
    try {
      const qs = new URLSearchParams({ reference: reference.trim(), contact: contact.trim() });
      const res = await fetch(`/api/public/${restaurantSlug}/track?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setResult(null);
        setError(data.error || 'Could not locate inquiry.');
        return;
      }
      setResult(data);
    } catch {
      setError('Unable to reach server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleQuotationResponse(decision: 'accept' | 'decline') {
    if (!result?.quotation) return;
    setResponding(true);
    setError(null);
    setActionMsg(null);
    try {
      const res = await fetch(
        `/api/public/${restaurantSlug}/quotations/${result.quotation.quotation_number}/respond`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: result.inquiry.reference_number,
            contact: form.getValues('contact'),
            decision,
            customer_note: revisionNote,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to process response.');
        return;
      }
      setActionMsg(data.message);
      setShowRevisionBox(false);
      await performLookup(result.inquiry.reference_number, form.getValues('contact'));
    } catch {
      setError('Network error while updating quotation response.');
    } finally {
      setResponding(false);
    }
  }

  const currentStageIndex = result
    ? TIMELINE_STAGES.indexOf(result.inquiry.status)
    : -1;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white border border-stone-200 rounded-xl p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-stone-500 mb-1">
              Customer Portal
            </p>
            <h2 className="font-display text-2xl md:text-3xl text-stone-900">
              Track Your Catering Inquiry &amp; Quotation
            </h2>
          </div>
          {restaurantSlug === 'maison-saffron' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-stone-500">Sample lookups:</span>
              <button
                type="button"
                onClick={() => {
                  form.setValue('reference', 'INQ-MS-2026-1042');
                  form.setValue('contact', 'amelia.thornton@northstar.io');
                  performLookup('INQ-MS-2026-1042', 'amelia.thornton@northstar.io');
                }}
                className="px-2.5 py-1 rounded border border-stone-300 text-stone-700 hover:bg-stone-50 font-mono"
              >
                INQ-MS-2026-1042 (Quote Sent)
              </button>
              <button
                type="button"
                onClick={() => {
                  form.setValue('reference', 'INQ-MS-2026-1039');
                  form.setValue('contact', 'priya.kapoor@gmail.com');
                  performLookup('INQ-MS-2026-1039', 'priya.kapoor@gmail.com');
                }}
                className="px-2.5 py-1 rounded border border-stone-300 text-stone-700 hover:bg-stone-50 font-mono"
              >
                INQ-MS-2026-1039 (Confirmed)
              </button>
            </div>
          )}
        </div>

        <form
          onSubmit={form.handleSubmit((vals) => performLookup(vals.reference, vals.contact))}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1.5">
              Inquiry Reference Number
            </label>
            <input
              type="text"
              placeholder="INQ-MS-2026-1042"
              {...form.register('reference')}
              className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
            />
            {form.formState.errors.reference && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.reference.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1.5">
              Email Address or Phone Number
            </label>
            <input
              type="text"
              placeholder="you@domain.com or 4155550182"
              {...form.register('contact')}
              className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
            />
            {form.formState.errors.contact && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.contact.message}</p>
            )}
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1B4332] text-white text-sm font-medium rounded-lg hover:bg-[#143326] disabled:opacity-60 transition-colors"
            >
              <Search className="w-4 h-4" />
              {loading ? 'Checking...' : 'Check Status'}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            {error}
          </div>
        )}
        {actionMsg && (
          <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
            {actionMsg}
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-6">
          {/* Status Progression */}
          <div className="bg-white border border-stone-200 rounded-xl p-6 md:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-stone-200">
              <div>
                <div className="text-xs text-stone-500 font-mono tabular-nums">
                  {result.inquiry.reference_number} · Submitted {result.inquiry.created_at.slice(0, 10)}
                </div>
                <h3 className="font-display text-2xl text-stone-900 mt-1">
                  {result.inquiry.event_type_name} at {result.inquiry.event_venue}
                </h3>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-xs text-stone-500">Current Status</div>
                <div className="text-sm font-semibold text-[#1B4332]">
                  {result.inquiry.status}
                </div>
              </div>
            </div>

            {result.inquiry.status === 'Cancelled' ? (
              <div className="mt-5 p-4 rounded-lg bg-stone-100 text-sm text-stone-700 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                This inquiry has been marked as Cancelled.
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {TIMELINE_STAGES.map((stage, idx) => {
                  const reached = currentStageIndex >= idx;
                  const isCurrent = result.inquiry.status === stage;
                  return (
                    <div
                      key={stage}
                      className={`p-3 rounded-lg border text-xs ${
                        isCurrent
                          ? 'border-[#1B4332] bg-[#1B4332]/5 text-[#1B4332] font-semibold'
                          : reached
                          ? 'border-stone-300 bg-stone-50 text-stone-800'
                          : 'border-stone-200 bg-white text-stone-400'
                      }`}
                    >
                      <div className="font-mono mb-1 tabular-nums">0{idx + 1}</div>
                      <div className="leading-snug">{stage}</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-stone-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-stone-500">Event Date</div>
                <div className="font-mono tabular-nums text-stone-900 mt-0.5">
                  {result.inquiry.event_date}
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Time</div>
                <div className="font-mono tabular-nums text-stone-900 mt-0.5">
                  {result.inquiry.start_time}
                  {result.inquiry.end_time ? ` – ${result.inquiry.end_time}` : ''}
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Guest Count</div>
                <div className="font-mono tabular-nums text-stone-900 mt-0.5">
                  {result.inquiry.guest_count} guests
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Package</div>
                <div className="text-stone-900 mt-0.5">
                  {result.inquiry.selected_package_name || 'Custom Menu Selection'}
                </div>
              </div>
            </div>
          </div>

          {/* Booking Confirmation Summary */}
          {result.booking && (
            <div className="bg-white border border-stone-200 rounded-xl p-6 md:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-[#1B4332]" />
                  <h4 className="font-display text-xl text-stone-900">
                    Confirmed Booking · {result.booking.booking_reference}
                  </h4>
                </div>
                <span className="text-xs font-medium text-stone-700">
                  Booking: {result.booking.booking_status} · Payment: {result.booking.payment_status}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-stone-200 text-sm">
                <div>
                  <div className="text-xs text-stone-500">Contract Total</div>
                  <div className="font-mono tabular-nums font-semibold text-stone-900 mt-0.5">
                    ${Number(result.booking.total_amount).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-stone-500">Required Deposit</div>
                  <div className="font-mono tabular-nums text-stone-900 mt-0.5">
                    ${Number(result.booking.deposit_amount).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-stone-500">Verified Paid</div>
                  <div className="font-mono tabular-nums text-[#1B4332] font-medium mt-0.5">
                    ${Number(result.booking.amount_paid).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-stone-500">Balance Due</div>
                  <div className="font-mono tabular-nums text-stone-900 font-semibold mt-0.5">
                    ${Number(result.booking.balance_due).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Issued Quotation Viewer */}
          {result.quotation ? (
            <div className="bg-white border border-stone-200 rounded-xl p-6 md:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-stone-200">
                <div>
                  <div className="text-xs uppercase tracking-wider text-stone-500">
                    Official Quotation · Status: {result.quotation.status}
                  </div>
                  <h4 className="font-display text-2xl text-stone-900 mt-1">
                    {result.quotation.quotation_number}
                  </h4>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Prepared by {result.quotation.created_by_name} · Valid until{' '}
                    <span className="font-mono tabular-nums">{result.quotation.valid_until}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    downloadQuotationPdf({
                      restaurant: result.restaurant,
                      quotation: result.quotation!,
                      customerName: result.inquiry.customer_name,
                      customerEmail: result.inquiry.customer_email,
                      customerPhone: result.inquiry.customer_phone,
                      eventDate: result.inquiry.event_date,
                      eventVenue: result.inquiry.event_venue,
                      guestCount: result.inquiry.guest_count,
                      inquiryReference: result.inquiry.reference_number,
                    })
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 border border-stone-300 text-stone-800 text-xs font-medium rounded-lg hover:bg-stone-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Download Quotation PDF
                </button>
              </div>

              <div className="overflow-x-auto mt-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-xs text-stone-500 text-left">
                      <th className="py-2.5 font-medium">Item</th>
                      <th className="py-2.5 font-medium text-right">Qty</th>
                      <th className="py-2.5 font-medium text-right">Unit Price</th>
                      <th className="py-2.5 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {result.quotation.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-stone-900">{item.title}</div>
                          {item.description && (
                            <div className="text-xs text-stone-500 mt-0.5">{item.description}</div>
                          )}
                        </td>
                        <td className="py-3 text-right font-mono tabular-nums">{item.quantity}</td>
                        <td className="py-3 text-right font-mono tabular-nums">
                          ${Number(item.unit_price).toFixed(2)}
                        </td>
                        <td className="py-3 text-right font-mono tabular-nums font-medium">
                          ${Number(item.line_total).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 pt-4 border-t border-stone-200 flex flex-col items-end space-y-1.5 text-sm">
                <div className="flex justify-between w-full max-w-xs">
                  <span className="text-stone-500">Subtotal</span>
                  <span className="font-mono tabular-nums">${Number(result.quotation.subtotal).toFixed(2)}</span>
                </div>
                {Number(result.quotation.delivery_fee) > 0 && (
                  <div className="flex justify-between w-full max-w-xs">
                    <span className="text-stone-500">Delivery Fee</span>
                    <span className="font-mono tabular-nums">${Number(result.quotation.delivery_fee).toFixed(2)}</span>
                  </div>
                )}
                {Number(result.quotation.service_charge) > 0 && (
                  <div className="flex justify-between w-full max-w-xs">
                    <span className="text-stone-500">Service Charge</span>
                    <span className="font-mono tabular-nums">${Number(result.quotation.service_charge).toFixed(2)}</span>
                  </div>
                )}
                {Number(result.quotation.discount_amount) > 0 && (
                  <div className="flex justify-between w-full max-w-xs text-[#1B4332]">
                    <span>Discount</span>
                    <span className="font-mono tabular-nums">-${Number(result.quotation.discount_amount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between w-full max-w-xs">
                  <span className="text-stone-500">Estimated Taxes</span>
                  <span className="font-mono tabular-nums">${Number(result.quotation.tax_amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-full max-w-xs pt-2 border-t border-stone-200 text-base font-semibold text-[#1B4332]">
                  <span>Grand Total</span>
                  <span className="font-mono tabular-nums">${Number(result.quotation.grand_total).toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-stone-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-stone-600">
                <div>
                  <div className="font-semibold text-stone-800 mb-1">Payment Terms</div>
                  <p>{result.quotation.payment_terms}</p>
                </div>
                <div>
                  <div className="font-semibold text-stone-800 mb-1">Terms &amp; Conditions</div>
                  <p>{result.quotation.terms_conditions}</p>
                </div>
              </div>

              {result.quotation.status === 'sent' && !result.booking && (
                <div className="mt-6 pt-6 border-t border-stone-200">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm text-stone-700">
                      Ready to proceed? Accept this quotation to lock your event date and initiate booking.
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowRevisionBox((v) => !v)}
                        className="px-4 py-2 border border-stone-300 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-50 transition-colors"
                      >
                        Request Changes
                      </button>
                      <button
                        type="button"
                        disabled={responding}
                        onClick={() => handleQuotationResponse('accept')}
                        className="px-5 py-2 bg-[#1B4332] text-white text-sm font-medium rounded-lg hover:bg-[#143326] disabled:opacity-60 transition-colors"
                      >
                        {responding ? 'Confirming...' : 'Accept Quotation'}
                      </button>
                    </div>
                  </div>

                  {showRevisionBox && (
                    <div className="mt-4 p-4 rounded-lg bg-[#FAFAF9] border border-stone-200 space-y-3">
                      <label className="block text-xs font-medium text-stone-700">
                        Describe the menu or guest adjustments you need:
                      </label>
                      <textarea
                        rows={2}
                        value={revisionNote}
                        onChange={(e) => setRevisionNote(e.target.value)}
                        placeholder="e.g. Reduce guest count to 55 or swap dessert selection"
                        className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                      />
                      <button
                        type="button"
                        disabled={responding}
                        onClick={() => handleQuotationResponse('decline')}
                        className="px-4 py-2 bg-stone-900 text-white text-xs font-medium rounded-lg hover:bg-stone-800"
                      >
                        Send Revision Request
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-stone-200 rounded-xl p-6 flex items-center gap-3 text-sm text-stone-600">
              <FileText className="w-5 h-5 text-stone-400 shrink-0" />
              <span>
                Your catering quotation is currently being prepared by our culinary coordinator. Once issued,
                the full itemized breakdown and PDF download will appear here.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
