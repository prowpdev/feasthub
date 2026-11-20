import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Check, Plus, Store, Trash2 } from 'lucide-react';
import { ownerRegisterSchema, type OwnerRegisterValues } from '../lib/validation';
import { api } from '../api';
import { ResilientImage } from './ResilientImage';
import type { AuthUser } from '../types/catering';

interface OwnerRegisterViewProps {
  onBack: () => void;
  onRegistered: (payload: { token: string; user: AuthUser; slug: string }) => void;
}

const HERO_PRESETS = [
  { label: 'Sunlit Catering Banquet', url: '/src/assets/images/hero_catering_banquet_1795136239169.jpg' },
  { label: 'Wedding Plated Dining', url: '/src/assets/images/event_wedding_banquet_1795136243199.jpg' },
  { label: 'Corporate Buffet Spread', url: '/src/assets/images/event_corporate_buffet_1795136243249.jpg' },
  { label: 'Family Gathering Feast', url: '/src/assets/images/event_family_gathering_1795136243668.jpg' },
];

const BRAND_SWATCHES = ['#1B4332', '#264653', '#3F2E26', '#1E293B', '#4C1D95', '#7F1D1D'];

interface StarterServiceInput {
  title: string;
  description: string;
  price_type: 'flat' | 'per_person' | 'included' | 'custom';
  price: number;
}

export function OwnerRegisterView({ onBack, onRegistered }: OwnerRegisterViewProps) {
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [starterServices, setStarterServices] = useState<StarterServiceInput[]>([
    {
      title: 'Food setup & Buffet arrangement',
      description: 'Chafing dishes, risers, serving utensils, and printed menu signage.',
      price_type: 'flat',
      price: 150,
    },
    {
      title: 'Waitstaff & Event Captain',
      description: 'Uniformed hospitality staff for table service and teardown.',
      price_type: 'per_person',
      price: 18,
    },
    {
      title: 'Food delivery',
      description: 'Insulated temperature-controlled courier delivery to your venue.',
      price_type: 'flat',
      price: 95,
    },
  ]);

  const form = useForm<OwnerRegisterValues>({
    resolver: zodResolver(ownerRegisterSchema),
    defaultValues: {
      owner_name: '',
      email: '',
      password: '',
      restaurant_name: '',
      slug: '',
      tagline: 'Seasonal Catering & Custom Event Dining',
      phone: '',
      address: '',
      brand_color: '#1B4332',
      hero_headline: 'Make Every Occasion Delicious',
      hero_subheadline:
        'From intimate family gatherings to grand celebrations, let us take care of the food.',
      hero_image_url: HERO_PRESETS[0].url,
      about_title: 'Crafted From Scratch For Your Table',
      about_description:
        'Our kitchen prepares tailored menus from fresh seasonal ingredients for corporate lunches, weddings, and private celebrations.',
    },
  });

  const watched = form.watch();
  const previewSlug = (watched.slug || watched.restaurant_name || 'your-restaurant')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  function addServiceRow() {
    setStarterServices((prev) => [
      ...prev,
      { title: '', description: '', price_type: 'flat', price: 0 },
    ]);
  }

  async function onSubmit(values: OwnerRegisterValues) {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await api.public.registerOwner({
          ...values,
          starter_services: starterServices.filter((s) => s.title.trim().length >= 2),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error || 'Could not complete registration.');
        return;
      }
      localStorage.setItem('catering_admin_token', data.token);
      onRegistered({
        token: data.token,
        user: data.user,
        slug: data.restaurant.slug,
      });
    } catch {
      setServerError('Network error while creating your restaurant page.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-stone-900">
      <header className="bg-white border-b border-stone-200 px-6 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-700 hover:text-stone-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Storefront
        </button>
        <span className="font-display text-lg font-semibold text-stone-900">
          Restaurant Partner Onboarding
        </span>
        <div className="w-24" />
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider text-[#1B4332] font-medium mb-1">
            Launch Your Catering Storefront
          </p>
          <h1 className="font-display text-3xl sm:text-4xl text-stone-900">
            Register Your Restaurant &amp; Create Your Landing Page
          </h1>
          <p className="text-sm text-stone-600 mt-2 max-w-2xl">
            Set up your owner account, customize your hero banner and brand palette, and publish
            your catering services. Your public page goes live immediately with its own inquiry
            pipeline.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-6 md:p-8 space-y-8"
          >
            {serverError && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                {serverError}
              </div>
            )}

            {/* Section 1: Owner Account */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
                <Store className="w-4 h-4 text-[#1B4332]" />
                <h2 className="text-sm font-semibold text-stone-900">
                  01. Owner Account &amp; Kitchen Profile
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Owner Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="Chef Matteo Bellini"
                    {...form.register('owner_name')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                  {form.formState.errors.owner_name && (
                    <p className="mt-1 text-xs text-red-600">
                      {form.formState.errors.owner_name.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Login &amp; Inquiry Email *
                  </label>
                  <input
                    type="email"
                    placeholder="owner@bellinikitchen.com"
                    {...form.register('email')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                  {form.formState.errors.email && (
                    <p className="mt-1 text-xs text-red-600">{form.formState.errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Dashboard Password (min 8 chars) *
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    {...form.register('password')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                  {form.formState.errors.password && (
                    <p className="mt-1 text-xs text-red-600">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Business Phone *
                  </label>
                  <input
                    type="tel"
                    placeholder="+1 (415) 555-0199"
                    {...form.register('phone')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                  {form.formState.errors.phone && (
                    <p className="mt-1 text-xs text-red-600">{form.formState.errors.phone.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Restaurant Brand Name *
                  </label>
                  <input
                    type="text"
                    placeholder="Bellini Harvest Kitchen"
                    {...form.register('restaurant_name')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                  {form.formState.errors.restaurant_name && (
                    <p className="mt-1 text-xs text-red-600">
                      {form.formState.errors.restaurant_name.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Custom URL Slug (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder={previewSlug}
                    {...form.register('slug')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Kitchen Address *
                  </label>
                  <input
                    type="text"
                    placeholder="742 Valencia Street, San Francisco, CA 94110"
                    {...form.register('address')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                  {form.formState.errors.address && (
                    <p className="mt-1 text-xs text-red-600">
                      {form.formState.errors.address.message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Landing Page Design */}
            <div className="space-y-4">
              <div className="border-b border-stone-200 pb-2">
                <h2 className="text-sm font-semibold text-stone-900">
                  02. Landing Page Copy &amp; Visual Identity
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Kitchen Tagline *
                  </label>
                  <input
                    type="text"
                    {...form.register('tagline')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Hero Headline *
                  </label>
                  <input
                    type="text"
                    {...form.register('hero_headline')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Hero Subheadline *
                  </label>
                  <textarea
                    rows={2}
                    {...form.register('hero_subheadline')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Hero Photography
                  </label>
                  <select
                    {...form.register('hero_image_url')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                  >
                    {HERO_PRESETS.map((p) => (
                      <option key={p.url} value={p.url}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Brand Accent Color
                  </label>
                  <div className="flex items-center gap-2 pt-1">
                    {BRAND_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => form.setValue('brand_color', hex)}
                        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center ${
                          watched.brand_color === hex ? 'border-stone-900 scale-105' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: hex }}
                        aria-label={`Select color ${hex}`}
                      >
                        {watched.brand_color === hex && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                    <input
                      type="text"
                      {...form.register('brand_color')}
                      className="w-20 px-2 py-1 border border-stone-300 rounded text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    About Section Title *
                  </label>
                  <input
                    type="text"
                    {...form.register('about_title')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    About Your Restaurant Story *
                  </label>
                  <textarea
                    rows={2}
                    {...form.register('about_description')}
                    className="w-full px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Starter Services */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                <h2 className="text-sm font-semibold text-stone-900">
                  03. Catering Services You Offer
                </h2>
                <button
                  type="button"
                  onClick={addServiceRow}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4332] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Service
                </button>
              </div>

              <div className="space-y-3">
                {starterServices.map((svc, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg border border-stone-200 bg-[#FAFAF9] space-y-2.5"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <input
                        type="text"
                        placeholder="Service title (e.g. Live Carving Station)"
                        value={svc.title}
                        onChange={(e) =>
                          setStarterServices((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, title: e.target.value } : s))
                          )
                        }
                        className="sm:col-span-6 px-3 py-1.5 border border-stone-300 rounded text-xs bg-white font-medium"
                      />
                      <select
                        value={svc.price_type}
                        onChange={(e) =>
                          setStarterServices((prev) =>
                            prev.map((s, i) =>
                              i === idx
                                ? { ...s, price_type: e.target.value as StarterServiceInput['price_type'] }
                                : s
                            )
                          )
                        }
                        className="sm:col-span-3 px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white"
                      >
                        <option value="flat">Flat Fee</option>
                        <option value="per_person">Per Guest</option>
                        <option value="included">Included</option>
                        <option value="custom">Custom Quote</option>
                      </select>
                      <div className="sm:col-span-2 flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          value={svc.price}
                          onChange={(e) =>
                            setStarterServices((prev) =>
                              prev.map((s, i) =>
                                i === idx ? { ...s, price: Number(e.target.value) } : s
                              )
                            )
                          }
                          className="w-full px-2 py-1.5 border border-stone-300 rounded text-xs bg-white font-mono tabular-nums text-right"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setStarterServices((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="sm:col-span-1 flex items-center justify-center text-stone-400 hover:text-red-600"
                        aria-label="Remove service"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Short description of what is included"
                      value={svc.description}
                      onChange={(e) =>
                        setStarterServices((prev) =>
                          prev.map((s, i) =>
                            i === idx ? { ...s, description: e.target.value } : s
                          )
                        )
                      }
                      className="w-full px-3 py-1.5 border border-stone-200 rounded text-xs bg-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-stone-200 flex items-center justify-between gap-4">
              <span className="text-xs text-stone-500">
                Includes starter menu items, event categories, and quotation builder.
              </span>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-[#1B4332] text-white text-sm font-medium rounded-lg hover:bg-[#143326] disabled:opacity-60 whitespace-nowrap"
              >
                {submitting ? 'Creating Landing Page...' : 'Launch Restaurant & Landing Page'}
              </button>
            </div>
          </form>

          {/* Live Mini Landing Page Preview */}
          <aside className="lg:col-span-5 lg:sticky lg:top-8 space-y-4">
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-stone-100 border-b border-stone-200 flex items-center justify-between text-[11px] font-mono text-stone-600">
                <span>LIVE LANDING PAGE PREVIEW</span>
                <span className="truncate max-w-[180px]">/?restaurant={previewSlug}</span>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <span className="font-display text-base font-semibold text-stone-900">
                    {watched.restaurant_name || 'Your Restaurant Name'}
                  </span>
                  <span
                    className="px-2.5 py-1 rounded text-[11px] font-medium text-white"
                    style={{ backgroundColor: watched.brand_color || '#1B4332' }}
                  >
                    Request Quote
                  </span>
                </div>
                <div className="aspect-[16/9] rounded-lg overflow-hidden border border-stone-200">
                  <ResilientImage
                    src={watched.hero_image_url}
                    alt={watched.restaurant_name || 'Hero Preview'}
                  />
                </div>
                <div>
                  <p
                    className="text-[11px] uppercase tracking-wider font-medium mb-1"
                    style={{ color: watched.brand_color || '#1B4332' }}
                  >
                    {watched.tagline}
                  </p>
                  <h3 className="font-display text-xl text-stone-900 leading-snug mb-1.5">
                    {watched.hero_headline}
                  </h3>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    {watched.hero_subheadline}
                  </p>
                </div>
                <div className="pt-3 border-t border-stone-100">
                  <div className="text-xs font-semibold text-stone-800 mb-1.5">
                    {watched.about_title}
                  </div>
                  <p className="text-xs text-stone-600 line-clamp-3">{watched.about_description}</p>
                </div>
                <div className="pt-3 border-t border-stone-100">
                  <div className="text-xs font-semibold text-stone-800 mb-2">
                    Featured Services ({starterServices.filter((s) => s.title.trim()).length})
                  </div>
                  <ul className="space-y-1.5">
                    {starterServices
                      .filter((s) => s.title.trim())
                      .map((s, idx) => (
                        <li
                          key={idx}
                          className="text-xs flex items-center justify-between text-stone-700"
                        >
                          <span>{s.title}</span>
                          <span className="font-mono tabular-nums text-stone-500">
                            {s.price_type === 'included'
                              ? 'Included'
                              : s.price_type === 'custom'
                              ? 'Quote'
                              : `$${s.price}${s.price_type === 'per_person' ? '/guest' : ''}`}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
