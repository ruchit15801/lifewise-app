
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'AEWFAFG564asf84a8w6ef4as68f4asf84232zd564fvsfg8';
const API_URL = 'http://localhost:5000';

async function runTest() {
  console.log('--- SMS Sync Simulation Start ---');

  // 1. Generate token for demo user (or use login API)
  // Demo user email: demo@lifewise.test
  const token = jwt.sign({ userId: 'demo-user-id', email: 'demo@lifewise.test' }, JWT_SECRET);

  const mockTransactions = [
    {
      smsId: 'sms-101',
      sender: 'HDFCBK',
      amount: 1500.50,
      date: new Date().toISOString(),
      isDebit: true,
      description: 'HDFC Bank: Rs 1500.50 debited from A/c x1234 towards Amazon on ' + new Date().toLocaleDateString(),
      merchant: 'Amazon',
      category: 'shopping'
    },
    {
      smsId: 'sms-102',
      sender: 'ICICIB',
      amount: 200.00,
      date: new Date().toISOString(),
      isDebit: true,
      description: 'ICICI Bank: Rs 200.00 debited from A/c x5678 towards Uber',
      merchant: 'Uber',
      category: 'travel'
    }
  ];

  console.log('Test Case 1: Initial Sync');
  let res = await fetch(`${API_URL}/api/transactions/sync-from-sms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ transactions: mockTransactions })
  });
  let data = await res.json();
  console.log('Result:', data);

  console.log('\nTest Case 2: Deduplication (Same IDs)');
  res = await fetch(`${API_URL}/api/transactions/sync-from-sms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ transactions: mockTransactions })
  });
  data = await res.json();
  console.log('Result (expect 0 synced, 2 skipped):', data);

  console.log('\nTest Case 3: Mixed Data (1 New, 2 Old)');
  const mixedTransactions = [
    ...mockTransactions,
    {
      smsId: 'sms-103',
      sender: 'SBI',
      amount: 50.00,
      date: new Date().toISOString(),
      isDebit: true,
      description: 'SBI: Rs 50.00 debited for tea',
      merchant: 'Tea Stall',
      category: 'food'
    }
  ];
  res = await fetch(`${API_URL}/api/transactions/sync-from-sms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ transactions: mixedTransactions })
  });
  data = await res.json();
  console.log('Result (expect 1 synced, 2 skipped):', data);

  console.log('\n--- SMS Sync Simulation End ---');
}

runTest().catch(console.error);
