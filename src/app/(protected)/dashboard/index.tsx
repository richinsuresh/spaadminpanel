// pages/dashboard/index.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  took_package: boolean;
  created_at: string;
}

export default function Dashboard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching customers:', error);
    } else {
      setCustomers(data || []);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Berry Spa Admin</h1>
        <Link href="/customers/add">
          <button style={{ padding: '0.5rem 1rem', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}>
            ➕ Add Customer
          </button>
        </Link>
      </div>

      {loading ? (
        <p>Loading customers...</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ddd', padding: '0.5rem' }}>Name</th>
              <th style={{ border: '1px solid #ddd', padding: '0.5rem' }}>Mobile</th>
              <th style={{ border: '1px solid #ddd', padding: '0.5rem' }}>Email</th>
              <th style={{ border: '1px solid #ddd', padding: '0.5rem' }}>Package</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td style={{ border: '1px solid #ddd', padding: '0.5rem' }}>{customer.name}</td>
                <td style={{ border: '1px solid #ddd', padding: '0.5rem' }}>{customer.mobile}</td>
                <td style={{ border: '1px solid #ddd', padding: '0.5rem' }}>{customer.email || '—'}</td>
                <td style={{ border: '1px solid #ddd', padding: '0.5rem' }}>
                  {customer.took_package ? '✅' : '❌'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}