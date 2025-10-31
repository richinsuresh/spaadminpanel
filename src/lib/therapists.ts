// src/lib/therapists.ts

// This is the master list of all therapists, organized by outlet name.
// The outlet name (e.g., "Indiranagar") MUST exactly match the name in src/lib/outlet.ts
export const THERAPISTS_BY_OUTLET: Record<string, string[]> = {
  'Indiranagar': [
    'Aisha',
    'Priya',
    'Rajesh',
  ],
  'Kaggadaspura': [
    'Vikram',
    'Meera',
  ],
  'Kalyannagar': [
    'Arjun',
    'Sneha',
  ],
  'Cunningham': [
    'Karan',
    'Divya',
  ],
  'HSR-2': [
    'Rohan',
    'Neha',
  ],
  'V-ONE': [
    'Sanjay',
    'Ananya',
  ],
  'HSR-1': [
    'Manoj',
    'Sunita',
  ],
  'Malleswaram': [
    'Deepak',
    'Kavita',
  ],
  'Marathahalli': [
    'Anil',
    'Pooja',
  ],
};

// --- This part is for the Admin page ---
// Create a single, combined list of all therapists with no duplicates
const allTherapistsSet = new Set<string>();
Object.values(THERAPISTS_BY_OUTLET).forEach(list => {
  list.forEach(name => allTherapistsSet.add(name));
});

export const ALL_THERAPISTS = Array.from(allTherapistsSet).sort();