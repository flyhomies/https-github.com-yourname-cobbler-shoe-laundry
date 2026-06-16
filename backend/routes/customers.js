
const express = require('express');
const pool = require('../config/db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [customers] = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [customers] = await pool.query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (customers.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json(customers[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, mobile, address, email, notes } = req.body;
    const [result] = await pool.query('SELECT COUNT(*) as count FROM customers');
    const customerId = `CUST${String(result[0].count + 1).padStart(4, '0')}`;
    const [insertResult] = await pool.query(
      'INSERT INTO customers (customer_id, name, mobile, address, email, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [customerId, name, mobile, address, email, notes]
    );
    res.status(201).json({ id: insertResult.insertId, customer_id: customerId, name, mobile, address, email, notes });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, mobile, address, email, notes } = req.body;
    await pool.query(
      'UPDATE customers SET name = ?, mobile = ?, address = ?, email = ?, notes = ? WHERE id = ?',
      [name, mobile, address, email, notes, req.params.id]
    );
    res.json({ message: 'Customer updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM customers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
