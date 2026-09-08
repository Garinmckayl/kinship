# ElderLove on AgentCore

Standalone Strands guardian service for **Bedrock AgentCore Runtime** (TypeScript),
per the [official TS deploy guide](https://strandsagents.com/docs/user-guide/deploy/deploy_to_bedrock_agentcore/typescript/).
Mirrors `frontend/lib/guardian.ts` tools against the same Postgres.

## Run locally (proves the contract — no emulation needed)

```bash
cd agentcore && npm install
DATABASE_URL=... PORT=8080 node dist/index.js  # after `npx tsc`
curl localhost:8080/ping
echo -n '{"user_id":"eleanor-79","message":"Did Eleanor take her meds?"}' \
  | curl -X POST localhost:8080/invocations -H "Content-Type: application/octet-stream" --data-binary @-
```

## Deploy (needs docker buildx for linux/arm64 + AWS perms; runtime costs money)

```bash
chmod +x agentcore/deploy.sh
./agentcore/create-iam-role.sh   # from the Strands docs (script in guide)
./agentcore/deploy.sh            # ECR push + create-agent-runtime (us-west-2)
```

`deploy.sh` uses a multi-stage Dockerfile: deps compile on the build host arch,
runtime stage is arm64 with **no RUN steps** (pure COPY), so no QEMU needed.
