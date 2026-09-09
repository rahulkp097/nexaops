import { Inject, Injectable } from '@nestjs/common';
import { PG_POOL } from '../database/pg-pool.provider';
import { Queryable } from '../database/transaction.util';
import { CreateUserInput, UpdateUserInput, UserRow } from './user.types';

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

  // Unlike findActiveByIdAndOrganization above, this deliberately includes
  // DISABLED users — admin management (Phase 9) needs to find a disabled
  // user in order to re-enable them.
  async findByIdAndOrganization(
    id: string,
    organizationId: string,
    queryable: Queryable = this.pool,
  ): Promise<UserRow | null> {
    const result = await queryable.query<UserRow>(
      'SELECT * FROM users WHERE id = $1 AND organization_id = $2',
      [id, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async listByOrganization(organizationId: string, queryable: Queryable = this.pool): Promise<UserRow[]> {
    const result = await queryable.query<UserRow>(
      'SELECT * FROM users WHERE organization_id = $1 ORDER BY email ASC',
      [organizationId],
    );
    return result.rows;
  }

  async updateByIdAndOrganization(
    id: string,
    organizationId: string,
    input: UpdateUserInput,
    queryable: Queryable = this.pool,
  ): Promise<UserRow | null> {
    const result = await queryable.query<UserRow>(
      `UPDATE users SET
         role = COALESCE($3, role),
         status = COALESCE($4, status),
         updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, organizationId, input.role ?? null, input.status ?? null],
    );
    return result.rows[0] ?? null;
  }

  // Used to block an update that would leave an organization with no active
  // admin (see AdminService.updateUser) — excludes the user being updated so
  // the caller can check "would anyone still be able to administer this org
  // afterward?".
  async countActiveAdminsExcluding(
    organizationId: string,
    excludedUserId: string,
    queryable: Queryable = this.pool,
  ): Promise<number> {
    const result = await queryable.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM users
       WHERE organization_id = $1 AND role = 'ADMIN' AND status = 'ACTIVE' AND id <> $2`,
      [organizationId, excludedUserId],
    );
    return result.rows[0]?.count ?? 0;
  }
}
