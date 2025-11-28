// src/app/client-success/page.tsx
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { OUTLETS } from '@/lib/outlet';

// --- 1. The Content Component (Uses search params) ---
function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const outletId = searchParams.get('outletId');
  
  // Set default button text to handle cases where outletId is missing
  const [outletName, setOutletName] = useState('Home');
  const [redirectPath, setRedirectPath] = useState('/');

  useEffect(() => {
    let path = '/';
    let name = 'Client Form';

    if (outletId) {
      // 1. Find the outlet name for the button text (and clean up the name if needed)
      const found = OUTLETS.find(o => o.id === outletId);
      if (found) {
        // Assuming the full name is like "Berry Spa - Location", we display only "Location"
        name = found.name.replace('Berry Spa - ', '');
      }
      
      // 2. Set the correct redirection path to the client form
      path = `/client-form/${outletId}`;
      setOutletName(name);
    }
    
    setRedirectPath(path);

    // --- AUTOMATIC REDIRECT ---
    const timer = setTimeout(() => {
        router.push(path);
    }, 5000);

    return () => clearTimeout(timer); // Cleanup timer on component unmount
  }, [outletId, router]);

  const handleGoBack = () => {
    // This button redirects to the dynamically set path (client form or default home)
    router.push(redirectPath);
  };

  // Determine the final button text
  const buttonText = outletId ? `Back to ${outletName} Form` : 'Back to Home';

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 text-center">
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full border border-gray-700">
        
        <div className="flex justify-center mb-6">
          <CheckCircle className="w-20 h-20 text-green-500 animate-bounce" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Success!</h1>
        <p className="text-gray-600 mb-8">
          The sale has been recorded successfully.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleGoBack}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/30"
          >
            <ArrowLeft size={20} />
            {buttonText}
          </button>
        </div>
      </div>
      
      <p className="text-gray-500 text-xs mt-8">
        Redirecting in 5 seconds...
      </p>
    </div>
  );
}

// --- 2. The Page Component (Wraps content in Suspense) ---
export default function ClientCashSuccessPage() {
  return (
    // Suspense is required when using useSearchParams in a client component during build
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}