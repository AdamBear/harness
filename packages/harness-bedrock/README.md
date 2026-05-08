# @purista/harness-bedrock

Amazon Bedrock model provider adapter for `@purista/harness`.

## Install

```bash
npm install @purista/harness @purista/harness-bedrock
```

Configure AWS credentials with the standard AWS SDK credential chain and pass
the target region in application code.

```ts
import { bedrock } from '@purista/harness-bedrock'

bedrock({ region: process.env.AWS_REGION ?? 'us-east-1' })
```

## Package Format

This package is ESM-only and ships compiled JavaScript plus TypeScript
declarations from `dist/`. Source files, tests, source maps, and local configs
are not included in the published package.
