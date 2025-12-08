// src/lib/useOfflineQueue.ts
import { useCallback } from 'react';
import { offlineDb } from './offlineDb';
import { v4 as uuidv4 } from 'uuid';
import type { PendingAdminOp, OfflineClientPayload } from './types';

/**
 * enqueueAdminOp({table, op, payload})
 * returns the inserted local record
 */
export async function enqueueAdminOp(table: PendingAdminOp['table'], op: PendingAdminOp['op'], payload: Record<string, any>) {
  const record: PendingAdminOp = {
    op_uuid: uuidv4(),
    table,
    op,
    payload,
    created_at: new Date().toISOString(),
    status: 'pending',
    last_error: null,
  };
  const id = await offlineDb.pending_admin_ops.add(record);
  return { ...record, id };
}

/**
 * enqueueClientPayload(payload) -> adds to pending_clients (client form)
 */
export async function enqueueClientPayload(payload: OfflineClientPayload) {
  const rec: OfflineClientPayload = {
    ...payload,
    client_uuid: payload.client_uuid || (payload.client_uuid ?? `local-${Date.now()}-${Math.random()}`),
    created_local_at: new Date().toISOString(),
    status: 'pending',
    sync_error: null,
  };
  const id = await offlineDb.pending_clients.add(rec);
  return { ...rec, id };
}
