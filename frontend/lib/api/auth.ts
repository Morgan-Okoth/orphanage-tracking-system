import { apiClient } from './client';
import { ApiResponse } from '../types/api';
import { User, UserRole } from '../types/user';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<ApiResponse<AuthResponse>>('/auth/login', data),

  register: (data: RegisterRequest) =>
    apiClient.post<ApiResponse<{ user: User }>>('/auth/register', data),

  logout: () => apiClient.post<ApiResponse<null>>('/auth/logout', {}),

  me: () => apiClient.get<ApiResponse<User>>('/auth/me'),
};
