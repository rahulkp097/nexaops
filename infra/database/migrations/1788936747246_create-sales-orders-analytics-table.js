/**
 * A read-only analytics fact table for Phase 12's safe natural-language-
 * to-SQL tool — the "approved revenue/order dataset" spec §21's own
 * example refers to ("What was our revenue in August?"). Deliberately a
 * single flat table (no joins to validate/allowlist) and deliberately not
 * organization-scoped: it mirrors services/mock-business's shared demo
 * dataset (Phase 10), which has no tenant concept either — see
 * app/tools/business_client.py's docstring for the same reasoning.
 *
 * Seeded once, here, with the exact output of services/mock-business's
 * buildDataset() at the time this migration was written (customers
 * joined in by id) — not read live from that service — so NL-to-SQL's
 * answers stay consistent with query_sales/calculate_metric (Phase 11)
 * without ai-service needing a runtime dependency on it. If
 * mock-business's seed ever changes meaningfully, this table needs a new
 * migration to re-sync; it is not kept live in sync automatically.
 *
 * nexaops_readonly already has SELECT on every table via the default
 * privileges set up in 1788459208557_create-db-roles-and-grants.js, so no
 * additional GRANT is needed here.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('sales_orders', {
    order_id: { type: 'text', primaryKey: true },
    customer_id: { type: 'text', notNull: true },
    customer_name: { type: 'text', notNull: true },
    customer_segment: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true },
    total: { type: 'numeric(10,2)', notNull: true },
    placed_at: { type: 'date', notNull: true },
    delivered_at: { type: 'date' },
  });

  pgm.createIndex('sales_orders', 'placed_at');
  pgm.createIndex('sales_orders', 'status');

  pgm.sql(`
    INSERT INTO sales_orders
      (order_id, customer_id, customer_name, customer_segment, status, total, placed_at, delivered_at)
    VALUES
    ('10024', 'CUST-1006', 'Silverline Traders', 'wholesale', 'DELIVERED', 162, '2026-04-02'::date, '2026-04-11'::date),
    ('10014', 'CUST-1007', 'Maple Street Electronics', 'retail', 'DELIVERED', 736.6, '2026-04-03'::date, '2026-04-11'::date),
    ('10018', 'CUST-1002', 'Blue Harbor Logistics', 'wholesale', 'DELIVERED', 104.25, '2026-04-07'::date, '2026-04-12'::date),
    ('10017', 'CUST-1002', 'Blue Harbor Logistics', 'wholesale', 'SHIPPED', 37.5, '2026-04-09'::date, NULL),
    ('10006', 'CUST-1006', 'Silverline Traders', 'wholesale', 'DELIVERED', 501, '2026-04-10'::date, '2026-04-20'::date),
    ('10009', 'CUST-1004', 'Cedar Point Manufacturing', 'enterprise', 'PROCESSING', 529.5, '2026-04-10'::date, NULL),
    ('10004', 'CUST-1001', 'Acme Robotics', 'enterprise', 'DELIVERED', 33.75, '2026-04-19'::date, '2026-04-24'::date),
    ('10023', 'CUST-1009', 'Harbor View Supplies', 'wholesale', 'DELIVERED', 302, '2026-05-02'::date, '2026-05-08'::date),
    ('10022', 'CUST-1004', 'Cedar Point Manufacturing', 'enterprise', 'DELIVERED', 17.8, '2026-05-12'::date, '2026-05-16'::date),
    ('10019', 'CUST-1010', 'Sunrise Componentry', 'retail', 'SHIPPED', 216, '2026-05-22'::date, NULL),
    ('10001', 'CUST-1007', 'Maple Street Electronics', 'retail', 'DELIVERED', 44.5, '2026-05-23'::date, '2026-06-01'::date),
    ('10005', 'CUST-1006', 'Silverline Traders', 'wholesale', 'SHIPPED', 33, '2026-05-27'::date, NULL),
    ('10012', 'CUST-1004', 'Cedar Point Manufacturing', 'enterprise', 'DELIVERED', 51, '2026-05-31'::date, '2026-06-07'::date),
    ('10028', 'CUST-1007', 'Maple Street Electronics', 'retail', 'DELIVERED', 75, '2026-06-03'::date, '2026-06-12'::date),
    ('10025', 'CUST-1004', 'Cedar Point Manufacturing', 'enterprise', 'DELIVERED', 18.75, '2026-06-14'::date, '2026-06-20'::date),
    ('10030', 'CUST-1003', 'Nova Retail Group', 'retail', 'DELIVERED', 177, '2026-06-14'::date, '2026-06-22'::date),
    ('10029', 'CUST-1002', 'Blue Harbor Logistics', 'wholesale', 'PROCESSING', 538.2, '2026-06-15'::date, NULL),
    ('10020', 'CUST-1008', 'Redwood Industrial', 'enterprise', 'PROCESSING', 108, '2026-06-20'::date, NULL),
    ('10007', 'CUST-1005', 'Northwind Robotics', 'enterprise', 'DELIVERED', 20.25, '2026-07-01'::date, '2026-07-04'::date),
    ('10015', 'CUST-1006', 'Silverline Traders', 'wholesale', 'DELIVERED', 655, '2026-07-08'::date, '2026-07-12'::date),
    ('10002', 'CUST-1010', 'Sunrise Componentry', 'retail', 'PROCESSING', 50, '2026-07-10'::date, NULL),
    ('10291', 'CUST-1005', 'Northwind Robotics', 'enterprise', 'DELAYED', 267, '2026-07-14'::date, NULL),
    ('10016', 'CUST-1002', 'Blue Harbor Logistics', 'wholesale', 'PENDING', 93.75, '2026-07-18'::date, NULL),
    ('10305', 'CUST-1010', 'Sunrise Componentry', 'retail', 'DELAYED', 160, '2026-08-02'::date, NULL),
    ('10003', 'CUST-1002', 'Blue Harbor Logistics', 'wholesale', 'DELIVERED', 108, '2026-08-08'::date, '2026-08-17'::date),
    ('10010', 'CUST-1004', 'Cedar Point Manufacturing', 'enterprise', 'SHIPPED', 96, '2026-08-16'::date, NULL),
    ('10026', 'CUST-1006', 'Silverline Traders', 'wholesale', 'DELIVERED', 15.3, '2026-08-24'::date, '2026-08-31'::date),
    ('10008', 'CUST-1003', 'Nova Retail Group', 'retail', 'PROCESSING', 268.25, '2026-08-25'::date, NULL),
    ('10011', 'CUST-1009', 'Harbor View Supplies', 'wholesale', 'PROCESSING', 171.5, '2026-09-04'::date, NULL),
    ('10027', 'CUST-1001', 'Acme Robotics', 'enterprise', 'DELIVERED', 8.9, '2026-09-04'::date, '2026-09-07'::date),
    ('10013', 'CUST-1001', 'Acme Robotics', 'enterprise', 'DELIVERED', 386, '2026-09-05'::date, '2026-09-13'::date),
    ('10021', 'CUST-1009', 'Harbor View Supplies', 'wholesale', 'DELIVERED', 50, '2026-09-08'::date, '2026-09-16'::date)
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('sales_orders');
};
