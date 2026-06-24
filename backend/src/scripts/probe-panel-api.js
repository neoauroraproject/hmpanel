/**
 * HMPanel Live API Compatibility Probe
 * Runs real HTTP calls against the registered 3x-ui panel.
 * Tests every endpoint required for the provisioning refactor.
 * Does NOT create, mutate, or delete any real data.
 */

const axios = require('axios');
const https = require('https');

const PANEL_BASE  = 'https://b1.hmray.pro:2053/pZSfexFEOYpHjECbF5';
const API_TOKEN   = 'hgY7lkn2jlLFOpj46oEAb39MZZBW5Vmitkt9R70zNv5P9p4j';
const TIMEOUT_MS  = 15000;

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const headers    = { Authorization: `Bearer ${API_TOKEN}` };

// ─── Colour helpers (basic ANSI) ─────────────────────────────────────────────
const G  = s => `\x1b[32m${s}\x1b[0m`;  // green
const R  = s => `\x1b[31m${s}\x1b[0m`;  // red
const Y  = s => `\x1b[33m${s}\x1b[0m`;  // yellow
const B  = s => `\x1b[36m${s}\x1b[0m`;  // cyan
const DIM = s => `\x1b[2m${s}\x1b[0m`;

// ─── Result collection ────────────────────────────────────────────────────────
const results = [];

async function probe({ name, method, path, body, expectedStatus = 200, note = '' }) {
  const url      = `${PANEL_BASE}${path}`;
  const start    = Date.now();
  const entry    = { name, method, path, url, note };

  try {
    const cfg = {
      method,
      url,
      headers,
      httpsAgent,
      timeout: TIMEOUT_MS,
      validateStatus: () => true,   // capture all status codes
    };
    if (body) { cfg.data = body; cfg.headers['Content-Type'] = 'application/json'; }

    const res = await axios(cfg);
    entry.durationMs  = Date.now() - start;
    entry.httpStatus  = res.status;
    entry.success     = res.data?.success;
    entry.msg         = res.data?.msg || null;
    entry.hasObj      = res.data?.obj !== undefined;
    entry.objType     = Array.isArray(res.data?.obj) ? 'array' : typeof res.data?.obj;
    entry.objLen      = Array.isArray(res.data?.obj) ? res.data.obj.length : null;
    entry.rawPreview  = JSON.stringify(res.data).substring(0, 300);

    // Schema sniff for arrays
    if (Array.isArray(res.data?.obj) && res.data.obj.length > 0) {
      entry.objKeys = Object.keys(res.data.obj[0]);
    } else if (res.data?.obj && typeof res.data.obj === 'object') {
      entry.objKeys = Object.keys(res.data.obj);
    }

    entry.endpointExists  = res.status !== 404;
    entry.authWorks       = res.status !== 401 && res.status !== 403;
    entry.apiSuccess      = res.data?.success === true;
    entry.statusOk        = res.status === expectedStatus || (res.status >= 200 && res.status < 300);
  } catch (err) {
    entry.durationMs     = Date.now() - start;
    entry.error          = err.code || err.message;
    entry.endpointExists = false;
    entry.authWorks      = false;
    entry.apiSuccess     = false;
    entry.statusOk       = false;
  }

  results.push(entry);
  return entry;
}

// ─── Pretty print one result ──────────────────────────────────────────────────
function printResult(e) {
  const tick  = v => v ? G('✓') : R('✗');
  const badge = v => v ? G('[PASS]') : R('[FAIL]');

  console.log(`\n${'─'.repeat(72)}`);
  console.log(`${B(e.method.padEnd(6))} ${e.path}`);
  console.log(`  ${DIM('Name    ')} ${e.name}`);
  if (e.note) console.log(`  ${DIM('Note    ')} ${Y(e.note)}`);
  if (e.error) {
    console.log(`  ${DIM('Status  ')} ${R('CONNECTION ERROR: ' + e.error)}`);
    return;
  }
  console.log(`  ${DIM('HTTP    ')} ${e.httpStatus}  (${e.durationMs}ms)`);
  console.log(`  ${DIM('success ')} ${e.success === true ? G('true') : e.success === false ? R('false') : Y('n/a')}`);
  console.log(`  ${DIM('msg     ')} ${e.msg ? Y(e.msg) : DIM('(none)')}`);
  console.log(`  ${DIM('obj     ')} type=${e.objType}${e.objLen !== null ? ', len=' + e.objLen : ''}`);
  if (e.objKeys?.length) console.log(`  ${DIM('keys    ')} ${e.objKeys.slice(0, 15).join(', ')}`);
  console.log(`  ${DIM('preview ')} ${DIM(e.rawPreview?.substring(0, 200))}`);
  console.log(`  Endpoint exists? ${tick(e.endpointExists)}   Auth works? ${tick(e.authWorks)}   API success? ${tick(e.apiSuccess)}`);
  console.log(`  ${badge(e.endpointExists && e.authWorks && e.apiSuccess)}`);
}

// ─── Summary table ────────────────────────────────────────────────────────────
function printSummary() {
  console.log(`\n${'═'.repeat(72)}`);
  console.log('  LIVE COMPATIBILITY REPORT — SUMMARY');
  console.log(`${'═'.repeat(72)}`);
  console.log(
    'Endpoint'.padEnd(45),
    'Exists'.padEnd(8),
    'Auth'.padEnd(6),
    'Success'.padEnd(9),
    'Status'.padEnd(6),
    'ms'
  );
  console.log('─'.repeat(82));
  for (const e of results) {
    const t = v => v ? G('YES') : R('NO ');
    const stat = e.error ? R('ERR') : String(e.httpStatus || '?');
    console.log(
      (e.method + ' ' + e.path).substring(0, 44).padEnd(45),
      t(e.endpointExists).padEnd(14),
      t(e.authWorks).padEnd(12),
      t(e.apiSuccess).padEnd(15),
      stat.padEnd(8),
      e.durationMs ?? '?'
    );
  }
  console.log(`${'═'.repeat(72)}\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(B('\n  HMPanel Live API Compatibility Probe'));
  console.log(`  Panel: ${PANEL_BASE}`);
  console.log(`  Time : ${new Date().toISOString()}\n`);

  // ── 1. Server status / reachability
  await probe({
    name: 'Server Status (reachability + auth)',
    method: 'GET',
    path: '/panel/api/server/status',
    note: 'Baseline: confirms panel is reachable and token is valid',
  });

  // ── 2. Client list
  await probe({
    name: 'List All Clients',
    method: 'GET',
    path: '/panel/api/clients/list',
    note: 'Returns all clients. Checks capClientsApi compatibility.',
  });

  // ── Grab first real email from the list for subsequent tests
  const listEntry = results.find(r => r.path === '/panel/api/clients/list');
  let testEmail = null;
  if (listEntry?.apiSuccess && listEntry?.objLen > 0) {
    // We need to re-fetch to get first email — re-use cached rawPreview to find it
    try {
      const res2 = await axios.get(`${PANEL_BASE}/panel/api/clients/list`, { headers, httpsAgent, timeout: TIMEOUT_MS, validateStatus: () => true });
      const obj = res2.data?.obj;
      if (Array.isArray(obj) && obj.length > 0) {
        testEmail = obj[0].email;
        console.log(Y(`  [INFO] Using real client email for GET probes: "${testEmail}"`));
      }
    } catch {}
  }
  if (!testEmail) {
    testEmail = '__hmray_probe_nonexistent__';
    console.log(Y(`  [WARN] No clients found or list failed. Using dummy email for GET probes.`));
  }

  // ── 3. GET by email (existing client)
  await probe({
    name: 'Get Client by Email',
    method: 'GET',
    path: `/panel/api/clients/get/${encodeURIComponent(testEmail)}`,
    note: `Tests /clients/get/{email} endpoint with real email: ${testEmail}`,
  });

  // ── 4. GET traffic by email
  await probe({
    name: 'Get Client Traffic by Email',
    method: 'GET',
    path: `/panel/api/clients/traffic/${encodeURIComponent(testEmail)}`,
    note: `Tests /clients/traffic/{email} — used for post-op verification`,
  });

  // ── 5. GET by non-existent email (verify 404/not-found behaviour)
  await probe({
    name: 'Get Non-Existent Client (error path)',
    method: 'GET',
    path: `/panel/api/clients/get/__hmray_probe_nonexistent_xyz__`,
    note: 'Verify error response format when client does not exist',
  });

  // ── 6. GET traffic of non-existent (verify 404 used for deletion confirmation)
  await probe({
    name: 'Get Traffic — Non-Existent Client',
    method: 'GET',
    path: `/panel/api/clients/traffic/__hmray_probe_nonexistent_xyz__`,
    note: 'Critical: is 404 / success=false returned? Used as "client missing" signal.',
  });

  // ── 7. POST /clients/add — dry probe (invalid minimal body, check error shape)
  await probe({
    name: 'Add Client (schema probe — bad payload)',
    method: 'POST',
    path: '/panel/api/clients/add',
    body: {},   // intentionally empty — should get a validation error, NOT a 404
    expectedStatus: 400,
    note: 'Confirm endpoint exists + check error response shape. No data created.',
  });

  // ── 8. POST /clients/add — probe with a non-existent inboundId
  await probe({
    name: 'Add Client (invalid inboundId probe)',
    method: 'POST',
    path: '/panel/api/clients/add',
    body: {
      client: {
        email: '__hmray_probe_will_fail__',
        totalGB: 1,
        expiryTime: 0,
        tgId: 0,
        limitIp: 0,
        enable: true,
        subId: 'probe0000probe0000',
      },
      inboundIds: [999999],  // non-existent inbound ID
    },
    expectedStatus: 400,
    note: 'Probe: inbound 999999 should not exist. Checks error message for INBOUND_NOT_FOUND.',
  });

  // ── 9. POST /clients/update/{email} — non-existent email
  await probe({
    name: 'Update Client (non-existent email)',
    method: 'POST',
    path: `/panel/api/clients/update/__hmray_probe_nonexistent_xyz__`,
    body: { email: '__hmray_probe_nonexistent_xyz__', totalGB: 1, expiryTime: 0, enable: true },
    expectedStatus: 400,
    note: 'Verify update returns clean error for unknown email. Checks endpoint exists.',
  });

  // ── 10. POST /clients/del/{email} — non-existent email (safe, idempotent)
  await probe({
    name: 'Delete Client (non-existent email — idempotency check)',
    method: 'POST',
    path: `/panel/api/clients/del/__hmray_probe_nonexistent_xyz__`,
    body: {},
    expectedStatus: 200,
    note: 'Is deletion idempotent? Or does it error on missing email? Critical for rollback safety.',
  });

  // ── 11. POST /clients/resetTraffic/{email} — non-existent
  await probe({
    name: 'Reset Traffic (non-existent email)',
    method: 'POST',
    path: `/panel/api/clients/resetTraffic/__hmray_probe_nonexistent_xyz__`,
    note: 'Check error shape for reset on missing client',
  });

  // ── 12. GET /clients/list/paged (pagination capability)
  await probe({
    name: 'Client List Paged (optional capability)',
    method: 'GET',
    path: '/panel/api/clients/list/paged',
    note: 'Optional: paginated list endpoint',
  });

  // ── 13. GET inbounds/options (for numeric ID resolution)
  await probe({
    name: 'Inbound Options (numeric ID lookup)',
    method: 'GET',
    path: '/panel/api/inbounds/options',
    note: 'Returns numeric inbound IDs needed for /clients/add inboundIds[] field',
  });

  // ── Print all results
  for (const e of results) printResult(e);
  printSummary();

  // ── Recommendations
  console.log(B('  RECOMMENDATIONS\n'));
  const list = results.find(r => r.path === '/panel/api/clients/list');
  const getByEmail = results.find(r => r.name === 'Get Client by Email');
  const add = results.find(r => r.name === 'Add Client (schema probe — bad payload)');
  const update = results.find(r => r.name === 'Update Client (non-existent email)');
  const del = results.find(r => r.name === 'Delete Client (non-existent email — idempotency check)');
  const reset = results.find(r => r.name === 'Reset Traffic (non-existent email)');
  const traffic = results.find(r => r.name === 'Get Client Traffic by Email');
  const nonExistTraffic = results.find(r => r.name === 'Get Traffic — Non-Existent Client');

  const ok = r => r?.endpointExists && r?.authWorks;

  console.log(`  /clients/list        → ${ok(list)     ? G('SUPPORTED — use for sync')                 : R('NOT SUPPORTED')}`);
  console.log(`  /clients/get/{email} → ${ok(getByEmail)? G('SUPPORTED — use for post-create verify')   : R('NOT SUPPORTED — need fallback')}`);
  console.log(`  /clients/add         → ${ok(add)       ? G('SUPPORTED — replace updateInboundFull')    : R('NOT SUPPORTED — keep updateInboundFull')}`);
  console.log(`  /clients/update/...  → ${ok(update)    ? G('SUPPORTED — replace updateInboundFull')    : R('NOT SUPPORTED — keep updateInboundFull')}`);
  console.log(`  /clients/del/...     → ${ok(del)       ? G('SUPPORTED — safe to use')                  : R('NOT SUPPORTED')}`);
  console.log(`  /clients/resetTraffic→ ${ok(reset)     ? G('SUPPORTED — replace updateInboundFull')    : R('NOT SUPPORTED — keep updateInboundFull')}`);
  console.log(`  /clients/traffic/... → ${ok(traffic)   ? G('SUPPORTED — use for verification')         : R('NOT SUPPORTED — need fallback')}`);

  if (nonExistTraffic) {
    const missingBehaviour = !nonExistTraffic.apiSuccess
      ? G(`Returns success=false or 4xx for missing client → safe to use as "deleted" sentinel`)
      : Y(`WARNING: Returns success=true even for missing client → cannot use as deletion confirmation`);
    console.log(`  del-sentinel check   → ${missingBehaviour}`);
  }

  console.log('');
}

main().catch(err => {
  console.error('Probe failed:', err.message);
  process.exit(1);
});
