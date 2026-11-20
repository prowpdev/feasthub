import { useMemo, useState } from 'react';
import { Download, Plus, Send, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { downloadQuotationPdf } from '../lib/pdfGenerator';
import type {
  CateringInquiry,
  CateringPackage,
  FoodItem,
  InquiryItemRecord,
  Quotation,
  QuotationItem,
  Restaurant,
} from '../types/catering';

interface QuotationBuilderModalProps {
  token: string;
  restaurant: Restaurant;
  inquiry: CateringInquiry;
  inquiryItems: InquiryItemRecord[];
  packages: CateringPackage[];
  foodItems: FoodItem[];
  existingQuotation?: Quotation | null;
  onClose: () => void;
  onSaved: () => void;
}

export function QuotationBuilderModal({
  token,
  restaurant,
  inquiry,
  inquiryItems,
  packages,
  foodItems,
  existingQuotation,
  onClose,
  onSaved,
}: QuotationBuilderModalProps) {
  const defaultValidUntil = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }, []);

  const initialItems: QuotationItem[] = useMemo(() => {
    if (existingQuotation && existingQuotation.items.length > 0) {
      return existingQuotation.items.map((it) => ({ ...it }));
    }

    const list: QuotationItem[] = [];
    if (inquiry.selected_package_id) {
      const pkg = packages.find((p) => p.id === inquiry.selected_package_id);
      if (pkg) {
        const qty = pkg.pricing_type === 'per_person' ? inquiry.guest_count : 1;
        list.push({
          item_type: 'package',
          title: pkg.name,
          description:
            pkg.pricing_type === 'per_person'
              ? `Per-person package for ${inquiry.guest_count} guests`
              : pkg.description,
          quantity: qty,
          unit_price: pkg.price,
          line_total: Number((qty * pkg.price).toFixed(2)),
        });
      }
    }

    for (const ii of inquiryItems) {
      const unitPrice = ii.unit_price ?? 0;
      list.push({
        item_type: 'food_item',
        title: ii.item_name,
        description: ii.notes || 'Requested catering menu item',
        quantity: ii.quantity,
        unit_price: unitPrice,
        line_total: Number((ii.quantity * unitPrice).toFixed(2)),
      });
    }

    if (inquiry.additional_services.length > 0) {
      list.push({
        item_type: 'service',
        title: 'Event Setup & Hospitality Services',
        description: inquiry.additional_services.join(', '),
        quantity: 1,
        unit_price: 185,
        line_total: 185,
      });
    }

    if (list.length === 0) {
      list.push({
        item_type: 'custom',
        title: `${inquiry.event_type_name} Catering Service`,
        description: `Custom culinary service for ${inquiry.guest_count} guests`,
        quantity: inquiry.guest_count,
        unit_price: 55,
        line_total: inquiry.guest_count * 55,
      });
    }

    return list;
  }, [existingQuotation, inquiry, inquiryItems, packages]);

  const [items, setItems] = useState<QuotationItem[]>(initialItems);
  const [deliveryFee, setDeliveryFee] = useState<number>(
    existingQuotation ? Number(existingQuotation.delivery_fee) : 125
  );
  const [serviceChargePct, setServiceChargePct] = useState<number>(restaurant.service_charge_rate || 15);
  const [customServiceCharge, setCustomServiceCharge] = useState<number | null>(
    existingQuotation ? Number(existingQuotation.service_charge) : null
  );
  const [discountAmount, setDiscountAmount] = useState<number>(
    existingQuotation ? Number(existingQuotation.discount_amount) : 0
  );
  const [taxRate, setTaxRate] = useState<number>(restaurant.tax_rate || 8.5);
  const [validUntil, setValidUntil] = useState<string>(
    existingQuotation?.valid_until || defaultValidUntil
  );
  const [paymentTerms, setPaymentTerms] = useState<string>(
    existingQuotation?.payment_terms ||
      '40% deposit required upon quotation acceptance to reserve date; remaining 60% balance due 72 hours prior to event.'
  );
  const [termsConditions, setTermsConditions] = useState<string>(
    existingQuotation?.terms_conditions ||
      'Final guaranteed guest count is due 5 business days before event date. Dietary and allergen accommodations are prepared in a shared culinary facility with strict separation protocols.'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0),
    [items]
  );
  const computedServiceCharge =
    customServiceCharge !== null
      ? customServiceCharge
      : Number(((subtotal * serviceChargePct) / 100).toFixed(2));
  const taxableBase = Math.max(0, subtotal + deliveryFee + computedServiceCharge - discountAmount);
  const taxAmount = Number(((taxableBase * taxRate) / 100).toFixed(2));
  const grandTotal = Number((taxableBase + taxAmount).toFixed(2));

  function updateItem(idx: number, patch: Partial<QuotationItem>) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        next.line_total = Number((next.quantity * next.unit_price).toFixed(2));
        return next;
      })
    );
  }

  function addPackageLine(pkgId: number) {
    const pkg = packages.find((p) => p.id === pkgId);
    if (!pkg) return;
    const qty = pkg.pricing_type === 'per_person' ? inquiry.guest_count : 1;
    setItems((prev) => [
      ...prev,
      {
        item_type: 'package',
        title: pkg.name,
        description: pkg.description,
        quantity: qty,
        unit_price: pkg.price,
        line_total: Number((qty * pkg.price).toFixed(2)),
      },
    ]);
  }

  function addFoodLine(foodId: number) {
    const f = foodItems.find((fi) => fi.id === foodId);
    if (!f) return;
    const price = f.unit_price ?? 0;
    setItems((prev) => [
      ...prev,
      {
        item_type: 'food_item',
        title: f.name,
        description: f.price_unit,
        quantity: f.min_order_qty,
        unit_price: price,
        line_total: Number((f.min_order_qty * price).toFixed(2)),
      },
    ]);
  }

  function addCustomLine() {
    setItems((prev) => [
      ...prev,
      {
        item_type: 'custom',
        title: 'Custom Line Item',
        description: '',
        quantity: 1,
        unit_price: 0,
        line_total: 0,
      },
    ]);
  }

  async function saveQuotation(sendImmediately: boolean) {
    if (items.length === 0) {
      setError('Add at least one line item to the quotation.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.admin.createQuotation(inquiry.id, {
          items: items.map((it) => ({
            item_type: it.item_type,
            title: it.title,
            description: it.description,
            quantity: Number(it.quantity),
            unit_price: Number(it.unit_price),
          })),
          delivery_fee: Number(deliveryFee),
          service_charge: Number(computedServiceCharge),
          discount_amount: Number(discountAmount),
          tax_rate: Number(taxRate),
          payment_terms: paymentTerms,
          terms_conditions: termsConditions,
          valid_until: validUntil,
          send_immediately: sendImmediately,
        }, token);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save quotation.');
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Network error while saving quotation.');
    } finally {
      setSaving(false);
    }
  }

  function handlePreviewPdf() {
    const previewQuote: Quotation = {
      id: existingQuotation?.id || 0,
      restaurant_id: restaurant.id,
      inquiry_id: inquiry.id,
      quotation_number: existingQuotation?.quotation_number || `PREVIEW-${inquiry.reference_number}`,
      version: (existingQuotation?.version || 0) + 1,
      subtotal,
      delivery_fee: deliveryFee,
      service_charge: computedServiceCharge,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      payment_terms: paymentTerms,
      terms_conditions: termsConditions,
      valid_until: validUntil,
      status: 'draft',
      created_by_name: restaurant.name,
      sent_at: null,
      accepted_at: null,
      created_at: new Date().toISOString(),
      items,
    };

    downloadQuotationPdf({
      restaurant,
      quotation: previewQuote,
      customerName: inquiry.customer_name,
      customerEmail: inquiry.customer_email,
      customerPhone: inquiry.customer_phone,
      eventDate: inquiry.event_date,
      eventVenue: inquiry.event_venue,
      guestCount: inquiry.guest_count,
      inquiryReference: inquiry.reference_number,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white border border-stone-200 rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-[#FAFAF9]">
          <div>
            <div className="text-xs font-mono text-stone-500">
              {inquiry.reference_number} · {inquiry.customer_name} · {inquiry.guest_count} guests
            </div>
            <h3 className="font-display text-xl text-stone-900">Quotation Builder</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-stone-900"
            aria-label="Close quotation builder"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Quick Add Controls */}
          <div className="flex flex-wrap items-center gap-3 bg-[#FAFAF9] border border-stone-200 rounded-lg p-3.5">
            <select
              value=""
              onChange={(e) => e.target.value && addPackageLine(Number(e.target.value))}
              className="px-3 py-1.5 border border-stone-300 rounded-lg text-xs bg-white"
            >
              <option value="">+ Add Catering Package...</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (${p.price.toFixed(2)})
                </option>
              ))}
            </select>

            <select
              value=""
              onChange={(e) => e.target.value && addFoodLine(Number(e.target.value))}
              className="px-3 py-1.5 border border-stone-300 rounded-lg text-xs bg-white"
            >
              <option value="">+ Add Menu Item...</option>
              {foodItems.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.unit_price !== null ? `$${f.unit_price.toFixed(2)}` : 'Custom'})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={addCustomLine}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-stone-300 rounded-lg text-xs font-medium bg-white hover:bg-stone-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Custom Item
            </button>
          </div>

          {/* Line Items Table */}
          <div className="border border-stone-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-600 text-left">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Item / Description</th>
                  <th className="py-2.5 px-3 font-medium w-24 text-right">Qty</th>
                  <th className="py-2.5 px-3 font-medium w-32 text-right">Unit Price ($)</th>
                  <th className="py-2.5 px-3 font-medium w-28 text-right">Line Total</th>
                  <th className="py-2.5 px-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-3 space-y-1.5">
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updateItem(idx, { title: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-sm font-medium"
                      />
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        placeholder="Item notes or inclusions"
                        className="w-full px-2.5 py-1 border border-stone-200 rounded text-xs text-stone-600"
                      />
                    </td>
                    <td className="p-3 align-top">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                        className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-sm text-right font-mono tabular-nums"
                      />
                    </td>
                    <td className="p-3 align-top">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateItem(idx, { unit_price: Math.max(0, Number(e.target.value)) })}
                        className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-sm text-right font-mono tabular-nums"
                      />
                    </td>
                    <td className="p-3 align-top text-right font-mono tabular-nums font-medium pt-4">
                      ${(item.quantity * item.unit_price).toFixed(2)}
                    </td>
                    <td className="p-2 align-top pt-4">
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-stone-400 hover:text-red-600"
                        aria-label="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pricing Adjustments & Totals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Quotation Valid Until
                  </label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Payment Terms
                </label>
                <textarea
                  rows={2}
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Terms &amp; Conditions
                </label>
                <textarea
                  rows={3}
                  value={termsConditions}
                  onChange={(e) => setTermsConditions(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="bg-[#FAFAF9] border border-stone-200 rounded-lg p-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-stone-600">Food &amp; Service Subtotal</span>
                <span className="font-mono tabular-nums font-medium">${subtotal.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <label className="text-stone-600">Delivery Fee ($)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(Number(e.target.value))}
                  className="w-28 px-2.5 py-1 border border-stone-300 rounded bg-white text-right font-mono tabular-nums"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <label className="text-stone-600">
                  Service Charge ($ or {serviceChargePct}%)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={computedServiceCharge}
                  onChange={(e) => {
                    setCustomServiceCharge(Number(e.target.value));
                    setServiceChargePct(0);
                  }}
                  className="w-28 px-2.5 py-1 border border-stone-300 rounded bg-white text-right font-mono tabular-nums"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <label className="text-stone-600">Discount ($)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                  className="w-28 px-2.5 py-1 border border-stone-300 rounded bg-white text-right font-mono tabular-nums"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-stone-600">Estimated Tax ({taxRate}%)</span>
                <span className="font-mono tabular-nums">${taxAmount.toFixed(2)}</span>
              </div>

              <div className="pt-3 border-t border-stone-300 flex items-center justify-between text-base font-semibold text-[#1B4332]">
                <span>Grand Total</span>
                <span className="font-mono tabular-nums">${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-stone-200 bg-[#FAFAF9] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePreviewPdf}
            className="inline-flex items-center gap-2 px-4 py-2 border border-stone-300 text-stone-800 text-xs font-medium rounded-lg hover:bg-white"
          >
            <Download className="w-4 h-4" />
            Download PDF Preview
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => saveQuotation(false)}
              className="px-4 py-2 border border-stone-300 text-stone-800 text-xs font-medium rounded-lg hover:bg-white"
            >
              Save Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => saveQuotation(true)}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326] disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              {saving ? 'Sending...' : 'Save & Send to Customer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
