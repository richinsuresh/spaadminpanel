/**
 * Defines the data structure for a single outlet.
 * This now includes credentials for the outlet dashboard
 * and the QR code path for the client payment form.
 */
export type Outlet = {
  /**
   * A unique identifier for the outlet.
   * Used in the URL and for login.
   */
  id: string;

  /**
   * The full display name for the outlet.
   */
  name: string;

  /**
   * The password for this outlet's dashboard login.
   * In a real production app, this should be a hashed password.
   */
  password: string;

  /**
   * The location of the outlet.
   */
  location: string;

  /**
   * The path to the outlet-specific UPI QR code image.
   * This path MUST start with '/' and point to an image
   * in the 'public/qr-codes/' directory.
   */
  qrCodeUrl: string;

  /**
   * The minimum amount (in Rupees) for a single
   * treatment at this outlet.
   */
  minTreatmentAmount: number;
};

// --- MASTER OUTLET LIST ---
export const OUTLETS: Outlet[] = [
  {
    id: '1',
    name: 'Indiranagar',
    password: 'indira123',
    location: 'Indiranagar, Bangalore',
    qrCodeUrl: '/qr-codes/indiranagar-upi.png',
    minTreatmentAmount: 1800, // Default
  },
  {
    id: '2',
    name: 'Kaggadaspura',
    password: 'kaggada123',
    location: 'Kaggadaspura, Bangalore',
    qrCodeUrl: '/qr-codes/kaggadaspura-upi.png',
    minTreatmentAmount: 1500, // Custom
  },
  {
    id: '3',
    name: 'Kalyannagar',
    password: 'kalyan123',
    location: 'Kalyan Nagar, Bangalore',
    qrCodeUrl: '/qr-codes/kalyannagar-upi.png',
    minTreatmentAmount: 1800, // Default
  },
  {
    id: '4',
    name: 'Cunningham',
    password: 'cunningham123',
    location: 'Cunningham Road, Bangalore',
    qrCodeUrl: '/qr-codes/cunningham-upi.png',
    minTreatmentAmount: 1800, // Default
  },
  {
    id: '5',
    name: 'HSR-2',
    password: 'hsr2-123',
    location: 'HSR Layout 2, Bangalore',
    qrCodeUrl: '/qr-codes/hsr-2-upi.png',
    minTreatmentAmount: 1500, // Custom
  },
  {
    id: '6',
    name: 'V-ONE',
    password: 'vone123',
    location: 'V-ONE, Bangalore',
    qrCodeUrl: '/qr-codes/v-one-upi.png',
    minTreatmentAmount: 1800, // Default
  },
  {
    id: '7',
    name: 'HSR-1',
    password: 'hsr1-123',
    location: 'HSR Layout 1, Bangalore',
    qrCodeUrl: '/qr-codes/hsr-1-upi.png',
    minTreatmentAmount: 1800, // Default
  },
  {
    id: '8',
    name: 'Malleswaram',
    password: 'malleswaram123',
    location: 'Malleswaram, Bangalore',
    qrCodeUrl: '/qr-codes/malleswaram-upi.png',
    minTreatmentAmount: 1800, // Default
  },
  {
    id: '9',
    name: 'Marathahalli',
    password: 'marathahalli123',
    location: 'Marathahalli, Bangalore',
    qrCodeUrl: '/qr-codes/marathahalli-upi.png',
    minTreatmentAmount: 1500, // Custom
  },
];
// --- END OF MASTER LIST ---

/**
 * Credentials for the main admin login.
 */
export const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123',
};