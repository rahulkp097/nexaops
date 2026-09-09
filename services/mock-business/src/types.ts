export type CustomerSegment = 'retail' | 'enterprise' | 'wholesale';

export interface Customer {
  id: string;
  name: string;
  email: string;
  segment: CustomerSegment;
  createdAt: string; // ISO date
}

export interface Product {
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
}

export type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'DELAYED' | 'CANCELLED';

export interface OrderLineItem {
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  items: OrderLineItem[];
  total: number;
  placedAt: string; // ISO date
  expectedDeliveryAt: string | null;
  deliveredAt: string | null;
  // Populated only for DELAYED orders — explains the delay in plain
  // language so an LLM tool caller can answer "why" without guessing.
  delayReason: string | null;
}

export type InventoryStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface InventoryItem {
  sku: string;
  productName: string;
  warehouse: string;
  quantityOnHand: number;
  reorderThreshold: number;
  status: InventoryStatus;
}

export type InventoryEventType = 'RESTOCK' | 'SALE' | 'ADJUSTMENT' | 'SHORTAGE';

export interface InventoryEvent {
  id: string;
  sku: string;
  type: InventoryEventType;
  quantityDelta: number;
  occurredAt: string; // ISO date
  note: string | null;
}

export interface MonthlyRevenue {
  month: string; // 'YYYY-MM'
  revenue: number;
  orderCount: number;
}

export interface RevenueAnalytics {
  from: string;
  to: string;
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  byMonth: MonthlyRevenue[];
}

export interface BusinessDataset {
  customers: Customer[];
  products: Product[];
  orders: Order[];
  inventory: InventoryItem[];
  inventoryEvents: InventoryEvent[];
}
