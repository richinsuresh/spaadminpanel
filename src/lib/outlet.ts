// src/lib/outlets.ts
export type OutletCredentials = {
  id: string;
  name: string;
  password: string; // In production, use hashed passwords
  location: string;
};

export const OUTLETS: OutletCredentials[] = [
  { id: '1', name: 'Indiranagar', password: 'indira123', location: 'Indiranagar, Bangalore' },
  { id: '2', name: 'Kaggadaspura', password: 'kaggada123', location: 'Kaggadaspura, Bangalore' },
  { id: '3', name: 'Kalyan Nagar', password: 'kalyan123', location: 'Kalyan Nagar, Bangalore' },
  { id: '4', name: 'Cunningham Road', password: 'cunningham123', location: 'Cunningham Road, Bangalore' },
  { id: '5', name: 'HSR Layout', password: 'hsr123', location: 'HSR Layout, Bangalore' },
  { id: '6', name: 'Malleswaram', password: 'malleswaram123', location: 'Malleswaram, Bangalore' },
  { id: '7', name: 'Marathahalli', password: 'marathahalli123', location: 'Marathahalli, Bangalore' }
];

export const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};