import { Inject, Injectable } from '@nestjs/common';
import { PG_POOL } from '../database/pg-pool.provider';
import { Queryable } from '../database/transaction.util';
import { CreateUserInput, UserRow } from './user.types';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Queryable) {}

  async create(input: CreateUserInput, queryable: Queryable = this.pool): Promise<UserRow> {
    const result = await queryable.query<UserRow>(
      `INSERT INTO users (organization_id, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.organizationId, normalizeEmail(input.email), input.passwordHash, input.role],
    );
    return result.rows[0];
  }

  async findByEmail(email: string, queryable: Queryable = this.pool): Promise<UserRow | null> {
    const result = await queryable.query<UserRow>('SELECT * FROM users WHERE email = $1', [
      normalizeEmail(email),
    ]);
    return result.rows[0] ?? null;
  }

  // Used only by the refresh-token flow, which already possesses a valid
  // token proving control of this exact user id (not caller-supplied org
  // context). Every org-scoped read must go through
  // findActiveByIdAndOrganization below instead.
  async findActiveById(id: string, queryable: Queryable = this.pool): Promise<UserRow | null> {
    const result = await queryable.query<UserRow>(
      `SELECT * FROM users WHERE id = $1 AND status = 'ACTIVE'`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  // Tenant-isolation pattern every future repository must copy: never fetch
  // an org-owned row by id alone — organizationId is always a required filter.
  async findActiveByIdAndOrganization(
    id: string,
    organizationId: string,
    queryable: Queryable = this.pool,
  ): Promise<UserRow | null> {
    const result = await queryable.query<UserRow>(
      `SELECT * FROM users
       WHERE id = $1 AND organization_id = $2 AND status = 'ACTIVE'`,
      [id, organizationId],
    );
    return result.rows[0] ?? null;
  }
}
