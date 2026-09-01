// eslint.config.js

import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  // 1. 전역적으로 무시할 파일 및 디렉토리 설정
  {
    ignores: ['node_modules/', 'dist/'],
  },

  // 2. ESLint 기본 추천 규칙 적용 ('eslint:recommended')
  js.configs.recommended,

  // 3. TypeScript 추천 규칙 적용 ('plugin:@typescript-eslint/recommended')
  ...tseslint.configs.recommended,

  // 4. Prettier 추천 규칙 적용 ('plugin:prettier/recommended')
  //    - Prettier와 충돌하는 ESLint 규칙을 비활성화하고,
  //    - Prettier 규칙 위반을 ESLint 오류로 보고합니다.
  pluginPrettierRecommended,

  // 5. 사용자 정의 설정
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // pluginPrettierRecommended에 이미 포함되어 있지만, 명시적으로 작성
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
