
const express = require('express');
const pool = require('../config/db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const [todaySales] = await pool.query('SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE date = ?', [today]);
    const [monthlySales] = await pool.query('SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE date >= ?', [firstDayOfMonth]);
    const [totalCustomers] = await pool.query('SELECT COUNT(*) as count FROM customers');
    const [pendingOrders] = await pool.query('SELECT COUNT(*) as count FROM invoices WHERE status = "pending"');
    const [completedOrders] = await pool.query('SELECT COUNT(*) as count FROM invoices WHERE status = "completed"');
    const [recentBills] = await pool.query(`
      SELECT i.*, c.name as customer_name 
      FROM invoices i 
      LEFT JOIN customers c ON i.customer_id = c.id 
      ORDER BY i.created_at DESC 
      LIMIT 5
    `);
    const [serviceRevenue] = await pool.query(`
      SELECT s.name, SUM(ii.quantity * ii.rate) as revenue 
      FROM invoice_items ii 
      JOIN services s ON ii.service_id = s.id 
      JOIN invoices i ON ii.invoice_id = i.id 
      WHERE i.date >= ? 
      GROUP BY s.id, s.name
    `, [firstDayOfMonth]);

    res.json({
      todaySales: todaySales[0].total,
      monthlySales: monthlySales[0].total,
      totalCustomers: totalCustomers[0].count,
      pendingOrders: pendingOrders[0].count,
      completedOrders: completedOrders[0].count,
      recentBills,
      serviceRevenue
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
