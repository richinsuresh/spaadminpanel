// src/app/page.tsx
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-blue-500 p-8 text-center">
          <h1 className="text-3xl font-bold text-white">Berry Spa</h1>
          <p className="text-purple-200 mt-2">Admin Panel</p>
        </div>
        
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">💅</span>
            </div>
            <h2 className="text-2xl font-semibold text-gray-800">Welcome to Admin Panel</h2>
            <p className="text-gray-600 mt-2">
              Manage your spa clients, packages, and appointments
            </p>
          </div>
          
          <a 
            href="/login"
            className="w-full block bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 text-white font-medium py-3 px-4 rounded-lg transition duration-300 transform hover:scale-[1.02]"
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