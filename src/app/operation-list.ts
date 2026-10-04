import { healthOperation } from '../http/health.ts';
import type { AnyOperation } from '../http/operations.ts';
import {
  createSyntheticResourceOperation,
  readSyntheticResourceOperation,
} from '../stage0/synthetic-resource.ts';

/**
 * Every operation the application exposes. This list is the whole HTTP
 * surface: `createApp` registers exactly these, and the authorization test
 * iterates exactly these.
 */
export const operations: readonly AnyOperation[] = [
  healthOperation,
  createSyntheticResourceOperation,
  readSyntheticResourceOperation,
];
