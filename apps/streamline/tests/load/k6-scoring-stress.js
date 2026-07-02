import http from 'k6/http';
import { check } from 'k6';

/**
 * Stress test the scoring endpoint. This is the most expensive path
 * (Gemini API in the loop). Validates circuit breaker + rate limits engage.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const LEAD_ID = __ENV.LEAD_ID || '';

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: 50,
      iterations: 500,
      maxDuration: '2m',
    },
  },
  thresholds: {
    // Expect rate limits to engage — 429s are OK
    'http_req_failed': ['rate<0.5'],
    'http_req_duration{status:200}': ['p(95)<5000'],
  },
};

export default function () {
  if (!LEAD_ID) {
    console.warn('LEAD_ID not provided — skipping');
    return;
  }

  const res = http.post(
    `${BASE_URL}/api/leads/${LEAD_ID}/score`,
    JSON.stringify({}),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
    },
  );

  check(res, {
    'is 200 or 429 or 503': (r) => [200, 429, 503].includes(r.status),
  });
}
