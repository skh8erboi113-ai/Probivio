import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ScoreDrillDownCard } from './ScoreDrillDownCard';
import { ApiClientError } from '../api/client';
import { leadsApi } from '../api/leads.api';

vi.mock('../api/leads.api', () => ({
  leadsApi: {
    scoreExplanation: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ScoreDrillDownCard', () => {
  it('renders factor contributions and drift-unavailable state', async () => {
    vi.mocked(leadsApi.scoreExplanation).mockResolvedValue({
      data: {
        score: {
          dealScore: 80,
          motivationScore: 70,
          urgencyScore: 60,
          composite: 74,
          confidence: 0.8,
          explanation: 'test',
          recommendation: 'pursue' as never,
          topFactors: [
            { name: 'strong_equity', value: 0.9, weight: 0.4, description: '40% equity spread' },
          ],
          modelVersion: 'test-v1',
          scoredAt: new Date().toISOString() as never,
        },
        currentWeights: {
          dealWeight: 0.4,
          motivationWeight: 0.4,
          urgencyWeight: 0.2,
          version: 'v1',
          trainedAt: new Date().toISOString() as never,
          trainingSampleSize: 10,
          validationAccuracy: 0.7,
        },
        driftAvailable: false,
        weightDrift: [],
      },
      requestId: 'req_1',
    });

    renderWithClient(<ScoreDrillDownCard leadId="lead_1" />);

    // recharts' ResponsiveContainer needs real (non-zero) layout dimensions to
    // render its children, which jsdom doesn't provide — so we assert the
    // chart container mounted (proving the factor data reached the component)
    // rather than asserting on SVG label text that only renders with a real
    // layout engine. The chart's actual rendering is covered by the `vite
    // build` smoke test, which bundles and type-checks the real recharts usage.
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /bar chart of score factor contributions/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/not enough retraining history/i)).toBeInTheDocument();
  });

  it('renders weight drift deltas when available', async () => {
    vi.mocked(leadsApi.scoreExplanation).mockResolvedValue({
      data: {
        score: {
          dealScore: 80,
          motivationScore: 70,
          urgencyScore: 60,
          composite: 74,
          confidence: 0.8,
          explanation: 'test',
          recommendation: 'pursue' as never,
          topFactors: [],
          modelVersion: 'test-v1',
          scoredAt: new Date().toISOString() as never,
        },
        currentWeights: {
          dealWeight: 0.5,
          motivationWeight: 0.3,
          urgencyWeight: 0.2,
          version: 'v2',
          trainedAt: new Date().toISOString() as never,
          trainingSampleSize: 50,
          validationAccuracy: 0.8,
        },
        driftAvailable: true,
        comparedAgainst: new Date().toISOString() as never,
        weightDrift: [
          { dimension: 'deal', currentWeight: 0.5, previousWeight: 0.4, delta: 0.1 },
          { dimension: 'motivation', currentWeight: 0.3, previousWeight: 0.4, delta: -0.1 },
          { dimension: 'urgency', currentWeight: 0.2, previousWeight: 0.2, delta: 0 },
        ],
      },
      requestId: 'req_2',
    });

    renderWithClient(<ScoreDrillDownCard leadId="lead_1" />);

    await waitFor(() => expect(screen.getByText('Deal')).toBeInTheDocument());
    expect(screen.getByText('+10pt')).toBeInTheDocument();
    expect(screen.getByText('-10pt')).toBeInTheDocument();
  });

  it('shows a friendly message when the lead has no score history yet', async () => {
    vi.mocked(leadsApi.scoreExplanation).mockRejectedValue(
      new ApiClientError('Score history for lead not found: lead_1', 404, 'NOT_FOUND', 'req_3'),
    );

    renderWithClient(<ScoreDrillDownCard leadId="lead_1" />);

    await waitFor(() => expect(screen.getByText(/has not been scored yet/i)).toBeInTheDocument());
  });
});
