import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { inquiryFormSchema, type InquiryFormValues } from '../lib/validation';
import type {
  CateringPackage,
  CustomCartItem,
  EventType,
  FoodItem,
  Restaurant,
  RestaurantService,
} from '../types/catering';
import { api } from '../api';

interface QuotationRequestWizardProps {
  restaurant: Restaurant;
  eventTypes: EventType[];
  packages: CateringPackage[];
  foodItems: FoodItem[];
  services: RestaurantService[];
  preselectedEventType: EventType | null;
  selectedPackage: CateringPackage | null;
  onSelectPackage: (pkg: CateringPackage | null) => void;
  cartItems: CustomCartItem[];
  onUpdateCartItemQty: (foodItemId: number, qty: number) => void;
  onRemoveCartItem: (foodItemId: number) => void;
  onAddFoodItem: (item: FoodItem) => void;
  onClearCartAndPackage: () => void;
  onNavigateToTracker: (reference: string, email: string) => void;
}

const DEFAULT_SERVICE_OPTIONS = [
  'Food setup',
  'Waitstaff',
  'Tables and chairs',
  'Buffet arrangement',
  'Food delivery',
];

const STEPS = [
  { id: 1, label: 'Event Information' },
  { id: 2, label: 'Food Preferences' },
  { id: 3, label: 'Customer Information' },
  { id: 4, label: 'Review & Submit' },
];

export function QuotationRequestWizard({
  restaurant,
  eventTypes,
  packages,
  foodItems,
  services,
  preselectedEventType,
  selectedPackage,
  onSelectPackage,
  cartItems,
  onUpdateCartItemQty,
  onRemoveCartItem,
  onAddFoodItem,
  onClearCartAndPackage,
  onNavigateToTracker,
}: QuotationRequestWizardProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    reference_number: string;
    email: string;
    estimated_total: number | null;
  } | null>(null);

  const defaultDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }, []);

  const form = useForm<InquiryFormValues>({
    resolver: zodResolver(inquiryFormSchema) as never,
    defaultValues: {
      event_type_id: preselectedEventType?.id || eventTypes[0]?.id || null,
      event_type_name: preselectedEventType?.name || eventTypes[0]?.name || 'Corporate Events',
      event_date: defaultDate,
      start_time: '12:00',
      end_time: '15:00',
      guest_count: selectedPackage?.min_guests || 35,
      event_venue: '',
      delivery_address: '',
      venue_setting: 'indoor',
      selected_package_id: selectedPackage?.id || null,
      dietary_requirements: '',
      food_allergies: '',
      special_instructions: '',
      additional_services: ['Food setup', 'Food delivery'],
      full_name: '',
      phone: '',
      email: '',
      company_name: '',
      preferred_contact: 'Email',
      privacy_consent: false,
      captcha_checked: false,
      website_honeypot: '',
    },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (preselectedEventType) {
      form.setValue('event_type_id', preselectedEventType.id);
      form.setValue('event_type_name', preselectedEventType.name);
    }
  }, [preselectedEventType, form]);

  useEffect(() => {
    form.setValue('selected_package_id', selectedPackage?.id || null);
    if (selectedPackage && form.getValues('guest_count') < selectedPackage.min_guests) {
      form.setValue('guest_count', selectedPackage.min_guests);
    }
  }, [selectedPackage, form]);

  const watchedValues = form.watch();
  const guestCount = Number(watchedValues.guest_count) || 0;
  const selectedServices = watchedValues.additional_services || [];

  const estimatedTotal = useMemo(() => {
    let total = 0;
    let hasConfiguredPrice = false;

    if (selectedPackage) {
      hasConfiguredPrice = true;
      total +=
        selectedPackage.pricing_type === 'per_person'
          ? selectedPackage.price * Math.max(guestCount, selectedPackage.min_guests)
          : selectedPackage.price;
    }

    for (const item of cartItems) {
      if (item.foodItem.unit_price !== null) {
        hasConfiguredPrice = true;
        const addonSum = item.selectedAddons.reduce((s, a) => s + a.price, 0);
        total += (item.foodItem.unit_price + addonSum) * item.quantity;
      }
    }

    return hasConfiguredPrice ? total : null;
  }, [selectedPackage, cartItems, guestCount]);

  async function handleNextStep() {
    setServerError(null);
    let fieldsToValidate: Array<keyof InquiryFormValues> = [];

    if (step === 1) {
      fieldsToValidate = [
        'event_type_name',
        'event_date',
        'start_time',
        'guest_count',
        'event_venue',
        'delivery_address',
      ];
    } else if (step === 2) {
      if (!selectedPackage && cartItems.length === 0) {
        setServerError('Please select a catering package or add at least one food item below to continue.');
        return;
      }
      fieldsToValidate = ['dietary_requirements', 'food_allergies', 'special_instructions'];
    } else if (step === 3) {
      fieldsToValidate = ['full_name', 'phone', 'email', 'preferred_contact'];
    }

    const valid = await form.trigger(fieldsToValidate);
    if (valid) {
      setStep((s) => Math.min(4, s + 1));
    }
  }

  function toggleService(service: string) {
    const current = form.getValues('additional_services') || [];
    if (current.includes(service)) {
      form.setValue(
        'additional_services',
        current.filter((s) => s !== service)
      );
    } else {
      form.setValue('additional_services', [...current, service]);
    }
  }

  async function onSubmit(values: InquiryFormValues) {
    if (!selectedPackage && cartItems.length === 0) {
      setServerError('Please choose a package or at least one custom menu item.');
      return;
    }

    setSubmitting(true);
    setServerError(null);
    try {
      const response = await api.public.submitInquiry(restaurant.slug, {
          ...values,
          selected_package_id: selectedPackage?.id || null,
          selected_items: cartItems.map((c) => ({
            food_item_id: c.foodItem.id,
            quantity: c.quantity,
            notes: c.notes,
            selected_addons: c.selectedAddons,
          })),
      });

      const data = await response.json();
      if (!response.ok) {
        setServerError(data.error || 'Could not submit inquiry. Please verify your entries.');
        return;
      }

      setSubmittedResult({
        reference_number: data.reference_number,
        email: values.email,
        estimated_total: data.estimated_total,
      });
      onClearCartAndPackage();
    } catch {
      setServerError('Network error while submitting your inquiry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submittedResult) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-8 md:p-10 max-w-3xl mx-auto">
        <div className="w-12 h-12 rounded-lg bg-[#1B4332]/10 text-[#1B4332] flex items-center justify-center mb-5">
          <Check className="w-6 h-6" />
        </div>
        <p className="text-xs uppercase tracking-wider text-stone-500 mb-2">
          Quotation Request Received
        </p>
        <h3 className="font-display text-3xl text-stone-900 mb-3">
          Thank you — your inquiry has been logged for review.
        </h3>
        <p className="text-stone-600 leading-relaxed mb-6">
          No booking is confirmed and no payment has been charged. Our catering team at{' '}
          <span className="font-medium text-stone-900">{restaurant.name}</span> will verify kitchen
          and date availability, finalize any custom notes, and email your formal quotation.
        </p>

        <div className="bg-[#FAFAF9] border border-stone-200 rounded-lg p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-stone-500 mb-1">Inquiry Reference Number</div>
            <div className="font-mono text-lg font-medium text-[#1B4332] tabular-nums">
              {submittedResult.reference_number}
            </div>
          </div>
          <div>
            <div className="text-xs text-stone-500 mb-1">Confirmation Sent To</div>
            <div className="text-sm font-medium text-stone-900 truncate">{submittedResult.email}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigateToTracker(submittedResult.reference_number, submittedResult.email)}
            className="px-5 py-2.5 bg-[#1B4332] text-white text-sm font-medium rounded-lg hover:bg-[#143326] transition-colors whitespace-nowrap"
          >
            Track This Inquiry
          </button>
          <button
            type="button"
            onClick={() => {
              setSubmittedResult(null);
              setStep(1);
              form.reset();
            }}
            className="px-5 py-2.5 border border-stone-300 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-50 transition-colors whitespace-nowrap"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Step Header */}
      <div className="border-b border-stone-200 px-6 py-5 bg-[#FAFAF9]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-stone-500 mb-1">
              Non-Binding Quotation Request
            </p>
            <h3 className="font-display text-2xl text-stone-900">
              Request a Tailored Catering Quote
            </h3>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {STEPS.map((s) => {
              const active = step === s.id;
              const completed = step > s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => s.id < step && setStep(s.id)}
                  disabled={s.id > step}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#1B4332] text-white'
                      : completed
                      ? 'bg-[#1B4332]/10 text-[#1B4332] hover:bg-[#1B4332]/15'
                      : 'bg-stone-100 text-stone-400 cursor-not-allowed'
                  }`}
                >
                  <span className="font-mono tabular-nums">0{s.id}</span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 md:p-8">
        {serverError && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            {serverError}
          </div>
        )}

        {/* STEP 1: EVENT INFORMATION */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                Event Type *
              </label>
              <select
                {...form.register('event_type_name')}
                onChange={(e) => {
                  const found = eventTypes.find((et) => et.name === e.target.value);
                  form.setValue('event_type_name', e.target.value);
                  form.setValue('event_type_id', found?.id || null);
                }}
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              >
                {eventTypes.map((et) => (
                  <option key={et.id} value={et.name}>
                    {et.name}
                  </option>
                ))}
                <option value="Private Dinner or Other">Private Dinner or Other</option>
              </select>
              {form.formState.errors.event_type_name && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.event_type_name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                Expected Number of Guests *
              </label>
              <input
                type="number"
                min={10}
                max={5000}
                {...form.register('guest_count')}
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {form.formState.errors.guest_count && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.guest_count.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                Event Date *
              </label>
              <input
                type="date"
                {...form.register('event_date')}
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {form.formState.errors.event_date && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.event_date.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-800 mb-1.5">
                  Start Time *
                </label>
                <input
                  type="time"
                  {...form.register('start_time')}
                  className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                />
                {form.formState.errors.start_time && (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.start_time.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-800 mb-1.5">
                  End Time (Optional)
                </label>
                <input
                  type="time"
                  {...form.register('end_time')}
                  className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                Event Venue Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Conservatory Pavilion or Office Atrium"
                {...form.register('event_venue')}
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {form.formState.errors.event_venue && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.event_venue.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                Venue Setting (Optional)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['indoor', 'outdoor', 'unspecified'] as const).map((setting) => (
                  <button
                    key={setting}
                    type="button"
                    onClick={() => form.setValue('venue_setting', setting)}
                    className={`py-2.5 px-3 text-xs font-medium rounded-lg border capitalize transition-colors ${
                      watchedValues.venue_setting === setting
                        ? 'bg-[#1B4332] text-white border-[#1B4332]'
                        : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    {setting === 'unspecified' ? 'Not Sure' : setting}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                Complete Delivery Address *
              </label>
              <input
                type="text"
                placeholder="Street address, suite or loading dock instructions, city, ZIP"
                {...form.register('delivery_address')}
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {form.formState.errors.delivery_address && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.delivery_address.message}</p>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: FOOD PREFERENCES */}
        {step === 2 && (
          <div className="space-y-8">
            {/* Selected Package Picker */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-stone-900">
                    Catering Package (Optional)
                  </h4>
                  <p className="text-xs text-stone-500">
                    Choose a curated package or leave unselected to build a 100% custom menu below.
                  </p>
                </div>
                {selectedPackage && (
                  <button
                    type="button"
                    onClick={() => onSelectPackage(null)}
                    className="text-xs font-medium text-stone-600 hover:text-stone-900 underline"
                  >
                    Clear package
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {packages
                  .filter((p) => p.is_available)
                  .map((pkg) => {
                    const active = selectedPackage?.id === pkg.id;
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => onSelectPackage(active ? null : pkg)}
                        className={`text-left p-4 rounded-lg border transition-colors ${
                          active
                            ? 'border-[#1B4332] bg-[#1B4332]/5'
                            : 'border-stone-200 bg-white hover:border-stone-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-stone-900">{pkg.name}</span>
                          <span className="font-mono text-sm font-medium text-[#1B4332] tabular-nums shrink-0">
                            ${pkg.price.toFixed(2)}{' '}
                            <span className="text-xs text-stone-500 font-sans">
                              {pkg.pricing_type === 'per_person' ? '/ guest' : 'flat'}
                            </span>
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-1 line-clamp-2">{pkg.description}</p>
                        <p className="text-xs text-stone-600 mt-2">Min {pkg.min_guests} guests</p>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Custom Food Items */}
            <div className="border-t border-stone-200 pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-sm font-semibold text-stone-900">
                    Custom Menu Items &amp; Bulk Trays ({cartItems.length} selected)
                  </h4>
                  <p className="text-xs text-stone-500">
                    Add individual trays, packed meal boxes, or dessert assortments.
                  </p>
                </div>
                <select
                  aria-label="Quick add menu item"
                  value=""
                  onChange={(e) => {
                    const found = foodItems.find((fi) => fi.id === Number(e.target.value));
                    if (found) onAddFoodItem(found);
                  }}
                  className="px-3 py-2 border border-stone-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                >
                  <option value="">+ Quick add dish from menu...</option>
                  {foodItems
                    .filter((f) => f.is_available)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} {f.unit_price ? `($${f.unit_price.toFixed(2)} ${f.price_unit})` : '(Custom Quote)'}
                      </option>
                    ))}
                </select>
              </div>

              {cartItems.length === 0 ? (
                <div className="p-5 rounded-lg border border-dashed border-stone-300 bg-[#FAFAF9] text-center text-xs text-stone-500">
                  No individual menu items added yet. Use the quick-add dropdown above or browse the Food Menu section.
                </div>
              ) : (
                <div className="divide-y divide-stone-200 border border-stone-200 rounded-lg">
                  {cartItems.map((entry) => (
                    <div
                      key={entry.foodItem.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-stone-900">{entry.foodItem.name}</div>
                        <div className="text-xs text-stone-500 mt-0.5">
                          {entry.foodItem.unit_price !== null
                            ? `$${entry.foodItem.unit_price.toFixed(2)} ${entry.foodItem.price_unit}`
                            : 'Pricing quoted upon review'}{' '}
                          · Min qty {entry.foodItem.min_order_qty}
                          {entry.selectedAddons.length > 0 &&
                            ` · Add-ons: ${entry.selectedAddons.map((a) => a.name).join(', ')}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center border border-stone-300 rounded-lg">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateCartItemQty(
                                entry.foodItem.id,
                                Math.max(entry.foodItem.min_order_qty, entry.quantity - 1)
                              )
                            }
                            className="p-1.5 text-stone-600 hover:text-stone-900"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-3 text-xs font-mono tabular-nums">{entry.quantity}</span>
                          <button
                            type="button"
                            onClick={() => onUpdateCartItemQty(entry.foodItem.id, entry.quantity + 1)}
                            className="p-1.5 text-stone-600 hover:text-stone-900"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveCartItem(entry.foodItem.id)}
                          className="p-1.5 text-stone-400 hover:text-red-600"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Additional Services & Dietary */}
            <div className="border-t border-stone-200 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-stone-800 mb-2">
                  Additional Services (Optional)
                </label>
                <div className="space-y-2">
                  {(services.length > 0
                    ? services.map((s) => ({
                        title: s.title,
                        hint:
                          s.price_type === 'included'
                            ? 'Included'
                            : s.price_type === 'custom'
                            ? 'Custom quote'
                            : `$${Number(s.price).toFixed(2)}${s.price_type === 'per_person' ? '/guest' : ''}`,
                      }))
                    : DEFAULT_SERVICE_OPTIONS.map((t) => ({ title: t, hint: '' }))
                  ).map((svc) => {
                    const checked = selectedServices.includes(svc.title);
                    return (
                      <label
                        key={svc.title}
                        className="flex items-center justify-between gap-2.5 text-sm text-stone-700 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleService(svc.title)}
                            className="w-4 h-4 rounded border-stone-300 accent-[#1B4332]"
                          />
                          <span>{svc.title}</span>
                        </span>
                        {svc.hint && (
                          <span className="text-xs font-mono text-stone-400 tabular-nums">
                            {svc.hint}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-800 mb-1.5">
                    Dietary Requirements
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 10 vegan, 5 gluten-free, halal"
                    {...form.register('dietary_requirements')}
                    className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-800 mb-1.5">
                    Food Allergies
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Severe peanut allergy, shellfish-free"
                    {...form.register('food_allergies')}
                    className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-800 mb-1.5">
                    Special Instructions
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Serving schedule, loading access, custom dishes, or theme notes"
                    {...form.register('special_instructions')}
                    className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: CUSTOMER INFORMATION */}
        {step === 3 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                Full Name *
              </label>
              <input
                type="text"
                placeholder="Jordan Alvarez"
                {...form.register('full_name')}
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {form.formState.errors.full_name && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.full_name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                Contact Number *
              </label>
              <input
                type="tel"
                placeholder="+1 (415) 555-0190"
                {...form.register('phone')}
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {form.formState.errors.phone && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.phone.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                Email Address *
              </label>
              <input
                type="email"
                placeholder="jordan@company.com"
                {...form.register('email')}
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {form.formState.errors.email && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                Company / Organization (Optional)
              </label>
              <input
                type="text"
                placeholder="Optional organization name"
                {...form.register('company_name')}
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-stone-800 mb-2">
                Preferred Contact Method *
              </label>
              <div className="grid grid-cols-3 gap-3 max-w-md">
                {(['Email', 'Phone', 'Messenger'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => form.setValue('preferred_contact', method)}
                    className={`py-2.5 px-4 text-sm font-medium rounded-lg border transition-colors ${
                      watchedValues.preferred_contact === method
                        ? 'bg-[#1B4332] text-white border-[#1B4332]'
                        : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: REVIEW & SUBMIT */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#FAFAF9] border border-stone-200 rounded-lg p-5">
              <div>
                <h4 className="text-xs uppercase tracking-wider text-stone-500 mb-2">Event Summary</h4>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Occasion</dt>
                    <dd className="font-medium text-stone-900">{watchedValues.event_type_name}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Date &amp; Time</dt>
                    <dd className="font-mono text-stone-900 tabular-nums">
                      {watchedValues.event_date} · {watchedValues.start_time}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Guests</dt>
                    <dd className="font-mono text-stone-900 tabular-nums">{guestCount} guests</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Venue</dt>
                    <dd className="font-medium text-stone-900 text-right">{watchedValues.event_venue}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Delivery</dt>
                    <dd className="text-stone-700 text-right max-w-[240px]">{watchedValues.delivery_address}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <h4 className="text-xs uppercase tracking-wider text-stone-500 mb-2">Contact &amp; Services</h4>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Contact</dt>
                    <dd className="font-medium text-stone-900">{watchedValues.full_name}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Email</dt>
                    <dd className="text-stone-700">{watchedValues.email}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Phone</dt>
                    <dd className="font-mono text-stone-700 tabular-nums">{watchedValues.phone}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Preferred</dt>
                    <dd className="text-stone-900">{watchedValues.preferred_contact}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Services</dt>
                    <dd className="text-stone-700 text-right">
                      {selectedServices.length > 0 ? selectedServices.join(', ') : 'None requested'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="border border-stone-200 rounded-lg p-5">
              <h4 className="text-xs uppercase tracking-wider text-stone-500 mb-3">
                Selected Package &amp; Menu Items
              </h4>
              <div className="space-y-2 text-sm">
                {selectedPackage && (
                  <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                    <div>
                      <span className="font-medium text-stone-900">{selectedPackage.name}</span>
                      <span className="text-stone-500 ml-2 text-xs">
                        ({selectedPackage.pricing_type === 'per_person'
                          ? `${guestCount} guests × $${selectedPackage.price.toFixed(2)}`
                          : 'Flat package'})
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-stone-900">
                      $
                      {(selectedPackage.pricing_type === 'per_person'
                        ? selectedPackage.price * Math.max(guestCount, selectedPackage.min_guests)
                        : selectedPackage.price
                      ).toFixed(2)}
                    </span>
                  </div>
                )}
                {cartItems.map((entry) => {
                  const addonSum = entry.selectedAddons.reduce((s, a) => s + a.price, 0);
                  const line =
                    entry.foodItem.unit_price !== null
                      ? (entry.foodItem.unit_price + addonSum) * entry.quantity
                      : null;
                  return (
                    <div
                      key={entry.foodItem.id}
                      className="flex items-center justify-between py-1.5 border-b border-stone-100 last:border-0"
                    >
                      <div>
                        <span className="font-medium text-stone-900">{entry.foodItem.name}</span>
                        <span className="text-stone-500 ml-2 text-xs">× {entry.quantity}</span>
                      </div>
                      <span className="font-mono tabular-nums text-stone-900">
                        {line !== null ? `$${line.toFixed(2)}` : 'Quoted on review'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {estimatedTotal !== null && (
                <div className="mt-4 pt-4 border-t border-stone-200 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-stone-900">Estimated Food Subtotal</div>
                    <div className="text-xs text-stone-500">
                      Excludes final delivery, service charge, and taxes until staff prepares your formal quote.
                    </div>
                  </div>
                  <div className="font-mono text-lg font-semibold text-[#1B4332] tabular-nums">
                    ${estimatedTotal.toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            {/* Honeypot field */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              {...form.register('website_honeypot')}
            />

            <div className="space-y-3 bg-[#FAFAF9] border border-stone-200 rounded-lg p-5">
              <label className="flex items-start gap-3 text-sm text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  {...form.register('privacy_consent')}
                  className="mt-0.5 w-4 h-4 rounded border-stone-300 accent-[#1B4332]"
                />
                <span>
                  I consent to {restaurant.name} storing and using my event and contact details to prepare
                  a catering quotation. Submitting this form does not confirm date availability or charge
                  any fees.
                </span>
              </label>
              {form.formState.errors.privacy_consent && (
                <p className="text-xs text-red-600">{form.formState.errors.privacy_consent.message}</p>
              )}

              <label className="flex items-center gap-3 text-sm text-stone-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  {...form.register('captcha_checked')}
                  className="w-4 h-4 rounded border-stone-300 accent-[#1B4332]"
                />
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#1B4332]" />
                  Confirm this is a genuine catering inquiry
                </span>
              </label>
              {form.formState.errors.captcha_checked && (
                <p className="text-xs text-red-600">{form.formState.errors.captcha_checked.message}</p>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-8 pt-6 border-t border-stone-200 flex items-center justify-between gap-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-stone-300 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-50 transition-colors whitespace-nowrap"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
          ) : (
            <div className="text-xs text-stone-500">
              No payment required · Response within 1 business day
            </div>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-[#1B4332] text-white text-sm font-medium rounded-lg hover:bg-[#143326] transition-colors whitespace-nowrap"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#1B4332] text-white text-sm font-medium rounded-lg hover:bg-[#143326] disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {submitting ? 'Submitting Inquiry...' : 'Submit Quotation Request'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
