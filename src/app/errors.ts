export interface InputIssue {
  readonly location: string;
  readonly path: string;
  readonly message: string;
}

/**
 * The one error type application code throws on purpose. Anything else that
 * reaches the error boundary is treated as an unexpected server error.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly issues: readonly InputIssue[] | undefined;

  constructor(statusCode: number, code: string, issues?: readonly InputIssue[]) {
    super(code);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.issues = issues;
  }
}

/** Uniform error body: `{ error: { code, requestId, issues? } }`. */
export interface ErrorBody {
  error: {
    code: string;
    requestId: string;
    issues?: readonly InputIssue[];
  };
}
