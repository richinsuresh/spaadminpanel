'use client';

import Link from 'next/link';

export default function ClientCashSuccess() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        {/* Checkmark Icon */}
        <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        
        <h1 className="text-2xl font-bold text-black mb-3">
          Registration Successful!
        </h1>
        
        <p className="text-black mb-6">
          Send the screenshot of confirming the amount has received in the bank account to the backend.
        </p>
        
        {/* --- THIS IS THE FIX --- */}
        {/* 1. Removed the `legacyBehavior` prop.
          2. Moved the `className` from the <a> tag to the <Link> tag.
          3. Removed the inner <a> tag completely.
        */}
        <Link 
          href="/" 
          className="inline-block bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 text-white font-medium py-2 px-6 rounded-lg transition duration-300"
        >
          Back to Home
        </Link>
        {/* --- END OF FIX --- */}

      </div>
    </div>
  );
}