import { API_BASE_URL } from '../utils/constants';

export class PublicApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PublicApiError';
  }
}

export interface PublicStatistics {
  totalReceived: number;
  totalDisbursed: number;
  requestsApproved: number;
  requestsRejected: number;
  requestsByType: Record<string, number>;
  amountsByType: Record<string, number>;
}

export interface MonthlyStatistic {
  month: string;
  totalReceived: number;
  totalDisbursed: number;
  requestsApproved: number;
  requestsRejected: number;
}

export interface FundingChartData {
  labels: string[];
  received: number[];
  disbursed: number[];
}

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PublicApiError(
      res.status,
      json?.error?.code ?? 'UNKNOWN_ERROR',
      json?.error?.message ?? `Failed to fetch ${path}: ${res.status}`,
    );
  }
  return (json?.data ?? json) as T;
}

export const publicApi = {
  getStatistics: () => publicGet<PublicStatistics>('/public/statistics'),
  getMonthlyStatistics: () => publicGet<MonthlyStatistic[]>('/public/statistics/monthly'),
  getStatisticsByType: () => publicGet<Record<string, unknown>>('/public/statistics/by-type'),
  getFundingChartData: () => publicGet<FundingChartData>('/public/charts/funding'),
};
