# Infrastructure and monthly cost estimate

Planning estimate · 2 November 2026 · USD, excluding tax

## Deployment approach and assumptions

Deploy the existing Docker image to **Azure App Service for Linux**. Each environment runs one Node process serving the Vue frontend, HTTP API, and native WebSocket endpoint. Use MongoDB Atlas for persistent data. Azure Functions and Web PubSub are not needed for this deployment.

- Separate staging and production apps, App Service plans, Atlas clusters, credentials, and hostnames. Staging is a standalone environment, not an App Service deployment slot.
- Target West Europe, subject to App Service and Atlas tier availability. Keep the application and database in the same region where supported. [Atlas region availability](https://www.mongodb.com/docs/atlas/reference/microsoft-azure/).
- Assume 730 app-hosting hours per month, light staging traffic, and up to approximately 50 concurrent production connections. This is a sizing assumption to validate with load tests, not a capacity guarantee.
- Staging fits within Atlas Free's 512 MB; production data and indexes fit within Flex's 5 GB. Budget for under 10 GB/month of application outbound traffic and modest log ingestion. [Atlas tiers](https://www.mongodb.com/pricing).
- Azure compute/registry figures below are rounded budget allowances, not verified West Europe quotations. Recheck regional prices in the [Azure calculator](https://azure.microsoft.com/en-us/pricing/calculator/) before provisioning. Usage allowances are estimates, not billing caps. No promotional credits or reservations are assumed.

## Component → service → reason → estimated cost

| Environment | Component | Service chosen | Why | Estimated monthly cost |
| --- | --- | --- | --- | ---: |
| Staging | Frontend, API, WebSocket server | [App Service Linux B1](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/), one instance | Runs the existing container continuously; inexpensive dedicated test environment. | ~$15 |
| Staging | Database | [MongoDB Atlas Free](https://www.mongodb.com/pricing), separate cluster | Persistent test data and MongoDB geospatial indexes without a database hosting charge. | $0 |
| Staging | Monitoring/logs | [Azure Monitor](https://azure.microsoft.com/en-us/pricing/details/monitor/) and App Service logs | Basic diagnostics with limited retention and volume. | $0–2 allowance |
| Staging | Application outbound traffic | Azure bandwidth | Small test workload; budget for traffic beyond any included allowance. | $0–2 allowance |
| **Staging subtotal** | | | Excludes shared services below. | **~$15–19** |
| Production | Frontend, API, WebSocket server | [App Service Linux B2](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/), one instance | More CPU/RAM than staging while retaining a simple deployment. | ~$30 |
| Production | Database and daily backups | [MongoDB Atlas Flex](https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/), separate cluster | Managed MongoDB for a small, low-traffic release; usage-based pricing with 5 GB storage. | ~$8–30 |
| Production | Monitoring/logs | [Azure Monitor](https://azure.microsoft.com/en-us/pricing/details/monitor/) and App Service logs | Runtime diagnostics, health metrics, and alerts; limit ingestion and retention. | $0–5 allowance |
| Production | Application outbound traffic | Azure bandwidth | Small text messages and frontend assets; no attachments or video. | $0–5 allowance |
| **Production subtotal** | | | Excludes shared services below. | **~$38–70** |
| Shared | Docker images | [Azure Container Registry Basic](https://azure.microsoft.com/en-us/pricing/details/container-registry/) | One registry for both environments, retaining a small number of versioned images. | ~$5 |
| Both | HTTPS and hostname | Default App Service HTTPS hostnames | Avoid custom domain costs initially. | Included |
| Both | Build and release | Local Docker builds and manual image promotion | Uses existing development tooling; hosted CI minutes are not included in this estimate. | $0 additional cloud build cost |
| Both | Map tiles | Current OpenStreetMap tile service | Suitable only while usage complies with its policy; no availability guarantee. | $0 |
| **Combined total** | | | Staging + production + registry, counted once. | **~$58–94/month** |

The networking rows cover Azure application traffic; map tiles are fetched directly by the browser. OpenStreetMap requires attribution and compliant tile access and may restrict heavy usage. A paid tile provider, custom domain, paid support, search services, private networking, and cross-region disaster recovery are outside this budget. [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Deployment and operating notes

1. Build the existing Dockerfile, push a versioned image to ACR, test it in staging, then deploy the same image to production. Use App Service managed identity for registry pulls. Configure the container's HTTP port as 3000. [Custom container configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-custom-container?pivots=container-linux).
2. Enable **Always On** in each app; Basic and higher tiers support it. Use HTTPS/WSS, set `COOKIE_SECURE=true`, and provide each app's `MONGODB_URI` and exact `ALLOWED_ORIGINS` through App Service settings. Restrict Atlas access to the app's outbound IPs and use separate database users. Verify proxy-aware HTTP/WebSocket IP limits before deployment. [Always On](https://azure-samples.github.io/app-service-labs/docs/learning-paths/enterprise-web-app/add-health-checks/), [app settings](https://learn.microsoft.com/en-us/azure/app-service/configure-common).
3. Keep MongoDB outside the app container; the local Compose database is for development. Flex automatically takes daily snapshots and retains eight; test restoration. Staging data is disposable. [Flex backups](https://www.mongodb.com/docs/atlas/backup/cloud-backup/flex-cluster-backup/).
4. Keep one app instance per environment. Current WebSocket connection/subscription state is in memory; adding additional running copies of the backend requires shared event distribution such as Redis or Web PubSub. A single instance has restart/deployment interruptions and no regional failover. Always On does not provide redundancy. Basic has no deployment slots; those require Standard or higher. [Deployment tiers](https://learn.microsoft.com/en-us/azure/app-service/deploy-best-practices).
5. Monitor CPU, memory, database operations/storage, and billing. Flex has shared resources and lacks private endpoints and point-in-time recovery; move to a dedicated Atlas tier when those requirements arise and re-estimate costs. [Flex limitations](https://www.mongodb.com/docs/atlas/reference/flex-limitations/).

This document proposes hosting and costs only; Azure resources and deployment automation have not been provisioned by this change.
