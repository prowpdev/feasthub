import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api';
import type { Restaurant, RestaurantService } from '../types/catering';

interface LandingPageManagerProps {
  token: string;
  targetRestaurantId?: number | null;
  onPreviewLivePage?: (slug: string) => void;
  onUpdated?: () => void;
}

const HERO_PRESETS = [
  { label: 'Sunlit Catering Banquet', url: '/src/assets/images/hero_catering_banquet_1795136239169.jpg' },
  { label: 'Wedding Plated Dining', url: '/src/assets/images/event_wedding_banquet_1795136243199.jpg' },
  { label: 'Corporate Buffet Spread', url: '/src/assets/images/event_corporate_buffet_1795136243249.jpg' },
  { label: 'Family Gathering Feast', url: '/src/assets/images/event_family_gathering_1795136243668.jpg' },
  { label: 'Community Celebration', url: '/src/assets/images/event_community_feast_1795136243259.jpg' },
];

export function LandingPageManager({
  token,
  targetRestaurantId,
  onPreviewLivePage,
  onUpdated,
}: LandingPageManagerProps) {
  const [loading, setLoading] = useState(true);
  const [savingPage, setSavingPage] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [services, setServices] = useState<RestaurantService[]>([]);
  const [editingService, setEditingService] = useState<Partial<RestaurantService> | null>(null);
  const [savingService, setSavingService] = useState(false);

  const querySuffix = targetRestaurantId ? `?restaurant_id=${targetRestaurantId}` : '';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.landingPage(token, querySuffix);
      if (res.ok) {
        const data = await res.json();
        setRestaurant(data.restaurant);
        setServices(data.services);
      }
    } finally {
      setLoading(false);
    }
  }, [token, querySuffix]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSaveLandingPage(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurant) return;
    setSavingPage(true);
    setSavedBanner(null);
    try {
      const res = await api.admin.saveLandingPage({
          ...restaurant,
          restaurant_id: targetRestaurantId || restaurant.id,
        }, token, querySuffix);
      if (res.ok) {
        setSavedBanner('Landing page configuration published.');
        onUpdated?.();
      }
    } finally {
      setSavingPage(false);
    }
  }

  async function handleSaveService(e: React.FormEvent) {
    e.preventDefault();
    if (!editingService || !restaurant) return;
    setSavingService(true);
    try {
      const isEdit = Boolean(editingService.id);
      const payload = {
          ...editingService,
          restaurant_id: targetRestaurantId || restaurant.id,
        };
      if (editingService.id) {
        await api.admin.updateService(editingService.id, payload, token, querySuffix);
      } else {
        await api.admin.createService(payload, token, querySuffix);
      }
      setEditingService(null);
      await loadData();
      onUpdated?.();
    } finally {
      setSavingService(false);
    }
  }

  async function handleDeleteService(id: number) {
    await api.admin.deleteService(id, token, querySuffix);
    await loadData();
    onUpdated?.();
  }

  if (loading || !restaurant) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-8 text-sm text-stone-500">
        Loading landing page configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-stone-500">
            Storefront Slug: {restaurant.slug} · Status:{' '}
            <span className={restaurant.is_published ? 'text-[#16A34A] font-medium' : 'text-[#D97706]'}>
              {restaurant.is_published ? 'Published Live' : 'Draft Hidden'}
            </span>
          </div>
          <h2 className="font-display text-2xl text-stone-900 mt-0.5">
            {restaurant.name} — Landing Page &amp; Services
          </h2>
        </div>

        {onPreviewLivePage && (
          <button
            type="button"
            onClick={() => onPreviewLivePage(restaurant.slug)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-stone-300 rounded-lg text-xs font-medium text-stone-800 hover:bg-stone-50 whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View Live Landing Page
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Landing Page Editor Form */}
        <form
          onSubmit={handleSaveLandingPage}
          className="xl:col-span-7 bg-white border border-stone-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <h3 className="text-sm font-semibold text-stone-900">Hero, Branding &amp; Story</h3>
            <label className="flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={restaurant.is_published}
                onChange={(e) => setRestaurant({ ...restaurant, is_published: e.target.checked })}
                className="accent-[#1B4332]"
              />
              <span>Publish Public Page</span>
            </label>
          </div>

          {savedBanner && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              {savedBanner}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Brand Name</label>
              <input
                type="text"
                value={restaurant.name}
                onChange={(e) => setRestaurant({ ...restaurant, name: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Brand Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={restaurant.brand_color}
                  onChange={(e) => setRestaurant({ ...restaurant, brand_color: e.target.value })}
                  className="h-9 w-12 rounded border border-stone-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={restaurant.brand_color}
                  onChange={(e) => setRestaurant({ ...restaurant, brand_color: e.target.value })}
                  className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">Kitchen Tagline</label>
            <input
              type="text"
              value={restaurant.tagline}
              onChange={(e) => setRestaurant({ ...restaurant, tagline: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">Hero Headline</label>
            <input
              type="text"
              value={restaurant.hero_headline}
              onChange={(e) => setRestaurant({ ...restaurant, hero_headline: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">Hero Subheadline</label>
            <textarea
              rows={2}
              value={restaurant.hero_subheadline}
              onChange={(e) => setRestaurant({ ...restaurant, hero_subheadline: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Primary CTA Label</label>
              <input
                type="text"
                value={restaurant.cta_primary_text}
                onChange={(e) => setRestaurant({ ...restaurant, cta_primary_text: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Secondary CTA Label</label>
              <input
                type="text"
                value={restaurant.cta_secondary_text}
                onChange={(e) => setRestaurant({ ...restaurant, cta_secondary_text: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">Hero Image</label>
            <select
              value={restaurant.hero_image_url}
              onChange={(e) => setRestaurant({ ...restaurant, hero_image_url: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
            >
              {HERO_PRESETS.map((p) => (
                <option key={p.url} value={p.url}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">About Section Title</label>
            <input
              type="text"
              value={restaurant.about_title}
              onChange={(e) => setRestaurant({ ...restaurant, about_title: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              About / Culinary Story
            </label>
            <textarea
              rows={3}
              value={restaurant.about_description}
              onChange={(e) => setRestaurant({ ...restaurant, about_description: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingPage}
              className="px-5 py-2.5 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326] disabled:opacity-60"
            >
              {savingPage ? 'Saving Changes...' : 'Save Landing Page'}
            </button>
          </div>
        </form>

        {/* Services Manager */}
        <div className="xl:col-span-5 bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">
                Owner Catering Services ({services.length})
              </h3>
              <p className="text-xs text-stone-500">
                Displayed on the landing page and selectable in Step 2 of the quote form.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setEditingService({
                  title: '',
                  description: '',
                  price_type: 'flat',
                  price: 150,
                  is_available: true,
                })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326] whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Service
            </button>
          </div>

          <div className="divide-y divide-stone-100">
            {services.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500">
                No custom services configured yet. Add services like Waitstaff, Setup, or Carving Stations.
              </div>
            ) : (
              services.map((svc) => (
                <div key={svc.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-stone-900">{svc.title}</span>
                      <span
                        className={`text-[11px] font-medium ${
                          svc.is_available ? 'text-[#16A34A]' : 'text-stone-400'
                        }`}
                      >
                        {svc.is_available ? 'Active' : 'Hidden'}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">{svc.description}</p>
                    <div className="text-xs font-mono tabular-nums text-[#1B4332] mt-1">
                      {svc.price_type === 'included'
                        ? 'Complimentary / Included'
                        : svc.price_type === 'custom'
                        ? 'Custom Quoted'
                        : `$${Number(svc.price).toFixed(2)} ${
                            svc.price_type === 'per_person' ? 'per guest' : 'flat fee'
                          }`}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingService({ ...svc })}
                      className="p-1.5 text-stone-500 hover:text-stone-900"
                      aria-label="Edit service"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteService(svc.id)}
                      className="p-1.5 text-stone-400 hover:text-red-600"
                      aria-label="Delete service"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Service Modal */}
      {editingService && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveService}
            className="bg-white border border-stone-200 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="font-display text-xl text-stone-900">
                {editingService.id ? 'Edit Catering Service' : 'Add Catering Service'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="text-stone-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Service Title *</label>
              <input
                required
                type="text"
                placeholder="e.g. Live Pasta & Risotto Chef Station"
                value={editingService.title || ''}
                onChange={(e) => setEditingService({ ...editingService, title: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Description</label>
              <textarea
                rows={2}
                placeholder="Describe equipment, staffing hours, or setup scope"
                value={editingService.description || ''}
                onChange={(e) =>
                  setEditingService({ ...editingService, description: e.target.value })
                }
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Pricing Model</label>
                <select
                  value={editingService.price_type || 'flat'}
                  onChange={(e) =>
                    setEditingService({
                      ...editingService,
                      price_type: e.target.value as RestaurantService['price_type'],
                    })
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                >
                  <option value="flat">Flat Fee</option>
                  <option value="per_person">Per Guest</option>
                  <option value="included">Included</option>
                  <option value="custom">Custom Quote</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Price ($)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editingService.price ?? 0}
                  onChange={(e) =>
                    setEditingService({ ...editingService, price: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={editingService.is_available !== false}
                onChange={(e) =>
                  setEditingService({ ...editingService, is_available: e.target.checked })
                }
                className="accent-[#1B4332]"
              />
              <span>Visible on public landing page &amp; quote form</span>
            </label>

            <div className="pt-3 border-t border-stone-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="px-4 py-2 border border-stone-300 rounded-lg text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingService}
                className="px-4 py-2 bg-[#1B4332] text-white rounded-lg text-xs font-medium"
              >
                {savingService ? 'Saving...' : 'Save Service'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
