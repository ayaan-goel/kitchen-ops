/**
 * Seed data: six fictional client companies in Hyderabad plus a deterministic employee generator.
 * Two sites work 7 days so every review day — weekends included — has deliveries (A-03).
 */

export interface AddressSeed {
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  deliveryNotes?: string;
}

export interface CompanySeed {
  name: string;
  domain: string;
  tier: string | null; // null → default tier
  workingDays: number[];
  defaultDeliveryTime: number; // minutes after midnight
  dispatchLeadMinutes: number;
  packaging: string;
  driverInstructions: string;
  defaultDriverEmail: string;
  billing: { name: string; email: string; phone: string; address: string };
  addresses: AddressSeed[]; // first = default
  holidays: { date: string; name: string }[];
  hiddenCategorySlugs: string[];
  hiddenDishSkus: string[];
  employeeCount: number;
  flagRate: number; // share of employees allowed to change address/time/packaging
}

const HYD = { city: 'Hyderabad', state: 'Telangana' };
const MON_FRI = [1, 2, 3, 4, 5];
const ALL_WEEK = [1, 2, 3, 4, 5, 6, 7];

export const COMPANIES: CompanySeed[] = [
  {
    name: 'Banyan Analytics',
    domain: 'banyananalytics.in',
    tier: null,
    workingDays: MON_FRI,
    defaultDeliveryTime: 12 * 60 + 30,
    dispatchLeadMinutes: 60,
    packaging: 'Standard box',
    driverInstructions: 'Use the goods lift. Hand over at the 5th-floor pantry; ask for Ramesh.',
    defaultDriverEmail: 'driver@test.com',
    billing: { name: 'Meera Iyer', email: 'accounts@banyananalytics.in', phone: '+91 40 4567 1200', address: 'Knowledge City, HITEC City, Hyderabad 500081' },
    addresses: [
      { label: 'Tower A – 5th floor pantry', line1: 'Salarpuria Sattva Knowledge City, Tower A', line2: '5th floor', ...HYD, postalCode: '500081' },
      { label: 'Tower B – 2nd floor', line1: 'Salarpuria Sattva Knowledge City, Tower B', line2: '2nd floor', ...HYD, postalCode: '500081' },
    ],
    holidays: [],
    hiddenCategorySlugs: [],
    hiddenDishSkus: [],
    employeeCount: 120,
    flagRate: 0.2,
  },
  {
    name: 'Kestrel Fintech',
    domain: 'kestrelfintech.com',
    tier: 'Enterprise',
    workingDays: MON_FRI,
    defaultDeliveryTime: 13 * 60,
    dispatchLeadMinutes: 60,
    packaging: 'Name-labelled box',
    driverInstructions: 'Security desk at gate 2 issues a visitor pass. Deliver to the 9th-floor cafeteria.',
    defaultDriverEmail: 'ravi.kumar@fernleaf.kitchen',
    billing: { name: 'Arjun Mehta', email: 'finance@kestrelfintech.com', phone: '+91 40 6612 3400', address: 'Kestrel House, Nanakramguda, Hyderabad 500032' },
    addresses: [{ label: 'Kestrel House – 9th floor', line1: 'Kestrel House, Financial District', line2: 'Nanakramguda, 9th floor', ...HYD, postalCode: '500032' }],
    holidays: [{ date: '2026-10-16', name: 'Annual offsite' }],
    hiddenCategorySlugs: ['desserts'], // wellness programme: no desserts
    hiddenDishSkus: [],
    employeeCount: 90,
    flagRate: 0.15,
  },
  {
    name: 'Lumen Health',
    domain: 'lumenhealth.org',
    tier: 'Partner',
    workingDays: ALL_WEEK,
    defaultDeliveryTime: 12 * 60,
    dispatchLeadMinutes: 45,
    packaging: 'Insulated hot bag',
    driverInstructions: 'Hospital: deliver to the staff canteen (Block B, ground floor), never the main reception.',
    defaultDriverEmail: 'driver@test.com',
    billing: { name: 'Dr. Kavya Reddy', email: 'procurement@lumenhealth.org', phone: '+91 40 2355 9000', address: 'Road No. 36, Jubilee Hills, Hyderabad 500033' },
    addresses: [
      { label: 'Staff canteen – Block B', line1: 'Lumen Hospital, Road No. 36', line2: 'Block B, ground floor', ...HYD, postalCode: '500033', deliveryNotes: 'Canteen opens 11:30' },
      { label: 'Nurses’ station – Block D', line1: 'Lumen Hospital, Road No. 36', line2: 'Block D, 3rd floor', ...HYD, postalCode: '500033' },
    ],
    holidays: [],
    hiddenCategorySlugs: [],
    hiddenDishSkus: [],
    employeeCount: 90,
    flagRate: 0.3,
  },
  {
    name: 'Orbit Support Services',
    domain: 'orbitsupport.co',
    tier: null,
    workingDays: ALL_WEEK,
    defaultDeliveryTime: 13 * 60 + 30,
    dispatchLeadMinutes: 60,
    packaging: 'Eco compostable box',
    driverInstructions: '24×7 contact centre. Call the floor manager on arrival; leave at the 3rd-floor breakout area.',
    defaultDriverEmail: 'driver@test.com',
    billing: { name: 'Sameer Khan', email: 'ap@orbitsupport.co', phone: '+91 40 4488 2100', address: 'Orbit Towers, Madhapur, Hyderabad 500081' },
    addresses: [{ label: 'Orbit Towers – 3rd floor', line1: 'Orbit Towers, Madhapur', line2: '3rd floor breakout', ...HYD, postalCode: '500081' }],
    holidays: [],
    hiddenCategorySlugs: [],
    hiddenDishSkus: [],
    employeeCount: 90,
    flagRate: 0.3,
  },
  {
    name: 'Quill & Co Legal',
    domain: 'quilllegal.in',
    tier: 'Startup',
    workingDays: MON_FRI,
    defaultDeliveryTime: 12 * 60 + 45,
    dispatchLeadMinutes: 60,
    packaging: 'Standard box',
    driverInstructions: 'Reception on the 1st floor; partners’ boxes go to the conference room.',
    defaultDriverEmail: 'sana.shaikh@fernleaf.kitchen',
    billing: { name: 'Nandini Rao', email: 'office@quilllegal.in', phone: '+91 40 2335 6677', address: 'Road No. 12, Banjara Hills, Hyderabad 500034' },
    addresses: [{ label: 'Banjara Hills office', line1: 'Plot 8-2-293, Road No. 12', line2: '1st floor', ...HYD, postalCode: '500034' }],
    holidays: [],
    hiddenCategorySlugs: [],
    hiddenDishSkus: [],
    employeeCount: 40,
    flagRate: 0.25,
  },
  {
    name: 'Saffron Studios',
    domain: 'saffronstudios.design',
    tier: null,
    workingDays: MON_FRI,
    defaultDeliveryTime: 13 * 60 + 15,
    dispatchLeadMinutes: 60,
    packaging: 'Eco compostable box',
    driverInstructions: 'Studio is on the terrace floor; ring the bell, the lift does not stop there.',
    defaultDriverEmail: 'sana.shaikh@fernleaf.kitchen',
    billing: { name: 'Ishaan Kapoor', email: 'studio@saffronstudios.design', phone: '+91 40 6789 4455', address: 'Botanical Garden Road, Kondapur, Hyderabad 500084' },
    addresses: [{ label: 'Kondapur studio', line1: 'Botanical Garden Road, Kondapur', line2: 'Terrace floor', ...HYD, postalCode: '500084' }],
    holidays: [],
    hiddenCategorySlugs: [],
    hiddenDishSkus: ['FL-WRP-002'], // hides one menu item
    employeeCount: 60,
    flagRate: 0.2,
  },
];

export const KITCHEN_HOLIDAYS = [
  // Deliberately outside the two-week review window so no review day loses deliveries.
  { date: '2026-11-08', name: 'Diwali' },
  { date: '2026-12-25', name: 'Christmas' },
];

export const PUBLIC_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com',
  'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com', 'rediffmail.com', 'zoho.com',
  'gmx.com', 'mail.com', 'yandex.com',
];

const FIRST_NAMES = [
  'Aarav', 'Aditi', 'Akash', 'Ananya', 'Arjun', 'Bhavya', 'Chirag', 'Deepa', 'Dhruv', 'Divya', 'Farhan', 'Gauri',
  'Harsh', 'Isha', 'Jay', 'Kavya', 'Karan', 'Lakshmi', 'Manish', 'Meera', 'Nikhil', 'Nisha', 'Omkar', 'Pooja',
  'Pranav', 'Priya', 'Rahul', 'Rhea', 'Rohan', 'Sahil', 'Sana', 'Shreya', 'Siddharth', 'Sneha', 'Tanvi', 'Tarun',
  'Uday', 'Vaishnavi', 'Varun', 'Vikram', 'Yash', 'Zoya', 'Abhinav', 'Aisha', 'Ganesh', 'Imran', 'Jyoti', 'Kunal',
  'Lavanya', 'Mohit', 'Neha', 'Pallavi', 'Raghav', 'Ritika', 'Sameer', 'Swati', 'Tejas', 'Vidya',
];
const LAST_NAMES = [
  'Agarwal', 'Bhat', 'Chopra', 'Das', 'Desai', 'Fernandes', 'Ghosh', 'Gupta', 'Iyer', 'Jain', 'Joshi', 'Kapoor',
  'Khan', 'Kulkarni', 'Kumar', 'Menon', 'Mishra', 'Nair', 'Patel', 'Pillai', 'Rao', 'Reddy', 'Sharma', 'Shetty',
  'Singh', 'Sinha', 'Srinivasan', 'Thakur', 'Varma', 'Verma', 'Yadav', 'Naidu', 'Chowdary', 'Hussain', 'Bose',
];

/** Small deterministic PRNG so the generated employees are identical on every seed run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface EmployeeSeed {
  name: string;
  email: string;
  phone: string;
  canChooseAddress: boolean;
  canChangeDeliveryTime: boolean;
  canChangePackaging: boolean;
  allergens: string[];
  diets: string[];
}

export function generateEmployees(company: CompanySeed, allergens: readonly string[], diets: readonly string[]): EmployeeSeed[] {
  const rand = mulberry32(hashString(company.name));
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)] as T;
  const used = new Set<string>();
  const out: EmployeeSeed[] = [];
  while (out.length < company.employeeCount) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    let local = `${first}.${last}`.toLowerCase();
    let n = 2;
    while (used.has(local)) local = `${first}.${last}${n++}`.toLowerCase();
    used.add(local);
    const allergyRoll = rand();
    const dietRoll = rand();
    out.push({
      name: `${first} ${last}`,
      email: `${local}@${company.domain}`,
      phone: `+91 9${String(Math.floor(rand() * 1_000_000_000)).padStart(9, '0')}`,
      canChooseAddress: company.addresses.length > 1 && rand() < company.flagRate,
      canChangeDeliveryTime: rand() < company.flagRate,
      canChangePackaging: rand() < company.flagRate / 2,
      allergens: allergyRoll < 0.15 ? [pick(allergens)] : [],
      diets: dietRoll < 0.25 ? ['Vegetarian'] : dietRoll < 0.32 ? ['Vegan'] : dietRoll < 0.37 ? ['Jain'] : dietRoll < 0.4 ? ['Gluten-free'] : [],
    });
  }
  return out;
}
