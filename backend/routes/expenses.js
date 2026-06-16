
const express = require('express');
const pool = require('../config/db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [expenses] = await pool.query('SELECT * FROM expenses ORDER BY date DESC, created_at DESC');
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { category, description, amount, date } = req.body;
    const [result] = await pool.query(
      'INSERT INTO expenses (category, description, amount, date) VALUES (?, ?, ?, ?)',
      [category, description, amount, date]
    );
    res.status(201).json({ id: result.insertId, category, description, amount, date });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { category, description, amount, date } = req.body;
    await pool.query(
      'UPDATE expenses SET category = ?, description = ?, amount = ?, date = ? WHERE id = ?',
      [category, description, amount, date, req.params.id]
    );
    res.json({ message: 'Expense updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
