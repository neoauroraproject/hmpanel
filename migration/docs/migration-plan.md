# Whale Panel Migration Plan

## 1. Panels Mapping
`panels` (Legacy) &rarr; `Panel` (New)

| Legacy Column | New Column | Transformation / Notes |
|---|---|---|
| `name` | `name` | Direct copy. Must be unique. |
| `url` | `url` | Direct copy. Used to infer `webBasePath` and `apiBaseUrl`. |
| `username` | `username` | Direct copy. Fallback credentials. |
| `password` | `password` | Direct copy. Fallback credentials. |
| `token` | `apiToken` | Direct copy. Preferred authentication method. |
| `is_active` | `status` | `true` &rarr; `"online"`, `false` &rarr; `"offline"` |
| `panel_type` | `panelType` | Direct copy. (Default to "3x-ui") |
| `sub_url` | `webBasePath` | Derived or directly mapped. |

*Note: In the new system, Panels belong to a `Server`. If no `Server` exists, the migration engine will attach to the first available `Server` or create a default one.*

## 2. Admins Mapping
`admins` (Legacy) &rarr; `Admin` (New)

| Legacy Column | New Column | Transformation / Notes |
|---|---|---|
| `username` | `username` | Direct copy. Must be unique. |
| `hashed_password` | (Ignored) | Passwords are not overwritten. Legacy hashes will be discarded in favor of temporary passwords or existing hashes if already present in DB. (Requires `temporaryPasswordRequired=true` flag on frontend). |
| `is_active` | `status` | `true` &rarr; `"active"`, `false` &rarr; `"suspended"` |
| `panel` | `AdminInbound` | The legacy `panel` name is used to resolve the new `Panel` ID, and the Admin is granted permissions to the Inbounds belonging to that panel. |
| `inbound_id` | `AdminInbound` | Specific inbound permissions are granted using the new `AdminInbound` bridge table. |
| `traffic` | `maxClients` | No direct map to traffic here since traffic is handled in `TrafficPool`. However, if "traffic" in Whale meant GB limit, we might create a `TrafficPool` for the Admin with `totalLimit` = `traffic * 1GB`. |
| `expiry_date` | `expiryTime` | Convert DATETIME string to Unix timestamp in milliseconds (`BigInt`). |
| `marzban_inbounds` | (Ignored) | Not applicable to 3x-ui. |
| `marzban_password` | (Ignored) | Not applicable to 3x-ui. |

## 3. Client Ownership Mapping
`sanaei_users` (Legacy) &rarr; `Client` (New)

| Legacy Column | New Column | Transformation / Notes |
|---|---|---|
| `username` | `email` | The `username` string maps directly to the 3x-ui `email` identity key of the Client. |
| `owner` | `adminId` | The `owner` string is used to look up the `Admin.id` using `Admin.username`. We then assign `Client.adminId` to the resolved `Admin.id`. |

*Note: The new system relies entirely on the 3x-ui API for Client definitions and usage statistics. Therefore, during the Post-Import Sync phase, we fetch all Clients directly from the Panels, and then apply the `adminId` (ownership mapping) derived from `sanaei_users`.*

## 4. Post-Import Synchronization
Legacy client usage stats and config structures are discarded in favor of the single source of truth: **The live 3x-ui Panels**.
Once Panels, Admins, and Ownership maps are created, a full synchronization is triggered:
1. Connects to all imported Panels via `apiToken` / `credentials`.
2. Fetches fresh `Inbounds` and `clientStats`.
3. Rebuilds the `Client` table with precise usage (`up`, `down`, `total`, `enable`).
4. Reapplies the legacy ownership mappings so Resellers retain control over their specific clients.
