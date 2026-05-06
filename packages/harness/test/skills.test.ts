import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { loadSkills, mountSkillsOnce } from '../src/skills/index.js'
import { inMemorySandbox } from '../src/sandbox/index.js'

it('validates frontmatter and key/name matching', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-'))
  await fs.writeFile(path.join(dir, 'SKILL.md'), '---\nname: demo-skill\ndescription: demo\n---\nbody')
  const skills = await loadSkills({ 'demo-skill': { directory: dir } })
  expect(skills['demo-skill'].name).toBe('demo-skill')
})

it('mounts skill directories to /skills/<name>', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-'))
  await fs.writeFile(path.join(dir, 'SKILL.md'), '---\nname: example-skill\ndescription: example\n---\nbody')
  await fs.mkdir(path.join(dir, 'scripts'))
  await fs.writeFile(path.join(dir, 'scripts', 'run.sh'), 'echo hi')
  const skills = await loadSkills({ 'example-skill': { directory: dir } })
  const session = await inMemorySandbox().open({ sessionId: 's', runId: 'r' })
  await mountSkillsOnce(session, new Set(), skills, ['example-skill'])
  expect(await session.readText('/skills/example-skill/SKILL.md')).toContain('name: example-skill')
  expect(await session.readText('/skills/example-skill/scripts/run.sh')).toBe('echo hi')
})
