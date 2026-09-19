export function extractAccessToken(req: any): string | null {
  let token: string | null = null
  const header = req.headers.authorization

  if (header) {
    token = header.trim()
    if (token?.startsWith('Bearer ')) {
      token = token.slice(7)
    }
    return token
  }

  if (req.query?.token) {
    token = req.query.token
  }

  return token
}
