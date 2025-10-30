'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { OUTLETS } from '@/lib/outlet'; // ensure this exports [{ id, name }, ...]

type ClientInfo = {
  status: 'active' | 'expired';
  name: string;
  mobile: string;
  packageAmount: number;
  totalPackageHours: number;
  usedPackageHours: number;
  remainingHours: number;
  expiryDate: string;
};

type FormData = {
  name: string;
  mobile: string;
  date: string;
  treatment: string;
  amountPaid: number;
  sessionHours: number;
  tookPackage: boolean;
  isPackageCustomer: boolean;
  packageAmount?: number | '';
  totalPackageHours?: number | '';
  outlet: string;
};

export default function ClientForm() {
  const router = useRouter();

  // form and lookup state
  const [mobile, setMobile] = useState('');
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    mobile: '',
    date: new Date().toISOString().split('T')[0],
    treatment: '',
    amountPaid: 0,
    sessionHours: 0,
    tookPackage: false,
    isPackageCustomer: false,
    packageAmount: '',
    totalPackageHours: '',
    outlet: '', // will be resolved
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [inputError, setInputError] = useState('');
  const lookupTimeout = useRef<NodeJS.Timeout | null>(null);

  // cookie/outlet/role state
  const [authRole, setAuthRole] = useState<string | null>(null);
  const [checkedOutlet, setCheckedOutlet] = useState(false);
  const [resolvingOutlet, setResolvingOutlet] = useState(false);

  // outlets list (use your OUTLETS mapping if available)
  const outletsList = OUTLETS?.map((o: any) => o.name) ?? [
    'Indiranagar', 'Kaggadaspura', 'Kalyan Nagar', 'Cunningham Road', 'HSR Layout', 'Malleswaram', 'Marathahalli'
  ];

  // cleanup lookup timeout
  useEffect(() => {
    return () => {
      if (lookupTimeout.current) clearTimeout(lookupTimeout.current);
    };
  }, []);

  // Resolve auth_role and outlet (client cookie -> server /api/outlet fallback)
  useEffect(() => {
    const cookieStr = typeof document !== 'undefined' ? document.cookie : '';
    const getCookieVal = (name: string) => cookieStr.split('; ').find(row => row.trim().startsWith(name + '='))?.split('=')[1];

    const outletCookie = getCookieVal('outlet_id');
    const authRoleCookie = getCookieVal('auth_role');

    if (authRoleCookie) setAuthRole(authRoleCookie);
    else setAuthRole(null);

    const setOutletFromValue = (val?: string) => {
      if (!val) return;
      const matched = OUTLETS?.find((o: any) => o.id === val || o.name === val);
      const outletName = matched ? matched.name : val;
      setFormData(prev => ({ ...prev, outlet: outletName }));
    };

    if (outletCookie) {
      // cookie readable client-side (fast)
      setOutletFromValue(outletCookie);
      setCheckedOutlet(true);
      return;
    }

    // cookie not readable (HttpOnly or missing) -> call server endpoint to resolve
    (async () => {
      setResolvingOutlet(true);
      try {
        const res = await fetch('/api/outlet');
        if (res.status === 204) {
          // server couldn't find cookie
          if (authRoleCookie === 'outlet') {
            // outlet user with no server cookie -> redirect to login
            setInputError('Outlet session missing. Redirecting to login...');
            router.replace('/outlet-login');
            return;
          }
          // admin user: leave outlet blank (admin can choose)
        } else if (res.ok) {
          const data = await res.json();
          if (data?.outlet) {
            setOutletFromValue(data.outlet);
          } else {
            // no outlet returned
            if (authRoleCookie === 'outlet') {
              setInputError('Outlet session missing. Redirecting to login...');
              router.replace('/outlet-login');
              return;
            }
          }
        } else {
          console.warn('/api/outlet returned status', res.status);
        }
      } catch (err) {
        console.warn('Error fetching /api/outlet', err);
      } finally {
        setResolvingOutlet(false);
        setCheckedOutlet(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AUTOFILL logic (mobile lookup)
  useEffect(() => {
    if (lookupTimeout.current) clearTimeout(lookupTimeout.current);
    setClientInfo(null);
    setInputError('');

    if (mobile.length === 10) {
      const lookup = async () => {
        try {
          setInputError('');
          const res = await fetch(`/api/client-lookup?mobile=${encodeURIComponent(mobile)}`);
          if (!res.ok) {
            setClientInfo(null);
            setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false, tookPackage: false }));
            return;
          }
          const data: ClientInfo | null = await res.json();
          setClientInfo(data);
          if (data) {
            setFormData(prev => ({ ...prev, name: data.name, isPackageCustomer: data.status === 'active' }));
          } else {
            setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false, tookPackage: false }));
          }
        } catch (e) {
          console.error('Lookup error', e);
          setClientInfo(null);
          setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false, tookPackage: false }));
        }
      };
      lookupTimeout.current = setTimeout(lookup, 500);
    } else if (mobile.length < 10) {
      setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false, tookPackage: false }));
    }
  }, [mobile]);

  // input change handler
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? 0 : Number(value)) : value)
      };
      // ensure only one package flag active
      if (name === 'isPackageCustomer' && checked) updated.tookPackage = false;
      if (name === 'tookPackage' && checked) updated.isPackageCustomer = false;
      return updated;
    });
  };

  const handleTimeChange = (hours: string, minutes: string) => {
    const h = parseFloat(hours) || 0;
    const m = parseFloat(minutes) || 0;
    setFormData(prev => ({ ...prev, sessionHours: h + (m / 60) }));
  };

  // submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setInputError('');

    if (!checkedOutlet) {
      setInputError('Verifying session — please wait.');
      setIsSubmitting(false);
      return;
    }

    if (formData.isPackageCustomer && formData.sessionHours <= 0) {
      setInputError('Please enter Session Duration when using package credits.');
      setIsSubmitting(false);
      return;
    }

    // If outlet user and outlet isn't set, redirect to login
    if (authRole === 'outlet' && !formData.outlet) {
      setInputError('Outlet session missing. Redirecting to login...');
      setIsSubmitting(false);
      router.replace('/outlet-login');
      return;
    }

    try {
      const finalAmountPaid = (formData.tookPackage || formData.isPackageCustomer) ? 0 : formData.amountPaid;
      const payload = {
        ...formData,
        mobile,
        amountPaid: finalAmountPaid
      };

      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          // redirect based on role
          const redirectTo = authRole === 'outlet' ? '/outlet' : '/dashboard';
          router.refresh();
          router.push(redirectTo);
        }, 900);

        // reset (keep outlet)
        setMobile('');
        setClientInfo(null);
        setFormData(prev => ({
          ...prev,
          name: '', mobile: '', date: new Date().toISOString().split('T')[0],
          treatment: '', amountPaid: 0, sessionHours: 0, tookPackage: false,
          isPackageCustomer: false, packageAmount: '', totalPackageHours: ''
        }));
      } else {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Submission failed:', err.error);
        setInputError(err.error || 'Error saving record');
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('Error saving record:', err);
      setInputError('An unexpected error occurred.');
      setIsSubmitting(false);
    }
  };

  const showAmountField = !formData.tookPackage && !formData.isPackageCustomer;

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-md mt-8 relative">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">
        Client Treatment Record
        { formData.outlet ? ` — ${formData.outlet}` : ' ' }
      </h1>

      <button
        type="button"
        onClick={() => {
          if (authRole === 'outlet') router.push('/outlet');
          else router.push('/dashboard');
        }}
        className="absolute top-6 right-6 text-gray-500 hover:text-gray-700 text-2xl"
        aria-label="Close"
      >
        &times;
      </button>

      {success && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
          ✅ Client added successfully! Redirecting...
        </div>
      )}

      {inputError && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200">
          {inputError}
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number *</label>
        <input
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
          required
          maxLength={10}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
          placeholder="Enter 10-digit mobile to lookup client"
        />
      </div>

      {clientInfo && (
        <div className={`mb-6 p-4 rounded-lg border ${clientInfo.status === 'active' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className="flex justify-between items-center">
            <div>
              <span className="font-medium">{clientInfo.status === 'active' ? '✅ Active Package' : '⚠️ Package Expired/None'}</span>
              <span className="ml-2 font-semibold">{clientInfo.name}</span>
            </div>
            {clientInfo.status === 'active' && (
              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                Remaining: {clientInfo.remainingHours.toFixed(1)} hrs
              </span>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              placeholder={clientInfo ? '' : 'Enter name or lookup via mobile'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet *</label>
            <select
              name="outlet"
              value={checkedOutlet ? formData.outlet : ''}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              disabled={authRole === 'outlet' || resolvingOutlet}
            >
              {!checkedOutlet && <option value="">Resolving outlet…</option>}
              {outletsList.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Treatment *</label>
            <input
              name="treatment"
              type="text"
              value={formData.treatment}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>

          {showAmountField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid (₹)</label>
              <input
                name="amountPaid"
                type="number"
                min="0"
                step="0.01"
                value={formData.amountPaid || ''}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
            </div>
          )}

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Session Duration</label>
            <div className="flex space-x-3">
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  placeholder="Hrs"
                  value={formData.sessionHours >= 1 ? Math.floor(formData.sessionHours) : ''}
                  onChange={(e) => handleTimeChange(e.target.value, ((formData.sessionHours % 1) * 60).toString())}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="Mins"
                  value={formData.sessionHours > 0 ? Math.round((formData.sessionHours % 1) * 60) : ''}
                  onChange={(e) => handleTimeChange(Math.floor(formData.sessionHours).toString(), e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 space-y-3">
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                name="isPackageCustomer"
                checked={formData.isPackageCustomer}
                onChange={handleChange}
                className="sr-only"
                disabled={!clientInfo || clientInfo.status !== 'active'}
              />
              <div className={`block w-14 h-8 rounded-full ${formData.isPackageCustomer ? 'bg-blue-500' : 'bg-gray-300'} ${(!clientInfo || clientInfo.status !== 'active') ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.isPackageCustomer ? 'transform translate-x-6' : ''}`}></div>
            </div>
            <div className={`ml-3 text-gray-700 text-sm ${(!clientInfo || clientInfo.status !== 'active') ? 'opacity-50' : ''}`}>
              Existing package customer (use package credits)
            </div>
          </label>

          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                name="tookPackage"
                checked={formData.tookPackage}
                onChange={handleChange}
                className="sr-only"
                disabled={!!clientInfo && clientInfo.status === 'active'}
              />
              <div className={`block w-14 h-8 rounded-full ${formData.tookPackage ? 'bg-purple-500' : 'bg-gray-300'} ${ (!!clientInfo && clientInfo.status === 'active') ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.tookPackage ? 'transform translate-x-6' : ''}`}></div>
            </div>
            <div className={`ml-3 text-gray-700 text-sm ${ (!!clientInfo && clientInfo.status === 'active') ? 'opacity-50' : ''}`}>
              Taking a new package today
            </div>
          </label>
        </div>

        {formData.tookPackage && (
          <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-4">
            <h3 className="text-md font-semibold text-purple-800">New Package Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Amount (₹)</label>
                <input
                  name="packageAmount"
                  type="number"
                  min="0"
                  value={formData.packageAmount || ''}
                  onChange={handleChange}
                  required={formData.tookPackage}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Hours</label>
                <input
                  name="totalPackageHours"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.totalPackageHours || ''}
                  onChange={handleChange}
                  required={formData.tookPackage}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                />
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isSubmitting ? 'Saving...' : 'Save Record'}
        </button>
      </form>
    </div>
  );
}
  