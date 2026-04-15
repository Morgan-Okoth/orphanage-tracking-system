import { apiClient } from './client';
import { ApiResponse } from '../types/api';

export interface InitiatePaymentRequest {
  requestId: string;
  phoneNumber: string;
  amount: number;
}

export interface InitiatePaymentResponse {
  transactionId: string;
  intasendTrackingId: string;
  status: 'pending';
  amount: number;
  message: string;
}

export interface PaymentRecord {
  id: string;
  requestId: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  intasendTrackingId?: string;
  providerReference?: string;
  initiatedAt: string;
  completedAt?: string;
  failureReason?: string;
}

export const paymentsApi = {
  initiatePayment: (requestId: string, phoneNumber: string, amount: number) =>
    apiClient.post<ApiResponse<InitiatePaymentResponse>>('/payments/initiate', {
      requestId,
      phoneNumber,
      amount,
    }),

  getPaymentByRequest: (requestId: string) =>
    apiClient.get<ApiResponse<PaymentRecord>>(`/payments/request/${requestId}`),
};
