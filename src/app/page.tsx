// src/app/page.tsx
import Image from 'next/image'; // Import the Image component

export default function LandingPage() {
  return (
    // --- UPDATED THEME: Dark gradient background ---
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-700">
        
        {/* --- UPDATED THEME: Red gradient header --- */}
        <div className="bg-gradient-to-r from-red-700 to-red-900 p-8 text-center">
          
          {/* --- NEW: Added your logo --- */}
          <Image
            src="/favicon.ico" // Path to your logo
            alt="Company Logo"
            width={80} // Set a size
            height={80} // Set a size
            className="mx-auto mb-4 rounded-full border-2 border-white/50"
          />
          
          <h1 className="text-3xl font-bold text-white">Spa Admin Panel</h1>
          <p className="text-red-200 mt-2">Management Portal</p>
        </div>
        
        <div className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-white">Welcome</h2>
            <p className="text-gray-400 mt-2">
              Manage clients, packages, and sales.
            </p>
          </div>
          
          {/* --- UPDATED THEME: Red button --- */}
          <a 
            href="/login"
            className="w-full block bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition duration-300 text-center"
          >
            Login to Dashboard
          </a>
          
          <p className="text-center text-gray-500 text-sm mt-6">
            For authorized personnel only
          </p>
        </div>
      </div>
    </div>
  );
}