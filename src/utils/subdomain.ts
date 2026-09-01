import { blackListedSubdomains } from './blacklist';
import { isVendorSubdomain, getBaseSubdomain, getVendorName } from './vendor';

export interface SubdomainValidationResult {
  isValid: boolean;
  error?: string;
  isVendor?: boolean;
  vendorName?: string;
  baseSubdomain?: string;
}

export const validateSubdomainName = (subdomainName: string): SubdomainValidationResult => {
  const name = subdomainName.toLowerCase();

  // _{vendor}.{subdomain} pattern (e.g., _vercel.myapp, _discord.myapp)
  if (name.startsWith('_')) {
    if (!isVendorSubdomain(name)) {
      return {
        isValid: false,
        error: 'Invalid vendor subdomain format. Use _{vendor}.{your-subdomain} format.',
        isVendor: true,
      };
    }

    const vendorName = getVendorName(name);
    const baseSubdomain = getBaseSubdomain(name);
    if (!vendorName || !baseSubdomain) {
      return {
        isValid: false,
        error: 'Invalid vendor subdomain format. Use _{vendor}.{your-subdomain} format.',
        isVendor: true,
      };
    }

    const baseValidation = validateBaseSubdomainName(baseSubdomain);
    if (!baseValidation.isValid) {
      return {
        isValid: false,
        error: `Invalid base subdomain: ${baseValidation.error}`,
        isVendor: true,
        vendorName,
        baseSubdomain,
      };
    }

    return {
      isValid: true,
      isVendor: true,
      vendorName,
      baseSubdomain,
    };
  }

  return { ...validateBaseSubdomainName(name), isVendor: false };
};

const validateBaseSubdomainName = (
  name: string
): {
  isValid: boolean;
  error?: string;
} => {
  if (name.includes(' ')) {
    return { isValid: false, error: 'Subdomain name cannot contain spaces' };
  }

  if (name.length > 63) {
    return { isValid: false, error: 'Subdomain name is too long' };
  }

  if (name.length < 1) {
    return { isValid: false, error: 'Subdomain name is too short' };
  }

  if (name.startsWith('-') || name.endsWith('-')) {
    return { isValid: false, error: 'Subdomain name cannot start or end with a hyphen' };
  }

  if (name.startsWith('.') || name.endsWith('.')) {
    return { isValid: false, error: 'Subdomain name cannot start or end with a dot' };
  }

  if (name.includes('..')) {
    return { isValid: false, error: 'Subdomain name cannot contain consecutive dots' };
  }

  if (name.includes('_')) {
    return { isValid: false, error: 'Subdomain name cannot contain underscores' };
  }

  const labels = name.split('.');
  const labelRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

  for (const label of labels) {
    if (!labelRegex.test(label)) {
      return {
        isValid: false,
        error:
          'Subdomain name cannot start or end with a hyphen, and can only contain letters, numbers, and hyphens',
      };
    }
  }

  if (blackListedSubdomains.includes(name)) {
    return { isValid: false, error: 'Subdomain name is blacklisted' };
  }

  return { isValid: true };
};
