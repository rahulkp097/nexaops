import { BadRequestApiError } from './errors';
import { OrderStatus } from './types';

const ORDER_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'DELAYED',
  'CANCELLED',
];

export interface DateRange {
  from: string | null;
  to: string | null;
}

// Query params arrive as string | string[] | undefined from Express;
// callers only ever declare single-value params, so anything else is a
// malformed request rather than a value worth coercing.
function asSingleString(value: unknown, paramName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new BadRequestApiError(`Query parameter "${paramName}" must be a single string value`);
  }
  return value;
}

export function parseDateRange(query: Record<string, unknown>): DateRange {
  const from = parseOptionalDate(query.from, 'from');
  const to = parseOptionalDate(query.to, 'to');
  if (from && to && from > to) {
    throw new BadRequestApiError('Query parameter "from" must not be after "to"');
  }
  return { from, to };
}

function parseOptionalDate(value: unknown, paramName: string): string | null {
  const raw = asSingleString(value, paramName);
  if (raw === undefined) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00.000Z`).getTime())) {
    throw new BadRequestApiError(`Query parameter "${paramName}" must be an ISO date (YYYY-MM-DD)`);
  }
  return raw;
}

export function parseOptionalOrderStatus(value: unknown): OrderStatus | null {
  const raw = asSingleString(value, 'status');
  if (raw === undefined) {
    return null;
  }
  const status = raw.toUpperCase() as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) {
    throw new BadRequestApiError(`Query parameter "status" must be one of: ${ORDER_STATUSES.join(', ')}`);
  }
  return status;
}

export function isWithinRange(isoDate: string, range: DateRange): boolean {
  if (range.from && isoDate < range.from) {
    return false;
  }
  if (range.to && isoDate > range.to) {
    return false;
  }
  return true;
}
