import { GithubSubDomain, Record, BatchSearchResult, BatchSearchResponse } from './github.dto';
import { AppError, ErrorCode } from '../error';
import { importPKCS8, SignJWT } from 'jose';

// GitHub API 응답에 대한 인터페이스 정의
interface GitHubContentResponse {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
  content: string;
  encoding: string;
  _links: {
    self: string;
    git: string;
    html: string;
  };
}

interface GitHubErrorResponse {
  message: string;
  documentation_url?: string;
}

// Git Trees API의 응답 형식을 위한 인터페이스
interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: Array<{
    path: string;
    mode: string;
    type: 'blob' | 'tree' | 'commit';
    sha: string;
    size?: number;
    url?: string;
  }>;
  truncated: boolean; // 결과가 너무 많아 잘렸는지 여부
}

interface GithubTokenResponse {
  token: string;
  expires_at: string;
  permissions: {
    contents: string;
    metadata: string;
    statuses: string;
  };
  repository_selection: string;
}

interface GithubAppJWTPayload {
  iat: number;
  exp: number;
  iss: string;
}

export class Github {
  // --- org/봇 정체성 -------------------------------------------------------
  // org 이전을 '코드 변경'이 아니라 '설정 변경'으로 만든다.
  // 기본값은 현재 운영값이므로, 환경변수를 주지 않으면 동작이 이전과 완전히 동일하다.
  // GitHub App transfer가 불가능해 App을 새로 만들면 봇 계정 ID가 바뀌고,
  // 그때 바꿔야 할 곳이 이 파일 안 7군데였다. 이제 wrangler vars 한 곳이다.
  private static readonly DEFAULT_OWNER = 'is-an-ai';
  private static readonly DEFAULT_REPO = 'is-an.ai';
  private static readonly DEFAULT_BOT_NAME = 'is-an.ai[bot]';
  private static readonly DEFAULT_BOT_EMAIL =
    '252833244+is-an-ai-bot[bot]@users.noreply.github.com';

  private static owner: string = Github.DEFAULT_OWNER;
  private static repo: string = Github.DEFAULT_REPO;
  private static botName: string = Github.DEFAULT_BOT_NAME;
  private static botEmail: string = Github.DEFAULT_BOT_EMAIL;

  /**
   * 요청 진입 시 1회 호출한다 (initMiddleware).
   * 한 배포 안의 모든 요청이 같은 env를 쓰므로 정적 필드로 두어도 안전하다.
   * 빈 값은 무시하고 기본값을 유지한다 — 설정 실수로 owner가 ''가 되면
   * 모든 GitHub 호출이 404가 되기 때문이다.
   */
  static configure(env: {
    GITHUB_OWNER?: string;
    GITHUB_REPO?: string;
    GITHUB_BOT_NAME?: string;
    GITHUB_BOT_EMAIL?: string;
  }): void {
    Github.owner = env.GITHUB_OWNER?.trim() || Github.DEFAULT_OWNER;
    Github.repo = env.GITHUB_REPO?.trim() || Github.DEFAULT_REPO;
    Github.botName = env.GITHUB_BOT_NAME?.trim() || Github.DEFAULT_BOT_NAME;
    Github.botEmail = env.GITHUB_BOT_EMAIL?.trim() || Github.DEFAULT_BOT_EMAIL;
  }

  /** 커밋 author/committer. 6곳에 흩어져 있던 리터럴을 한 곳으로 모은 것. */
  private static identity(): { name: string; email: string } {
    return { name: Github.botName, email: Github.botEmail };
  }
  private static readonly basePath = 'records';
  private static readonly baseUrl = 'https://api.github.com';
  private static readonly timeout = 10000; // 10 seconds

  private static toBase64(str: string): string {
    // btoa는 non-ASCII 문자를 처리하지 못하므로, unescape와 encodeURIComponent를 함께 사용합니다.
    return btoa(unescape(encodeURIComponent(str)));
  }

  private static fromBase64(str: string): string {
    // atob로 디코딩한 후, decodeURIComponent와 escape를 사용하여 UTF-8 문자를 복원합니다.
    return decodeURIComponent(escape(atob(str)));
  }

  static async createTokenforGitHubApp(
    pemKey: string,
    clientId: string,
    appId: string
  ): Promise<string> {
    const payload: Omit<GithubAppJWTPayload, 'iat' | 'exp'> = {
      iss: clientId,
    };
    const jwtToken = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 60) // 1 minute in the past to allow for clock skew
      .setExpirationTime('10m')
      .sign(await importPKCS8(pemKey, 'RS256'));
    const response = await fetch(`${Github.baseUrl}/app/installations/${appId}/access_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'is-an.ai.worker',
      },
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => null)) as GitHubErrorResponse | null;
      throw new Error(
        `GitHub API Auth error: ${response.status} - ${errorData?.message || response.statusText}`
      );
    }

    const data = (await response.json()) as GithubTokenResponse;
    return data.token;
  }

  static async getDomainDeterminationContent(
    subDomainName: string,
    token: string
  ): Promise<{ subDomain: GithubSubDomain; sha: string } | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Github.timeout);
    try {
      const response = await fetch(
        `${Github.baseUrl}/repos/${Github.owner}/${Github.repo}/contents/${Github.basePath}/${subDomainName}.json`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'is-an.ai.worker',
          },
          signal: controller.signal,
        }
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as GitHubErrorResponse | null;
        throw new Error(
          `GitHub API error: ${response.status} - ${errorData?.message || response.statusText}`
        );
      }

      const data = (await response.json()) as GitHubContentResponse;

      if (!data.content || data.encoding !== 'base64') {
        return null;
      }

      const subDomain = JSON.parse(Github.fromBase64(data.content)) as GithubSubDomain;
      return { subDomain, sha: data.sha };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new AppError(
          504,
          ErrorCode.GITHUB_API_ERROR,
          `Request timeout while getting domain determination content for ${subDomainName}`
        );
      }
      if (error.message.includes('404')) {
        return null;
      }
      throw new AppError(
        500,
        ErrorCode.GITHUB_API_ERROR,
        `Failed to get domain determination content for ${subDomainName}: ${error.message}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  static async updateDomainDeterminationContent(
    subDomainName: string,
    content: GithubSubDomain,
    token: string,
    sha: string
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Github.timeout);

    try {
      const jsonContent = JSON.stringify(content, null, 3);
      const base64Content = Github.toBase64(jsonContent);

      const response = await fetch(
        `${Github.baseUrl}/repos/${Github.owner}/${Github.repo}/contents/${Github.basePath}/${subDomainName}.json`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'is-an.ai.worker',
          },
          body: JSON.stringify({
            message: `Update ${subDomainName}.json`,
            content: base64Content,
            sha: sha,
            committer: Github.identity(),
            author: Github.identity(),
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as GitHubErrorResponse | null;
        throw new Error(
          `GitHub API error: ${response.status} - ${errorData?.message || response.statusText}`
        );
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new AppError(
          504,
          ErrorCode.GITHUB_API_ERROR,
          `Request timeout while updating domain determination content for ${subDomainName}`
        );
      }
      throw new AppError(
        500,
        ErrorCode.GITHUB_API_ERROR,
        `Failed to update domain determination content for ${subDomainName}: ${error.message}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  static async createDomainDeterminationContent(
    subDomainName: string,
    content: GithubSubDomain,
    token: string
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Github.timeout);

    try {
      const jsonContent = JSON.stringify(content, null, 3);
      const base64Content = Github.toBase64(jsonContent);

      const response = await fetch(
        `${Github.baseUrl}/repos/${Github.owner}/${Github.repo}/contents/${Github.basePath}/${subDomainName}.json`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'is-an.ai.worker',
          },
          body: JSON.stringify({
            message: `Create ${subDomainName}.json`,
            content: base64Content,
            committer: Github.identity(),
            author: Github.identity(),
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as GitHubErrorResponse | null;
        throw new Error(
          `GitHub API error: ${response.status} - ${errorData?.message || response.statusText}`
        );
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new AppError(
          504,
          ErrorCode.GITHUB_API_ERROR,
          `Request timeout while creating domain determination content for ${subDomainName}`
        );
      }
      throw new AppError(
        500,
        ErrorCode.GITHUB_API_ERROR,
        `Failed to create domain determination content for ${subDomainName}: ${error.message}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  static async deleteDomainDeterminationContent(
    subDomainName: string,
    token: string,
    sha: string
  ): Promise<void> {
    try {
      const response = await fetch(
        `${Github.baseUrl}/repos/${Github.owner}/${Github.repo}/contents/${Github.basePath}/${subDomainName}.json`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'is-an.ai.worker',
          },
          body: JSON.stringify({
            message: `Delete ${subDomainName}.json`,
            sha: sha,
            committer: Github.identity(),
            author: Github.identity(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
    } catch (error) {
      throw new AppError(
        500,
        ErrorCode.GITHUB_API_ERROR,
        `Failed to delete domain determination content for ${subDomainName}`
      );
    }
  }

  static async batchGetDomainDeterminationContent(
    subDomainNames: string[],
    token: string
  ): Promise<BatchSearchResponse> {
    const results: BatchSearchResult[] = [];
    const errors: string[] = [];

    const batchSize = 5;
    for (let i = 0; i < subDomainNames.length; i += batchSize) {
      const batch = subDomainNames.slice(i, i + batchSize);
      const batchPromises = batch.map(async (subDomainName) => {
        try {
          const result = await Github.getDomainDeterminationContent(subDomainName, token);
          return {
            subdomainName: subDomainName,
            subDomain: result?.subDomain || null,
            sha: result?.sha || null,
          };
        } catch (error: any) {
          errors.push(`Error fetching ${subDomainName}: ${error.message}`);
          return {
            subdomainName: subDomainName,
            subDomain: null,
            sha: null,
            error: error.message,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (i + batchSize < subDomainNames.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return {
      results,
      errors,
    };
  }

  /**
   * Retrieves all domain names in the directory recursively using the Git Trees API.
   * This method bypasses the 1,000 file limit of the Contents API.
   * @param token - GitHub API authentication token
   * @returns An array of subdomain names
   */
  static async getDomainDeterminationDirectory(token: string): Promise<string[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Github.timeout);

    const treeSha = 'main';

    try {
      const response = await fetch(
        // API 엔드포인트를 git/trees로 변경하고 recursive=1 쿼리 파라미터를 추가합니다.
        `${Github.baseUrl}/repos/${Github.owner}/${Github.repo}/git/trees/${treeSha}?recursive=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'is-an.ai.worker',
          },
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as GitHubErrorResponse | null;
        throw new Error(
          `GitHub API error: ${response.status} - ${errorData?.message || response.statusText}`
        );
      }

      const treeResponse = (await response.json()) as GitHubTreeResponse;

      // 파일 목록이 너무 많아 잘렸을 경우, 전체 목록을 가져오지 못했음을 의미하므로 에러를 발생시킵니다.
      if (treeResponse.truncated) {
        throw new AppError(
          500,
          ErrorCode.GITHUB_API_ERROR,
          'Failed to get directory contents: The result tree was truncated by GitHub API.'
        );
      }

      const subdomains = treeResponse.tree
        .filter((file) => file.path.startsWith(`${Github.basePath}/`))
        .filter((file) => file.type === 'blob' && file.path.endsWith('.json'))
        .map((file) => file.path.substring(Github.basePath.length + 1).replace('.json', ''));

      return subdomains;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new AppError(
          504,
          ErrorCode.GITHUB_API_ERROR,
          'Request timeout while getting directory contents with tree'
        );
      }
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        500,
        ErrorCode.GITHUB_API_ERROR,
        `Failed to get directory contents with tree: ${error.message}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
