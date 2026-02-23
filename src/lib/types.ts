// src/lib/types.ts
export type OfflineStatus = 'pending' | 'synced' | 'failed';

export type OfflineClientPayload = {
  id?: number; // local dexie id
  client_uuid?: string | null;

  // core client/session fields
  name?: string;
  mobile?: string;
  date?: string;
  treatment?: string;
  amountPaid?: number;
  sessionHours?: number;
  client_type?: string | null; // <--- ADDED THIS LINE

  // package-related fields
  isPackageCustomer?: boolean;
  tookPackage?: boolean;
  packageAmount?: number;
  totalPackageHours?: number;
  packageSoldBy?: string | null;
  packageValidity?: string | null;
  packageId?: string | null; // package id (active package being used)

  // outlet / payment / therapist
  outlet?: string;
  outlet_id?: string | null;
  paymentMethod?: string | null;
  finalAmountInPaise?: number | null;
  check_in_time?: string | null;
  therapist_name?: string | null;
  therapist_primary?: string | null;
  therapist_secondary?: string | null;
  room?: string | null;

  // group customers
  group_customers?: any[] | null;

  // local metadata for sync
  created_local_at?: string;
  status?: OfflineStatus;
  sync_error?: string | null;
};

export type PendingAdminOp = {
  id?: number;
  op_uuid: string; // unique per op
  table: 'customers' | 'packages' | 'sales' | 'employees' | 'activity' | string;
  op: 'create' | 'update' | 'delete';
  payload: Record<string, any>;
  created_at: string;
  status?: OfflineStatus;
  last_error?: string | null;
};