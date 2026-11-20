import Anthropic from '@anthropic-ai/sdk'
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import { type ZodType, z } from 'zod'
import type { Bindings } from '../../env'
import { AiError } from './errors'

// Default Bedrock model (global inference profile), used when ANTHROPIC_API_KEY is not set. Claude 5.x is
// gated on this AWS account, so Bedrock stays on Haiku 4.5; set ANTHROPIC_API_KEY to use 5.5 via the
// first-party API. Note that @anthropic-ai/bedrock-sdk is pinned to 0.x: 1.x sends an API version that
// Bedrock accepts only for Claude 4.7 and later.
export const DEFAULT_MODEL = 'global.anthropic.claude-haiku-4-5-20251001-v1:0'
// Default first-party model when ANTHROPIC_API_KEY is set but AI_MODEL is not.
export const DEFAULT_FIRST_PARTY_MODEL = 'claude-haiku-5-5'

// Haiku 4.5 rejects the effort parameter; every other current model accepts it.
const supportsEffort = (model: string) => !model.includes('claude-haiku-4-5')

export type Effort = 'low' | 'medium' | 'high'

/** True when the first-party Anthropic API should be used (key present) instead of Bedrock. */
export const usingFirstParty = (env: Bindings) => Boolean(env.ANTHROPIC_API_KEY)

export function createAi(env: Bindings) {
  if (env.ANTHROPIC_API_KEY) return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_REGION) {
    throw new AiError('ai_not_configured', 500, 'AWS credentials or region are missing')
  }
  return new AnthropicBedrock({
    awsRegion: env.AWS_REGION,
    awsAccessKey: env.AWS_ACCESS_KEY_ID,
    awsSecretKey: env.AWS_SECRET_ACCESS_KEY,
  })
}

/**
 * Resolves the model id for this call. On the first-party API: the per-call `strong` model (AI_MODEL_STRONG)
 * for the hardest flows, else AI_MODEL, else the first-party default. On Bedrock: BEDROCK_MODEL_ID or default.
 */
function resolveModel(env: Bindings, strong: boolean) {
  if (usingFirstParty(env)) {
    if (strong && env.AI_MODEL_STRONG) return env.AI_MODEL_STRONG
    return env.AI_MODEL ?? DEFAULT_FIRST_PARTY_MODEL
  }
  return env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL
}

export type Generated<T> = {
  data: T
  usage: { inputTokens: number; outputTokens: number }
  model: string
}

type Options<T> = {
  env: Bindings
  /** Stable system prompt. It is marked cacheable, so keep it free of per-request data. */
  system: string
  /** Per-request payload, sent as compact JSON in the user message. */
  input: unknown
  schema: ZodType<T>
  maxTokens?: number
  effort?: Effort
  /** Use the stronger model (AI_MODEL_STRONG) on the first-party API, for the hardest flows. */
  strong?: boolean
}

/**
 * One structured call to the model: JSON-schema output, parsed and validated with `schema`.
 * Retries once when the output does not validate, then fails with `ai_invalid_output`.
 */
export async function generateStructured<T>({
  env,
  system,
  input,
  schema,
  maxTokens = 4000,
  effort = 'low',
  strong = false,
}: Options<T>): Promise<Generated<T>> {
  const client = createAi(env)
  const model = resolveModel(env, strong)
  const jsonSchema = toOutputSchema(schema)
  const usage = { inputTokens: 0, outputTokens: 0 }
  const format = { type: 'json_schema' as const, schema: jsonSchema }
  const outputConfig = supportsEffort(model) ? { effort, format } : { format }

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Awaited<ReturnType<typeof client.messages.create>>
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: JSON.stringify(input) }],
        output_config: outputConfig,
      })
    } catch (e) {
      throw mapSdkError(e)
    }

    usage.inputTokens += response.usage.input_tokens
    usage.outputTokens += response.usage.output_tokens

    if (response.stop_reason === 'refusal') throw new AiError('ai_refused', 422, 'The model declined this request')
    if (response.stop_reason === 'max_tokens') throw new AiError('ai_truncated', 502, 'The model output was cut off')

    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    try {
      return { data: schema.parse(JSON.parse(text)), usage, model }
    } catch {
      // fall through and retry once
    }
  }

  throw new AiError('ai_invalid_output', 502, 'The model returned output that did not match the schema')
}

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

/** One structured call with an image (e.g. a nutrition label) plus a text instruction, parsed with `schema`. */
export async function generateStructuredFromImage<T>({
  env,
  system,
  instruction,
  image,
  mediaType,
  schema,
  maxTokens = 1500,
}: {
  env: Bindings
  system: string
  instruction: string
  image: string
  mediaType: ImageMediaType
  schema: ZodType<T>
  maxTokens?: number
}): Promise<Generated<T>> {
  const client = createAi(env)
  const model = resolveModel(env, false)
  const format = { type: 'json_schema' as const, schema: toOutputSchema(schema) }
  const outputConfig = supportsEffort(model) ? { effort: 'low' as const, format } : { format }

  let response: Awaited<ReturnType<typeof client.messages.create>>
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: instruction },
          ],
        },
      ],
      output_config: outputConfig,
    })
  } catch (e) {
    throw mapSdkError(e)
  }

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  if (response.stop_reason === 'refusal') throw new AiError('ai_refused', 422, 'The model declined this request')
  if (response.stop_reason === 'max_tokens') throw new AiError('ai_truncated', 502, 'The model output was cut off')
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  try {
    return { data: schema.parse(JSON.parse(text)), usage, model }
  } catch {
    throw new AiError('ai_invalid_output', 502, 'The model returned output that did not match the schema')
  }
}

// Structured outputs reject range/length keywords. The zod schema still enforces them when parsing.
const UNSUPPORTED = new Set([
  '$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'pattern', 'format',
])

function toOutputSchema(schema: ZodType): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip)
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>)
          .filter(([key]) => !UNSUPPORTED.has(key))
          .map(([key, value]) => [key, strip(value)]),
      )
    }
    return node
  }
  return strip(z.toJSONSchema(schema)) as Record<string, unknown>
}

function mapSdkError(e: unknown) {
  if (e instanceof AiError) return e
  const status = typeof e === 'object' && e !== null && 'status' in e ? (e as { status?: number }).status : undefined
  if (status === 429) return new AiError('ai_rate_limited', 429, 'The AI provider is rate limiting requests')
  console.error('bedrock call failed', e)
  return new AiError('ai_unavailable', 502, 'The AI provider is unavailable')
}
