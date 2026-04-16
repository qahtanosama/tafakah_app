export type Port = {
  code: string;
  name: string;
  country: string;
  countryCode: string;
};

export const PORTS: Port[] = [
  // ── CHINA (origin ports) ──
  { code: "CNSHE", name: "Shekou Port", country: "China", countryCode: "CN" },
  { code: "CNQIN", name: "Qingdao Port", country: "China", countryCode: "CN" },
  { code: "CNSHA", name: "Shanghai Port", country: "China", countryCode: "CN" },
  { code: "CNNGB", name: "Ningbo Port", country: "China", countryCode: "CN" },
  { code: "CNDLN", name: "Dalian Port", country: "China", countryCode: "CN" },
  { code: "CNTAO", name: "Tianjin Port", country: "China", countryCode: "CN" },
  { code: "CNYNT", name: "Yantai Port", country: "China", countryCode: "CN" },
  { code: "CNXIA", name: "Xiamen Port", country: "China", countryCode: "CN" },
  { code: "CNGZH", name: "Guangzhou Port", country: "China", countryCode: "CN" },
  { code: "CNFZU", name: "Fuzhou Port", country: "China", countryCode: "CN" },
  { code: "CNLYG", name: "Lianyungang Port", country: "China", countryCode: "CN" },

  // ── SAUDI ARABIA ──
  { code: "SAJED", name: "Jeddah Port", country: "Saudi Arabia", countryCode: "SA" },
  { code: "SADMM", name: "Dammam Port", country: "Saudi Arabia", countryCode: "SA" },
  { code: "SAJUB", name: "Jubail Port", country: "Saudi Arabia", countryCode: "SA" },
  { code: "SAYNB", name: "Yanbu Port", country: "Saudi Arabia", countryCode: "SA" },

  // ── UAE ──
  { code: "AEJEA", name: "Jebel Ali Port", country: "UAE", countryCode: "AE" },
  { code: "AEAUH", name: "Abu Dhabi Port", country: "UAE", countryCode: "AE" },
  { code: "AESHJ", name: "Sharjah Port", country: "UAE", countryCode: "AE" },
  { code: "AEFJR", name: "Fujairah Port", country: "UAE", countryCode: "AE" },

  // ── OTHER GULF ──
  { code: "KWKWI", name: "Kuwait Port (Shuwaikh)", country: "Kuwait", countryCode: "KW" },
  { code: "QADOH", name: "Doha Port (Hamad)", country: "Qatar", countryCode: "QA" },
  { code: "BHKBS", name: "Khalifa Bin Salman Port", country: "Bahrain", countryCode: "BH" },
  { code: "OMSLL", name: "Salalah Port", country: "Oman", countryCode: "OM" },
  { code: "OMSOH", name: "Sohar Port", country: "Oman", countryCode: "OM" },

  // ── EGYPT / RED SEA / EAST AFRICA ──
  { code: "EGSOK", name: "Sokhna Port", country: "Egypt", countryCode: "EG" },
  { code: "EGALY", name: "Alexandria Port", country: "Egypt", countryCode: "EG" },
  { code: "EGDAM", name: "Damietta Port", country: "Egypt", countryCode: "EG" },
  { code: "EGPSD", name: "Port Said", country: "Egypt", countryCode: "EG" },
  { code: "DJJIB", name: "Djibouti Port", country: "Djibouti", countryCode: "DJ" },
  { code: "KEMBA", name: "Mombasa Port", country: "Kenya", countryCode: "KE" },
  { code: "TZDAR", name: "Dar es Salaam Port", country: "Tanzania", countryCode: "TZ" },

  // ── SOUTH / SOUTHEAST ASIA ──
  { code: "INNSA", name: "Nhava Sheva (JNPT)", country: "India", countryCode: "IN" },
  { code: "INMAA", name: "Chennai Port", country: "India", countryCode: "IN" },
  { code: "INMUN", name: "Mundra Port", country: "India", countryCode: "IN" },
  { code: "PKKHI", name: "Karachi Port", country: "Pakistan", countryCode: "PK" },
  { code: "PKBQM", name: "Port Qasim", country: "Pakistan", countryCode: "PK" },
  { code: "BDCGP", name: "Chittagong Port", country: "Bangladesh", countryCode: "BD" },
  { code: "LKCMB", name: "Colombo Port", country: "Sri Lanka", countryCode: "LK" },
  { code: "MYPKG", name: "Port Klang", country: "Malaysia", countryCode: "MY" },
  { code: "MYTPP", name: "Tanjung Pelepas Port", country: "Malaysia", countryCode: "MY" },
  { code: "SGSIN", name: "Singapore Port", country: "Singapore", countryCode: "SG" },
  { code: "IDJKT", name: "Jakarta (Tanjung Priok)", country: "Indonesia", countryCode: "ID" },
  { code: "VNSGN", name: "Ho Chi Minh Port", country: "Vietnam", countryCode: "VN" },
  { code: "VNHPH", name: "Haiphong Port", country: "Vietnam", countryCode: "VN" },
  { code: "THLCH", name: "Laem Chabang Port", country: "Thailand", countryCode: "TH" },
  { code: "THBKK", name: "Bangkok Port", country: "Thailand", countryCode: "TH" },
  { code: "PHMNL", name: "Manila Port", country: "Philippines", countryCode: "PH" },

  // ── EUROPE ──
  { code: "NLRTM", name: "Rotterdam Port", country: "Netherlands", countryCode: "NL" },
  { code: "BEANR", name: "Antwerp Port", country: "Belgium", countryCode: "BE" },
  { code: "DEHAM", name: "Hamburg Port", country: "Germany", countryCode: "DE" },
  { code: "GBFXT", name: "Felixstowe Port", country: "UK", countryCode: "GB" },
  { code: "ESBCN", name: "Barcelona Port", country: "Spain", countryCode: "ES" },
  { code: "ITGOA", name: "Genoa Port", country: "Italy", countryCode: "IT" },

  // ── AMERICAS ──
  { code: "USLAX", name: "Los Angeles Port", country: "USA", countryCode: "US" },
  { code: "USLGB", name: "Long Beach Port", country: "USA", countryCode: "US" },
  { code: "USNYC", name: "New York Port", country: "USA", countryCode: "US" },
  { code: "CAMTR", name: "Montreal Port", country: "Canada", countryCode: "CA" },
  { code: "BRSSZ", name: "Santos Port", country: "Brazil", countryCode: "BR" },

  // ── OTHER ──
  { code: "TRIST", name: "Istanbul (Ambarli)", country: "T\u00FCrkiye", countryCode: "TR" },
  { code: "TRMER", name: "Mersin Port", country: "T\u00FCrkiye", countryCode: "TR" },
  { code: "RUVVO", name: "Vladivostok Port", country: "Russia", countryCode: "RU" },
  { code: "AUSYD", name: "Sydney Port", country: "Australia", countryCode: "AU" },
];

export function formatPortValue(port: Port): string {
  return `${port.name.toUpperCase()}, ${port.country.toUpperCase()}`;
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  "Saudi Arabia": ["SAUDI ARABIA", "SAUDI", "KSA"],
  UAE: ["UAE", "UNITED ARAB EMIRATES", "DUBAI", "ABU DHABI"],
  Kuwait: ["KUWAIT"],
  Qatar: ["QATAR", "DOHA"],
  Bahrain: ["BAHRAIN"],
  Oman: ["OMAN", "MUSCAT", "SALALAH"],
  Egypt: ["EGYPT", "CAIRO"],
  Kenya: ["KENYA", "NAIROBI", "MOMBASA"],
  Tanzania: ["TANZANIA", "DAR ES SALAAM"],
  Djibouti: ["DJIBOUTI"],
  India: ["INDIA", "MUMBAI", "DELHI", "CHENNAI"],
  Pakistan: ["PAKISTAN", "KARACHI"],
  Bangladesh: ["BANGLADESH", "DHAKA", "CHITTAGONG"],
  "Sri Lanka": ["SRI LANKA", "COLOMBO"],
  Malaysia: ["MALAYSIA", "KUALA LUMPUR"],
  Singapore: ["SINGAPORE"],
  Indonesia: ["INDONESIA", "JAKARTA"],
  Vietnam: ["VIETNAM", "HO CHI MINH", "HANOI"],
  Thailand: ["THAILAND", "BANGKOK"],
  Philippines: ["PHILIPPINES", "MANILA"],
  Netherlands: ["NETHERLANDS", "HOLLAND"],
  Belgium: ["BELGIUM"],
  Germany: ["GERMANY"],
  UK: ["UK", "UNITED KINGDOM", "ENGLAND", "BRITAIN"],
  Spain: ["SPAIN"],
  Italy: ["ITALY"],
  USA: ["USA", "UNITED STATES", "AMERICA"],
  Canada: ["CANADA"],
  Brazil: ["BRAZIL"],
  "T\u00FCrkiye": ["TURKEY", "T\u00DCRKIYE", "TURKIYE"],
  Russia: ["RUSSIA"],
  Australia: ["AUSTRALIA"],
};

export function detectCountryFromAddress(address: string): string | null {
  const upper = address.toUpperCase();
  for (const [country, aliases] of Object.entries(COUNTRY_ALIASES)) {
    for (const alias of aliases) {
      if (upper.includes(alias)) return country;
    }
  }
  return null;
}
