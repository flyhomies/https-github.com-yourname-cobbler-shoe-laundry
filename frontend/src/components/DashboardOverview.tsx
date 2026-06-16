
interface DashboardOverviewProps {
  data: any
}

function DashboardOverview({ data }: DashboardOverviewProps) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  const stats = [
    { label: "Today's Sales", value: `₹${data.todaySales.toFixed(2)}`, color: 'bg-green-500' },
    { label: 'Monthly Sales', value: `₹${data.monthlySales.toFixed(2)}`, color: 'bg-blue-500' },
    { label: 'Total Customers', value: data.totalCustomers, color: 'bg-purple-500' },
    { label: 'Pending Orders', value: data.pendingOrders, color: 'bg-yellow-500' },
    { label: 'Completed Orders', value: data.completedOrders, color: 'bg-green-600' },
  ]

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-md p-6">
            <p className="text-gray-500 text-sm mb-2">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Recent Bills</h2>
          <div className="space-y-4">
            {data.recentBills.map((bill: any) => (
              <div key={bill.id} className="flex justify-between items-center border-b pb-3">
                <div>
                  <p className="font-medium text-gray-800">{bill.invoice_number}</p>
                  <p className="text-sm text-gray-500">{bill.customer_name || 'Walk-in'}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-800">₹{bill.total.toFixed(2)}</p>
                  <span className={`text-xs px-2 py-1 rounded-full ${bill.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {bill.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Service-wise Revenue</h2>
          <div className="space-y-4">
            {data.serviceRevenue.map((service: any, index: number) => (
              <div key={index} className="flex justify-between items-center">
                <p className="text-gray-800">{service.name}</p>
                <p className="font-bold text-gray-800">₹{service.revenue.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardOverview
