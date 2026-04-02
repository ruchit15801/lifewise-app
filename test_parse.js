
const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('http://localhost:5001/api/reminders/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Remind me to pay electric bill tomorrow at 10am' })
    });
    console.log('Status:', res.status);
    const json = await res.json();
    console.log('Response:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
