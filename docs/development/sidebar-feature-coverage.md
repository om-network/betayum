# Sidebar feature coverage

This inventory compares the current app routes and API handlers with the guides
in `packages/docs`. An existing implementation is not a claim that its external
provider credentials or deployment have been verified.

| Area                                                                        | Implementation                                                                                                                          | Remaining external dependency                                                                         |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Overview, frameworks, evidence, policies, people, risks, vendors, documents | Existing organization routes and API modules                                                                                            | Organization data and user permissions                                                                |
| Controls                                                                    | Restored advanced-mode navigation and list route; API pagination, search, sort, creation, and detail views                              | Advanced mode and control permissions                                                                 |
| Usage                                                                       | Standalone organization-scoped read-only page and `/v1/billing/usage`; reuses recorded allowances and run history                       | Recorded data; no live Stripe or Trigger request needed                                               |
| Policy AI editor                                                            | Existing editor and review/apply workflow (`ai-policy-editor.mdx`)                                                                      | AI provider credentials                                                                               |
| Automated evidence                                                          | Existing automation editor, tests, publish, schedules (`automated-evidence.mdx`)                                                        | Trigger and integration credentials                                                                   |
| Questionnaires                                                              | Existing upload, answer review, knowledge base, export (`security-questionnaire.mdx`)                                                   | Document/AI providers and worker execution                                                            |
| Cloud Tests                                                                 | Existing AWS/Azure/GCP connection and findings workflows (`cloud-tests/index.mdx`)                                                      | Provider authorization and background scans                                                           |
| Integrations                                                                | Existing manifests, credentials, variables, checks (`integrations/index.mdx`)                                                           | OAuth integrations intentionally remain unavailable until configured (`integrations/oauth-setup.mdx`) |
| Trust Access                                                                | Existing requests, approval, NDA, grants, revocation, reviewer workflows (`trust-access.mdx`)                                           | Published portal, email and signing configuration                                                     |
| Penetration Tests                                                           | Existing run creation, status and artifacts; finding validation, HTTP/code/screenshot evidence and attack paths now use provider fields | Authorized target, allowance and penetration-test provider                                            |
| Devices                                                                     | Existing People device views and employee portal enrollment (`device-agent.mdx`)                                                        | Agent installation and reporting                                                                      |
| Settings                                                                    | Existing general, billing, context, keys, portal, secrets, roles, notifications, browser and user routes                                | Feature-specific permissions and credentials                                                          |

Usage is visible to users with `organization:read`, independently of the Security
feature flag. Controls requires both advanced mode and `control:read` in the
sidebar. Creation remains gated by `control:create` and the existing API guards.
The new Usage and Controls API reads are scoped to the organization selected in the route.

Provider-free empty states are distinguished from failed reads: a failed Usage
request does not become a zero balance, and a failed control query does not
become an empty control list. Missing finding evidence is shown as absent data,
rather than as a feature that has not been implemented.
