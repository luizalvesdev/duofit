export type Bindings = {
  DATABASE_URL: string
  JWT_SECRET: string
  /** Public URL of the web app, used in e-mailed links. */
  APP_URL: string
  /** Gmail address and its app password, used to send e-mail over SMTP. */
  SMTP_USER?: string
  SMTP_PASS?: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: { userId: string }
}
