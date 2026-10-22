import { healthOperation } from '../http/health.ts';
import type { AnyOperation } from '../http/operations.ts';
import { NO_IDENTITY, createIdentityOperations, type IdentityOptions } from '../identity/operations.ts';
import { participantOperations } from '../participants/operations.ts';
import { createProjectOperation, readProjectOperation } from '../projects/project.ts';
import {
  createSyntheticResourceOperation,
  readSyntheticResourceOperation,
} from '../stage0/synthetic-resource.ts';

/**
 * Every operation the application exposes. This list is the whole HTTP
 * surface: `createApp` registers exactly these, and the authorization test
 * iterates exactly these. The identity operations take their registered
 * providers as an argument; the routes, access and shapes do not depend on
 * which providers are registered.
 */
export function createOperationList(identity: IdentityOptions = NO_IDENTITY): readonly AnyOperation[] {
  return [
    healthOperation,
    createSyntheticResourceOperation,
    readSyntheticResourceOperation,
    createProjectOperation,
    readProjectOperation,
    ...createIdentityOperations(identity),
    ...participantOperations,
  ];
}

/** The production list's shape, with no identity provider registered. */
export const operations: readonly AnyOperation[] = createOperationList();
