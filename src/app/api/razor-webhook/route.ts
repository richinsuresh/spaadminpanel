// src/app/api/razorpay-webhook/route.ts
import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const config = { runtime: 'nodejs' } // ensure Node runtime so Buffer works (optional)

export async function POST(req: Request) {
  try {
    const raw = Buffer.from(await req.arrayBuffer())
    const signature = (req.headers.get('x-razorpay-signature') || '')
    const webhookSecret = process.env.RZP_WEBHOOK_SECRET || process.env.RZP_KEY_SECRET

    if (!webhookSecret) {
      console.error('Missing webhook secret')
      return new NextResponse('webhook secret not configured', { status: 500 })
    }

    const expected = crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex')
    if (expected !== signature) {
      console.warn('Invalid webhook signature', { expected, signature })
      return new NextResponse('invalid signature', { status: 400 })
    }

    const event = JSON.parse(raw.toString())
    // handle payment captured / authorized
    if (event.event === 'payment.captured' || event.event === 'payment.authorized') {
      const payment = event.payload?.payment?.entity
      const orderId = payment?.order_id
      const paymentId = payment?.id
      const razorpaySignature = payment?.signature ?? null

      if (orderId) {
        await supabaseServer
          .from('bookings')
          .update({
            payment_status: 'paid',
            razorpay_payment_id: paymentId,
            razorpay_signature: razorpaySignature,
          })
          .eq('razorpay_order_id', orderId)
      }
    }

    // handle payment.failed (optional)
    if (event.event === 'payment.failed') {
      const payment = event.payload?.payment?.entity
      const orderId = payment?.order_id
      if (orderId) {
        await supabaseServer
          .from('bookings')
          .update({ payment_status: 'failed' })
          .eq('razorpay_order_id', orderId)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('webhook handler error', err)
    return new NextResponse('server error', { status: 500 })
  }
}
