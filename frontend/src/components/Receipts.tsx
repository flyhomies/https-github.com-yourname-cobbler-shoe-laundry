
import { useState, useEffect } from 'react'

interface Invoice {
  id: number
  invoice_number: string
  total: number
  customer_name: string
}

function Receipts() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [formData, setFormData] = useState({
    payment_method: 'Cash',
    amount_received: 0,
    balance_amount: 0,
    notes: ''
  })

  useEffect(() => {
    fetchInvoices()
    fetchReceipts()
  }, [])

  const fetchInvoices = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/invoices')
      const data = await res.json()
      setInvoices(data)
    } catch (err) {
      console.error(err)
    }
  }

  const fetchReceipts = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/receipts')
      const data = await res.json()
      setReceipts(data)
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateReceipt = (invoice: Invoice) => {
    setSelectedInvoice(invoice)
    setFormData({
      payment_method: 'Cash',
      amount_received: invoice.total,
      balance_amount: 0,
      notes: ''
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedInvoice) return
    try {
      const res = await fetch('http://localhost:5000/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: selectedInvoice.id,
          ...formData
        })
      })
      if (res.ok) {
        fetchReceipts()
        setShowModal(false)
        setSelectedInvoice(null)
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Receipts</h1>
      </div>
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Method</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Received</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{receipt.receipt_number}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{receipt.invoice_number}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{receipt.customer_name || 'Walk-in'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{receipt.payment_method}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">₹{receipt.amount_received.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">₹{receipt.balance_amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Invoices</h2>
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invoice.invoice_number}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.customer_name || 'Walk-in'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">₹{invoice.total.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleCreateReceipt(invoice)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Create Receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Create Receipt</h2>
            <p className="mb-4 text-gray-600">Invoice: {selectedInvoice.invoice_number} - Total: ₹{selectedInvoice.total.toFixed(2)}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount Received</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount_received}
                  onChange={(e) => setFormData({ ...formData, amount_received: parseFloat(e.target.value), balance_amount: selectedInvoice.total - parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Balance Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.balance_amount}
                  readOnly
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Receipts
