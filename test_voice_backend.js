const fetch = require('node-fetch'); // If node-fetch is not available, try global fetch
const fs = require('fs');

async function testVoiceParse() {
  const url = 'http://localhost:5001/api/reminders/voice/parse';
  const token = 'YOUR_TEST_TOKEN'; // We might need a real token or skip auth for test
  
  // Create a dummy buffer for testing
  const buffer = Buffer.from('dummy audio content');
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const parts = [];
  
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="test.m4a"\r\nContent-Type: audio/m4a\r\n\r\n`));
  parts.push(buffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  
  const body = Buffer.concat(parts);

  console.log('Sending request to:', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    });

    console.log('Status:', res.status);
    const json = await res.json();
    console.log('Response:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

// Note: This script requires the server to be running and a valid token.
// Since we can't easily get a token here, this is for the user or manual run.
console.log('Verification script created. To run: node test_voice_backend.js');
