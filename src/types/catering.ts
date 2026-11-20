export interface Restaurant {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  brand_color: string;
  email: string;
  phone: string;
  address: string;
  logo_text: string;
  tax_rate: number;
  service_charge_rate: number;
  hero_headline: string;
  hero_subheadline: string;
  hero_image_url: string;
  about_title: string;
  about_description: string;
  cta_primary_text: string;
  cta_secondary_text: string;
  is_published: boolean;
}

export interface RestaurantService {
  id: number;
  restaurant_id: number;
  title: string;
  description: string;
  price_type: 'flat' | 'per_person' | 'included' | 'custom';
  price: number;
  is_available: boolean;
  sort_order: number;
}

export interface EventType {
  id: number;
  restaurant_id: number;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  sort_order: number;
}

export interface AddonOption {
  name: string;
  price: number;
}

export interface CateringPackage {
  id: number;
  restaurant_id: number;
  name: string;
  description: string;
  pricing_type: 'per_person' | 'flat_package';
  price: number;
  min_guests: number;
  max_guests: number | null;
  inclusions: string[];
  addons: AddonOption[];
  image_url: string;
  is_available: boolean;
  is_seasonal: boolean;
  promo_label: string | null;
}

export interface FoodCategory {
  id: number;
  restaurant_id: number;
  name: string;
  slug: string;
  sort_order: number;
}

export interface FoodItem {
  id: number;
  restaurant_id: number;
  category_id: number;
  name: string;
  description: string;
  unit_price: number | null;
  price_unit: string;
  min_order_qty: number;
  dietary_tags: string;
  allergens: string;
  image_url: string;
  is_available: boolean;
  addons: AddonOption[];
}

export interface CustomCartItem {
  foodItem: FoodItem;
  quantity: number;
  notes: string;
  selectedAddons: AddonOption[];
}

export type InquiryStatus =
  | 'Request Received'
  | 'Under Review'
  | 'Quotation Sent'
  | 'Awaiting Customer Confirmation'
  | 'Confirmed'
  | 'Completed'
  | 'Cancelled';

export interface InquiryItemRecord {
  id: number;
  inquiry_id: number;
  food_item_id: number | null;
  item_name: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  notes: string | null;
}

export interface InquiryNote {
  id: number;
  inquiry_id: number;
  user_id: number | null;
  author_name: string;
  note: string;
  is_internal: number;
  created_at: string;
}

export interface QuotationItem {
  id?: number;
  quotation_id?: number;
  item_type: 'package' | 'food_item' | 'service' | 'custom';
  title: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface Quotation {
  id: number;
  restaurant_id: number;
  inquiry_id: number;
  quotation_number: string;
  version: number;
  subtotal: number;
  delivery_fee: number;
  service_charge: number;
  discount_amount: number;
  tax_amount: number;
  grand_total: number;
  payment_terms: string;
  terms_conditions: string;
  valid_until: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  created_by_name: string;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  items: QuotationItem[];
}

export interface CateringInquiry {
  id: number;
  restaurant_id: number;
  customer_id: number;
  reference_number: string;
  event_type_id: number | null;
  event_type_name: string;
  event_date: string;
  start_time: string;
  end_time: string | null;
  guest_count: number;
  event_venue: string;
  delivery_address: string;
  venue_setting: 'indoor' | 'outdoor' | 'unspecified';
  selected_package_id: number | null;
  selected_package_name: string | null;
  dietary_requirements: string;
  food_allergies: string;
  special_instructions: string;
  additional_services: string[];
  estimated_total: number | null;
  status: InquiryStatus;
  assigned_staff_id: number | null;
  assigned_staff_name: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  company_name: string | null;
  preferred_contact: 'Phone' | 'Email' | 'Messenger';
  created_at: string;
  updated_at: string;
}

export interface BookingPayment {
  id: number;
  booking_id: number;
  amount: number;
  payment_method: string;
  reference_code: string;
  recorded_by_name: string;
  notes: string | null;
  paid_at: string;
}

export interface Booking {
  id: number;
  restaurant_id: number;
  restaurant_name?: string;
  restaurant_slug?: string;
  inquiry_id: number;
  inquiry_reference?: string;
  quotation_id: number | null;
  booking_reference: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  event_date: string;
  event_venue: string;
  guest_count: number;
  confirmed_menu_summary: string;
  total_amount: number;
  deposit_amount: number;
  amount_paid: number;
  balance_due: number;
  payment_status: 'Unpaid' | 'Deposit Paid' | 'Partially Paid' | 'Fully Paid';
  booking_status: 'Confirmed' | 'In Preparation' | 'Completed' | 'Cancelled';
  created_at: string;
  payments?: BookingPayment[];
}

export interface NotificationRecord {
  id: number;
  restaurant_id: number;
  recipient_type: 'customer' | 'staff';
  recipient_contact: string;
  channel: 'email' | 'sms' | 'messenger';
  event_key: string;
  subject: string;
  body: string;
  status: string;
  related_reference: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  restaurant_id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  actor_name: string;
  details: string;
  created_at: string;
}

export interface AuthUser {
  id: number;
  restaurant_id: number | null;
  name: string;
  email: string;
  role: 'superadmin' | 'owner' | 'manager' | 'staff';
  is_active: boolean;
  restaurant_name: string | null;
  restaurant_slug: string | null;
}

export interface ManagedUser {
  id: number;
  restaurant_id: number | null;
  restaurant_name: string | null;
  restaurant_slug: string | null;
  name: string;
  email: string;
  role: 'superadmin' | 'owner' | 'manager' | 'staff';
  is_active: boolean;
  created_at: string;
}

export interface SuperadminRestaurantSummary extends Restaurant {
  inquiry_count: number;
  booking_count: number;
  service_count: number;
  owner_name: string | null;
  owner_email: string | null;
}
