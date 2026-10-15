// Re-export Prisma types for convenience
export type { Link } from '@repo/prisma';

// API request/response types
export interface ApiEndpoint<TResponse = unknown> {
  url: string;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  _response?: TResponse; // Phantom type for inference
}

export interface ApiEndpointWithBody<
  TBody = unknown,
  TResponse = unknown,
> extends ApiEndpoint<TResponse> {
  body?: TBody;
}

// Link DTOs
export interface CreateLinkDto {
  title: string;
  url: string;
  description?: string;
}

export interface UpdateLinkDto {
  title?: string;
  url?: string;
  description?: string;
}

export type OrderStatus = 'PAID' | 'PREPARING' | 'READY' | 'REFUNDED';

export interface ActionCapability {
  allowed: boolean;
  reason: string | null;
}

export interface OrderCapabilities {
  refund: ActionCapability;
}

export interface OrderResponse {
  capabilities: OrderCapabilities;
  id: string;
  tenantId: string;
  storeId: string;
  region: string;
  customerId: string;
  status: OrderStatus;
  total: number;
}

export interface AccessSummary {
  actor: {
    name: string;
    role: 'CUSTOMER' | 'STORE_STAFF' | 'STORE_MANAGER' | 'HQ_ADMIN';
  };
  examples: Array<{ label: string; allowed: boolean; reason: string }>;
}
