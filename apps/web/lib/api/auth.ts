import type { AuthResponseDto, LoginRequest, MeResponseDto, RegisterRequest } from '@nexaops/shared-types';
import { apiFetch } from '../api-client';

export function register(payload: RegisterRequest): Promise<AuthResponseDto> {
  return apiFetch('/auth/register', { method: 'POST', body: payload, skipAuth: true });
}

export function login(payload: LoginRequest): Promise<AuthResponseDto> {
  return apiFetch('/auth/login', { method: 'POST', body: payload, skipAuth: true });
}

export function logout(refreshToken: string): Promise<void> {
  return apiFetch('/auth/logout', { method: 'POST', body: { refreshToken }, skipAuth: true });
}

export function getMe(): Promise<MeResponseDto> {
  return apiFetch('/auth/me');
}
