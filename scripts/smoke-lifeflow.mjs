const baseUrl = 'http://127.0.0.1:5000';
const runId = Date.now();
const email = `lifeflow_${runId}@test.com`;
const password = 'Pass@12345';

function log(name, ok, details = '') {
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`${icon} ${name}${details ? ` :: ${details}` : ''}`);
}

async function request(method, path, body, token, raw = false) {
  const headers = {};
  if (!raw) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body == null ? undefined : raw ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { res, json };
}

async function main() {
  let token = null;
  let familyCode = null;
  let ownerToken = null;
  let failed = 0;

  const checks = [];
  const push = (name, ok, details) => {
    checks.push({ name, ok, details: details || '' });
    if (!ok) failed += 1;
    log(name, ok, details);
  };

  {
    const { res } = await request('POST', '/api/onboarding/permission-log', {
      permission: 'sms',
      status: 'granted',
    });
    push('onboarding permission-log', res.ok);
  }

  {
    const { res, json } = await request('POST', '/api/auth/register', {
      name: 'LifeFlow Tester',
      email,
      password,
    });
    token = json?.token || null;
    ownerToken = token;
    push('register', res.ok && !!token, json?.message || '');
  }

  {
    const { res, json } = await request('POST', '/api/user/sms-detection', { sms_detection_enabled: true }, token);
    push('sms detection flag', res.ok && json?.sms_detection_enabled === true);
  }

  {
    const { res } = await request('POST', '/api/transactions', {
      merchant: 'Swiggy',
      amount: 450,
      category: 'food',
      isDebit: true,
      description: 'Smoke expense',
    }, token);
    push('transactions create', res.ok);
  }

  {
    const { res } = await request('POST', '/api/bills', {
      name: 'Electricity Bill',
      amount: 1200,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      category: 'bills',
    }, token);
    push('bill create', res.ok);
  }

  {
    const { res } = await request('POST', '/api/reminders/ai-create', {
      text_input: 'Ruchit ne 500 kal aapvana',
    }, token);
    push('smart capture ai-create', res.ok);
  }

  {
    const { res } = await request('POST', '/api/voice-reminder', {
      voice_text: 'Ruchit ne 500 rupiya kal aapvana',
    }, token);
    push('voice-reminder create', res.ok);
  }
  {
    const { res } = await request('POST', '/api/reminders/voice-create', {
      text: 'Ruchit ne 500 rupiya kal aapvana',
    }, token);
    push('reminders voice-create', res.ok);
  }

  {
    const fd = new FormData();
    const { res, json } = await request('POST', '/api/voice-reminder/transcribe', fd, token, true);
    // 400 without audio is acceptable for endpoint reachability test
    push('voice transcribe endpoint reachable', res.status === 400 || res.status === 500, json?.message || '');
  }

  {
    const { res, json } = await request('POST', '/api/family', {
      name: 'Papa',
      relation: 'parent',
      member_type: 'parent',
    }, token);
    familyCode = json?.connectionCode || null;
    push('family add with code', res.ok && !!familyCode);
  }

  let createdFamilyCode = null;
  {
    const { res, json } = await request('POST', '/api/family/create', {}, token);
    createdFamilyCode = json?.family_code || null;
    push('family create API', res.ok && !!createdFamilyCode);
  }

  let childToken = null;
  {
    const childEmail = `lifeflow_child_${runId}@test.com`;
    const { res, json } = await request('POST', '/api/auth/register', {
      name: 'Linked Parent Device',
      email: childEmail,
      password,
    });
    childToken = json?.token || null;
    push('second account register', res.ok && !!childToken);
  }

  if (childToken && familyCode) {
    const { res } = await request('POST', '/api/family/connect', { code: familyCode }, childToken);
    push('family connect by code', res.ok);
  }
  if (childToken && createdFamilyCode) {
    const { res } = await request('POST', '/api/family/join', { family_code: createdFamilyCode }, childToken);
    push('family join API', res.ok);
  }

  {
    const { res, json } = await request('GET', '/api/family/member-modules?relation=father', undefined, ownerToken);
    push('family member-modules', res.ok && Array.isArray(json?.modules));
  }

  {
    const { res } = await request('POST', '/api/memory/settings', { pattern_duration: 30 }, ownerToken);
    push('memory settings update', res.ok);
  }
  {
    const { res, json } = await request('GET', '/api/memory/insights', undefined, ownerToken);
    push('memory insights', res.ok && Array.isArray(json?.habits));
  }

  {
    const { res } = await request('POST', '/api/life-flow/smart-capture', {
      type: 'task',
      input_mode: 'text',
      text_input: 'Call Ruchit at 11 AM',
    }, ownerToken);
    push('life-flow smart-capture task', res.ok);
  }

  {
    const { res } = await request('POST', '/api/capture/create', {
      title: 'Doctor visit',
      category: 'Task',
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      notes: 'Annual checkup',
    }, ownerToken);
    push('capture create structured', res.ok);
  }

  {
    const { res, json } = await request('GET', '/api/capture/history', undefined, ownerToken);
    push('capture history', res.ok && Array.isArray(json));
  }

  {
    const { res, json } = await request('GET', '/api/reminders/voice-history', undefined, ownerToken);
    push('voice history', res.ok && Array.isArray(json));
  }

  {
    const { res, json } = await request('GET', '/api/dashboard', undefined, ownerToken);
    push('dashboard cache endpoint', res.ok && typeof json?.monthly_spend === 'number');
  }

  {
    const { res, json } = await request('GET', '/api/life-flow/timeline?range=30days', undefined, ownerToken);
    push('life-flow timeline', res.ok && Array.isArray(json));
  }
  {
    const { res, json } = await request('GET', '/api/life-flow/daily-plan', undefined, ownerToken);
    push('life-flow daily-plan', res.ok && Array.isArray(json?.plan));
  }
  {
    const { res, json } = await request('GET', '/api/life-flow/predictions', undefined, ownerToken);
    push('life-flow predictions', res.ok && Array.isArray(json?.predictions));
  }
  {
    const { res, json } = await request('GET', '/api/daily-metrics', undefined, ownerToken);
    push('daily-metrics', res.ok && typeof json?.hydration === 'number');
  }
  {
    const { res, json } = await request('GET', '/api/family/graph', undefined, ownerToken);
    push('family graph', res.ok && Array.isArray(json));
  }
  {
    const { res, json } = await request('GET', '/api/reports?range=30days', undefined, ownerToken);
    push('reports range', res.ok && typeof json?.life_score === 'number');
  }
  {
    const { res, json } = await request('GET', '/api/life-planet', undefined, ownerToken);
    push('life planet', res.ok && typeof json?.stage === 'number');
  }

  console.log('\n--- SUMMARY ---');
  console.log(`Total checks: ${checks.length}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    console.log('Failed checks:');
    checks.filter((c) => !c.ok).forEach((c) => console.log(`- ${c.name}: ${c.details}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

