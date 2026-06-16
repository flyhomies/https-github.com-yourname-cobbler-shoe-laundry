
const express = require('express');
const pool = require('../config/db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [receipts] = await pool.query(`
      SELECT r.*, i.invoice_number, c.name as customer_name 
      FROM receipts r 
      JOIN invoices i ON r.invoice_id = i.id 
      LEFT JOIN customers c ON i.customer_id = c.id 
      ORDER BY r.created_at DESC
    `);
    res.json(receipts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { invoice_id, payment_method, amount_received, balance_amount, notes } = req.body;
    const [receiptCount] = await pool.query('SELECT COUNT(*) as count FROM receipts');
    const receiptNumber = `RCP${String(receiptCount[0].count + 1).padStart(6, '0')}`;
    const [result] = await pool.query(
      'INSERT INTO receipts (receipt_number, invoice_id, payment_method, amount_received, balance_amount, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [receiptNumber, invoice_id, payment_method, amount_received, balance_amount, notes]
    );
    res.status(201).json({ id: result.insertId, receipt_number: receiptNumber });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
