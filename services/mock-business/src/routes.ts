import { NextFunction, Request, Response, Router } from 'express';
import { ApiError, NotFoundApiError } from './errors';
import { getCustomerById, getInventoryBySku, getOrderById, getRevenueAnalytics, listInventoryEvents, listOrders } from './store';
import { parseDateRange, parseOptionalOrderStatus } from './validation';

// Every handler here is synchronous (the store is an in-memory array, no
// I/O) — a thin try/catch per route, rather than an async wrapper, is
// enough to funnel ApiErrors into the error-handling middleware below.
export const router = Router();

router.get('/customers/:id', (req, res) => {
  const customer = getCustomerById(req.params.id);
  if (!customer) {
    throw new NotFoundApiError(`Customer not found: ${req.params.id}`);
  }
  res.json(customer);
});

router.get('/orders', (req, res) => {
  const status = parseOptionalOrderStatus(req.query.status);
  const range = parseDateRange(req.query as Record<string, unknown>);
  res.json(listOrders({ status, range }));
});

router.get('/orders/:id', (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) {
    throw new NotFoundApiError(`Order not found: ${req.params.id}`);
  }
  res.json(order);
});

router.get('/inventory/events', (req, res) => {
  const range = parseDateRange(req.query as Record<string, unknown>);
  res.json(listInventoryEvents(range));
});

router.get('/inventory/:sku', (req, res) => {
  const item = getInventoryBySku(req.params.sku);
  if (!item) {
    throw new NotFoundApiError(`Inventory item not found: ${req.params.sku}`);
  }
  res.json(item);
});

router.get('/analytics/revenue', (req, res) => {
  const range = parseDateRange(req.query as Record<string, unknown>);
  res.json(getRevenueAnalytics(range));
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('Unexpected error handling request', err);
  res.status(500).json({ error: 'Internal server error' });
}
