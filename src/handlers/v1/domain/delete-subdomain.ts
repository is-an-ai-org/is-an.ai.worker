import { Context } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';
import { Github } from '@/utils/github/github';

export const handleDeleteSubdomain = async (c: Context<AppType>): Promise<Response> => {
  const subdomainName = c.req.param('subdomainName');

  const db = c.get('db');
  const user = c.get('user');
  const githubToken = c.env.GITHUB_PAT;

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  // 기존 서브도메인 조회
  const existingSubdomain = await db.findSubdomainByName(subdomainName);

  if (!existingSubdomain) {
    throw new AppError(404, ErrorCode.SUBDOMAIN_NOT_FOUND, 'Subdomain not found');
  }

  // 소유권 확인
  if (existingSubdomain.ownerId !== user.userId) {
    throw new AppError(
      403,
      ErrorCode.FORBIDDEN,
      "You don't have permission to delete this subdomain"
    );
  }

  // GitHub에서 현재 설정 가져오기
  const githubContent = await Github.getDomainDeterminationContent(subdomainName, githubToken);
  if (!githubContent) {
    throw new AppError(
      404,
      ErrorCode.GITHUB_API_ERROR,
      'Subdomain configuration not found in GitHub'
    );
  }

  // GitHub에서 파일 삭제
  await Github.deleteDomainDeterminationContent(subdomainName, githubToken, githubContent.sha);

  // DB에서 삭제
  await db.deleteSubdomainByName(subdomainName);

  return c.json({ message: 'Subdomain deleted successfully' });
};
