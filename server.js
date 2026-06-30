require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// ===== MIDDLEWARE =====
const adminAuth = (req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


// ===============================================================
//                          PRODUCTS
// ===============================================================
app.get('/api/products', (req, res) => {
  const { category, badge, search, sort, page = 1, limit = 50 } = req.query;
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (category) { query += ' AND category = ?'; params.push(category); }
  if (badge) { query += ' AND badge = ?'; params.push(badge); }
  if (search) { query += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  query += sort === 'price_asc' ? ' ORDER BY price ASC' : sort === 'price_desc' ? ' ORDER BY price DESC' : ' ORDER BY created_at DESC';

  const offset = (parseInt(page) - 1) * parseInt(limit);
  query += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  const products = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM products' + (category ? ' WHERE category = ?' : '')).get(...(category ? [category] : [])).count;

  res.json({ data: products, total, page: parseInt(page), limit: parseInt(limit) });
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const reviews = db.prepare('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC LIMIT 10').all(req.params.id);
  res.json({ ...product, reviews });
});

app.post('/api/products', adminAuth, (req, res) => {
  const p = req.body;
  const result = db.prepare(`
    INSERT INTO products (name, category, price, image, description, badge, stock, dimensions, material, weight)
    VALUES (@name, @category, @price, @image, @description, @badge, @stock, @dimensions, @material, @weight)
  `).run(p);
  res.status(201).json({ id: result.lastInsertRowid, ...p });
});

app.put('/api/products/:id', adminAuth, (req, res) => {
  const p = req.body;
  db.prepare(`
    UPDATE products SET name=@name, category=@category, price=@price, image=@image,
    description=@description, badge=@badge, stock=@stock, dimensions=@dimensions,
    material=@material, weight=@weight, updated_at=CURRENT_TIMESTAMP WHERE id=@id
  `).run({ ...p, id: req.params.id });
  res.json({ id: parseInt(req.params.id), ...p });
});

app.delete('/api/products/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

app.patch('/api/products/:id/stock', adminAuth, (req, res) => {
  const { stock } = req.body;
  db.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(stock, req.params.id);
  res.json({ id: parseInt(req.params.id), stock });
});


// ===============================================================
//                          ORDERS
// ===============================================================
app.post('/api/orders', (req, res) => {
  const { customer_name, customer_phone, customer_email, customer_address, customer_city, customer_notes, payment_method, items, member_id, voucher_code } = req.body;

  if (!customer_name || !customer_phone || !customer_address || !customer_city || !payment_method || !items?.length) {
    return res.status(400).json({ error: 'Data pesanan tidak lengkap' });
  }

  const orderId = 'MBL-' + Date.now().toString(36).toUpperCase().slice(-5) + uuidv4().slice(0, 4).toUpperCase();

  let subtotal = 0;
  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
    if (!product) return res.status(400).json({ error: `Produk ID ${item.product_id} tidak ditemukan` });
    if (product.stock < item.quantity) return res.status(400).json({ error: `${product.name} stok tidak cukup` });
    subtotal += product.price * item.quantity;
  }

  let discount = 0;
  if (voucher_code) {
    const voucher = db.prepare('SELECT * FROM vouchers WHERE code = ? AND is_active = 1').get(voucher_code);
    if (voucher && voucher.used_count < voucher.max_uses) {
      if (subtotal >= voucher.min_order) {
        discount = voucher.discount_type === 'percent' ? Math.floor(subtotal * voucher.discount_value / 100) : voucher.discount_value;
        db.prepare('UPDATE vouchers SET used_count = used_count + 1 WHERE code = ?').run(voucher_code);
      }
    }
  }

  const shipping_cost = 0; // Free ongkir
  const total = subtotal - discount + shipping_cost;

  const insertOrder = db.transaction(() => {
    db.prepare(`
      INSERT INTO orders (id, customer_name, customer_phone, customer_email, customer_address, customer_city, customer_notes, payment_method, subtotal, shipping_cost, discount, total, member_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, customer_name, customer_phone, customer_email || null, customer_address, customer_city, customer_notes || null, payment_method, subtotal, shipping_cost, discount, total, member_id || null);

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
      const itemSubtotal = product.price * item.quantity;
      insertItem.run(orderId, product.id, product.name, product.price, item.quantity, itemSubtotal);
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.quantity, item.product_id);
    }

    db.prepare('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)').run(orderId, 'created', 'Pesanan berhasil dibuat');
  });

  insertOrder();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

  res.status(201).json({
    success: true,
    order_id: orderId,
    ...order,
    items: orderItems,
    whatsapp_url: `https://wa.me/${process.env.WA_NUMBER}?text=${encodeURIComponent(
      `🛒 PESANAN BARU\n\n📋 Order: ${orderId}\n👤 ${customer_name}\n📱 ${customer_phone}\n📍 ${customer_address}, ${customer_city}\n💳 Bayar: ${payment_method}\n\n` +
      orderItems.map(i => `• ${i.product_name} x${i.quantity} = Rp ${(i.subtotal).toLocaleString('id-ID')}`).join('\n') +
      `\n\n💰 Total: Rp ${total.toLocaleString('id-ID')}`
    )}`
  });
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id.toUpperCase());
  if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id.toUpperCase());
  const history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC').all(req.params.id.toUpperCase());
  res.json({ ...order, items, status_history: history });
});

app.get('/api/orders', adminAuth, (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  let query = 'SELECT * FROM orders';
  const params = [];
  if (status) { query += ' WHERE order_status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  const orders = db.prepare(query).all(...params);
  res.json({ data: orders });
});

// Update order status
app.patch('/api/orders/:id/status', adminAuth, (req, res) => {
  const { status, note } = req.body;
  const validStatuses = ['created', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status tidak valid' });

  db.prepare('UPDATE orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id.toUpperCase());
  db.prepare('INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES (?, ?, ?, ?)').run(req.params.id.toUpperCase(), status, note || '', 'admin');

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id.toUpperCase());
  res.json({ success: true, order_id: req.params.id.toUpperCase(), status });
});


// ===============================================================
//                          MEMBERS
// ===============================================================
app.post('/api/members/register', (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Data tidak lengkap' });

  const existing = db.prepare('SELECT id FROM members WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email sudah terdaftar' });

  const id = uuidv4();
  db.prepare('INSERT INTO members (id, name, email, phone, password) VALUES (?, ?, ?, ?, ?)').run(id, name, email, phone || null, password);
  const member = db.prepare('SELECT id, name, email, phone, tier, points, total_spend, orders_count, vouchers_count, created_at FROM members WHERE id = ?').get(id);
  res.status(201).json(member);
});

app.post('/api/members/login', (req, res) => {
  const { email, password } = req.body;
  const member = db.prepare('SELECT * FROM members WHERE email = ? AND password = ?').get(email, password);
  if (!member) return res.status(401).json({ error: 'Email atau password salah' });
  const safe = db.prepare('SELECT id, name, email, phone, tier, points, total_spend, orders_count, vouchers_count, created_at FROM members WHERE id = ?').get(member.id);
  res.json(safe);
});

app.get('/api/members/:id', (req, res) => {
  const member = db.prepare('SELECT id, name, email, phone, tier, points, total_spend, orders_count, vouchers_count, created_at FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member tidak ditemukan' });
  const wishlist = db.prepare('SELECT w.*, p.name, p.price, p.image FROM wishlists w JOIN products p ON w.product_id = p.id WHERE w.member_id = ?').all(req.params.id);
  const orders = db.prepare('SELECT id, order_status, total, created_at FROM orders WHERE member_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ...member, wishlist, orders });
});

app.patch('/api/members/:id/tier', adminAuth, (req, res) => {
  db.prepare('UPDATE members SET tier = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.body.tier, req.params.id);
  res.json({ success: true });
});


// ===============================================================
//                          WISHLIST
// ===============================================================
app.post('/api/wishlist', (req, res) => {
  const { member_id, product_id } = req.body;
  try {
    db.prepare('INSERT INTO wishlists (member_id, product_id) VALUES (?, ?)').run(member_id, product_id);
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Sudah di wishlist' });
  }
});

app.delete('/api/wishlist', (req, res) => {
  const { member_id, product_id } = req.body;
  db.prepare('DELETE FROM wishlists WHERE member_id = ? AND product_id = ?').run(member_id, product_id);
  res.json({ deleted: true });
});


// ===============================================================
//                          REVIEWS
// ===============================================================
app.post('/api/reviews', (req, res) => {
  const { product_id, member_id, member_name, rating, comment } = req.body;
  if (!product_id || !rating) return res.status(400).json({ error: 'Data tidak lengkap' });
  db.prepare('INSERT INTO reviews (product_id, member_id, member_name, rating, comment) VALUES (?, ?, ?, ?, ?)').run(product_id, member_id || null, member_name, rating, comment || null);
  res.status(201).json({ success: true });
});


// ===============================================================
//                          VOUCHERS
// ===============================================================
app.get('/api/vouchers', (req, res) => {
  const vouchers = db.prepare('SELECT * FROM vouchers WHERE is_active = 1').all();
  res.json(vouchers);
});

app.post('/api/vouchers/validate', (req, res) => {
  const { code, subtotal } = req.body;        