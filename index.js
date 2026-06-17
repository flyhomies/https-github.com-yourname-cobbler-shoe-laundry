const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'cobbler-shoe-laundry-secret-key-2024';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'cobbler.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backup');
const LOGO_PATH = path.join(__dirname, 'Cobbler Logo_page-0001.jpg');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
    process.exit(1);
  }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

function isFilled(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function validateRequiredFields(fields, data) {
  return fields.filter((field) => !isFilled(data[field]));
}

async function ensureColumn(tableName, columnName, columnDefinition) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

async function logActivity(userId, username, action, tableName, recordId, oldData, newData, ip, userAgent) {
  try {
    await run(
      `INSERT INTO activity_logs (
        user_id, username, action, table_name, record_id,
        old_data, new_data, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        username || 'System',
        action,
        tableName || null,
        recordId || null,
        oldData ? JSON.stringify(oldData) : null,
        newData ? JSON.stringify(newData) : null,
        ip || null,
        userAgent || null,
      ]
    );
  } catch (error) {
    console.error('Activity log error:', error.message);
  }
}

async function initializeDatabase() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'staff',
    pin TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    address TEXT,
    email TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await ensureColumn('customers', 'category', "TEXT DEFAULT 'Regular'");
  await ensureColumn('customers', 'profile_photo', 'TEXT');
  await ensureColumn('customers', 'company_name', 'TEXT');

  await run(`CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    price REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    date TEXT NOT NULL,
    customer_id INTEGER,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )`);

  await ensureColumn('invoices', 'before_service_photos', 'TEXT');
  await ensureColumn('invoices', 'after_service_photos', 'TEXT');

  await run(`CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    rate REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT NOT NULL UNIQUE,
    invoice_id INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    amount_received REAL NOT NULL,
    balance_amount REAL NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
  )`);

  await ensureColumn('receipts', 'receipt_photos', 'TEXT');

  await run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    table_name TEXT,
    record_id INTEGER,
    old_data TEXT,
    new_data TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  const adminUser = await get('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!adminUser) {
    const passwordHash = await bcrypt.hash('111606', 10);
    await run(
      'INSERT INTO users (username, password, role, pin) VALUES (?, ?, ?, ?)',
      ['admin', passwordHash, 'admin', '111606']
    );
  }

  const defaultServices = [
    ['Deep Clean', 249],
    ['Premium Care', 349],
    ['Lather Care', 349],
    ['Premium Lather Care', 499],
  ];

  for (const [name, price] of defaultServices) {
    await run('INSERT OR IGNORE INTO services (name, price) VALUES (?, ?)', [name, price]);
  }
}

function asyncHandler(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error('Unhandled route error:', error);
      const statusCode = error && error.code === 'SQLITE_CONSTRAINT' ? 409 : 500;
      res.status(statusCode).json({ message: error.message || 'Server error' });
    });
  };
}

app.get('/assets/logo', (_req, res) => {
  res.sendFile(LOGO_PATH);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { username, password, pin } = req.body;
  const missingFields = validateRequiredFields(['username', 'password'], req.body);

  if (missingFields.length > 0) {
    return res.status(400).json({ message: 'Missing required fields', fields: missingFields });
  }

  const user = await get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) {
    await logActivity(null, username, 'LOGIN_FAILED', 'users', null, null, null, req.ip, req.headers['user-agent']);
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    await logActivity(null, username, 'LOGIN_FAILED', 'users', user.id, null, null, req.ip, req.headers['user-agent']);
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  if (isFilled(user.pin) && isFilled(pin) && pin !== user.pin) {
    await logActivity(user.id, username, 'PIN_FAILED', 'users', user.id, null, null, req.ip, req.headers['user-agent']);
    return res.status(400).json({ message: 'Invalid PIN' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  await logActivity(user.id, username, 'LOGIN', 'users', user.id, null, null, req.ip, req.headers['user-agent']);

  const { password: _password, pin: _pin, ...safeUser } = user;
  res.json({ token, user: safeUser });
}));

app.get('/api/customers', asyncHandler(async (_req, res) => {
  const customers = await all('SELECT * FROM customers ORDER BY id DESC');
  res.json(customers);
}));

app.get('/api/customers/:id', asyncHandler(async (req, res) => {
  const customer = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  const invoices = await all('SELECT * FROM invoices WHERE customer_id = ? ORDER BY id DESC', [req.params.id]);
  const totalSpent = invoices
    .filter((invoice) => invoice.status === 'completed')
    .reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);

  res.json({ ...customer, invoices, totalSpent });
}));

app.post('/api/customers', asyncHandler(async (req, res) => {
  const { name, mobile, address, email, notes, category, profilePhoto, companyName } = req.body;
  const missingFields = validateRequiredFields(['name', 'mobile'], req.body);

  if (missingFields.length > 0) {
    return res.status(400).json({ message: 'Missing required fields', fields: missingFields });
  }

  const seq = await get('SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM customers');
  const customerId = `CUST${String(seq.nextId).padStart(4, '0')}`;

  const result = await run(
    `INSERT INTO customers (
      customer_id, name, mobile, address, email, notes, category, profile_photo, company_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customerId,
      name,
      mobile,
      address || null,
      email || null,
      notes || null,
      category || 'Regular',
      profilePhoto || null,
      companyName || null,
    ]
  );

  const newCustomer = await get('SELECT * FROM customers WHERE id = ?', [result.lastID]);
  await logActivity(null, 'System', 'CREATE', 'customers', result.lastID, null, newCustomer, req.ip, req.headers['user-agent']);
  res.status(201).json(newCustomer);
}));

app.put('/api/customers/:id', asyncHandler(async (req, res) => {
  const { name, mobile, address, email, notes, category, profilePhoto, companyName } = req.body;
  const oldCustomer = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);

  if (!oldCustomer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  const updated = {
    name: isFilled(name) ? name : oldCustomer.name,
    mobile: isFilled(mobile) ? mobile : oldCustomer.mobile,
    address: address !== undefined ? address : oldCustomer.address,
    email: email !== undefined ? email : oldCustomer.email,
    notes: notes !== undefined ? notes : oldCustomer.notes,
    category: isFilled(category) ? category : oldCustomer.category,
    profile_photo: profilePhoto !== undefined ? profilePhoto : oldCustomer.profile_photo,
    company_name: companyName !== undefined ? companyName : oldCustomer.company_name,
  };

  await run(
    `UPDATE customers
     SET name = ?, mobile = ?, address = ?, email = ?, notes = ?,
         category = ?, profile_photo = ?, company_name = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      updated.name,
      updated.mobile,
      updated.address,
      updated.email,
      updated.notes,
      updated.category,
      updated.profile_photo,
      updated.company_name,
      req.params.id,
    ]
  );

  const newCustomer = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  await logActivity(null, 'System', 'UPDATE', 'customers', Number(req.params.id), oldCustomer, newCustomer, req.ip, req.headers['user-agent']);
  res.json({ message: 'Customer updated', customer: newCustomer });
}));

app.delete('/api/customers/:id', asyncHandler(async (req, res) => {
  const oldCustomer = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!oldCustomer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  await run('DELETE FROM customers WHERE id = ?', [req.params.id]);
  await logActivity(null, 'System', 'DELETE', 'customers', Number(req.params.id), oldCustomer, null, req.ip, req.headers['user-agent']);
  res.json({ message: 'Customer deleted' });
}));

app.get('/api/services', asyncHandler(async (_req, res) => {
  const services = await all('SELECT * FROM services ORDER BY id');
  res.json(services);
}));

app.get('/api/invoices', asyncHandler(async (_req, res) => {
  const invoices = await all(
    `SELECT i.*, c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     ORDER BY i.id DESC`
  );
  res.json(invoices);
}));

app.get('/api/invoices/:id', asyncHandler(async (req, res) => {
  const invoice = await get(
    `SELECT i.*, c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     WHERE i.id = ?`,
    [req.params.id]
  );

  if (!invoice) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  const items = await all(
    `SELECT ii.*, s.name AS service_name
     FROM invoice_items ii
     JOIN services s ON ii.service_id = s.id
     WHERE ii.invoice_id = ?`,
    [req.params.id]
  );

  res.json({ ...invoice, items });
}));

app.post('/api/invoices', asyncHandler(async (req, res) => {
  const { customer_id, date, items, discount, tax, notes, beforeServicePhotos, afterServicePhotos } = req.body;
  const missingFields = validateRequiredFields(['date', 'items'], req.body);

  if (missingFields.length > 0 || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: 'Missing required fields',
      fields: !Array.isArray(items) || items.length === 0 ? [...missingFields, 'items'] : missingFields,
    });
  }

  const seq = await get('SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM invoices');
  const invoiceNumber = `INV${String(seq.nextId).padStart(6, '0')}`;

  const normalizedDiscount = Number(discount || 0);
  const normalizedTax = Number(tax || 0);
  const subtotal = items.reduce((sum, item) => sum + Number(item.rate || 0) * Number(item.quantity || 0), 0);
  const discountAmount = (subtotal * normalizedDiscount) / 100;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = (taxableAmount * normalizedTax) / 100;
  const total = taxableAmount + taxAmount;

  const result = await run(
    `INSERT INTO invoices (
      invoice_number, date, customer_id, discount, tax, total, status, notes,
      before_service_photos, after_service_photos
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoiceNumber,
      date,
      customer_id || null,
      normalizedDiscount,
      normalizedTax,
      total,
      'pending',
      notes || null,
      JSON.stringify(beforeServicePhotos || []),
      JSON.stringify(afterServicePhotos || []),
    ]
  );

  for (const item of items) {
    await run(
      'INSERT INTO invoice_items (invoice_id, service_id, quantity, rate) VALUES (?, ?, ?, ?)',
      [result.lastID, item.service_id, Number(item.quantity || 0), Number(item.rate || 0)]
    );
  }

  const newInvoice = await get('SELECT * FROM invoices WHERE id = ?', [result.lastID]);
  await logActivity(null, 'System', 'CREATE', 'invoices', result.lastID, null, newInvoice, req.ip, req.headers['user-agent']);
  res.status(201).json(newInvoice);
}));

app.put('/api/invoices/:id/status', asyncHandler(async (req, res) => {
  const { status, beforeServicePhotos, afterServicePhotos } = req.body;
  const oldInvoice = await get('SELECT * FROM invoices WHERE id = ?', [req.params.id]);

  if (!oldInvoice) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  const nextStatus = isFilled(status) ? status : oldInvoice.status;
  const nextBeforePhotos = beforeServicePhotos !== undefined
    ? JSON.stringify(beforeServicePhotos || [])
    : oldInvoice.before_service_photos;
  const nextAfterPhotos = afterServicePhotos !== undefined
    ? JSON.stringify(afterServicePhotos || [])
    : oldInvoice.after_service_photos;

  await run(
    `UPDATE invoices
     SET status = ?, before_service_photos = ?, after_service_photos = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [nextStatus, nextBeforePhotos, nextAfterPhotos, req.params.id]
  );

  const newInvoice = await get('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
  await logActivity(null, 'System', 'UPDATE_STATUS', 'invoices', Number(req.params.id), oldInvoice, newInvoice, req.ip, req.headers['user-agent']);
  res.json({ message: 'Invoice updated', invoice: newInvoice });
}));

app.get('/api/receipts', asyncHandler(async (_req, res) => {
  const receipts = await all(
    `SELECT r.*, i.invoice_number, c.name AS customer_name
     FROM receipts r
     JOIN invoices i ON r.invoice_id = i.id
     LEFT JOIN customers c ON i.customer_id = c.id
     ORDER BY r.id DESC`
  );
  res.json(receipts);
}));

app.post('/api/receipts', asyncHandler(async (req, res) => {
  const { invoice_id, payment_method, amount_received, balance_amount, notes, receiptPhotos } = req.body;
  const missingFields = validateRequiredFields(['invoice_id', 'payment_method', 'amount_received'], req.body);

  if (missingFields.length > 0) {
    return res.status(400).json({ message: 'Missing required fields', fields: missingFields });
  }

  const seq = await get('SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM receipts');
  const receiptNumber = `RCP${String(seq.nextId).padStart(6, '0')}`;

  const result = await run(
    `INSERT INTO receipts (
      receipt_number, invoice_id, payment_method, amount_received, balance_amount, notes, receipt_photos
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      receiptNumber,
      invoice_id,
      payment_method,
      Number(amount_received),
      Number(balance_amount || 0),
      notes || null,
      JSON.stringify(receiptPhotos || []),
    ]
  );

  const newReceipt = await get('SELECT * FROM receipts WHERE id = ?', [result.lastID]);
  await logActivity(null, 'System', 'CREATE', 'receipts', result.lastID, null, newReceipt, req.ip, req.headers['user-agent']);
  res.status(201).json(newReceipt);
}));

app.get('/api/expenses', asyncHandler(async (_req, res) => {
  const expenses = await all('SELECT * FROM expenses ORDER BY date DESC, id DESC');
  res.json(expenses);
}));

app.post('/api/expenses', asyncHandler(async (req, res) => {
  const { category, description, amount, date } = req.body;
  const missingFields = validateRequiredFields(['category', 'amount', 'date'], req.body);

  if (missingFields.length > 0) {
    return res.status(400).json({ message: 'Missing required fields', fields: missingFields });
  }

  const result = await run(
    'INSERT INTO expenses (category, description, amount, date) VALUES (?, ?, ?, ?)',
    [category, description || null, Number(amount), date]
  );

  const newExpense = await get('SELECT * FROM expenses WHERE id = ?', [result.lastID]);
  await logActivity(null, 'System', 'CREATE', 'expenses', result.lastID, null, newExpense, req.ip, req.headers['user-agent']);
  res.status(201).json(newExpense);
}));

app.put('/api/expenses/:id', asyncHandler(async (req, res) => {
  const { category, description, amount, date } = req.body;
  const oldExpense = await get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);

  if (!oldExpense) {
    return res.status(404).json({ message: 'Expense not found' });
  }

  const updated = {
    category: isFilled(category) ? category : oldExpense.category,
    description: description !== undefined ? description : oldExpense.description,
    amount: amount !== undefined ? Number(amount) : oldExpense.amount,
    date: isFilled(date) ? date : oldExpense.date,
  };

  await run(
    `UPDATE expenses
     SET category = ?, description = ?, amount = ?, date = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [updated.category, updated.description, updated.amount, updated.date, req.params.id]
  );

  const newExpense = await get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
  await logActivity(null, 'System', 'UPDATE', 'expenses', Number(req.params.id), oldExpense, newExpense, req.ip, req.headers['user-agent']);
  res.json({ message: 'Expense updated', expense: newExpense });
}));

app.delete('/api/expenses/:id', asyncHandler(async (req, res) => {
  const oldExpense = await get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
  if (!oldExpense) {
    return res.status(404).json({ message: 'Expense not found' });
  }

  await run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
  await logActivity(null, 'System', 'DELETE', 'expenses', Number(req.params.id), oldExpense, null, req.ip, req.headers['user-agent']);
  res.json({ message: 'Expense deleted' });
}));

app.get('/api/dashboard', asyncHandler(async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [
    todaySalesRow,
    monthlySalesRow,
    totalCustomersRow,
    vipCustomersRow,
    newCustomersRow,
    pendingOrdersRow,
    completedOrdersRow,
    recentBills,
    serviceRevenue,
    customerPhotos,
    recentCustomerActivity,
  ] = await Promise.all([
    get("SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE date = ? AND status = 'completed'", [today]),
    get("SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE date >= ? AND status = 'completed'", [firstDayOfMonth]),
    get('SELECT COUNT(*) AS count FROM customers'),
    get("SELECT COUNT(*) AS count FROM customers WHERE category = 'VIP'"),
    get('SELECT COUNT(*) AS count FROM customers WHERE date(created_at) = ?', [today]),
    get("SELECT COUNT(*) AS count FROM invoices WHERE status = 'pending'"),
    get("SELECT COUNT(*) AS count FROM invoices WHERE status = 'completed'"),
    all(
      `SELECT i.*, c.name AS customer_name
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id
       ORDER BY i.id DESC
       LIMIT 5`
    ),
    all(
      `SELECT s.name, COALESCE(SUM(ii.quantity * ii.rate), 0) AS revenue
       FROM services s
       LEFT JOIN invoice_items ii ON s.id = ii.service_id
       LEFT JOIN invoices i ON ii.invoice_id = i.id
       WHERE i.id IS NULL OR (i.date >= ? AND i.status = 'completed')
       GROUP BY s.id, s.name
       ORDER BY s.id`,
      [firstDayOfMonth]
    ),
    all('SELECT * FROM customers ORDER BY id DESC LIMIT 12'),
    all("SELECT * FROM activity_logs WHERE table_name = 'customers' ORDER BY id DESC LIMIT 5"),
  ]);

  res.json({
    todaySales: Number(todaySalesRow.total || 0),
    monthlySales: Number(monthlySalesRow.total || 0),
    totalCustomers: Number(totalCustomersRow.count || 0),
    vipCustomers: Number(vipCustomersRow.count || 0),
    newCustomersToday: Number(newCustomersRow.count || 0),
    pendingOrders: Number(pendingOrdersRow.count || 0),
    completedOrders: Number(completedOrdersRow.count || 0),
    recentBills,
    serviceRevenue,
    customerPhotos,
    recentCustomerActivity,
  });
}));

app.get('/api/activity-logs', asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 200;
  const logs = await all('SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?', [limit]);
  res.json(logs);
}));

app.post('/api/backup', asyncHandler(async (_req, res) => {
  const backupPath = path.join(BACKUP_DIR, `cobbler_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  fs.copyFileSync(DB_PATH, backupPath);
  res.json({ message: 'Backup created', path: backupPath });
}));

const INDEX_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>COBBLER SHOE LAUNDRY</title>\n  <link rel=\"icon\" href=\"/assets/logo\">\n  <script src=\"https://cdn.tailwindcss.com\"></script>\n  <style>\n    @media print {\n      .no-print { display: none !important; }\n      body { background: #fff !important; }\n      #app { padding: 0 !important; }\n    }\n    .spinner {\n      width: 26px;\n      height: 26px;\n      border: 3px solid #dbeafe;\n      border-top-color: #2563eb;\n      border-radius: 9999px;\n      animation: spin 0.9s linear infinite;\n    }\n    @keyframes spin {\n      to { transform: rotate(360deg); }\n    }\n  </style>\n</head>\n<body class=\"bg-slate-100 text-slate-900\">\n  <div id=\"app\"></div>\n  <div id=\"modal-root\"></div>\n\n  <script>\n    const BRAND_LOGO = '/assets/logo';\n\n    const state = {\n      user: null,\n      activeTab: 'overview',\n      loading: false,\n      dashboard: null,\n      customers: [],\n      invoices: [],\n      receipts: [],\n      expenses: [],\n      services: [],\n      activityLogs: [],\n      selectedCustomer: null,\n      selectedInvoice: null,\n    };\n\n    function currency(value) {\n      return `Rs ${Number(value || 0).toFixed(2)}`;\n    }\n\n    function formatDateTime(value) {\n      if (!value) return '-';\n      return new Date(value).toLocaleString();\n    }\n\n    function photoList(value) {\n      if (!value) return [];\n      if (Array.isArray(value)) return value;\n      try {\n        return JSON.parse(value);\n      } catch {\n        return [];\n      }\n    }\n\n    async function toBase64(file) {\n      return new Promise((resolve, reject) => {\n        const reader = new FileReader();\n        reader.onload = () => resolve(reader.result);\n        reader.onerror = reject;\n        reader.readAsDataURL(file);\n      });\n    }\n\n    async function readFiles(files) {\n      return Promise.all(Array.from(files || []).map((file) => toBase64(file)));\n    }\n\n    async function api(url, options = {}) {\n      const requestOptions = { ...options };\n      const headers = { ...(requestOptions.headers || {}) };\n      if (requestOptions.body && !headers['Content-Type']) {\n        headers['Content-Type'] = 'application/json';\n      }\n\n      const response = await fetch(url, {\n        ...requestOptions,\n        headers,\n      });\n\n      const rawBody = await response.text();\n      let data = null;\n      try {\n        data = rawBody ? JSON.parse(rawBody) : null;\n      } catch {\n        data = null;\n      }\n\n      if (!response.ok) {\n        throw new Error((data && data.message) || rawBody || `Request failed (${response.status})`);\n      }\n\n      return data;\n    }\n\n    function setLoading(value) {\n      state.loading = value;\n      render();\n    }\n\n    async function loadInitialData() {\n      setLoading(true);\n      try {\n        const [dashboard, customers, invoices, receipts, expenses, services, activityLogs] = await Promise.all([\n          api('/api/dashboard'),\n          api('/api/customers'),\n          api('/api/invoices'),\n          api('/api/receipts'),\n          api('/api/expenses'),\n          api('/api/services'),\n          api('/api/activity-logs'),\n        ]);\n\n        state.dashboard = dashboard;\n        state.customers = customers;\n        state.invoices = invoices;\n        state.receipts = receipts;\n        state.expenses = expenses;\n        state.services = services;\n        state.activityLogs = activityLogs;\n      } finally {\n        state.loading = false;\n      }\n      render();\n    }\n\n    function closeModal() {\n      document.getElementById('modal-root').innerHTML = '';\n    }\n\n    function openModal(content) {\n      document.getElementById('modal-root').innerHTML = `\n        <div class=\"fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4\">\n          <div class=\"max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white shadow-2xl\">\n            ${content}\n          </div>\n        </div>\n      `;\n    }\n\n    function avatar(customer, size = 'h-12 w-12') {\n      if (customer.profile_photo) {\n        return `<img src=\"${customer.profile_photo}\" class=\"${size} rounded-full object-cover ring-2 ring-slate-200\">`;\n      }\n      const letter = (customer.name || '?').charAt(0).toUpperCase();\n      return `<div class=\"${size} rounded-full bg-blue-600 text-white flex items-center justify-center font-bold ring-2 ring-slate-200\">${letter}</div>`;\n    }\n\n    function categoryBadge(category) {\n      const map = {\n        VIP: 'bg-amber-100 text-amber-700',\n        Corporate: 'bg-sky-100 text-sky-700',\n        Regular: 'bg-slate-100 text-slate-700',\n      };\n      const cls = map[category] || map.Regular;\n      return `<span class=\"rounded-full px-2.5 py-1 text-xs font-medium ${cls}\">${category || 'Regular'}</span>`;\n    }\n\n    function brandLogo(size = 'h-32', extraClasses = '') {\n      return `<img src=\"${BRAND_LOGO}\" alt=\"Cobbler logo\" class=\"${size} w-auto object-contain ${extraClasses}\">`;\n    }\n\n    function renderLogin() {\n      return `\n        <div class=\"flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 p-6\">\n          <div class=\"w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl\">\n            <div class=\"mb-8 text-center\">\n              <div class=\"flex justify-center\">${brandLogo('h-40')}</div>\n              <div class=\"mt-4 text-sm text-slate-500\">Shoe Laundry Billing and Accounts</div>\n            </div>\n            <form id=\"login-form\" class=\"space-y-4\">\n              <div>\n                <label for=\"login-username\" class=\"mb-1 block text-sm font-medium text-slate-700\">Username</label>\n                <input id=\"login-username\" name=\"username\" autocomplete=\"username\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500\" value=\"admin\" required>\n              </div>\n              <div>\n                <label for=\"login-password\" class=\"mb-1 block text-sm font-medium text-slate-700\">Password</label>\n                <input id=\"login-password\" name=\"password\" autocomplete=\"current-password\" type=\"password\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500\" value=\"111606\" required>\n              </div>\n              <div>\n                <label for=\"login-pin\" class=\"mb-1 block text-sm font-medium text-slate-700\">PIN</label>\n                <input id=\"login-pin\" name=\"pin\" autocomplete=\"one-time-code\" type=\"password\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500\" placeholder=\"Optional\">\n              </div>\n              <div id=\"login-error\" class=\"hidden rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700\"></div>\n              <button class=\"w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700\">Login</button>\n            </form>\n          </div>\n        </div>\n      `;\n    }\n\n    function renderStats() {\n      const dashboard = state.dashboard || {};\n      const cards = [\n        ['Today Sales', currency(dashboard.todaySales)],\n        ['Monthly Sales', currency(dashboard.monthlySales)],\n        ['Total Customers', dashboard.totalCustomers || 0],\n        ['VIP Customers', dashboard.vipCustomers || 0],\n        ['New Today', dashboard.newCustomersToday || 0],\n        ['Pending Orders', dashboard.pendingOrders || 0],\n        ['Completed Orders', dashboard.completedOrders || 0],\n      ];\n\n      return `\n        <div class=\"grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7\">\n          ${cards.map(([label, value]) => `\n            <div class=\"rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200\">\n              <div class=\"text-xs font-medium uppercase tracking-wide text-slate-500\">${label}</div>\n              <div class=\"mt-3 text-3xl font-bold leading-none text-slate-900\">${value}</div>\n            </div>\n          `).join('')}\n        </div>\n      `;\n    }\n\n    function renderOverview() {\n      const dashboard = state.dashboard || {};\n      return `\n        <div class=\"space-y-6\">\n          ${renderStats()}\n          <div class=\"grid gap-6 xl:grid-cols-3\">\n            <div class=\"rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 xl:col-span-2\">\n              <div class=\"mb-4 flex items-center justify-between\">\n                <h2 class=\"text-lg font-semibold\">Customer Photos</h2>\n                <span class=\"text-sm text-slate-500\">Latest 12</span>\n              </div>\n              <div class=\"grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6\">\n                ${(dashboard.customerPhotos || []).map((customer) => `\n                  <button onclick=\"viewCustomer(${customer.id})\" class=\"min-h-[136px] rounded-2xl border border-slate-200 p-3 text-center hover:border-blue-500 hover:bg-blue-50\">\n                    <div class=\"mx-auto mb-2 flex justify-center\">${avatar(customer, 'h-16 w-16')}</div>\n                    <div class=\"truncate text-sm font-medium\">${customer.name}</div>\n                    <div class=\"mt-1\">${categoryBadge(customer.category)}</div>\n                  </button>\n                `).join('') || '<div class=\"col-span-full text-sm text-slate-500\">No customers yet.</div>'}\n              </div>\n            </div>\n            <div class=\"rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200\">\n              <h2 class=\"mb-4 text-lg font-semibold\">Recent Customer Activity</h2>\n              <div class=\"space-y-3\">\n                ${(dashboard.recentCustomerActivity || []).map((item) => `\n                  <div class=\"rounded-xl bg-slate-50 p-3\">\n                    <div class=\"font-medium text-slate-800\">${item.action}</div>\n                    <div class=\"mt-1 text-sm text-slate-500\">${formatDateTime(item.created_at)}</div>\n                  </div>\n                `).join('') || '<div class=\"text-sm text-slate-500\">No activity found.</div>'}\n              </div>\n            </div>\n          </div>\n          <div class=\"grid gap-6 xl:grid-cols-2\">\n            <div class=\"rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200\">\n              <h2 class=\"mb-4 text-lg font-semibold\">Recent Bills</h2>\n              <div class=\"space-y-3\">\n                ${(dashboard.recentBills || []).map((bill) => `\n                  <button onclick=\"viewInvoice(${bill.id})\" class=\"flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50\">\n                    <div>\n                      <div class=\"font-medium\">${bill.invoice_number}</div>\n                      <div class=\"text-sm text-slate-500\">${bill.customer_name || 'Walk-in'} • ${bill.date}</div>\n                    </div>\n                    <div class=\"text-right\">\n                      <div class=\"font-semibold\">${currency(bill.total)}</div>\n                      <div class=\"text-xs text-slate-500\">${bill.status}</div>\n                    </div>\n                  </button>\n                `).join('') || '<div class=\"text-sm text-slate-500\">No invoices yet.</div>'}\n              </div>\n            </div>\n            <div class=\"rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200\">\n              <h2 class=\"mb-4 text-lg font-semibold\">Service Revenue</h2>\n              <div class=\"space-y-3\">\n                ${(dashboard.serviceRevenue || []).map((row) => `\n                  <div class=\"flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3\">\n                    <div class=\"font-medium\">${row.name}</div>\n                    <div class=\"font-semibold\">${currency(row.revenue)}</div>\n                  </div>\n                `).join('') || '<div class=\"text-sm text-slate-500\">No service revenue yet.</div>'}\n              </div>\n            </div>\n          </div>\n        </div>\n      `;\n    }\n\n    function renderCustomers() {\n      return `\n        <div class=\"space-y-6\">\n          <div class=\"flex items-center justify-between\">\n            <div>\n              <h1 class=\"text-2xl font-bold\">Customers</h1>\n              <p class=\"text-sm text-slate-500\">Manage categories, profile photos, and customer history.</p>\n            </div>\n            <button onclick=\"openCustomerModal()\" class=\"rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700\">Add Customer</button>\n          </div>\n          <div class=\"overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200\">\n            <div class=\"overflow-x-auto\">\n              <table class=\"min-w-full text-sm\">\n                <thead class=\"bg-slate-50 text-left text-slate-500\">\n                  <tr>\n                    <th class=\"px-5 py-4 font-medium\">Photo</th>\n                    <th class=\"px-5 py-4 font-medium\">Customer</th>\n                    <th class=\"px-5 py-4 font-medium\">Category</th>\n                    <th class=\"px-5 py-4 font-medium\">Mobile</th>\n                    <th class=\"px-5 py-4 font-medium\">Company</th>\n                    <th class=\"px-5 py-4 font-medium\">Actions</th>\n                  </tr>\n                </thead>\n                <tbody class=\"divide-y divide-slate-200\">\n                  ${state.customers.map((customer) => `\n                    <tr class=\"hover:bg-slate-50\">\n                      <td class=\"px-5 py-4\">${avatar(customer)}</td>\n                      <td class=\"px-5 py-4\">\n                        <button onclick=\"viewCustomer(${customer.id})\" class=\"text-left\">\n                          <div class=\"font-medium text-slate-900\">${customer.name}</div>\n                          <div class=\"text-slate-500\">${customer.customer_id}</div>\n                        </button>\n                      </td>\n                      <td class=\"px-5 py-4\">${categoryBadge(customer.category)}</td>\n                      <td class=\"px-5 py-4\">${customer.mobile || '-'}</td>\n                      <td class=\"px-5 py-4\">${customer.company_name || '-'}</td>\n                      <td class=\"px-5 py-4\">\n                        <div class=\"flex gap-3\">\n                          <button onclick=\"openCustomerModal(${customer.id})\" class=\"text-blue-600 hover:text-blue-800\">Edit</button>\n                          <button onclick=\"removeCustomer(${customer.id})\" class=\"text-red-600 hover:text-red-800\">Delete</button>\n                        </div>\n                      </td>\n                    </tr>\n                  `).join('') || '<tr><td colspan=\"6\" class=\"px-5 py-8 text-center text-slate-500\">No customers added.</td></tr>'}\n                </tbody>\n              </table>\n            </div>\n          </div>\n        </div>\n      `;\n    }\n\n    function renderBilling() {\n      return `\n        <div class=\"space-y-6\">\n          <div class=\"flex items-center justify-between\">\n            <div>\n              <h1 class=\"text-2xl font-bold\">Billing</h1>\n              <p class=\"text-sm text-slate-500\">Create invoices, attach before and after photos, and print bills.</p>\n            </div>\n            <button onclick=\"openInvoiceModal()\" class=\"rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700\">Create Invoice</button>\n          </div>\n          <div class=\"overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200\">\n            <div class=\"overflow-x-auto\">\n              <table class=\"min-w-full text-sm\">\n                <thead class=\"bg-slate-50 text-left text-slate-500\">\n                  <tr>\n                    <th class=\"px-5 py-4 font-medium\">Invoice</th>\n                    <th class=\"px-5 py-4 font-medium\">Date</th>\n                    <th class=\"px-5 py-4 font-medium\">Customer</th>\n                    <th class=\"px-5 py-4 font-medium\">Total</th>\n                    <th class=\"px-5 py-4 font-medium\">Status</th>\n                    <th class=\"px-5 py-4 font-medium\">Actions</th>\n                  </tr>\n                </thead>\n                <tbody class=\"divide-y divide-slate-200\">\n                  ${state.invoices.map((invoice) => `\n                    <tr class=\"hover:bg-slate-50\">\n                      <td class=\"px-5 py-4 font-medium\">${invoice.invoice_number}</td>\n                      <td class=\"px-5 py-4\">${invoice.date}</td>\n                      <td class=\"px-5 py-4\">${invoice.customer_name || 'Walk-in'}</td>\n                      <td class=\"px-5 py-4\">${currency(invoice.total)}</td>\n                      <td class=\"px-5 py-4\">${categoryBadge(invoice.status === 'completed' ? 'VIP' : 'Regular').replace('VIP', invoice.status)}</td>\n                      <td class=\"px-5 py-4\">\n                        <div class=\"flex gap-3\">\n                          <button onclick=\"viewInvoice(${invoice.id})\" class=\"text-blue-600 hover:text-blue-800\">View</button>\n                          ${invoice.status === 'pending' ? `<button onclick=\"markInvoiceCompleted(${invoice.id})\" class=\"text-emerald-600 hover:text-emerald-800\">Complete</button>` : ''}\n                        </div>\n                      </td>\n                    </tr>\n                  `).join('') || '<tr><td colspan=\"6\" class=\"px-5 py-8 text-center text-slate-500\">No invoices created.</td></tr>'}\n                </tbody>\n              </table>\n            </div>\n          </div>\n        </div>\n      `;\n    }\n\n    function renderReceipts() {\n      return `\n        <div class=\"space-y-6\">\n          <div>\n            <h1 class=\"text-2xl font-bold\">Receipts</h1>\n            <p class=\"text-sm text-slate-500\">Create receipts and attach receipt photos.</p>\n          </div>\n          <div class=\"overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200\">\n            <div class=\"overflow-x-auto\">\n              <table class=\"min-w-full text-sm\">\n                <thead class=\"bg-slate-50 text-left text-slate-500\">\n                  <tr>\n                    <th class=\"px-5 py-4 font-medium\">Receipt</th>\n                    <th class=\"px-5 py-4 font-medium\">Invoice</th>\n                    <th class=\"px-5 py-4 font-medium\">Customer</th>\n                    <th class=\"px-5 py-4 font-medium\">Payment</th>\n                    <th class=\"px-5 py-4 font-medium\">Amount</th>\n                  </tr>\n                </thead>\n                <tbody class=\"divide-y divide-slate-200\">\n                  ${state.receipts.map((receipt) => `\n                    <tr>\n                      <td class=\"px-5 py-4 font-medium\">${receipt.receipt_number}</td>\n                      <td class=\"px-5 py-4\">${receipt.invoice_number}</td>\n                      <td class=\"px-5 py-4\">${receipt.customer_name || 'Walk-in'}</td>\n                      <td class=\"px-5 py-4\">${receipt.payment_method}</td>\n                      <td class=\"px-5 py-4\">${currency(receipt.amount_received)}</td>\n                    </tr>\n                  `).join('') || '<tr><td colspan=\"5\" class=\"px-5 py-8 text-center text-slate-500\">No receipts created.</td></tr>'}\n                </tbody>\n              </table>\n            </div>\n          </div>\n          <div class=\"overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200\">\n            <div class=\"border-b border-slate-200 px-5 py-4\">\n              <h2 class=\"font-semibold\">Create Receipt From Invoice</h2>\n            </div>\n            <div class=\"overflow-x-auto\">\n              <table class=\"min-w-full text-sm\">\n                <thead class=\"bg-slate-50 text-left text-slate-500\">\n                  <tr>\n                    <th class=\"px-5 py-4 font-medium\">Invoice</th>\n                    <th class=\"px-5 py-4 font-medium\">Customer</th>\n                    <th class=\"px-5 py-4 font-medium\">Amount</th>\n                    <th class=\"px-5 py-4 font-medium\">Action</th>\n                  </tr>\n                </thead>\n                <tbody class=\"divide-y divide-slate-200\">\n                  ${state.invoices.map((invoice) => `\n                    <tr>\n                      <td class=\"px-5 py-4 font-medium\">${invoice.invoice_number}</td>\n                      <td class=\"px-5 py-4\">${invoice.customer_name || 'Walk-in'}</td>\n                      <td class=\"px-5 py-4\">${currency(invoice.total)}</td>\n                      <td class=\"px-5 py-4\">\n                        <button onclick=\"openReceiptModal(${invoice.id})\" class=\"text-blue-600 hover:text-blue-800\">Create Receipt</button>\n                      </td>\n                    </tr>\n                  `).join('') || '<tr><td colspan=\"4\" class=\"px-5 py-8 text-center text-slate-500\">No invoices available.</td></tr>'}\n                </tbody>\n              </table>\n            </div>\n          </div>\n        </div>\n      `;\n    }\n\n    function renderExpenses() {\n      const total = state.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);\n      return `\n        <div class=\"space-y-6\">\n          <div class=\"flex items-center justify-between\">\n            <div>\n              <h1 class=\"text-2xl font-bold\">Expenses</h1>\n              <p class=\"text-sm text-slate-500\">Track account expenses and edit entries when needed.</p>\n            </div>\n            <button onclick=\"openExpenseModal()\" class=\"rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700\">Add Expense</button>\n          </div>\n          <div class=\"rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200\">\n            <div class=\"text-sm text-slate-500\">Total Expenses</div>\n            <div class=\"mt-2 text-3xl font-bold text-red-600\">${currency(total)}</div>\n          </div>\n          <div class=\"overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200\">\n            <div class=\"overflow-x-auto\">\n              <table class=\"min-w-full text-sm\">\n                <thead class=\"bg-slate-50 text-left text-slate-500\">\n                  <tr>\n                    <th class=\"px-5 py-4 font-medium\">Date</th>\n                    <th class=\"px-5 py-4 font-medium\">Category</th>\n                    <th class=\"px-5 py-4 font-medium\">Description</th>\n                    <th class=\"px-5 py-4 font-medium\">Amount</th>\n                    <th class=\"px-5 py-4 font-medium\">Actions</th>\n                  </tr>\n                </thead>\n                <tbody class=\"divide-y divide-slate-200\">\n                  ${state.expenses.map((expense) => `\n                    <tr>\n                      <td class=\"px-5 py-4\">${expense.date}</td>\n                      <td class=\"px-5 py-4\">${expense.category}</td>\n                      <td class=\"px-5 py-4\">${expense.description || '-'}</td>\n                      <td class=\"px-5 py-4\">${currency(expense.amount)}</td>\n                      <td class=\"px-5 py-4\">\n                        <div class=\"flex gap-3\">\n                          <button onclick=\"openExpenseModal(${expense.id})\" class=\"text-blue-600 hover:text-blue-800\">Edit</button>\n                          <button onclick=\"removeExpense(${expense.id})\" class=\"text-red-600 hover:text-red-800\">Delete</button>\n                        </div>\n                      </td>\n                    </tr>\n                  `).join('') || '<tr><td colspan=\"5\" class=\"px-5 py-8 text-center text-slate-500\">No expenses added.</td></tr>'}\n                </tbody>\n              </table>\n            </div>\n          </div>\n        </div>\n      `;\n    }\n\n    function renderActivity() {\n      return `\n        <div class=\"space-y-6\">\n          <div>\n            <h1 class=\"text-2xl font-bold\">Activity Log</h1>\n            <p class=\"text-sm text-slate-500\">Latest changes saved to the database.</p>\n          </div>\n          <div class=\"overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200\">\n            <div class=\"overflow-x-auto\">\n              <table class=\"min-w-full text-sm\">\n                <thead class=\"bg-slate-50 text-left text-slate-500\">\n                  <tr>\n                    <th class=\"px-5 py-4 font-medium\">Date</th>\n                    <th class=\"px-5 py-4 font-medium\">User</th>\n                    <th class=\"px-5 py-4 font-medium\">Action</th>\n                    <th class=\"px-5 py-4 font-medium\">Table</th>\n                    <th class=\"px-5 py-4 font-medium\">IP</th>\n                  </tr>\n                </thead>\n                <tbody class=\"divide-y divide-slate-200\">\n                  ${state.activityLogs.map((log) => `\n                    <tr>\n                      <td class=\"px-5 py-4\">${formatDateTime(log.created_at)}</td>\n                      <td class=\"px-5 py-4\">${log.username || 'System'}</td>\n                      <td class=\"px-5 py-4\">${log.action}</td>\n                      <td class=\"px-5 py-4\">${log.table_name || '-'}</td>\n                      <td class=\"px-5 py-4\">${log.ip_address || '-'}</td>\n                    </tr>\n                  `).join('') || '<tr><td colspan=\"5\" class=\"px-5 py-8 text-center text-slate-500\">No activity logs found.</td></tr>'}\n                </tbody>\n              </table>\n            </div>\n          </div>\n        </div>\n      `;\n    }\n\n    function renderCustomerDetail() {\n      const customer = state.selectedCustomer;\n      if (!customer) return '';\n\n      return `\n        <div class=\"space-y-6\">\n          <button onclick=\"state.selectedCustomer = null; render();\" class=\"text-sm font-medium text-blue-600 hover:text-blue-800\">Back to Customers</button>\n          <div class=\"rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200\">\n            <div class=\"flex flex-col gap-6 md:flex-row md:items-start\">\n              <div>${avatar(customer, 'h-24 w-24')}</div>\n              <div class=\"flex-1\">\n                <div class=\"flex flex-wrap items-center gap-3\">\n                  <h1 class=\"text-2xl font-bold\">${customer.name}</h1>\n                  ${categoryBadge(customer.category)}\n                </div>\n                <div class=\"mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2\">\n                  <div><span class=\"font-medium text-slate-900\">Customer ID:</span> ${customer.customer_id}</div>\n                  <div><span class=\"font-medium text-slate-900\">Mobile:</span> ${customer.mobile || '-'}</div>\n                  <div><span class=\"font-medium text-slate-900\">Email:</span> ${customer.email || '-'}</div>\n                  <div><span class=\"font-medium text-slate-900\">Address:</span> ${customer.address || '-'}</div>\n                  <div><span class=\"font-medium text-slate-900\">Company:</span> ${customer.company_name || '-'}</div>\n                  <div><span class=\"font-medium text-slate-900\">Total Spent:</span> ${currency(customer.totalSpent)}</div>\n                </div>\n                <div class=\"mt-3 text-sm text-slate-600\"><span class=\"font-medium text-slate-900\">Notes:</span> ${customer.notes || '-'}</div>\n                <div class=\"mt-5 flex gap-3\">\n                  <button onclick=\"openCustomerModal(${customer.id})\" class=\"rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700\">Edit Customer</button>\n                  <button onclick=\"openInvoiceModal(${customer.id})\" class=\"rounded-xl border border-blue-600 px-4 py-2 text-blue-600 hover:bg-blue-50\">Create Invoice</button>\n                </div>\n              </div>\n            </div>\n          </div>\n          <div class=\"rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200\">\n            <h2 class=\"mb-4 text-lg font-semibold\">Order History</h2>\n            <div class=\"overflow-x-auto\">\n              <table class=\"min-w-full text-sm\">\n                <thead class=\"bg-slate-50 text-left text-slate-500\">\n                  <tr>\n                    <th class=\"px-4 py-3 font-medium\">Invoice</th>\n                    <th class=\"px-4 py-3 font-medium\">Date</th>\n                    <th class=\"px-4 py-3 font-medium\">Total</th>\n                    <th class=\"px-4 py-3 font-medium\">Status</th>\n                  </tr>\n                </thead>\n                <tbody class=\"divide-y divide-slate-200\">\n                  ${(customer.invoices || []).map((invoice) => `\n                    <tr class=\"hover:bg-slate-50\">\n                      <td class=\"px-4 py-3\"><button onclick=\"viewInvoice(${invoice.id})\" class=\"font-medium text-blue-600 hover:text-blue-800\">${invoice.invoice_number}</button></td>\n                      <td class=\"px-4 py-3\">${invoice.date}</td>\n                      <td class=\"px-4 py-3\">${currency(invoice.total)}</td>\n                      <td class=\"px-4 py-3\">${invoice.status}</td>\n                    </tr>\n                  `).join('') || '<tr><td colspan=\"4\" class=\"px-4 py-8 text-center text-slate-500\">No orders yet.</td></tr>'}\n                </tbody>\n              </table>\n            </div>\n          </div>\n        </div>\n      `;\n    }\n\n    function renderInvoiceDetail() {\n      const invoice = state.selectedInvoice;\n      if (!invoice) return '';\n\n      const beforePhotos = photoList(invoice.before_service_photos);\n      const afterPhotos = photoList(invoice.after_service_photos);\n\n      return `\n        <div class=\"space-y-6\">\n          <button onclick=\"state.selectedInvoice = null; render();\" class=\"text-sm font-medium text-blue-600 hover:text-blue-800 no-print\">Back to Billing</button>\n          <div class=\"rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200\">\n            <div class=\"border-b border-slate-200 pb-6 text-center\">\n              <div class=\"flex justify-center\">${brandLogo('h-36')}</div>\n              <p class=\"mt-3 text-sm text-slate-500\">Invoice and Service Record</p>\n            </div>\n            <div class=\"mt-6 flex flex-col gap-4 md:flex-row md:justify-between\">\n              <div>\n                <div class=\"text-sm text-slate-500\">Invoice Number</div>\n                <div class=\"text-2xl font-bold\">${invoice.invoice_number}</div>\n              </div>\n              <div class=\"text-left md:text-right\">\n                <div class=\"text-sm text-slate-500\">Invoice Date</div>\n                <div class=\"font-semibold\">${invoice.date}</div>\n                <div class=\"mt-2 text-sm text-slate-500\">Status</div>\n                <div class=\"font-semibold\">${invoice.status}</div>\n              </div>\n            </div>\n            <div class=\"mt-6 rounded-xl bg-slate-50 p-4\">\n              <div class=\"text-sm text-slate-500\">Customer</div>\n              <div class=\"font-semibold\">${invoice.customer_name || 'Walk-in'}</div>\n            </div>\n            <div class=\"mt-6 overflow-x-auto\">\n              <table class=\"min-w-full text-sm\">\n                <thead class=\"bg-slate-50 text-left text-slate-500\">\n                  <tr>\n                    <th class=\"px-4 py-3 font-medium\">Service</th>\n                    <th class=\"px-4 py-3 font-medium text-right\">Qty</th>\n                    <th class=\"px-4 py-3 font-medium text-right\">Rate</th>\n                    <th class=\"px-4 py-3 font-medium text-right\">Amount</th>\n                  </tr>\n                </thead>\n                <tbody class=\"divide-y divide-slate-200\">\n                  ${(invoice.items || []).map((item) => `\n                    <tr>\n                      <td class=\"px-4 py-3\">${item.service_name}</td>\n                      <td class=\"px-4 py-3 text-right\">${item.quantity}</td>\n                      <td class=\"px-4 py-3 text-right\">${currency(item.rate)}</td>\n                      <td class=\"px-4 py-3 text-right\">${currency(Number(item.quantity) * Number(item.rate))}</td>\n                    </tr>\n                  `).join('')}\n                </tbody>\n              </table>\n            </div>\n            ${beforePhotos.length ? `\n              <div class=\"mt-6\">\n                <h2 class=\"mb-3 text-lg font-semibold\">Before Service Photos</h2>\n                <div class=\"grid grid-cols-2 gap-3 md:grid-cols-4\">\n                  ${beforePhotos.map((photo) => `<img src=\"${photo}\" class=\"h-32 w-full rounded-xl object-cover ring-1 ring-slate-200\">`).join('')}\n                </div>\n              </div>\n            ` : ''}\n            ${afterPhotos.length ? `\n              <div class=\"mt-6\">\n                <h2 class=\"mb-3 text-lg font-semibold\">After Service Photos</h2>\n                <div class=\"grid grid-cols-2 gap-3 md:grid-cols-4\">\n                  ${afterPhotos.map((photo) => `<img src=\"${photo}\" class=\"h-32 w-full rounded-xl object-cover ring-1 ring-slate-200\">`).join('')}\n                </div>\n              </div>\n            ` : ''}\n            <div class=\"mt-6 border-t border-slate-200 pt-6 text-right\">\n              <div class=\"text-sm text-slate-500\">Total</div>\n              <div class=\"text-3xl font-bold\">${currency(invoice.total)}</div>\n            </div>\n          </div>\n          <div class=\"flex flex-wrap justify-center gap-3 no-print\">\n            ${invoice.status === 'pending' ? `<button onclick=\"markInvoiceCompleted(${invoice.id})\" class=\"rounded-xl bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-700\">Mark Completed</button>` : ''}\n            <button onclick=\"openReceiptModal(${invoice.id})\" class=\"rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700\">Create Receipt</button>\n            <button onclick=\"window.print()\" class=\"rounded-xl border border-slate-300 px-4 py-2.5 font-medium hover:bg-slate-50\">Print Invoice</button>\n          </div>\n        </div>\n      `;\n    }\n\n    function renderContent() {\n      if (state.selectedCustomer) return renderCustomerDetail();\n      if (state.selectedInvoice) return renderInvoiceDetail();\n\n      switch (state.activeTab) {\n        case 'overview': return renderOverview();\n        case 'customers': return renderCustomers();\n        case 'billing': return renderBilling();\n        case 'receipts': return renderReceipts();\n        case 'expenses': return renderExpenses();\n        case 'activity': return renderActivity();\n        default: return renderOverview();\n      }\n    }\n\n    function renderApp() {\n      const tabs = [\n        ['overview', 'Dashboard'],\n        ['customers', 'Customers'],\n        ['billing', 'Billing'],\n        ['receipts', 'Receipts'],\n        ['expenses', 'Expenses'],\n        ['activity', 'Activity Log'],\n      ];\n\n      return `\n        <div class=\"flex min-h-screen\">\n          <aside class=\"no-print hidden w-72 flex-col bg-slate-900 px-6 py-8 text-white lg:flex\">\n            <div class=\"mb-8\">\n              <div class=\"rounded-2xl bg-white px-4 py-3\">\n                ${brandLogo('h-14 mx-auto')}\n              </div>\n              <div class=\"mt-2 text-center text-xs font-medium uppercase tracking-[0.2em] text-slate-400\">Shoe Laundry ERP</div>\n            </div>\n            <nav class=\"space-y-2\">\n              ${tabs.map(([key, label]) => `\n                <button onclick=\"switchTab('${key}')\" class=\"flex w-full items-center rounded-xl px-4 py-3 text-left ${state.activeTab === key ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}\">\n                  ${label}\n                </button>\n              `).join('')}\n            </nav>\n            <div class=\"mt-auto rounded-2xl bg-slate-800 p-4\">\n              <div class=\"font-medium\">${state.user.username}</div>\n              <div class=\"text-sm text-slate-400\">${state.user.role}</div>\n              <button onclick=\"logout()\" class=\"mt-4 w-full rounded-xl bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-700\">Logout</button>\n            </div>\n          </aside>\n          <main class=\"flex-1 p-4 sm:p-6 lg:p-8\">\n            <div class=\"mb-6 flex items-center justify-between lg:hidden\">\n              <div class=\"flex items-center gap-3\">\n                ${brandLogo('h-12')}\n                <div>\n                <div class=\"text-sm text-slate-500\">${tabs.find(([key]) => key === state.activeTab)?.[1] || ''}</div>\n                </div>\n              </div>\n              <button onclick=\"logout()\" class=\"rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white\">Logout</button>\n            </div>\n            <div class=\"mb-6 grid grid-cols-2 gap-2 lg:hidden\">\n              ${tabs.map(([key, label]) => `\n                <button onclick=\"switchTab('${key}')\" class=\"rounded-xl px-3 py-2 text-sm font-medium ${state.activeTab === key ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}\">${label}</button>\n              `).join('')}\n            </div>\n            ${state.loading ? `\n              <div class=\"flex min-h-[50vh] items-center justify-center\">\n                <div class=\"flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200\">\n                  <div class=\"spinner\"></div>\n                  <div class=\"font-medium text-slate-700\">Loading data...</div>\n                </div>\n              </div>\n            ` : renderContent()}\n          </main>\n        </div>\n      `;\n    }\n\n    function render() {\n      document.getElementById('app').innerHTML = state.user ? renderApp() : renderLogin();\n      attachEvents();\n    }\n\n    function attachEvents() {\n      const loginForm = document.getElementById('login-form');\n      if (loginForm) {\n        loginForm.addEventListener('submit', async (event) => {\n          event.preventDefault();\n          const errorBox = document.getElementById('login-error');\n          try {\n            const data = await api('/api/auth/login', {\n              method: 'POST',\n              body: JSON.stringify({\n                username: document.getElementById('login-username').value,\n                password: document.getElementById('login-password').value,\n                pin: document.getElementById('login-pin').value,\n              }),\n            });\n\n            localStorage.setItem('user', JSON.stringify(data.user));\n            localStorage.setItem('token', data.token);\n            state.user = data.user;\n            await loadInitialData();\n          } catch (error) {\n            errorBox.textContent = error.message;\n            errorBox.classList.remove('hidden');\n          }\n        });\n      }\n    }\n\n    function switchTab(tab) {\n      state.activeTab = tab;\n      state.selectedCustomer = null;\n      state.selectedInvoice = null;\n      render();\n    }\n\n    function logout() {\n      localStorage.removeItem('user');\n      localStorage.removeItem('token');\n      state.user = null;\n      state.selectedCustomer = null;\n      state.selectedInvoice = null;\n      closeModal();\n      render();\n    }\n\n    async function viewCustomer(id) {\n      state.selectedCustomer = await api(`/api/customers/${id}`);\n      state.selectedInvoice = null;\n      state.activeTab = 'customers';\n      render();\n    }\n\n    async function viewInvoice(id) {\n      state.selectedInvoice = await api(`/api/invoices/${id}`);\n      state.selectedCustomer = null;\n      state.activeTab = 'billing';\n      render();\n    }\n\n    async function markInvoiceCompleted(id) {\n      await api(`/api/invoices/${id}/status`, {\n        method: 'PUT',\n        body: JSON.stringify({ status: 'completed' }),\n      });\n      await loadInitialData();\n      if (state.selectedInvoice && Number(state.selectedInvoice.id) === Number(id)) {\n        await viewInvoice(id);\n      }\n    }\n\n    async function removeCustomer(id) {\n      if (!confirm('Delete this customer?')) return;\n      await api(`/api/customers/${id}`, { method: 'DELETE' });\n      if (state.selectedCustomer && Number(state.selectedCustomer.id) === Number(id)) {\n        state.selectedCustomer = null;\n      }\n      await loadInitialData();\n    }\n\n    async function removeExpense(id) {\n      if (!confirm('Delete this expense?')) return;\n      await api(`/api/expenses/${id}`, { method: 'DELETE' });\n      await loadInitialData();\n    }\n\n    function openCustomerModal(id) {\n      const customer = state.customers.find((item) => Number(item.id) === Number(id)) || null;\n      openModal(`\n        <div class=\"p-6\">\n          <div class=\"mb-6 flex items-center justify-between\">\n            <h2 class=\"text-xl font-semibold\">${customer ? 'Edit Customer' : 'Add Customer'}</h2>\n            <button onclick=\"closeModal()\" class=\"rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-100\">Close</button>\n          </div>\n          <form id=\"customer-form\" class=\"space-y-4\">\n            <div class=\"grid gap-4 md:grid-cols-2\">\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Name</label>\n                <input id=\"customer-name\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\" value=\"${customer ? customer.name : ''}\" required>\n              </div>\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Mobile</label>\n                <input id=\"customer-mobile\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\" value=\"${customer ? customer.mobile : ''}\" required>\n              </div>\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Email</label>\n                <input id=\"customer-email\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\" value=\"${customer && customer.email ? customer.email : ''}\">\n              </div>\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Category</label>\n                <select id=\"customer-category\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">\n                  <option value=\"Regular\" ${customer && customer.category === 'Regular' ? 'selected' : ''}>Regular</option>\n                  <option value=\"VIP\" ${customer && customer.category === 'VIP' ? 'selected' : ''}>VIP</option>\n                  <option value=\"Corporate\" ${customer && customer.category === 'Corporate' ? 'selected' : ''}>Corporate</option>\n                </select>\n              </div>\n              <div class=\"md:col-span-2\">\n                <label class=\"mb-1 block text-sm font-medium\">Address</label>\n                <textarea id=\"customer-address\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">${customer && customer.address ? customer.address : ''}</textarea>\n              </div>\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Company Name</label>\n                <input id=\"customer-company\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\" value=\"${customer && customer.company_name ? customer.company_name : ''}\">\n              </div>\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Profile Photo</label>\n                <input id=\"customer-photo\" type=\"file\" accept=\"image/*\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">\n              </div>\n              <div class=\"md:col-span-2\">\n                <label class=\"mb-1 block text-sm font-medium\">Notes</label>\n                <textarea id=\"customer-notes\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">${customer && customer.notes ? customer.notes : ''}</textarea>\n              </div>\n              <div class=\"md:col-span-2\">\n                <div class=\"mb-2 text-sm font-medium\">Preview</div>\n                <div id=\"customer-photo-preview\" class=\"flex min-h-[88px] items-center rounded-xl border border-dashed border-slate-300 p-3\">\n                  ${customer && customer.profile_photo ? `<img src=\"${customer.profile_photo}\" class=\"h-20 w-20 rounded-full object-cover\">` : '<span class=\"text-sm text-slate-500\">No photo selected</span>'}\n                </div>\n              </div>\n            </div>\n            <div id=\"customer-form-error\" class=\"hidden rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700\"></div>\n            <div class=\"flex justify-end gap-3 pt-2\">\n              <button type=\"button\" onclick=\"closeModal()\" class=\"rounded-xl border border-slate-300 px-4 py-2.5 font-medium hover:bg-slate-50\">Cancel</button>\n              <button class=\"rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700\">Save Customer</button>\n            </div>\n          </form>\n        </div>\n      `);\n\n      let profilePhoto = customer ? customer.profile_photo : null;\n      const photoInput = document.getElementById('customer-photo');\n      const preview = document.getElementById('customer-photo-preview');\n\n      photoInput.addEventListener('change', async (event) => {\n        const files = event.target.files;\n        if (!files || !files.length) return;\n        profilePhoto = await toBase64(files[0]);\n        preview.innerHTML = `<img src=\"${profilePhoto}\" class=\"h-20 w-20 rounded-full object-cover\">`;\n      });\n\n      document.getElementById('customer-form').addEventListener('submit', async (event) => {\n        event.preventDefault();\n        const errorBox = document.getElementById('customer-form-error');\n        errorBox.classList.add('hidden');\n        errorBox.textContent = '';\n        const payload = {\n          name: document.getElementById('customer-name').value.trim(),\n          mobile: document.getElementById('customer-mobile').value.trim(),\n          email: document.getElementById('customer-email').value.trim(),\n          category: document.getElementById('customer-category').value,\n          address: document.getElementById('customer-address').value.trim(),\n          companyName: document.getElementById('customer-company').value.trim(),\n          notes: document.getElementById('customer-notes').value.trim(),\n          profilePhoto,\n        };\n\n        try {\n          if (customer) {\n            await api(`/api/customers/${customer.id}`, { method: 'PUT', body: JSON.stringify(payload) });\n          } else {\n            await api('/api/customers', { method: 'POST', body: JSON.stringify(payload) });\n          }\n\n          closeModal();\n          await loadInitialData();\n          if (customer) {\n            await viewCustomer(customer.id);\n          }\n        } catch (error) {\n          errorBox.textContent = error.message;\n          errorBox.classList.remove('hidden');\n        }\n      });\n    }\n\n    function openExpenseModal(id) {\n      const expense = state.expenses.find((item) => Number(item.id) === Number(id)) || null;\n      const today = new Date().toISOString().slice(0, 10);\n      openModal(`\n        <div class=\"p-6\">\n          <div class=\"mb-6 flex items-center justify-between\">\n            <h2 class=\"text-xl font-semibold\">${expense ? 'Edit Expense' : 'Add Expense'}</h2>\n            <button onclick=\"closeModal()\" class=\"rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-100\">Close</button>\n          </div>\n          <form id=\"expense-form\" class=\"space-y-4\">\n            <div class=\"grid gap-4 md:grid-cols-2\">\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Category</label>\n                <select id=\"expense-category\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">\n                  ${['Rent', 'Electricity', 'Salary', 'Cleaning Materials', 'Miscellaneous'].map((item) => `\n                    <option value=\"${item}\" ${expense && expense.category === item ? 'selected' : ''}>${item}</option>\n                  `).join('')}\n                </select>\n              </div>\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Date</label>\n                <input id=\"expense-date\" type=\"date\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\" value=\"${expense ? expense.date : today}\" required>\n              </div>\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Amount</label>\n                <input id=\"expense-amount\" type=\"number\" step=\"0.01\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\" value=\"${expense ? expense.amount : ''}\" required>\n              </div>\n              <div class=\"md:col-span-2\">\n                <label class=\"mb-1 block text-sm font-medium\">Description</label>\n                <textarea id=\"expense-description\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">${expense && expense.description ? expense.description : ''}</textarea>\n              </div>\n            </div>\n            <div class=\"flex justify-end gap-3 pt-2\">\n              <button type=\"button\" onclick=\"closeModal()\" class=\"rounded-xl border border-slate-300 px-4 py-2.5 font-medium hover:bg-slate-50\">Cancel</button>\n              <button class=\"rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700\">Save Expense</button>\n            </div>\n          </form>\n        </div>\n      `);\n\n      document.getElementById('expense-form').addEventListener('submit', async (event) => {\n        event.preventDefault();\n        const payload = {\n          category: document.getElementById('expense-category').value,\n          date: document.getElementById('expense-date').value,\n          amount: document.getElementById('expense-amount').value,\n          description: document.getElementById('expense-description').value,\n        };\n\n        if (expense) {\n          await api(`/api/expenses/${expense.id}`, { method: 'PUT', body: JSON.stringify(payload) });\n        } else {\n          await api('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });\n        }\n\n        closeModal();\n        await loadInitialData();\n      });\n    }\n\n    function openReceiptModal(invoiceId) {\n      const invoice = state.invoices.find((item) => Number(item.id) === Number(invoiceId));\n      if (!invoice) return;\n\n      openModal(`\n        <div class=\"p-6\">\n          <div class=\"mb-6 flex items-center justify-between\">\n            <h2 class=\"text-xl font-semibold\">Create Receipt</h2>\n            <button onclick=\"closeModal()\" class=\"rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-100\">Close</button>\n          </div>\n          <div class=\"mb-6 rounded-xl bg-slate-50 p-4\">\n            <div class=\"text-sm text-slate-500\">Invoice</div>\n            <div class=\"font-semibold\">${invoice.invoice_number}</div>\n            <div class=\"mt-1 text-lg font-bold text-blue-700\">${currency(invoice.total)}</div>\n          </div>\n          <form id=\"receipt-form\" class=\"space-y-4\">\n            <div class=\"grid gap-4 md:grid-cols-2\">\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Payment Method</label>\n                <select id=\"receipt-method\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">\n                  <option>Cash</option>\n                  <option>UPI</option>\n                  <option>Card</option>\n                  <option>Bank Transfer</option>\n                </select>\n              </div>\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Amount Received</label>\n                <input id=\"receipt-amount\" type=\"number\" step=\"0.01\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\" value=\"${invoice.total}\" required>\n              </div>\n              <div class=\"md:col-span-2\">\n                <label class=\"mb-1 block text-sm font-medium\">Receipt Photos</label>\n                <input id=\"receipt-photos\" type=\"file\" accept=\"image/*\" multiple class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">\n                <div id=\"receipt-photo-preview\" class=\"mt-3 grid grid-cols-3 gap-3\"></div>\n              </div>\n            </div>\n            <div class=\"flex justify-end gap-3 pt-2\">\n              <button type=\"button\" onclick=\"closeModal()\" class=\"rounded-xl border border-slate-300 px-4 py-2.5 font-medium hover:bg-slate-50\">Cancel</button>\n              <button class=\"rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700\">Save Receipt</button>\n            </div>\n          </form>\n        </div>\n      `);\n\n      let receiptPhotos = [];\n      document.getElementById('receipt-photos').addEventListener('change', async (event) => {\n        receiptPhotos = await readFiles(event.target.files);\n        document.getElementById('receipt-photo-preview').innerHTML = receiptPhotos.map((photo) => `<img src=\"${photo}\" class=\"h-24 w-full rounded-xl object-cover ring-1 ring-slate-200\">`).join('');\n      });\n\n      document.getElementById('receipt-form').addEventListener('submit', async (event) => {\n        event.preventDefault();\n        const amountReceived = Number(document.getElementById('receipt-amount').value);\n        await api('/api/receipts', {\n          method: 'POST',\n          body: JSON.stringify({\n            invoice_id: invoice.id,\n            payment_method: document.getElementById('receipt-method').value,\n            amount_received: amountReceived,\n            balance_amount: Number(invoice.total) - amountReceived,\n            notes: '',\n            receiptPhotos,\n          }),\n        });\n        closeModal();\n        await loadInitialData();\n      });\n    }\n\n    function openInvoiceModal(customerId) {\n      const today = new Date().toISOString().slice(0, 10);\n      const selectedCustomerId = customerId || '';\n      openModal(`\n        <div class=\"p-6\">\n          <div class=\"mb-6 flex items-center justify-between\">\n            <h2 class=\"text-xl font-semibold\">Create Invoice</h2>\n            <button onclick=\"closeModal()\" class=\"rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-100\">Close</button>\n          </div>\n          <form id=\"invoice-form\" class=\"space-y-5\">\n            <div class=\"grid gap-4 md:grid-cols-2\">\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Customer</label>\n                <select id=\"invoice-customer\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">\n                  <option value=\"\">Walk-in</option>\n                  ${state.customers.map((customer) => `<option value=\"${customer.id}\" ${Number(selectedCustomerId) === Number(customer.id) ? 'selected' : ''}>${customer.name} (${customer.customer_id})</option>`).join('')}\n                </select>\n              </div>\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Date</label>\n                <input id=\"invoice-date\" type=\"date\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\" value=\"${today}\" required>\n              </div>\n            </div>\n            <div>\n              <div class=\"mb-3 flex items-center justify-between\">\n                <label class=\"text-sm font-medium\">Items</label>\n                <button type=\"button\" onclick=\"window.addInvoiceItemRow()\" class=\"rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50\">Add Item</button>\n              </div>\n              <div id=\"invoice-items\" class=\"space-y-3\"></div>\n            </div>\n            <div class=\"grid gap-4 md:grid-cols-2\">\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Before Service Photos</label>\n                <input id=\"before-photos\" type=\"file\" accept=\"image/*\" multiple class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">\n                <div id=\"before-preview\" class=\"mt-3 grid grid-cols-3 gap-3\"></div>\n              </div>\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">After Service Photos</label>\n                <input id=\"after-photos\" type=\"file\" accept=\"image/*\" multiple class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">\n                <div id=\"after-preview\" class=\"mt-3 grid grid-cols-3 gap-3\"></div>\n              </div>\n            </div>\n            <div class=\"grid gap-4 md:grid-cols-3\">\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Discount (%)</label>\n                <input id=\"invoice-discount\" type=\"number\" min=\"0\" value=\"0\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">\n              </div>\n              <div>\n                <label class=\"mb-1 block text-sm font-medium\">Tax (%)</label>\n                <input id=\"invoice-tax\" type=\"number\" min=\"0\" value=\"0\" class=\"w-full rounded-xl border border-slate-300 px-4 py-3\">\n              </div>\n              <div class=\"rounded-xl bg-slate-50 px-4 py-3\">\n                <div class=\"text-sm text-slate-500\">Estimated Total</div>\n                <div id=\"invoice-total\" class=\"mt-1 text-xl font-bold\">${currency(0)}</div>\n              </div>\n            </div>\n            <div class=\"flex justify-end gap-3 pt-2\">\n              <button type=\"button\" onclick=\"closeModal()\" class=\"rounded-xl border border-slate-300 px-4 py-2.5 font-medium hover:bg-slate-50\">Cancel</button>\n              <button class=\"rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700\">Create Invoice</button>\n            </div>\n          </form>\n        </div>\n      `);\n\n      let beforePhotos = [];\n      let afterPhotos = [];\n      let itemCounter = 0;\n\n      function calculateTotal() {\n        const rows = Array.from(document.querySelectorAll('.invoice-item-row'));\n        const discount = Number(document.getElementById('invoice-discount').value || 0);\n        const tax = Number(document.getElementById('invoice-tax').value || 0);\n        const subtotal = rows.reduce((sum, row) => {\n          const qty = Number(row.querySelector('.item-qty').value || 0);\n          const rate = Number(row.querySelector('.item-rate').value || 0);\n          return sum + qty * rate;\n        }, 0);\n        const discountAmount = (subtotal * discount) / 100;\n        const taxable = subtotal - discountAmount;\n        const taxAmount = (taxable * tax) / 100;\n        document.getElementById('invoice-total').textContent = currency(taxable + taxAmount);\n      }\n\n      function renderItemRow(serviceId) {\n        const defaultService = state.services.find((service) => Number(service.id) === Number(serviceId)) || state.services[0];\n        itemCounter += 1;\n        const wrapper = document.createElement('div');\n        wrapper.className = 'invoice-item-row grid gap-3 md:grid-cols-12';\n        wrapper.innerHTML = `\n          <div class=\"md:col-span-5\">\n            <select class=\"item-service w-full rounded-xl border border-slate-300 px-4 py-3\">\n              ${state.services.map((service) => `<option value=\"${service.id}\" ${Number(service.id) === Number(defaultService.id) ? 'selected' : ''}>${service.name}</option>`).join('')}\n            </select>\n          </div>\n          <div class=\"md:col-span-2\">\n            <input class=\"item-qty w-full rounded-xl border border-slate-300 px-4 py-3\" type=\"number\" min=\"1\" value=\"1\">\n          </div>\n          <div class=\"md:col-span-3\">\n            <input class=\"item-rate w-full rounded-xl border border-slate-300 px-4 py-3\" type=\"number\" step=\"0.01\" value=\"${defaultService.price}\">\n          </div>\n          <div class=\"md:col-span-2\">\n            <button type=\"button\" class=\"remove-item w-full rounded-xl border border-red-300 px-4 py-3 font-medium text-red-600 hover:bg-red-50\">Remove</button>\n          </div>\n        `;\n        document.getElementById('invoice-items').appendChild(wrapper);\n\n        wrapper.querySelector('.item-service').addEventListener('change', (event) => {\n          const service = state.services.find((item) => Number(item.id) === Number(event.target.value));\n          wrapper.querySelector('.item-rate').value = service ? service.price : 0;\n          calculateTotal();\n        });\n        wrapper.querySelector('.item-qty').addEventListener('input', calculateTotal);\n        wrapper.querySelector('.item-rate').addEventListener('input', calculateTotal);\n        wrapper.querySelector('.remove-item').addEventListener('click', () => {\n          wrapper.remove();\n          calculateTotal();\n        });\n      }\n\n      window.addInvoiceItemRow = () => {\n        renderItemRow();\n        calculateTotal();\n      };\n\n      renderItemRow();\n      calculateTotal();\n\n      document.getElementById('invoice-discount').addEventListener('input', calculateTotal);\n      document.getElementById('invoice-tax').addEventListener('input', calculateTotal);\n\n      document.getElementById('before-photos').addEventListener('change', async (event) => {\n        beforePhotos = await readFiles(event.target.files);\n        document.getElementById('before-preview').innerHTML = beforePhotos.map((photo) => `<img src=\"${photo}\" class=\"h-24 w-full rounded-xl object-cover ring-1 ring-slate-200\">`).join('');\n      });\n\n      document.getElementById('after-photos').addEventListener('change', async (event) => {\n        afterPhotos = await readFiles(event.target.files);\n        document.getElementById('after-preview').innerHTML = afterPhotos.map((photo) => `<img src=\"${photo}\" class=\"h-24 w-full rounded-xl object-cover ring-1 ring-slate-200\">`).join('');\n      });\n\n      document.getElementById('invoice-form').addEventListener('submit', async (event) => {\n        event.preventDefault();\n        const items = Array.from(document.querySelectorAll('.invoice-item-row')).map((row) => ({\n          service_id: Number(row.querySelector('.item-service').value),\n          quantity: Number(row.querySelector('.item-qty').value),\n          rate: Number(row.querySelector('.item-rate').value),\n        })).filter((item) => item.quantity > 0);\n\n        await api('/api/invoices', {\n          method: 'POST',\n          body: JSON.stringify({\n            customer_id: document.getElementById('invoice-customer').value || null,\n            date: document.getElementById('invoice-date').value,\n            items,\n            discount: Number(document.getElementById('invoice-discount').value || 0),\n            tax: Number(document.getElementById('invoice-tax').value || 0),\n            notes: '',\n            beforeServicePhotos: beforePhotos,\n            afterServicePhotos: afterPhotos,\n          }),\n        });\n\n        delete window.addInvoiceItemRow;\n        closeModal();\n        await loadInitialData();\n      });\n    }\n\n    async function init() {\n      const savedUser = localStorage.getItem('user');\n      if (savedUser) {\n        state.user = JSON.parse(savedUser);\n        await loadInitialData();\n      } else {\n        render();\n      }\n    }\n\n    init();\n  </script>\n</body>\n</html>\n";

app.get('/', (_req, res) => {
  res.type('html').send(INDEX_HTML);
});

(async () => {
  try {
    await initializeDatabase();
    console.log('Connected to SQLite database at:', DB_PATH);
    console.log('Database initialized successfully.');
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log('Environment:', process.env.NODE_ENV || 'development');
    });
  } catch (error) {
    console.error('Startup error:', error);
    process.exit(1);
  }
})();
