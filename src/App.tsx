import { useCallback, useEffect, useState } from 'react';
import { CustomerStorefront } from './components/CustomerStorefront';
import { AdminDashboard } from './components/AdminDashboard';
import { OwnerRegisterView } from './components/OwnerRegisterView';
import type {
  CateringPackage,
  EventType,
  FoodCategory,
  FoodItem,
  Restaurant,
  RestaurantService,
} from './types/catering';

export default function App() {
  const [mode, setMode] = useState<'customer' | 'admin' | 'register'>(() => {
    if (window.location.hash === '#admin') return 'admin';
    if (window.location.hash === '#register') return 'register';
    return 'customer';
  });
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>('maison-saffron');
  const [storefront, setStorefront] = useState<{
    restaurant: Restaurant;
    eventTypes: EventType[];
    packages: CateringPackage[];
    categories: FoodCategory[];
    foodItems: FoodItem[];
    services: RestaurantService[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStorefront = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, sfRes] = await Promise.all([
        fetch('/api/public/restaurants'),
        fetch(`/api/public/${slug}/storefront`),
      ]);
      if (!listRes.ok || !sfRes.ok) {
        throw new Error('Unable to load catering storefront.');
      }
      const listData = await listRes.json();
      const sfData = await sfRes.json();
      setRestaurants(listData.restaurants);
      setStorefront({
        ...sfData,
        services: sfData.services || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load application.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStorefront(activeSlug);
  }, [activeSlug, fetchStorefront]);

  function openAdmin() {
    window.location.hash = 'admin';
    setMode('admin');
  }

  function openRegisterOwner() {
    window.location.hash = 'register';
    setMode('register');
  }

  function backToStorefront(targetSlug?: string) {
    window.location.hash = '';
    setMode('customer');
    if (targetSlug && targetSlug !== activeSlug) {
      setActiveSlug(targetSlug);
    } else {
      fetchStorefront(targetSlug || activeSlug);
    }
  }

  if (mode === 'register') {
    return (
      <OwnerRegisterView
        onBack={() => backToStorefront()}
        onRegistered={({ slug }) => {
          setActiveSlug(slug);
          window.location.hash = 'admin';
          setMode('admin');
        }}
      />
    );
  }

  if (mode === 'admin') {
    return (
      <AdminDashboard
        onBackToStorefront={backToStorefront}
        onOpenRegisterOwner={openRegisterOwner}
      />
    );
  }

  if (loading && !storefront) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6">
        <div className="text-sm text-stone-600">Loading catering storefront...</div>
      </div>
    );
  }

  if (error || !storefront) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-red-700 mb-4">{error || 'Storefront unavailable'}</p>
        <button
          type="button"
          onClick={() => fetchStorefront(activeSlug)}
          className="px-4 py-2 bg-[#1B4332] text-white text-xs font-medium rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <CustomerStorefront
      restaurants={restaurants}
      activeSlug={activeSlug}
      onChangeRestaurant={(slug) => setActiveSlug(slug)}
      restaurant={storefront.restaurant}
      eventTypes={storefront.eventTypes}
      packages={storefront.packages}
      categories={storefront.categories}
      foodItems={storefront.foodItems}
      services={storefront.services}
      onOpenAdmin={openAdmin}
      onOpenRegisterOwner={openRegisterOwner}
    />
  );
}
