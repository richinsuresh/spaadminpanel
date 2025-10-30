// src/app/api/create-order/route.ts
import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'

export async function POST(req: Request) {
  try {
    const { amount, booking_id } = await req.json()

    if (!amount || !booking_id) {
      return NextResponse.json({ success: false, error: 'Missing amount or booking_id' })
    }

    const rzp = new Razorpay({
      key_id: process.env.RZP_KEY_ID!,
      key_secret: process.env.RZP_KEY_SECRET!
    })

    const order = await rzp.orders.create({
      amount,
      currency: 'INR',
      receipt: `booking_${booking_id}`,
      notes: { booking_id }
    })

    return NextResponse.json({
      success: true,
      key: process.env.RZP_KEY_ID, // publishable key
      order
    })
  } catch (err: any) {
    console.error('create-order error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error' },
      { status: 500 }
    )
  }
}
