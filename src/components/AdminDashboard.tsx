import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Bell,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  UtensilsCrossed,
  Users,
  X,
} from 'lucide-react';
import { adminLoginSchema, type AdminLoginValues } from '../lib/validation';
import { api } from '../api';
import { downloadQuotationPdf } from '../lib/pdfGenerator';
import { QuotationBuilderModal } from './QuotationBuilderModal';
import { CatalogManager } from './CatalogManager';
import { LandingPageManager } from './LandingPageManager';
import { SuperadminConsole } from './SuperadminConsole';
import { UserManagement } from './UserManagement';
import type {
  AuditLog,
  AuthUser,
  Booking,
  CateringInquiry,
  CateringPackage,
  FoodCategory,
  FoodItem,
  InquiryItemRecord,
  InquiryNote,
  InquiryStatus,
  NotificationRecord,
  Quotation,
  Restaurant,
} from '../types/catering';

interface AdminDashboardProps {
  onBackToStorefront: (slug?: string) => void;
  onOpenRegisterOwner: () => void;
}

type AdminSection =
  | 'overview'
  | 'inquiries'
  | 'bookings'
  | 'catalog'
  | 'landing'
  | 'notifications'
  | 'users'
  | 'settings';

const INQUIRY_STATUSES: InquiryStatus[] = [
  'Request Received',
  'Under Review',
  'Quotation Sent',
  'Awaiting Customer Confirmation',
  'Confirmed',
  'Completed',
  'Cancelled',
];

function statusColorClass(status: string): string {
  switch (status) {
    case 'Confirmed':
    case 'Fully Paid':
    case 'Completed':
      return 'text-[#16A34A]';
    case 'Quotation Sent':
    case 'Awaiting Customer Confirmation':
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

export function AdminDashboard({ onBackToStorefront, onOpenRegisterOwner }: AdminDashboardProps) {
  const [token, setToken] = useState<string>(() => localStorage.getItem('catering_admin_token') || '');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(Boolean(token));
  const [loginError, setLoginError] = useState<string | null>(null);

  const [section, setSection] = useState<AdminSection>('overview');
  const [loadingData, setLoadingData] = useState(false);

  // Overview state
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [staffList, setStaffList] = useState<Array<{ id: number; name: string; email: string; role: string }>>([]);
  const [metrics, setMetrics] = useState({
    totalInquiries: 0,
    newInquiries: 0,
    pendingQuotations: 0,
    confirmedBookings: 0,
    upcomingEventsCount: 0,
    estimatedValue: 0,
  });
  const [upcomingEvents, setUpcomingEvents] = useState<Array<Record<string, unknown>>>([]);
  const [monthlyStats, setMonthlyStats] = useState<Array<{ month: string; inquiries: number; total_guests: number; value: number }>>([]);

  // Inquiries state
  const [inquiries, setInquiries] = useState<CateringInquiry[]>([]);
  const [inquirySearch, setInquirySearch] = useState('');
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState('All');
  const [selectedInquiryDetail, setSelectedInquiryDetail] = useState<{
    inquiry: CateringInquiry;
    items: InquiryItemRecord[];
    notes: InquiryNote[];
    quotations: Quotation[];
    booking: Booking | null;
  } | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [editingInquiryFields, setEditingInquiryFields] = useState<{
    guest_count: number;
    event_date: string;
    event_venue: string;
  } | null>(null);
  const [quoteBuilderOpen, setQuoteBuilderOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);

  // Bookings & Payments
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [paymentModalBooking, setPaymentModalBooking] = useState<Booking | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    payment_method: 'ACH Wire Transfer',
    reference_code: '',
    notes: '',
  });

  // Catalog
  const [packages, setPackages] = useState<CateringPackage[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);

  // Notifications & Audit
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Settings feedback
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);

  const loginForm = useForm<AdminLoginValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const loadAllAdminData = useCallback(async () => {
    if (!token) return;
    setLoadingData(true);
    try {
      const qs = new URLSearchParams();
      if (inquiryStatusFilter !== 'All') qs.set('status', inquiryStatusFilter);
      if (inquirySearch.trim()) qs.set('search', inquirySearch.trim());

      const [ovRes, inqRes, bkRes, catRes, notRes] = await Promise.all([
        api.admin.overview(token),
        api.admin.inquiries(token, qs),
        api.admin.bookings(token),
        api.admin.catalog(token),
        api.admin.notifications(token),
      ]);

      if (ovRes.ok) {
        const ov = await ovRes.json();
        setRestaurant(ov.restaurant);
        setStaffList(ov.staff);
        setMetrics(ov.metrics);
        setUpcomingEvents(ov.upcomingEvents);
        setMonthlyStats(ov.monthlyStats);
      }
      if (inqRes.ok) {
        const inqData = await inqRes.json();
        setInquiries(inqData.inquiries);
      }
      if (bkRes.ok) {
        const bkData = await bkRes.json();
        setBookings(bkData.bookings);
      }
      if (catRes.ok) {
        const catData = await catRes.json();
        setPackages(catData.packages);
        setCategories(catData.categories);
        setFoodItems(catData.foodItems);
      }
      if (notRes.ok) {
        const notData = await notRes.json();
        setNotifications(notData.notifications);
        setAuditLogs(notData.auditLogs);
      }
    } finally {
      setLoadingData(false);
    }
  }, [token, inquiryStatusFilter, inquirySearch]);

  useEffect(() => {
    if (!token) {
      setAuthChecking(false);
      return;
    }
    api.auth.me(token)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setUser(data.user);
      })
      .catch(() => {
        localStorage.removeItem('catering_admin_token');
        setToken('');
        setUser(null);
      })
      .finally(() => setAuthChecking(false));
  }, [token]);

  useEffect(() => {
    if (user && user.role !== 'superadmin') {
      loadAllAdminData();
    }
  }, [user, loadAllAdminData]);

  async function handleLogin(values: AdminLoginValues) {
    setLoginError(null);
    const res = await api.auth.login(values);
    const data = await res.json();
    if (!res.ok) {
      setLoginError(data.error || 'Login failed');
      return;
    }
    localStorage.setItem('catering_admin_token', data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function handleLogout() {
    await api.auth.logout(token);
    localStorage.removeItem('catering_admin_token');
    setToken('');
    setUser(null);
    setSelectedInquiryDetail(null);
  }

  async function openInquiryDetail(id: number) {
    const res = await api.admin.inquiry(id, token);
    if (res.ok) {
      const data = await res.json();
      setSelectedInquiryDetail(data);
      setEditingInquiryFields({
        guest_count: data.inquiry.guest_count,
        event_date: data.inquiry.event_date,
        event_venue: data.inquiry.event_venue,
      });
    }
  }

  async function updateInquiryPatch(id: number, patch: Record<string, unknown>) {
    await api.admin.updateInquiry(id, patch, token);
    await openInquiryDetail(id);
    await loadAllAdminData();
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInquiryDetail || !newNoteText.trim()) return;
    await api.admin.addInquiryNote(selectedInquiryDetail.inquiry.id, { note: newNoteText.trim() }, token);
    setNewNoteText('');
    await openInquiryDetail(selectedInquiryDetail.inquiry.id);
  }

  async function handleSendDraftQuotation(quotationId: number) {
    await api.admin.sendQuotation(quotationId, token);
    if (selectedInquiryDetail) {
      await openInquiryDetail(selectedInquiryDetail.inquiry.id);
    }
    await loadAllAdminData();
  }

  async function handleConvertToBooking(inquiryId: number, quotationId: number) {
    const res = await api.admin.convertInquiryToBooking(
      inquiryId,
      { quotation_id: quotationId, staff_verified_acceptance: true },
      token,
    );
    if (res.ok) {
      await openInquiryDetail(inquiryId);
      await loadAllAdminData();
    }
  }

  async function handleExportCsv() {
    const res = await api.admin.exportInquiries(token);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catering-inquiries-${user?.restaurant_slug || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentModalBooking) return;
    const res = await api.admin.recordPayment(paymentModalBooking.id, paymentForm, token);
    if (res.ok) {
      setPaymentModalBooking(null);
      await loadAllAdminData();
    }
  }

  async function handleBookingStatusChange(bookingId: number, bookingStatus: string) {
    await api.admin.updateBooking(bookingId, { booking_status: bookingStatus }, token);
    await loadAllAdminData();
  }

  async function handleSendReminder(bookingId: number, channel: 'email' | 'sms') {
    await api.admin.sendReminder({ booking_id: bookingId, channel }, token);
    await loadAllAdminData();
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurant) return;
    setSettingsSavedMsg(null);
    const res = await api.admin.updateRestaurant(restaurant, token);
    if (res.ok) {
      setSettingsSavedMsg('Restaurant settings updated.');
      await loadAllAdminData();
    }
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center text-sm text-stone-600">
        Verifying restaurant staff session...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col justify-center items-center px-6 py-12">
        <div className="w-full max-w-md bg-white border border-stone-200 rounded-xl p-8">
          <div className="flex items-center justify-between mb-6">
            <span className="font-display text-2xl text-stone-900">Staff Admin Portal</span>
            <button
              type="button"
              onClick={() => onBackToStorefront()}
              className="text-xs font-medium text-stone-600 hover:text-stone-900"
            >
              ← Storefront
            </button>
          </div>
          <p className="text-sm text-stone-600 mb-6">
            Sign in with your restaurant staff account. Each tenant workspace is strictly isolated to
            its own inquiries, menus, quotations, and bookings.
          </p>

          {loginError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {loginError}
            </div>
          )}

          <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Staff Email</label>
              <input
                type="email"
                {...loginForm.register('email')}
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {loginForm.formState.errors.email && (
                <p className="mt-1 text-xs text-red-600">{loginForm.formState.errors.email.message}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Password</label>
              <input
                type="password"
                {...loginForm.register('password')}
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {loginForm.formState.errors.password && (
                <p className="mt-1 text-xs text-red-600">{loginForm.formState.errors.password.message}</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-[#1B4332] text-white text-sm font-medium rounded-lg hover:bg-[#143326] transition-colors"
            >
              Sign In to Dashboard
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-stone-200">
            <p className="text-xs text-stone-600">
              Sign in with an account created in Laravel. New restaurant partners can register below.
            </p>

            <div className="pt-3 border-t border-stone-100 text-center">
              <button
                type="button"
                onClick={onOpenRegisterOwner}
                className="text-xs font-medium text-[#1B4332] hover:underline underline-offset-4"
              >
                New Restaurant Partner? Register &amp; Build Your Landing Page →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (user.role === 'superadmin') {
    return (
      <SuperadminConsole
        token={token}
        user={user}
        onLogout={handleLogout}
        onBackToStorefront={onBackToStorefront}
      />
    );
  }

  const navItems: Array<{ id: AdminSection; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'inquiries', label: 'Inquiries & Quotes', icon: ClipboardList },
    { id: 'bookings', label: 'Bookings & Payments', icon: CalendarCheck },
    { id: 'catalog', label: 'Menu & Packages', icon: UtensilsCrossed },
    { id: 'landing', label: 'Landing Page & Services', icon: Globe },
    { id: 'notifications', label: 'Notifications & Audit', icon: Bell },
    ...(user.role === 'owner' ? [{ id: 'users' as const, label: 'Team Management', icon: Users }] : []),
    { id: 'settings', label: 'Settings & API Docs', icon: Settings },
  ];

  const maxMonthlyCount = Math.max(1, ...monthlyStats.map((m) => m.inquiries));

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-stone-900 flex">
      {/* Sidebar Navigation (240px) */}
      <aside className="w-60 bg-white border-r border-stone-200 hidden lg:flex flex-col shrink-0">
        <div className="h-16 px-5 border-b border-stone-200 flex items-center justify-between">
          <span className="font-display text-lg font-semibold text-stone-900 truncate">
            {user.restaurant_name}
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
                onClick={() => setSection(item.id)}
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
            <div className="text-stone-500 capitalize">
              {user.role} · {user.restaurant_slug}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onBackToStorefront(restaurant?.slug || user.restaurant_slug || undefined)}
              className="flex-1 px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              Storefront
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 border border-stone-300 rounded-lg text-stone-600 hover:text-red-600"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Breadcrumb Header */}
        <header className="h-16 bg-white border-b border-stone-200 px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-stone-400 hidden sm:inline">{user.restaurant_name} /</span>
            <h1 className="text-base font-semibold text-stone-900 truncate">
              {navItems.find((n) => n.id === section)?.label}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile section switcher */}
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as AdminSection)}
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
              onClick={() => onBackToStorefront(restaurant?.slug || user.restaurant_slug || undefined)}
              className="lg:hidden px-3 py-1.5 border border-stone-300 rounded-lg text-xs font-medium"
            >
              Storefront
            </button>

            {section !== 'users' && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-stone-300 rounded-lg text-xs font-medium text-stone-700 hover:bg-stone-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 space-y-6 overflow-auto">
          {loadingData && inquiries.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-28 bg-white border border-stone-200 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : null}

          {/* SECTION 1: OVERVIEW */}
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {[
                  { label: 'Total Inquiries', value: String(metrics.totalInquiries) },
                  { label: 'New Inquiries', value: String(metrics.newInquiries) },
                  { label: 'Pending Quotations', value: String(metrics.pendingQuotations) },
                  { label: 'Confirmed Bookings', value: String(metrics.confirmedBookings) },
                  { label: 'Upcoming Events', value: String(metrics.upcomingEventsCount) },
                  { label: 'Estimated Value', value: `$${metrics.estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-white border border-stone-200 rounded-xl p-5"
                  >
                    <div className="text-xs text-stone-500 mb-2">{kpi.label}</div>
                    <div className="font-mono text-2xl font-semibold text-stone-900 tabular-nums">
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Monthly Statistics */}
                <div className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-6">
                  <h2 className="text-sm font-semibold text-stone-900 mb-1">
                    Monthly Inquiry Volume
                  </h2>
                  <p className="text-xs text-stone-500 mb-5">
                    Event requests grouped by target event month
                  </p>
                  {monthlyStats.length === 0 ? (
                    <p className="text-xs text-stone-500">No monthly statistics yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {monthlyStats.map((m) => (
                        <div key={m.month} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-stone-700">{m.month}</span>
                            <span className="font-mono tabular-nums text-stone-600">
                              {m.inquiries} inquiries · {m.total_guests} guests
                            </span>
                          </div>
                          <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#1B4332] rounded-full"
                              style={{ width: `${(m.inquiries / maxMonthlyCount) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Upcoming Events */}
                <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-stone-900">Upcoming Catering Events</h2>
                    <button
                      type="button"
                      onClick={() => setSection('inquiries')}
                      className="text-xs font-medium text-[#1B4332] hover:underline"
                    >
                      View All Inquiries
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
                        <tr>
                          <th className="py-2.5 px-4 font-medium">Event Date</th>
                          <th className="py-2.5 px-4 font-medium">Customer &amp; Venue</th>
                          <th className="py-2.5 px-4 font-medium text-right">Guests</th>
                          <th className="py-2.5 px-4 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {upcomingEvents.map((ev) => (
                          <tr
                            key={String(ev.id)}
                            onClick={() => {
                              setSection('inquiries');
                              openInquiryDetail(Number(ev.id));
                            }}
                            className="hover:bg-stone-50 cursor-pointer"
                          >
                            <td className="py-3 px-4 font-mono text-xs tabular-nums">
                              {String(ev.event_date)}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-stone-900">{String(ev.customer_name)}</div>
                              <div className="text-xs text-stone-500">
                                {String(ev.event_type_name)} · {String(ev.event_venue)}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {String(ev.guest_count)}
                            </td>
                            <td className={`py-3 px-4 text-xs font-medium ${statusColorClass(String(ev.status))}`}>
                              {String(ev.status)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: INQUIRIES & QUOTATIONS */}
          {section === 'inquiries' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={inquirySearch}
                    onChange={(e) => setInquirySearch(e.target.value)}
                    placeholder="Search reference, customer, venue..."
                    className="w-full pl-9 pr-4 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                  />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                  {(['All', ...INQUIRY_STATUSES] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setInquiryStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                        inquiryStatusFilter === st
                          ? 'bg-stone-900 text-white'
                          : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
                      <tr>
                        <th className="py-3 px-4 font-medium">Reference</th>
                        <th className="py-3 px-4 font-medium">Customer</th>
                        <th className="py-3 px-4 font-medium">Event Type</th>
                        <th className="py-3 px-4 font-medium">Event Date</th>
                        <th className="py-3 px-4 font-medium text-right">Guests</th>
                        <th className="py-3 px-4 font-medium">Contact</th>
                        <th className="py-3 px-4 font-medium">Submitted</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        <th className="py-3 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {inquiries.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-sm text-stone-500">
                            No inquiries match your current filter.
                          </td>
                        </tr>
                      ) : (
                        inquiries.map((inq) => (
                          <tr key={inq.id} className="hover:bg-stone-50/70">
                            <td className="py-3 px-4 font-mono text-xs font-medium text-[#1B4332] whitespace-nowrap">
                              {inq.reference_number}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-stone-900">{inq.customer_name}</div>
                              {inq.company_name && (
                                <div className="text-xs text-stone-500">{inq.company_name}</div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs text-stone-700">{inq.event_type_name}</td>
                            <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                              {inq.event_date}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {inq.guest_count}
                            </td>
                            <td className="py-3 px-4 text-xs text-stone-600">
                              <div>{inq.customer_email}</div>
                              <div className="font-mono text-[11px]">{inq.customer_phone}</div>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-stone-500 tabular-nums whitespace-nowrap">
                              {inq.created_at.slice(0, 10)}
                            </td>
                            <td className={`py-3 px-4 text-xs font-medium whitespace-nowrap ${statusColorClass(inq.status)}`}>
                              {inq.status}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openInquiryDetail(inq.id)}
                                className="px-3 py-1.5 border border-stone-300 rounded-lg text-xs font-medium text-stone-800 hover:bg-stone-100"
                              >
                                Manage
                              </button>
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

          {/* SECTION 3: BOOKINGS & PAYMENTS */}
          {section === 'bookings' && (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-stone-900">Confirmed Event Bookings</h2>
                  <p className="text-xs text-stone-500">
                    Payments are never marked paid automatically; verify bank/card settlement before recording.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
                    <tr>
                      <th className="py-3 px-4 font-medium">Booking Ref</th>
                      <th className="py-3 px-4 font-medium">Customer &amp; Venue</th>
                      <th className="py-3 px-4 font-medium">Event Date</th>
                      <th className="py-3 px-4 font-medium text-right">Total</th>
                      <th className="py-3 px-4 font-medium text-right">Paid / Balance</th>
                      <th className="py-3 px-4 font-medium">Payment Status</th>
                      <th className="py-3 px-4 font-medium">Booking Status</th>
                      <th className="py-3 px-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {bookings.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-sm text-stone-500">
                          No confirmed bookings yet. Convert an accepted quotation to create a booking.
                        </td>
                      </tr>
                    ) : (
                      bookings.map((bk) => (
                        <tr key={bk.id} className="hover:bg-stone-50/70">
                          <td className="py-3 px-4 font-mono text-xs font-medium text-[#1B4332] whitespace-nowrap">
                            <div>{bk.booking_reference}</div>
                            <div className="text-[11px] text-stone-400">{bk.inquiry_reference}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-stone-900">{bk.customer_name}</div>
                            <div className="text-xs text-stone-500">
                              {bk.event_venue} · {bk.guest_count} guests
                            </div>
                            <div className="text-[11px] text-stone-500 line-clamp-1">
                              {bk.confirmed_menu_summary}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                            {bk.event_date}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            ${Number(bk.total_amount).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                            <div className="text-[#16A34A]">
                              Paid: ${Number(bk.amount_paid).toFixed(2)}
                            </div>
                            <div className="text-stone-600">
                              Due: ${Number(bk.balance_due).toFixed(2)}
                            </div>
                          </td>
                          <td className={`py-3 px-4 text-xs font-medium whitespace-nowrap ${statusColorClass(bk.payment_status)}`}>
                            {bk.payment_status}
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={bk.booking_status}
                              onChange={(e) => handleBookingStatusChange(bk.id, e.target.value)}
                              className="px-2 py-1 border border-stone-300 rounded text-xs bg-white"
                            >
                              <option value="Confirmed">Confirmed</option>
                              <option value="In Preparation">In Preparation</option>
                              <option value="Completed">Completed</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentModalBooking(bk);
                                setPaymentForm({
                                  amount: Number(bk.balance_due) > 0 ? Number(bk.deposit_amount) : 0,
                                  payment_method: 'ACH Wire Transfer',
                                  reference_code: '',
                                  notes: '',
                                });
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326]"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Record Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSendReminder(bk.id, 'email')}
                              className="px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs text-stone-700 hover:bg-stone-50"
                            >
                              Send Reminder
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION 4: CATALOG MANAGER */}
          {section === 'catalog' && (
            <CatalogManager
              token={token}
              packages={packages}
              categories={categories}
              foodItems={foodItems}
              onRefresh={loadAllAdminData}
            />
          )}

          {/* SECTION 4B: LANDING PAGE & SERVICES */}
          {section === 'landing' && (
            <LandingPageManager
              token={token}
              onPreviewLivePage={(slug) => onBackToStorefront(slug)}
              onUpdated={loadAllAdminData}
            />
          )}

          {section === 'users' && user.role === 'owner' && (
            <UserManagement token={token} />
          )}

          {/* SECTION 5: NOTIFICATIONS & AUDIT */}
          {section === 'notifications' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-200">
                  <h2 className="text-sm font-semibold text-stone-900">
                    Notification Dispatch Log (Email &amp; SMS/Messenger Ready)
                  </h2>
                </div>
                <div className="divide-y divide-stone-100 max-h-[540px] overflow-auto">
                  {notifications.map((n) => (
                    <div key={n.id} className="p-4 text-xs space-y-1">
                      <div className="flex items-center justify-between text-stone-500">
                        <span className="uppercase font-medium">
                          {n.recipient_type} · {n.channel} · {n.event_key}
                        </span>
                        <span className="font-mono tabular-nums">{n.created_at.slice(0, 16)}</span>
                      </div>
                      <div className="font-semibold text-stone-900 text-sm">{n.subject}</div>
                      <div className="text-stone-600">{n.body}</div>
                      <div className="text-stone-400">
                        To: {n.recipient_contact} {n.related_reference ? `· Ref: ${n.related_reference}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-200">
                  <h2 className="text-sm font-semibold text-stone-900">Immutable Audit Trail</h2>
                </div>
                <div className="divide-y divide-stone-100 max-h-[540px] overflow-auto">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-4 text-xs space-y-1">
                      <div className="flex items-center justify-between text-stone-500">
                        <span className="font-medium text-stone-800">{log.actor_name}</span>
                        <span className="font-mono tabular-nums">{log.created_at.slice(0, 16)}</span>
                      </div>
                      <div className="text-stone-900">{log.details}</div>
                      <div className="font-mono text-[11px] text-stone-400">
                        {log.entity_type} #{log.entity_id} · {log.action}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 6: SETTINGS & API DOCS */}
          {section === 'settings' && restaurant && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <form
                onSubmit={handleSaveSettings}
                className="bg-white border border-stone-200 rounded-xl p-6 space-y-4"
              >
                <h2 className="font-display text-xl text-stone-900">
                  Restaurant Tenant Settings ({restaurant.slug})
                </h2>
                {settingsSavedMsg && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    {settingsSavedMsg}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
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
                    <label className="block text-xs font-medium text-stone-700 mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={restaurant.email}
                      onChange={(e) => setRestaurant({ ...restaurant, email: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Tagline</label>
                  <input
                    type="text"
                    value={restaurant.tagline}
                    onChange={(e) => setRestaurant({ ...restaurant, tagline: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={restaurant.phone}
                      onChange={(e) => setRestaurant({ ...restaurant, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">Address</label>
                    <input
                      type="text"
                      value={restaurant.address}
                      onChange={(e) => setRestaurant({ ...restaurant, address: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">Default Tax Rate (%)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={restaurant.tax_rate}
                      onChange={(e) =>
                        setRestaurant({ ...restaurant, tax_rate: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">Service Charge (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={restaurant.service_charge_rate}
                      onChange={(e) =>
                        setRestaurant({
                          ...restaurant,
                          service_charge_rate: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono tabular-nums"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326]"
                >
                  Save Tenant Settings
                </button>
              </form>

              <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-xl text-stone-900">
                  REST API &amp; Laravel Schema Reference
                </h2>
                <p className="text-xs text-stone-600 leading-relaxed">
                  All endpoints enforce tenant scoping via authenticated restaurant ID. Full Laravel
                  MySQL migrations and Sanctum route definitions are included in{' '}
                  <span className="font-mono text-stone-800">laravel-reference/</span>.
                </p>
                <div className="space-y-2 text-xs font-mono bg-stone-50 border border-stone-200 rounded-lg p-4 text-stone-700">
                  <div>GET  /api/public/:slug/storefront</div>
                  <div>POST /api/public/:slug/inquiries (Rate-limited)</div>
                  <div>GET  /api/public/:slug/track?reference=&amp;contact=</div>
                  <div>POST /api/public/:slug/quotations/:num/respond</div>
                  <div>POST /api/auth/login (Bearer Session)</div>
                  <div>GET  /api/admin/overview</div>
                  <div>GET  /api/admin/inquiries/export/csv</div>
                  <div>POST /api/admin/inquiries/:id/quotations</div>
                  <div>POST /api/admin/inquiries/:id/convert-booking</div>
                  <div>POST /api/admin/bookings/:id/payments</div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* INQUIRY DETAIL DRAWER */}
      {selectedInquiryDetail && (
        <div className="fixed inset-0 z-40 bg-black/40 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full overflow-auto border-l border-stone-200 p-6 space-y-6">
            <div className="flex items-start justify-between pb-4 border-b border-stone-200">
              <div>
                <div className="font-mono text-xs text-[#1B4332]">
                  {selectedInquiryDetail.inquiry.reference_number}
                </div>
                <h3 className="font-display text-2xl text-stone-900">
                  {selectedInquiryDetail.inquiry.customer_name}
                </h3>
                <div className="text-xs text-stone-500 mt-0.5">
                  {selectedInquiryDetail.inquiry.customer_email} ·{' '}
                  {selectedInquiryDetail.inquiry.customer_phone} · Preferred:{' '}
                  {selectedInquiryDetail.inquiry.preferred_contact}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInquiryDetail(null)}
                className="p-1.5 text-stone-500 hover:text-stone-900"
                aria-label="Close inquiry drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Workflow Actions: Status & Staff Assignment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#FAFAF9] border border-stone-200 rounded-lg p-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Inquiry Status
                </label>
                <select
                  value={selectedInquiryDetail.inquiry.status}
                  onChange={(e) =>
                    updateInquiryPatch(selectedInquiryDetail.inquiry.id, { status: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                >
                  {INQUIRY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Assigned Coordinator
                </label>
                <select
                  value={selectedInquiryDetail.inquiry.assigned_staff_id ?? ''}
                  onChange={(e) =>
                    updateInquiryPatch(selectedInquiryDetail.inquiry.id, {
                      assigned_staff_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                >
                  <option value="">Unassigned</option>
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Editable Event Info */}
            {editingInquiryFields && (
              <div className="border border-stone-200 rounded-lg p-4 space-y-3">
                <div className="text-xs font-semibold text-stone-800">Event &amp; Delivery Details</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-stone-500 mb-1">Event Date</label>
                    <input
                      type="date"
                      value={editingInquiryFields.event_date}
                      onChange={(e) =>
                        setEditingInquiryFields({ ...editingInquiryFields, event_date: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-stone-500 mb-1">Guests</label>
                    <input
                      type="number"
                      value={editingInquiryFields.guest_count}
                      onChange={(e) =>
                        setEditingInquiryFields({
                          ...editingInquiryFields,
                          guest_count: Number(e.target.value),
                        })
                      }
                      className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-stone-500 mb-1">Venue</label>
                    <input
                      type="text"
                      value={editingInquiryFields.event_venue}
                      onChange={(e) =>
                        setEditingInquiryFields({ ...editingInquiryFields, event_venue: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-xs"
                    />
                  </div>
                </div>
                <div className="text-xs text-stone-600 space-y-1">
                  <div>
                    <span className="font-medium">Delivery Address:</span>{' '}
                    {selectedInquiryDetail.inquiry.delivery_address}
                  </div>
                  <div>
                    <span className="font-medium">Dietary / Allergies:</span>{' '}
                    {selectedInquiryDetail.inquiry.dietary_requirements || 'None'} · Allergies:{' '}
                    {selectedInquiryDetail.inquiry.food_allergies || 'None'}
                  </div>
                  <div>
                    <span className="font-medium">Special Instructions:</span>{' '}
                    {selectedInquiryDetail.inquiry.special_instructions || 'None'}
                  </div>
                  <div>
                    <span className="font-medium">Requested Services:</span>{' '}
                    {selectedInquiryDetail.inquiry.additional_services.join(', ') || 'None'}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      updateInquiryPatch(selectedInquiryDetail.inquiry.id, editingInquiryFields)
                    }
                    className="px-3 py-1.5 border border-stone-300 rounded-lg text-xs font-medium hover:bg-stone-50"
                  >
                    Save Event Edits
                  </button>
                </div>
              </div>
            )}

            {/* Requested Package & Food Items */}
            <div className="border border-stone-200 rounded-lg p-4 space-y-2">
              <div className="text-xs font-semibold text-stone-800">Requested Menu</div>
              {selectedInquiryDetail.inquiry.selected_package_name && (
                <div className="text-sm font-medium text-[#1B4332]">
                  Package: {selectedInquiryDetail.inquiry.selected_package_name}
                </div>
              )}
              {selectedInquiryDetail.items.length > 0 ? (
                <ul className="divide-y divide-stone-100 text-xs">
                  {selectedInquiryDetail.items.map((it) => (
                    <li key={it.id} className="py-2 flex justify-between gap-2">
                      <div>
                        <span className="font-medium text-stone-900">{it.item_name}</span>
                        {it.notes && <div className="text-stone-500">{it.notes}</div>}
                      </div>
                      <span className="font-mono tabular-nums text-stone-700">
                        Qty {it.quantity} {it.line_total ? `· $${Number(it.line_total).toFixed(2)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                !selectedInquiryDetail.inquiry.selected_package_name && (
                  <p className="text-xs text-stone-500">No individual items listed.</p>
                )
              )}
            </div>

            {/* Quotations Section */}
            <div className="border border-stone-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-stone-800">Quotations</div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingQuotation(selectedInquiryDetail.quotations[0] || null);
                    setQuoteBuilderOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1B4332] text-white text-xs font-medium rounded-lg hover:bg-[#143326]"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {selectedInquiryDetail.quotations.length > 0
                    ? 'Revise / New Quotation'
                    : 'Open Quotation Builder'}
                </button>
              </div>

              {selectedInquiryDetail.quotations.length === 0 ? (
                <p className="text-xs text-stone-500">
                  No quotation created yet. Open the Quotation Builder to prepare an itemized quote.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedInquiryDetail.quotations.map((q) => (
                    <div
                      key={q.id}
                      className="p-3 rounded-lg bg-[#FAFAF9] border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="text-xs">
                        <div className="font-mono font-semibold text-stone-900">
                          {q.quotation_number} (v{q.version}) ·{' '}
                          <span className="uppercase">{q.status}</span>
                        </div>
                        <div className="text-stone-600 font-mono tabular-nums">
                          Grand Total: ${Number(q.grand_total).toFixed(2)} · Valid until {q.valid_until}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {restaurant && (
                          <button
                            type="button"
                            onClick={() =>
                              downloadQuotationPdf({
                                restaurant,
                                quotation: q,
                                customerName: selectedInquiryDetail.inquiry.customer_name,
                                customerEmail: selectedInquiryDetail.inquiry.customer_email,
                                customerPhone: selectedInquiryDetail.inquiry.customer_phone,
                                eventDate: selectedInquiryDetail.inquiry.event_date,
                                eventVenue: selectedInquiryDetail.inquiry.event_venue,
                                guestCount: selectedInquiryDetail.inquiry.guest_count,
                                inquiryReference: selectedInquiryDetail.inquiry.reference_number,
                              })
                            }
                            className="px-2.5 py-1 border border-stone-300 rounded text-xs hover:bg-white"
                          >
                            PDF
                          </button>
                        )}
                        {q.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => handleSendDraftQuotation(q.id)}
                            className="px-2.5 py-1 bg-stone-900 text-white rounded text-xs"
                          >
                            Send Email
                          </button>
                        )}
                        {!selectedInquiryDetail.booking &&
                          (q.status === 'accepted' || q.status === 'sent') && (
                            <button
                              type="button"
                              onClick={() =>
                                handleConvertToBooking(selectedInquiryDetail.inquiry.id, q.id)
                              }
                              className="px-2.5 py-1 bg-[#1B4332] text-white rounded text-xs"
                            >
                              Convert to Booking
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedInquiryDetail.booking && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  Confirmed Booking: <span className="font-mono font-semibold">{selectedInquiryDetail.booking.booking_reference}</span> · Payment Status: {selectedInquiryDetail.booking.payment_status}
                </div>
              )}
            </div>

            {/* Internal Staff Notes */}
            <div className="border border-stone-200 rounded-lg p-4 space-y-3">
              <div className="text-xs font-semibold text-stone-800">Internal Staff Notes</div>
              <form onSubmit={handleAddNote} className="flex gap-2">
                <input
                  type="text"
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Add kitchen coordination or follow-up note..."
                  className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-xs"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-stone-900 text-white text-xs font-medium rounded-lg"
                >
                  Add Note
                </button>
              </form>
              <div className="space-y-2">
                {selectedInquiryDetail.notes.map((n) => (
                  <div key={n.id} className="p-2.5 bg-[#FAFAF9] rounded text-xs">
                    <div className="flex justify-between text-stone-500 mb-0.5">
                      <span className="font-medium text-stone-800">{n.author_name}</span>
                      <span className="font-mono tabular-nums">{n.created_at.slice(0, 16)}</span>
                    </div>
                    <p className="text-stone-700">{n.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUOTATION BUILDER MODAL */}
      {quoteBuilderOpen && selectedInquiryDetail && restaurant && (
        <QuotationBuilderModal
          token={token}
          restaurant={restaurant}
          inquiry={selectedInquiryDetail.inquiry}
          inquiryItems={selectedInquiryDetail.items}
          packages={packages}
          foodItems={foodItems}
          existingQuotation={editingQuotation}
          onClose={() => setQuoteBuilderOpen(false)}
          onSaved={async () => {
            await openInquiryDetail(selectedInquiryDetail.inquiry.id);
            await loadAllAdminData();
          }}
        />
      )}

      {/* RECORD VERIFIED PAYMENT MODAL */}
      {paymentModalBooking && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordPayment}
            className="bg-white border border-stone-200 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div>
                <div className="text-xs font-mono text-stone-500">
                  {paymentModalBooking.booking_reference}
                </div>
                <h3 className="font-display text-xl text-stone-900">Record Verified Payment</h3>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalBooking(null)}
                className="text-stone-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-stone-600 bg-[#FAFAF9] border border-stone-200 rounded-lg p-3 space-y-1 font-mono tabular-nums">
              <div>Contract Total: ${Number(paymentModalBooking.total_amount).toFixed(2)}</div>
              <div>Already Paid: ${Number(paymentModalBooking.amount_paid).toFixed(2)}</div>
              <div className="font-semibold text-stone-900">
                Balance Due: ${Number(paymentModalBooking.balance_due).toFixed(2)}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Verified Amount Received ($)
              </label>
              <input
                required
                type="number"
                step="0.01"
                min={0.01}
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Payment Method
              </label>
              <select
                value={paymentForm.payment_method}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              >
                <option value="ACH Wire Transfer">ACH Wire Transfer</option>
                <option value="Verified Card Terminal">Verified Card Terminal</option>
                <option value="Corporate Check Cleared">Corporate Check Cleared</option>
                <option value="Bank Deposit">Bank Deposit</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Transaction / Settlement Reference *
              </label>
              <input
                required
                type="text"
                placeholder="e.g. ACH-992041"
                value={paymentForm.reference_code}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference_code: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Notes</label>
              <input
                type="text"
                placeholder="Verified on bank statement"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>

            <div className="pt-3 border-t border-stone-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPaymentModalBooking(null)}
                className="px-4 py-2 border border-stone-300 rounded-lg text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#1B4332] text-white rounded-lg text-xs font-medium"
              >
                Confirm Payment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
