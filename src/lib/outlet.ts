// src/lib/outlet.ts
export type OutletCredentials = {
  id: string;
  name: string;
  password: string; // In production, use hashed passwords
  location: string;
};

// --- UPDATED OUTLET LIST ---
export const OUTLETS: OutletCredentials[] = [
  { id: '1', name: 'Indiranagar', password: 'indira123', location: 'Indiranagar, Bangalore' },
  { id: '2', name: 'Kaggadaspura', password: 'kaggada123', location: 'Kaggadaspura, Bangalore' },
  { id: '3', name: 'Kalyannagar', password: 'kalyan123', location: 'Kalyan Nagar, Bangalore' }, // Spelled as requested
  { id: '4', name: 'Cunningham', password: 'cunningham123', location: 'Cunningham Road, Bangalore' }, // Spelled as requested
  { id: '5', name: 'HSR-2', password: 'hsr2-123', location: 'HSR Layout 2, Bangalore' }, // New
  { id: '6', name: 'V-ONE', password: 'vone123', location: 'V-ONE, Bangalore' }, // New
  { id: '7', name: 'HSR-1', password: 'hsr1-123', location: 'HSR Layout 1, Bangalore' }, // New
  { id: '8', name: 'Malleswaram', password: 'malleswaram123', location: 'Malleswaram, Bangalore' },
  { id: '9', name: 'Marathahalli', password: 'marathahalli123', location: 'Marathahalli, Bangalore' }
];
// --- END OF UPDATED LIST ---

export const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};