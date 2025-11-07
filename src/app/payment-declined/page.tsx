'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function DeclinedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const outletId = searchParams.get('outletId');
  const amount = searchParams.get('amount');

  const handleGoBack = () => {
    if (outletId) {
      router.push(`/client-form/${outletId}`);
    } else {
      router.push('/'); // Fallback
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 rounded-2xl shadow-2xl p-8 border border-red-700">
        <h1 className="text-3xl font-bold text-red-500 text-center mb-4">Payment Declined</h1>
        <p className="text-center text-gray-300 mb-2">
          The amount entered (₹{amount || '0'}) is below the minimum required (₹1800).
        </p>
        <p className="text-center text-gray-400 text-sm mb-8">
          Please go back and correct the amount or consult the front desk for assistance.
        </p>

        <button
          onClick={handleGoBack}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition duration-300"
        >
          Go Back to Form
        </button>
      </div>
    </div>
  );
}

// Use Suspense to handle search parameters
export default function PaymentDeclinedPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DeclinedContent />
    </Suspense>
  );
}