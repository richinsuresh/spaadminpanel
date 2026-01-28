'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Loader2, BarChart3, 
  ChevronRight, Search, Calendar as CalendarIcon,
  Trophy, AlertCircle, ArrowRight
} from 'lucide-react'; 
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';

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
  
  // Set default state to "Today"
  const todayISO = useMemo(() => formatDate(new Date()), []);
  const [startDate, setStartDate] = useState(todayISO);
  const [endDate, setEndDate] = useState(todayISO);
  
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortDirection] = useState<'asc' | 'desc'>('desc'); 
  
  // REALTIME PRESENCE STATE
  const [onlineOutlets, setOnlineOutlets] = useState<Set<string>>(new Set());

  // 1. Fetch Sales Data
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
    } catch (err) {
        console.error("Error fetching data:", err);
    } finally {
        setLoading(false);
    }
  }, []); 

  // 2. Listen for Online Presence
  useEffect(() => {
    const channel = supabase.channel('online-outlets');

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        const onlineIds = new Set<string>();
        
        // newState is { key: [ { outlet_id: '...', ... }, ... ] }
        Object.values(newState).forEach((presences: any) => {
            presences.forEach((p: any) => {
                if (p.outlet_id) onlineIds.add(p.outlet_id);
            });
        });
        
        setOnlineOutlets(onlineIds);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => { 
    fetchOutletData(startDate, endDate); 
  }, [startDate, endDate, fetchOutletData]);

  const { highestOutlet, lowestOutlet, totalRevenue, highestAmount, lowestAmount } = useMemo(() => {
    if (!outlets || outlets.length === 0) {
      return { highestOutlet: 'N/A', lowestOutlet: 'N/A', totalRevenue: 0, highestAmount: 0, lowestAmount: 0 };
    }
    const sorted = Array.from(outlets).sort((a, b) => b.periodSales - a.periodSales);
    return {
      highestOutlet: sorted[0]?.name || 'N/A',
      highestAmount: sorted[0]?.periodSales || 0,
      lowestOutlet: sorted[sorted.length - 1]?.name || 'N/A',
      lowestAmount: sorted[sorted.length - 1]?.periodSales || 0,
      totalRevenue: outlets.reduce((sum, o) => sum + (o.periodSales || 0), 0),
    };
  }, [outlets]);

  const processedOutlets = useMemo(() => {
    return Array.from(outlets)
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

  const chartData = Array.from(outlets).sort((a,b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 px-4 pt-6 bg-slate-50 min-h-screen">
      
      {/* 1. COMPACT TOP BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Outlet Analytics</h1>
          <p className="text-xs text-slate-500 font-medium">Network Revenue: <span className="text-indigo-600 font-bold">{formatCurrency(totalRevenue)}</span></p>
        </div>

        <div className="inline-flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-lg">
            <CalendarIcon size={14} className="text-slate-400" />
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
              className="bg-transparent border-none p-0 text-xs font-bold outline-none cursor-pointer text-slate-700" 
            />
            <ArrowRight size={12} className="text-slate-300" />
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
              className="bg-transparent border-none p-0 text-xs font-bold outline-none cursor-pointer text-slate-700" 
              max={todayISO} 
            />
          </div>
        </div>
      </div>

      {/* 2. PERFORMANCE CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600"><Trophy size={24} /></div>
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Top Performer</p>
              <h3 className="text-lg font-black text-slate-900 leading-tight">{highestOutlet}</h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-emerald-600">{formatCurrency(highestAmount)}</p>
            <p className="text-[10px] text-slate-400 font-bold">{totalRevenue > 0 ? Math.round((highestAmount/totalRevenue)*100) : 0}% share</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between border-l-4 border-l-rose-500">
          <div className="flex items-center gap-4">
            <div className="bg-rose-50 p-3 rounded-lg text-rose-600"><AlertCircle size={24} /></div>
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Needs Attention</p>
              <h3 className="text-lg font-black text-slate-900 leading-tight">{lowestOutlet}</h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-rose-600">{formatCurrency(lowestAmount)}</p>
            <p className="text-[10px] text-slate-400 font-bold">{totalRevenue > 0 ? Math.round((lowestAmount/totalRevenue)*100) : 0}% share</p>
          </div>
        </div>
      </div>

      {/* 3. CHART SECTION */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 size={16} className="text-indigo-600" />
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">Revenue Distribution</h2>
        </div>
        
        <div className="h-64 w-full min-h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} interval={0} />
              <YAxis hide />
              <Tooltip cursor={{fill: 'transparent'}} />
              <Bar dataKey="periodSales" radius={[4, 4, 4, 4]} barSize={32}>
                {chartData.map((entry, index) => {
                  let color = '#FBBF24'; 
                  if (entry.name === highestOutlet) color = '#10B981'; 
                  if (entry.name === lowestOutlet) color = '#EF4444';  
                  return <Cell key={`cell-${index}`} fill={color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. LEADERBOARD LIST */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Branch Rankings</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
            <input type="text" placeholder="Filter outlets..." className="pl-8 pr-3 py-1 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 w-40" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
            <tr>
              <th className="px-6 py-3 text-left">Branch</th>
              <th className="px-6 py-3 text-left">Revenue</th>
              <th className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {processedOutlets.map((outlet, i) => (
              <tr key={outlet.id} className="hover:bg-slate-50/80 transition-colors group cursor-pointer" onClick={() => router.push(`/dashboard/outlets/${outlet.id}`)}>
                <td className="px-6 py-4 flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-400 w-4">#{i + 1}</span>
                  <div>
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        {outlet.name}
                        {onlineOutlets.has(outlet.id) && (
                            <span className="flex h-2 w-2 relative" title="Outlet Dashboard is Open">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                        )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{outlet.location}</div>
                  </div>
                </td>
                <td className="px-6 py-4 font-bold text-slate-700 text-sm">{formatCurrency(outlet.periodSales)}</td>
                <td className="px-6 py-4 text-right"><ChevronRight size={14} className="inline text-slate-300 group-hover:text-indigo-600 transition-colors" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}