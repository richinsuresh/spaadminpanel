'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, LineChart, Line, ReferenceLine, Label 
} from 'recharts';
import { TrendingUp, DollarSign, Store, Filter, Plus } from 'lucide-react';
import { OUTLETS } from '@/lib/outlet';

type SaleRecord = {
  date: string;
  amount_paid: number;
  outlet_name: string;
};

type AdMarker = {
  date: string;
  label: string;
};

export default function SalesSummaryPage() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [markers, setMarkers] = useState<AdMarker[]>([
    { date: '2024-03-01', label: 'Instagram Ads' },
  ]);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedOutlet, setSelectedOutlet] = useState('all');
  
  const [showAddMarker, setShowAddMarker] = useState(false);
  const [newMarker, setNewMarker] = useState({ date: '', label: '' });

  useEffect(() => {
    const fetchSalesData = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('date, amount_paid, outlet_name')
        .order('date', { ascending: true });

      if (!error && data) {
        setSales(data as SaleRecord[]);
      }
      setLoading(false);
    };
    fetchSalesData();
  }, []);

  /* ===================== DATA PROCESSING ===================== */
  const { chartData, outletData, totalSales, filteredCount, dailyMap } = useMemo(() => {
    const dMap: Record<string, number> = {}; 
    const outletMap: Record<string, number> = {};
    let total = 0;
    let count = 0;

    sales.forEach(s => {
      if (!s.date) return;
      const saleDate = s.date.split('T')[0];
      
      const isDateInRange = (!startDate || saleDate >= startDate) && (!endDate || saleDate <= endDate);
      const isOutletMatch = selectedOutlet === 'all' || s.outlet_name === selectedOutlet;

      if (isDateInRange && isOutletMatch) {
        const amount = (s.amount_paid || 0) / 100;
        dMap[saleDate] = (dMap[saleDate] || 0) + amount;
        outletMap[s.outlet_name] = (outletMap[s.outlet_name] || 0) + amount;
        total += amount;
        count++;
      }
    });

    const daily = Object.keys(dMap)
      .sort()
      .map(date => ({ 
        dateLabel: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), 
        sales: dMap[date],
        fullDate: date 
      }));

    const outlet = Object.keys(outletMap).map(name => ({ name, total: outletMap[name] }));

    return { chartData: daily, outletData: outlet, totalSales: total, filteredCount: count, dailyMap: dMap };
  }, [sales, startDate, endDate, selectedOutlet]);

  const handleAddMarker = () => {
    if (newMarker.date && newMarker.label) {
      setMarkers([...markers, newMarker]);
      setNewMarker({ date: '', label: '' });
      setShowAddMarker(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-black">Loading Summary...</div>;

  return (
    <div className="p-4 lg:p-8 bg-gray-50 min-h-screen space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Sales Summary</h1>
          <p className="text-gray-500">Analytics and growth tracking</p>
        </div>
        <button 
          onClick={() => setShowAddMarker(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus size={18} /> Add Marker
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow border border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full mt-1 p-2 border rounded text-black" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full mt-1 p-2 border rounded text-black" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Outlet</label>
          <select value={selectedOutlet} onChange={e => setSelectedOutlet(e.target.value)} className="w-full mt-1 p-2 border rounded text-black">
            <option value="all">All Outlets</option>
            {OUTLETS.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
          </select>
        </div>
        <button onClick={() => {setStartDate(''); setEndDate(''); setSelectedOutlet('all');}} className="p-2 text-indigo-600 text-sm font-medium hover:underline">
          Reset Filters
        </button>
      </div>

      {/* Main Growth Chart */}
      <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <TrendingUp size={20} className="text-indigo-500" /> 
          Sales Analytics
        </h2>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartData.length <= 3 ? (
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dateLabel" />
                <YAxis tickFormatter={(val) => `₹${val}`} />
                <Tooltip formatter={(val: any) => val !== undefined ? `₹${Number(val).toLocaleString()}` : '₹0'} />
                <Bar dataKey="sales" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={60} />
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dateLabel" padding={{ left: 30, right: 30 }} />
                <YAxis tickFormatter={(val) => `₹${val}`} />
                <Tooltip formatter={(val: any) => val !== undefined ? `₹${Number(val).toLocaleString()}` : '₹0'} />
                <Legend iconType="circle" />
                <Line 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#4f46e5" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#4f46e5' }} 
                  activeDot={{ r: 8 }} 
                  name="Daily Revenue"
                />
                
                {markers.map((m, i) => {
                  const markerLabel = new Date(m.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                  const exists = chartData.some(d => d.dateLabel === markerLabel);
                  if (!exists) return null;

                  return (
                    <ReferenceLine key={i} x={markerLabel} stroke="red" strokeDasharray="5 5">
                      <Label value={m.label} position="top" fill="red" fontSize={10} />
                    </ReferenceLine>
                  );
                })}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Revenue by Outlet */}
      <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Store size={20} className="text-indigo-500" /> Revenue by Outlet
        </h2>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={outletData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(val) => `₹${val}`} />
              <Tooltip formatter={(val: any) => val !== undefined ? `₹${Number(val).toLocaleString()}` : '₹0'} />
              <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Add Marker Modal */}
      {showAddMarker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md">
            <h3 className="text-lg font-bold text-black mb-4">Add Event Marker</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">DATE</label>
                <input 
                  type="date" 
                  className="w-full p-2 border rounded text-black"
                  value={newMarker.date}
                  onChange={e => setNewMarker({...newMarker, date: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">LABEL</label>
                <input 
                  type="text" 
                  className="w-full p-2 border rounded text-black"
                  value={newMarker.label}
                  onChange={e => setNewMarker({...newMarker, label: e.target.value})}
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowAddMarker(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded">Cancel</button>
                <button onClick={handleAddMarker} className="px-4 py-2 bg-indigo-600 text-white rounded">Add Marker</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}