import { Record } from './github/github.dto';

// Matches _{vendor}.{subdomain} pattern (e.g., _vercel.myapp, _discord.myapp)
const VENDOR_PATTERN = /^_([a-z0-9]+)\.[a-z0-9][a-z0-9.-]*$/i;

export const isVendorSubdomain = (name: string): boolean => {
  return VENDOR_PATTERN.test(name);
};

export const getVendorName = (name: string): string | null => {
  const match = name.match(VENDOR_PATTERN);
  return match ? match[1].toLowerCase() : null;
};

export const getBaseSubdomain = (name: string): string | null => {
  if (!isVendorSubdomain(name)) {
    return null;
  }
  return name.replace(/^_[a-z0-9]+\./i, '').toLowerCase();
};

export const validateVendorRecords = (
  records: Record[]
): { isValid: boolean; error?: string } => {
  if (!records || records.length === 0) {
    return { isValid: false, error: 'At least one TXT record is required for vendor verification' };
  }

  const nonTxtRecords = records.filter((r) => r.type !== 'TXT');
  if (nonTxtRecords.length > 0) {
    return {
      isValid: false,
      error: 'Vendor verification subdomains (_{vendor}.*) only support TXT records',
    };
  }

  return { isValid: true };
};
