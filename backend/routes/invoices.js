
const express = require('express');
const pool = require('../config/db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [invoices] = await pool.query(`
      SELECT i.*, c.name as customer_name 
      FROM invoices i 
      LEFT JOIN customers c ON i.customer_id = c.id 
      ORDER BY i.created_at DESC
    `);
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [invoices] = await pool.query(`
      SELECT i.*, c.name as customer_name 
      FROM invoices i 
      LEFT JOIN customers c ON i.customer_id = c.id 
      WHERE i.id = ?
    `, [req.params.id]);
    
    if (invoices.length === 0) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const [items] = await pool.query(`
      SELECT ii.*, s.name as service_name 
      FROM invoice_items ii 
      JOIN services s ON ii.service_id = s.id 
      WHERE ii.invoice_id = ?
    `, [req.params.id]);

    res.json({ ...invoices[0], items });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { customer_id, date, items, discount, tax } = req.body;

    const [invoiceCount] = await connection.query('SELECT COUNT(*) as count FROM invoices');
    const invoiceNumber = `INV${String(invoiceCount[0].count + 1).padStart(6, '0')}`;

    let subtotal = 0;
    for (const item of items) {
      subtotal += item.rate * item.quantity;
    }

    const discountAmount = (subtotal * (discount || 0)) / 100;
    const taxAmount = ((subtotal - discountAmount) * (tax || 0)) / 100;
    const total = subtotal - discountAmount + taxAmount;

    const [invoiceResult] = await connection.query(
      'INSERT INTO invoices (invoice_number, date, customer_id, discount, tax, total) VALUES (?, ?, ?, ?, ?, ?)',
      [invoiceNumber, date, customer_id, discount, tax, total]
    );

    const invoiceId = invoiceResult.insertId;

    for (const item of items) {
      await connection.query(
        'INSERT INTO invoice_items (invoice_id, service_id, quantity, rate) VALUES (?, ?, ?, ?)',
        [invoiceId, item.service_id, item.quantity, item.rate]
      );
    }

    await connection.commit();
    res.status(201).json({ id: invoiceId, invoice_number: invoiceNumber, total });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    connection.release();
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE invoices SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Invoice status updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
