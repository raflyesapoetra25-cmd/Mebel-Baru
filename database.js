const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'mebel.db'));

// Aktifkan foreign key
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===== BUAT TABEL =====
db.exec(`
  -- TABEL PRODUK
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    image TEXT,
    description TEXT,
    badge TEXT,
    stock INTEGER DEFAULT 100,
    dimensions TEXT,
    material TEXT,
    weight TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- TABEL PESANAN
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    customer_address TEXT NOT NULL,
    customer_city TEXT NOT NULL,
    customer_notes TEXT,
    payment_method TEXT NOT NULL,
    payment_status TEXT DEFAULT 'pending',
    order_status TEXT DEFAULT 'created',
    subtotal INTEGER NOT NULL DEFAULT 0,
    shipping_cost INTEGER DEFAULT 0,
    discount INTEGER DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    member_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- TABEL ITEM PESANAN
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    product_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    subtotal INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  -- TABEL STATUS HISTORY
  CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    changed_by TEXT DEFAULT 'system',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  -- TABEL MEMBER
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    password TEXT NOT NULL,
    tier TEXT DEFAULT 'bronze',
    points INTEGER DEFAULT 500,
    total_spend INTEGER DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    vouchers_count INTEGER DEFAULT 1,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- TABEL VOUCHER
  CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL,
    discount_value INTEGER NOT NULL,
    min_order INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 100,
    used_count INTEGER DEFAULT 0,
    valid_from DATETIME,
    valid_until DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- TABEL WISHLIST
  CREATE TABLE IF NOT EXISTS wishlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_id, product_id),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  -- TABEL REVIEW
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    member_id TEXT,
    member_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    is_verified INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (member_id) REFERENCES members(id)
  );

  -- TABEL KATEGORI
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT,
    description TEXT,
    image TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1
  );
`);

// ===== SEED DATA (Data Awal) =====
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
if (productCount === 0) {
  console.log('📦 Seeding data...');

  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, price, image, description, badge, stock, dimensions, material, weight)
    VALUES (@name, @category, @price, @image, @description, @badge, @stock, @dimensions, @material, @weight)
  `);

  const products = [
    { name: "Sofa L Japandi", category: "sofa", price: 8500000, image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80", description: "Sofa sudut Japandi, kayu jati, bantal premium.", badge: "Best Seller", stock: 15, dimensions: "250x170x85cm", material: "Kayu Jati + Fabric", weight: "65kg" },
    { name: "Meja Makan Solid", category: "meja", price: 12000000, image: "https://images.unsplash.com/photo-1617806118233-18e1de247200?w=600&q=80", description: "Meja makan 6 kursi kayu jati.", badge: "Premium", stock: 8, dimensions: "180x90x75cm", material: "Kayu Jati Solid", weight: "55kg" },
    { name: "Lemari 3 Pintu", category: "lemari", price: 7500000, image: "https://images.unsplash.com/photo-1558997519-83ea9252edf8?w=600&q=80", description: "Lemari 3 pintu cermin full.", badge: "", stock: 20, dimensions: "160x55x200cm", material: "Plywood Premium", weight: "80kg" },
    { name: "Kursi Rattan", category: "kursi", price: 3200000, image: "https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=600&q=80", description: "Kursi rotan handmade.", badge: "New", stock: 25, dimensions: "60x60x82cm", material: "Rotan Alami", weight: "8kg" },
    { name: "Sofa Bed Cloud", category: "sofa", price: 11000000, image: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=600&q=80", description: "Sofa bed serasa awan.", badge: "Hot", stock: 10, dimensions: "210x150x85cm", material: "High-Density Foam", weight: "70kg" },
    { name: "Meja Kerja Standing", category: "meja", price: 4500000, image: "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&q=80", description: "Standing desk adjustable.", badge: "", stock: 30, dimensions: "120x60x110cm", material: "Steel + MDF", weight: "25kg" },
    { name: "Rak Buku Modular", category: "lemari", price: 5800000, image: "https://images.unsplash.com/photo-1594620302200-9a762244a156?w=600&q=80", description: "Rak modular floating.", badge: "New", stock: 18, dimensions: "120x30x180cm", material: "Kayu Oak", weight: "35kg" },
    { name: "Kursi Velvet", category: "kursi", price: 2800000, image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&q=80", description: "Kursi makan velvet.", badge: "", stock: 40, dimensions: "50x55x85cm", material: "Velvet + Kayu Jati", weight: "7kg" },
    { name: "Bean Bag", category: "sofa", price: 2200000, image: "https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?w=600&q=80", description: "Bean bag XL.", badge: "", stock: 50, dimensions: "90x90cm", material: "Oxford Fabric", weight: "3kg" },
    { name: "Meja TV Floating", category: "meja", price: 3800000, image: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=600&q=80", description: "Meja TV floating.", badge: "", stock: 22, dimensions: "150x40x35cm", material: "Plywood HPL", weight: "20kg" },
    { name: "Lemari Hias Kaca", category: "lemari", price: 9200000, image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80&crop=left", description: "Cabinet + LED.", badge: "Premium", stock: 5, dimensions: "100x40x200cm", material: "Kaca Tempered + Kayu", weight: "60kg" },
    { name: "Lampu Terracotta", category: "dekorasi", price: 890000, image: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=600&q=80", description: "Lampu warm.", badge: "New", stock: 100, dimensions: "20x20x35cm", material: "Terracotta", weight: "1.5kg" },
    { name: "Wall Mirror", category: "dekorasi", price: 1450000, image: "https://images.unsplash.com/photo-1618220179428-22790b461013?w=600&q=80", description: "Cermin bulat.", badge: "", stock: 60, dimensions: "60cm diameter", material: "Kayu + Kaca", weight: "4kg" },
    { name: "Bar Stool", category: "kursi", price: 1800000, image: "https://images.unsplash.com/photo-1503602642458-232111445657?w=600&q=80", description: "Bar stool chrome.", badge: "", stock: 35, dimensions: "40x40x75cm", material: "Chrome Steel", weight: "5kg" },
    { name: "Side Table Marble", category: "meja", price: 2900000, image: "https://images.unsplash.com/photo-1532372576444-dda954194ad0?w=600&q=80", description: "Marmer + gold.", badge: "Hot", stock: 12, dimensions: "45x45x55cm", material: "Marmer + Metal", weight: "15kg" },
    { name: "Vas Keramik", category: "dekorasi", price: 650000, image: "https://images.unsplash.com/photo-1578500494198-246f612d3b3d?w=600&q=80", description: "Set 3 vas.", badge: "", stock: 80, dimensions: "15/20/25cm", material: "Keramik", weight: "2kg" },
  ];

  const insertMany = db.transaction((items) => {
    for (const item of items) insertProduct.run(item);
  });
  insertMany(products);

  // Seed categories
  db.exec(`
    INSERT INTO categories (name, slug, icon, description, image, sort_order) VALUES
    ('Sofa & Living', 'sofa', '🛋', 'Sofa, bean bag, dan furniture ruang tamu', 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80', 1),
    ('Kamar Tidur', 'bedroom', '🛏', 'Tempat tidur, lemari, dan meja rias', 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=600&q=80', 2),
    ('Ruang Makan', 'dining', '🍽', 'Meja makan, kursi, dan sideboard', 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=600&q=80', 3),
    ('Kursi', 'kursi', '🪑', 'Kursi makan, bar stool, recliner', 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=600&q=80', 4),
    ('Dekorasi', 'dekorasi', '✨', 'Lampu, cermin, vas, dan aksesoris', 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=600&q=80', 5);
  `);

  // Seed vouchers
  db.exec(`
    INSERT INTO vouchers (id, code, discount_type, discount_value, min_order, max_uses, valid_from, valid_until) VALUES
    ('v1', 'MEBEL5', 'percent', 5, 0, 200, '2025-01-01', '2025-12-31'),
    ('v2', 'HEMAT50K', 'fixed', 50000, 500000, 100, '2025-01-01', '2025-12-31'),
    ('v3', 'FIRST10', 'percent', 10, 1000000, 50, '2025-01-01', '2025-12-31'),
    ('v4', 'GOLD15', 'percent', 15, 2000000, 30, '2025-01-01', '2025-12-31');
  `);

  console.log('✅ Seeding complete!');
}

module.exports = db;