// src/app/(protected)/dashboard/sales/[id]/page.tsx
'use client';

import React, { useState, useEffect, use } from 'react';
import { supabase } from '@/lib/supabase';
// Added MapPin icon for the outlet display
import { Clock, Loader2, DollarSign, Timer, ArrowLeft, MapPin } from 'lucide-react';
import { notFound, useRouter } from 'next/navigation';

// Type for the sale data
type SaleData = {
  id: string;
  name: string;
  check_in_time: string | null;
  session_hours: number | null;
  check_out_time: string | null;
  date: string;
  outlet_name: string; // 1. Added outlet_name to type
};

/* ===================== HELPERS ===================== */

const fmtTime = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
};

const getExpectedCheckoutTime = (
    checkIn: string | null,
    hours: number | null,
): Date | null => {
    if (!checkIn || !hours || hours <= 0) return null;
    const checkInDate = new Date(checkIn);
    const durationInMs = hours * 60 * 60 * 1000;
    return new Date(checkInDate.getTime() + durationInMs);
};

/* ===================== SUB-COMPONENTS ===================== */

const AddonTimingOptions: React.FC<{ sale: SaleData }> = ({ sale }) => {
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [addonTime, setAddonTime] = useState(0);

    const handleCheckout = async () => {
        setIsCheckingOut(true);
        try {
            const { error } = await supabase
                .from('customers')
                .update({ check_out_time: new Date().toISOString() })
                .eq('id', sale.id);

            if (error) throw error;
            alert(`Checked out ${sale.name} successfully!`);
            window.location.reload(); 
        } catch (e) {
            console.error("Checkout failed:", e);
            alert("Checkout failed.");
        } finally {
            setIsCheckingOut(false);
        }
    };

    const handleAddTime = async () => {
        if (addonTime <= 0) return;
        const newTotalHours = (sale.session_hours || 0) + (addonTime / 60);
        
        try {
            const { error } = await supabase
                .from('customers')
                .update({ session_hours: newTotalHours })
                .eq('id', sale.id);

            if (error) throw error;
            alert(`Added ${addonTime} minutes.`);
            window.location.reload(); 
        } catch (e) {
            console.error("Add time failed:", e);
        }
    };

    return (
        <div className="space-y-4">
            <h4 className="text-lg font-semibold border-b pb-2 text-gray-700">Actions</h4>
            <div className="bg-white p-4 rounded-lg shadow border border-yellow-200">
                <p className="text-sm font-medium text-yellow-700 mb-2">Extend Session</p>
                <div className="flex items-center space-x-3">
                    <input 
                        type="number" 
                        value={addonTime} 
                        onChange={(e) => setAddonTime(parseInt(e.target.value) || 0)}
                        className="w-24 p-2 border rounded-md text-black"
                        placeholder="Mins"
                    />
                    <button 
                        onClick={handleAddTime}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 rounded-md"
                        disabled={addonTime <= 0}
                    >
                        Add Time
                    </button>
                </div>
            </div>

            <button 
                onClick={handleCheckout} 
                disabled={isCheckingOut}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg disabled:opacity-50"
            >
                {isCheckingOut ? <Loader2 className="animate-spin mx-auto" /> : 'Complete Checkout'}
            </button>
        </div>
    );
};

/* ===================== MAIN PAGE ===================== */

export default function SaleDashboard({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  
  const router = useRouter();
  const [sale, setSale] = useState<SaleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSale = async () => {
      try {
        const { data, error } = await supabase
          .from('customers') 
          // 2. Added outlet_name to the select query
          .select('id, name, check_in_time, session_hours, check_out_time, date, outlet_name')
          .eq('id', id)
          .single();
        
        if (error) throw error;
        setSale(data as SaleData);
      } catch (e) {
        console.error("Error fetching sale:", e);
        setSale(null);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchSale();
  }, [id]);

  if (loading) return (
    <div className="flex flex-col justify-center items-center h-screen space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        <p className="text-gray-500 animate-pulse">Loading Sale Details...</p>
    </div>
  );

  if (!sale) return notFound();

  const expectedEnd = getExpectedCheckoutTime(sale.check_in_time, sale.session_hours);
  const isOverdue = !sale.check_out_time && expectedEnd && new Date() > expectedEnd;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 text-slate-900">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Back Navigation */}
        <button 
            onClick={() => router.push('/dashboard/sales')}
            className="flex items-center text-indigo-600 hover:text-indigo-800 transition font-bold"
        >
            <ArrowLeft size={20} className="mr-2" /> Back to Sales List
        </button>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100 gap-4">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">{sale.name}</h1>
                {/* 3. Displaying Outlet Name in the header section */}
                <div className="flex flex-col space-y-1 mt-1">
                    <div className="flex items-center text-indigo-600 font-bold">
                        <MapPin size={16} className="mr-1" />
                        <span>{sale.outlet_name || "Unknown Outlet"}</span>
                    </div>
                    <p className="text-gray-500 text-sm">Sale ID: {sale.id}</p>
                </div>
            </div>
            <span className={`px-4 py-2 rounded-full text-sm font-bold uppercase ${
                sale.check_out_time ? 'bg-green-100 text-green-700' : 
                isOverdue ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-yellow-100 text-yellow-700'
            }`}>
                {sale.check_out_time ? 'Completed' : isOverdue ? 'Overdue' : 'In Progress'}
            </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
                <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                    <Clock className="mr-2 text-indigo-500" /> Timing Information
                </h3>
                <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                        <span className="text-gray-500 font-bold">Check-in</span>
                        <span className="font-mono font-bold text-slate-900">{fmtTime(sale.check_in_time)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                        <span className="text-gray-500 font-bold">Duration</span>
                        <span className="font-mono font-bold text-slate-900">{sale.session_hours} hrs</span>
                    </div>
                    <div className={`flex justify-between items-center py-2 px-3 rounded-lg ${isOverdue ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <span className={isOverdue ? 'text-red-600 font-bold' : 'text-gray-500 font-bold'}>Expected End</span>
                        <span className={`font-mono font-bold ${isOverdue ? 'text-red-700' : 'text-gray-900'}`}>
                            {fmtTime(expectedEnd?.toISOString() || null)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                {!sale.check_out_time ? (
                    <AddonTimingOptions sale={sale} />
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2">
                        <div className="bg-green-100 p-4 rounded-full">
                            <DollarSign className="text-green-600 h-8 w-8" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">Payment Completed</h3>
                        <p className="text-gray-500 text-sm font-bold">This session was closed at {fmtTime(sale.check_out_time)}</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}