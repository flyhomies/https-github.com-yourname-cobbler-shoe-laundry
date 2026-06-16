
import { useState, useEffect } from 'react'

interface Service {
  id: number
  name: string
  price: number
}

interface Customer {
  id: number
  name: string
}

interface InvoiceItem {
  service_id: number
  quantity: number
  rate: number
}

function Billing() {
  const [services, setServices] = useState<Service[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    customer_id: '',
    date: new Date().toISOString().split('T')[0],
    items: [] as InvoiceItem[],
    discount: 0,
    tax: 0
  })

  useEffect(() => {
    fetchServices()
    fetchCustomers()
    fetchInvoices()
  }, [])

  const fetchServices = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/services')
      const data = await res.json()
      setServices(data)
    } catch (err) {
      console.error(err)
    }
  }

  const fetchCustomers = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/customers')
      const data = await res.json()
      setCustomers(data)
    } catch (err) {
      console.error(err)
    }
  }

  const fetchInvoices = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/invoices')
      const data = await res.json()
      setInvoices(data)
    } catch (err) {
      console.error(err)
    }
  }

  const addItem = () => {
    if (services.length > 0) {
      setFormData({
        ...formData,
        items: [...formData.items, { service_id: services[0].id, quantity: 1, rate: services[0].price }]
      })
    }
  }

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...formData.items]
    if (field === 'service_id') {
      const service = services.find(s => s.id === value)
      newItems[index] = { ...newItems[index], service_id: value, rate: service?.price || 0 }
    } else {
      newItems[index] = { ...newItems[index], [field]: value }
    }
    setFormData({ ...formData, items: newItems })
  }

  const removeItem = (index: number) => {
    setFormData({ ...formData, items: formData.items.filter((_, i) => i !== index) })
  }

  const calculateTotal = () => {
    let subtotal = 0
    formData.items.forEach(item => {
      subtotal += item.rate * item.quantity
    })
    const discountAmount = (subtotal * formData.discount) / 100
    const taxAmount = ((subtotal - discountAmount) * formData.tax) / 100
    return subtotal - discountAmount + taxAmount
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('http://localhost:5000/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (res.ok) {
        fetchInvoices()
        setShowModal(false)
        setFormData({
          customer_id: '',
          date: new Date().toISOString().split('T')[0],
          items: [],
          discount: 0,
          tax: 0
        })
      }
    } catch (err) {
      console.error(err)
    }
  }

  const updateStatus = async (id: number, status: string) => {
    try {
      await fetch(`http://localhost:5000/api/invoices/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      fetchInvoices()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Billing</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create Invoice
        </button>
      </div>
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invoice.invoice_number}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.date}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.customer_name || 'Walk-in'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">₹{invoice.total.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${invoice.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {invoice.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {invoice.status === 'pending' && (
                    <button
                      onClick={() => updateStatus(invoice.id, 'completed')}
                      className="text-green-600 hover:text-green-900"
                    >
                      Mark Complete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-8 w-full max-w-4xl my-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Create Invoice</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                  <select
                    value={formData.customer_id}
                    onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Walk-in Customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Items</label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    + Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-4 gap-2">
                      <select
                        value={item.service_id}
                        onChange={(e) => updateItem(index, 'service_id', parseInt(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        {services.map((service) => (
                          <option key={service.id} value={service.id}>{service.name} - ₹{service.price}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Qty"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => updateItem(index, 'rate', parseFloat(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Rate"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.discount}
                    onChange={(e) => setFormData({ ...formData, discount: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax (%)</label>
  <input
                    type="number"
                    min="0"
                    value={formData.tax}
                    onChange={(e) => setFormData({ ...formData, tax: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-800">Total: ₹{calculateTotal().toFixed(2)}</p>
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
                  Create Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Billing
