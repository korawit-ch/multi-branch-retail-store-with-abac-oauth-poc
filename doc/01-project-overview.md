# Project overview

[Documentation index](README.md)

## Purpose

Branch & Co demonstrates how a store-management application can combine a shared catalog, branch inventory, orders, login, and authorization while preserving the original npm/Turborepo template structure. It is a learning and proof-of-concept application, not a complete point-of-sale or payment system.

The main question it answers is: **how can the same web application give staff, managers, and HQ different actions and resource scopes without trusting browser controls?** The answer combines database-backed role grants, resource attributes, server-side business checks, and advisory capabilities returned to the UI.

## What a user can do

The home page offers four workforce identities. The dashboard has Overview, Inventory, Orders, Activity, and My access sections. Users can inspect their branches, search products, record a sale, advance order preparation, and—when authorized—adjust stock or demonstrate a refund.

- A **staff member** at branch 10 can read the workspace, record sales, and prepare orders.
- A **manager** can do those things, adjust stock, and refund qualifying paid orders within a personal limit.
- **HQ** can work across assigned branches and adjust inventory. HQ has no automatic permission bypass and is not seeded with refund permission.
- A **customer** identity exists for API authorization examples. It can read its own orders but cannot open the retail workspace.

See [authorization](04-authorization-and-capabilities.md) for exact grants. Role labels alone do not determine every decision.

## Demonstration data

The [seed](../packages/prisma/prisma/seed.ts) creates tenant `thai-food`, region `TH`, with stores `10` (Siam Square) and `42` (Ari Neighborhood). Store `other-10` belongs to `other-company` and demonstrates tenant separation. Tenants are string attributes; there is no Tenant table.

Seeded identities are `mock-manager-10`, `mock-staff-10`, `mock-manager-42`, `mock-hq`, and `mock-customer`. Managers have a THB 500 refund limit. HQ is assigned stores 10 and 42. The customer has customer identifier `c-1` and no store assignment.

The five products are coffee, tea, rice, cookie, and tote. Branch 10 opening prices are respectively THB 85, 65, 120, 45, and 250; branch 42 adds THB 5 to each. Opening stock quantities are 32, 8, 24, 5, and 18. These are seed values, not permanently fixed live values.

Legacy orders exercise access rules:

- `900`: branch 42, customer `c-1`, PREPARING, total 300.
- `901`: branch 10, customer `c-2`, PAID, total 300; initially within a manager's limit.
- `902`: branch 10, customer `c-2`, PAID, total 800; above that limit.
- `903`: another tenant, customer `c-1`, PAID, total 100; matching a customer ID alone must not grant access.

These legacy orders have no line items or corresponding sale stock movements. The UI labels them as seeded examples. Sales created through the API do create items and movements.

## What the reference model became

The [existing PDF mapping](../RETAIL_DEMO.md) identifies these implemented relationships: Store → StoreProduct ← Product, Order → OrderItem → Product, StoreProduct → InventoryMovement, Role → RolePermission ← Permission, User → UserStore ← Store, and Store → AuditEvent.

The implementation deliberately keeps one role per user. It does not implement a UserRole many-to-many table, customer records, promotion workflows, payment attempts, payment-provider refunds, or webhook ingestion. The seeded `promotion.manage` permission is unused and ungranted.

A sale has one product line, a `walk-in` customer ID, and immediate PAID status. No payment is collected. A refund only changes an order to REFUNDED; it does not transfer money or return inventory.

## Reading the dashboard correctly

The API returns at most 50 recent orders and 15 recent audit events per branch. Sales totals are calculated from that order window, excluding REFUNDED orders. They are not complete daily, monthly, or lifetime financial reports. Low-stock indicators use a frontend threshold of fewer than 10 units.

Activity covers sale creation and inventory adjustment. It does not currently record order status changes, refunds, login attempts, or authorization denials. The catalog and assignments are seeded; there is no administration screen for managing them.

## Seed behavior matters

Rerunning the seed is not a clean reset. It resets role grants and user/store assignments, updates selected identity/store metadata, but preserves existing products, branch inventory, and orders through create-only upserts for those records. Opening movements are created when branch-product rows are first created. A refunded example order therefore stays refunded after reseeding.

Use an isolated database for demonstrations and integration checks. Do not apply this seed to a real organization: it overwrites authorization configuration and installs impersonation-friendly demo identities.
