import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  db,
  initializeDatabase,
  seedDefaultCatalogForNewRestaurant,
  seedDefaultServicesForRestaurant,
} from './server/db.ts';

initializeDatabase();

const app = express();
app.use(express.json({ limit: '2mb' }));

interface AuthUser {
  id: number;
  restaurant_id: number | null;
  name: string;
  email: string;
  role: 'superadmin' | 'owner' | 'manager' | 'staff';
  is_active: boolean;
  restaurant_name: string | null;
  restaurant_slug: string | null;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const current = rateLimitMap.get(key);
    if (!current || current.resetAt < now) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (current.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment before trying again.' });
      return;
    }
    current.count += 1;
    next();
  };
}

function logAudit(
  restaurantId: number | null,
  entityType: string,
  entityId: number,
  action: string,
  actorName: string,
  details: string
): void {
  if (!restaurantId) return;
  db.prepare(`
    INSERT INTO audit_logs (restaurant_id, entity_type, entity_id, action, actor_name, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(restaurantId, entityType, entityId, action, actorName, details);
}

function dispatchNotification(params: {
  restaurantId: number;
  recipientType: 'customer' | 'staff';
  recipientContact: string;
  channel?: 'email' | 'sms' | 'messenger';
  eventKey: string;
  subject: string;
  body: string;
  relatedReference?: string;
}): void {
  const channel = params.channel || 'email';
  db.prepare(`
    INSERT INTO notifications (restaurant_id, recipient_type, recipient_contact, channel, event_key, subject, body, status, related_reference)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?)
  `).run(
    params.restaurantId,
    params.recipientType,
    params.recipientContact,
    channel,
    params.eventKey,
    params.subject,
    params.body,
    params.relatedReference || null
  );
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const row = db.prepare(`
    SELECT s.token, s.expires_at, u.id, u.restaurant_id, u.name, u.email, u.role, u.is_active,
           r.name as restaurant_name, r.slug as restaurant_slug
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN restaurants r ON r.id = u.restaurant_id
    WHERE s.token = ?
  `).get(token) as (Omit<AuthUser, 'is_active'> & { is_active: number; token: string; expires_at: string }) | undefined;

  if (!row || new Date(row.expires_at).getTime() < Date.now() || !row.is_active) {
    if (row) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    res.status(401).json({ error: 'Session expired, invalid, or suspended' });
    return;
  }

  req.user = {
    id: row.id,
    restaurant_id: row.restaurant_id ?? null,
    name: row.name,
    email: row.email,
    role: row.role,
    is_active: Boolean(row.is_active),
    restaurant_name: row.restaurant_name ?? null,
    restaurant_slug: row.restaurant_slug ?? null,
  };
  next();
}

function requireTenantUser(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role === 'superadmin' && !req.user.restaurant_id) {
    const overrideId = Number(req.query.restaurant_id || req.body?.restaurant_id || 0);
    if (overrideId > 0) {
      req.user.restaurant_id = overrideId;
      next();
      return;
    }
    res.status(403).json({ error: 'Select a target restaurant tenant to perform tenant-level operations.' });
    return;
  }
  if (!req.user.restaurant_id) {
    res.status(403).json({ error: 'User is not assigned to a restaurant tenant.' });
    return;
  }
  next();
}

function requireSuperAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'superadmin') {
    res.status(403).json({ error: 'Superadmin privileges required.' });
    return;
  }
  next();
}

function resolveTargetRestaurantId(req: AuthedRequest): number {
  if (req.user?.role === 'superadmin') {
    const paramId = Number(req.query.restaurant_id || req.body?.restaurant_id || 0);
    if (paramId > 0) return paramId;
  }
  return Number(req.user?.restaurant_id || 0);
}

function generateReference(prefix: string, slug: string): string {
  const code = slug.split('-').map((p) => p[0]?.toUpperCase() || 'X').join('').slice(0, 3);
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${code}-${year}-${rand}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ============================================================================
// PUBLIC MULTI-TENANT STOREFRONT & OWNER REGISTRATION ROUTES
// ============================================================================

app.get('/api/public/restaurants', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, slug, name, tagline, brand_color, email, phone, address, logo_text,
           tax_rate, service_charge_rate, hero_headline, hero_subheadline, hero_image_url,
           about_title, about_description, cta_primary_text, cta_secondary_text, is_published
    FROM restaurants
    WHERE is_published = 1
    ORDER BY id ASC
  `).all();
  res.json({
    restaurants: rows.map((r: Record<string, unknown>) => ({
      ...r,
      is_published: Boolean(r.is_published),
    })),
  });
});

app.get('/api/public/:slug/storefront', (req, res) => {
  const restaurant = db.prepare(`
    SELECT id, slug, name, tagline, brand_color, email, phone, address, logo_text,
           tax_rate, service_charge_rate, hero_headline, hero_subheadline, hero_image_url,
           about_title, about_description, cta_primary_text, cta_secondary_text, is_published
    FROM restaurants WHERE slug = ?
  `).get(req.params.slug) as Record<string, unknown> | undefined;

  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  const rid = Number(restaurant.id);
  const eventTypes = db.prepare('SELECT * FROM event_types WHERE restaurant_id = ? ORDER BY sort_order ASC').all(rid);
  const packages = db.prepare('SELECT * FROM catering_packages WHERE restaurant_id = ? ORDER BY is_seasonal DESC, id ASC').all(rid);
  const categories = db.prepare('SELECT * FROM food_categories WHERE restaurant_id = ? ORDER BY sort_order ASC').all(rid);
  const foodItems = db.prepare('SELECT * FROM food_items WHERE restaurant_id = ? ORDER BY category_id ASC, id ASC').all(rid);
  const services = db.prepare('SELECT * FROM restaurant_services WHERE restaurant_id = ? AND is_available = 1 ORDER BY sort_order ASC, id ASC').all(rid);

  res.json({
    restaurant: {
      ...restaurant,
      is_published: Boolean(restaurant.is_published),
    },
    eventTypes,
    packages: packages.map((p: Record<string, unknown>) => ({
      ...p,
      inclusions: JSON.parse(String(p.inclusions_json || '[]')),
      addons: JSON.parse(String(p.addons_json || '[]')),
      is_available: Boolean(p.is_available),
      is_seasonal: Boolean(p.is_seasonal),
    })),
    categories,
    foodItems: foodItems.map((f: Record<string, unknown>) => ({
      ...f,
      addons: JSON.parse(String(f.addons_json || '[]')),
      is_available: Boolean(f.is_available),
    })),
    services: services.map((s: Record<string, unknown>) => ({
      ...s,
      is_available: Boolean(s.is_available),
    })),
  });
});

const registerOwnerSchema = z.object({
  owner_name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  restaurant_name: z.string().min(2).max(120),
  slug: z.string().max(60).optional(),
  tagline: z.string().min(3).max(200),
  phone: z.string().min(6).max(40),
  address: z.string().min(5).max(300),
  brand_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#1B4332'),
  hero_headline: z.string().min(3).max(160).default('Make Every Occasion Delicious'),
  hero_subheadline: z.string().min(5).max(300).default('From intimate family gatherings to grand celebrations, let us take care of the food.'),
  hero_image_url: z.string().min(5).default('/src/assets/images/hero_catering_banquet_1795136239169.jpg'),
  about_title: z.string().min(2).max(140).default('Our Culinary Philosophy'),
  about_description: z.string().min(5).max(1000).default('Crafted from scratch for private celebrations, corporate gatherings, and community events.'),
  starter_services: z.array(z.object({
    title: z.string().min(2),
    description: z.string().default(''),
    price_type: z.enum(['flat', 'per_person', 'included', 'custom']).default('flat'),
    price: z.number().min(0).default(0),
  })).default([]),
});

app.post('/api/public/register-owner', rateLimit(15, 60_000), (req, res) => {
  const parsed = registerOwnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Please verify your registration details.', details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;

  const existingEmail = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(d.email.trim());
  if (existingEmail) {
    res.status(409).json({ error: 'An account with this email address already exists.' });
    return;
  }

  let slug = slugify(d.slug && d.slug.trim() ? d.slug : d.restaurant_name);
  if (!slug) slug = `kitchen-${Date.now()}`;
  if (db.prepare('SELECT id FROM restaurants WHERE slug = ?').get(slug)) {
    slug = `${slug}-${Math.floor(100 + Math.random() * 899)}`;
  }

  const rRes = db.prepare(`
    INSERT INTO restaurants (
      slug, name, tagline, brand_color, email, phone, address, logo_text,
      tax_rate, service_charge_rate, hero_headline, hero_subheadline,
      hero_image_url, about_title, about_description, is_published
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 8.5, 15.0, ?, ?, ?, ?, ?, 1)
  `).run(
    slug,
    d.restaurant_name.trim(),
    d.tagline.trim(),
    d.brand_color,
    d.email.trim(),
    d.phone.trim(),
    d.address.trim(),
    d.restaurant_name.trim(),
    d.hero_headline.trim(),
    d.hero_subheadline.trim(),
    d.hero_image_url,
    d.about_title.trim(),
    d.about_description.trim()
  );

  const restaurantId = Number(rRes.lastInsertRowid);
  const passwordHash = bcrypt.hashSync(d.password, 10);

  const uRes = db.prepare(`
    INSERT INTO users (restaurant_id, name, email, password_hash, role, is_active)
    VALUES (?, ?, ?, ?, 'owner', 1)
  `).run(restaurantId, d.owner_name.trim(), d.email.trim(), passwordHash);
  const userId = Number(uRes.lastInsertRowid);

  seedDefaultCatalogForNewRestaurant(restaurantId, d.restaurant_name.trim());

  if (d.starter_services.length > 0) {
    const insertSvc = db.prepare(`
      INSERT INTO restaurant_services (restaurant_id, title, description, price_type, price, is_available, sort_order)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);
    d.starter_services.forEach((svc, idx) => {
      insertSvc.run(restaurantId, svc.title.trim(), svc.description.trim(), svc.price_type, Number(svc.price), idx + 1);
    });
  } else {
    seedDefaultServicesForRestaurant(restaurantId);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, restaurant_id, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    restaurantId,
    expiresAt
  );

  dispatchNotification({
    restaurantId,
    recipientType: 'staff',
    recipientContact: d.email.trim(),
    eventKey: 'owner_registered',
    subject: `Welcome to Hearth & Table — ${d.restaurant_name.trim()} Landing Page Live`,
    body: `Your catering landing page (${slug}) is now published and ready to accept quotation inquiries.`,
  });
  logAudit(restaurantId, 'restaurant', restaurantId, 'owner_registered', d.owner_name.trim(), `Registered restaurant ${d.restaurant_name.trim()} (${slug})`);

  res.status(201).json({
    token,
    restaurant: db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId),
    user: {
      id: userId,
      restaurant_id: restaurantId,
      name: d.owner_name.trim(),
      email: d.email.trim(),
      role: 'owner',
      is_active: true,
      restaurant_name: d.restaurant_name.trim(),
      restaurant_slug: slug,
    },
  });
});

const publicInquirySchema = z.object({
  event_type_id: z.number().int().nullable().optional(),
  event_type_name: z.string().min(2),
  event_date: z.string().min(8),
  start_time: z.string().min(2),
  end_time: z.string().optional().nullable(),
  guest_count: z.number().int().min(10).max(5000),
  event_venue: z.string().min(2).max(200),
  delivery_address: z.string().min(5).max(400),
  venue_setting: z.enum(['indoor', 'outdoor', 'unspecified']).default('unspecified'),
  selected_package_id: z.number().int().nullable().optional(),
  selected_items: z.array(z.object({
    food_item_id: z.number().int(),
    quantity: z.number().int().min(1),
    notes: z.string().max(300).optional(),
    selected_addons: z.array(z.object({ name: z.string(), price: z.number() })).optional(),
  })).default([]),
  dietary_requirements: z.string().max(600).optional().default(''),
  food_allergies: z.string().max(600).optional().default(''),
  special_instructions: z.string().max(1500).optional().default(''),
  additional_services: z.array(z.string()).default([]),
  full_name: z.string().min(2).max(150),
  phone: z.string().min(6).max(40),
  email: z.string().email(),
  company_name: z.string().max(150).optional().default(''),
  preferred_contact: z.enum(['Phone', 'Email', 'Messenger']).default('Email'),
  privacy_consent: z.literal(true),
  website_honeypot: z.string().max(0).optional(),
  captcha_checked: z.literal(true),
});

app.post('/api/public/:slug/inquiries', rateLimit(20, 60_000), (req, res) => {
  const restaurant = db.prepare('SELECT id, slug, name, email FROM restaurants WHERE slug = ?').get(req.params.slug) as { id: number; slug: string; name: string; email: string } | undefined;
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  const parsed = publicInquirySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  if (!data.selected_package_id && data.selected_items.length === 0) {
    res.status(422).json({ error: 'Please select a catering package or at least one food item for your inquiry.' });
    return;
  }

  let customer = db.prepare('SELECT id FROM customers WHERE restaurant_id = ? AND lower(email) = lower(?)').get(restaurant.id, data.email) as { id: number } | undefined;
  let customerId: number;
  if (customer) {
    customerId = customer.id;
    db.prepare(`
      UPDATE customers SET full_name = ?, phone = ?, company_name = ?, preferred_contact = ? WHERE id = ?
    `).run(data.full_name, data.phone, data.company_name || '', data.preferred_contact, customerId);
  } else {
    const custRes = db.prepare(`
      INSERT INTO customers (restaurant_id, full_name, email, phone, company_name, preferred_contact)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(restaurant.id, data.full_name, data.email, data.phone, data.company_name || '', data.preferred_contact);
    customerId = Number(custRes.lastInsertRowid);
  }

  let selectedPackageName: string | null = null;
  let estimatedTotal = 0;

  if (data.selected_package_id) {
    const pkg = db.prepare('SELECT id, name, pricing_type, price FROM catering_packages WHERE id = ? AND restaurant_id = ?').get(data.selected_package_id, restaurant.id) as { id: number; name: string; pricing_type: string; price: number } | undefined;
    if (pkg) {
      selectedPackageName = pkg.name;
      estimatedTotal += pkg.pricing_type === 'per_person' ? pkg.price * data.guest_count : pkg.price;
    }
  }

  const resolvedItems: Array<{ food_item_id: number; item_name: string; quantity: number; unit_price: number | null; line_total: number | null; notes: string }> = [];
  for (const item of data.selected_items) {
    const food = db.prepare('SELECT id, name, unit_price FROM food_items WHERE id = ? AND restaurant_id = ?').get(item.food_item_id, restaurant.id) as { id: number; name: string; unit_price: number | null } | undefined;
    if (food) {
      const addonSum = (item.selected_addons || []).reduce((acc, a) => acc + a.price, 0);
      const unitPrice = food.unit_price !== null ? food.unit_price + addonSum : null;
      const lineTotal = unitPrice !== null ? unitPrice * item.quantity : null;
      if (lineTotal !== null) {
        estimatedTotal += lineTotal;
      }
      const addonText = (item.selected_addons || []).length > 0
        ? `Add-ons: ${(item.selected_addons || []).map((a) => a.name).join(', ')}`
        : '';
      const combinedNotes = [addonText, item.notes || ''].filter(Boolean).join(' · ');
      resolvedItems.push({
        food_item_id: food.id,
        item_name: food.name,
        quantity: item.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        notes: combinedNotes,
      });
    }
  }

  let referenceNumber = generateReference('INQ', restaurant.slug);
  while (db.prepare('SELECT 1 FROM catering_inquiries WHERE reference_number = ?').get(referenceNumber)) {
    referenceNumber = generateReference('INQ', restaurant.slug);
  }

  const inqRes = db.prepare(`
    INSERT INTO catering_inquiries (
      restaurant_id, customer_id, reference_number, event_type_id, event_type_name,
      event_date, start_time, end_time, guest_count, event_venue, delivery_address,
      venue_setting, selected_package_id, selected_package_name, dietary_requirements,
      food_allergies, special_instructions, additional_services_json, estimated_total,
      status, privacy_consent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Request Received', 1)
  `).run(
    restaurant.id,
    customerId,
    referenceNumber,
    data.event_type_id || null,
    data.event_type_name,
    data.event_date,
    data.start_time,
    data.end_time || null,
    data.guest_count,
    data.event_venue,
    data.delivery_address,
    data.venue_setting,
    data.selected_package_id || null,
    selectedPackageName,
    data.dietary_requirements || '',
    data.food_allergies || '',
    data.special_instructions || '',
    JSON.stringify(data.additional_services),
    estimatedTotal > 0 ? Number(estimatedTotal.toFixed(2)) : null
  );

  const inquiryId = Number(inqRes.lastInsertRowid);
  const insertItemStmt = db.prepare(`
    INSERT INTO inquiry_items (inquiry_id, food_item_id, item_name, quantity, unit_price, line_total, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const ri of resolvedItems) {
    insertItemStmt.run(inquiryId, ri.food_item_id, ri.item_name, ri.quantity, ri.unit_price, ri.line_total, ri.notes);
  }

  dispatchNotification({
    restaurantId: restaurant.id,
    recipientType: 'customer',
    recipientContact: data.email,
    eventKey: 'inquiry_submitted',
    subject: `Catering Inquiry Received: ${referenceNumber} — ${restaurant.name}`,
    body: `Dear ${data.full_name}, we have received your catering request for ${data.event_date} (${data.guest_count} guests). Please note this is a quotation inquiry and our culinary team will verify date availability before preparing your tailored quote.`,
    relatedReference: referenceNumber,
  });

  dispatchNotification({
    restaurantId: restaurant.id,
    recipientType: 'staff',
    recipientContact: restaurant.email,
    eventKey: 'new_inquiry',
    subject: `New Catering Inquiry ${referenceNumber} (${data.guest_count} guests · ${data.event_date})`,
    body: `${data.full_name} requested catering for ${data.event_type_name} at ${data.event_venue}.`,
    relatedReference: referenceNumber,
  });

  logAudit(restaurant.id, 'inquiry', inquiryId, 'inquiry_submitted', data.full_name, `Customer submitted inquiry ${referenceNumber} for ${data.event_date}`);

  res.status(201).json({
    reference_number: referenceNumber,
    status: 'Request Received',
    estimated_total: estimatedTotal > 0 ? Number(estimatedTotal.toFixed(2)) : null,
    message: 'Your quotation inquiry has been submitted. Our catering team will review availability and respond shortly.',
  });
});

app.get('/api/public/:slug/track', rateLimit(40, 60_000), (req, res) => {
  const reference = String(req.query.reference || '').trim().toUpperCase();
  const contact = String(req.query.contact || '').trim().toLowerCase();

  if (!reference || !contact) {
    res.status(400).json({ error: 'Please provide both your inquiry reference number and email or phone number.' });
    return;
  }

  const restaurant = db.prepare('SELECT id, slug, name, email, phone, address, logo_text FROM restaurants WHERE slug = ?').get(req.params.slug) as Record<string, unknown> | undefined;
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  const inquiry = db.prepare(`
    SELECT i.*, c.full_name, c.email as customer_email, c.phone as customer_phone, c.company_name, c.preferred_contact
    FROM catering_inquiries i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.restaurant_id = ? AND upper(i.reference_number) = ?
  `).get(Number(restaurant.id), reference) as Record<string, unknown> | undefined;

  if (!inquiry) {
    res.status(404).json({ error: 'No inquiry found with that reference number.' });
    return;
  }

  const normalizedEmail = String(inquiry.customer_email || '').toLowerCase();
  const normalizedPhone = String(inquiry.customer_phone || '').replace(/\D/g, '');
  const contactDigits = contact.replace(/\D/g, '');

  const emailMatches = normalizedEmail === contact;
  const phoneMatches = contactDigits.length >= 6 && normalizedPhone.endsWith(contactDigits.slice(-7));

  if (!emailMatches && !phoneMatches) {
    res.status(403).json({ error: 'Contact verification failed. Please enter the email address or phone number used on the inquiry.' });
    return;
  }

  const items = db.prepare('SELECT * FROM inquiry_items WHERE inquiry_id = ?').all(Number(inquiry.id));
  const quotation = db.prepare(`
    SELECT * FROM quotations WHERE inquiry_id = ? AND status IN ('sent', 'accepted', 'declined')
    ORDER BY version DESC, id DESC LIMIT 1
  `).get(Number(inquiry.id)) as Record<string, unknown> | undefined;

  const quotationItems = quotation
    ? db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ?').all(Number(quotation.id))
    : [];

  const booking = db.prepare('SELECT * FROM bookings WHERE inquiry_id = ? ORDER BY id DESC LIMIT 1').get(Number(inquiry.id));

  res.json({
    restaurant,
    inquiry: {
      ...inquiry,
      additional_services: JSON.parse(String(inquiry.additional_services_json || '[]')),
    },
    items,
    quotation: quotation ? { ...quotation, items: quotationItems } : null,
    booking: booking || null,
  });
});

app.post('/api/public/:slug/quotations/:quotationNumber/respond', (req, res) => {
  const { reference, contact, decision, customer_note } = req.body as {
    reference?: string;
    contact?: string;
    decision?: 'accept' | 'decline';
    customer_note?: string;
  };

  if (!reference || !contact || (decision !== 'accept' && decision !== 'decline')) {
    res.status(400).json({ error: 'Missing verification details or decision.' });
    return;
  }

  const restaurant = db.prepare('SELECT id, name, email FROM restaurants WHERE slug = ?').get(req.params.slug) as { id: number; name: string; email: string } | undefined;
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  const quotation = db.prepare(`
    SELECT q.*, i.reference_number, i.event_date, i.event_venue, i.guest_count,
           c.full_name, c.email as customer_email, c.phone as customer_phone
    FROM quotations q
    JOIN catering_inquiries i ON i.id = q.inquiry_id
    JOIN customers c ON c.id = i.customer_id
    WHERE q.restaurant_id = ? AND upper(q.quotation_number) = ? AND upper(i.reference_number) = ?
  `).get(restaurant.id, req.params.quotationNumber.toUpperCase(), reference.trim().toUpperCase()) as Record<string, unknown> | undefined;

  if (!quotation) {
    res.status(404).json({ error: 'Quotation not found.' });
    return;
  }

  const contactClean = contact.trim().toLowerCase();
  const phoneDigits = String(quotation.customer_phone || '').replace(/\D/g, '');
  const inputDigits = contactClean.replace(/\D/g, '');
  if (String(quotation.customer_email).toLowerCase() !== contactClean && !(inputDigits.length >= 6 && phoneDigits.endsWith(inputDigits.slice(-7)))) {
    res.status(403).json({ error: 'Verification failed.' });
    return;
  }

  if (quotation.status !== 'sent') {
    res.status(409).json({ error: `This quotation is already marked as ${quotation.status}.` });
    return;
  }

  const inquiryId = Number(quotation.inquiry_id);
  const quotationId = Number(quotation.id);

  if (decision === 'accept') {
    db.prepare(`UPDATE quotations SET status = 'accepted', accepted_at = datetime('now') WHERE id = ?`).run(quotationId);
    db.prepare(`UPDATE catering_inquiries SET status = 'Confirmed', updated_at = datetime('now') WHERE id = ?`).run(inquiryId);

    const qItems = db.prepare('SELECT title, quantity FROM quotation_items WHERE quotation_id = ?').all(quotationId) as Array<{ title: string; quantity: number }>;
    const summary = qItems.map((it) => `${it.title} (x${it.quantity})`).join(', ');
    const totalAmount = Number(quotation.grand_total);
    const depositAmount = Number((totalAmount * 0.4).toFixed(2));
    const bookingRef = generateReference('BK', req.params.slug);

    const existingBk = db.prepare('SELECT id FROM bookings WHERE inquiry_id = ?').get(inquiryId);
    if (!existingBk) {
      const bkRes = db.prepare(`
        INSERT INTO bookings (
          restaurant_id, inquiry_id, quotation_id, booking_reference, customer_name,
          customer_email, customer_phone, event_date, event_venue, guest_count,
          confirmed_menu_summary, total_amount, deposit_amount, amount_paid, balance_due,
          payment_status, booking_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'Unpaid', 'Confirmed')
      `).run(
        restaurant.id, inquiryId, quotationId, bookingRef,
        String(quotation.full_name), String(quotation.customer_email), String(quotation.customer_phone),
        String(quotation.event_date), String(quotation.event_venue), Number(quotation.guest_count),
        summary || 'Confirmed Catering Package', totalAmount, depositAmount, totalAmount
      );

      dispatchNotification({
        restaurantId: restaurant.id,
        recipientType: 'customer',
        recipientContact: String(quotation.customer_email),
        eventKey: 'booking_confirmed',
        subject: `Booking Confirmed: ${bookingRef} — ${restaurant.name}`,
        body: `Thank you for accepting quotation ${quotation.quotation_number}. Your event on ${quotation.event_date} is confirmed under ${bookingRef}. Deposit of $${depositAmount.toFixed(2)} is pending verification.`,
        relatedReference: bookingRef,
      });

      dispatchNotification({
        restaurantId: restaurant.id,
        recipientType: 'staff',
        recipientContact: restaurant.email,
        eventKey: 'quotation_accepted',
        subject: `Quotation Accepted: ${quotation.quotation_number} → Booking ${bookingRef}`,
        body: `${quotation.full_name} explicitly accepted quotation ${quotation.quotation_number}. Follow up on $${depositAmount.toFixed(2)} deposit.`,
        relatedReference: bookingRef,
      });

      logAudit(restaurant.id, 'booking', Number(bkRes.lastInsertRowid), 'customer_accepted_quotation', String(quotation.full_name), `Customer accepted ${quotation.quotation_number}; created booking ${bookingRef}`);
    }

    res.json({ ok: true, status: 'accepted', message: 'Quotation accepted and booking confirmed.' });
    return;
  }

  db.prepare(`UPDATE quotations SET status = 'declined' WHERE id = ?`).run(quotationId);
  db.prepare(`UPDATE catering_inquiries SET status = 'Under Review', updated_at = datetime('now') WHERE id = ?`).run(inquiryId);
  if (customer_note) {
    db.prepare(`INSERT INTO inquiry_notes (inquiry_id, author_name, note, is_internal) VALUES (?, ?, ?, 0)`).run(inquiryId, String(quotation.full_name), `Revision request: ${customer_note}`);
  }
  dispatchNotification({
    restaurantId: restaurant.id,
    recipientType: 'staff',
    recipientContact: restaurant.email,
    eventKey: 'quotation_revision_requested',
    subject: `Quotation Revision Requested: ${quotation.quotation_number}`,
    body: `${quotation.full_name} requested updates to ${quotation.quotation_number}. Note: ${customer_note || 'No note provided'}`,
    relatedReference: String(quotation.reference_number),
  });
  logAudit(restaurant.id, 'quotation', quotationId, 'quotation_declined', String(quotation.full_name), `Customer requested changes: ${customer_note || 'None'}`);

  res.json({ ok: true, status: 'declined', message: 'Your revision request has been sent to our catering coordinator.' });
});

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = db.prepare(`
    SELECT u.*, r.name as restaurant_name, r.slug as restaurant_slug
    FROM users u
    LEFT JOIN restaurants r ON r.id = u.restaurant_id
    WHERE lower(u.email) = lower(?)
  `).get(email.trim()) as (Omit<AuthUser, 'is_active'> & { is_active: number; password_hash: string }) | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'Your user account has been suspended. Contact a platform superadmin.' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, restaurant_id, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    user.id,
    user.restaurant_id ?? null,
    expiresAt
  );

  res.json({
    token,
    user: {
      id: user.id,
      restaurant_id: user.restaurant_id ?? null,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: Boolean(user.is_active),
      restaurant_name: user.restaurant_name ?? null,
      restaurant_slug: user.restaurant_slug ?? null,
    },
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = (req.headers.authorization || '').slice(7).trim();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

// ============================================================================
// TENANT-SCOPED ADMIN DASHBOARD & LANDING PAGE / SERVICES ROUTES
// ============================================================================

app.get('/api/admin/overview', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;

  const totalInquiries = (db.prepare('SELECT COUNT(*) as c FROM catering_inquiries WHERE restaurant_id = ?').get(rid) as { c: number }).c;
  const newInquiries = (db.prepare(`SELECT COUNT(*) as c FROM catering_inquiries WHERE restaurant_id = ? AND status = 'Request Received'`).get(rid) as { c: number }).c;
  const pendingQuotations = (db.prepare(`SELECT COUNT(*) as c FROM catering_inquiries WHERE restaurant_id = ? AND status IN ('Under Review', 'Quotation Sent', 'Awaiting Customer Confirmation')`).get(rid) as { c: number }).c;
  const confirmedBookings = (db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE restaurant_id = ? AND booking_status IN ('Confirmed', 'In Preparation')`).get(rid) as { c: number }).c;
  const estimatedValue = (db.prepare(`SELECT COALESCE(SUM(estimated_total), 0) as total FROM catering_inquiries WHERE restaurant_id = ? AND status != 'Cancelled'`).get(rid) as { total: number }).total;
  const quotedValue = (db.prepare(`SELECT COALESCE(SUM(grand_total), 0) as total FROM quotations WHERE restaurant_id = ? AND status IN ('sent', 'accepted')`).get(rid) as { total: number }).total;

  const upcomingEvents = db.prepare(`
    SELECT i.id, i.reference_number, i.event_type_name, i.event_date, i.start_time, i.guest_count, i.event_venue, i.status, c.full_name as customer_name
    FROM catering_inquiries i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.restaurant_id = ? AND i.status != 'Cancelled' AND i.status != 'Completed'
    ORDER BY i.event_date ASC LIMIT 6
  `).all(rid);

  const monthlyStats = db.prepare(`
    SELECT substr(event_date, 1, 7) as month, COUNT(*) as inquiries, COALESCE(SUM(guest_count), 0) as total_guests, COALESCE(SUM(estimated_total), 0) as value
    FROM catering_inquiries
    WHERE restaurant_id = ?
    GROUP BY substr(event_date, 1, 7)
    ORDER BY month ASC LIMIT 8
  `).all(rid);

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(rid) as Record<string, unknown>;
  const staff = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE restaurant_id = ? ORDER BY id ASC').all(rid);

  res.json({
    restaurant: {
      ...restaurant,
      is_published: Boolean(restaurant.is_published),
    },
    staff,
    metrics: {
      totalInquiries,
      newInquiries,
      pendingQuotations,
      confirmedBookings,
      upcomingEventsCount: upcomingEvents.length,
      estimatedValue: Number((quotedValue || estimatedValue).toFixed(2)),
    },
    upcomingEvents,
    monthlyStats,
  });
});

// Landing Page & Services Management (Works for Tenant Owner/Manager AND Superadmin targeting ?restaurant_id=X)
app.get('/api/admin/landing-page', requireAuth, (req: AuthedRequest, res) => {
  const rid = resolveTargetRestaurantId(req);
  if (!rid) {
    res.status(400).json({ error: 'Target restaurant_id is required.' });
    return;
  }
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(rid) as Record<string, unknown> | undefined;
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }
  const services = db.prepare('SELECT * FROM restaurant_services WHERE restaurant_id = ? ORDER BY sort_order ASC, id ASC').all(rid);
  res.json({
    restaurant: { ...restaurant, is_published: Boolean(restaurant.is_published) },
    services: services.map((s: Record<string, unknown>) => ({ ...s, is_available: Boolean(s.is_available) })),
  });
});

app.patch('/api/admin/landing-page', requireAuth, (req: AuthedRequest, res) => {
  if (req.user!.role === 'staff') {
    res.status(403).json({ error: 'Only owners, managers, or superadmins can edit landing pages.' });
    return;
  }
  const rid = resolveTargetRestaurantId(req);
  if (!rid) {
    res.status(400).json({ error: 'Target restaurant_id is required.' });
    return;
  }

  const b = req.body;
  const existing = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(rid) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  db.prepare(`
    UPDATE restaurants
    SET name = ?, tagline = ?, brand_color = ?, email = ?, phone = ?, address = ?,
        hero_headline = ?, hero_subheadline = ?, hero_image_url = ?,
        about_title = ?, about_description = ?, cta_primary_text = ?, cta_secondary_text = ?,
        is_published = ?
    WHERE id = ?
  `).run(
    b.name ?? existing.name,
    b.tagline ?? existing.tagline,
    b.brand_color ?? existing.brand_color,
    b.email ?? existing.email,
    b.phone ?? existing.phone,
    b.address ?? existing.address,
    b.hero_headline ?? existing.hero_headline,
    b.hero_subheadline ?? existing.hero_subheadline,
    b.hero_image_url ?? existing.hero_image_url,
    b.about_title ?? existing.about_title,
    b.about_description ?? existing.about_description,
    b.cta_primary_text ?? existing.cta_primary_text,
    b.cta_secondary_text ?? existing.cta_secondary_text,
    b.is_published === false ? 0 : 1,
    rid
  );

  logAudit(rid, 'restaurant', rid, 'landing_page_updated', req.user!.name, `Updated landing page configuration for ${b.name ?? existing.name}`);
  res.json({ ok: true });
});

app.get('/api/admin/services', requireAuth, (req: AuthedRequest, res) => {
  const rid = resolveTargetRestaurantId(req);
  if (!rid) {
    res.status(400).json({ error: 'Target restaurant_id is required.' });
    return;
  }
  const services = db.prepare('SELECT * FROM restaurant_services WHERE restaurant_id = ? ORDER BY sort_order ASC, id ASC').all(rid);
  res.json({
    services: services.map((s: Record<string, unknown>) => ({ ...s, is_available: Boolean(s.is_available) })),
  });
});

app.post('/api/admin/services', requireAuth, (req: AuthedRequest, res) => {
  if (req.user!.role === 'staff') {
    res.status(403).json({ error: 'Insufficient permissions.' });
    return;
  }
  const rid = resolveTargetRestaurantId(req);
  if (!rid) {
    res.status(400).json({ error: 'Target restaurant_id is required.' });
    return;
  }
  const b = req.body;
  if (!b.title || !String(b.title).trim()) {
    res.status(400).json({ error: 'Service title is required.' });
    return;
  }
  const r = db.prepare(`
    INSERT INTO restaurant_services (restaurant_id, title, description, price_type, price, is_available, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    rid,
    String(b.title).trim(),
    String(b.description || '').trim(),
    b.price_type || 'flat',
    Number(b.price || 0),
    b.is_available === false ? 0 : 1,
    Number(b.sort_order || 10)
  );
  logAudit(rid, 'service', Number(r.lastInsertRowid), 'service_created', req.user!.name, `Added service: ${b.title}`);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/admin/services/:id', requireAuth, (req: AuthedRequest, res) => {
  if (req.user!.role === 'staff') {
    res.status(403).json({ error: 'Insufficient permissions.' });
    return;
  }
  const rid = resolveTargetRestaurantId(req);
  const id = Number(req.params.id);
  const b = req.body;
  const r = db.prepare(`
    UPDATE restaurant_services
    SET title = ?, description = ?, price_type = ?, price = ?, is_available = ?
    WHERE id = ? AND restaurant_id = ?
  `).run(
    String(b.title).trim(),
    String(b.description || '').trim(),
    b.price_type || 'flat',
    Number(b.price || 0),
    b.is_available === false ? 0 : 1,
    id,
    rid
  );
  if (r.changes === 0) {
    res.status(404).json({ error: 'Service not found' });
    return;
  }
  logAudit(rid, 'service', id, 'service_updated', req.user!.name, `Updated service: ${b.title}`);
  res.json({ ok: true });
});

app.delete('/api/admin/services/:id', requireAuth, (req: AuthedRequest, res) => {
  if (req.user!.role === 'staff') {
    res.status(403).json({ error: 'Insufficient permissions.' });
    return;
  }
  const rid = resolveTargetRestaurantId(req);
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM restaurant_services WHERE id = ? AND restaurant_id = ?').run(id, rid);
  if (r.changes === 0) {
    res.status(404).json({ error: 'Service not found' });
    return;
  }
  logAudit(rid, 'service', id, 'service_deleted', req.user!.name, `Removed service #${id}`);
  res.json({ ok: true });
});

app.get('/api/admin/inquiries', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const status = String(req.query.status || '').trim();
  const search = String(req.query.search || '').trim().toLowerCase();

  let sql = `
    SELECT i.*, c.full_name as customer_name, c.email as customer_email, c.phone as customer_phone, c.company_name, c.preferred_contact
    FROM catering_inquiries i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.restaurant_id = ?
  `;
  const params: Array<string | number> = [rid];

  if (status && status !== 'All') {
    sql += ' AND i.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (lower(i.reference_number) LIKE ? OR lower(c.full_name) LIKE ? OR lower(c.email) LIKE ? OR lower(i.event_venue) LIKE ?)';
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  sql += ' ORDER BY i.created_at DESC, i.id DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({
    inquiries: rows.map((r: Record<string, unknown>) => ({
      ...r,
      additional_services: JSON.parse(String(r.additional_services_json || '[]')),
    })),
  });
});

app.get('/api/admin/inquiries/export/csv', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const rows = db.prepare(`
    SELECT i.reference_number, c.full_name, c.email, c.phone, i.event_type_name, i.event_date,
           i.guest_count, i.event_venue, i.status, i.estimated_total, i.created_at
    FROM catering_inquiries i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.restaurant_id = ?
    ORDER BY i.created_at DESC
  `).all(rid) as Array<Record<string, unknown>>;

  const headers = ['Reference', 'Customer', 'Email', 'Phone', 'Event Type', 'Event Date', 'Guests', 'Venue', 'Status', 'Estimated Total', 'Submitted At'];
  const csvEscape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.join(','),
    ...rows.map((r) => [
      r.reference_number, r.full_name, r.email, r.phone, r.event_type_name,
      r.event_date, r.guest_count, r.event_venue, r.status, r.estimated_total ?? '', r.created_at,
    ].map(csvEscape).join(',')),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="catering-inquiries-${req.user!.restaurant_slug || 'tenant'}.csv"`);
  res.send(lines.join('\n'));
});

app.get('/api/admin/inquiries/:id', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const inquiryId = Number(req.params.id);

  const inquiry = db.prepare(`
    SELECT i.*, c.full_name as customer_name, c.email as customer_email, c.phone as customer_phone, c.company_name, c.preferred_contact
    FROM catering_inquiries i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.id = ? AND i.restaurant_id = ?
  `).get(inquiryId, rid) as Record<string, unknown> | undefined;

  if (!inquiry) {
    res.status(404).json({ error: 'Inquiry not found' });
    return;
  }

  const items = db.prepare('SELECT * FROM inquiry_items WHERE inquiry_id = ?').all(inquiryId);
  const notes = db.prepare('SELECT * FROM inquiry_notes WHERE inquiry_id = ? ORDER BY created_at DESC').all(inquiryId);
  const quotations = db.prepare('SELECT * FROM quotations WHERE inquiry_id = ? ORDER BY version DESC, id DESC').all(inquiryId) as Array<Record<string, unknown>>;
  const quotationsWithItems = quotations.map((q) => ({
    ...q,
    items: db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ?').all(Number(q.id)),
  }));
  const booking = db.prepare('SELECT * FROM bookings WHERE inquiry_id = ?').get(inquiryId);

  res.json({
    inquiry: {
      ...inquiry,
      additional_services: JSON.parse(String(inquiry.additional_services_json || '[]')),
    },
    items,
    notes,
    quotations: quotationsWithItems,
    booking: booking || null,
  });
});

app.patch('/api/admin/inquiries/:id', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const inquiryId = Number(req.params.id);

  const existing = db.prepare('SELECT * FROM catering_inquiries WHERE id = ? AND restaurant_id = ?').get(inquiryId, rid) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Inquiry not found' });
    return;
  }

  const allowedStatuses = [
    'Request Received',
    'Under Review',
    'Quotation Sent',
    'Awaiting Customer Confirmation',
    'Confirmed',
    'Completed',
    'Cancelled',
  ];

  const {
    status,
    assigned_staff_id,
    guest_count,
    event_date,
    start_time,
    event_venue,
    delivery_address,
    special_instructions,
  } = req.body as Record<string, unknown>;

  if (status && !allowedStatuses.includes(String(status))) {
    res.status(422).json({ error: 'Invalid status' });
    return;
  }

  let assignedStaffName = existing.assigned_staff_name as string | null;
  let resolvedStaffId = existing.assigned_staff_id as number | null;
  if (assigned_staff_id !== undefined) {
    if (assigned_staff_id === null || assigned_staff_id === '') {
      resolvedStaffId = null;
      assignedStaffName = null;
    } else {
      const staff = db.prepare('SELECT id, name FROM users WHERE id = ? AND restaurant_id = ?').get(Number(assigned_staff_id), rid) as { id: number; name: string } | undefined;
      if (staff) {
        resolvedStaffId = staff.id;
        assignedStaffName = staff.name;
      }
    }
  }

  db.prepare(`
    UPDATE catering_inquiries
    SET status = ?, assigned_staff_id = ?, assigned_staff_name = ?,
        guest_count = ?, event_date = ?, start_time = ?, event_venue = ?,
        delivery_address = ?, special_instructions = ?, updated_at = datetime('now')
    WHERE id = ? AND restaurant_id = ?
  `).run(
    status ? String(status) : String(existing.status),
    resolvedStaffId,
    assignedStaffName,
    guest_count ? Number(guest_count) : Number(existing.guest_count),
    event_date ? String(event_date) : String(existing.event_date),
    start_time ? String(start_time) : String(existing.start_time),
    event_venue ? String(event_venue) : String(existing.event_venue),
    delivery_address ? String(delivery_address) : String(existing.delivery_address),
    special_instructions !== undefined ? String(special_instructions) : String(existing.special_instructions || ''),
    inquiryId,
    rid
  );

  if (status && status !== existing.status) {
    logAudit(rid, 'inquiry', inquiryId, 'status_changed', req.user!.name, `${existing.reference_number}: ${existing.status} -> ${status}`);
  } else {
    logAudit(rid, 'inquiry', inquiryId, 'inquiry_updated', req.user!.name, `Updated inquiry ${existing.reference_number}`);
  }

  res.json({ ok: true });
});

app.post('/api/admin/inquiries/:id/notes', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const inquiryId = Number(req.params.id);
  const { note } = req.body as { note?: string };
  if (!note || !note.trim()) {
    res.status(400).json({ error: 'Note text is required' });
    return;
  }

  const existing = db.prepare('SELECT id, reference_number FROM catering_inquiries WHERE id = ? AND restaurant_id = ?').get(inquiryId, rid) as { id: number; reference_number: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Inquiry not found' });
    return;
  }

  const r = db.prepare(`
    INSERT INTO inquiry_notes (inquiry_id, user_id, author_name, note, is_internal) VALUES (?, ?, ?, ?, 1)
  `).run(inquiryId, req.user!.id, req.user!.name, note.trim());

  logAudit(rid, 'inquiry', inquiryId, 'note_added', req.user!.name, `Added internal note to ${existing.reference_number}`);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// ============================================================================
// QUOTATION BUILDER & DISPATCH
// ============================================================================

const quotationPayloadSchema = z.object({
  items: z.array(z.object({
    item_type: z.enum(['package', 'food_item', 'service', 'custom']).default('custom'),
    title: z.string().min(1),
    description: z.string().optional().default(''),
    quantity: z.number().int().min(1),
    unit_price: z.number().min(0),
  })).min(1),
  delivery_fee: z.number().min(0).default(0),
  service_charge: z.number().min(0).default(0),
  discount_amount: z.number().min(0).default(0),
  tax_rate: z.number().min(0).max(50).default(8.5),
  payment_terms: z.string().min(3),
  terms_conditions: z.string().min(3),
  valid_until: z.string().min(8),
  send_immediately: z.boolean().optional().default(false),
});

app.post('/api/admin/inquiries/:id/quotations', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const inquiryId = Number(req.params.id);

  const inquiry = db.prepare(`
    SELECT i.*, c.full_name, c.email as customer_email
    FROM catering_inquiries i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.id = ? AND i.restaurant_id = ?
  `).get(inquiryId, rid) as Record<string, unknown> | undefined;

  if (!inquiry) {
    res.status(404).json({ error: 'Inquiry not found' });
    return;
  }

  const parsed = quotationPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Invalid quotation data', details: parsed.error.flatten() });
    return;
  }

  const restaurantRow = db.prepare('SELECT slug, name FROM restaurants WHERE id = ?').get(rid) as { slug: string; name: string };
  const data = parsed.data;
  const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxableBase = Math.max(0, subtotal + data.delivery_fee + data.service_charge - data.discount_amount);
  const taxAmount = Number(((taxableBase * data.tax_rate) / 100).toFixed(2));
  const grandTotal = Number((taxableBase + taxAmount).toFixed(2));

  const versionRow = db.prepare('SELECT COALESCE(MAX(version), 0) as max_v FROM quotations WHERE inquiry_id = ?').get(inquiryId) as { max_v: number };
  const nextVersion = versionRow.max_v + 1;
  const qNum = generateReference('QTN', restaurantRow.slug);
  const status = data.send_immediately ? 'sent' : 'draft';

  const qRes = db.prepare(`
    INSERT INTO quotations (
      restaurant_id, inquiry_id, quotation_number, version, subtotal, delivery_fee,
      service_charge, discount_amount, tax_amount, grand_total, payment_terms,
      terms_conditions, valid_until, status, created_by_name, sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rid, inquiryId, qNum, nextVersion, Number(subtotal.toFixed(2)),
    data.delivery_fee, data.service_charge, data.discount_amount,
    taxAmount, grandTotal, data.payment_terms, data.terms_conditions,
    data.valid_until, status, req.user!.name,
    data.send_immediately ? new Date().toISOString() : null
  );

  const quotationId = Number(qRes.lastInsertRowid);
  const insertQItem = db.prepare(`
    INSERT INTO quotation_items (quotation_id, item_type, title, description, quantity, unit_price, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of data.items) {
    insertQItem.run(
      quotationId,
      item.item_type,
      item.title,
      item.description || '',
      item.quantity,
      item.unit_price,
      Number((item.quantity * item.unit_price).toFixed(2))
    );
  }

  if (data.send_immediately) {
    db.prepare(`UPDATE catering_inquiries SET status = 'Quotation Sent', estimated_total = ?, updated_at = datetime('now') WHERE id = ?`).run(grandTotal, inquiryId);
    dispatchNotification({
      restaurantId: rid,
      recipientType: 'customer',
      recipientContact: String(inquiry.customer_email),
      eventKey: nextVersion > 1 ? 'quotation_updated' : 'quotation_prepared',
      subject: `Catering Quotation ${qNum} from ${restaurantRow.name}`,
      body: `Hello ${inquiry.full_name}, your formal catering quotation ${qNum} totaling $${grandTotal.toFixed(2)} is ready. Track reference ${inquiry.reference_number} online to review and accept.`,
      relatedReference: String(inquiry.reference_number),
    });
    logAudit(rid, 'quotation', quotationId, 'quotation_sent', req.user!.name, `Issued and emailed ${qNum} ($${grandTotal.toFixed(2)})`);
  } else {
    db.prepare(`UPDATE catering_inquiries SET status = 'Under Review', estimated_total = ?, updated_at = datetime('now') WHERE id = ?`).run(grandTotal, inquiryId);
    logAudit(rid, 'quotation', quotationId, 'quotation_drafted', req.user!.name, `Saved draft ${qNum} ($${grandTotal.toFixed(2)})`);
  }

  const created = db.prepare('SELECT * FROM quotations WHERE id = ?').get(quotationId) as Record<string, unknown>;
  const createdItems = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ?').all(quotationId);
  res.status(201).json({ quotation: { ...created, items: createdItems } });
});

app.post('/api/admin/quotations/:id/send', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const quotationId = Number(req.params.id);

  const quotation = db.prepare(`
    SELECT q.*, i.reference_number, c.full_name, c.email as customer_email, r.name as rest_name
    FROM quotations q
    JOIN catering_inquiries i ON i.id = q.inquiry_id
    JOIN customers c ON c.id = i.customer_id
    JOIN restaurants r ON r.id = q.restaurant_id
    WHERE q.id = ? AND q.restaurant_id = ?
  `).get(quotationId, rid) as Record<string, unknown> | undefined;

  if (!quotation) {
    res.status(404).json({ error: 'Quotation not found' });
    return;
  }

  db.prepare(`UPDATE quotations SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).run(quotationId);
  db.prepare(`UPDATE catering_inquiries SET status = 'Quotation Sent', updated_at = datetime('now') WHERE id = ?`).run(Number(quotation.inquiry_id));

  dispatchNotification({
    restaurantId: rid,
    recipientType: 'customer',
    recipientContact: String(quotation.customer_email),
    eventKey: 'quotation_prepared',
    subject: `Catering Quotation ${quotation.quotation_number} from ${quotation.rest_name}`,
    body: `Hello ${quotation.full_name}, your catering quotation ${quotation.quotation_number} ($${Number(quotation.grand_total).toFixed(2)}) has been sent. Please use reference ${quotation.reference_number} to review and accept.`,
    relatedReference: String(quotation.reference_number),
  });

  logAudit(rid, 'quotation', quotationId, 'quotation_sent', req.user!.name, `Sent quotation ${quotation.quotation_number} to ${quotation.customer_email}`);
  res.json({ ok: true });
});

// ============================================================================
// BOOKINGS & VERIFIED PAYMENTS
// ============================================================================

app.post('/api/admin/inquiries/:id/convert-booking', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const inquiryId = Number(req.params.id);
  const { quotation_id, deposit_percentage } = req.body as { quotation_id?: number; deposit_percentage?: number };

  const inquiry = db.prepare(`
    SELECT i.*, c.full_name, c.email as customer_email, c.phone as customer_phone
    FROM catering_inquiries i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.id = ? AND i.restaurant_id = ?
  `).get(inquiryId, rid) as Record<string, unknown> | undefined;

  if (!inquiry) {
    res.status(404).json({ error: 'Inquiry not found' });
    return;
  }

  const existingBooking = db.prepare('SELECT * FROM bookings WHERE inquiry_id = ?').get(inquiryId);
  if (existingBooking) {
    res.status(409).json({ error: 'A booking already exists for this inquiry.' });
    return;
  }

  const quote = quotation_id
    ? db.prepare('SELECT * FROM quotations WHERE id = ? AND inquiry_id = ?').get(quotation_id, inquiryId) as Record<string, unknown> | undefined
    : db.prepare('SELECT * FROM quotations WHERE inquiry_id = ? ORDER BY version DESC LIMIT 1').get(inquiryId) as Record<string, unknown> | undefined;

  if (!quote) {
    res.status(400).json({ error: 'Please create a quotation before converting to a confirmed booking.' });
    return;
  }

  if (quote.status !== 'accepted' && req.body.staff_verified_acceptance !== true) {
    res.status(400).json({ error: 'Customer must explicitly accept the quotation (or staff must confirm written acceptance) before booking.' });
    return;
  }

  if (quote.status !== 'accepted') {
    db.prepare(`UPDATE quotations SET status = 'accepted', accepted_at = datetime('now') WHERE id = ?`).run(Number(quote.id));
  }

  const restaurantRow = db.prepare('SELECT slug, name FROM restaurants WHERE id = ?').get(rid) as { slug: string; name: string };
  const totalAmount = Number(quote.grand_total);
  const depositPct = deposit_percentage ?? 40;
  const depositAmount = Number(((totalAmount * depositPct) / 100).toFixed(2));
  const bookingRef = generateReference('BK', restaurantRow.slug);

  const qItems = db.prepare('SELECT title, quantity FROM quotation_items WHERE quotation_id = ?').all(Number(quote.id)) as Array<{ title: string; quantity: number }>;
  const menuSummary = qItems.map((it) => `${it.title} (x${it.quantity})`).join(', ');

  const bkRes = db.prepare(`
    INSERT INTO bookings (
      restaurant_id, inquiry_id, quotation_id, booking_reference, customer_name,
      customer_email, customer_phone, event_date, event_venue, guest_count,
      confirmed_menu_summary, total_amount, deposit_amount, amount_paid, balance_due,
      payment_status, booking_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'Unpaid', 'Confirmed')
  `).run(
    rid, inquiryId, Number(quote.id), bookingRef,
    String(inquiry.full_name), String(inquiry.customer_email), String(inquiry.customer_phone),
    String(inquiry.event_date), String(inquiry.event_venue), Number(inquiry.guest_count),
    menuSummary, totalAmount, depositAmount, totalAmount
  );

  db.prepare(`UPDATE catering_inquiries SET status = 'Confirmed', updated_at = datetime('now') WHERE id = ?`).run(inquiryId);

  dispatchNotification({
    restaurantId: rid,
    recipientType: 'customer',
    recipientContact: String(inquiry.customer_email),
    eventKey: 'booking_confirmed',
    subject: `Booking Confirmed: ${bookingRef} — ${restaurantRow.name}`,
    body: `Your catering booking ${bookingRef} for ${inquiry.event_date} is confirmed. Deposit required: $${depositAmount.toFixed(2)}.`,
    relatedReference: bookingRef,
  });

  logAudit(rid, 'booking', Number(bkRes.lastInsertRowid), 'booking_created', req.user!.name, `Converted ${inquiry.reference_number} into booking ${bookingRef} (Unpaid pending payment verification)`);
  res.status(201).json({ booking: db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(bkRes.lastInsertRowid)) });
});

app.get('/api/admin/bookings', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const rows = db.prepare(`
    SELECT b.*, i.reference_number as inquiry_reference
    FROM bookings b
    JOIN catering_inquiries i ON i.id = b.inquiry_id
    WHERE b.restaurant_id = ?
    ORDER BY b.event_date ASC, b.id DESC
  `).all(rid) as Array<Record<string, unknown>>;

  const bookings = rows.map((b) => ({
    ...b,
    payments: db.prepare('SELECT * FROM booking_payments WHERE booking_id = ? ORDER BY paid_at DESC').all(Number(b.id)),
  }));
  res.json({ bookings });
});

app.patch('/api/admin/bookings/:id', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const bookingId = Number(req.params.id);
  const { booking_status } = req.body as { booking_status?: string };

  const existing = db.prepare('SELECT * FROM bookings WHERE id = ? AND restaurant_id = ?').get(bookingId, rid) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  if (booking_status) {
    db.prepare('UPDATE bookings SET booking_status = ? WHERE id = ?').run(booking_status, bookingId);
    if (booking_status === 'Completed' || booking_status === 'Cancelled') {
      db.prepare(`UPDATE catering_inquiries SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(booking_status, Number(existing.inquiry_id));
    }
    logAudit(rid, 'booking', bookingId, 'booking_status_updated', req.user!.name, `${existing.booking_reference} -> ${booking_status}`);
  }
  res.json({ ok: true });
});

app.post('/api/admin/bookings/:id/payments', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const bookingId = Number(req.params.id);
  const { amount, payment_method, reference_code, notes } = req.body as {
    amount?: number;
    payment_method?: string;
    reference_code?: string;
    notes?: string;
  };

  if (!amount || amount <= 0 || !payment_method || !reference_code) {
    res.status(400).json({ error: 'Verified payment amount, method, and transaction reference are required.' });
    return;
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND restaurant_id = ?').get(bookingId, rid) as Record<string, unknown> | undefined;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  db.prepare(`
    INSERT INTO booking_payments (booking_id, amount, payment_method, reference_code, recorded_by_name, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(bookingId, amount, payment_method, reference_code, req.user!.name, notes || '');

  const newPaid = Number((Number(booking.amount_paid) + amount).toFixed(2));
  const totalAmount = Number(booking.total_amount);
  const depositAmount = Number(booking.deposit_amount);
  const balanceDue = Math.max(0, Number((totalAmount - newPaid).toFixed(2)));

  let paymentStatus = 'Unpaid';
  if (balanceDue <= 0.01) {
    paymentStatus = 'Fully Paid';
  } else if (newPaid >= depositAmount && newPaid < totalAmount) {
    paymentStatus = newPaid > depositAmount ? 'Partially Paid' : 'Deposit Paid';
  } else if (newPaid > 0) {
    paymentStatus = 'Partially Paid';
  }

  db.prepare(`
    UPDATE bookings SET amount_paid = ?, balance_due = ?, payment_status = ? WHERE id = ?
  `).run(newPaid, balanceDue, paymentStatus, bookingId);

  logAudit(rid, 'payment', bookingId, 'payment_verified', req.user!.name, `Verified $${amount.toFixed(2)} via ${payment_method} (${reference_code}). Status: ${paymentStatus}`);
  res.status(201).json({ ok: true, amount_paid: newPaid, balance_due: balanceDue, payment_status: paymentStatus });
});

// ============================================================================
// MENU, CATEGORIES & PACKAGES CRUD (TENANT-SCOPED)
// ============================================================================

app.get('/api/admin/catalog', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const packages = db.prepare('SELECT * FROM catering_packages WHERE restaurant_id = ? ORDER BY is_seasonal DESC, id ASC').all(rid);
  const categories = db.prepare('SELECT * FROM food_categories WHERE restaurant_id = ? ORDER BY sort_order ASC').all(rid);
  const foodItems = db.prepare('SELECT * FROM food_items WHERE restaurant_id = ? ORDER BY category_id ASC, id ASC').all(rid);

  res.json({
    packages: packages.map((p: Record<string, unknown>) => ({
      ...p,
      inclusions: JSON.parse(String(p.inclusions_json || '[]')),
      addons: JSON.parse(String(p.addons_json || '[]')),
      is_available: Boolean(p.is_available),
      is_seasonal: Boolean(p.is_seasonal),
    })),
    categories,
    foodItems: foodItems.map((f: Record<string, unknown>) => ({
      ...f,
      addons: JSON.parse(String(f.addons_json || '[]')),
      is_available: Boolean(f.is_available),
    })),
  });
});

app.post('/api/admin/packages', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const b = req.body;
  const r = db.prepare(`
    INSERT INTO catering_packages (
      restaurant_id, name, description, pricing_type, price, min_guests, max_guests,
      inclusions_json, addons_json, image_url, is_available, is_seasonal, promo_label
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rid, b.name, b.description, b.pricing_type || 'per_person', Number(b.price),
    Number(b.min_guests || 20), b.max_guests ? Number(b.max_guests) : null,
    JSON.stringify(b.inclusions || []), JSON.stringify(b.addons || []),
    b.image_url || '/src/assets/images/hero_catering_banquet_1795136239169.jpg',
    b.is_available === false ? 0 : 1, b.is_seasonal ? 1 : 0, b.promo_label || null
  );
  logAudit(rid, 'package', Number(r.lastInsertRowid), 'package_created', req.user!.name, `Created package ${b.name}`);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/admin/packages/:id', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const id = Number(req.params.id);
  const b = req.body;
  const r = db.prepare(`
    UPDATE catering_packages
    SET name = ?, description = ?, pricing_type = ?, price = ?, min_guests = ?, max_guests = ?,
        inclusions_json = ?, addons_json = ?, image_url = ?, is_available = ?, is_seasonal = ?, promo_label = ?
    WHERE id = ? AND restaurant_id = ?
  `).run(
    b.name, b.description, b.pricing_type || 'per_person', Number(b.price),
    Number(b.min_guests || 20), b.max_guests ? Number(b.max_guests) : null,
    JSON.stringify(b.inclusions || []), JSON.stringify(b.addons || []),
    b.image_url || '/src/assets/images/hero_catering_banquet_1795136239169.jpg',
    b.is_available === false ? 0 : 1, b.is_seasonal ? 1 : 0, b.promo_label || null,
    id, rid
  );
  if (r.changes === 0) {
    res.status(404).json({ error: 'Package not found' });
    return;
  }
  logAudit(rid, 'package', id, 'package_updated', req.user!.name, `Updated package ${b.name}`);
  res.json({ ok: true });
});

app.delete('/api/admin/packages/:id', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM catering_packages WHERE id = ? AND restaurant_id = ?').run(id, rid);
  if (r.changes === 0) {
    res.status(404).json({ error: 'Package not found' });
    return;
  }
  logAudit(rid, 'package', id, 'package_deleted', req.user!.name, `Deleted package #${id}`);
  res.json({ ok: true });
});

app.post('/api/admin/categories', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Category name is required' });
    return;
  }
  const slug = slugify(name.trim());
  const r = db.prepare('INSERT INTO food_categories (restaurant_id, name, slug, sort_order) VALUES (?, ?, ?, 10)').run(rid, name.trim(), slug);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.post('/api/admin/food-items', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const b = req.body;
  const r = db.prepare(`
    INSERT INTO food_items (
      restaurant_id, category_id, name, description, unit_price, price_unit,
      min_order_qty, dietary_tags, allergens, image_url, is_available, addons_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rid, Number(b.category_id), b.name, b.description,
    b.unit_price !== null && b.unit_price !== '' && b.unit_price !== undefined ? Number(b.unit_price) : null,
    b.price_unit || 'per tray', Number(b.min_order_qty || 1),
    b.dietary_tags || '', b.allergens || '',
    b.image_url || '/src/assets/images/dish_herb_roast_beef_1795136242853.jpg',
    b.is_available === false ? 0 : 1, JSON.stringify(b.addons || [])
  );
  logAudit(rid, 'food_item', Number(r.lastInsertRowid), 'food_item_created', req.user!.name, `Added menu item ${b.name}`);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/admin/food-items/:id', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const id = Number(req.params.id);
  const b = req.body;
  const r = db.prepare(`
    UPDATE food_items
    SET category_id = ?, name = ?, description = ?, unit_price = ?, price_unit = ?,
        min_order_qty = ?, dietary_tags = ?, allergens = ?, image_url = ?, is_available = ?, addons_json = ?
    WHERE id = ? AND restaurant_id = ?
  `).run(
    Number(b.category_id), b.name, b.description,
    b.unit_price !== null && b.unit_price !== '' && b.unit_price !== undefined ? Number(b.unit_price) : null,
    b.price_unit || 'per tray', Number(b.min_order_qty || 1),
    b.dietary_tags || '', b.allergens || '',
    b.image_url || '/src/assets/images/dish_herb_roast_beef_1795136242853.jpg',
    b.is_available === false ? 0 : 1, JSON.stringify(b.addons || []),
    id, rid
  );
  if (r.changes === 0) {
    res.status(404).json({ error: 'Food item not found' });
    return;
  }
  logAudit(rid, 'food_item', id, 'food_item_updated', req.user!.name, `Updated menu item ${b.name}`);
  res.json({ ok: true });
});

app.delete('/api/admin/food-items/:id', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM food_items WHERE id = ? AND restaurant_id = ?').run(id, rid);
  if (r.changes === 0) {
    res.status(404).json({ error: 'Food item not found' });
    return;
  }
  logAudit(rid, 'food_item', id, 'food_item_deleted', req.user!.name, `Deleted menu item #${id}`);
  res.json({ ok: true });
});

// ============================================================================
// NOTIFICATIONS, AUDIT TRAIL & SETTINGS
// ============================================================================

app.get('/api/admin/notifications', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const notifications = db.prepare('SELECT * FROM notifications WHERE restaurant_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').all(rid);
  const auditLogs = db.prepare('SELECT * FROM audit_logs WHERE restaurant_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').all(rid);
  res.json({ notifications, auditLogs });
});

app.post('/api/admin/notifications/reminder', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  const { booking_id, channel } = req.body as { booking_id?: number; channel?: 'email' | 'sms' | 'messenger' };
  const bk = db.prepare('SELECT * FROM bookings WHERE id = ? AND restaurant_id = ?').get(Number(booking_id), rid) as Record<string, unknown> | undefined;
  if (!bk) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }
  dispatchNotification({
    restaurantId: rid,
    recipientType: 'customer',
    recipientContact: channel === 'sms' ? String(bk.customer_phone) : String(bk.customer_email),
    channel: channel || 'email',
    eventKey: 'event_reminder',
    subject: `Upcoming Event Reminder: ${bk.booking_reference} on ${bk.event_date}`,
    body: `Hello ${bk.customer_name}, looking forward to catering your event at ${bk.event_venue} on ${bk.event_date} for ${bk.guest_count} guests.`,
    relatedReference: String(bk.booking_reference),
  });
  res.status(201).json({ ok: true });
});

app.patch('/api/admin/restaurant', requireAuth, requireTenantUser, (req: AuthedRequest, res) => {
  const rid = req.user!.restaurant_id!;
  if (req.user!.role === 'staff') {
    res.status(403).json({ error: 'Only owners or managers can update restaurant settings.' });
    return;
  }
  const { name, tagline, brand_color, email, phone, address, tax_rate, service_charge_rate } = req.body;
  db.prepare(`
    UPDATE restaurants
    SET name = ?, tagline = ?, brand_color = ?, email = ?, phone = ?, address = ?, tax_rate = ?, service_charge_rate = ?
    WHERE id = ?
  `).run(name, tagline, brand_color, email, phone, address, Number(tax_rate), Number(service_charge_rate), rid);
  logAudit(rid, 'restaurant', rid, 'settings_updated', req.user!.name, 'Updated restaurant profile & tax/service rates');
  res.json({ ok: true });
});

// ============================================================================
// SUPERADMIN PLATFORM GOVERNANCE ROUTES
// ============================================================================

app.get('/api/superadmin/overview', requireAuth, requireSuperAdmin, (_req, res) => {
  const totalRestaurants = (db.prepare('SELECT COUNT(*) as c FROM restaurants').get() as { c: number }).c;
  const publishedRestaurants = (db.prepare('SELECT COUNT(*) as c FROM restaurants WHERE is_published = 1').get() as { c: number }).c;
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const activeUsers = (db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get() as { c: number }).c;
  const totalInquiries = (db.prepare('SELECT COUNT(*) as c FROM catering_inquiries').get() as { c: number }).c;
  const totalBookings = (db.prepare('SELECT COUNT(*) as c FROM bookings').get() as { c: number }).c;
  const financial = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total_contract,
           COALESCE(SUM(amount_paid), 0) as total_paid,
           COALESCE(SUM(balance_due), 0) as total_balance
    FROM bookings
  `).get() as { total_contract: number; total_paid: number; total_balance: number };

  res.json({
    metrics: {
      totalRestaurants,
      publishedRestaurants,
      totalUsers,
      activeUsers,
      totalInquiries,
      totalBookings,
      totalContractValue: Number(financial.total_contract.toFixed(2)),
      totalVerifiedPaid: Number(financial.total_paid.toFixed(2)),
      totalOutstandingBalance: Number(financial.total_balance.toFixed(2)),
    },
  });
});

app.get('/api/superadmin/restaurants', requireAuth, requireSuperAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM catering_inquiries i WHERE i.restaurant_id = r.id) as inquiry_count,
      (SELECT COUNT(*) FROM bookings b WHERE b.restaurant_id = r.id) as booking_count,
      (SELECT COUNT(*) FROM restaurant_services s WHERE s.restaurant_id = r.id) as service_count,
      (SELECT u.name FROM users u WHERE u.restaurant_id = r.id AND u.role = 'owner' LIMIT 1) as owner_name,
      (SELECT u.email FROM users u WHERE u.restaurant_id = r.id AND u.role = 'owner' LIMIT 1) as owner_email
    FROM restaurants r
    ORDER BY r.id ASC
  `).all() as Array<Record<string, unknown>>;

  res.json({
    restaurants: rows.map((r) => ({ ...r, is_published: Boolean(r.is_published) })),
  });
});

app.patch('/api/superadmin/restaurants/:id', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }
  const b = req.body;
  db.prepare(`
    UPDATE restaurants
    SET name = ?, tagline = ?, brand_color = ?, hero_headline = ?, hero_subheadline = ?,
        hero_image_url = ?, about_title = ?, about_description = ?, is_published = ?
    WHERE id = ?
  `).run(
    b.name ?? existing.name,
    b.tagline ?? existing.tagline,
    b.brand_color ?? existing.brand_color,
    b.hero_headline ?? existing.hero_headline,
    b.hero_subheadline ?? existing.hero_subheadline,
    b.hero_image_url ?? existing.hero_image_url,
    b.about_title ?? existing.about_title,
    b.about_description ?? existing.about_description,
    b.is_published === undefined ? Number(existing.is_published) : b.is_published ? 1 : 0,
    id
  );
  logAudit(id, 'restaurant', id, 'superadmin_updated_restaurant', req.user!.name, `Superadmin updated landing page for ${b.name ?? existing.name}`);
  res.json({ ok: true });
});

app.get('/api/superadmin/users', requireAuth, requireSuperAdmin, (req, res) => {
  const role = String(req.query.role || '').trim();
  const restaurantId = Number(req.query.restaurant_id || 0);
  const search = String(req.query.search || '').trim().toLowerCase();

  let sql = `
    SELECT u.id, u.restaurant_id, u.name, u.email, u.role, u.is_active, u.created_at,
           r.name as restaurant_name, r.slug as restaurant_slug
    FROM users u
    LEFT JOIN restaurants r ON r.id = u.restaurant_id
    WHERE 1 = 1
  `;
  const params: Array<string | number> = [];
  if (role && role !== 'all') {
    sql += ' AND u.role = ?';
    params.push(role);
  }
  if (restaurantId > 0) {
    sql += ' AND u.restaurant_id = ?';
    params.push(restaurantId);
  }
  if (search) {
    sql += ' AND (lower(u.name) LIKE ? OR lower(u.email) LIKE ? OR lower(COALESCE(r.name, \'\')) LIKE ?)';
    const p = `%${search}%`;
    params.push(p, p, p);
  }
  sql += ' ORDER BY u.id DESC';

  const users = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  res.json({
    users: users.map((u) => ({ ...u, is_active: Boolean(u.is_active) })),
  });
});

app.post('/api/superadmin/users', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
  const { name, email, password, role, restaurant_id } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: 'superadmin' | 'owner' | 'manager' | 'staff';
    restaurant_id?: number | null;
  };

  if (!name?.trim() || !email?.trim() || !password || password.length < 8 || !role) {
    res.status(400).json({ error: 'Name, valid email, password (min 8 chars), and role are required.' });
    return;
  }
  if (role !== 'superadmin' && !restaurant_id) {
    res.status(400).json({ error: 'Owners, managers, and staff must be assigned to a restaurant.' });
    return;
  }
  if (db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email.trim())) {
    res.status(409).json({ error: 'Email already exists.' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare(`
    INSERT INTO users (restaurant_id, name, email, password_hash, role, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(role === 'superadmin' ? null : Number(restaurant_id), name.trim(), email.trim(), hash, role);

  if (restaurant_id) {
    logAudit(Number(restaurant_id), 'user', Number(r.lastInsertRowid), 'user_created', req.user!.name, `Superadmin created ${role} account for ${email.trim()}`);
  }
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.patch('/api/superadmin/users/:id', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
  const userId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { name, role, restaurant_id, is_active, new_password } = req.body as {
    name?: string;
    role?: 'superadmin' | 'owner' | 'manager' | 'staff';
    restaurant_id?: number | null;
    is_active?: boolean;
    new_password?: string;
  };

  if (userId === req.user!.id && is_active === false) {
    res.status(400).json({ error: 'You cannot suspend your own active superadmin account.' });
    return;
  }

  const nextRole = role ?? String(existing.role);
  const nextRestaurantId =
    nextRole === 'superadmin'
      ? null
      : restaurant_id !== undefined
      ? restaurant_id
      : existing.restaurant_id;

  const nextHash =
    new_password && new_password.length >= 8
      ? bcrypt.hashSync(new_password, 10)
      : String(existing.password_hash);

  db.prepare(`
    UPDATE users
    SET name = ?, role = ?, restaurant_id = ?, is_active = ?, password_hash = ?
    WHERE id = ?
  `).run(
    name !== undefined ? name.trim() : String(existing.name),
    nextRole,
    nextRestaurantId ? Number(nextRestaurantId) : null,
    is_active === undefined ? Number(existing.is_active) : is_active ? 1 : 0,
    nextHash,
    userId
  );

  if (is_active === false) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
  res.json({ ok: true });
});

app.delete('/api/superadmin/users/:id', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
  const userId = Number(req.params.id);
  if (userId === req.user!.id) {
    res.status(400).json({ error: 'You cannot delete your own active superadmin account.' });
    return;
  }
  const r = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  if (r.changes === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ ok: true });
});

app.get('/api/superadmin/bookings', requireAuth, requireSuperAdmin, (req, res) => {
  const restaurantId = Number(req.query.restaurant_id || 0);
  const bookingStatus = String(req.query.booking_status || '').trim();
  const paymentStatus = String(req.query.payment_status || '').trim();
  const search = String(req.query.search || '').trim().toLowerCase();

  let sql = `
    SELECT b.*, r.name as restaurant_name, r.slug as restaurant_slug, i.reference_number as inquiry_reference
    FROM bookings b
    JOIN restaurants r ON r.id = b.restaurant_id
    JOIN catering_inquiries i ON i.id = b.inquiry_id
    WHERE 1 = 1
  `;
  const params: Array<string | number> = [];

  if (restaurantId > 0) {
    sql += ' AND b.restaurant_id = ?';
    params.push(restaurantId);
  }
  if (bookingStatus && bookingStatus !== 'All') {
    sql += ' AND b.booking_status = ?';
    params.push(bookingStatus);
  }
  if (paymentStatus && paymentStatus !== 'All') {
    sql += ' AND b.payment_status = ?';
    params.push(paymentStatus);
  }
  if (search) {
    sql += ' AND (lower(b.booking_reference) LIKE ? OR lower(b.customer_name) LIKE ? OR lower(b.event_venue) LIKE ? OR lower(r.name) LIKE ?)';
    const p = `%${search}%`;
    params.push(p, p, p, p);
  }
  sql += ' ORDER BY b.event_date ASC, b.id DESC';

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const bookings = rows.map((b) => ({
    ...b,
    payments: db.prepare('SELECT * FROM booking_payments WHERE booking_id = ? ORDER BY paid_at DESC').all(Number(b.id)),
  }));
  res.json({ bookings });
});

app.patch('/api/superadmin/bookings/:id', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
  const bookingId = Number(req.params.id);
  const { booking_status } = req.body as { booking_status?: string };
  const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }
  if (booking_status) {
    db.prepare('UPDATE bookings SET booking_status = ? WHERE id = ?').run(booking_status, bookingId);
    if (booking_status === 'Completed' || booking_status === 'Cancelled') {
      db.prepare(`UPDATE catering_inquiries SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(booking_status, Number(existing.inquiry_id));
    }
    logAudit(Number(existing.restaurant_id), 'booking', bookingId, 'superadmin_booking_updated', req.user!.name, `Superadmin updated ${existing.booking_reference} -> ${booking_status}`);
  }
  res.json({ ok: true });
});

// ============================================================================
// VITE / STATIC SERVING
// ============================================================================

async function startServer(): Promise<void> {
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist'));

  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Hearth & Table Catering Server listening on http://localhost:${port}`);
  });
}

startServer();
