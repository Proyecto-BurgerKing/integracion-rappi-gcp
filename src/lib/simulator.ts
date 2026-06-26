import type {
  RappiOrderRequest,
  RappiStatusUpdate,
  OrderItem,
  Customer,
  TenantId,
} from "../types.js";

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

const STATUS_LOG: RappiStatusUpdate[] = [];

export function logStatusUpdate(update: RappiStatusUpdate): void {
  STATUS_LOG.push(update);
  console.log(
    `[Rappi] Order ${update.order_id} — ${update.status} (${update.step ?? "—"}) at ${update.timestamp}`,
  );
}

export function getStatusLog(): RappiStatusUpdate[] {
  return STATUS_LOG;
}
