import { Inject, Injectable } from '@nestjs/common';
import { PG_POOL } from '../database/pg-pool.provider';
import { Queryable } from '../database/transaction.util';
import { OrganizationRow } from './organization.types';

@Injectable()
export class OrganizationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Queryable) {}

  async create(name: string, queryable: Queryable = this.pool): Promise<OrganizationRow> {
    const result = await queryable.query<OrganizationRow>(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id, name, created_at',
      [name],
    );
    return result.rows[0];
  }
}
