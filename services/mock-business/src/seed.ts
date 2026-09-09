import { mulberry32, pick, randomInt } from './random';
import {
  BusinessDataset,
  Customer,
  InventoryEvent,
  InventoryItem,
  Order,
  OrderLineItem,
  OrderStatus,
  Product,
} from './types';

// Fixed seed: see random.ts — this is what makes the whole dataset
// reproducible across restarts.
const SEED = 20260401;

const CUSTOMERS: Customer[] = [
  { id: 'CUST-1001', name: 'Acme Robotics', email: 'ap@acmerobotics.example', segment: 'enterprise', createdAt: '2025-11-03' },
  { id: 'CUST-1002', name: 'Blue Harbor Logistics', email: 'orders@blueharbor.example', segment: 'wholesale', createdAt: '2025-11-18' },
  { id: 'CUST-1003', name: 'Nova Retail Group', email: 'purchasing@novaretail.example', segment: 'retail', createdAt: '2025-12-02' },
  { id: 'CUST-1004', name: 'Cedar Point Manufacturing', email: 'procurement@cedarpoint.example', segment: 'enterprise', createdAt: '2025-12-10' },
  { id: 'CUST-1005', name: 'Northwind Robotics', email: 'ops@northwindrobotics.example', segment: 'enterprise', createdAt: '2026-01-05' },
  { id: 'CUST-1006', name: 'Silverline Traders', email: 'buying@silverlinetraders.example', segment: 'wholesale', createdAt: '2026-01-22' },
  { id: 'CUST-1007', name: 'Maple Street Electronics', email: 'store@maplestreet.example', segment: 'retail', createdAt: '2026-02-14' },
  { id: 'CUST-1008', name: 'Redwood Industrial', email: 'supply@redwoodindustrial.example', segment: 'enterprise', createdAt: '2026-02-27' },
  { id: 'CUST-1009', name: 'Harbor View Supplies', email: 'orders@harborview.example', segment: 'wholesale', createdAt: '2026-03-09' },
  { id: 'CUST-1010', name: 'Sunrise Componentry', email: 'hello@sunrisecomponentry.example', segment: 'retail', createdAt: '2026-03-21' },
];

const PRODUCTS: Product[] = [
  { sku: 'SKU-2001', name: 'Standard Widget', category: 'Widgets', unitPrice: 12.5 },
  { sku: 'SKU-2002', name: 'Heavy-Duty Widget', category: 'Widgets', unitPrice: 24.0 },
  { sku: 'SKU-2010', name: 'Temperature Sensor', category: 'Sensors', unitPrice: 18.75 },
  { sku: 'SKU-2011', name: 'Pressure Sensor', category: 'Sensors', unitPrice: 32.0 },
  { sku: 'SKU-2020', name: 'Corrugated Box (Small)', category: 'Packaging', unitPrice: 2.1 },
  { sku: 'SKU-2021', name: 'Corrugated Box (Large)', category: 'Packaging', unitPrice: 4.5 },
  { sku: 'SKU-2030', name: 'Steel Bracket', category: 'Hardware', unitPrice: 6.75 },
  { sku: 'SKU-2031', name: 'Aluminum Bracket', category: 'Hardware', unitPrice: 8.9 },
  { sku: 'SKU-2040', name: 'Precision Servo Motor', category: 'Motors', unitPrice: 89.0 },
  { sku: 'SKU-2041', name: 'Stepper Motor', category: 'Motors', unitPrice: 54.0 },
  { sku: 'SKU-2050', name: 'Control Board Rev A', category: 'Electronics', unitPrice: 145.0 },
  { sku: 'SKU-2051', name: 'Control Board Rev B', category: 'Electronics', unitPrice: 178.0 },
];

// The two skus deliberately seeded into shortage, and the demo orders that
// were delayed because of them — spec §19: "Seed enough data to support
// meaningful demo questions, including delayed orders, inventory
// shortages, affected customers[.]" These ids are hardcoded (not
// PRNG-generated) so the storyline is guaranteed present and stable.
const SHORTAGE_SKU_PRIMARY = 'SKU-2040';
const SHORTAGE_SKU_SECONDARY = 'SKU-2011';

const RANGE_START = new Date('2026-04-01T00:00:00.000Z');
const RANGE_END = new Date('2026-09-08T00:00:00.000Z');

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function daySpan(): number {
  return Math.floor((RANGE_END.getTime() - RANGE_START.getTime()) / (24 * 60 * 60 * 1000));
}

function randomDateInRange(rng: () => number): string {
  const offset = randomInt(rng, 0, daySpan());
  return addDays(toIsoDate(RANGE_START), offset);
}

function findProduct(sku: string): Product {
  const product = PRODUCTS.find((candidate) => candidate.sku === sku);
  if (!product) {
    throw new Error(`Unknown seed product sku: ${sku}`);
  }
  return product;
}

function buildLineItem(sku: string, quantity: number): OrderLineItem {
  const product = findProduct(sku);
  return {
    sku,
    productName: product.name,
    quantity,
    unitPrice: product.unitPrice,
    lineTotal: Math.round(product.unitPrice * quantity * 100) / 100,
  };
}

function orderTotal(items: OrderLineItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
}

// Weighted so most generated orders behave normally — DELAYED is reserved
// for the two hand-authored storyline orders below, not left to chance.
const FILLER_STATUS_WEIGHTS: readonly [OrderStatus, number][] = [
  ['DELIVERED', 60],
  ['SHIPPED', 15],
  ['PROCESSING', 10],
  ['PENDING', 10],
  ['CANCELLED', 5],
];

function pickFillerStatus(rng: () => number): OrderStatus {
  const total = FILLER_STATUS_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [status, weight] of FILLER_STATUS_WEIGHTS) {
    if (roll < weight) {
      return status;
    }
    roll -= weight;
  }
  return 'DELIVERED';
}

function buildFillerOrder(rng: () => number, sequence: number): Order {
  const customer = pick(rng, CUSTOMERS);
  const itemCount = randomInt(rng, 1, 3);
  const items: OrderLineItem[] = [];
  const usedSkus = new Set<string>();
  while (items.length < itemCount) {
    const product = pick(rng, PRODUCTS);
    if (usedSkus.has(product.sku)) {
      continue;
    }
    usedSkus.add(product.sku);
    items.push(buildLineItem(product.sku, randomInt(rng, 1, 5)));
  }

  const status = pickFillerStatus(rng);
  const placedAt = randomDateInRange(rng);
  const expectedDeliveryAt = status === 'CANCELLED' ? null : addDays(placedAt, 7);
  const deliveredAt = status === 'DELIVERED' ? addDays(placedAt, randomInt(rng, 3, 10)) : null;

  return {
    id: `10${String(sequence).padStart(3, '0')}`,
    customerId: customer.id,
    status,
    items,
    total: orderTotal(items),
    placedAt,
    expectedDeliveryAt,
    deliveredAt,
    delayReason: null,
  };
}

function buildStorylineOrders(): Order[] {
  const primaryItems = [buildLineItem(SHORTAGE_SKU_PRIMARY, 3)];
  const secondaryItems = [buildLineItem(SHORTAGE_SKU_SECONDARY, 5)];

  return [
    {
      id: '10291',
      customerId: 'CUST-1005',
      status: 'DELAYED',
      items: primaryItems,
      total: orderTotal(primaryItems),
      placedAt: '2026-07-14',
      expectedDeliveryAt: '2026-07-21',
      deliveredAt: null,
      delayReason:
        `Inventory shortage: ${SHORTAGE_SKU_PRIMARY} (Precision Servo Motor) went out of stock ` +
        'before this order could be fulfilled; restock expected 2026-07-25.',
    },
    {
      id: '10305',
      customerId: 'CUST-1010',
      status: 'DELAYED',
      items: secondaryItems,
      total: orderTotal(secondaryItems),
      placedAt: '2026-08-02',
      expectedDeliveryAt: '2026-08-09',
      deliveredAt: null,
      delayReason:
        `Inventory shortage: ${SHORTAGE_SKU_SECONDARY} (Pressure Sensor) fell below the reorder ` +
        'threshold; this order is partially held pending restock.',
    },
  ];
}

function buildInventory(): InventoryItem[] {
  return PRODUCTS.map((product) => {
    if (product.sku === SHORTAGE_SKU_PRIMARY) {
      return {
        sku: product.sku,
        productName: product.name,
        warehouse: 'WH-EAST',
        quantityOnHand: 0,
        reorderThreshold: 20,
        status: 'OUT_OF_STOCK' as const,
      };
    }
    if (product.sku === SHORTAGE_SKU_SECONDARY) {
      return {
        sku: product.sku,
        productName: product.name,
        warehouse: 'WH-WEST',
        quantityOnHand: 8,
        reorderThreshold: 25,
        status: 'LOW_STOCK' as const,
      };
    }
    return {
      sku: product.sku,
      productName: product.name,
      warehouse: product.category === 'Packaging' ? 'WH-WEST' : 'WH-EAST',
      quantityOnHand: 120,
      reorderThreshold: 30,
      status: 'IN_STOCK' as const,
    };
  });
}

function buildStorylineInventoryEvents(): InventoryEvent[] {
  return [
    {
      id: 'EVT-9001',
      sku: SHORTAGE_SKU_PRIMARY,
      type: 'SALE',
      quantityDelta: -20,
      occurredAt: '2026-07-13',
      note: 'Bulk sale depleted remaining stock.',
    },
    {
      id: 'EVT-9002',
      sku: SHORTAGE_SKU_PRIMARY,
      type: 'SHORTAGE',
      quantityDelta: 0,
      occurredAt: '2026-07-15',
      note: 'Stock hit zero; flagged for expedited restock. ETA 2026-07-25.',
    },
    {
      id: 'EVT-9003',
      sku: SHORTAGE_SKU_SECONDARY,
      type: 'SALE',
      quantityDelta: -30,
      occurredAt: '2026-08-01',
      note: 'Large wholesale order reduced stock below reorder threshold.',
    },
    {
      id: 'EVT-9004',
      sku: SHORTAGE_SKU_SECONDARY,
      type: 'SHORTAGE',
      quantityDelta: 0,
      occurredAt: '2026-08-02',
      note: 'Stock below reorder threshold (8 remaining, threshold 25).',
    },
  ];
}

function buildFillerInventoryEvents(rng: () => number): InventoryEvent[] {
  const events: InventoryEvent[] = [];
  let sequence = 1;
  for (const product of PRODUCTS) {
    const eventCount = randomInt(rng, 2, 3);
    for (let i = 0; i < eventCount; i += 1) {
      const isRestock = rng() > 0.5;
      events.push({
        id: `EVT-${String(sequence).padStart(4, '0')}`,
        sku: product.sku,
        type: isRestock ? 'RESTOCK' : 'SALE',
        quantityDelta: isRestock ? randomInt(rng, 50, 150) : -randomInt(rng, 5, 40),
        occurredAt: randomDateInRange(rng),
        note: null,
      });
      sequence += 1;
    }
  }
  return events;
}

function byDateAscending<T extends { placedAt?: string; occurredAt?: string }>(a: T, b: T): number {
  const left = a.placedAt ?? a.occurredAt ?? '';
  const right = b.placedAt ?? b.occurredAt ?? '';
  return left.localeCompare(right);
}

export function buildDataset(): BusinessDataset {
  const rng = mulberry32(SEED);

  const fillerOrders = Array.from({ length: 30 }, (_, index) => buildFillerOrder(rng, index + 1));
  const orders = [...fillerOrders, ...buildStorylineOrders()].sort(byDateAscending);

  const inventoryEvents = [...buildFillerInventoryEvents(rng), ...buildStorylineInventoryEvents()].sort(
    byDateAscending,
  );

  return {
    customers: CUSTOMERS,
    products: PRODUCTS,
    orders,
    inventory: buildInventory(),
    inventoryEvents,
  };
}
