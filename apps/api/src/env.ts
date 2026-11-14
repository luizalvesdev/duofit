export type Bindings = {
  DATABASE_URL: string
  JWT_SECRET: string
  INVITE_CODE: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: { userId: string }
}
