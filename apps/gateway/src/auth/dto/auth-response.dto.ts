import { Role } from '../../users/user.types';

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
