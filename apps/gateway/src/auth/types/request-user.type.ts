import { Request } from 'express';
import { Role } from '../../users/user.types';

export interface RequestUser {
  userId: string;
  organizationId: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}
