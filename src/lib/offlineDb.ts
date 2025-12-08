// src/lib/offlineDb.ts
import Dexie, { Table } from 'dexie';
import { OfflineClientPayload, PendingAdminOp } from './types';

export class OfflineDatabase extends Dexie {
  pending_clients!: Table<OfflineClientPayload, number>;
  pending_admin_ops!: Table<PendingAdminOp, number>;
  cached_customers!: Table<any, string>; // keyed by client_uuid or id string
  cached_packages!: Table<any, string>;
  cached_sales!: Table<any, string>;
  cached_employees!: Table<any, string>;
  cached_activity!: Table<any, string>;

  constructor() {
    super('spa_offline_db_v1');
    this.version(1).stores({
      pending_clients: '++id, client_uuid, status, created_local_at',
      pending_admin_ops: '++id, op_uuid, table, status, created_at',
      cached_customers: 'id, client_uuid, mobile, name',
      cached_packages: 'id, mobile, status',
      cached_sales: 'id, invoice_no',
      cached_employees: 'id, name',
      cached_activity: 'id, created_at'
    });

    this.pending_clients = this.table('pending_clients');
    this.pending_admin_ops = this.table('pending_admin_ops');
    this.cached_customers = this.table('cached_customers');
    this.cached_packages = this.table('cached_packages');
    this.cached_sales = this.table('cached_sales');
    this.cached_employees = this.table('cached_employees');
    this.cached_activity = this.table('cached_activity');
  }
}

export const offlineDb = new OfflineDatabase();
