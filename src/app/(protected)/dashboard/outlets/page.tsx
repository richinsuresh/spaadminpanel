'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Loader2, ArrowUp, ArrowDown, BarChart3, 
  MapPin, ChevronRight, Search, Calendar as CalendarIcon,
  Trophy, AlertCircle, DollarSign
} from 'lucide-react'; 
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, LabelList } from 'recharts';

type Outlet = {
  id: string;
  name: string;
  location: string;
  periodSales: number; 
};

const formatDate = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function OutletsPage() {
  const router = useRouter();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  const [startDate, setStartDate] = useState(formatDate(sevenDaysAgo));
  const [endDate, setEndDate] = useState(formatDate(today));
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc'); 

  const fetchOutletData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
        const { data: customerData, error } = await supabase
            .from('customers')
            .select('outlet_name, package_amount, amount_paid, took_package, date')
            .gte('date', start)
            .lte('date', end);

        if (error) throw error;

        const salesMap = new Map<string, number>();
        OUTLETS.forEach(o => salesMap.set(o.name, 0));

        customerData?.forEach(sale => {
            const amount = sale.took_package ? (sale.package_amount || 0) : (sale.amount_paid || 0);
            if (sale.outlet_name && salesMap.has(sale.outlet_name)) {
                salesMap.set(sale.outlet_name, (salesMap.get(sale.outlet_name) || 0) + amount);
            }
        });

        setOutlets(OUTLETS.map(o => ({
            id: o.id, name: o.name, location: o.location, periodSales: salesMap.get(o.name) || 0,
        })));
    } finally {
        setLoading(false);
    }
  }, []); 

  useEffect(() => { fetchOutletData(startDate, endDate); }, [startDate, endDate, fetchOutletData]);

  const { highestOutlet, lowestOutlet, totalRevenue, maxSaleValue } = useMemo(() => {
    if (outlets.length === 0) return { highestOutlet: '', lowestOutlet: '', totalRevenue: 0, maxSaleValue: 0 };
    const sorted = [...outlets].sort((a, b) => b.periodSales - a.periodSales);
    return {
      highestOutlet: sorted[0].name,
      lowestOutlet: sorted[sorted.length - 1].name,
      totalRevenue: outlets.reduce((sum, o) => sum + o.periodSales, 0),
      maxSaleValue: sorted[0].periodSales || 1
    };
  }, [outlets]);

  const processedOutlets = useMemo(() => {
    return [...outlets]
      .filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => sortDirection === 'desc' ? b.periodSales - a.periodSales : a.periodSales - b.periodSales);
  }, [outlets, sortDirection, searchTerm]);

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount / 100);

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="animate-spin text-indigo-700 w-10 h-10" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 px-4 pt-4">
      {/* 1. TOP DATE FILTER BAR */}
      <div className="bg-slate-900 p-5 rounded-2xl shadow-xl text-white flex flex-col md:flex-row items-center justify-between gap-6 border-b-4 border-indigo-600">
        <div className="flex items-center gap-4">
           <div className="bg-indigo-600 p-3 rounded-xl"><CalendarIcon size={22} /></div>
           <div className="flex gap-4">
             <div className="flex flex-col">
               <span className="text-[10px] text-slate-500 font-black uppercase mb-1">From</span>
               <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border-none p-0 text-sm font-bold outline-none cursor-pointer" />
             </div>
             <div className="flex flex-col">
               <span className="text-[10px] text-slate-500 font-black uppercase mb-1">To</span>
               <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border-none p-0 text-sm font-bold outline-none cursor-pointer" />
             </div>
           </div>
        </div>
        <div className="text-right">
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Network Sales</p>
           <p className="text-2xl font-black">{formatCurrency(totalRevenue)}</p>
        </div>
      </div>

      {/* 2. HIGHLIGHT CARDS (STRAIGHTFORWARD LABELS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-5 border-l-8 border-l-emerald-500">
          <div className="bg-emerald-100 p-4 rounded-xl text-emerald-600"><Trophy size={32} /></div>
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Highest Sales Outlet</p>
            <h3 className="text-xl font-black text-slate-900">{highestOutlet}</h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-5 border-l-8 border-l-rose-500">
          <div className="bg-rose-100 p-4 rounded-xl text-rose-600"><AlertCircle size={32} /></div>
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Lowest Sales Outlet</p>
            <h3 className="text-xl font-black text-slate-900">{lowestOutlet}</h3>
          </div>
        </div>
      </div>

      {/* 3. PERFORMANCE INDEX CHART */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-slate-100 p-2 rounded-lg text-slate-600"><BarChart3 size={20} /></div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Growth Distribution</h2>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={outlets.sort((a,b) => a.name.localeCompare(b.name))} margin={{ top: 25 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }} interval={0} />
              <YAxis hide />
              <Bar dataKey="periodSales" radius={[6, 6, 6, 6]} barSize={40}>
                {outlets.map((entry, index) => {
                  let color = '#FBBF24'; // Yellow
                  if (entry.name === highestOutlet) color = '#10B981'; // Green
                  if (entry.name === lowestOutlet) color = '#EF4444'; // Red
                  return <Cell key={index} fill={color} />;
                })}
                <LabelList dataKey="periodSales" position="top" content={({ x, y, width, value, index }: any) => {
                  const name = outlets[index]?.name;
                  if (name === highestOutlet || name === lowestOutlet) {
                    return <text x={(x as number) + (width as number) / 2} y={(y as number) - 10} fill="#0f172a" textAnchor="middle" className="text-[10px] font-black">{formatCurrency(value)}</text>;
                  }
                  return null;
                }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. BRANCH STANDINGS TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">League Standings</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
            <input type="text" placeholder="Search..." className="pl-9 pr-4 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-slate-900 w-48" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="px-8 py-4 text-left">Branch Name</th>
              <th className="px-8 py-4 text-left">Period Revenue</th>
              <th className="px-8 py-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {processedOutlets.map((outlet, i) => (
              <tr key={outlet.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => router.push(`/dashboard/outlets/${outlet.id}`)}>
                <td className="px-8 py-5">
                   <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>{i + 1}</div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{outlet.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{outlet.location}</p>
                      </div>
                   </div>
                </td>
                <td className="px-8 py-5 font-black text-slate-900 text-sm">{formatCurrency(outlet.periodSales)}</td>
                <td className="px-8 py-5 text-right">
                  <div className="inline-flex p-2 rounded-xl bg-slate-50 text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                    <ChevronRight size={18} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}