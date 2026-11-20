import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api';
import type { CateringPackage, FoodCategory, FoodItem } from '../types/catering';

interface CatalogManagerProps {
  token: string;
  packages: CateringPackage[];
  categories: FoodCategory[];
  foodItems: FoodItem[];
  onRefresh: () => void;
}

const IMAGE_PRESETS = [
  { label: 'Banquet Spread', url: '/src/assets/images/hero_catering_banquet_1795136239169.jpg' },
  { label: 'Wedding Plated', url: '/src/assets/images/event_wedding_banquet_1795136243199.jpg' },
  { label: 'Corporate Buffet', url: '/src/assets/images/event_corporate_buffet_1795136243249.jpg' },
  { label: 'Packed Meal Boxes', url: '/src/assets/images/event_packed_meals_1795136242777.jpg' },
  { label: 'Herb Roast Beef', url: '/src/assets/images/dish_herb_roast_beef_1795136242853.jpg' },
  { label: 'Pan-Seared Salmon', url: '/src/assets/images/dish_pan_seared_salmon_1795136242731.jpg' },
  { label: 'Artisan Desserts', url: '/src/assets/images/dish_artisan_desserts_1795136243576.jpg' },
  { label: 'Family Gathering', url: '/src/assets/images/event_family_gathering_1795136243668.jpg' },
];

export function CatalogManager({
  token,
  packages,
  categories,
  foodItems,
  onRefresh,
}: CatalogManagerProps) {
  const [subTab, setSubTab] = useState<'packages' | 'items' | 'categories'>('packages');
  const [editingPkg, setEditingPkg] = useState<Partial<CateringPackage> | null>(null);
  const [editingFood, setEditingFood] = useState<Partial<FoodItem> | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSavePackage(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPkg) return;
    setSaving(true);
    try {
      if (editingPkg.id) {
        await api.admin.updatePackage(editingPkg.id, editingPkg, token);
      } else {
        await api.admin.createPackage(editingPkg, token);
      }
      setEditingPkg(null);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePackage(id: number) {
    await api.admin.deletePackage(id, token);
    onRefresh();
  }

  async function handleSaveFood(e: React.FormEvent) {
    e.preventDefault();
    if (!editingFood) return;
    setSaving(true);
    try {
      if (editingFood.id) {
        await api.admin.updateFoodItem(editingFood.id, editingFood, token);
      } else {
        await api.admin.createFoodItem(editingFood, token);
      }
      setEditingFood(null);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteFood(id: number) {
    await api.admin.deleteFoodItem(id, token);
    onRefresh();
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    await api.admin.createCategory({ name: newCategoryName.trim() }, token);
    setNewCategoryName('');
    onRefresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
          {(['packages', 'items', 'categories'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSubTab(tab)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                subTab === tab
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {tab === 'packages'
                ? `Catering Packages (${packages.length})`
                : tab === 'items'
                ? `Food Items (${foodItems.length})`
                : `Categories (${categories.length})`}
            </button>
          ))}
        </div>

        {subTab === 'packages' && (
          <button
            type="button"
            onClick={() =>
              setEditingPkg({
                name: '',
                description: '',
                pricing_type: 'per_person',
                price: 55,
                min_guests: 20,
                inclusions: ['Starter Salad', 'Signature Entrée', 'Seasonal Side'],
                addons: [],
                image_url: IMAGE_PRESETS[0].url,
                is_available: true,
                is_seasonal: false,
                promo_label: '',
              })
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326]"
          >
            <Plus className="w-4 h-4" />
            New Package
          </button>
        )}

        {subTab === 'items' && (
          <button
            type="button"
            onClick={() =>
              setEditingFood({
                category_id: categories[0]?.id || 1,
                name: '',
                description: '',
                unit_price: 120,
                price_unit: 'per tray (serves 10)',
                min_order_qty: 1,
                dietary_tags: '',
                allergens: '',
                image_url: IMAGE_PRESETS[4].url,
                is_available: true,
                addons: [],
              })
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326]"
          >
            <Plus className="w-4 h-4" />
            New Food Item
          </button>
        )}
      </div>

      {/* PACKAGES TABLE */}
      {subTab === 'packages' && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
              <tr>
                <th className="py-3 px-4 font-medium">Package</th>
                <th className="py-3 px-4 font-medium">Pricing</th>
                <th className="py-3 px-4 font-medium">Min Guests</th>
                <th className="py-3 px-4 font-medium">Seasonal / Promo</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {packages.map((pkg) => (
                <tr key={pkg.id} className="hover:bg-stone-50/70">
                  <td className="py-3 px-4">
                    <div className="font-medium text-stone-900">{pkg.name}</div>
                    <div className="text-xs text-stone-500 line-clamp-1">{pkg.description}</div>
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums">
                    ${pkg.price.toFixed(2)}{' '}
                    <span className="text-xs text-stone-500 font-sans">
                      {pkg.pricing_type === 'per_person' ? '/guest' : 'flat'}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums">{pkg.min_guests}</td>
                  <td className="py-3 px-4 text-xs text-stone-600">
                    {pkg.is_seasonal ? pkg.promo_label || 'Seasonal' : 'Standard'}
                  </td>
                  <td className="py-3 px-4 text-xs font-medium">
                    <span className={pkg.is_available ? 'text-[#16A34A]' : 'text-stone-400'}>
                      {pkg.is_available ? 'Available' : 'Paused'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setEditingPkg({ ...pkg })}
                      className="p-1.5 text-stone-500 hover:text-stone-900"
                      aria-label="Edit package"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePackage(pkg.id)}
                      className="p-1.5 text-stone-400 hover:text-red-600"
                      aria-label="Delete package"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FOOD ITEMS TABLE */}
      {subTab === 'items' && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
              <tr>
                <th className="py-3 px-4 font-medium">Dish Name</th>
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 font-medium">Price</th>
                <th className="py-3 px-4 font-medium">Min Qty</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {foodItems.map((item) => {
                const cat = categories.find((c) => c.id === item.category_id);
                return (
                  <tr key={item.id} className="hover:bg-stone-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-stone-900">{item.name}</div>
                      <div className="text-xs text-stone-500">{item.dietary_tags || 'Standard'}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-stone-600">{cat?.name || 'Menu'}</td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      {item.unit_price !== null ? `$${item.unit_price.toFixed(2)}` : 'Custom Quote'}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">{item.min_order_qty}</td>
                    <td className="py-3 px-4 text-xs font-medium">
                      <span className={item.is_available ? 'text-[#16A34A]' : 'text-stone-400'}>
                        {item.is_available ? 'Available' : 'Unavailable'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditingFood({ ...item })}
                        className="p-1.5 text-stone-500 hover:text-stone-900"
                        aria-label="Edit food item"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFood(item.id)}
                        className="p-1.5 text-stone-400 hover:text-red-600"
                        aria-label="Delete food item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CATEGORIES */}
      {subTab === 'categories' && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 max-w-xl space-y-5">
          <form onSubmit={handleAddCategory} className="flex gap-3">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name (e.g. Beverage Stations)"
              className="flex-1 px-3.5 py-2 border border-stone-300 rounded-lg text-sm"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326]"
            >
              Add Category
            </button>
          </form>
          <ul className="divide-y divide-stone-100 border border-stone-200 rounded-lg">
            {categories.map((c) => (
              <li key={c.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <span className="font-medium text-stone-900">{c.name}</span>
                <span className="font-mono text-xs text-stone-400">{c.slug}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PACKAGE MODAL */}
      {editingPkg && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePackage}
            className="bg-white border border-stone-200 rounded-xl max-w-xl w-full max-h-[90vh] overflow-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="font-display text-xl text-stone-900">
                {editingPkg.id ? 'Edit Catering Package' : 'Create Catering Package'}
              </h3>
              <button type="button" onClick={() => setEditingPkg(null)} className="text-stone-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Package Name</label>
              <input
                required
                type="text"
                value={editingPkg.name || ''}
                onChange={(e) => setEditingPkg({ ...editingPkg, name: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Description</label>
              <textarea
                required
                rows={2}
                value={editingPkg.description || ''}
                onChange={(e) => setEditingPkg({ ...editingPkg, description: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Pricing Mode</label>
                <select
                  value={editingPkg.pricing_type || 'per_person'}
                  onChange={(e) =>
                    setEditingPkg({
                      ...editingPkg,
                      pricing_type: e.target.value as 'per_person' | 'flat_package',
                    })
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                >
                  <option value="per_person">Per Person</option>
                  <option value="flat_package">Flat Package</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Price ($)</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={editingPkg.price ?? 0}
                  onChange={(e) => setEditingPkg({ ...editingPkg, price: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Min Guests</label>
                <input
                  required
                  type="number"
                  value={editingPkg.min_guests ?? 20}
                  onChange={(e) =>
                    setEditingPkg({ ...editingPkg, min_guests: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Inclusions (one per line)
              </label>
              <textarea
                rows={4}
                value={(editingPkg.inclusions || []).join('\n')}
                onChange={(e) =>
                  setEditingPkg({
                    ...editingPkg,
                    inclusions: e.target.value.split('\n').filter(Boolean),
                  })
                }
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Image Preset</label>
                <select
                  value={editingPkg.image_url || IMAGE_PRESETS[0].url}
                  onChange={(e) => setEditingPkg({ ...editingPkg, image_url: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs"
                >
                  {IMAGE_PRESETS.map((img) => (
                    <option key={img.url} value={img.url}>
                      {img.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Seasonal Promotion Label
                </label>
                <input
                  type="text"
                  placeholder="e.g. Holiday Promo · 10% Off"
                  value={editingPkg.promo_label || ''}
                  onChange={(e) => setEditingPkg({ ...editingPkg, promo_label: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingPkg.is_available !== false}
                  onChange={(e) => setEditingPkg({ ...editingPkg, is_available: e.target.checked })}
                  className="accent-[#1B4332]"
                />
                <span>Available on Storefront</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editingPkg.is_seasonal)}
                  onChange={(e) => setEditingPkg({ ...editingPkg, is_seasonal: e.target.checked })}
                  className="accent-[#1B4332]"
                />
                <span>Seasonal / Promotional</span>
              </label>
            </div>

            <div className="pt-4 border-t border-stone-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingPkg(null)}
                className="px-4 py-2 border border-stone-300 rounded-lg text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-[#1B4332] text-white rounded-lg text-xs font-medium"
              >
                {saving ? 'Saving...' : 'Save Package'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FOOD ITEM MODAL */}
      {editingFood && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveFood}
            className="bg-white border border-stone-200 rounded-xl max-w-xl w-full max-h-[90vh] overflow-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="font-display text-xl text-stone-900">
                {editingFood.id ? 'Edit Food Item' : 'Add Menu Food Item'}
              </h3>
              <button type="button" onClick={() => setEditingFood(null)} className="text-stone-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Dish Name</label>
                <input
                  required
                  type="text"
                  value={editingFood.name || ''}
                  onChange={(e) => setEditingFood({ ...editingFood, name: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Category</label>
                <select
                  value={editingFood.category_id || categories[0]?.id || 1}
                  onChange={(e) =>
                    setEditingFood({ ...editingFood, category_id: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Description</label>
              <textarea
                required
                rows={2}
                value={editingFood.description || ''}
                onChange={(e) => setEditingFood({ ...editingFood, description: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Unit Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editingFood.unit_price ?? ''}
                  onChange={(e) =>
                    setEditingFood({
                      ...editingFood,
                      unit_price: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Price Unit</label>
                <input
                  type="text"
                  value={editingFood.price_unit || 'per tray'}
                  onChange={(e) => setEditingFood({ ...editingFood, price_unit: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Min Order Qty</label>
                <input
                  type="number"
                  min={1}
                  value={editingFood.min_order_qty ?? 1}
                  onChange={(e) =>
                    setEditingFood({ ...editingFood, min_order_qty: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Dietary Tags</label>
                <input
                  type="text"
                  placeholder="Gluten-Free, Vegetarian"
                  value={editingFood.dietary_tags || ''}
                  onChange={(e) => setEditingFood({ ...editingFood, dietary_tags: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Allergens</label>
                <input
                  type="text"
                  placeholder="Dairy, Tree Nuts"
                  value={editingFood.allergens || ''}
                  onChange={(e) => setEditingFood({ ...editingFood, allergens: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Dish Image</label>
              <select
                value={editingFood.image_url || IMAGE_PRESETS[4].url}
                onChange={(e) => setEditingFood({ ...editingFood, image_url: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              >
                {IMAGE_PRESETS.map((img) => (
                  <option key={img.url} value={img.url}>
                    {img.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={editingFood.is_available !== false}
                onChange={(e) => setEditingFood({ ...editingFood, is_available: e.target.checked })}
                className="accent-[#1B4332]"
              />
              <span>Available for customer requests</span>
            </label>

            <div className="pt-4 border-t border-stone-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingFood(null)}
                className="px-4 py-2 border border-stone-300 rounded-lg text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-[#1B4332] text-white rounded-lg text-xs font-medium"
              >
                {saving ? 'Saving...' : 'Save Menu Item'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
