import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CalendarCheck,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { LandingPageManager } from './LandingPageManager';
import { api } from '../api';
import type {
  AuthUser,
  Booking,
  ManagedUser,
  SuperadminRestaurantSummary,
} from '../types/catering';

interface SuperadminConsoleProps {
  token: string;
  user: AuthUser;
  onLogout: () => void;
  onBackToStorefront: (slug?: string) => void;
}

type SuperSection = 'overview' | 'restaurants' | 'users' | 'bookings';

function statusColorClass(status: string): string {
  switch (status) {
    case 'Confirmed':
    case 'Fully Paid':
    case 'Completed':
      return 'text-[#16A34A]';
    case 'Deposit Paid':
    case 'Partially Paid':
    case 'In Preparation':
      return 'text-[#D97706]';
    case 'Cancelled':
    case 'Unpaid':
      return 'text-[#DC2626]';
    default:
      return 'text-stone-700';
  }
}

export function SuperadminConsole({
  token,
  user,
  onLogout,
  onBackToStorefront,
}: SuperadminConsoleProps) {
  const [section, setSection] = useState<SuperSection>('overview');
  const [metrics, setMetrics] = useState({
    totalRestaurants: 0,
    publishedRestaurants: 0,
    totalUsers: 0,
    activeUsers: 0,
    totalInquiries: 0,
    totalBookings: 0,
    totalContractValue: 0,
    totalVerifiedPaid: 0,
    totalOutstandingBalance: 0,
  });

  const [restaurants, setRestaurants] = useState<SuperadminRestaurantSummary[]>([]);
  const [editingRestaurantId, setEditingRestaurantId] = useState<number | null>(null);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userRestaurantFilter, setUserRestaurantFilter] = useState<number>(0);
  const [userModal, setUserModal] = useState<{
    mode: 'create' | 'edit';
    id?: number;
    name: string;
    email: string;
    password: string;
    role: 'superadmin' | 'owner' | 'manager' | 'staff';
    restaurant_id: number | null;
    is_active: boolean;
  } | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingRestaurantFilter, setBookingRestaurantFilter] = useState<number>(0);
  const [bookingStatusFilter, setBookingStatusFilter] = useState('All');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('All');

  const loadSuperadminData = useCallback(async () => {
    const userQs = new URLSearchParams();
    if (userRoleFilter !== 'all') userQs.set('role', userRoleFilter);
    if (userRestaurantFilter > 0) userQs.set('restaurant_id', String(userRestaurantFilter));
    if (userSearch.trim()) userQs.set('search', userSearch.trim());

    const bkQs = new URLSearchParams();
    if (bookingRestaurantFilter > 0) bkQs.set('restaurant_id', String(bookingRestaurantFilter));
    if (bookingStatusFilter !== 'All') bkQs.set('booking_status', bookingStatusFilter);
    if (paymentStatusFilter !== 'All') bkQs.set('payment_status', paymentStatusFilter);
    if (bookingSearch.trim()) bkQs.set('search', bookingSearch.trim());

    const [ovRes, restRes, usrRes, bkRes] = await Promise.all([
      api.superadmin.overview(token),
      api.superadmin.restaurants(token),
      api.superadmin.users(token, userQs),
      api.superadmin.bookings(token, bkQs),
    ]);

    if (ovRes.ok) {
      const ov = await ovRes.json();
      setMetrics(ov.metrics);
    }
    if (restRes.ok) {
      const rd = await restRes.json();
      setRestaurants(rd.restaurants);
    }
    if (usrRes.ok) {
      const ud = await usrRes.json();
      setUsers(ud.users);
    }
    if (bkRes.ok) {
      const bd = await bkRes.json();
      setBookings(bd.bookings);
    }
  }, [
    token,
    userRoleFilter,
    userRestaurantFilter,
    userSearch,
    bookingRestaurantFilter,
    bookingStatusFilter,
    paymentStatusFilter,
    bookingSearch,
  ]);

  useEffect(() => {
    loadSuperadminData();
  }, [loadSuperadminData]);

  async function togglePublishRestaurant(rest: SuperadminRestaurantSummary) {
    await api.superadmin.updateRestaurant(rest.id, { is_published: !rest.is_published }, token);
    await loadSuperadminData();
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!userModal) return;
    setUserError(null);

    const body =
      userModal.mode === 'create'
        ? {
            name: userModal.name,
            email: userModal.email,
            password: userModal.password,
            role: userModal.role,
            restaurant_id: userModal.role === 'superadmin' ? null : userModal.restaurant_id,
          }
        : {
            name: userModal.name,
            role: userModal.role,
            restaurant_id: userModal.role === 'superadmin' ? null : userModal.restaurant_id,
            is_active: userModal.is_active,
            ...(userModal.password.trim() ? { new_password: userModal.password.trim() } : {}),
          };

    const res = await api.superadmin.saveUser(userModal.mode === 'create' ? null : userModal.id, body, token);
    const data = await res.json();
    if (!res.ok) {
      setUserError(data.error || 'Could not save user.');
      return;
    }
    setUserModal(null);
    await loadSuperadminData();
  }

  async function handleToggleUserActive(u: ManagedUser) {
    await api.superadmin.updateUser(u.id, { is_active: !u.is_active }, token);
    await loadSuperadminData();
  }

  async function handleDeleteUser(id: number) {
    await api.superadmin.deleteUser(id, token);
    await loadSuperadminData();
  }

  async function handleUpdateBookingStatus(bookingId: number, bookingStatus: string) {
    await api.superadmin.updateBooking(bookingId, { booking_status: bookingStatus }, token);
    await loadSuperadminData();
  }

  const navItems: Array<{ id: SuperSection; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Platform Overview', icon: LayoutDashboard },
    { id: 'restaurants', label: 'Owner Landing Pages', icon: Building2 },
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'bookings', label: 'Global Bookings', icon: CalendarCheck },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-stone-900 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-stone-200 hidden lg:flex flex-col shrink-0">
        <div className="h-16 px-5 border-b border-stone-200 flex items-center">
          <span className="font-display text-lg font-semibold text-stone-900 truncate">
            Platform Superadmin
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setEditingRestaurantId(null);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#1B4332] text-white'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-stone-200 space-y-3">
          <div className="text-xs">
            <div className="font-semibold text-stone-900 truncate">{user.name}</div>
            <div className="text-[#1B4332] font-medium uppercase tracking-wider text-[11px]">
              Superadmin
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onBackToStorefront()}
              className="flex-1 px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              Storefront
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 border border-stone-300 rounded-lg text-stone-600 hover:text-red-600"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-stone-200 px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-stone-400 hidden sm:inline">Superadmin Console /</span>
            <h1 className="text-base font-semibold text-stone-900 truncate">
              {navItems.find((n) => n.id === section)?.label}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={section}
              onChange={(e) => {
                setSection(e.target.value as SuperSection);
                setEditingRestaurantId(null);
              }}
              className="lg:hidden px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs bg-white"
            >
              {navItems.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onBackToStorefront()}
              className="px-3 py-1.5 border border-stone-300 rounded-lg text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              View Public Site
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 space-y-6 overflow-auto">
          {/* PLATFORM OVERVIEW */}
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Registered Restaurants',
                    value: `${metrics.publishedRestaurants} / ${metrics.totalRestaurants} Live`,
                  },
                  {
                    label: 'Platform Users',
                    value: `${metrics.activeUsers} / ${metrics.totalUsers} Active`,
                  },
                  {
                    label: 'Total Inquiries',
                    value: String(metrics.totalInquiries),
                  },
                  {
                    label: 'Confirmed Bookings',
                    value: String(metrics.totalBookings),
                  },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white border border-stone-200 rounded-xl p-5">
                    <div className="text-xs text-stone-500 mb-2">{kpi.label}</div>
                    <div className="font-mono text-2xl font-semibold text-stone-900 tabular-nums">
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                  <div className="text-xs text-stone-500 mb-1">Total Booked Contract Value</div>
                  <div className="font-mono text-2xl font-semibold text-stone-900 tabular-nums">
                    ${metrics.totalContractValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                  <div className="text-xs text-stone-500 mb-1">Verified Payments Collected</div>
                  <div className="font-mono text-2xl font-semibold text-[#16A34A] tabular-nums">
                    ${metrics.totalVerifiedPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                  <div className="text-xs text-stone-500 mb-1">Outstanding Balance Due</div>
                  <div className="font-mono text-2xl font-semibold text-[#D97706] tabular-nums">
                    ${metrics.totalOutstandingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Quick Summary Table of Restaurants */}
              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-stone-900">
                    Active Restaurant Tenants &amp; Owners
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSection('restaurants')}
                    className="text-xs font-medium text-[#1B4332] hover:underline"
                  >
                    Manage Landing Pages →
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
                      <tr>
                        <th className="py-2.5 px-4 font-medium">Restaurant</th>
                        <th className="py-2.5 px-4 font-medium">Owner</th>
                        <th className="py-2.5 px-4 font-medium text-right">Services</th>
                        <th className="py-2.5 px-4 font-medium text-right">Inquiries</th>
                        <th className="py-2.5 px-4 font-medium text-right">Bookings</th>
                        <th className="py-2.5 px-4 font-medium">Landing Page</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {restaurants.map((r) => (
                        <tr key={r.id} className="hover:bg-stone-50/70">
                          <td className="py-3 px-4">
                            <div className="font-medium text-stone-900">{r.name}</div>
                            <div className="text-xs font-mono text-stone-400">{r.slug}</div>
                          </td>
                          <td className="py-3 px-4 text-xs text-stone-600">
                            <div>{r.owner_name || 'Unassigned'}</div>
                            <div className="text-stone-400">{r.owner_email || ''}</div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {r.service_count}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {r.inquiry_count}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {r.booking_count}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium">
                            <span className={r.is_published ? 'text-[#16A34A]' : 'text-[#D97706]'}>
                              {r.is_published ? 'Published' : 'Unpublished'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* OWNER LANDING PAGES & SERVICES */}
          {section === 'restaurants' && (
            <div className="space-y-6">
              {editingRestaurantId ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setEditingRestaurantId(null)}
                    className="text-xs font-medium text-stone-700 hover:text-stone-900"
                  >
                    ← Back to All Owner Landing Pages
                  </button>
                  <LandingPageManager
                    token={token}
                    targetRestaurantId={editingRestaurantId}
                    onPreviewLivePage={(slug) => onBackToStorefront(slug)}
                    onUpdated={loadSuperadminData}
                  />
                </div>
              ) : (
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-stone-200">
                    <h2 className="text-sm font-semibold text-stone-900">
                      Manage Owner Landing Pages &amp; Services
                    </h2>
                    <p className="text-xs text-stone-500">
                      Inspect, publish/unpublish, edit hero copy, or add catering services for any
                      registered restaurant owner.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
                        <tr>
                          <th className="py-3 px-4 font-medium">Restaurant &amp; Slug</th>
                          <th className="py-3 px-4 font-medium">Owner</th>
                          <th className="py-3 px-4 font-medium">Hero Headline</th>
                          <th className="py-3 px-4 font-medium text-right">Services</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                          <th className="py-3 px-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {restaurants.map((r) => (
                          <tr key={r.id} className="hover:bg-stone-50/70">
                            <td className="py-3 px-4">
                              <div className="font-medium text-stone-900">{r.name}</div>
                              <div className="text-xs font-mono text-stone-500">{r.slug}</div>
                            </td>
                            <td className="py-3 px-4 text-xs text-stone-600">
                              <div>{r.owner_name || '—'}</div>
                              <div className="text-stone-400">{r.owner_email || ''}</div>
                            </td>
                            <td className="py-3 px-4 text-xs text-stone-700 max-w-xs truncate">
                              {r.hero_headline}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {r.service_count}
                            </td>
                            <td className="py-3 px-4 text-xs font-medium">
                              <button
                                type="button"
                                onClick={() => togglePublishRestaurant(r)}
                                className={`underline underline-offset-2 ${
                                  r.is_published ? 'text-[#16A34A]' : 'text-[#D97706]'
                                }`}
                              >
                                {r.is_published ? 'Published' : 'Unpublished'}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setEditingRestaurantId(r.id)}
                                className="px-3 py-1.5 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326]"
                              >
                                Edit Page &amp; Services
                              </button>
                              <button
                                type="button"
                                onClick={() => onBackToStorefront(r.slug)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs text-stone-700 hover:bg-stone-50"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Live
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* USER MANAGEMENT */}
          {section === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="relative flex-1 min-w-[220px] max-w-xs">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search user name, email, restaurant..."
                      className="w-full pl-9 pr-4 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                    />
                  </div>

                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="px-3 py-2 border border-stone-300 rounded-lg text-xs bg-white"
                  >
                    <option value="all">All Roles</option>
                    <option value="superadmin">Superadmin</option>
                    <option value="owner">Owner</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                  </select>

                  <select
                    value={userRestaurantFilter}
                    onChange={(e) => setUserRestaurantFilter(Number(e.target.value))}
                    className="px-3 py-2 border border-stone-300 rounded-lg text-xs bg-white"
                  >
                    <option value={0}>All Restaurants</option>
                    {restaurants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setUserError(null);
                    setUserModal({
                      mode: 'create',
                      name: '',
                      email: '',
                      password: '',
                      role: 'owner',
                      restaurant_id: restaurants[0]?.id || null,
                      is_active: true,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326] whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Create User
                </button>
              </div>

              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
                      <tr>
                        <th className="py-3 px-4 font-medium">User</th>
                        <th className="py-3 px-4 font-medium">Role</th>
                        <th className="py-3 px-4 font-medium">Assigned Restaurant</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        <th className="py-3 px-4 font-medium">Created</th>
                        <th className="py-3 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-stone-50/70">
                          <td className="py-3 px-4">
                            <div className="font-medium text-stone-900">{u.name}</div>
                            <div className="text-xs font-mono text-stone-500">{u.email}</div>
                          </td>
                          <td className="py-3 px-4 text-xs font-medium capitalize text-stone-800">
                            {u.role}
                          </td>
                          <td className="py-3 px-4 text-xs text-stone-600">
                            {u.restaurant_name || 'Platform-Wide'}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium">
                            <button
                              type="button"
                              disabled={u.id === user.id}
                              onClick={() => handleToggleUserActive(u)}
                              className={`${
                                u.is_active ? 'text-[#16A34A]' : 'text-[#DC2626]'
                              } disabled:opacity-50`}
                            >
                              {u.is_active ? 'Active' : 'Suspended'}
                            </button>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-stone-500 tabular-nums">
                            {u.created_at.slice(0, 10)}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setUserError(null);
                                setUserModal({
                                  mode: 'edit',
                                  id: u.id,
                                  name: u.name,
                                  email: u.email,
                                  password: '',
                                  role: u.role,
                                  restaurant_id: u.restaurant_id,
                                  is_active: u.is_active,
                                });
                              }}
                              className="p-1.5 text-stone-500 hover:text-stone-900"
                              aria-label="Edit user"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {u.id !== user.id && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-1.5 text-stone-400 hover:text-red-600"
                                aria-label="Delete user"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* GLOBAL BOOKINGS TRACKER */}
          {section === 'bookings' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px] max-w-xs">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={bookingSearch}
                    onChange={(e) => setBookingSearch(e.target.value)}
                    placeholder="Search booking ref, customer, venue..."
                    className="w-full pl-9 pr-4 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                  />
                </div>

                <select
                  value={bookingRestaurantFilter}
                  onChange={(e) => setBookingRestaurantFilter(Number(e.target.value))}
                  className="px-3 py-2 border border-stone-300 rounded-lg text-xs bg-white"
                >
                  <option value={0}>All Restaurants</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>

                <select
                  value={bookingStatusFilter}
                  onChange={(e) => setBookingStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-stone-300 rounded-lg text-xs bg-white"
                >
                  <option value="All">All Booking Statuses</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="In Preparation">In Preparation</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>

                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-stone-300 rounded-lg text-xs bg-white"
                >
                  <option value="All">All Payment Statuses</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Deposit Paid">Deposit Paid</option>
                  <option value="Partially Paid">Partially Paid</option>
                  <option value="Fully Paid">Fully Paid</option>
                </select>
              </div>

              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
                      <tr>
                        <th className="py-3 px-4 font-medium">Booking &amp; Restaurant</th>
                        <th className="py-3 px-4 font-medium">Customer &amp; Venue</th>
                        <th className="py-3 px-4 font-medium">Event Date</th>
                        <th className="py-3 px-4 font-medium text-right">Guests</th>
                        <th className="py-3 px-4 font-medium text-right">Contract / Paid</th>
                        <th className="py-3 px-4 font-medium">Payment Status</th>
                        <th className="py-3 px-4 font-medium">Booking Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {bookings.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-sm text-stone-500">
                            No bookings match the selected filters.
                          </td>
                        </tr>
                      ) : (
                        bookings.map((bk) => (
                          <tr key={bk.id} className="hover:bg-stone-50/70">
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-mono text-xs font-medium text-[#1B4332]">
                                {bk.booking_reference}
                              </div>
                              <div className="text-xs text-stone-600">{bk.restaurant_name}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-stone-900">{bk.customer_name}</div>
                              <div className="text-xs text-stone-500">{bk.event_venue}</div>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                              {bk.event_date}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {bk.guest_count}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                              <div className="font-medium text-stone-900">
                                ${Number(bk.total_amount).toFixed(2)}
                              </div>
                              <div className="text-[#16A34A]">
                                Paid: ${Number(bk.amount_paid).toFixed(2)}
                              </div>
                            </td>
                            <td className={`py-3 px-4 text-xs font-medium whitespace-nowrap ${statusColorClass(bk.payment_status)}`}>
                              {bk.payment_status}
                            </td>
                            <td className="py-3 px-4">
                              <select
                                value={bk.booking_status}
                                onChange={(e) => handleUpdateBookingStatus(bk.id, e.target.value)}
                                className="px-2 py-1 border border-stone-300 rounded text-xs bg-white"
                              >
                                <option value="Confirmed">Confirmed</option>
                                <option value="In Preparation">In Preparation</option>
                                <option value="Completed">Completed</option>
                                <option value="Cancelled">Cancelled</option>
                              </select>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create / Edit User Modal */}
      {userModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveUser}
            className="bg-white border border-stone-200 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="font-display text-xl text-stone-900">
                {userModal.mode === 'create' ? 'Create Platform User' : 'Edit User Account'}
              </h3>
              <button type="button" onClick={() => setUserModal(null)} className="text-stone-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            {userError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {userError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Full Name *</label>
              <input
                required
                type="text"
                value={userModal.name}
                onChange={(e) => setUserModal({ ...userModal, name: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Email *</label>
              <input
                required
                disabled={userModal.mode === 'edit'}
                type="email"
                value={userModal.email}
                onChange={(e) => setUserModal({ ...userModal, email: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm disabled:bg-stone-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Role *</label>
                <select
                  value={userModal.role}
                  onChange={(e) =>
                    setUserModal({
                      ...userModal,
                      role: e.target.value as ManagedUser['role'],
                    })
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                >
                  <option value="owner">Owner</option>
                  <option value="manager">Manager</option>
                  <option value="staff">Staff</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>

              {userModal.role !== 'superadmin' && (
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Restaurant Tenant
                  </label>
                  <select
                    value={userModal.restaurant_id || restaurants[0]?.id || ''}
                    onChange={(e) =>
                      setUserModal({ ...userModal, restaurant_id: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                  >
                    {restaurants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                {userModal.mode === 'create'
                  ? 'Password (min 8 chars) *'
                  : 'Reset Password (optional)'}
              </label>
              <input
                required={userModal.mode === 'create'}
                type="password"
                minLength={8}
                value={userModal.password}
                onChange={(e) => setUserModal({ ...userModal, password: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>

            {userModal.mode === 'edit' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={userModal.is_active}
                  onChange={(e) => setUserModal({ ...userModal, is_active: e.target.checked })}
                  className="accent-[#1B4332]"
                />
                <span>Account Active</span>
              </label>
            )}

            <div className="pt-3 border-t border-stone-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserModal(null)}
                className="px-4 py-2 border border-stone-300 rounded-lg text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#1B4332] text-white rounded-lg text-xs font-medium"
              >
                {userModal.mode === 'create' ? 'Create User' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
