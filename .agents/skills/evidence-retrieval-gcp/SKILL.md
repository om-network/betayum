---
name: evidence-retrieval-gcp
description: "GCP evidence retrieval for compliance frameworks — which APIs map to which controls (SOC2, ISO27001, PCI-DSS), credential patterns, and Python script templates. Use when building GCP automation scripts or updating the chat system prompt."
---

# GCP Evidence Retrieval for Compliance

## Authentication

Scripts authenticate using a **service account JSON key** stored as a secret named `GCP_SERVICE_ACCOUNT_KEY`.

The LLM should call `promptForSecret` with:
```python
secretName = "GCP_SERVICE_ACCOUNT_KEY"
description = "GCP service account JSON key with read-only access (roles/viewer)"
exampleValue = '{"type":"service_account","project_id":"...","private_key":"..."}'
```

**In the script**, exchange the key for an access token:
```python
import os, json, urllib.request, urllib.parse, time

def get_access_token():
    import base64, hmac, hashlib
    key_data = json.loads(os.environ["GCP_SERVICE_ACCOUNT_KEY"])
    
    # Use google-auth if available, else use requests + PyJWT
    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests
        credentials = service_account.Credentials.from_service_account_info(
            key_data,
            scopes=["https://www.googleapis.com/auth/cloud-platform.read-only"]
        )
        credentials.refresh(google.auth.transport.requests.Request())
        return credentials.token
    except ImportError:
        # Fallback: manual JWT → token exchange
        import jwt as pyjwt
        now = int(time.time())
        payload = {
            "iss": key_data["client_email"],
            "sub": key_data["client_email"],
            "aud": "https://oauth2.googleapis.com/token",
            "iat": now,
            "exp": now + 3600,
            "scope": "https://www.googleapis.com/auth/cloud-platform.read-only"
        }
        signed = pyjwt.encode(payload, key_data["private_key"], algorithm="RS256")
        data = urllib.parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": signed
        }).encode()
        req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data)
        resp = json.loads(urllib.request.urlopen(req).read())
        return resp["access_token"]

def gcp_get(token, url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(req).read())
```

Also require `GCP_PROJECT_ID` via `promptForInfo`.

---

## Compliance Control → GCP API Mapping

### IAM & Access Control (SOC2 CC6, ISO27001 A.9, PCI-DSS 7/8)

**Evidence: List IAM policy bindings for a project**
```
GET https://cloudresourcemanager.googleapis.com/v1/projects/{projectId}:getIamPolicy
Method: POST (body: {})
```
Collects: who has what roles on the project. Evidence for least-privilege, access review.

**Evidence: List service accounts**
```
GET https://iam.googleapis.com/v1/projects/{projectId}/serviceAccounts
```
Collects: all service accounts, disabled status. Evidence for service account hygiene.

**Evidence: Service account keys**
```
GET https://iam.googleapis.com/v1/projects/{projectId}/serviceAccounts/{email}/keys
```
Collects: key creation dates, expiry. Evidence for key rotation compliance.

---

### Audit Logging (SOC2 CC7, ISO27001 A.12.4, PCI-DSS 10)

**Evidence: Audit log sinks (are logs being exported?)**
```
GET https://logging.googleapis.com/v2/projects/{projectId}/sinks
```
Collects: log sink destinations, filters. Evidence that audit logs are retained.

**Evidence: Audit log config on organization**
```
GET https://logging.googleapis.com/v2/projects/{projectId}:getCmekSettings
POST https://cloudresourcemanager.googleapis.com/v1/projects/{projectId}:getIamPolicy
```

---

### Network Security (SOC2 CC6.6, ISO27001 A.13, PCI-DSS 1)

**Evidence: Firewall rules**
```
GET https://compute.googleapis.com/compute/v1/projects/{projectId}/global/firewalls
```
Collects: all firewall rules, allowed ports, source ranges. Evidence for network segmentation.

**Evidence: VPC flow logs enabled**
```
GET https://compute.googleapis.com/compute/v1/projects/{projectId}/regions/{region}/subnetworks
```
Check `enableFlowLogs` field on each subnetwork.

---

### Data Encryption (SOC2 CC6.7, ISO27001 A.10, PCI-DSS 3)

**Evidence: Cloud Storage bucket encryption**
```
GET https://storage.googleapis.com/storage/v1/b?project={projectId}
GET https://storage.googleapis.com/storage/v1/b/{bucket}
```
Check `encryption.defaultKmsKeyName` and `iamConfiguration.uniformBucketLevelAccess`.

**Evidence: KMS key rotation**
```
GET https://cloudkms.googleapis.com/v1/projects/{projectId}/locations/-/keyRings/-/cryptoKeys
```
Check `rotationPeriod` and `nextRotationTime`.

---

### Vulnerability & Monitoring (SOC2 CC7.1, ISO27001 A.12.6)

**Evidence: Security Command Center findings**
```
GET https://securitycenter.googleapis.com/v1/organizations/{orgId}/sources/-/findings?filter=state="ACTIVE"
```
Requires `roles/securitycenter.findingsViewer` on the organization.

**Evidence: Monitoring alerting policies**
```
GET https://monitoring.googleapis.com/v3/projects/{projectId}/alertPolicies
```
Collects: alert policies, enabled status, notification channels.

---

## Standard Script Template

```python
import json, os, urllib.request

GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")

def get_access_token():
    key_data = json.loads(os.environ["GCP_SERVICE_ACCOUNT_KEY"])
    from google.oauth2 import service_account
    import google.auth.transport.requests
    creds = service_account.Credentials.from_service_account_info(
        key_data,
        scopes=["https://www.googleapis.com/auth/cloud-platform.read-only"]
    )
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token

def gcp_get(token, url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.error.HTTPError as e:
        return {"error": e.reason, "status": e.code}

def main():
    if not GCP_PROJECT_ID:
        return {"success": False, "error": "GCP_PROJECT_ID env var not set", "data": None}
    
    try:
        token = get_access_token()
        
        # Example: collect IAM policy
        policy = gcp_get(
            token,
            f"https://cloudresourcemanager.googleapis.com/v1/projects/{GCP_PROJECT_ID}:getIamPolicy"
        )
        
        return {
            "success": True,
            "data": {
                "projectId": GCP_PROJECT_ID,
                "iamPolicy": policy,
                "collectedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z"
            },
            "error": None
        }
    except Exception as e:
        return {"success": False, "error": str(e), "data": None}

if __name__ == "__main__":
    print(json.dumps(main()))
```

## Required Secrets

| Secret Name | Description |
|-------------|-------------|
| `GCP_SERVICE_ACCOUNT_KEY` | Full JSON key for a service account with `roles/viewer` |
| `GCP_PROJECT_ID` | Target GCP project ID (non-secret, use `promptForInfo`) |
| `GCP_ORG_ID` | Organization ID — needed for SCC findings (non-secret) |

## System Prompt Additions (chat/route.ts)

When the GCP integration is connected, add to `buildSystemPrompt()`:

```
AVAILABLE CREDENTIALS (pre-injected as env vars):
- GCP_SERVICE_ACCOUNT_KEY: Service account JSON key for project {projectId}
- GCP_PROJECT_ID: {projectId}

Use google-auth library (from google-auth package) for authentication.
Always use read-only scope: https://www.googleapis.com/auth/cloud-platform.read-only
```
