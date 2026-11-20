export type Bindings = {
  DATABASE_URL: string
  JWT_SECRET: string
  /** Public URL of the web app, used in e-mailed links. */
  APP_URL: string
  /** Gmail address and its app password, used to send e-mail over SMTP. */
  SMTP_USER?: string
  SMTP_PASS?: string
  /** IAM access key for Amazon Bedrock. Its policy should allow only bedrock:InvokeModel*. */
  AWS_ACCESS_KEY_ID?: string
  AWS_SECRET_ACCESS_KEY?: string
  AWS_REGION?: string
  /** Bedrock model ID. Used when ANTHROPIC_API_KEY is not set. */
  BEDROCK_MODEL_ID?: string
  /** First-party Anthropic API key. When set, the AI calls go to the Anthropic API instead of Bedrock. */
  ANTHROPIC_API_KEY?: string
  /** Default first-party model id (e.g. claude-haiku-5-5). Used only with ANTHROPIC_API_KEY. */
  AI_MODEL?: string
  /** Stronger first-party model for the hardest flows (e.g. claude-sonnet-5-5). Optional. */
  AI_MODEL_STRONG?: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: { userId: string }
}
