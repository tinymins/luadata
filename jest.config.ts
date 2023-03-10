import type { Config } from 'jest';

const config: Config = {
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{ts,tsx}',
    '!*.test.ts',
  ],
  setupFilesAfterEnv: [
    'jest-extended/all',
  ],
};

export default config;
