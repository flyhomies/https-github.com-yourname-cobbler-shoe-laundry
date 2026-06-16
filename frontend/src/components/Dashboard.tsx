
import { useState, useEffect } from 'react'
import DashboardOverview from './DashboardOverview'
import Customers from './Customers'
import Billing from './Billing'
import Receipts from './Receipts'
import Expenses from './Expenses'

interface DashboardProps {
  user: any
  onLogout: () => void
}

function Dashboard({ user, onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboardData, setDashboardData] = useState<any>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/dashboard')
      const data = await res.json()
      setDashboardData(data)
    } catch (err) {
      console.error(err)
    }
  }

  const navItems = [
    { id: 'overview', label: 'Dashboard' },
    { id: 'customers', label: 'Customers' },
    { id: 'billing', label: 'Billing' },
    { id: 'receipts', label: 'Receipts' },
    { id: 'expenses', label: 'Expenses' },
  ]

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-64 bg-gradient-to-b from-blue-700 to-blue-900 text-white">
        <div className="p-6">
          <h2 className="text-2xl font-bold">COBBLER</h2>
          <p className="text-blue-200 text-sm">Shoe Laundry</p>
        </div>
        <nav className="mt-6">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full text-left px-6 py-3 hover:bg-blue-600 transition-colors ${activeTab === item.id ? 'bg-blue-600 border-r-4 border-yellow-400' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-0 w-64 p-6">
          <div className="text-sm">
            <p className="font-medium">{user.username}</p>
            <p className="text-blue-200">{user.role}</p>
          </div>
          <button
            onClick={onLogout}
            className="mt-4 w-full bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {activeTab === 'overview' && <DashboardOverview data={dashboardData} />}
          {activeTab === 'customers' && <Customers />}
          {activeTab === 'billing' && <Billing />}
          {activeTab === 'receipts' && <Receipts />}
          {activeTab === 'expenses' && <Expenses />}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
