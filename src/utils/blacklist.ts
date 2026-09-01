export const blackListedSubdomains = [
  'sync',
  'blog',
  'tunnel',
  'papers',
  'contact',
  'scheme',
  'www',
  'api',
  'ns1',
  'ns2',
  'docs',
  'status',
  'dashboard',
  'assets',
  'smtp',
  'mail',
  'dev',
  '_dmarc',
  '_github-challenge-is-an-ai',
  '_vercel',
];

/**
 * @deprecated 더 이상 사용되지 않습니다. blackListedSubdomains는 향후 제거될 예정입니다.
 * 대신 validateSubdomainName 함수를 사용하세요.
 */
export const blackListedSubdomainRegexes = [/^_.*/];
