'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { OUTLETS } from '@/lib/outlet';
import Image from 'next/image';
import Link from 'next/link';

function QRCodeComponent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const outletId = params.outletId as string;
  const amount = searchParams.get('amount');

  // Path to go back to the form
  const clientFormPath = `/client-form/${outletId}`;

  const outlet = OUTLETS.find((o) => o.id === outletId);
  const outletName = outlet?.name.replace('Berry Spa - ', '') || 'Client Form';

  // --- MANUAL GO BACK HANDLER ---
  const handleGoBack = () => {
    router.push(clientFormPath);
  };

  // --- ERROR HANDLING ---
  if (!outlet) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center text-red-600">
          <h1 className="text-xl font-bold">Error</h1>
          <p>Invalid Outlet ID. Please go back and try again.</p>
          <Link href="/" className="inline-block mt-4 text-sm text-red-600 hover:underline">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!amount) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center text-red-600">
          <h1 className="text-xl font-bold">Error</h1>
          <p>Amount missing. Please go back and try again.</p>
          <Link href="/" className="inline-block mt-4 text-sm text-red-600 hover:underline">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <h1 className="text-2xl font-bold text-black mb-2">
          Pay at {outlet.name}
        </h1>
        <p className="text-lg text-black mb-4">
          Please pay:{' '}
          <strong className="text-purple-700 text-2xl">₹{amount}</strong>
        </p>

        <div className="relative w-64 h-64 mx-auto border-4 border-purple-200 rounded-lg overflow-hidden my-4">
          <Image
            src={outlet.qrCodeUrl}
            alt={`UPI QR Code for ${outlet.name}`}
            layout="fill"
            objectFit="contain"
            priority
          />
        </div>

        <p className="text-sm text-gray-700 mt-4">
          Scan the code with any UPI app (GPay, PhonePe, Paytm).
        </p>

        {/* --- Instruction Text --- */}
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
          <p className="font-medium text-yellow-800 text-sm">
            <strong>Important:</strong> After payment, please send the confirmation
            screenshot to the backend.
          </p>
        </div>

        {/* --- Go Back Button (NO AUTO REDIRECT) --- */}
        <button
          onClick={handleGoBack}
          className="inline-flex items-center justify-center gap-2 mt-6 py-2 px-4 bg-gray-100 hover:bg-gray-200 text-purple-700 rounded-lg font-semibold transition-colors border border-purple-300 w-full"
        >
          <ArrowLeft size={18} />
          Back to {outletName} Form
        </button>
      </div>
    </div>
  );
}

// We wrap the component in Suspense for useSearchParams to work
export default function QRCodePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-black">
          Loading Payment...
        </div>
      }
    >
      <QRCodeComponent />
    </Suspense>
  );
}
