import type {
  ApiEndpoint,
  ApiEndpointWithBody,
  OrderStatus,
  OrderCapabilities,
} from './types.js';
import type { Permission } from '@repo/authorization';

export interface RetailDashboard {
  actor: {
    id: string;
    name: string;
    role: string;
    permissions: Permission[];
  };
  stores: Array<{
    id: string;
    name: string;
    address: string;
    products: Array<{
      id: string;
      price: number;
      stock: number;
      isAvailable: boolean;
      product: { name: string; sku: string; category: string };
    }>;
    orders: Array<{
      capabilities: OrderCapabilities;
      id: string;
      status: OrderStatus;
      total: number;
      createdAt: string;
      items: Array<{
        id: string;
        quantity: number;
        unitPrice: number;
        productNameSnapshot: string;
      }>;
    }>;
    audits: Array<{
      id: string;
      actorId: string;
      action: string;
      detail: string;
      createdAt: string;
    }>;
  }>;
}
export const retailApi = {
  dashboard: (): ApiEndpoint<RetailDashboard> => ({
    url: '/retail',
    method: 'GET',
  }),
  adjust: (
    id: string,
    body: { delta: number; reason: string },
  ): ApiEndpointWithBody<typeof body, { ok: boolean }> => ({
    url: `/retail/inventory/${encodeURIComponent(id)}/adjust`,
    method: 'POST',
    body,
  }),
  sale: (body: {
    storeProductId: string;
    quantity: number;
  }): ApiEndpointWithBody<typeof body, { id: string }> => ({
    url: '/retail/sales',
    method: 'POST',
    body,
  }),
};
