
const express = require('express');
const pool = require('../config/db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [services] = await pool.query('SELECT * FROM services ORDER BY created_at DESC');
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, price } = req.body;
    const [result] = await pool.query('INSERT INTO services (name, price) VALUES (?, ?)', [name, price]);
    res.status(201).json({ id: result.insertId, name, price });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, price } = req.body;
    await pool.query('UPDATE services SET name = ?, price = ? WHERE id = ?', [name, price, req.params.id]);
    res.json({ message: 'Service updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM services WHERE id = ?', [req.params.id]);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
