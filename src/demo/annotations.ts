import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Demo annotations: the labels people read on demo screens (Photographer,
 * Model, Party A…), shoot titles and fixture notes, keyed by project, party
 * and pair id.
 *
 * They live in one JSON file under `.demo/`, never in the product database,
 * which deliberately holds no name, role or label for a party. The file is
 * served to every requester (a phone on the LAN sees the same labels as the
 * machine running the demo), written by `demo:reset` (the fixtures) and by
 * the demo's composer and scenario starters, and replaced wholesale by every
 * reset.
 */

export type AnnotationKind = 'fixture' | 'scenario' | 'composed';

export interface ProjectAnnotation {
  readonly title: string;
  readonly kind: AnnotationKind;
  /** Decision references for the inspector's engineering notes. Fixtures only. */
  readonly source?: string;
  readonly note?: string;
  readonly parties: Record<string, string>;
  readonly agreements: Record<string, string>;
}

export interface DemoAnnotations {
  readonly projects: Record<string, ProjectAnnotation>;
}

export const EMPTY_ANNOTATIONS: DemoAnnotations = Object.freeze({ projects: Object.freeze({}) });

export class AnnotationStore {
  readonly path: string;
  // Writes from one process are serialized; each is a whole-file replace.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(path: string) {
    this.path = path;
  }

  /** The stored annotations, or none when the file is absent or unreadable. */
  async read(): Promise<DemoAnnotations> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<DemoAnnotations>;
      return parsed && typeof parsed.projects === 'object' && parsed.projects !== null ? { projects: parsed.projects } : EMPTY_ANNOTATIONS;
    } catch {
      return EMPTY_ANNOTATIONS;
    }
  }

  /** Replaces every annotation (reset). */
  replace(annotations: DemoAnnotations): Promise<void> {
    return this.serialized(() => this.write(annotations));
  }

  /** Adds or replaces one project's annotation. */
  setProject(projectId: string, annotation: ProjectAnnotation): Promise<void> {
    return this.serialized(async () => {
      const current = await this.read();
      await this.write({ projects: { ...current.projects, [projectId]: annotation } });
    });
  }

  private serialized(fn: () => Promise<void>): Promise<void> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async write(annotations: DemoAnnotations): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(annotations, null, 2)}\n`);
    await rename(temporary, this.path);
  }
}

/** Where the demo keeps its annotations, relative to the checkout. */
export const ANNOTATIONS_FILE = 'annotations.json';
