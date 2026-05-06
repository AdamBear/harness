import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { SkillManifestError, SkillNotFoundError } from '../errors/index.js'
import type { JsonValue } from '../models/json.js'
import type { ResolvedSkill, SkillDefinition } from '../harness/defineHarness.js'
import type { SandboxSession } from '../sandbox/index.js'

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  if (!content.startsWith('---\n')) throw new SkillManifestError('Invalid SKILL.md frontmatter', { reason: 'invalid_frontmatter', directory: '' })
  const end = content.indexOf('\n---\n', 4)
  if (end < 0) throw new SkillManifestError('Invalid SKILL.md frontmatter', { reason: 'invalid_frontmatter', directory: '' })
  const raw = content.slice(4, end)
  const body = content.slice(end + 5)
  const frontmatter: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return { frontmatter, body }
}

function validateName(name: string): boolean { return /^[a-z][a-z0-9-]*$/.test(name) && !/anthropic|claude|purista/i.test(name) }

export function loadSkillsSync(skills: Record<string, SkillDefinition>): Record<string, ResolvedSkill> {
  const resolved: Record<string, ResolvedSkill> = {}
  for (const [key, def] of Object.entries(skills)) {
    const stat = fs.existsSync(def.directory) ? fs.statSync(def.directory) : null
    if (!stat?.isDirectory()) throw new SkillManifestError('Skill directory missing', { reason: 'directory_missing', directory: def.directory, skill_id: key })
    const skillPath = path.join(def.directory, 'SKILL.md')
    const content = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : null
    if (!content) throw new SkillManifestError('missing SKILL.md', { reason: 'missing_skill_md', directory: def.directory, skill_id: key })
    const { frontmatter } = parseFrontmatter(content)
    const name = frontmatter['name'] ?? ''
    const description = frontmatter['description'] ?? ''
    if (!validateName(name) || description.length < 1 || description.length > 1024) {
      throw new SkillManifestError('invalid frontmatter', { reason: 'invalid_frontmatter', directory: def.directory, skill_id: key })
    }
    if (name !== key) throw new SkillManifestError('name mismatch', { reason: 'name_mismatch', directory: def.directory, skill_id: key })
    resolved[key] = { name, description, directory: def.directory, ...(frontmatter['version'] ? { version: frontmatter['version'] } : {}) }
  }
  return resolved
}

export async function loadSkills(skills: Record<string, SkillDefinition>): Promise<Record<string, ResolvedSkill>> {
  return loadSkillsSync(skills)
}

async function readDirRecursive(root: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  const walk = async (dir: string): Promise<void> => {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(abs)
      else if (entry.isFile()) files.set(path.posix.normalize(path.relative(root, abs).split(path.sep).join('/')), await fsp.readFile(abs))
      }
    }
  await walk(root)
  return files
}

export async function mountSkillsOnce(
  session: SandboxSession,
  mounted: Set<string>,
  skills: Record<string, ResolvedSkill>,
  skillIds: readonly string[]
): Promise<void> {
  for (const skillId of skillIds) {
    if (mounted.has(skillId)) continue
    const skill = skills[skillId]
    if (!skill) throw new SkillNotFoundError('Skill not found.', { skill_id: skillId })
    const files = await readDirRecursive(skill.directory)
    await session.mount(files, `/skills/${skillId}`)
    mounted.add(skillId)
  }
}

export function buildSkillIndex(skills: Record<string, ResolvedSkill>, ids: readonly string[]): string {
  if (ids.length === 0) return ''
  const lines = ids.map((id) => `- ${skills[id]?.name ?? id}: ${skills[id]?.description ?? ''}`)
  return `\n\nAvailable skills (read /skills/<name>/SKILL.md for full instructions):\n${lines.join('\n')}`
}

export function assertSerializable(value: unknown): asserts value is JsonValue {
  try {
    JSON.stringify(value)
  } catch {
    throw new SkillManifestError('Non-serializable value', { reason: 'invalid_frontmatter', directory: '' })
  }
}
