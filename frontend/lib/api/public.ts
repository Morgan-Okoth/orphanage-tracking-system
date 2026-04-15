import { API_BASE_URL } from '../utils/constants';

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
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.status}`);
  }
  const json = await res.json();
  return (json?.data ?? json) as T;
}

export const publicApi = {
  getStatistics: () => publicGet<PublicStatistics>('/public/statistics'),
  getMonthlyStatistics: () => publicGet<MonthlyStatistic[]>('/public/statistics/monthly'),
  getStatisticsByType: () => publicGet<Record<string, unknown>>('/public/statistics/by-type'),
  getFundingChartData: () => publicGet<FundingChartData>('/public/charts/funding'),
};
