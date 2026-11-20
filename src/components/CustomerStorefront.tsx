import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Columns3,
  Plus,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react';
import { ResilientImage } from './ResilientImage';
import { QuotationRequestWizard } from './QuotationRequestWizard';
import { InquiryTracker } from './InquiryTracker';
import type {
  AddonOption,
  CateringPackage,
  CustomCartItem,
  EventType,
  FoodCategory,
  FoodItem,
  Restaurant,
  RestaurantService,
} from '../types/catering';

interface CustomerStorefrontProps {
  restaurants: Restaurant[];
  activeSlug: string;
  onChangeRestaurant: (slug: string) => void;
  restaurant: Restaurant;
  eventTypes: EventType[];
  packages: CateringPackage[];
  categories: FoodCategory[];
  foodItems: FoodItem[];
  services: RestaurantService[];
  onOpenAdmin: () => void;
  onOpenRegisterOwner: () => void;
}

export function CustomerStorefront({
  restaurants,
  activeSlug,
  onChangeRestaurant,
  restaurant,
  eventTypes,
  packages,
  categories,
  foodItems,
  services,
  onOpenAdmin,
  onOpenRegisterOwner,
}: CustomerStorefrontProps) {
  const [activeView, setActiveView] = useState<'storefront' | 'tracker'>('storefront');
  const [trackerPrefill, setTrackerPrefill] = useState<{ ref: string; contact: string }>({
    ref: '',
    contact: '',
  });

  const [preselectedEventType, setPreselectedEventType] = useState<EventType | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<CateringPackage | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const [activeCategoryId, setActiveCategoryId] = useState<number | 'all'>('all');
  const [menuSearch, setMenuSearch] = useState('');
  const [cartItems, setCartItems] = useState<CustomCartItem[]>([]);
  const [selectedFoodAddons, setSelectedFoodAddons] = useState<Record<number, AddonOption[]>>({});

  const filteredFoodItems = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return foodItems.filter((item) => {
      const catMatch = activeCategoryId === 'all' || item.category_id === activeCategoryId;
      const textMatch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.dietary_tags.toLowerCase().includes(q);
      return catMatch && textMatch;
    });
  }, [foodItems, activeCategoryId, menuSearch]);

  const comparePackages = useMemo(
    () => packages.filter((p) => compareIds.includes(p.id)),
    [packages, compareIds]
  );

  function scrollToSection(id: string) {
    if (activeView !== 'storefront') {
      setActiveView('storefront');
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function handleSelectEventCategory(ev: EventType) {
    setPreselectedEventType(ev);
    scrollToSection('quote-form');
  }

  function handleChoosePackage(pkg: CateringPackage) {
    setSelectedPackage(pkg);
    scrollToSection('quote-form');
  }

  function toggleComparePackage(id: number) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }

  function toggleFoodAddon(foodId: number, addon: AddonOption) {
    setSelectedFoodAddons((prev) => {
      const current = prev[foodId] || [];
      const exists = current.some((a) => a.name === addon.name);
      return {
        ...prev,
        [foodId]: exists ? current.filter((a) => a.name !== addon.name) : [...current, addon],
      };
    });
  }

  function handleAddToCustomOrder(item: FoodItem) {
    const addons = selectedFoodAddons[item.id] || [];
    setCartItems((prev) => {
      const existing = prev.find((c) => c.foodItem.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.foodItem.id === item.id
            ? { ...c, quantity: c.quantity + 1, selectedAddons: addons }
            : c
        );
      }
      return [
        ...prev,
        {
          foodItem: item,
          quantity: item.min_order_qty,
          notes: '',
          selectedAddons: addons,
        },
      ];
    });
  }

  function handleUpdateCartQty(foodItemId: number, qty: number) {
    setCartItems((prev) =>
      prev.map((c) => (c.foodItem.id === foodItemId ? { ...c, quantity: qty } : c))
    );
  }

  function handleRemoveCartItem(foodItemId: number) {
    setCartItems((prev) => prev.filter((c) => c.foodItem.id !== foodItemId));
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#1C1917] flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-40 bg-[#FAFAF9]/95 backdrop-blur-sm border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('storefront');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="font-display text-xl font-semibold tracking-tight text-stone-900 whitespace-nowrap shrink-0"
          >
            {restaurant.name}
          </a>

          {/* Zone 2: 4 Concise Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600">
            <button
              type="button"
              onClick={() => scrollToSection('occasions')}
              className="hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
            >
              Occasions
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('packages')}
              className="hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
            >
              Packages
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('menu')}
              className="hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
            >
              Food Menu
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('tracker');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`hover:text-stone-900 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'tracker' ? 'text-[#1B4332] underline underline-offset-4' : ''
              }`}
            >
              Track Inquiry
            </button>
          </nav>

          {/* Zone 3: 1 Primary CTA Button */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => scrollToSection('quote-form')}
              style={{ backgroundColor: restaurant.brand_color || '#1B4332' }}
              className="px-4 py-2 text-white text-xs font-medium rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
            >
              {restaurant.cta_primary_text || 'Request Quote'}
            </button>
          </div>
        </div>
      </header>

      {activeView === 'tracker' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12">
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setActiveView('storefront')}
              className="text-sm font-medium text-stone-600 hover:text-stone-900"
            >
              ← Back to {restaurant.name} Catering
            </button>
            <div className="flex items-center gap-3 text-xs text-stone-500">
              <span>Restaurant:</span>
              <select
                value={activeSlug}
                onChange={(e) => onChangeRestaurant(e.target.value)}
                className="border border-stone-300 rounded px-2 py-1 text-stone-800 bg-white"
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <InquiryTracker
            restaurantSlug={activeSlug}
            initialReference={trackerPrefill.ref}
            initialContact={trackerPrefill.contact}
          />
        </main>
      ) : (
        <main id="top" className="flex-1">
          {/* HERO SECTION */}
          <section className="border-b border-stone-200 bg-white">
            <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-center py-4">
                  <p
                    className="text-xs uppercase tracking-wider font-medium mb-3"
                    style={{ color: restaurant.brand_color || '#1B4332' }}
                  >
                    {restaurant.tagline}
                  </p>
                  <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] leading-[1.08] tracking-tight text-stone-900 text-balance mb-5">
                    {restaurant.hero_headline || 'Make Every Occasion Delicious'}
                  </h1>
                  <p className="text-base sm:text-lg text-stone-600 leading-relaxed max-w-xl mb-8">
                    {restaurant.hero_subheadline ||
                      'From intimate family gatherings to grand celebrations, let us take care of the food.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-3.5">
                    <button
                      type="button"
                      onClick={() => scrollToSection('quote-form')}
                      style={{ backgroundColor: restaurant.brand_color || '#1B4332' }}
                      className="inline-flex items-center gap-2 px-6 py-3 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
                    >
                      {restaurant.cta_primary_text || 'Request a Catering Quote'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToSection('packages')}
                      className="px-6 py-3 border border-stone-300 text-stone-800 text-sm font-medium rounded-lg hover:bg-stone-50 transition-colors whitespace-nowrap"
                    >
                      {restaurant.cta_secondary_text || 'Explore Catering Packages'}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="aspect-[16/10] lg:aspect-auto lg:h-full min-h-[320px] rounded-xl overflow-hidden border border-stone-200">
                    <ResilientImage
                      src={
                        restaurant.hero_image_url ||
                        '/src/assets/images/hero_catering_banquet_1795136239169.jpg'
                      }
                      alt={`${restaurant.name} catering banquet showcase`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Multi-Tenant Selector & Utility Strip below Hero */}
              <div className="mt-10 pt-6 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-stone-600">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-stone-800">Active Kitchen Tenant:</span>
                  <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-stone-100 rounded-lg">
                    {restaurants.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          onChangeRestaurant(r.slug);
                          setSelectedPackage(null);
                          setCartItems([]);
                        }}
                        className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                          r.slug === activeSlug
                            ? 'bg-white text-stone-900 shadow-xs'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                  <span className="hidden md:inline text-stone-400">·</span>
                  <span className="hidden md:inline text-stone-500">{restaurant.address}</span>
                </div>
                <div className="flex flex-wrap items-center gap-5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveView('tracker')}
                    className="font-medium text-stone-700 hover:text-[#1B4332] underline underline-offset-4 whitespace-nowrap"
                  >
                    Track Existing Inquiry
                  </button>
                  <button
                    type="button"
                    onClick={onOpenRegisterOwner}
                    className="font-medium text-stone-700 hover:text-[#1B4332] underline underline-offset-4 whitespace-nowrap"
                  >
                    Register Your Restaurant
                  </button>
                  <button
                    type="button"
                    onClick={onOpenAdmin}
                    className="font-medium text-[#1B4332] hover:underline underline-offset-4 whitespace-nowrap"
                  >
                    Admin Portal →
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ABOUT & OWNER HOSPITALITY SERVICES */}
          {(restaurant.about_description || services.length > 0) && (
            <section className="border-b border-stone-200 bg-[#FAFAF9]">
              <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-5">
                  <p className="text-xs uppercase tracking-wider text-stone-500 mb-2">
                    Culinary Team &amp; Hospitality
                  </p>
                  <h2 className="font-display text-2xl sm:text-3xl text-stone-900 mb-3">
                    {restaurant.about_title || `About ${restaurant.name}`}
                  </h2>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    {restaurant.about_description}
                  </p>
                </div>

                <div className="lg:col-span-7">
                  {services.length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
                      <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                          Available Catering Services
                        </span>
                        <span className="text-xs text-stone-500">
                          Selectable during quote request
                        </span>
                      </div>
                      {services.map((svc) => (
                        <div
                          key={svc.id}
                          className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-sm font-medium text-stone-900">{svc.title}</div>
                            {svc.description && (
                              <div className="text-xs text-stone-500 mt-0.5">{svc.description}</div>
                            )}
                          </div>
                          <div className="font-mono text-xs font-medium text-[#1B4332] tabular-nums whitespace-nowrap shrink-0">
                            {svc.price_type === 'included'
                              ? 'Complimentary'
                              : svc.price_type === 'custom'
                              ? 'Custom Quote'
                              : `$${Number(svc.price).toFixed(2)}${
                                  svc.price_type === 'per_person' ? ' / guest' : ' flat'
                                }`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* EVENT CATEGORIES SECTION */}
          <section id="occasions" className="max-w-7xl mx-auto px-6 py-16">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
              <div>
                <p className="text-xs uppercase tracking-wider text-stone-500 mb-2">
                  Curated For Every Gathering
                </p>
                <h2 className="font-display text-3xl text-stone-900">
                  Event Categories &amp; Bulk Dining
                </h2>
              </div>
              <p className="text-sm text-stone-600 max-w-md">
                Select an occasion to pre-fill your quotation request with tailored service options.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
              {eventTypes.map((ev) => (
                <article
                  key={ev.id}
                  className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-stone-100">
                    <ResilientImage src={ev.image_url} alt={ev.name} />
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-xl text-stone-900 mb-2">{ev.name}</h3>
                      <p className="text-sm text-stone-600 leading-relaxed mb-5">{ev.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectEventCategory(ev)}
                      className="inline-flex items-center justify-between w-full px-4 py-2.5 border border-stone-300 text-stone-800 text-xs font-medium rounded-lg hover:border-[#1B4332] hover:text-[#1B4332] transition-colors"
                    >
                      <span>Request a Quotation</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* CATERING PACKAGES SECTION */}
          <section id="packages" className="bg-[#F4F4F2] border-y border-stone-200 py-16">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
                <div>
                  <p className="text-xs uppercase tracking-wider text-stone-500 mb-2">
                    Turnkey Culinary Programs
                  </p>
                  <h2 className="font-display text-3xl text-stone-900">
                    Catering Packages
                  </h2>
                </div>
                {compareIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCompareModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326] whitespace-nowrap self-start"
                  >
                    <Columns3 className="w-4 h-4" />
                    Compare Selected ({compareIds.length})
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {packages.map((pkg) => {
                  const isSelected = selectedPackage?.id === pkg.id;
                  const isCompared = compareIds.includes(pkg.id);
                  return (
                    <article
                      key={pkg.id}
                      className={`bg-white border rounded-xl overflow-hidden flex flex-col sm:flex-row ${
                        isSelected ? 'border-[#1B4332] ring-1 ring-[#1B4332]' : 'border-stone-200'
                      }`}
                    >
                      <div className="sm:w-2/5 aspect-[4/3] sm:aspect-auto bg-stone-100 shrink-0">
                        <ResilientImage src={pkg.image_url} alt={pkg.name} />
                      </div>
                      <div className="p-6 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="text-xs text-stone-500 mb-1.5">
                            {pkg.is_available ? 'Available' : 'Currently Unavailable'}
                            <span aria-hidden="true"> · </span>
                            <span className="tabular-nums">Min {pkg.min_guests} guests</span>
                            {pkg.is_seasonal && pkg.promo_label && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span className="text-[#1B4332] font-medium">{pkg.promo_label}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-baseline justify-between gap-3 mb-2">
                            <h3 className="font-display text-xl text-stone-900">{pkg.name}</h3>
                            <div className="font-mono text-base font-semibold text-[#1B4332] tabular-nums shrink-0">
                              ${pkg.price.toFixed(2)}
                              <span className="text-xs font-sans font-normal text-stone-500">
                                {pkg.pricing_type === 'per_person' ? '/guest' : ' pkg'}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-stone-600 leading-relaxed mb-4">
                            {pkg.description}
                          </p>

                          <ul className="space-y-1.5 mb-4">
                            {pkg.inclusions.slice(0, 4).map((inc, i) => (
                              <li key={i} className="text-xs text-stone-700 flex items-start gap-2">
                                <Check className="w-3.5 h-3.5 text-[#1B4332] shrink-0 mt-0.5" />
                                <span>{inc}</span>
                              </li>
                            ))}
                          </ul>

                          {pkg.addons.length > 0 && (
                            <p className="text-[11px] text-stone-500 mb-4">
                              Optional add-ons: {pkg.addons.map((a) => `${a.name} ($${a.price})`).join(', ')}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-4 border-t border-stone-100">
                          <label className="inline-flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isCompared}
                              onChange={() => toggleComparePackage(pkg.id)}
                              className="w-3.5 h-3.5 rounded border-stone-300 accent-[#1B4332]"
                            />
                            <span>Compare</span>
                          </label>

                          <button
                            type="button"
                            disabled={!pkg.is_available}
                            onClick={() => handleChoosePackage(pkg)}
                            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                              isSelected
                                ? 'bg-[#1B4332] text-white'
                                : 'bg-stone-900 text-white hover:bg-[#1B4332] disabled:bg-stone-300'
                            }`}
                          >
                            {isSelected ? 'Selected in Quote' : 'Select Package'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          {/* FOOD MENU & CUSTOM ORDER BUILDER */}
          <section id="menu" className="max-w-7xl mx-auto px-6 py-16">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
              <div>
                <p className="text-xs uppercase tracking-wider text-stone-500 mb-2">
                  Build A Fully Custom Menu
                </p>
                <h2 className="font-display text-3xl text-stone-900">
                  À La Carte Catering Trays &amp; Packed Meals
                </h2>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Search dishes or dietary notes..."
                    className="pl-9 pr-4 py-2 border border-stone-300 rounded-lg text-sm bg-white w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                  />
                </div>
                {(cartItems.length > 0 || selectedPackage) && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('quote-form')}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326] whitespace-nowrap"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Review Request ({cartItems.length + (selectedPackage ? 1 : 0)})
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-8">
              <button
                type="button"
                onClick={() => setActiveCategoryId('all')}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  activeCategoryId === 'all'
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                All Dishes
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategoryId(cat.id)}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    activeCategoryId === cat.id
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
              {filteredFoodItems.map((item) => {
                const inCart = cartItems.find((c) => c.foodItem.id === item.id);
                const chosenAddons = selectedFoodAddons[item.id] || [];
                return (
                  <article
                    key={item.id}
                    className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col"
                  >
                    <div className="aspect-[4/3] bg-stone-100 overflow-hidden">
                      <ResilientImage src={item.image_url} alt={item.name} />
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="text-xs text-stone-500 mb-1">
                          {item.dietary_tags || 'Chef Selection'}
                          <span aria-hidden="true"> · </span>
                          <span>Min {item.min_order_qty}</span>
                          {item.allergens && item.allergens !== 'None' && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>Contains: {item.allergens}</span>
                            </>
                          )}
                        </div>

                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h3 className="font-semibold text-base text-stone-900 leading-snug">
                            {item.name}
                          </h3>
                          <span className="font-mono text-sm font-medium text-[#1B4332] tabular-nums shrink-0">
                            {item.unit_price !== null ? `$${item.unit_price.toFixed(2)}` : 'Quote'}
                          </span>
                        </div>

                        <p className="text-xs text-stone-600 leading-relaxed mb-3">
                          {item.description}
                        </p>
                        <p className="text-[11px] text-stone-500 mb-3">{item.price_unit}</p>

                        {item.addons.length > 0 && (
                          <div className="border-t border-stone-100 pt-2.5 mb-4 space-y-1.5">
                            <div className="text-[11px] font-medium text-stone-700">Optional Add-ons</div>
                            {item.addons.map((addon) => (
                              <label
                                key={addon.name}
                                className="flex items-center justify-between text-xs text-stone-600 cursor-pointer"
                              >
                                <span className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={chosenAddons.some((a) => a.name === addon.name)}
                                    onChange={() => toggleFoodAddon(item.id, addon)}
                                    className="w-3.5 h-3.5 rounded border-stone-300 accent-[#1B4332]"
                                  />
                                  <span>{addon.name}</span>
                                </span>
                                <span className="font-mono tabular-nums text-stone-500">
                                  +${addon.price.toFixed(2)}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-3">
                        {inCart ? (
                          <span className="text-xs font-medium text-[#1B4332] tabular-nums">
                            {inCart.quantity} added to request
                          </span>
                        ) : (
                          <span className="text-xs text-stone-500">
                            {item.is_available ? 'Available for quote' : 'Unavailable'}
                          </span>
                        )}

                        <button
                          type="button"
                          disabled={!item.is_available}
                          onClick={() => handleAddToCustomOrder(item)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 text-white text-xs font-medium rounded-lg hover:bg-[#1B4332] disabled:bg-stone-300 transition-colors whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {inCart ? 'Add Another' : 'Add to Request'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* MULTI-STEP QUOTATION REQUEST FORM */}
          <section id="quote-form" className="bg-[#F4F4F2] border-t border-stone-200 py-16">
            <div className="max-w-5xl mx-auto px-6">
              <QuotationRequestWizard
                restaurant={restaurant}
                eventTypes={eventTypes}
                packages={packages}
                foodItems={foodItems}
                services={services}
                preselectedEventType={preselectedEventType}
                selectedPackage={selectedPackage}
                onSelectPackage={setSelectedPackage}
                cartItems={cartItems}
                onUpdateCartItemQty={handleUpdateCartQty}
                onRemoveCartItem={handleRemoveCartItem}
                onAddFoodItem={handleAddToCustomOrder}
                onClearCartAndPackage={() => {
                  setSelectedPackage(null);
                  setCartItems([]);
                }}
                onNavigateToTracker={(ref, email) => {
                  setTrackerPrefill({ ref, contact: email });
                  setActiveView('tracker');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          </section>
        </main>
      )}

      {/* Package Comparison Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-stone-200 max-w-4xl w-full max-h-[85vh] overflow-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-stone-200 mb-5">
              <h3 className="font-display text-2xl text-stone-900">Compare Catering Packages</h3>
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                className="p-1.5 text-stone-500 hover:text-stone-900"
                aria-label="Close comparison"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="py-3 pr-4 text-xs uppercase tracking-wider text-stone-500">Feature</th>
                    {comparePackages.map((pkg) => (
                      <th key={pkg.id} className="py-3 px-4 font-display text-lg text-stone-900">
                        {pkg.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  <tr>
                    <td className="py-3 pr-4 font-medium text-stone-600">Pricing</td>
                    {comparePackages.map((pkg) => (
                      <td key={pkg.id} className="py-3 px-4 font-mono tabular-nums font-semibold text-[#1B4332]">
                        ${pkg.price.toFixed(2)} {pkg.pricing_type === 'per_person' ? '/ person' : 'flat'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium text-stone-600">Minimum Guests</td>
                    {comparePackages.map((pkg) => (
                      <td key={pkg.id} className="py-3 px-4 font-mono tabular-nums">
                        {pkg.min_guests} guests
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium text-stone-600 align-top">Food Inclusions</td>
                    {comparePackages.map((pkg) => (
                      <td key={pkg.id} className="py-3 px-4 align-top">
                        <ul className="space-y-1 text-xs text-stone-700">
                          {pkg.inclusions.map((inc, idx) => (
                            <li key={idx}>• {inc}</li>
                          ))}
                        </ul>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium text-stone-600 align-top">Add-ons</td>
                    {comparePackages.map((pkg) => (
                      <td key={pkg.id} className="py-3 px-4 text-xs text-stone-600 align-top">
                        {pkg.addons.length > 0
                          ? pkg.addons.map((a) => `${a.name} ($${a.price})`).join(', ')
                          : 'Standard service'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4" />
                    {comparePackages.map((pkg) => (
                      <td key={pkg.id} className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            setShowCompareModal(false);
                            handleChoosePackage(pkg);
                          }}
                          className="px-4 py-2 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326]"
                        >
                          Select This Package
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Clean Footer */}
      <footer className="bg-stone-900 text-stone-300 border-t border-stone-800">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row md:items-center justify-between gap-6 text-sm">
          <div>
            <div className="font-display text-lg text-white mb-1">{restaurant.name}</div>
            <div className="text-xs text-stone-400">
              {restaurant.address} · {restaurant.phone} · {restaurant.email}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <button
              type="button"
              onClick={() => setActiveView('tracker')}
              className="hover:text-white transition-colors"
            >
              Track Inquiry
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('quote-form')}
              className="hover:text-white transition-colors"
            >
              Request Quotation
            </button>
            <button
              type="button"
              onClick={onOpenRegisterOwner}
              className="text-stone-200 hover:text-white transition-colors"
            >
              Register Your Restaurant
            </button>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="text-stone-200 font-medium hover:text-white transition-colors"
            >
              Staff Dashboard Login
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
