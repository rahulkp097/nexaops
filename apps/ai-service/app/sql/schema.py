# The entire allowlist for Phase 12's SQL validator (spec §21: "Allowlist
# tables and columns"). One flat analytics table by design — see
# infra/database/migrations/..._create-sales-orders-analytics-table.js —
# so there is no join graph to reason about: every Table/Column node found
# anywhere in a generated query's AST must resolve into this one table's
# column set, full stop.
ALLOWED_TABLE = "sales_orders"

ALLOWED_COLUMNS: dict[str, str] = {
    "order_id": "text, unique order id, e.g. '10291'",
    "customer_id": "text, e.g. 'CUST-1005'",
    "customer_name": "text, the customer's display name",
    "customer_segment": "text, one of 'retail', 'enterprise', 'wholesale'",
    "status": "text, one of 'PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'DELAYED', 'CANCELLED'",
    "total": "numeric, the order total in dollars",
    "placed_at": "date, when the order was placed",
    "delivered_at": "date, nullable — null means not yet delivered",
}

SCHEMA_DESCRIPTION = (
    f"Table: {ALLOWED_TABLE}\n"
    "Columns:\n"
    + "\n".join(f"  - {name}: {description}" for name, description in ALLOWED_COLUMNS.items())
    + "\n\nThis is the only table that exists as far as you are concerned. There are no other "
    "tables, and no way to join to anything else."
)
