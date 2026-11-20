import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'catering.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function ensureColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrateUsersAndSessionsForSuperadmin(): void {
  const usersMeta = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`)
    .get() as { sql: string } | undefined;

  if (usersMeta && !usersMeta.sql.includes("'superadmin'")) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('superadmin', 'owner', 'manager', 'staff')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_new (id, restaurant_id, name, email, password_hash, role, is_active, created_at)
      SELECT id, restaurant_id, name, email, password_hash, role, 1, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;

      CREATE TABLE sessions_new (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO sessions_new (token, user_id, restaurant_id, expires_at, created_at)
      SELECT token, user_id, restaurant_id, expires_at, created_at FROM sessions;
      DROP TABLE sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
    `);
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      brand_color TEXT NOT NULL DEFAULT '#1B4332',
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      logo_text TEXT NOT NULL,
      tax_rate REAL NOT NULL DEFAULT 8.5,
      service_charge_rate REAL NOT NULL DEFAULT 15.0,
      hero_headline TEXT NOT NULL DEFAULT 'Make Every Occasion Delicious',
      hero_subheadline TEXT NOT NULL DEFAULT 'From intimate family gatherings to grand celebrations, let us take care of the food.',
      hero_image_url TEXT NOT NULL DEFAULT '/src/assets/images/hero_catering_banquet_1795136239169.jpg',
      about_title TEXT NOT NULL DEFAULT 'Crafted From Scratch For Your Table',
      about_description TEXT NOT NULL DEFAULT 'Our culinary team prepares seasonal menus from locally sourced ingredients, delivered and styled with care for gatherings of every scale.',
      cta_primary_text TEXT NOT NULL DEFAULT 'Request a Catering Quote',
      cta_secondary_text TEXT NOT NULL DEFAULT 'Explore Catering Packages',
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('superadmin', 'owner', 'manager', 'staff')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS restaurant_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price_type TEXT NOT NULL DEFAULT 'flat' CHECK (price_type IN ('flat', 'per_person', 'included', 'custom')),
      price REAL NOT NULL DEFAULT 0,
      is_available INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      company_name TEXT,
      preferred_contact TEXT NOT NULL DEFAULT 'Email',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS event_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS catering_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      pricing_type TEXT NOT NULL CHECK (pricing_type IN ('per_person', 'flat_package')),
      price REAL NOT NULL,
      min_guests INTEGER NOT NULL DEFAULT 20,
      max_guests INTEGER,
      inclusions_json TEXT NOT NULL DEFAULT '[]',
      addons_json TEXT NOT NULL DEFAULT '[]',
      image_url TEXT NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      is_seasonal INTEGER NOT NULL DEFAULT 0,
      promo_label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS food_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS food_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES food_categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      unit_price REAL,
      price_unit TEXT NOT NULL DEFAULT 'per tray',
      min_order_qty INTEGER NOT NULL DEFAULT 1,
      dietary_tags TEXT NOT NULL DEFAULT '',
      allergens TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      addons_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS package_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER NOT NULL REFERENCES catering_packages(id) ON DELETE CASCADE,
      food_item_id INTEGER NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
      default_servings_per_guest REAL NOT NULL DEFAULT 1.0
    );

    CREATE TABLE IF NOT EXISTS catering_inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      reference_number TEXT NOT NULL UNIQUE,
      event_type_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL,
      event_type_name TEXT NOT NULL,
      event_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      guest_count INTEGER NOT NULL,
      event_venue TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      venue_setting TEXT NOT NULL DEFAULT 'unspecified',
      selected_package_id INTEGER REFERENCES catering_packages(id) ON DELETE SET NULL,
      selected_package_name TEXT,
      dietary_requirements TEXT,
      food_allergies TEXT,
      special_instructions TEXT,
      additional_services_json TEXT NOT NULL DEFAULT '[]',
      estimated_total REAL,
      status TEXT NOT NULL DEFAULT 'Request Received',
      assigned_staff_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_staff_name TEXT,
      privacy_consent INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inquiry_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inquiry_id INTEGER NOT NULL REFERENCES catering_inquiries(id) ON DELETE CASCADE,
      food_item_id INTEGER REFERENCES food_items(id) ON DELETE SET NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL,
      line_total REAL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS inquiry_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inquiry_id INTEGER NOT NULL REFERENCES catering_inquiries(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      note TEXT NOT NULL,
      is_internal INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      inquiry_id INTEGER NOT NULL REFERENCES catering_inquiries(id) ON DELETE CASCADE,
      quotation_number TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL DEFAULT 1,
      subtotal REAL NOT NULL DEFAULT 0,
      delivery_fee REAL NOT NULL DEFAULT 0,
      service_charge REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      grand_total REAL NOT NULL DEFAULT 0,
      payment_terms TEXT NOT NULL,
      terms_conditions TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by_name TEXT NOT NULL,
      sent_at TEXT,
      accepted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL DEFAULT 'custom',
      title TEXT NOT NULL,
      description TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      inquiry_id INTEGER NOT NULL REFERENCES catering_inquiries(id) ON DELETE CASCADE,
      quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
      booking_reference TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_venue TEXT NOT NULL,
      guest_count INTEGER NOT NULL,
      confirmed_menu_summary TEXT NOT NULL,
      total_amount REAL NOT NULL,
      deposit_amount REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'Unpaid',
      booking_status TEXT NOT NULL DEFAULT 'Confirmed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS booking_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      reference_code TEXT NOT NULL,
      recorded_by_name TEXT NOT NULL,
      notes TEXT,
      paid_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      recipient_type TEXT NOT NULL CHECK (recipient_type IN ('customer', 'staff')),
      recipient_contact TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      event_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      related_reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safe incremental schema upgrades for existing databases
  ensureColumn('restaurants', 'hero_headline', `TEXT NOT NULL DEFAULT 'Make Every Occasion Delicious'`);
  ensureColumn('restaurants', 'hero_subheadline', `TEXT NOT NULL DEFAULT 'From intimate family gatherings to grand celebrations, let us take care of the food.'`);
  ensureColumn('restaurants', 'hero_image_url', `TEXT NOT NULL DEFAULT '/src/assets/images/hero_catering_banquet_1795136239169.jpg'`);
  ensureColumn('restaurants', 'about_title', `TEXT NOT NULL DEFAULT 'Crafted From Scratch For Your Table'`);
  ensureColumn('restaurants', 'about_description', `TEXT NOT NULL DEFAULT 'Our culinary team prepares seasonal menus from locally sourced ingredients, delivered and styled with care for gatherings of every scale.'`);
  ensureColumn('restaurants', 'cta_primary_text', `TEXT NOT NULL DEFAULT 'Request a Catering Quote'`);
  ensureColumn('restaurants', 'cta_secondary_text', `TEXT NOT NULL DEFAULT 'Explore Catering Packages'`);
  ensureColumn('restaurants', 'is_published', `INTEGER NOT NULL DEFAULT 1`);

  migrateUsersAndSessionsForSuperadmin();

  const existing = db.prepare('SELECT COUNT(*) as count FROM restaurants').get() as { count: number };
  if (existing.count === 0) {
    seedInitialData();
  } else {
    ensureSuperadminAndServices();
  }
}

function ensureSuperadminAndServices(): void {
  const passwordHash = bcrypt.hashSync('SuperAdmin2026!', 10);
  const superExists = db.prepare(`SELECT id FROM users WHERE role = 'superadmin'`).get();
  if (!superExists) {
    db.prepare(`
      INSERT INTO users (restaurant_id, name, email, password_hash, role, is_active)
      VALUES (NULL, 'Platform Superadmin', 'superadmin@hearthandtable.com', ?, 'superadmin', 1)
    `).run(passwordHash);
  }

  const svcCount = (db.prepare('SELECT COUNT(*) as c FROM restaurant_services').get() as { c: number }).c;
  if (svcCount === 0) {
    const rests = db.prepare('SELECT id FROM restaurants').all() as Array<{ id: number }>;
    for (const r of rests) {
      seedDefaultServicesForRestaurant(r.id);
    }
  }
}

export function seedDefaultServicesForRestaurant(restaurantId: number): void {
  const insertService = db.prepare(`
    INSERT INTO restaurant_services (restaurant_id, title, description, price_type, price, is_available, sort_order)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  insertService.run(restaurantId, 'Food setup', 'Chafing dish placement, serving risers, labeled menu cards, and table styling.', 'flat', 150, 1);
  insertService.run(restaurantId, 'Waitstaff', 'Uniformed banquet captains and servers for plated service, replenishment, and teardown.', 'per_person', 18, 2);
  insertService.run(restaurantId, 'Tables and chairs', 'Banquet dining tables, folding chairs, and pressed linen tablecloths delivered on-site.', 'custom', 0, 3);
  insertService.run(restaurantId, 'Buffet arrangement', 'Full hot and ambient buffet line setup with stainless chafers and serving utensils.', 'flat', 185, 4);
  insertService.run(restaurantId, 'Food delivery', 'Insulated temperature-controlled courier delivery directly to your venue.', 'flat', 95, 5);
}

export function seedDefaultCatalogForNewRestaurant(restaurantId: number, restaurantName: string): void {
  const insertEventType = db.prepare(`
    INSERT INTO event_types (restaurant_id, name, slug, description, image_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const defaultEvents = [
    ['Birthday Parties', 'birthday-parties', `Celebration platters, grazing tables, and desserts crafted by ${restaurantName}.`, '/src/assets/images/event_birthday_table_1795136243424.jpg', 1],
    ['Weddings and Receptions', 'weddings-receptions', 'Multi-course plated banquets and coordinated reception service.', '/src/assets/images/event_wedding_banquet_1795136243199.jpg', 2],
    ['Corporate Events', 'corporate-events', 'Executive luncheons, boardroom buffets, and conference catering.', '/src/assets/images/event_corporate_buffet_1795136243249.jpg', 3],
    ['Family Gatherings', 'family-gatherings', 'Generous family-style roasts, salads, and artisan breads.', '/src/assets/images/event_family_gathering_1795136243668.jpg', 4],
    ['School and Community Events', 'school-community', 'High-volume warm buffet trays tailored for community halls.', '/src/assets/images/event_community_feast_1795136243259.jpg', 5],
    ['Packed Meals and Bulk Orders', 'packed-meals-bulk', 'Individually sealed meal boxes with clear allergen labeling.', '/src/assets/images/event_packed_meals_1795136242777.jpg', 6],
  ] as const;

  for (const ev of defaultEvents) {
    insertEventType.run(restaurantId, ev[0], ev[1], ev[2], ev[3], ev[4]);
  }

  const cat1 = Number(
    db.prepare(`INSERT INTO food_categories (restaurant_id, name, slug, sort_order) VALUES (?, 'Signature Mains', 'signature-mains', 1)`).run(restaurantId).lastInsertRowid
  );
  const cat2 = Number(
    db.prepare(`INSERT INTO food_categories (restaurant_id, name, slug, sort_order) VALUES (?, 'Packed Meal Boxes', 'packed-meal-boxes', 2)`).run(restaurantId).lastInsertRowid
  );

  db.prepare(`
    INSERT INTO catering_packages (
      restaurant_id, name, description, pricing_type, price, min_guests, max_guests,
      inclusions_json, addons_json, image_url, is_available, is_seasonal, promo_label
    ) VALUES (?, ?, ?, 'per_person', 54.00, 20, 250, ?, ?, ?, 1, 0, null)
  `).run(
    restaurantId,
    `${restaurantName} Signature Buffet`,
    'Balanced two-entrée buffet featuring seasonal salads, artisan bread, and dessert bites.',
    JSON.stringify(['Seasonal Greens Salad', 'Choice of Two Signature Entrées', 'Herb Roasted Potatoes', 'Assorted Dessert Bites']),
    JSON.stringify([{ name: 'Coffee & Tea Service', price: 6.0 }]),
    '/src/assets/images/event_corporate_buffet_1795136243249.jpg'
  );

  db.prepare(`
    INSERT INTO food_items (
      restaurant_id, category_id, name, description, unit_price, price_unit,
      min_order_qty, dietary_tags, allergens, image_url, is_available, addons_json
    ) VALUES (?, ?, ?, ?, 210.00, 'per platter (serves 10)', 1, 'Gluten-Free', 'None', ?, 1, '[]')
  `).run(
    restaurantId,
    cat1,
    'Herb-Crusted Roast Platter',
    'Slow-roasted signature main served with seasonal vegetables and house jus.',
    '/src/assets/images/dish_herb_roast_beef_1795136242853.jpg'
  );

  db.prepare(`
    INSERT INTO food_items (
      restaurant_id, category_id, name, description, unit_price, price_unit,
      min_order_qty, dietary_tags, allergens, image_url, is_available, addons_json
    ) VALUES (?, ?, ?, ?, 24.00, 'per box', 15, 'Dairy-Free', 'Fish', ?, 1, '[]')
  `).run(
    restaurantId,
    cat2,
    'Executive Catering Meal Box',
    'Individually sealed protein, grain, and roasted seasonal vegetable box with utensils.',
    '/src/assets/images/event_packed_meals_1795136242777.jpg'
  );
}

function seedInitialData(): void {
  const passwordHash = bcrypt.hashSync('ChefAdmin2026!', 10);
  const superAdminHash = bcrypt.hashSync('SuperAdmin2026!', 10);

  // Platform Superadmin (tenant-agnostic)
  db.prepare(`
    INSERT INTO users (restaurant_id, name, email, password_hash, role, is_active)
    VALUES (NULL, 'Platform Superadmin', 'superadmin@hearthandtable.com', ?, 'superadmin', 1)
  `).run(superAdminHash);

  // 1. Restaurants (Multi-Tenant)
  const insertRestaurant = db.prepare(`
    INSERT INTO restaurants (
      slug, name, tagline, brand_color, email, phone, address, logo_text,
      tax_rate, service_charge_rate, hero_headline, hero_subheadline,
      hero_image_url, about_title, about_description, is_published
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const r1 = insertRestaurant.run(
    'maison-saffron',
    'Maison Saffron',
    'Seasonal Banquet Kitchen & Private Event Catering',
    '#1B4332',
    'catering@maisonsaffron.com',
    '+1 (415) 890-4420',
    '428 Jackson Street, San Francisco, CA 94111',
    'Maison Saffron',
    8.625,
    18.0,
    'Make Every Occasion Delicious',
    'From intimate family gatherings to grand celebrations, let us take care of the food.',
    '/src/assets/images/hero_catering_banquet_1795136239169.jpg',
    'San Francisco Banquet Craft',
    'Maison Saffron brings restaurant-grade open-fire roasting, coastal seafood, and coordinated hospitality teams straight to your venue.'
  );
  const msId = Number(r1.lastInsertRowid);

  const r2 = insertRestaurant.run(
    'atelier-verde',
    'Atelier Verde',
    'Mediterranean Harvest Table & Executive Boxed Dining',
    '#2D4A3E',
    'events@atelierverde.com',
    '+1 (212) 640-7715',
    '118 Crosby Street, New York, NY 10012',
    'Atelier Verde',
    8.875,
    15.0,
    'Make Every Occasion Delicious',
    'From intimate family gatherings to grand celebrations, let us take care of the food.',
    '/src/assets/images/event_family_gathering_1795136243668.jpg',
    'Coastal Harvest & Executive Dining',
    'Atelier Verde curates olive-oil-forward Mediterranean feasts and individually boxed studio lunches across Manhattan and Brooklyn.'
  );
  const avId = Number(r2.lastInsertRowid);

  seedDefaultServicesForRestaurant(msId);
  seedDefaultServicesForRestaurant(avId);

  // 2. Staff Users (Tenant-Scoped)
  const insertUser = db.prepare(`
    INSERT INTO users (restaurant_id, name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)
  `);
  const u1 = insertUser.run(msId, 'Claire Beaumont', 'claire@maisonsaffron.com', passwordHash, 'owner');
  const u2 = insertUser.run(msId, 'Marcus Vance', 'marcus@maisonsaffron.com', passwordHash, 'manager');
  insertUser.run(msId, 'Sora Takahashi', 'sora@maisonsaffron.com', passwordHash, 'staff');
  const u4 = insertUser.run(avId, 'Elena Rossi', 'elena@atelierverde.com', passwordHash, 'owner');

  const claireId = Number(u1.lastInsertRowid);
  const marcusId = Number(u2.lastInsertRowid);
  const elenaId = Number(u4.lastInsertRowid);

  // 3. Event Types for Maison Saffron & Atelier Verde
  const insertEventType = db.prepare(`
    INSERT INTO event_types (restaurant_id, name, slug, description, image_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const msEvents = [
    ['Birthday Parties', 'birthday-parties', 'Elevated grazing tables, carved roasts, and pastry towers designed for milestone celebrations.', '/src/assets/images/event_birthday_table_1795136243424.jpg', 1],
    ['Weddings and Receptions', 'weddings-receptions', 'Bespoke multi-course plated service, cocktail canapés, and coordinated banquet hospitality.', '/src/assets/images/event_wedding_banquet_1795136243199.jpg', 2],
    ['Corporate Events', 'corporate-events', 'Executive luncheons, boardroom buffets, and conference dining delivered with punctual precision.', '/src/assets/images/event_corporate_buffet_1795136243249.jpg', 3],
    ['Family Gatherings', 'family-gatherings', 'Generous family-style platters of slow-roasted meats, heirloom salads, and sourdough.', '/src/assets/images/event_family_gathering_1795136243668.jpg', 4],
    ['School and Community Events', 'school-community', 'High-volume warm buffet trays and balanced seasonal menus tailored for large community halls.', '/src/assets/images/event_community_feast_1795136243259.jpg', 5],
    ['Packed Meals and Bulk Orders', 'packed-meals-bulk', 'Individually sealed craft meal boxes with full allergen labeling for crews, teams, and off-sites.', '/src/assets/images/event_packed_meals_1795136242777.jpg', 6],
  ] as const;

  const msEventIds: Record<string, number> = {};
  for (const ev of msEvents) {
    const res = insertEventType.run(msId, ev[0], ev[1], ev[2], ev[3], ev[4]);
    msEventIds[ev[1]] = Number(res.lastInsertRowid);
  }

  for (const ev of msEvents) {
    insertEventType.run(avId, ev[0], ev[1], ev[2], ev[3], ev[4]);
  }

  // 4. Food Categories
  const insertCat = db.prepare(`
    INSERT INTO food_categories (restaurant_id, name, slug, sort_order) VALUES (?, ?, ?, ?)
  `);
  const msCats = [
    ['Signature Mains', 'signature-mains', 1],
    ['Canapés & Grazing', 'canapes-grazing', 2],
    ['Salads & Sides', 'salads-sides', 3],
    ['Packed Meal Boxes', 'packed-meal-boxes', 4],
    ['Artisan Desserts', 'artisan-desserts', 5],
  ] as const;
  const catIds: Record<string, number> = {};
  for (const c of msCats) {
    const res = insertCat.run(msId, c[0], c[1], c[2]);
    catIds[c[1]] = Number(res.lastInsertRowid);
  }

  const avCat1 = Number(insertCat.run(avId, 'Mediterranean Mains', 'mediterranean-mains', 1).lastInsertRowid);
  const avCat2 = Number(insertCat.run(avId, 'Executive Bento Boxes', 'executive-bento-boxes', 2).lastInsertRowid);

  // 5. Food Items
  const insertFood = db.prepare(`
    INSERT INTO food_items (
      restaurant_id, category_id, name, description, unit_price, price_unit,
      min_order_qty, dietary_tags, allergens, image_url, is_available, addons_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const f1 = Number(insertFood.run(
    msId, catIds['signature-mains'],
    'Herb-Crusted Beef Tenderloin Platter',
    'Medium-rare roasted tenderloin sliced over rosemary jus with blistered heirloom cherry tomatoes. Serves 10–12 guests per platter.',
    285.00, 'per platter (serves 10)', 1, 'Gluten-Free', 'None',
    '/src/assets/images/dish_herb_roast_beef_1795136242853.jpg', 1,
    JSON.stringify([
      { name: 'Horseradish Crème Fraîche', price: 18 },
      { name: 'Extra Truffle Demi-Glace', price: 24 }
    ])
  ).lastInsertRowid);

  const f2 = Number(insertFood.run(
    msId, catIds['signature-mains'],
    'Pan-Seared Atlantic Salmon & Dill Beurre Blanc',
    'Crispy-skin wild salmon fillets paired with charred asparagus spears and caramelized Meyer lemon. Serves 10 guests per tray.',
    240.00, 'per tray (serves 10)', 1, 'Gluten-Free, Pescatarian', 'Fish, Dairy',
    '/src/assets/images/dish_pan_seared_salmon_1795136242731.jpg', 1,
    JSON.stringify([
      { name: 'Dairy-Free Citrus Herb Olive Oil Sub', price: 0 },
      { name: 'Extra Charred Asparagus Side', price: 32 }
    ])
  ).lastInsertRowid);

  const f3 = Number(insertFood.run(
    msId, catIds['signature-mains'],
    'Whole Herb-Roasted Chicken & Garlic Potatoes',
    'Free-range pasture chicken roasted with thyme, lemon, and golden fingerling potatoes. Ideal for family-style banquets.',
    165.00, 'per platter (serves 8)', 1, 'Gluten-Free, Dairy-Free', 'None',
    '/src/assets/images/event_family_gathering_1795136243668.jpg', 1,
    JSON.stringify([{ name: 'Carving Service Setup', price: 45 }])
  ).lastInsertRowid);

  const f4 = Number(insertFood.run(
    msId, catIds['canapes-grazing'],
    'Artisanal Charcuterie & Cave-Aged Cheese Board',
    'Prosciutto di Parma, bresaola, aged comté, triple-cream brie, honeycomb, black mission figs, and sourdough crisps.',
    190.00, 'per board (serves 15)', 1, 'Nut-Free Option', 'Dairy, Wheat',
    '/src/assets/images/event_birthday_table_1795136243424.jpg', 1,
    JSON.stringify([{ name: 'Gluten-Free Seeded Crackers', price: 14 }])
  ).lastInsertRowid);

  const f5 = Number(insertFood.run(
    msId, catIds['salads-sides'],
    'Heirloom Tomato, Burrata & Basil Salad',
    'Early girl and sun-gold tomatoes layered with creamy Pugliese burrata, aged balsamic reduction, and cold-pressed olive oil.',
    95.00, 'per bowl (serves 10)', 1, 'Vegetarian, Gluten-Free', 'Dairy',
    '/src/assets/images/hero_catering_banquet_1795136239169.jpg', 1,
    JSON.stringify([{ name: 'Toasted Pine Nuts Garnish', price: 12 }])
  ).lastInsertRowid);

  const f6 = Number(insertFood.run(
    msId, catIds['salads-sides'],
    'Baked Ricotta & Herb Ziti Tray',
    'Slow-simmered San Marzano tomato ragù tossed with artisanal rigatoni, fresh mozzarella, and sweet basil.',
    120.00, 'per full tray (serves 12)', 1, 'Vegetarian', 'Wheat, Dairy',
    '/src/assets/images/event_community_feast_1795136243259.jpg', 1,
    JSON.stringify([{ name: 'Add Sweet Italian Sausage', price: 28 }])
  ).lastInsertRowid);

  const f7 = Number(insertFood.run(
    msId, catIds['packed-meal-boxes'],
    'Executive Teriyaki Salmon Meal Box',
    'Individually boxed sustainable salmon over saffron basmati rice with roasted heirloom carrots, broccolini, and compostable cutlery.',
    26.00, 'per box', 15, 'Dairy-Free, Gluten-Free', 'Fish, Soy',
    '/src/assets/images/event_packed_meals_1795136242777.jpg', 1,
    JSON.stringify([
      { name: 'Sparkling Mineral Water Can', price: 3.5 },
      { name: 'Artisan Brownie Bite', price: 4.0 }
    ])
  ).lastInsertRowid);

  const f8 = Number(insertFood.run(
    msId, catIds['packed-meal-boxes'],
    'Roasted Chicken & Quinoa Harvest Box',
    'Herb-grilled chicken breast, tricolor quinoa, charred sweet potato, kale slaw, and lemon tahini dressing.',
    22.00, 'per box', 15, 'Dairy-Free, Gluten-Free', 'Sesame',
    '/src/assets/images/event_packed_meals_1795136242777.jpg', 1,
    JSON.stringify([{ name: 'Fresh Seasonal Fruit Cup', price: 4.5 }])
  ).lastInsertRowid);

  const f9 = Number(insertFood.run(
    msId, catIds['artisan-desserts'],
    'Tiered Pastry & Tartlet Collection (36 pcs)',
    'Dark Valrhona chocolate ganache tartlets, torched Meyer lemon meringue bites, and Sicilian pistachio panna cotta cups.',
    148.00, 'per assortment (36 pcs)', 1, 'Vegetarian', 'Dairy, Eggs, Wheat, Tree Nuts',
    '/src/assets/images/dish_artisan_desserts_1795136243576.jpg', 1,
    JSON.stringify([{ name: 'Custom Chocolate Celebration Plaque', price: 25 }])
  ).lastInsertRowid);

  const f10 = Number(insertFood.run(
    msId, catIds['canapes-grazing'],
    'Smoked Salmon & Crème Fraîche Crostini (24 pcs)',
    'Wild-caught cold-smoked salmon on toasted brioche rounds with caper berries and fresh dill.',
    110.00, 'per tray (24 pcs)', 1, 'Pescatarian', 'Fish, Dairy, Wheat',
    '/src/assets/images/event_corporate_buffet_1795136243249.jpg', 1,
    JSON.stringify([])
  ).lastInsertRowid);

  // Atelier Verde food items (Tenant 2)
  insertFood.run(
    avId, avCat1,
    'Saffron Branzino & Fennel Platter',
    'Whole-filleted Mediterranean sea bass roasted with fennel bulb, Castelvetrano olives, and preserved lemon.',
    230.00, 'per platter (serves 10)', 1, 'Gluten-Free, Dairy-Free', 'Fish',
    '/src/assets/images/dish_pan_seared_salmon_1795136242731.jpg', 1, '[]'
  );
  insertFood.run(
    avId, avCat2,
    'Verdant Falafel & Mezze Executive Box',
    'Crispy chickpea herb falafel, saffron rice, roasted eggplant, hummus, and warm pita wedges.',
    19.50, 'per box', 12, 'Vegan', 'Sesame, Wheat',
    '/src/assets/images/event_packed_meals_1795136242777.jpg', 1, '[]'
  );

  // 6. Catering Packages
  const insertPkg = db.prepare(`
    INSERT INTO catering_packages (
      restaurant_id, name, description, pricing_type, price, min_guests, max_guests,
      inclusions_json, addons_json, image_url, is_available, is_seasonal, promo_label
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const p1 = Number(insertPkg.run(
    msId,
    'Grand Celebration Banquet',
    'Our flagship full-service plated or chafed dinner experience crafted for weddings, milestone anniversaries, and formal galas.',
    'per_person', 78.00, 40, 350,
    JSON.stringify([
      '2 Passed Cocktail Canapés per guest',
      'Heirloom Tomato & Burrata Starter Salad',
      'Dual Entrée: Herb Beef Tenderloin & Pan-Seared Salmon',
      'Garlic Rosemary Fingerling Potatoes & Charred Asparagus',
      'Artisan Sourdough Basket & Cultured Butter',
      'Assorted Tartlets & Panna Cotta Dessert Display'
    ]),
    JSON.stringify([
      { name: 'Dedicated Chef Carving Station', price: 320 },
      { name: 'Coffee & Herbal Tea Service', price: 6.5 },
      { name: 'Linen & Porcelain Tableware Upgrade', price: 14.0 }
    ]),
    '/src/assets/images/event_wedding_banquet_1795136243199.jpg',
    1, 0, null
  ).lastInsertRowid);

  const p2 = Number(insertPkg.run(
    msId,
    'Executive Boardroom & Conference Buffet',
    'Streamlined hot and ambient buffet crafted for corporate summits, client lunches, and off-site retreats.',
    'per_person', 48.00, 20, 200,
    JSON.stringify([
      'Pan-Seared Atlantic Salmon with Dill Beurre Blanc',
      'Herb-Roasted Free-Range Chicken Breast',
      'Wild Rice Pilaf & Seasonal Roasted Broccolini',
      'Mixed Baby Greens with Citrus Vinaigrette',
      'Chafing Dishes, Serving Utensils & Compostable Plates'
    ]),
    JSON.stringify([
      { name: 'Afternoon Pastry & Espresso Break', price: 16.0 },
      { name: 'On-Site Buffet Attendant (4 hrs)', price: 185 }
    ]),
    '/src/assets/images/event_corporate_buffet_1795136243249.jpg',
    1, 0, null
  ).lastInsertRowid);

  const p3 = Number(insertPkg.run(
    msId,
    'Autumn Harvest Table (Seasonal)',
    'Limited-run seasonal feast celebrating late-autumn orchard produce, slow-braised meats, and warm spiced tarts.',
    'per_person', 64.00, 25, 150,
    JSON.stringify([
      'Artisanal Charcuterie & Cave-Aged Cheese Grazing Board',
      'Herb-Crusted Beef Tenderloin with Rosemary Jus',
      'Whole Roasted Chicken & Garlic Potatoes',
      'Shaved Fennel, Pear & Pomegranate Salad',
      'Lemon Meringue & Chocolate Ganache Tartlets'
    ]),
    JSON.stringify([
      { name: 'Spiced Apple Cider Bar', price: 8.0 },
      { name: 'Floral Table Runners & Taper Candles', price: 240 }
    ]),
    '/src/assets/images/hero_catering_banquet_1795136239169.jpg',
    1, 1, 'Autumn Seasonal Menu · 10% Off Early Bookings'
  ).lastInsertRowid);

  const p4 = Number(insertPkg.run(
    msId,
    'Executive Packed Meals (25-Box Bundle)',
    'Ready-to-distribute individual gourmet meal boxes ideal for production crews, school teams, and hybrid offices.',
    'flat_package', 625.00, 25, 500,
    JSON.stringify([
      '25 Individually Labeled Gourmet Meal Boxes',
      'Mix of Teriyaki Salmon, Roasted Chicken & Vegan Harvest',
      'Full Allergen & Dietary Stickers on Every Lid',
      'Compostable Birch Cutlery & Napkin Packs',
      'Chilled Insulated Delivery Crates'
    ]),
    JSON.stringify([
      { name: 'Additional 10 Meal Boxes', price: 240 },
      { name: 'Sparkling Water & Cold Brew Pack (25)', price: 95 }
    ]),
    '/src/assets/images/event_packed_meals_1795136242777.jpg',
    1, 0, null
  ).lastInsertRowid);

  // Atelier Verde package
  insertPkg.run(
    avId,
    'Mediterranean Coastal Feast',
    'Vibrant olive-oil-forward grazing platters, whole roasted branzino, and saffron mezze.',
    'per_person', 58.00, 20, 180,
    JSON.stringify(['Mezze & Warm Pita Table', 'Saffron Branzino', 'Herb Lamb Skewers', 'Pistachio Baklava']),
    JSON.stringify([{ name: 'Mint Lemonade Dispensers', price: 75 }]),
    '/src/assets/images/event_family_gathering_1795136243668.jpg',
    1, 0, null
  );

  // Link package_items
  const insertPkgItem = db.prepare(`INSERT INTO package_items (package_id, food_item_id, default_servings_per_guest) VALUES (?, ?, ?)`);
  insertPkgItem.run(p1, f1, 0.1);
  insertPkgItem.run(p1, f2, 0.1);
  insertPkgItem.run(p1, f5, 0.1);
  insertPkgItem.run(p1, f9, 0.03);
  insertPkgItem.run(p2, f2, 0.1);
  insertPkgItem.run(p2, f10, 0.05);
  insertPkgItem.run(p3, f1, 0.1);
  insertPkgItem.run(p3, f3, 0.12);
  insertPkgItem.run(p3, f4, 0.07);
  insertPkgItem.run(p4, f7, 1.0);

  // 7. Sample Customers, Inquiries, Quotations & Bookings for Maison Saffron
  const insertCustomer = db.prepare(`
    INSERT INTO customers (restaurant_id, full_name, email, phone, company_name, preferred_contact) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const c1 = Number(insertCustomer.run(msId, 'Amelia Thornton', 'amelia.thornton@northstar.io', '+1 (415) 555-0182', 'Northstar Architecture', 'Email').lastInsertRowid);
  const c2 = Number(insertCustomer.run(msId, 'Daniel & Priya Kapoor', 'priya.kapoor@gmail.com', '+1 (415) 555-0149', '', 'Phone').lastInsertRowid);
  const c3 = Number(insertCustomer.run(msId, 'Sophia Lindqvist', 's.lindqvist@bayprep.edu', '+1 (415) 555-0194', 'Bayview Preparatory School', 'Email').lastInsertRowid);
  const c4 = Number(insertCustomer.run(msId, 'Julian Mercer', 'jmercer@veridianlabs.com', '+1 (650) 555-0118', 'Veridian Labs', 'Email').lastInsertRowid);
  const c5 = Number(insertCustomer.run(msId, 'Hannah Morales', 'hannah.morales@outlook.com', '+1 (415) 555-0167', '', 'Messenger').lastInsertRowid);

  // Atelier Verde Customer
  const cAv = Number(insertCustomer.run(avId, 'Lucas Meyer', 'lucas@sohodesign.co', '+1 (212) 555-0133', 'SoHo Design Guild', 'Email').lastInsertRowid);

  const insertInquiry = db.prepare(`
    INSERT INTO catering_inquiries (
      restaurant_id, customer_id, reference_number, event_type_id, event_type_name,
      event_date, start_time, end_time, guest_count, event_venue, delivery_address,
      venue_setting, selected_package_id, selected_package_name, dietary_requirements,
      food_allergies, special_instructions, additional_services_json, estimated_total,
      status, assigned_staff_id, assigned_staff_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const inq1 = Number(insertInquiry.run(
    msId, c1, 'INQ-MS-2026-1042', msEventIds['corporate-events'], 'Corporate Events',
    '2026-12-12', '12:00', '15:30', 65, 'Northstar Pier 27 Studio', 'Pier 27 Embarcadero, Suite 300, San Francisco, CA',
    'indoor', p2, 'Executive Boardroom & Conference Buffet',
    '12 vegetarian guests, 4 gluten-free', 'Severe peanut allergy for 1 executive guest',
    'Please arrive 45 minutes prior for freight elevator loading.',
    JSON.stringify(['Food setup', 'Buffet arrangement', 'Food delivery']),
    3120.00, 'Quotation Sent', claireId, 'Claire Beaumont', '2026-11-12 10:15:00'
  ).lastInsertRowid);

  const inq2 = Number(insertInquiry.run(
    msId, c2, 'INQ-MS-2026-1039', msEventIds['weddings-receptions'], 'Weddings and Receptions',
    '2027-01-18', '17:30', '23:00', 120, 'Conservatory of Flowers Pavilion', '100 John F Kennedy Dr, San Francisco, CA',
    'indoor', p1, 'Grand Celebration Banquet',
    '8 vegan guests, halal poultry preferred where possible', 'Tree nut allergy on bride side',
    'Seated dinner service; coordinate timeline with wedding planner.',
    JSON.stringify(['Food setup', 'Waitstaff', 'Tables and chairs', 'Food delivery']),
    9360.00, 'Confirmed', claireId, 'Claire Beaumont', '2026-11-04 14:22:00'
  ).lastInsertRowid);

  const inq3 = Number(insertInquiry.run(
    msId, c3, 'INQ-MS-2026-1045', msEventIds['school-community'], 'School and Community Events',
    '2026-12-05', '18:00', '21:00', 90, 'Bayview Prep Gymnasium', '780 Oak Street, San Francisco, CA',
    'indoor', null, null,
    'Nut-free menu strictly required for school campus', 'No peanuts or tree nuts',
    'Custom tray order for faculty and parent awards dinner.',
    JSON.stringify(['Buffet arrangement', 'Food delivery']),
    1940.00, 'Request Received', null, null, '2026-11-18 09:40:00'
  ).lastInsertRowid);

  const inq4 = Number(insertInquiry.run(
    msId, c4, 'INQ-MS-2026-1044', msEventIds['packed-meals-bulk'], 'Packed Meals and Bulk Orders',
    '2026-12-02', '11:30', '13:00', 45, 'Veridian Labs R&D Atrium', '600 Townsend St, San Francisco, CA',
    'indoor', p4, 'Executive Packed Meals (25-Box Bundle)',
    '15 dairy-free boxes, 10 vegan boxes', 'None reported',
    'Deliver to Reception Desk B by 11:15 AM sharp.',
    JSON.stringify(['Food delivery']),
    1145.00, 'Under Review', marcusId, 'Marcus Vance', '2026-11-16 16:05:00'
  ).lastInsertRowid);

  const inq5 = Number(insertInquiry.run(
    msId, c5, 'INQ-MS-2026-1041', msEventIds['birthday-parties'], 'Birthday Parties',
    '2026-12-20', '19:00', '22:30', 35, 'Presidio Officers Club Terrace', '50 Moraga Ave, San Francisco, CA',
    'outdoor', p3, 'Autumn Harvest Table (Seasonal)',
    '4 pescatarian guests', 'Shellfish allergy',
    'Evening terrace heaters will be on; covered patio setup.',
    JSON.stringify(['Food setup', 'Waitstaff', 'Food delivery']),
    2240.00, 'Awaiting Customer Confirmation', marcusId, 'Marcus Vance', '2026-11-10 11:50:00'
  ).lastInsertRowid);

  insertInquiry.run(
    avId, cAv, 'INQ-AV-2026-2001', null, 'Corporate Events',
    '2026-12-10', '12:30', '14:30', 30, 'SoHo Design Loft', '85 Mercer St, New York, NY',
    'indoor', null, null, 'Vegan options for 10 guests', 'None', 'Leave with freight concierge',
    JSON.stringify(['Food delivery']), 585.00, 'Request Received', elenaId, 'Elena Rossi', '2026-11-17 13:10:00'
  );

  // Inquiry Items
  const insertInqItem = db.prepare(`
    INSERT INTO inquiry_items (inquiry_id, food_item_id, item_name, quantity, unit_price, line_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertInqItem.run(inq3, f6, 'Baked Ricotta & Herb Ziti Tray', 6, 120.00, 720.00, '3 vegetarian, 3 with sausage');
  insertInqItem.run(inq3, f3, 'Whole Herb-Roasted Chicken & Garlic Potatoes', 5, 165.00, 825.00, 'Carved into 8 pieces each');
  insertInqItem.run(inq3, f5, 'Heirloom Tomato, Burrata & Basil Salad', 4, 95.00, 380.00, 'Dressing on the side');
  insertInqItem.run(inq1, f9, 'Tiered Pastry & Tartlet Collection (36 pcs)', 2, 148.00, 296.00, 'Afternoon break add-on');

  // Inquiry Notes
  const insertNote = db.prepare(`
    INSERT INTO inquiry_notes (inquiry_id, user_id, author_name, note, is_internal) VALUES (?, ?, ?, ?, ?)
  `);
  insertNote.run(inq1, claireId, 'Claire Beaumont', 'Confirmed freight elevator booking window with Pier 27 security. Sent formal PDF quotation.', 1);
  insertNote.run(inq2, claireId, 'Claire Beaumont', 'Customer signed and accepted QTN-MS-2026-0912. 40% deposit cleared via ACH.', 1);
  insertNote.run(inq4, marcusId, 'Marcus Vance', 'Checking insulated crate availability for Dec 2 morning dispatch.', 1);

  // Quotations
  const insertQuote = db.prepare(`
    INSERT INTO quotations (
      restaurant_id, inquiry_id, quotation_number, version, subtotal, delivery_fee,
      service_charge, discount_amount, tax_amount, grand_total, payment_terms,
      terms_conditions, valid_until, status, created_by_name, sent_at, accepted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertQuoteItem = db.prepare(`
    INSERT INTO quotation_items (quotation_id, item_type, title, description, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const q1 = Number(insertQuote.run(
    msId, inq1, 'QTN-MS-2026-0945', 1, 3601.00, 125.00, 648.18, 150.00, 349.47, 4573.65,
    '40% reservation deposit due upon acceptance; remaining balance due 72 hours before event.',
    'Final guest count is due 5 business days prior to the event. Cancellations within 7 days forfeit 50% of the deposit. Allergen protocols will be strictly followed for the peanut-free executive tray.',
    '2026-12-01', 'sent', 'Claire Beaumont', '2026-11-13 15:30:00', null
  ).lastInsertRowid);
  insertQuoteItem.run(q1, 'package', 'Executive Boardroom & Conference Buffet', 'Full hot buffet for 65 guests incl. salmon, roasted chicken, wild rice, broccolini', 65, 48.00, 3120.00);
  insertQuoteItem.run(q1, 'food_item', 'Tiered Pastry & Tartlet Collection (36 pcs)', 'Afternoon espresso & tartlet break add-on', 2, 148.00, 296.00);
  insertQuoteItem.run(q1, 'service', 'On-Site Buffet Attendant (4 hrs)', 'Dedicated uniformed staff for setup, replenishment, and breakdown', 1, 185.00, 185.00);

  const q2 = Number(insertQuote.run(
    msId, inq2, 'QTN-MS-2026-0912', 1, 11100.00, 250.00, 1998.00, 0, 1126.31, 14474.31,
    '40% deposit ($5,789.72) due on signing; 60% balance due 14 days prior to wedding.',
    'Includes full china, flatware, glassware, and 6-hour service captain & 6 waitstaff.',
    '2026-11-30', 'accepted', 'Claire Beaumont', '2026-11-05 11:00:00', '2026-11-07 16:45:00'
  ).lastInsertRowid);
  insertQuoteItem.run(q2, 'package', 'Grand Celebration Banquet', 'Plated dual-entrée dinner for 120 wedding guests', 120, 78.00, 9360.00);
  insertQuoteItem.run(q2, 'service', 'Waitstaff & Banquet Captain Team (6 Staff)', '6 hours on-site plated service & teardown', 1, 1420.00, 1420.00);
  insertQuoteItem.run(q2, 'service', 'Dedicated Chef Carving Station', 'On-site tenderloin carving & presentation', 1, 320.00, 320.00);

  const q3 = Number(insertQuote.run(
    msId, inq5, 'QTN-MS-2026-0941', 1, 2480.00, 95.00, 446.40, 224.00, 232.02, 3029.42,
    '50% deposit upon acceptance; balance due 5 days prior.',
    'Autumn Seasonal 10% early booking discount applied ($224.00). Outdoor patio setup weather contingency included.',
    '2026-12-05', 'sent', 'Marcus Vance', '2026-11-11 16:00:00', null
  ).lastInsertRowid);
  insertQuoteItem.run(q3, 'package', 'Autumn Harvest Table (Seasonal)', 'Seasonal dinner buffet for 35 guests', 35, 64.00, 2240.00);
  insertQuoteItem.run(q3, 'service', 'Floral Table Runners & Taper Candles', 'Seasonal foliage styling & brass taper holders', 1, 240.00, 240.00);

  // Confirmed Booking for inq2
  const insertBooking = db.prepare(`
    INSERT INTO bookings (
      restaurant_id, inquiry_id, quotation_id, booking_reference, customer_name,
      customer_email, customer_phone, event_date, event_venue, guest_count,
      confirmed_menu_summary, total_amount, deposit_amount, amount_paid, balance_due,
      payment_status, booking_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const bk1 = Number(insertBooking.run(
    msId, inq2, q2, 'BK-MS-2026-0814', 'Daniel & Priya Kapoor',
    'priya.kapoor@gmail.com', '+1 (415) 555-0149', '2027-01-18',
    'Conservatory of Flowers Pavilion', 120,
    'Grand Celebration Banquet (120 guests) + Waitstaff Team + Chef Carving Station',
    14474.31, 5789.72, 5789.72, 8684.59, 'Deposit Paid', 'Confirmed'
  ).lastInsertRowid);

  db.prepare(`
    INSERT INTO booking_payments (booking_id, amount, payment_method, reference_code, recorded_by_name, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(bk1, 5789.72, 'ACH Wire Transfer', 'ACH-884120', 'Claire Beaumont', '40% initial booking deposit verified via bank settlement.');

  // Notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (restaurant_id, recipient_type, recipient_contact, channel, event_key, subject, body, status, related_reference)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertNotif.run(msId, 'customer', 'amelia.thornton@northstar.io', 'email', 'quotation_prepared',
    'Your Catering Quotation QTN-MS-2026-0945 from Maison Saffron',
    'Hello Amelia, your tailored quotation for 65 guests on 2026-12-12 is ready for review ($4,573.65).', 'sent', 'INQ-MS-2026-1042');
  insertNotif.run(msId, 'customer', 'priya.kapoor@gmail.com', 'email', 'booking_confirmed',
    'Booking Confirmed: BK-MS-2026-0814 — Conservatory of Flowers Pavilion',
    'Your deposit of $5,789.72 has been verified and your wedding banquet on 2027-01-18 is officially confirmed.', 'sent', 'BK-MS-2026-0814');
  insertNotif.run(msId, 'staff', 'catering@maisonsaffron.com', 'email', 'new_inquiry',
    'New Catering Inquiry INQ-MS-2026-1045 (90 guests)',
    'Bayview Preparatory School submitted a custom tray inquiry for 2026-12-05.', 'sent', 'INQ-MS-2026-1045');

  // Audit Logs
  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (restaurant_id, entity_type, entity_id, action, actor_name, details) VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertAudit.run(msId, 'quotation', q1, 'quotation_sent', 'Claire Beaumont', 'Issued QTN-MS-2026-0945 ($4,573.65) to amelia.thornton@northstar.io');
  insertAudit.run(msId, 'booking', bk1, 'booking_confirmed', 'Claire Beaumont', 'Converted INQ-MS-2026-1039 to confirmed booking BK-MS-2026-0814 after customer acceptance');
  insertAudit.run(msId, 'payment', bk1, 'payment_verified', 'Claire Beaumont', 'Recorded verified deposit payment of $5,789.72 (ACH-884120)');
}
