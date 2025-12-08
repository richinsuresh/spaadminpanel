// components/OfflineSync.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { offlineDb } from '@/lib/offlineDb'
import type { OfflineClientPayload, PendingAdminOp } from '@/lib/types'

export default function OfflineSync() {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [pendingClientCount, setPendingClientCount] = useState<number>(0)
  const [pendingAdminCount, setPendingAdminCount] = useState<number>(0)

  useEffect(() => {
    updateCounts()
    syncAll()
    const syncId = setInterval(syncAll, 15000)
    const countId = setInterval(updateCounts, 4000)
    return () => {
      clearInterval(syncId)
      clearInterval(countId)
    }
  }, [])

  async function updateCounts() {
    try {
      const pc = await offlineDb.pending_clients.where('status').equals('pending').count()
      const pa = await offlineDb.pending_admin_ops.where('status').equals('pending').count()
      setPendingClientCount(pc)
      setPendingAdminCount(pa)
    } catch (err) {
      console.warn('offline count err', err)
    }
  }

  async function syncAll() {
    if (syncing) return
    setSyncing(true)
    try {
      await syncPendingClients()
      await syncPendingAdminOps()
      setLastSync(new Date())
      updateCounts()
    } catch (err) {
      console.warn('offline syncAll error', err)
    } finally {
      setSyncing(false)
    }
  }

  // Sync pending_clients using your /api/client-form-submit bulk endpoint
  async function syncPendingClients() {
    try {
      const pending: OfflineClientPayload[] = await offlineDb.pending_clients.where('status').equals('pending').limit(50).toArray()
      if (!pending || pending.length === 0) return

      const serverPayload = pending.map(p => {
        const { id, status, created_local_at, sync_error, ...rest } = p
        return rest
      })

      const res = await fetch('/api/client-form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: serverPayload })
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const errMsg = body?.error || `${res.status} ${res.statusText}`
        await Promise.all(pending.map(pc =>
          offlineDb.pending_clients.update(pc.id!, { sync_error: errMsg, status: 'pending' })
        ))
        return
      }

      const body = await res.json().catch(() => ({}))
      const results = body?.results || []

      // Process per-item results and update local queue
      for (let i = 0; i < pending.length; i++) {
        const local = pending[i]
        const result = results[i] || null
        if (!result) {
          // assume failure
          await offlineDb.pending_clients.update(local.id!, { status: 'failed', sync_error: 'No result from server' })
          continue
        }
        if (['created', 'updated', 'deleted', 'skipped'].includes(result.status)) {
          await offlineDb.pending_clients.update(local.id!, { status: 'synced', sync_error: null })
        } else {
          await offlineDb.pending_clients.update(local.id!, { status: 'failed', sync_error: result.error || 'Server failure' })
        }
      }
    } catch (err: any) {
      console.warn('syncPendingClients failed', err)
    }
  }

  // Sync pending_admin_ops grouped by table
  async function syncPendingAdminOps() {
    try {
      const pendingOps: PendingAdminOp[] = await offlineDb.pending_admin_ops.where('status').equals('pending').limit(200).toArray()
      if (!pendingOps || pendingOps.length === 0) return

      // Group by table so we can call the right API endpoint in bulk
      const groups: Record<string, PendingAdminOp[]> = {}
      for (const op of pendingOps) {
        groups[op.table] = groups[op.table] || []
        groups[op.table].push(op)
      }

      for (const table of Object.keys(groups)) {
        const ops = groups[table]
        // create server payload array: map op => { op, op_uuid, payload }
        const serverPayload = ops.map(o => ({ op: o.op, op_uuid: o.op_uuid, payload: o.payload }))

        // Determine endpoint for table
        let endpoint = '/api/' + table
        // special-case: if table is 'customers' use '/api/customers' (that's fine)
        // The server endpoints must accept { bulk: [...] } payload (we already updated customers)
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bulk: serverPayload })
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const errMsg = body?.error || `${res.status} ${res.statusText}`
          await Promise.all(ops.map(op => offlineDb.pending_admin_ops.update(op.id!, { last_error: errMsg, status: 'pending' })))
          continue
        }

        const body = await res.json().catch(() => ({}))
        const results = body?.results || []

        // Mark individual ops as synced/failed depending on server response
        for (let i = 0; i < ops.length; i++) {
          const local = ops[i]
          const result = results[i] || null
          if (!result) {
            await offlineDb.pending_admin_ops.update(local.id!, { status: 'failed', last_error: 'No server result' })
            continue
          }
          if (['created', 'updated', 'deleted', 'skipped'].includes(result.status)) {
            await offlineDb.pending_admin_ops.update(local.id!, { status: 'synced', last_error: null })
          } else {
            await offlineDb.pending_admin_ops.update(local.id!, { status: 'failed', last_error: result.error || 'Server failure' })
          }
        }
      }
    } catch (err: any) {
      console.warn('syncPendingAdminOps failed', err)
    }
  }

  const totalPending = pendingClientCount + pendingAdminCount
  const statusText = syncing ? 'Syncing…' : (totalPending > 0 ? `${totalPending} pending` : 'Synced')
  const dotColor = syncing ? '#f59e0b' : (totalPending > 0 ? '#f87171' : '#34d399')
  const title = syncing ? 'Attempting to sync — will retry automatically' : (lastSync ? `Last sync: ${lastSync.toLocaleString()}` : 'No sync yet')

  return (
    <button
      type="button"
      onClick={() => { try { window.location.href = '/admin/offline-queue' } catch {} }}
      title={title}
      aria-label={`Offline sync status: ${statusText}`}
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 9999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 999,
        background: 'rgba(10,12,18,0.7)',
        color: '#E6EEF3',
        fontSize: 13,
        fontWeight: 600,
        border: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(6px)',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: dotColor,
          boxShadow: `0 0 8px ${dotColor}33`
        }}
      />
      <span style={{ whiteSpace: 'nowrap' }}>{statusText}</span>
    </button>
  )
}
