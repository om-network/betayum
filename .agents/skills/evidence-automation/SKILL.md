---
name: evidence-automation
description: "How the evidence automation script system works — runtime contract, secrets, tools, output format, and the chat route. Use when building or extending evidence automation features."
---

# Evidence Automation System

## Architecture

The automation system lets an LLM generate Python scripts that collect compliance evidence from external APIs. Scripts are stored as `scriptDraft` on `EvidenceAutomation` and executed in-process by the NestJS API.

```
User chat → chat/route.ts (Next.js) → streamText (GPT-4o)
  → storeToS3 tool → PUT /v1/tasks/:taskId/automations/:automationId/draft-script
  → runScript tool  → POST .../draft-script/run
    → AutomationScriptExecutorService → python3 script with secrets as env vars
```

## Chat Route

**File:** `apps/app/src/app/api/tasks-automations/chat/route.ts`

The LLM is instructed to:
- Always write a complete Python script and call `storeToS3` on every response
- Never ask clarifying questions — make reasonable assumptions
- Use `promptForSecret` after writing a script if credentials are needed
- Never call `runScript` automatically — only on explicit user request

**Available tools for the LLM:**
| Tool | Purpose |
|------|---------|
| `storeToS3` | Save the generated Python script as draft |
| `runScript` | Execute the current draft (pass `secretRefs` array) |
| `promptForSecret` | Ask user for a credential — stored encrypted, injected as env var |
| `promptForInfo` | Ask user for non-secret config (IDs, URLs, etc.) |

`allowedTools` on the `EvidenceAutomation` record gates which optional tools are enabled. `null` means all tools are enabled.

## Script Runtime Contract

**Executor:** `apps/api/src/tasks/automations/automation-script-executor.service.ts`

Scripts run as: `python3 script.py` with env vars injected.

**Environment:**
- `process.env` from the Node.js API process (inherits all server env vars)
- Decrypted secrets from `Secret` table, keyed by `secret.name`

**Timeout:** 60 seconds hard limit.

**Required output:** Script must print a single JSON object to stdout:
```python
import json, os

def main():
    # ... collect evidence ...
    return {
        "success": True,       # or False on failure
        "data": { ... },       # evidence payload
        "error": None,         # string if success=False
    }

if __name__ == "__main__":
    result = main()
    print(json.dumps(result))
```

The executor parses `stdout` as JSON. If `parsed.success === true`, the run is marked `completed`. Anything on `stderr` is captured as `logs`.

## Secrets Pattern

Secrets are stored encrypted in the `Secret` table (`organizationId`, `name`, `value`, `category`).

When a script declares `secretRefs`, they are resolved and injected as env vars:
```typescript
// secretRefs passed at run time:
[{ name: "GCP_SERVICE_ACCOUNT_KEY", category: "automation" }]

// In Python script:
import os, json
key = json.loads(os.environ["GCP_SERVICE_ACCOUNT_KEY"])
```

The LLM calls `promptForSecret` to trigger the UI to collect and store the secret. The `secretName` becomes the env var name.

## Run Lifecycle

```
status: pending → running → completed | failed
```

Stored in `EvidenceAutomationRun`:
- `version: null` for draft runs, `version: N` for published version runs
- `output`: the parsed JSON from stdout
- `error`: error string on failure
- `success`: boolean

## Key API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `PUT` | `/v1/tasks/:taskId/automations/:automationId/draft-script` | Save draft script |
| `GET` | `/v1/tasks/:taskId/automations/:automationId/draft-script` | Get draft script |
| `POST` | `/v1/tasks/:taskId/automations/:automationId/draft-script/run` | Run draft (no version needed) |
| `POST` | `/v1/tasks/:taskId/automations/:automationId/runs` | Run published version |
| `GET` | `/v1/tasks/:taskId/automations/runs/:runId` | Poll run status |

## Extending the System

To add a new credential source (e.g. integration OAuth tokens):
1. Extend `resolveSecrets()` in `automation-script-executor.service.ts` to also query `IntegrationConnection` + `IntegrationCredentialVersion`
2. Inject token as a named env var (e.g. `GCP_ACCESS_TOKEN`)
3. Update `buildSystemPrompt()` in `chat/route.ts` to tell the LLM which env vars are pre-populated when an integration is connected

To add a new tool to the LLM:
1. Add to `optionalTools` in `chat/route.ts`
2. Add the tool name to `allowedTools` on `EvidenceAutomation` to enable it per-automation
