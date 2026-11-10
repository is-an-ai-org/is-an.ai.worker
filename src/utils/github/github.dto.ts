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

// 누구나 경로 아래에 파일을 올릴 수 있는 공용 호스트. 여기를 CNAME 으로 가리키면
// 레코드 소유자와 무관하게 아무 GitHub 사용자의 업로드가 *.is-an.ai 주소로 보인다
// (Netcraft 93584398: 2.is-an.ai -> github.com 릴리스의 악성 MSI).
// 레코드 저장소 validate-pr.ts 의 SHARED_HOST_TARGETS 와 같은 목록이다.
export const sharedHostTargets = [
  'github.com',
  'www.github.com',
  'gist.github.com',
  'codeload.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'githubusercontent.com',
  'github.io',
  'gitlab.com',
  'www.gitlab.com',
  'bitbucket.org',
];

// 생성·수정 입력 전용. 조회는 recordSchema 로 파싱해 기존 레코드를 깨지 않는다.
export const inputRecordSchema = recordSchema.refine(
  (r) => r.type !== 'CNAME' || !sharedHostTargets.includes(r.value.toLowerCase().replace(/\.$/, '')),
  { message: 'CNAME cannot point to a shared host — use your own host (e.g. <user>.github.io)' },
);

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
