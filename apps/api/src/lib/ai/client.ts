import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk'
import { type ZodType, z } from 'zod'
import type { Bindings } from '../../env'
import { AiError } from './errors'

export const DEFAULT_MODEL = 'anthropic.claude-haiku-5-5'

export type Effort = 'low' | 'medium' | 'high'

export function createAi(env: Bindings) {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_REGION) {
    throw new AiError('ai_not_configured', 500, 'AWS credentials or region are missing')
  }
  return new AnthropicBedrockMantle({
    awsRegion: env.AWS_REGION,
    awsAccessKey: env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  })
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
}: Options<T>): Promise<Generated<T>> {
  const client = createAi(env)
  const model = env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>
  const usage = { inputTokens: 0, outputTokens: 0 }

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Awaited<ReturnType<typeof client.messages.create>>
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: JSON.stringify(input) }],
        output_config: { effort, format: { type: 'json_schema', schema: jsonSchema } },
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

function mapSdkError(e: unknown) {
  if (e instanceof AiError) return e
  const status = typeof e === 'object' && e !== null && 'status' in e ? (e as { status?: number }).status : undefined
  if (status === 429) return new AiError('ai_rate_limited', 429, 'The AI provider is rate limiting requests')
  console.error('bedrock call failed', e)
  return new AiError('ai_unavailable', 502, 'The AI provider is unavailable')
}
