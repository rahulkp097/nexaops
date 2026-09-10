import { Role } from './common';

export interface RegisterRequest {
  organizationName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: Role;
    organizationId: string;
  };
}

export interface MeResponseDto {
  id: string;
  email: string;
  role: Role;
  organizationId: string;
}
