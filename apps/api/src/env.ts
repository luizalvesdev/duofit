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
  /** Bedrock model ID. Defaults to Claude Haiku 5.5. */
  BEDROCK_MODEL_ID?: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: { userId: string }
}
