'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, retailApi } from '@repo/api-client';
import { can as canPerform, type Permission } from '@repo/authorization';
import { Button } from '@repo/ui/button';
import { ApiError, clientFetch } from '../lib/fetch/client';

const money = (n: number) =>
  new Intl.NumberFormat('en-TH', { style: 'currency', currency: 'THB' }).format(
    n,
  );
const sections = [
  'Overview',
  'Inventory',
  'Orders',
  'Activity',
  'My access',
] as const;
type Section = (typeof sections)[number];

export function StoreDashboard() {
  const cache = useQueryClient();
  const [overrideRefund, setOverrideRefund] = useState(false);
  const [refundResult, setRefundResult] = useState<{
    orderId: string;
    status: number | null;
    body: unknown;
  } | null>(null);
  const [section, setSection] = useState<Section>('Overview');
  const [branch, setBranch] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [adjustId, setAdjustId] = useState('');
  const [saleOpen, setSaleOpen] = useState(false);
  const query = useQuery({
    queryKey: ['retail'],
    queryFn: () => clientFetch(retailApi.dashboard()),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      setAdjustId('');
      setSaleOpen(false);
      setNotice('Saved successfully. Your branch is up to date.');
      await cache.invalidateQueries({ queryKey: ['retail'] });
    },
  });
  const refund = useMutation({
    mutationFn: (id: string) => clientFetch(ordersApi.refund(id)),
    onMutate: () => {
      setRefundResult(null);
    },
    onSuccess: (body, orderId) => {
      setRefundResult({ orderId, status: 201, body });
    },
    onError: (error, orderId) => {
      setRefundResult({
        orderId,
        status: error instanceof ApiError ? error.status : null,
        body:
          error instanceof ApiError
            ? error.responseBody
            : { message: error.message },
      });
    },
    onSettled: async () => {
      await cache.invalidateQueries({ queryKey: ['retail'] });
    },
  });
  if (query.isPending)
    return (
      <main className="state-screen">
        <span className="brand-mark">b.</span>
        <h1>Opening your branch…</h1>
      </main>
    );
  if (query.isError || !query.data)
    return (
      <main className="state-screen">
        <h1>Unable to open the workspace</h1>
        <p>{query.error?.message}</p>
        <p>
          Sign in with a staff, manager, or HQ account. Customer accounts do not
          have store access.
        </p>
        <Link className="primary-link" href="/">
          Back to sign in
        </Link>
        <button
          onClick={() => {
            void query.refetch();
          }}
        >
          Try again
        </button>
      </main>
    );
  const { actor, stores } = query.data;
  const store = stores.find((s) => s.id === branch) || stores[0];
  const can = (permission: Permission) => canPerform(actor, permission);
  const products =
    store?.products.filter((p) =>
      `${p.product.name} ${p.product.sku}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  const orders = store?.orders || [];
  const lowStock = store?.products.filter((p) => p.stock < 10) || [];
  const busy = mutation.isPending || refund.isPending;
  const run = (action: () => Promise<unknown>) => {
    setNotice('');
    mutation.mutate(action);
  };
  const orderTable = (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Items / customer</th>
            <th>Status</th>
            <th>Total</th>
            <th>Next step</th>
            <th>Demo refund</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <strong>#{o.id.slice(0, 8)}</strong>
                <small>{new Date(o.createdAt).toLocaleDateString()}</small>
              </td>
              <td>
                {o.items.length
                  ? o.items
                      .map(
                        (i) =>
                          `${i.quantity} × ${i.productNameSnapshot} (${money(i.unitPrice)} each)`,
                      )
                      .join(', ')
                  : 'Seeded example order'}
              </td>
              <td>
                <span
                  className={`pill ${{ READY: 'green', REFUNDED: '', PAID: 'amber', PREPARING: 'amber' }[o.status]}`}
                >
                  {o.status.toLowerCase()}
                </span>
              </td>
              <td>{money(o.total)}</td>
              <td>
                {can('order.update_status') &&
                (o.status === 'PAID' || o.status === 'PREPARING') ? (
                  <button
                    className="text-action"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        clientFetch(
                          ordersApi.updateStatus(
                            o.id,
                            o.status === 'PAID' ? 'PREPARING' : 'READY',
                          ),
                        ),
                      )
                    }
                  >
                    {o.status === 'PAID' ? 'Start preparing' : 'Mark ready'} →
                  </button>
                ) : (
                  <span className="muted">No action</span>
                )}
              </td>
              <td>
                <button
                  className="text-action"
                  aria-label={`Refund order ${o.id}`}
                  disabled={
                    busy || (!o.capabilities.refund.allowed && !overrideRefund)
                  }
                  onClick={() => refund.mutate(o.id)}
                >
                  Refund
                </button>
                <small className="refund-reason">
                  {o.capabilities.refund.allowed
                    ? 'Allowed by backend'
                    : o.capabilities.refund.reason}
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && (
        <p className="empty">
          No orders yet. Record your first sale to get started.
        </p>
      )}
    </div>
  );
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">b.</span> branch & co
          <span className="brand-dot">®</span>
        </Link>
        <div className="workspace-label">RETAIL WORKSPACE</div>
        <nav aria-label="Workspace">
          {sections.map((item, i) => (
            <button
              key={item}
              className={section === item ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setSection(item);
                setNotice('');
              }}
            >
              <span aria-hidden="true">{['◫', '▦', '≡', '◷', '◇'][i]}</span>
              {item}
              {item === 'Inventory' && lowStock.length > 0 && (
                <b>{lowStock.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" /> Demo workspace
          <p>
            One catalog.
            <br />
            Every branch in sync.
          </p>
          <small>Local OAuth · PostgreSQL</small>
        </div>
        <div className="profile">
          <div className="avatar">{actor.name.slice(0, 1)}</div>
          <div>
            <strong>{actor.name}</strong>
            <small>{actor.role.replaceAll('_', ' ').toLowerCase()}</small>
          </div>
        </div>
        <form action={'/auth/logout'} method="post">
          <button className="logout">Sign out ↗</button>
        </form>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            Workspace <span className="muted">/ {section}</span>
          </span>
          <span className="environment">
            <span className="live-dot" /> Sandbox · THB
          </span>
        </header>
        <main className="dashboard-content">
          <div className="heading-row">
            <div>
              <p className="eyebrow">YOUR STORE, AT A GLANCE</p>
              <h1>
                {section === 'Overview' ? 'A good day starts here.' : section}
              </h1>
              <p className="muted">
                {section === 'Overview'
                  ? 'Keep your shelves stocked and your orders moving.'
                  : 'A clear view of what is happening in your branch.'}
              </p>
            </div>
            <label className="branch-select">
              <span>Active branch</span>
              <select
                value={store?.id || ''}
                disabled={busy}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setOverrideRefund(false);
                  setRefundResult(null);
                  setAdjustId('');
                  setSaleOpen(false);
                }}
                aria-label="Active branch"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {notice && (
            <p role="status" className="notice">
              ✓ {notice}
            </p>
          )}
          {mutation.isError && (
            <p role="alert" className="error">
              {mutation.error.message}
            </p>
          )}
          {!store ? (
            <div className="panel empty">
              No branches assigned. Ask your administrator for branch access.
            </div>
          ) : (
            <>
              {section === 'Overview' && (
                <>
                  <div className="branch-banner">
                    <div>
                      <span className="pill">BRANCH {store.id}</span>
                      <h2>{store.name}</h2>
                      <p>{store.address}</p>
                    </div>
                    <Button
                      className="retail-button"
                      disabled={!can('order.create') || busy}
                      onClick={() => setSaleOpen(true)}
                    >
                      ＋ Record a sale
                    </Button>
                  </div>
                  <div className="stats">
                    <article>
                      <p>Sales · recent 50 orders</p>
                      <h2>
                        {money(
                          orders
                            .filter((o) => o.status !== 'REFUNDED')
                            .reduce((sum, o) => sum + o.total, 0),
                        )}
                      </h2>
                      <small>Excludes refunded orders</small>
                    </article>
                    <article>
                      <p>Orders in progress</p>
                      <h2>
                        {
                          orders.filter((o) =>
                            ['PAID', 'PREPARING'].includes(o.status),
                          ).length
                        }
                        <span> orders</span>
                      </h2>
                      <small>Paid and preparing</small>
                    </article>
                    <article>
                      <p>Units on the shelf</p>
                      <h2>
                        {store.products.reduce((sum, p) => sum + p.stock, 0)}
                        <span> units</span>
                      </h2>
                      <small>Across {store.products.length} products</small>
                    </article>
                    <article>
                      <p>Needs a restock</p>
                      <h2 className="amber-text">
                        {lowStock.length}
                        <span> products</span>
                      </h2>
                      <small>Fewer than 10 units available</small>
                    </article>
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>A little attention goes a long way</h2>
                        <span className="pill amber">Low stock</span>
                      </div>
                      {lowStock.map((p) => (
                        <div className="stock-row" key={p.id}>
                          <div className="product-tile">
                            {p.product.name.slice(0, 1)}
                          </div>
                          <div className="grow">
                            <strong>{p.product.name}</strong>
                            <small>{p.product.sku}</small>
                          </div>
                          <span className="amber-text">{p.stock} left</span>
                          <button
                            className="text-action"
                            onClick={() => setSection('Inventory')}
                          >
                            View →
                          </button>
                        </div>
                      ))}
                      {!lowStock.length && (
                        <p className="empty">All shelves are well stocked.</p>
                      )}
                    </section>
                    <section className="tip-card">
                      <span className="eyebrow">BUILT AROUND YOUR BRANCH</span>
                      <h2>
                        The right access.
                        <br />
                        The right store.
                      </h2>
                      <p>
                        Your role controls the actions you can take. Your branch
                        assignment controls where you can take them.
                      </p>
                      <button
                        className="text-action"
                        onClick={() => setSection('My access')}
                      >
                        Explore my permissions ↗
                      </button>
                    </section>
                  </div>
                </>
              )}
              {(section === 'Overview' || section === 'Orders') && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Recent orders</h2>
                      <p className="muted">Latest 50 orders for {store.name}</p>
                    </div>
                    {section === 'Orders' && (
                      <Button
                        className="retail-button"
                        disabled={!can('order.create') || busy}
                        onClick={() => setSaleOpen(true)}
                      >
                        ＋ Record a sale
                      </Button>
                    )}
                  </div>
                  <div className="capability-demo">
                    <strong>Try the authorization boundary</strong>
                    <p>
                      Refund buttons use capabilities returned by the API for
                      you and each order. This demo only changes order status;
                      it does not move money or return stock.
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={overrideRefund}
                        disabled={busy}
                        onChange={(event) =>
                          setOverrideRefund(event.target.checked)
                        }
                      />
                      Demo: enable denied refund buttons
                    </label>
                    <p>
                      The checkbox changes the UI only. Click a denied refund to
                      see the BFF denial. NestJS also checks direct API calls.
                      Allowed refunds still change the order.
                    </p>
                    {refundResult && (
                      <div role="status" className="backend-response">
                        <strong>
                          POST /orders/{refundResult.orderId}/refund —{' '}
                          {refundResult.status
                            ? `HTTP ${refundResult.status}`
                            : 'Network error'}
                        </strong>
                        <pre>{JSON.stringify(refundResult.body, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                  {orderTable}
                </section>
              )}
              {section === 'Inventory' && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Branch inventory</h2>
                      <p className="muted">
                        Local prices and stock, shared product catalog.
                      </p>
                    </div>
                    <input
                      aria-label="Search products"
                      placeholder="Search name or SKU…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Category</th>
                          <th>Branch price</th>
                          <th>On hand</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.product.name}</strong>
                              <small>{p.product.sku}</small>
                            </td>
                            <td>{p.product.category}</td>
                            <td>{money(p.price)}</td>
                            <td>
                              <span
                                className={`pill ${p.stock < 10 ? 'amber' : 'green'}`}
                              >
                                {p.stock} units
                              </span>
                            </td>
                            <td>
                              <button
                                className="text-action"
                                disabled={!can('inventory.adjust') || busy}
                                onClick={() => {
                                  mutation.reset();
                                  setAdjustId(p.id);
                                }}
                              >
                                Adjust stock
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!products.length && (
                      <p className="empty">No products match your search.</p>
                    )}
                  </div>
                  {!can('inventory.adjust') && (
                    <p className="footnote">
                      Your role can view inventory. A manager or HQ
                      administrator can adjust stock.
                    </p>
                  )}
                </section>
              )}
              {section === 'Activity' && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Branch activity</h2>
                    <span className="pill">Latest 15 events</span>
                  </div>
                  {store.audits.map((a) => (
                    <div className="stock-row" key={a.id}>
                      <div className="avatar">↗</div>
                      <div className="grow">
                        <strong>{a.action}</strong>
                        <p>{a.detail}</p>
                        <small>
                          {a.actorId} · {new Date(a.createdAt).toLocaleString()}
                        </small>
                      </div>
                    </div>
                  ))}
                  {!store.audits.length && (
                    <p className="empty">
                      Your next sale or stock adjustment will appear here.
                    </p>
                  )}
                </section>
              )}
              {section === 'My access' && (
                <section className="panel access-panel">
                  <p className="eyebrow">ROLE + BRANCH SCOPE</p>
                  <h2>{actor.role.replaceAll('_', ' ')}</h2>
                  <p>
                    Signed in as {actor.name}. Assigned branches:{' '}
                    {stores.map((s) => s.name).join(', ')}.
                  </p>
                  <div className="permission-list">
                    {(
                      [
                        'store.read',
                        'order.read',
                        'order.create',
                        'order.update_status',
                        'inventory.adjust',
                      ] as Permission[]
                    ).map((p) => (
                      <div key={p}>
                        <code>{p}</code>
                        <span className={`pill ${can(p) ? 'green' : ''}`}>
                          {can(p) ? 'Allowed' : 'Not granted'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="footnote">
                    The API checks permissions and branch scope on every
                    request. Choosing a branch never grants extra access.
                  </p>
                  <form action={'/auth/logout-all'} method="post">
                    <Button variant="secondary" type="submit">
                      Sign out on all devices
                    </Button>
                  </form>
                </section>
              )}
            </>
          )}
          <footer className="dashboard-footer">
            branch & co <span>Small store. Clear operations.</span>
          </footer>
        </main>
      </div>
      {(adjustId || saleOpen) && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) {
                setAdjustId('');
                setSaleOpen(false);
              }
              if (event.key !== 'Tab') return;
              const controls =
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not(:disabled), input, select',
                );
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
          >
            <button
              className="close"
              aria-label="Close dialog"
              disabled={busy}
              onClick={() => {
                setAdjustId('');
                setSaleOpen(false);
              }}
            >
              ×
            </button>
            <p className="eyebrow">{store?.name}</p>
            <h2 id="dialog-title">
              {adjustId ? 'Adjust inventory' : 'Record a sale'}
            </h2>
            <p className="muted">
              {adjustId
                ? 'Use a positive number to restock, or a negative number to remove units.'
                : 'Record a paid, single-product demo sale. Stock updates automatically.'}
            </p>
            {adjustId && (
              <p>
                {store?.products.find((p) => p.id === adjustId)?.product.name}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                if (adjustId)
                  run(() =>
                    clientFetch(
                      retailApi.adjust(adjustId, {
                        delta: Number(form.get('delta')),
                        reason: form.get('reason') as string,
                      }),
                    ),
                  );
                else
                  run(() =>
                    clientFetch(
                      retailApi.sale({
                        storeProductId: form.get('product') as string,
                        quantity: Number(form.get('quantity')),
                      }),
                    ),
                  );
              }}
            >
              {adjustId ? (
                <>
                  <label>
                    Quantity change
                    <input
                      autoFocus
                      name="delta"
                      type="number"
                      required
                      min="-10000"
                      max="10000"
                      step="1"
                      defaultValue="10"
                    />
                  </label>
                  <label>
                    Reason
                    <input
                      name="reason"
                      required
                      minLength={3}
                      maxLength={120}
                      placeholder="e.g. Delivery received"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Product
                    <select autoFocus name="product" required>
                      {store?.products
                        .filter((p) => p.isAvailable && p.stock > 0)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.product.name} · {money(p.price)} · {p.stock} left
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      max="1000"
                      step="1"
                      required
                      defaultValue="1"
                    />
                  </label>
                </>
              )}
              {mutation.isError && (
                <p role="alert" className="error">
                  {mutation.error.message}
                </p>
              )}
              <Button type="submit" className="retail-button" disabled={busy}>
                {busy ? (
                  'Saving…'
                ) : (
                  <>{adjustId ? 'Save adjustment' : 'Confirm paid sale'}</>
                )}
              </Button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
