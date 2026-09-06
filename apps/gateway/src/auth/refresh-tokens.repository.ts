import { Inject, Injectable } from '@nestjs/common';
import { PG_POOL } from '../database/pg-pool.provider';
import { Queryable } from '../database/transaction.util';
import { RefreshTokenRow } from './refresh-token.types';

@Injectable()
export class RefreshTokensRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Queryable) {}

  async insert(
    input: { userId: string; tokenHash: string; expiresAt: Date },
    queryable: Queryable = this.pool,
  ): Promise<RefreshTokenRow> {
    const result = await queryable.query<RefreshTokenRow>(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.userId, input.tokenHash, input.expiresAt],
    );
    return result.rows[0];
  }

  async findByHash(
    tokenHash: string,
    queryable: Queryable = this.pool,
  ): Promise<RefreshTokenRow | null> {
    const result = await queryable.query<RefreshTokenRow>(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1',
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  async revokeById(id: string, queryable: Queryable = this.pool): Promise<void> {
    await queryable.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
      [id],
    );
  }

  async revokeAllForUser(userId: string, queryable: Queryable = this.pool): Promise<void> {
    await queryable.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
  }
}
