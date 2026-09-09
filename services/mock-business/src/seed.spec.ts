import { buildDataset } from './seed';

// These assert the exact invariants spec §19 asks for: "Seed enough data
// to support meaningful demo questions, including delayed orders,
// inventory shortages, affected customers and monthly revenue." They
// guard against a future edit to the seed accidentally dropping the
// storyline the rest of the system (and demos) depend on.
describe('buildDataset', () => {
  it('is deterministic across calls', () => {
    expect(buildDataset()).toEqual(buildDataset());
  });

  it('includes at least one delayed order with a delay reason', () => {
    const { orders } = buildDataset();
    const delayed = orders.filter((order) => order.status === 'DELAYED');

    expect(delayed.length).toBeGreaterThan(0);
    for (const order of delayed) {
      expect(order.delayReason).toEqual(expect.any(String));
      expect(order.delayReason!.length).toBeGreaterThan(0);
    }
  });

  it('the flagship delayed order (#10291) matches the spec example and references a real shortage sku', () => {
    const { orders, inventory } = buildDataset();
    const order = orders.find((candidate) => candidate.id === '10291');

    expect(order).toBeDefined();
    expect(order!.status).toBe('DELAYED');
    const referencedSku = order!.items[0].sku;
    const inventoryItem = inventory.find((item) => item.sku === referencedSku);
    expect(inventoryItem?.status).not.toBe('IN_STOCK');
    expect(order!.delayReason).toContain(referencedSku);
  });

  it('every delayed order is linked to a customer that exists', () => {
    const { orders, customers } = buildDataset();
    const delayed = orders.filter((order) => order.status === 'DELAYED');

    for (const order of delayed) {
      expect(customers.some((customer) => customer.id === order.customerId)).toBe(true);
    }
  });

  it('includes at least one inventory item that is not fully in stock, with a matching shortage event', () => {
    const { inventory, inventoryEvents } = buildDataset();
    const shortages = inventory.filter((item) => item.status !== 'IN_STOCK');

    expect(shortages.length).toBeGreaterThan(0);
    for (const item of shortages) {
      expect(inventoryEvents.some((event) => event.sku === item.sku && event.type === 'SHORTAGE')).toBe(true);
    }
  });

  it('every order line item references a real product and every order a real customer', () => {
    const { orders, products, customers } = buildDataset();

    for (const order of orders) {
      expect(customers.some((customer) => customer.id === order.customerId)).toBe(true);
      for (const item of order.items) {
        expect(products.some((product) => product.sku === item.sku)).toBe(true);
      }
    }
  });

  it('order totals equal the sum of their line item totals', () => {
    const { orders } = buildDataset();

    for (const order of orders) {
      const expected = Math.round(order.items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
      expect(order.total).toBeCloseTo(expected, 2);
    }
  });

  it('orders span more than one calendar month, so monthly revenue has more than one bucket', () => {
    const { orders } = buildDataset();
    const months = new Set(orders.map((order) => order.placedAt.slice(0, 7)));

    expect(months.size).toBeGreaterThan(1);
  });

  it('every inventory event references a real product sku', () => {
    const { inventoryEvents, products } = buildDataset();

    for (const event of inventoryEvents) {
      expect(products.some((product) => product.sku === event.sku)).toBe(true);
    }
  });
});
