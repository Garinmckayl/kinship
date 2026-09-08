"""
ElderLove Nova Act Sidecar — browser automation for elders.

A lightweight FastAPI service wrapping Amazon Nova Act to perform
real-world browser tasks that elderly people struggle with:
pharmacy refills, utility bill payments, appointment booking.

Every action requires caregiver pre-approval (human-in-the-loop).
The service never acts without explicit authorization.
"""

import os
import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from enum import Enum

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("nova-act-sidecar")

app = FastAPI(title="ElderLove Nova Act Sidecar", version="1.0.0")

# --------------- auth ---------------

SIDECAR_SECRET = os.environ.get("NOVA_SIDECAR_SECRET", "elderlove-nova-dev")

def verify_secret(authorization: Optional[str] = Header(None)):
    if not authorization or authorization != f"Bearer {SIDECAR_SECRET}":
        raise HTTPException(status_code=401, detail="invalid sidecar secret")


# --------------- types ---------------

class TaskType(str, Enum):
    pharmacy_refill = "pharmacy_refill"
    bill_payment = "bill_payment"
    appointment_booking = "appointment_booking"
    grocery_order = "grocery_order"
    custom = "custom"

class TaskStatus(str, Enum):
    pending_approval = "pending_approval"
    approved = "approved"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"

class TaskRequest(BaseModel):
    task_type: TaskType
    elder_id: str = "eleanor-79"
    params: dict = {}
    approved: bool = False  # Must be True (caregiver approved) to execute

class TaskResult(BaseModel):
    task_id: str
    task_type: TaskType
    status: TaskStatus
    params: dict = {}
    steps: list[dict] = []
    result: Optional[dict] = None
    error: Optional[str] = None
    screenshot_url: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    recording_url: Optional[str] = None


# --------------- in-memory task store ---------------

TASKS: dict[str, TaskResult] = {}
_counter = 0

def next_id() -> str:
    global _counter
    _counter += 1
    return f"nova-{_counter}-{int(datetime.now(timezone.utc).timestamp())}"


# --------------- workflow definitions ---------------

WORKFLOW_CONFIGS = {
    TaskType.pharmacy_refill: {
        "name": "Pharmacy Prescription Refill",
        "description": "Navigate to a pharmacy portal and submit a prescription refill request.",
        "starting_page": "https://www.cvs.com/",
        "steps": [
            {"prompt": "Click on 'Sign In' or 'Log In' to access the pharmacy account.", "label": "Navigate to login"},
            {"prompt": "Enter the username '{username}' and password '{password}' and sign in.", "label": "Sign in", "sensitive": True},
            {"prompt": "Navigate to the prescriptions or pharmacy section. Look for 'My Prescriptions', 'Refills', or similar.", "label": "Go to prescriptions"},
            {"prompt": "Find the prescription for '{medication}' and click 'Refill' or 'Request Refill'.", "label": "Request refill"},
            {"prompt": "Confirm the refill request. Select pickup at '{pharmacy_location}' if asked.", "label": "Confirm refill"},
            {"prompt": "Return the confirmation number, estimated pickup time, and pharmacy location.", "label": "Get confirmation", "extract": True},
        ],
    },
    TaskType.bill_payment: {
        "name": "Utility Bill Payment",
        "description": "Navigate to a utility provider portal and check/pay an outstanding bill.",
        "starting_page": "https://www.example-utility.com/",
        "steps": [
            {"prompt": "Click on 'Sign In' or 'My Account' to access the billing portal.", "label": "Navigate to login"},
            {"prompt": "Enter the username '{username}' and password '{password}' and sign in.", "label": "Sign in", "sensitive": True},
            {"prompt": "Navigate to 'Billing', 'Pay Bill', or 'Account Balance'.", "label": "Go to billing"},
            {"prompt": "Return the current balance, due date, and account number.", "label": "Check balance", "extract": True},
            {"prompt": "If the balance is greater than $0 and a 'Pay Now' or 'Make Payment' button exists, click it and proceed to payment using the card on file. Do NOT enter new payment information.", "label": "Pay bill"},
            {"prompt": "Return the payment confirmation number and amount paid.", "label": "Get confirmation", "extract": True},
        ],
    },
    TaskType.appointment_booking: {
        "name": "Doctor Appointment Booking",
        "description": "Navigate to a patient portal and book a doctor appointment.",
        "starting_page": "https://mychart.example.com/",
        "steps": [
            {"prompt": "Click on 'Sign In' or 'Log In' to access the patient portal.", "label": "Navigate to login"},
            {"prompt": "Enter the username '{username}' and password '{password}' and sign in.", "label": "Sign in", "sensitive": True},
            {"prompt": "Navigate to 'Schedule Appointment', 'Appointments', or 'Visit Schedule'.", "label": "Go to appointments"},
            {"prompt": "Search for an appointment with '{doctor}' for '{reason}' on or after '{preferred_date}'.", "label": "Search available slots"},
            {"prompt": "Select the earliest available slot and confirm the booking.", "label": "Book appointment"},
            {"prompt": "Return the appointment date, time, doctor name, location, and any confirmation number.", "label": "Get confirmation", "extract": True},
        ],
    },
    TaskType.grocery_order: {
        "name": "Grocery Order",
        "description": "Order groceries from an online store for delivery.",
        "starting_page": "https://www.instacart.com/",
        "steps": [
            {"prompt": "Sign in using '{username}' and '{password}'.", "label": "Sign in", "sensitive": True},
            {"prompt": "Search for and add the following items to the cart: {items}", "label": "Add items to cart"},
            {"prompt": "Go to the cart and proceed to checkout. Select delivery to '{address}'.", "label": "Checkout"},
            {"prompt": "Return the order total, delivery time estimate, and order confirmation.", "label": "Get confirmation", "extract": True},
        ],
    },
}


# --------------- Nova Act execution engine ---------------

async def execute_nova_workflow(task: TaskResult, config: dict, params: dict) -> TaskResult:
    """Execute a Nova Act workflow with step-by-step browser automation."""
    try:
        from nova_act import NovaAct
    except ImportError:
        # Nova Act not installed — run in demo mode with simulated steps
        log.warning("nova-act package not installed, running in demo mode")
        return await execute_demo_workflow(task, config, params)

    task.status = TaskStatus.running
    task.started_at = datetime.now(timezone.utc).isoformat()

    try:
        starting_page = params.get("portal_url", config["starting_page"])

        # Use headless mode for server environments
        nova_kwargs = {
            "starting_page": starting_page,
            "headless": True,
        }

        # Add API key if available
        if os.environ.get("NOVA_ACT_API_KEY"):
            pass  # SDK reads from env automatically

        with NovaAct(**nova_kwargs) as nova:
            for i, step_config in enumerate(config["steps"]):
                step_label = step_config["label"]
                prompt = step_config["prompt"].format(**params)

                log.info(f"Step {i+1}/{len(config['steps'])}: {step_label}")

                step_record = {
                    "index": i + 1,
                    "label": step_label,
                    "status": "running",
                    "started_at": datetime.now(timezone.utc).isoformat(),
                }

                try:
                    if step_config.get("extract"):
                        result = nova.act_get(prompt)
                        step_record["status"] = "completed"
                        step_record["response"] = result.response if hasattr(result, 'response') else str(result)
                        if task.result is None:
                            task.result = {}
                        task.result[step_label] = step_record["response"]
                    else:
                        nova.act(prompt)
                        step_record["status"] = "completed"
                except Exception as step_err:
                    step_record["status"] = "failed"
                    step_record["error"] = str(step_err)[:500]
                    log.error(f"Step {step_label} failed: {step_err}")
                    # Don't fail the whole workflow on one step — continue if possible
                    if "sign in" in step_label.lower():
                        raise  # Auth failures are fatal

                step_record["completed_at"] = datetime.now(timezone.utc).isoformat()
                task.steps.append(step_record)

        task.status = TaskStatus.completed
        task.completed_at = datetime.now(timezone.utc).isoformat()

    except Exception as e:
        task.status = TaskStatus.failed
        task.error = str(e)[:1000]
        task.completed_at = datetime.now(timezone.utc).isoformat()
        log.error(f"Workflow failed: {e}")

    return task


async def execute_demo_workflow(task: TaskResult, config: dict, params: dict) -> TaskResult:
    """Demo mode: simulate Nova Act steps when the SDK is not installed."""
    task.status = TaskStatus.running
    task.started_at = datetime.now(timezone.utc).isoformat()

    for i, step_config in enumerate(config["steps"]):
        step_label = step_config["label"]
        await asyncio.sleep(0.5)  # Simulate work

        step_record = {
            "index": i + 1,
            "label": step_label,
            "status": "completed",
            "mode": "demo",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

        if step_config.get("extract"):
            if task.task_type == TaskType.pharmacy_refill:
                step_record["response"] = json.dumps({
                    "confirmation": f"CVS-{int(datetime.now(timezone.utc).timestamp()) % 10000}",
                    "pickup_time": "Tomorrow at 2:00 PM",
                    "pharmacy": params.get("pharmacy_location", "CVS Pharmacy, 4th Ave"),
                    "medication": params.get("medication", "Lisinopril 10mg"),
                })
            elif task.task_type == TaskType.bill_payment:
                step_record["response"] = json.dumps({
                    "balance": "$127.43",
                    "due_date": "September 15, 2026",
                    "payment_confirmation": f"PAY-{int(datetime.now(timezone.utc).timestamp()) % 10000}",
                })
            elif task.task_type == TaskType.appointment_booking:
                step_record["response"] = json.dumps({
                    "date": params.get("preferred_date", "September 16, 2026"),
                    "time": "10:30 AM",
                    "doctor": params.get("doctor", "Dr. Harrison"),
                    "location": "Riverside Clinic",
                    "confirmation": f"APPT-{int(datetime.now(timezone.utc).timestamp()) % 10000}",
                })
            else:
                step_record["response"] = json.dumps({"status": "completed"})

            if task.result is None:
                task.result = {}
            task.result[step_label] = step_record["response"]

        task.steps.append(step_record)

    task.status = TaskStatus.completed
    task.completed_at = datetime.now(timezone.utc).isoformat()
    return task


# --------------- API endpoints ---------------

@app.get("/health")
async def health():
    nova_available = False
    try:
        import nova_act
        nova_available = True
    except ImportError:
        pass
    return {"status": "ok", "nova_act_available": nova_available, "tasks": len(TASKS)}


@app.post("/tasks", response_model=TaskResult)
async def create_task(req: TaskRequest, authorization: Optional[str] = Header(None)):
    verify_secret(authorization)

    task_id = next_id()
    config = WORKFLOW_CONFIGS.get(req.task_type)

    if not config and req.task_type != TaskType.custom:
        raise HTTPException(status_code=400, detail=f"Unknown task type: {req.task_type}")

    task = TaskResult(
        task_id=task_id,
        task_type=req.task_type,
        status=TaskStatus.pending_approval if not req.approved else TaskStatus.approved,
        params=req.params,
    )
    TASKS[task_id] = task

    # If pre-approved (caregiver already approved via dashboard), execute immediately
    if req.approved and config:
        asyncio.create_task(execute_nova_workflow(task, config, req.params))

    return task


@app.post("/tasks/{task_id}/approve", response_model=TaskResult)
async def approve_task(task_id: str, authorization: Optional[str] = Header(None)):
    verify_secret(authorization)

    task = TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    if task.status != TaskStatus.pending_approval:
        raise HTTPException(status_code=400, detail=f"task is {task.status}, not pending_approval")

    task.status = TaskStatus.approved
    config = WORKFLOW_CONFIGS.get(task.task_type)
    if config:
        asyncio.create_task(execute_nova_workflow(task, config, task.params))

    return task


@app.post("/tasks/{task_id}/cancel", response_model=TaskResult)
async def cancel_task(task_id: str, authorization: Optional[str] = Header(None)):
    verify_secret(authorization)

    task = TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    if task.status in (TaskStatus.completed, TaskStatus.failed):
        raise HTTPException(status_code=400, detail=f"task already {task.status}")

    task.status = TaskStatus.cancelled
    return task


@app.get("/tasks/{task_id}", response_model=TaskResult)
async def get_task(task_id: str, authorization: Optional[str] = Header(None)):
    verify_secret(authorization)

    task = TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@app.get("/tasks", response_model=list[TaskResult])
async def list_tasks(authorization: Optional[str] = Header(None)):
    verify_secret(authorization)
    return sorted(TASKS.values(), key=lambda t: t.task_id, reverse=True)[:20]


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8100"))
    uvicorn.run(app, host="0.0.0.0", port=port)
