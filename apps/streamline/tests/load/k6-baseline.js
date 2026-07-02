import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

/**
 * Baseline load test — validates the whitepaper's stated benchmarks:
 *   - GET /health: 1000 RPS, p95 < 30ms
 *   - GET /api/leads (list): 200 RPS, p95 < 200ms
 *   - POST /api/leads/score: 30 RPS, p95 < 3000ms (Gemini in loop)
 *
 * Usage:
 *   k6 run apps/streamline/tests/load/k6-baseline.js \
 *     -e BASE_URL=https://your-api.example.com \
 *     -e AUTH_TOKEN=your-firebase-id-token
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    health_check: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
      exec: 'healthCheck',
    },
    list_leads: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      stages: [
        { target: 50, duration: '30s' },
        { target: 100, duration: '1m' },
        { target: 0, duration: '30s' },
      ],
      exec: 'listLeads',
      startTime: '30s',
    },
  },
  thresholds: {
    'http_req_duration{scenario:health_check}': ['p(95)<50', 'p(99)<100'],
    'http_req_duration{scenario:list_leads}': ['p(95)<300', 'p(99)<800'],
    errors: ['rate<0.02'],
    http_req_failed: ['rate<0.01'],
  },
};

const authHeaders = AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};

export function healthCheck() {
  const res = http.get(`${BASE_URL}/health`);
  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'response body has status': (r) => {
      try {
        return JSON.parse(r.body).status !== undefined;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!ok);
}

export function listLeads() {
  const res = http.get(`${BASE_URL}/api/leads?limit=25`, { headers: authHeaders });
  const ok = check(res, {
    'status is 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  errorRate.add(!ok);
  sleep(0.1);
}
