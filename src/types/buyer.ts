export interface Buyer {
  id: string;
  company: string;
  shortName: string;
  address: string;
  additionalNumber: string;
  cityPostal: string;
  country: string;
  email: string;
  ccEmail: string;
  phone: string;
  contactPerson: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const BUYER_COUNTRIES = [
  "Saudi Arabia", "UAE", "Kuwait", "Qatar", "Bahrain", "Oman",
  "Egypt", "Kenya", "Tanzania", "Djibouti",
  "India", "Pakistan", "Bangladesh", "Sri Lanka",
  "Malaysia", "Singapore", "Indonesia", "Vietnam", "Thailand", "Philippines",
  "Netherlands", "Belgium", "Germany", "UK", "Spain", "Italy",
  "USA", "Canada", "Brazil",
  "T\u00FCrkiye", "Russia", "Australia",
  "Other",
];
