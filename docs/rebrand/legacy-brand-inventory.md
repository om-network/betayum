# Betayum Legacy Brand Inventory

Parent PRD: https://github.com/om-network/betayum/issues/75

Generated from:

```sh
rg -l --glob '!node_modules' --glob '!.git' --glob '!dist' --glob '!build' --glob '!.next' "Comp AI|CompAI|trycomp\.ai"
```

Baseline scope before the rebrand found 282 files with legacy brand matches.
The implementation must not use broad find-and-replace. Each match belongs to
one of the classifications below.

## Classification Rules

| Classification | Meaning | Action |
| --- | --- | --- |
| `replace` | Current user-facing product, legal, contact, URL, email, PDF, OpenAPI, or generated-content text | Migrate to Betayum through source edits or brand config |
| `keep-codename` | Internal package names, import paths, package scopes, repository history, old plans, developer-only references | Leave unchanged |
| `keep-compatibility` | Customer-copied operational identifiers such as AWS roles/policies, device-agent artifact names, and local paths | Preserve exact identifier, update surrounding copy only |
| `keep-legal-history` | Historical migrations, license history, or archived legal-history text that should not be rewritten retroactively | Leave unchanged unless a new migration supersedes it |
| `needs-human-destination` | External URL or support/community destination without a confirmed Betayum replacement | Keep until destination exists or make configurable |

## Replace

- Runtime app and portal metadata, auth screens, headers, assistant labels, badges,
  setup/onboarding copy, support links, and visible portal task guidance under
  `apps/app/src` and `apps/portal/src`.
- API-generated user communications under `apps/api/src/auth`,
  `apps/api/src/people`, `apps/api/src/email`, `packages/email`, and notifier
  services.
- Generated customer artifacts under PDF/report/certificate/trust-portal code.
- Public API documentation source and generated metadata where it describes the
  current product, including OpenAPI title, descriptions, examples, and server
  URLs.
- System-owned default templates and seed content under Prisma seed fixtures when
  newly generated customer records would otherwise say the old brand.
- Current README, SECURITY contact text, self-hosting examples, docs examples,
  and current operator runbooks that users or customers are expected to read.
- Package descriptions that are user-visible package metadata when they describe
  the product, not internal package identity.

## Keep Codename

- Workspace package names and imports such as `@trycompai/*`.
- Build, Turbo, TypeScript, and package-manager configuration that names
  workspaces by package scope.
- Developer-only agent/skill files and local planning files.
- Repository URLs, badge URLs, and old GitHub references unless they are current
  customer-facing docs destinations.
- Internal comments that describe legacy implementation history and do not render
  to users.

## Keep Compatibility

- AWS IAM role and policy identifiers such as `CompAI-Auditor`,
  `CompAI-Remediator`, `CompAI-AutoFix`, and service-delivery patterns.
- Device-agent artifact prefixes such as `CompAI-Device-Agent`.
- Local device-agent paths such as `C:\ProgramData\CompAI\Fleet` and
  `C:\Users\Public\CompAI\Fleet`.
- Cloud provider examples where a customer may already have created the named
  role, policy, topic, path, or artifact.

## Keep Legal History

- Historical migration files that record previous defaults.
- Archived docs or generated snapshots that are not a current user-facing
  source of truth.
- Legal history that must remain historically accurate. Current legal-company
  references should change to `OM.Network, LLC`.

## Needs Human Destination

- Community or roadmap links without confirmed Betayum equivalents.
- Help-center URLs when the new Betayum destination has not been provisioned.
- Asset URLs when approved Betayum logo, favicon, email logo, or Open Graph
  files have not been supplied.

## Implementation Order

1. Add shared brand config defaults and deployment overrides.
2. Migrate app and portal runtime surfaces.
3. Migrate API-generated emails, PDFs, and OpenAPI output.
4. Migrate system-owned default content and add a narrow data migration only for
   clearly platform-owned default values.
5. Migrate public docs and repository-facing customer materials.
6. Replace visual assets only after approved assets exist.
7. Add scanner enforcement so new legacy brand strings require classification.
