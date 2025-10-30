// src/app/book/page.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// client-side Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://yzjiguddhthfpngbnxhw.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6amlndWRkaHRoZnBuZ2JueGh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTQ5MDgsImV4cCI6MjA3NTYzMDkwOH0.RZ1olHxZUQFRkHQSTvgPNHkgt9b5Vc45ldf86CayfTg"
)

export default function BookPage() {
  const [loading, setLoading] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  // dynamically load Razorpay checkout script (avoid <Script/> to fix Turbopack parse issues)
  useEffect(() => {
    const src = 'https://checkout.razorpay.com/v1/checkout.js'
    if (document.querySelector(`script[src="${src}"]`)) {
      setScriptLoaded(true)
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => setScriptLoaded(true)
    s.onerror = () => {
      console.error('Failed to load Razorpay script')
      setScriptLoaded(false)
    }
    document.body.appendChild(s)
    return () => {
      // don't remove script on unmount — keep it cached for future opens
    }
  }, [])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    try {
      const form = e.currentTarget
      const name = (form.elements.namedItem('name') as HTMLInputElement).value
      const email = (form.elements.namedItem('email') as HTMLInputElement).value
      const phone = (form.elements.namedItem('phone') as HTMLInputElement).value
      const serviceRaw = (form.elements.namedItem('service') as HTMLSelectElement).value
      const [service, amountStr] = serviceRaw.split('|')
      const amount = parseInt(amountStr || '0', 10) // amount in paise

      if (!amount || isNaN(amount)) throw new Error('Invalid amount')

      // 1) Save booking to Supabase (status pending)
      const { data: record, error: insertErr } = await supabase
        .from('bookings')
        .insert([{ name, email, phone, service, amount, payment_status: 'pending' }])
        .select()
        .single()

      if (insertErr) throw insertErr
      const booking_id = (record as any).id

      // 2) Ask server to create a Razorpay order (server uses RZP_KEY_SECRET)
      const createResp = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id, amount })
      })
      const j = await createResp.json()
      if (!j.success) throw new Error(j.error || 'Order creation failed')

      if (!scriptLoaded) {
        throw new Error('Razorpay script not loaded')
      }

      // 3) Open Razorpay Checkout with the returned order
      const options = {
        key: j.key, // publishable key from server response
        amount: j.order.amount,
        currency: 'INR',
        name: 'REEF SPA',
        description: service,
        order_id: j.order.id,
        handler: async function (response: any) {
          // client-side UX update (server webhook is authoritative)
          try {
            // optional: update booking row immediately for UX
            await supabase
              .from('bookings')
              .update({
                payment_status: 'paid',
                razorpay_payment_id: response.razorpay_payment_id
              })
              .eq('id', booking_id)
          } catch (uErr) {
            console.warn('Could not update booking client-side', uErr)
          }
          // redirect to a thank-you page or show success
          window.location.href = '/thankyou'
        },
        prefill: { name, email, contact: phone },
        notes: { booking_id },
        theme: { color: '#F37254' }
      }

      // open Razorpay (avoid TS error by casting)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const rzp = new (window as any).Razorpay(options)
      rzp.open()
    } catch (err: any) {
      console.error('booking error', err)
      alert('Error: ' + (err?.message || 'unknown'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: 'auto', padding: 24 }}>
      <h1>Book & Pay</h1>

      <form onSubmit={onSubmit}>
        <input
          name="name"
          placeholder="Full Name"
          required
          className="border p-2 w-full mb-4"
        />

        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="border p-2 w-full mb-4"
        />

        <input
          name="phone"
          placeholder="Phone"
          required
          className="border p-2 w-full mb-4"
        />

        <select
          name="service"
          defaultValue="Massage|49900"
          className="border p-2 w-full mb-4"
        >
          <option value="Massage|49900">Massage — ₹499</option>
          <option value="Facial|69900">Facial — ₹699</option>
          <option value="Full Body Massage|99900">Full Body Massage — ₹999</option>
        </select>

        <button
          type="submit"
          disabled={loading}
          className="bg-pink-500 text-white py-2 px-4 rounded disabled:opacity-50"
        >
          {loading ? 'Processing…' : 'Save & Pay'}
        </button>
      </form>

      {!scriptLoaded && (
        <p style={{ marginTop: 12, color: '#666' }}>
          Loading payment options…
        </p>
      )}
    </div>
  )
}
