# @purista/harness-azure-foundry

Azure AI Foundry model provider adapter for `@purista/harness`.

## Install

```bash
npm install @purista/harness @purista/harness-azure-foundry
```

Configure the provider with an Azure AI Foundry model endpoint and either an API
key or Azure credential.

```ts
import { azureFoundry } from '@purista/harness-azure-foundry'

azureFoundry({
  endpoint: process.env.AZURE_AI_ENDPOINT!,
  apiKey: process.env.AZURE_AI_API_KEY!
})
```

## Package Format

This package is ESM-only and ships compiled JavaScript plus TypeScript
declarations from `dist/`. Source files, tests, source maps, and local configs
are not included in the published package.
