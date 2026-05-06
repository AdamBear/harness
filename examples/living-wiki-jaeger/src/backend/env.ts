import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export function findRepositoryRoot(start = process.cwd()): string {
  let current = resolve(start)
  while (true) {
    const packagePath = join(current, 'package.json')
    if (existsSync(packagePath)) {
      try {
        const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { workspaces?: unknown }
        if (Array.isArray(parsed.workspaces)) return current
      } catch {
        // Keep walking if an intermediate package.json is not readable JSON.
      }
    }
    const parent = dirname(current)
    if (parent === current) return resolve(start)
    current = parent
  }
}

export function loadRootEnv(start = process.cwd()): string | undefined {
  const envPath = join(findRepositoryRoot(start), '.env')
  if (!existsSync(envPath)) return undefined

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const raw = trimmed.slice(eq + 1).trim()
    process.env[key] ??= raw.replace(/^['"]|['"]$/g, '')
  }

  return envPath
}

export function requireOpenAiKey(start = process.cwd()): string {
  loadRootEnv(start)
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for real provider mode. Define it in the repository-root .env file.')
  }
  return apiKey
}
