import * as fs from 'fs';
import * as path from 'path';

/** Debug-mode NDJSON logger (file + ingest). Do not log secrets/PII beyond email ids. */
export function agentDebugLog(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}) {
  const body = {
    sessionId: '53d5b3',
    runId: payload.runId || 'pre-fix',
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data || {},
    timestamp: Date.now(),
  };
  const line = JSON.stringify(body) + '\n';
  const paths = [
    path.join(process.cwd(), 'debug-53d5b3.log'),
    path.join(process.cwd(), 'backend', 'debug-53d5b3.log'),
    'D:\\NeoStudio\\sample\\Projects\\hmray\\server\\Panel\\debug-53d5b3.log',
    '/app/debug-53d5b3.log',
  ];
  for (const p of paths) {
    try {
      fs.appendFileSync(p, line);
    } catch {
      /* ignore */
    }
  }
  const endpoints = [
    'http://127.0.0.1:7858/ingest/b2b41c4c-57c5-4c94-afe1-240686da3330',
    'http://host.docker.internal:7858/ingest/b2b41c4c-57c5-4c94-afe1-240686da3330',
  ];
  for (const url of endpoints) {
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '53d5b3',
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  }
}
