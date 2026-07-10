import type {
  RappiOrderRequest,
  OrderItem,
  Customer,
  TenantId,
} from "../types.js";

// --- Menu / data fixtures ---

const MENU: OrderItem[] = [
  { name: "Whopper", quantity: 1, price: 18.9 },
  { name: "Whopper Doble", quantity: 1, price: 24.9 },
  { name: "King de Pollo", quantity: 2, price: 16.9 },
  { name: "Big King", quantity: 1, price: 19.9 },
  { name: "Papas Fritas Grandes", quantity: 2, price: 9.9 },
  { name: "Coca-Cola 500ml", quantity: 3, price: 7.9 },
];

const CUSTOMERS: Customer[] = [
  { name: "Maria Garcia", phone: "987654321" },
  { name: "Carlos Lopez", phone: "987654322" },
  { name: "Ana Martinez" },
  { name: "Pedro Sanchez", phone: "987654323" },
];

const TENANTS: TenantId[] = [
  "sucursal_lima_centro",
  "sucursal_huacho",
  "sucursal_miraflores",
];

export function generateOrder(
  overrides?: Partial<RappiOrderRequest>,
): RappiOrderRequest {
  const itemCount = 1 + Math.floor(Math.random() * 4);
  const items = Array.from({ length: itemCount }, () => ({
    ...MENU[Math.floor(Math.random() * MENU.length)],
  }));

  return {
    tenant_id:
      overrides?.tenant_id ??
      TENANTS[Math.floor(Math.random() * TENANTS.length)],
    source: "RAPPI",
    customer:
      overrides?.customer ??
      CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)],
    items: overrides?.items ?? items,
  };
}

// --- Order tracking store ---

export interface TrackedOrder {
  order_id: string;
  tenant_id: string;
  status: string;
  history: StatusEntry[];
  tracked_at: string;
}

export const orderStore = new Map<string, TrackedOrder>();

export function trackOrder(awsBody: Record<string, unknown>): TrackedOrder {
  const entry: TrackedOrder = {
    order_id: awsBody.order_id as string,
    tenant_id: awsBody.tenant_id as string,
    status: (awsBody.status as string) ?? "PENDIENTE_COCINA",
    history: [],
    tracked_at: new Date().toISOString(),
  };
  orderStore.set(entry.order_id, entry);
  console.log(`[Rappi] Tracking order ${entry.order_id} (tenant: ${entry.tenant_id})`);
  return entry;
}

// --- AWS status polling ---

const ORDER_STATUSES = [
  "PENDIENTE_COCINA",
  "PENDIENTE_EMPAQUE",
  "PENDIENTE_REPARTO",
  "COMPLETADO",
  "CANCELADO",
] as const;

export async function fetchOrderStatus(
  orderId: string,
  tenantId: string,
  awsApiUrl: string,
): Promise<{ found: boolean; status?: string; order?: Record<string, unknown> }> {
  for (const status of ORDER_STATUSES) {
    try {
      const res = await fetch(
        `${awsApiUrl}/orders?tenant_id=${encodeURIComponent(tenantId)}&status=${encodeURIComponent(status)}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!res.ok) continue;

      const data = await res.json() as { orders?: Record<string, unknown>[] } | Record<string, unknown>[];
      const orders: Record<string, unknown>[] = Array.isArray(data)
        ? data
        : ((data as { orders?: Record<string, unknown>[] }).orders ?? []);

      const match = orders.find((o) => o.order_id === orderId);
      if (match) {
        return { found: true, status: match.status as string, order: match };
      }
    } catch {
      // probe failed for this status — try next
    }
  }
  return { found: false };
}

// --- Status update log (incoming webhook events from AWS) ---

export interface StatusEntry {
  order_id: string;
  tenant_id?: string;
  status: string;
  step: string | null;
  timestamp: string;
}

const STATUS_LOG: StatusEntry[] = [];

export function logStatusUpdate(update: StatusEntry): StatusEntry {
  STATUS_LOG.push(update);
  const tracked = orderStore.get(update.order_id);
  if (tracked) {
    tracked.status = update.status;
    tracked.history.push(update);
  }
  return update;
}

export function getStatusLog(): StatusEntry[] {
  return STATUS_LOG;
}
