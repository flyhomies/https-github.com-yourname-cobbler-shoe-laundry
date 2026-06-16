
# COBBLER SHOE LAUNDRY - Management System

A complete web application for managing a shoe laundry business, including billing, customer management, receipts, expense tracking, and more.

## Technology Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: MySQL

## Setup Instructions

### 1. Prerequisites

- Node.js (v14 or higher)
- MySQL server

### 2. Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the backend directory (already created) with your database credentials:
```
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cobbler_shoe_laundry
JWT_SECRET=your_jwt_secret_key
```

4. Initialize the database:
```bash
npm run init-db
```

5. Start the backend server:
```bash
npm run dev
```

### 3. Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the frontend development server:
```bash
npm run dev
```

### 4. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

### Default Login Credentials

- Username: admin
- Password: 111606
- PIN: 111606 (optional)

## Features

- Dashboard with overview of sales, customers, and orders
- Customer management
- Billing and invoicing
- Receipt generation
- Expense tracking
- User authentication with PIN protection
