# ElderLove Nova Act Sidecar

Browser automation service for elders, powered by [Amazon Nova Act](https://aws.amazon.com/nova/act/).

Kinship uses Nova Act to do real-world browser tasks that elderly people struggle with:
- Pharmacy prescription refills (CVS, Walgreens portals)
- Utility bill checks and payments
- Doctor appointment booking on patient portals
- Grocery ordering

Every action requires caregiver approval before execution (human-in-the-loop).

## Run locally

```bash
cd nova-act
pip install -r requirements.txt
export NOVA_ACT_API_KEY="your-key-from-nova.amazon.com/act"
python server.py
# -> http://localhost:8100/health
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NOVA_ACT_API_KEY` | Yes | API key from nova.amazon.com/act |
| `NOVA_SIDECAR_SECRET` | No | Shared secret with Next.js app (default: `elderlove-nova-dev`) |
| `PORT` | No | Server port (default: `8100`) |

## API

- `GET /health` - Health check + Nova Act availability
- `POST /tasks` - Create a browser task (pending approval by default)
- `GET /tasks` - List all tasks
- `GET /tasks/:id` - Get task status + steps
- `POST /tasks/:id/approve` - Caregiver approves -> execution starts
- `POST /tasks/:id/cancel` - Cancel a pending task

## How it works

1. Eleanor says "I need to refill my prescription"
2. Strands agent calls `request_browser_task(pharmacy_refill, {medication: "Lisinopril"})`
3. Sidecar creates a `pending_approval` task
4. Sarah sees it in the Family dashboard: "Browser task: pharmacy refill - Lisinopril"
5. Sarah clicks "Approve & Execute"
6. Nova Act opens a real browser, navigates CVS.com, submits the refill
7. Confirmation number appears in the dashboard

Without `NOVA_ACT_API_KEY`, the sidecar runs in demo mode with simulated steps.
