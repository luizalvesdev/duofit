export type AiErrorCode =
  | 'ai_consent_required'
  | 'ai_safety_block'
  | 'ai_profile_required'
  | 'ai_rate_limited'
  | 'ai_refused'
  | 'ai_truncated'
  | 'ai_invalid_output'
  | 'ai_unavailable'
  | 'ai_not_configured'

type AiErrorStatus = 403 | 422 | 429 | 500 | 502

/** Typed failure that routes turn into a JSON `{ error, message }` response. */
export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    public status: AiErrorStatus,
    message?: string,
  ) {
    super(message ?? code)
  }
}

/** Plain HTTP failure for apply routes (409 when the plan changed, 400 for bad input). */
export class HttpError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    public code: string,
  ) {
    super(code)
  }
}
