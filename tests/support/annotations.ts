import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnnotationStore } from '../../src/demo/annotations.ts';

/** A demo annotation store in a fresh temporary file, for tests. */
export function temporaryAnnotationStore(): AnnotationStore {
  return new AnnotationStore(join(tmpdir(), `ms-demo-annotations-${randomUUID()}.json`));
}
