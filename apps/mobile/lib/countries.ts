export type Country = {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  minLength: number;
  maxLength: number;
};

// National significant number lengths (digits, excluding the dial code) are
// best-effort per-country -- real numbering plans have edge cases, but this
// covers the common case well enough to catch obviously wrong lengths.
export const COUNTRIES: Country[] = [
  { code: 'CA', name: 'Canada', dialCode: '1', flag: '🇨🇦', minLength: 10, maxLength: 10 },
  { code: 'US', name: 'United States', dialCode: '1', flag: '🇺🇸', minLength: 10, maxLength: 10 },
  { code: 'MX', name: 'Mexico', dialCode: '52', flag: '🇲🇽', minLength: 10, maxLength: 10 },
  { code: 'GB', name: 'United Kingdom', dialCode: '44', flag: '🇬🇧', minLength: 10, maxLength: 10 },
  { code: 'IE', name: 'Ireland', dialCode: '353', flag: '🇮🇪', minLength: 9, maxLength: 9 },
  { code: 'FR', name: 'France', dialCode: '33', flag: '🇫🇷', minLength: 9, maxLength: 9 },
  { code: 'DE', name: 'Germany', dialCode: '49', flag: '🇩🇪', minLength: 10, maxLength: 11 },
  { code: 'ES', name: 'Spain', dialCode: '34', flag: '🇪🇸', minLength: 9, maxLength: 9 },
  { code: 'IT', name: 'Italy', dialCode: '39', flag: '🇮🇹', minLength: 9, maxLength: 10 },
  { code: 'PT', name: 'Portugal', dialCode: '351', flag: '🇵🇹', minLength: 9, maxLength: 9 },
  { code: 'NL', name: 'Netherlands', dialCode: '31', flag: '🇳🇱', minLength: 9, maxLength: 9 },
  { code: 'BE', name: 'Belgium', dialCode: '32', flag: '🇧🇪', minLength: 8, maxLength: 9 },
  { code: 'CH', name: 'Switzerland', dialCode: '41', flag: '🇨🇭', minLength: 9, maxLength: 9 },
  { code: 'AT', name: 'Austria', dialCode: '43', flag: '🇦🇹', minLength: 10, maxLength: 11 },
  { code: 'SE', name: 'Sweden', dialCode: '46', flag: '🇸🇪', minLength: 7, maxLength: 9 },
  { code: 'NO', name: 'Norway', dialCode: '47', flag: '🇳🇴', minLength: 8, maxLength: 8 },
  { code: 'DK', name: 'Denmark', dialCode: '45', flag: '🇩🇰', minLength: 8, maxLength: 8 },
  { code: 'FI', name: 'Finland', dialCode: '358', flag: '🇫🇮', minLength: 9, maxLength: 9 },
  { code: 'PL', name: 'Poland', dialCode: '48', flag: '🇵🇱', minLength: 9, maxLength: 9 },
  { code: 'CZ', name: 'Czech Republic', dialCode: '420', flag: '🇨🇿', minLength: 9, maxLength: 9 },
  { code: 'GR', name: 'Greece', dialCode: '30', flag: '🇬🇷', minLength: 10, maxLength: 10 },
  { code: 'HU', name: 'Hungary', dialCode: '36', flag: '🇭🇺', minLength: 9, maxLength: 9 },
  { code: 'RO', name: 'Romania', dialCode: '40', flag: '🇷🇴', minLength: 9, maxLength: 9 },
  { code: 'BG', name: 'Bulgaria', dialCode: '359', flag: '🇧🇬', minLength: 8, maxLength: 9 },
  { code: 'RU', name: 'Russia', dialCode: '7', flag: '🇷🇺', minLength: 10, maxLength: 10 },
  { code: 'UA', name: 'Ukraine', dialCode: '380', flag: '🇺🇦', minLength: 9, maxLength: 9 },
  { code: 'TR', name: 'Turkey', dialCode: '90', flag: '🇹🇷', minLength: 10, maxLength: 10 },
  { code: 'IL', name: 'Israel', dialCode: '972', flag: '🇮🇱', minLength: 9, maxLength: 9 },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '966', flag: '🇸🇦', minLength: 9, maxLength: 9 },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '971', flag: '🇦🇪', minLength: 9, maxLength: 9 },
  { code: 'EG', name: 'Egypt', dialCode: '20', flag: '🇪🇬', minLength: 10, maxLength: 10 },
  { code: 'ZA', name: 'South Africa', dialCode: '27', flag: '🇿🇦', minLength: 9, maxLength: 9 },
  { code: 'NG', name: 'Nigeria', dialCode: '234', flag: '🇳🇬', minLength: 10, maxLength: 10 },
  { code: 'KE', name: 'Kenya', dialCode: '254', flag: '🇰🇪', minLength: 9, maxLength: 9 },
  { code: 'IN', name: 'India', dialCode: '91', flag: '🇮🇳', minLength: 10, maxLength: 10 },
  { code: 'PK', name: 'Pakistan', dialCode: '92', flag: '🇵🇰', minLength: 10, maxLength: 10 },
  { code: 'BD', name: 'Bangladesh', dialCode: '880', flag: '🇧🇩', minLength: 10, maxLength: 10 },
  { code: 'CN', name: 'China', dialCode: '86', flag: '🇨🇳', minLength: 11, maxLength: 11 },
  { code: 'JP', name: 'Japan', dialCode: '81', flag: '🇯🇵', minLength: 10, maxLength: 10 },
  { code: 'KR', name: 'South Korea', dialCode: '82', flag: '🇰🇷', minLength: 9, maxLength: 10 },
  { code: 'TW', name: 'Taiwan', dialCode: '886', flag: '🇹🇼', minLength: 9, maxLength: 9 },
  { code: 'HK', name: 'Hong Kong', dialCode: '852', flag: '🇭🇰', minLength: 8, maxLength: 8 },
  { code: 'SG', name: 'Singapore', dialCode: '65', flag: '🇸🇬', minLength: 8, maxLength: 8 },
  { code: 'MY', name: 'Malaysia', dialCode: '60', flag: '🇲🇾', minLength: 9, maxLength: 10 },
  { code: 'TH', name: 'Thailand', dialCode: '66', flag: '🇹🇭', minLength: 9, maxLength: 9 },
  { code: 'VN', name: 'Vietnam', dialCode: '84', flag: '🇻🇳', minLength: 9, maxLength: 10 },
  { code: 'PH', name: 'Philippines', dialCode: '63', flag: '🇵🇭', minLength: 10, maxLength: 10 },
  { code: 'ID', name: 'Indonesia', dialCode: '62', flag: '🇮🇩', minLength: 9, maxLength: 12 },
  { code: 'AU', name: 'Australia', dialCode: '61', flag: '🇦🇺', minLength: 9, maxLength: 9 },
  { code: 'NZ', name: 'New Zealand', dialCode: '64', flag: '🇳🇿', minLength: 8, maxLength: 9 },
  { code: 'BR', name: 'Brazil', dialCode: '55', flag: '🇧🇷', minLength: 10, maxLength: 11 },
  { code: 'AR', name: 'Argentina', dialCode: '54', flag: '🇦🇷', minLength: 10, maxLength: 10 },
  { code: 'CL', name: 'Chile', dialCode: '56', flag: '🇨🇱', minLength: 9, maxLength: 9 },
  { code: 'CO', name: 'Colombia', dialCode: '57', flag: '🇨🇴', minLength: 10, maxLength: 10 },
  { code: 'PE', name: 'Peru', dialCode: '51', flag: '🇵🇪', minLength: 9, maxLength: 9 },
  { code: 'VE', name: 'Venezuela', dialCode: '58', flag: '🇻🇪', minLength: 10, maxLength: 10 },
  { code: 'EC', name: 'Ecuador', dialCode: '593', flag: '🇪🇨', minLength: 9, maxLength: 9 },
  { code: 'UY', name: 'Uruguay', dialCode: '598', flag: '🇺🇾', minLength: 8, maxLength: 8 },
  { code: 'CR', name: 'Costa Rica', dialCode: '506', flag: '🇨🇷', minLength: 8, maxLength: 8 },
  { code: 'PA', name: 'Panama', dialCode: '507', flag: '🇵🇦', minLength: 8, maxLength: 8 },
  { code: 'GT', name: 'Guatemala', dialCode: '502', flag: '🇬🇹', minLength: 8, maxLength: 8 },
  { code: 'DO', name: 'Dominican Republic', dialCode: '1', flag: '🇩🇴', minLength: 10, maxLength: 10 },
  { code: 'JM', name: 'Jamaica', dialCode: '1', flag: '🇯🇲', minLength: 10, maxLength: 10 },
  { code: 'TT', name: 'Trinidad and Tobago', dialCode: '1', flag: '🇹🇹', minLength: 10, maxLength: 10 },
  { code: 'IS', name: 'Iceland', dialCode: '354', flag: '🇮🇸', minLength: 7, maxLength: 7 },
  { code: 'LU', name: 'Luxembourg', dialCode: '352', flag: '🇱🇺', minLength: 9, maxLength: 9 },
  { code: 'MT', name: 'Malta', dialCode: '356', flag: '🇲🇹', minLength: 8, maxLength: 8 },
  { code: 'CY', name: 'Cyprus', dialCode: '357', flag: '🇨🇾', minLength: 8, maxLength: 8 },
  { code: 'HR', name: 'Croatia', dialCode: '385', flag: '🇭🇷', minLength: 9, maxLength: 9 },
  { code: 'SI', name: 'Slovenia', dialCode: '386', flag: '🇸🇮', minLength: 8, maxLength: 8 },
  { code: 'SK', name: 'Slovakia', dialCode: '421', flag: '🇸🇰', minLength: 9, maxLength: 9 },
  { code: 'LT', name: 'Lithuania', dialCode: '370', flag: '🇱🇹', minLength: 8, maxLength: 8 },
  { code: 'LV', name: 'Latvia', dialCode: '371', flag: '🇱🇻', minLength: 8, maxLength: 8 },
  { code: 'EE', name: 'Estonia', dialCode: '372', flag: '🇪🇪', minLength: 7, maxLength: 8 },
  { code: 'MA', name: 'Morocco', dialCode: '212', flag: '🇲🇦', minLength: 9, maxLength: 9 },
  { code: 'DZ', name: 'Algeria', dialCode: '213', flag: '🇩🇿', minLength: 9, maxLength: 9 },
  { code: 'TN', name: 'Tunisia', dialCode: '216', flag: '🇹🇳', minLength: 8, maxLength: 8 },
  { code: 'QA', name: 'Qatar', dialCode: '974', flag: '🇶🇦', minLength: 8, maxLength: 8 },
  { code: 'KW', name: 'Kuwait', dialCode: '965', flag: '🇰🇼', minLength: 8, maxLength: 8 },
  { code: 'BH', name: 'Bahrain', dialCode: '973', flag: '🇧🇭', minLength: 8, maxLength: 8 },
  { code: 'OM', name: 'Oman', dialCode: '968', flag: '🇴🇲', minLength: 8, maxLength: 8 },
  { code: 'JO', name: 'Jordan', dialCode: '962', flag: '🇯🇴', minLength: 9, maxLength: 9 },
  { code: 'LB', name: 'Lebanon', dialCode: '961', flag: '🇱🇧', minLength: 7, maxLength: 8 },
  { code: 'IQ', name: 'Iraq', dialCode: '964', flag: '🇮🇶', minLength: 10, maxLength: 10 },
  { code: 'IR', name: 'Iran', dialCode: '98', flag: '🇮🇷', minLength: 10, maxLength: 10 },
  { code: 'AF', name: 'Afghanistan', dialCode: '93', flag: '🇦🇫', minLength: 9, maxLength: 9 },
  { code: 'ET', name: 'Ethiopia', dialCode: '251', flag: '🇪🇹', minLength: 9, maxLength: 9 },
];

export const DEFAULT_COUNTRY: Country = COUNTRIES[0];

export function isValidPhoneForCountry(digits: string, country: Country): boolean {
  const len = digits.replace(/[^0-9]/g, '').length;
  return len >= country.minLength && len <= country.maxLength;
}

// Grouped display as the customer types, e.g. "123-456-7899" for a Canada/US
// number -- North American numbers (dial code "1": Canada, US, and the
// other NANP countries in this list) use the familiar 3-3-4 pattern;
// everything else groups in plain 3-digit chunks, which won't match every
// country's official convention but still reads far better than one
// unbroken string of digits. The underlying stored value stays plain
// digits (see onChangeText at each call site) -- this only affects what's
// shown in the input.
export function formatPhoneNumber(digits: string, country: Country): string {
  const d = digits.replace(/[^0-9]/g, '');
  if (country.dialCode === '1') {
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join('-');
  }
  return d.match(/.{1,3}/g)?.join('-') ?? d;
}

// Best-effort split of a stored phone number back into a country + national
// number for editing. Numbers saved before country codes existed have no
// leading "+", so those fall back to the default country with the raw
// digits treated as the national number.
export function parsePhone(raw: string): { country: Country; digits: string } {
  const trimmed = (raw || '').trim();
  if (trimmed.startsWith('+')) {
    const digitsOnly = trimmed.slice(1).replace(/[^0-9]/g, '');
    const byLongestDialCode = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    const match = byLongestDialCode.find(c => digitsOnly.startsWith(c.dialCode));
    if (match) {
      return { country: match, digits: digitsOnly.slice(match.dialCode.length) };
    }
  }
  return { country: DEFAULT_COUNTRY, digits: trimmed.replace(/[^0-9]/g, '') };
}
