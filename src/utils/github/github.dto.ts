// Schema of the json files
import { z } from 'zod';

// TypeScript Interfaces
export interface GithubSubDomain {
  description: string;
  owner: Owner;
  record: Record[];
}

export interface Owner {
  github_username: string;
  email?: string; // optional as per schema
}

export type CNAME = { type: 'CNAME'; value: string };
export type A = { type: 'A'; value: string }; // array of IPv4 addresses
export type AAAA = { type: 'AAAA'; value: string }; // array of IPv6 addresses
export type TXT = { type: 'TXT'; value: string }; // array of text records

export interface MXRecord {
  preference: number;
  exchange: string;
}

export type MX = { type: 'MX'; value: MXRecord[] }; // array of MX records

export type Record = CNAME | A | AAAA | TXT | MX;

export interface BatchSearchResult {
  subdomainName: string;
  subDomain: GithubSubDomain | null;
  sha: string | null;
  error?: string;
}

export interface BatchSearchResponse {
  results: BatchSearchResult[];
  errors: string[];
}

// DNS 레코드 검증을 위한 스키마들
const domainNameRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const ipv6Regex =
  /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,7}:|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}$|^([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}$|^([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}$|^([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})$|^:((:[0-9a-fA-F]{1,4}){1,7}|:)$/;

// 각 타입별 검증 스키마
const domainNameSchema = z.string().regex(domainNameRegex, 'Invalid domain name format');

const ipv4Schema = z
  .string()
  .regex(ipv4Regex, 'Invalid IPv4 format')
  .refine(
    (ip) => {
      const parts = ip.split('.');
      return parts.every((part) => parseInt(part) >= 0 && parseInt(part) <= 255);
    },
    {
      message: 'Invalid IPv4 address range',
    }
  );

const ipv6Schema = z.string().regex(ipv6Regex, 'Invalid IPv6 format');

const txtSchema = z.string().min(1, 'TXT record cannot be empty').max(255, 'TXT record too long');

// Zod Schemas
export const ownerSchema = z.object({
  github_username: z.string(),
  email: z.string().email().optional(),
});

export const mxRecordSchema = z.object({
  preference: z.number(),
  exchange: z.string(),
});

export const recordSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CNAME'),
    value: domainNameSchema,
  }),
  z.object({
    type: z.literal('A'),
    value: ipv4Schema,
  }),
  z.object({
    type: z.literal('AAAA'),
    value: ipv6Schema,
  }),
  z.object({
    type: z.literal('TXT'),
    value: txtSchema,
  }),
  z.object({
    type: z.literal('MX'),
    value: z.array(mxRecordSchema),
  }),
]);

export const githubSubDomainSchema = z.object({
  description: z.string(),
  owner: ownerSchema,
  record: z.array(recordSchema),
});

export const batchSearchResultSchema = z.object({
  subdomainName: z.string(),
  subDomain: githubSubDomainSchema.nullable(),
  sha: z.string().nullable(),
  error: z.string().optional(),
});

export const batchSearchResponseSchema = z.object({
  results: z.array(batchSearchResultSchema),
  errors: z.array(z.string()),
});
