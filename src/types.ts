export type TenantId = `sucursal_${string}`;

export type OrderSource = "WEB_PROPIA" | "RAPPI";

export type OrderStatus =
  | "PENDIENTE_COCINA"
  | "PENDIENTE_EMPAQUE"
  | "PENDIENTE_REPARTO"
  | "COMPLETADO"
  | "CANCELADO";

export type StepName = "COCINA" | "EMPAQUE" | "REPARTO";

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Customer {
  name: string;
  phone?: string;
}

export interface RappiOrderRequest {
  tenant_id: TenantId;
  source: OrderSource;
  customer: Customer;
  items: OrderItem[];
}

export interface RappiStatusUpdate {
  order_id: string;
  tenant_id: string;
  status: OrderStatus;
  step: StepName | null;
  timestamp: string;
}
