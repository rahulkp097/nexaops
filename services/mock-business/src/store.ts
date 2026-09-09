import { buildDataset } from './seed';
import {
  BusinessDataset,
  Customer,
  InventoryEvent,
  InventoryItem,
  MonthlyRevenue,
  Order,
  OrderStatus,
  RevenueAnalytics,
} from './types';
import { DateRange, isWithinRange } from './validation';

// Built once at module load, from a fixed seed (see seed.ts) — every
// request reads the same in-memory dataset, matching spec §19's
// "deterministic operational API": no database, no per-request randomness.
const dataset: BusinessDataset = buildDataset();

export function getDataset(): BusinessDataset {
  return dataset;
}

export function getCustomerById(id: string): Customer | null {
  return dataset.customers.find((customer) => customer.id === id) ?? null;
}

export function getOrderById(id: string): Order | null {
  return dataset.orders.find((order) => order.id === id) ?? null;
}

export function listOrders(filter: { status: OrderStatus | null; range: DateRange }): Order[] {
  return dataset.orders.filter((order) => {
    if (filter.status && order.status !== filter.status) {
      return false;
    }
    return isWithinRange(order.placedAt, filter.range);
  });
}

export function getInventoryBySku(sku: string): InventoryItem | null {
  return dataset.inventory.find((item) => item.sku === sku) ?? null;
}

export function listInventoryEvents(range: DateRange): InventoryEvent[] {
  return dataset.inventoryEvents.filter((event) => isWithinRange(event.occurredAt, range));
}

// Revenue counts every non-cancelled order at its full placed value in the
// month it was placed — a "booked revenue" view, not a "recognized on
// delivery" one. Good enough for a mock analytics endpoint; a real
// implementation would need to pick one and document it just as
// explicitly.
export function getRevenueAnalytics(range: DateRange): RevenueAnalytics {
  const counted = dataset.orders.filter(
    (order) => order.status !== 'CANCELLED' && isWithinRange(order.placedAt, range),
  );

  const byMonthMap = new Map<string, MonthlyRevenue>();
  for (const order of counted) {
    const month = order.placedAt.slice(0, 7);
    const existing = byMonthMap.get(month) ?? { month, revenue: 0, orderCount: 0 };
    existing.revenue = Math.round((existing.revenue + order.total) * 100) / 100;
    existing.orderCount += 1;
    byMonthMap.set(month, existing);
  }
  const byMonth = [...byMonthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const totalRevenue = Math.round(counted.reduce((sum, order) => sum + order.total, 0) * 100) / 100;
  const orderCount = counted.length;

  const allDates = dataset.orders.map((order) => order.placedAt).sort();
  const resolvedFrom = range.from ?? allDates[0];
  const resolvedTo = range.to ?? allDates[allDates.length - 1];

  return {
    from: resolvedFrom,
    to: resolvedTo,
    totalRevenue,
    orderCount,
    averageOrderValue: orderCount === 0 ? 0 : Math.round((totalRevenue / orderCount) * 100) / 100,
    byMonth,
  };
}
