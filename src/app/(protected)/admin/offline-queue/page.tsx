// src/app/(protected)/admin/offline-queue/page.tsx
'use client'
import React, { useEffect, useState } from 'react'
import { offlineDb } from '@/lib/offlineDb'
import { PendingAdminOp } from '@/lib/types'

export default function AdminOfflineQueuePage() {
  const [adminOps, setAdminOps] = useState<PendingAdminOp[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchQueues()
  }, [])

  async function fetchQueues() {
    setLoading(true)
    try {
      const a = await offlineDb.pending_admin_ops.orderBy('created_at').reverse().toArray()
      const c = await offlineDb.pending_clients.orderBy('created_local_at').reverse().toArray()
      setAdminOps(a)
      setClients(c)
    } catch (e) {
      console.warn('fetchQueues', e)
    } finally {
      setLoading(false)
    }
  }

  async function retryAdminOp(id?: number) {
    if (!id) return
    const op = await offlineDb.pending_admin_ops.get(id)
    if (!op) return
    await offlineDb.pending_admin_ops.update(id, { status: 'pending', last_error: null })
    // trigger global sync by navigating or calling window.dispatch
    window.location.reload()
  }

  async function deleteAdminOp(id?: number) {
    if (!id) return
    await offlineDb.pending_admin_ops.delete(id)
    fetchQueues()
  }

  async function retryClient(id?: number) {
    if (!id) return
    await offlineDb.pending_clients.update(id, { status: 'pending', sync_error: null })
    window.location.reload()
  }

  async function deleteClient(id?: number) {
    if (!id) return
    await offlineDb.pending_clients.delete(id)
    fetchQueues()
  }

  return (
    <div className="min-h-screen p-6 bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Offline Queue</h1>
        <p className="text-sm text-gray-400 mb-6">Pending admin operations and client entries stored locally.</p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Admin Operations ({adminOps.length})</h2>
          {loading ? <div>Loading...</div> : adminOps.length === 0 ? <div className="text-gray-400">No admin operations pending.</div> : (
            <div className="space-y-3">
              {adminOps.map(op => (
                <div key={op.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-start">
                  <div>
                    <div className="text-sm text-gray-300"><strong>{op.op.toUpperCase()}</strong> — {op.table}</div>
                    <div className="text-xs text-gray-400 mt-1">op_uuid: {op.op_uuid}</div>
                    <pre className="text-xs text-gray-300 mt-2 max-w-3xl overflow-auto">{JSON.stringify(op.payload, null, 2)}</pre>
                    {op.last_error && <div className="mt-2 text-sm text-red-400">Error: {op.last_error}</div>}
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    <button onClick={() => retryAdminOp(op.id)} className="px-3 py-1 bg-green-600 rounded">Retry</button>
                    <button onClick={() => deleteAdminOp(op.id)} className="px-3 py-1 bg-red-700 rounded">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Client Entries ({clients.length})</h2>
          {loading ? <div>Loading...</div> : clients.length === 0 ? <div className="text-gray-400">No pending client entries.</div> : (
            <div className="space-y-3">
              {clients.map(c => (
                <div key={c.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-start">
                  <div>
                    <div className="text-sm text-gray-300"><strong>{c.name || 'Unnamed'}</strong> — {c.mobile}</div>
                    <div className="text-xs text-gray-400 mt-1">client_uuid: {c.client_uuid}</div>
                    <pre className="text-xs text-gray-300 mt-2 max-w-3xl overflow-auto">{JSON.stringify(c, null, 2)}</pre>
                    {c.sync_error && <div className="mt-2 text-sm text-red-400">Error: {c.sync_error}</div>}
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    <button onClick={() => retryClient(c.id)} className="px-3 py-1 bg-green-600 rounded">Retry</button>
                    <button onClick={() => deleteClient(c.id)} className="px-3 py-1 bg-red-700 rounded">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
