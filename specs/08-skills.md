# Skills

A skill is a directory containing a `SKILL.md` file (YAML frontmatter + markdown instructions) plus arbitrary supporting files. The harness mounts the entire directory at `/skills/<name>/` in the sandbox and injects only the frontmatter (name + description) into the agent's system prompt. The model reads the body and supporting files on demand via the built-in filesystem tools, following the [Anthropic Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) progressive-disclosure pattern.

## File layout

```
my-skill/
├── SKILL.md           # required at the directory root
├── scripts/           # free-form supporting files
├── examples/
└── references/
```

## `SKILL.md` format

YAML frontmatter + markdown body. Frontmatter schema (Zod, locked):

```ts
const skillFrontmatter = z.object({
  name: z.string()
    .min(1).max(64)
    .regex(/^[a-z][a-z0-9-]*$/, 'kebab-case: lowercase letters, digits, hyphens; must start with a letter')
    .refine(n => !/anthropic|claude|purista/i.test(n), 'reserved words not allowed'),
  description: z.string().min(1).max(1024),
  // Optional purista-extension fields:
  version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/).optional(),
})
```

Body: markdown of arbitrary length; advisory cap of ~5000 tokens (not enforced by the harness — the model decides what to read).

Supporting files (anything beside `SKILL.md`): free-form. Mounted with the directory at `/skills/<name>/`.

## SkillDefinition (harness-side)

Skills are registered via `defineHarness().skills({...})`. There is no standalone `defineSkill` factory.

```ts
interface SkillDefinition {
  /** Absolute path to the directory containing SKILL.md. */
  directory: string
}
```

## Loading and validation

At builder time:

1. Validate `directory` exists and is a directory; otherwise `HarnessConfigError{reason:'skill_directory_missing'}`.
2. Read and parse `<directory>/SKILL.md`; missing file throws `SkillManifestError{reason:'missing_skill_md'}`; invalid frontmatter throws `SkillManifestError{reason:'invalid_frontmatter', meta: zodIssues}`.
3. Lock: the harness config key MUST equal the frontmatter `name`. Mismatch throws `SkillManifestError{reason:'name_mismatch', meta:{configKey, frontmatterName}}`.
4. The body and supporting files are NOT read at config time; they are mounted lazily at session start.

The harness caches the resolved skill as:

```ts
interface ResolvedSkill {
  name: string
  description: string
  version?: string
  directory: string
}
```

## Mounting at session start

Locked behavior: when an agent runs in a session and has any skills declared, the harness:

1. For each declared skill, recursively reads the skill directory from disk.
2. Mounts the entire directory tree into the sandbox at `/skills/<name>/` via `SandboxSession.mount(files, '/skills/<name>')`.
3. Mounting happens once per session (cached). If multiple agents in the same session share skills, the mount is reused. If skills change on disk after a session opens, changes are NOT picked up (locked rule).

## System prompt injection (progressive disclosure)

Locked: at the start of each agent run, the harness builds a "skill index" appended to the agent's `instructions` system message:

```
Available skills (read /skills/<name>/SKILL.md for full instructions):
- <name>: <description>
- <name>: <description>
```

Only `name` and `description` from the frontmatter — keeps Level 1 token cost ~100 tokens per skill (per Anthropic guidance).

The model is responsible for reading `/skills/<name>/SKILL.md` via the built-in `read` tool when it decides a skill is relevant. The body is NOT auto-injected (locked rule).

## Skill key vs frontmatter name

Locked above: must match. The harness config key is the canonical id used in `agents.<id>.skills: ['<key>']`.

## Errors

See [15-error-catalog](./15-error-catalog.md) for the full `SkillManifestError.meta.reason` enum:

- `'missing_skill_md'`
- `'invalid_frontmatter'`
- `'name_mismatch'`
- `'directory_missing'`
- `'reserved_name'`

## Cross-references

- [05-sandbox](./05-sandbox.md) — `mount` semantics, reserved `/skills/` path.
- [07-tools](./07-tools.md) — built-in `read`/`list`/`glob` for the model to navigate skill files.
- [09-agents](./09-agents.md) — when mounting and prompt injection happen in the loop.
- [15-error-catalog](./15-error-catalog.md).
