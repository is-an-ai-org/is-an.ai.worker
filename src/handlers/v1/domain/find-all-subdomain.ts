import { Context } from 'hono';
import { AppType } from '@/binding';
import { Github } from '@/utils/github/github';
import type { Subdomain } from '@/adapters/types';
import { Record } from '@/utils/github/github.dto';

interface SubdomainResponse {
  subdomainId: string;
  subdomainName: string;
  description: string;
  record: Record;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const handleFindAllSubdomain = async (c: Context<AppType>): Promise<Response> => {
  const db = c.get('db');
  const githubToken = c.env.GITHUB_PAT;

  // query all subdomains
  const allSubdomains = await db.findAllSubdomains();

  const allGithubSubdomains = await Github.getDomainDeterminationDirectory(githubToken);

  const response: SubdomainResponse[] = allSubdomains
    .filter((subdomain) => allGithubSubdomains.includes(subdomain.name))
    .map((subdomain: Subdomain) => ({
      subdomainId: subdomain.id,
      subdomainName: subdomain.name,
      description: subdomain.description,
      record: JSON.parse(subdomain.record),
      ownerId: subdomain.ownerId,
      createdAt: subdomain.createdAt,
      updatedAt: subdomain.updatedAt,
    }));

  return c.json(response);
};
