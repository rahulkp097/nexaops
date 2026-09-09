import {
  getCustomerById,
  getInventoryBySku,
  getOrderById,
  getRevenueAnalytics,
  listInventoryEvents,
  listOrders,
} from './store';

describe('getCustomerById', () => {
  it('returns the matching customer', () => {
    expect(getCustomerById('CUST-1005')?.name).toBe('Northwind Robotics');
  });

  it('returns null for an unknown id', () => {
    expect(getCustomerById('CUST-9999')).toBeNull();
  });
});

describe('getOrderById', () => {
  it('returns the flagship delayed order', () => {
    const order = getOrderById('10291');
    expect(order?.status).toBe('DELAYED');
    expect(order?.customerId).toBe('CUST-1005');
  });

  it('returns null for an unknown id', () => {
    expect(getOrderById('99999')).toBeNull();
  });
});

describe('listOrders', () => {
  it('filters by status', () => {
    const delayed = listOrders({ status: 'DELAYED', range: { from: null, to: null } });
    expect(delayed.length).toBeGreaterThan(0);
    expect(delayed.every((order) => order.status === 'DELAYED')).toBe(true);
  });

  it('filters by date range', () => {
    const results = listOrders({ status: null, range: { from: '2026-07-14', to: '2026-07-14' } });
    expect(results.every((order) => order.placedAt === '2026-07-14')).toBe(true);
    expect(results.some((order) => order.id === '10291')).toBe(true);
  });

  it('combines status and date range filters', () => {
    const results = listOrders({ status: 'DELAYED', range: { from: '2026-08-01', to: '2026-08-31' } });
    expect(results.map((order) => order.id)).toEqual(['10305']);
  });

  it('returns everything when no filters are given', () => {
    const results = listOrders({ status: null, range: { from: null, to: null } });
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('getInventoryBySku', () => {
  it('returns the flagship out-of-stock item', () => {
    expect(getInventoryBySku('SKU-2040')).toMatchObject({ status: 'OUT_OF_STOCK', quantityOnHand: 0 });
  });

  it('returns null for an unknown sku', () => {
    expect(getInventoryBySku('SKU-0000')).toBeNull();
  });
});

describe('listInventoryEvents', () => {
  it('filters by date range and includes the flagship shortage event', () => {
    const results = listInventoryEvents({ from: '2026-07-15', to: '2026-07-15' });
    expect(results).toEqual([expect.objectContaining({ id: 'EVT-9002', type: 'SHORTAGE' })]);
  });

  it('returns everything when no range is given', () => {
    expect(listInventoryEvents({ from: null, to: null }).length).toBeGreaterThan(0);
  });
});

describe('getRevenueAnalytics', () => {
  it('excludes cancelled orders from the total', () => {
    const analytics = getRevenueAnalytics({ from: null, to: null });
    const manualTotal = listOrders({ status: null, range: { from: null, to: null } })
      .filter((order) => order.status !== 'CANCELLED')
      .reduce((sum, order) => sum + order.total, 0);

    expect(analytics.totalRevenue).toBeCloseTo(manualTotal, 2);
    expect(analytics.orderCount).toBe(
      listOrders({ status: null, range: { from: null, to: null } }).filter((o) => o.status !== 'CANCELLED').length,
    );
  });

  it('breaks revenue down by month, sorted ascending', () => {
    const analytics = getRevenueAnalytics({ from: null, to: null });

    expect(analytics.byMonth.length).toBeGreaterThan(1);
    const months = analytics.byMonth.map((bucket) => bucket.month);
    expect(months).toEqual([...months].sort());
  });

  it('respects a narrow date range', () => {
    const analytics = getRevenueAnalytics({ from: '2026-07-14', to: '2026-07-14' });

    expect(analytics.orderCount).toBe(1);
    expect(analytics.byMonth).toEqual([{ month: '2026-07', revenue: analytics.totalRevenue, orderCount: 1 }]);
  });

  it('computes averageOrderValue as totalRevenue / orderCount', () => {
    const analytics = getRevenueAnalytics({ from: null, to: null });

    expect(analytics.averageOrderValue).toBeCloseTo(analytics.totalRevenue / analytics.orderCount, 2);
  });
});
