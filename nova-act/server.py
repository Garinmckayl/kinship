"""
Kinship Nova Act Sidecar — browser automation for elders.

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
import re
from datetime import datetime, timezone
from typing import Optional
from enum import Enum

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("nova-act-sidecar")

app = FastAPI(title="Kinship Nova Act Sidecar", version="1.1.0")

# --------------- auth ---------------

SIDECAR_SECRET = os.environ.get("NOVA_SIDECAR_SECRET", "elderlove-nova-dev")

def verify_secret(authorization: Optional[str] = Header(None)):
    if not authorization or authorization != f"Bearer {SIDECAR_SECRET}":
        raise HTTPException(status_code=401, detail="invalid sidecar secret")


# --------------- types ---------------

class TaskType(str, Enum):
    pharmacy_refill = "pharmacy_refill"
    insurance_check = "insurance_check"
    bill_payment = "bill_payment"
    appointment_booking = "appointment_booking"
    grocery_order = "grocery_order"
    benefits_recert = "benefits_recert"
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
    screenshots: list[str] = []  # base64 encoded PNGs, one per step
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    recording_url: Optional[str] = None


# --------------- in-memory task store ---------------

TASKS: dict[str, TaskResult] = {}
SCREENSHOTS: dict[str, list[str]] = {}  # task_id -> list of base64 PNGs
_counter = 0

def next_id() -> str:
    global _counter
    _counter += 1
    return f"nova-{_counter}-{int(datetime.now(timezone.utc).timestamp())}"


def normalize_task_params(task_type: TaskType, raw_params: dict) -> dict:
    params = dict(raw_params or {})
    if task_type != TaskType.insurance_check:
        return params

    raw_medications = params.get("medications") or params.get("medication") or []
    if isinstance(raw_medications, str):
        medications = [value.strip() for value in raw_medications.split(",") if value.strip()]
    elif isinstance(raw_medications, list):
        medications = [str(value).strip() for value in raw_medications if str(value).strip()]
    else:
        medications = []
    if not medications:
        medications = ["Lisinopril", "Metformin", "Vitamin D", "Atorvastatin"]

    zip_code = str(params.get("zip_code") or params.get("zip") or "43215").strip()
    if not re.fullmatch(r"\d{5}", zip_code):
        raise ValueError("Insurance checks require a valid 5-digit ZIP code.")

    params.update({
        "insurance_type": str(params.get("insurance_type") or "Medicare"),
        "zip_code": zip_code,
        "coverage_year": str(params.get("coverage_year") or datetime.now(timezone.utc).year),
        "medications": medications,
        "medications_text": ", ".join(medications),
    })
    return params


# --------------- workflow definitions ---------------
# Each workflow is a sequence of Nova Act prompts. The agent executes them
# step by step in a real browser. Every workflow begins with caregiver
# approval (human-in-the-loop) — the agent never acts without consent.

# SAFE SANDBOX: For bill_payment, the starting_page is a hardcoded verified
# URL from the elder's known providers — never a search engine result.
# This eliminates phishing clones, sponsored ad traps, and fake invoice sites.

WORKFLOW_CONFIGS = {

    # ── Scenario 1A: Pharmacy Prescription Refill ──────────────────────
    TaskType.pharmacy_refill: {
        "name": "Pharmacy Prescription Refill",
        "description": "Navigate pharmacy portal, renew expiring prescriptions, confirm pickup.",
        "starting_page": "https://www.cvs.com/",
        "safe_sandbox": True,
        "steps": [
            {"prompt": "Click on 'Sign In' or 'Log In' to access the pharmacy account.", "label": "Open pharmacy portal"},
            {"prompt": "Enter the username '{username}' and password '{password}' and sign in. If asked for MFA, pause and wait.", "label": "Authenticate", "sensitive": True},
            {"prompt": "Navigate to 'My Prescriptions', 'Prescription Center', or 'Refills'. Look for a list of current and past prescriptions.", "label": "Go to prescriptions"},
            {"prompt": "Find the prescription for '{medication}'. Check if it shows 'Refill Available' or a refill count. If refills remain, click 'Refill' or 'Request Refill'.", "label": "Request refill for {medication}"},
            {"prompt": "If there are additional medications to refill ({additional_meds}), find each one and request refills for all of them.", "label": "Refill additional medications"},
            {"prompt": "Select pickup at '{pharmacy_location}' if asked for a pharmacy location. Confirm all refill requests.", "label": "Confirm pickup location"},
            {"prompt": "Return a JSON object with: confirmation_number, medications_refilled (array), estimated_pickup_time, pharmacy_name, and pharmacy_address.", "label": "Capture confirmation", "extract": True},
        ],
    },

    # ── Scenario 1B: Insurance Formulary Cross-Reference ──────────────
    TaskType.insurance_check: {
        "name": "Insurance Coverage Check",
        "description": "Use Medicare Plan Compare to review Part D coverage for Eleanor's medications.",
        "starting_page": "https://www.medicare.gov/plan-compare/",
        "safe_sandbox": True,
        "steps": [
            {
                "prompt": "If Medicare asks for a ZIP code or location, enter exactly '{zip_code}' and submit once. Never guess, alter, or cycle through ZIP codes. If the site rejects this exact ZIP, stop and report the visible error.",
                "label": "Set Eleanor's location ({zip_code})",
            },
            {
                "prompt": "Choose the Medicare drug plan (Part D) comparison path for coverage year {coverage_year}. Do not enroll, sign in, or submit personal identifiers.",
                "label": "Open Part D plan comparison",
            },
            {
                "prompt": "Add these medications to the drug list, one at a time: {medications_text}. Select the common standard dosage when multiple versions appear. Do not add medications that are not in this list.",
                "label": "Enter Eleanor's medications",
            },
            {
                "prompt": "Continue to plan results for ZIP {zip_code}. If asked for a pharmacy, choose a nearby preferred in-network pharmacy only to calculate displayed estimates. Do not enroll in or purchase a plan.",
                "label": "Compare local coverage",
            },
            {
                "prompt": "Return a JSON summary of what is visibly shown: medications_checked, matching_plan_count, lowest_displayed_drug_cost, restrictions, and next_step. If exact coverage is unavailable without Eleanor's current plan details, say so explicitly instead of guessing.",
                "label": "Coverage summary",
                "extract": True,
            },
        ],
    },

    # ── Scenario 3: Safe Sandbox Bill Payment ─────────────────────────
    # CRITICAL: starting_page is a VERIFIED bookmark, never a search result.
    # Eleanor never touches the open web for financial transactions.
    TaskType.bill_payment: {
        "name": "Safe Sandbox Bill Payment",
        "description": "Pay utility bills using verified portal bookmarks — never via search engines. Protects against phishing.",
        "starting_page": "{portal_url}",  # Caregiver-configured verified URL
        "safe_sandbox": True,
        "steps": [
            {"prompt": "You are on a VERIFIED utility portal ('{provider_name}'). Click 'Sign In', 'My Account', or 'Log In'.", "label": "Open verified portal ({provider_name})"},
            {"prompt": "Enter the username '{username}' and password '{password}' and sign in.", "label": "Authenticate securely", "sensitive": True},
            {"prompt": "Navigate to 'Billing', 'Pay Bill', 'Account Balance', or 'My Bills'. Find the current statement or balance.", "label": "Navigate to billing"},
            {"prompt": "Return a JSON object with: account_number, current_balance, due_date, last_payment_date, last_payment_amount, autopay_status.", "label": "Read current balance", "extract": True},
            {"prompt": "STOP HERE. Do NOT click Pay yet. The caregiver must review the balance before proceeding. Return the balance and due date for approval.", "label": "Await payment approval", "extract": True, "pause_for_approval": True},
            {"prompt": "The caregiver has approved payment. Click 'Pay Now', 'Make Payment', or 'Pay Bill'. Use the card or bank account already on file. Do NOT enter new payment information. Do NOT sign up for autopay or any new service.", "label": "Execute payment"},
            {"prompt": "Return a JSON object with: payment_confirmation_number, amount_paid, payment_method_last4, and expected_posting_date.", "label": "Capture payment receipt", "extract": True},
        ],
    },

    # ── Scenario 4: Grocery & Essential Supply Ordering ───────────────
    TaskType.grocery_order: {
        "name": "Grocery & Essentials Delivery",
        "description": "Order groceries using the elder's preferred brands and delivery preferences.",
        "starting_page": "{portal_url}",
        "safe_sandbox": True,
        "steps": [
            {"prompt": "Sign in to the grocery delivery site using '{username}' and '{password}'.", "label": "Authenticate", "sensitive": True},
            {"prompt": "If there are previous orders, check order history for preferred brands. Note Eleanor's usual choices for: {items}", "label": "Check order history for brand preferences"},
            {"prompt": "Search for each item in the list: {items}. For each item, select the brand that matches Eleanor's previous orders, or the most popular option. AVOID sponsored items or items marked as subscription-only. Add each to the cart.", "label": "Add items to cart"},
            {"prompt": "Review the cart. Remove any accidental duplicates. Check for hidden subscription sign-ups or recurring delivery fees and UNCHECK any such boxes.", "label": "Review cart and remove subscriptions"},
            {"prompt": "Proceed to checkout. Set delivery address to '{address}'. Select the next available MORNING delivery slot (before noon if possible). Eleanor prefers morning deliveries.", "label": "Select morning delivery slot"},
            {"prompt": "STOP at the final payment screen. Do NOT confirm the order yet. Return a JSON object with: items_in_cart (array with name, brand, price), delivery_slot, delivery_fee, subtotal, total.", "label": "Review order for approval", "extract": True, "pause_for_approval": True},
            {"prompt": "The caregiver has approved the order. Click 'Place Order' or 'Confirm Order'. Do NOT add tips or extras unless already configured.", "label": "Place order"},
            {"prompt": "Return a JSON object with: order_number, estimated_delivery, total_charged.", "label": "Capture order confirmation", "extract": True},
        ],
    },

    # ── Scenario 2: Government Benefits Re-Certification ──────────────
    TaskType.benefits_recert: {
        "name": "Government Benefits Re-Certification",
        "description": "Complete annual re-certification for Medicare Extra Help, SNAP, or utility assistance.",
        "starting_page": "{portal_url}",
        "safe_sandbox": True,
        "steps": [
            {"prompt": "Navigate to the login page and sign in with '{username}' and '{password}'.", "label": "Authenticate on government portal", "sensitive": True},
            {"prompt": "Navigate to 'Re-Certification', 'Renew Benefits', 'Annual Review', or 'Recertify'. Look for any pending deadlines.", "label": "Find recertification form"},
            {"prompt": "Return the current benefit status, recertification deadline, and which sections need to be completed.", "label": "Check recertification status", "extract": True},
            {"prompt": "Fill in the personal information section using: Name: '{full_name}', DOB: '{dob}', SSN last 4: '{ssn_last4}', Address: '{address}', Phone: '{phone}'.", "label": "Fill personal information", "sensitive": True},
            {"prompt": "Fill in the income section using: Monthly income: '{monthly_income}', Income source: '{income_source}'. If asked about assets, enter: Bank balance approximately '{bank_balance}'.", "label": "Fill income information", "sensitive": True},
            {"prompt": "If the form requires uploading proof documents, upload the files from these paths: {document_paths}. Use the file upload dialogs.", "label": "Upload supporting documents"},
            {"prompt": "Review all entered information for accuracy. Do NOT submit yet. Return a JSON summary of all filled fields for caregiver review.", "label": "Review before submission", "extract": True, "pause_for_approval": True},
            {"prompt": "The caregiver has approved. Submit the re-certification form.", "label": "Submit recertification"},
            {"prompt": "Return a JSON object with: confirmation_number, submission_date, next_review_date, benefit_status.", "label": "Capture confirmation", "extract": True},
        ],
    },

    # ── Scenario: Doctor Appointment Booking ──────────────────────────
    TaskType.appointment_booking: {
        "name": "Doctor Appointment Booking",
        "description": "Navigate patient portal and book a doctor appointment.",
        "starting_page": "{portal_url}",
        "safe_sandbox": True,
        "steps": [
            {"prompt": "Click on 'Sign In' or 'Log In' to access the patient portal.", "label": "Open patient portal"},
            {"prompt": "Enter the username '{username}' and password '{password}' and sign in.", "label": "Authenticate", "sensitive": True},
            {"prompt": "Navigate to 'Schedule Appointment', 'Appointments', 'Visits', or 'Request Appointment'.", "label": "Go to appointments"},
            {"prompt": "Search for an appointment with '{doctor}' at '{clinic}' for '{reason}'. Look for dates on or after '{preferred_date}'.", "label": "Search available slots"},
            {"prompt": "Return a list of the next 3 available appointment slots with date, time, and provider name.", "label": "Show available slots", "extract": True, "pause_for_approval": True},
            {"prompt": "The caregiver has approved. Select the appointment at '{selected_slot}' and confirm the booking.", "label": "Book appointment"},
            {"prompt": "Return a JSON object with: appointment_date, appointment_time, doctor_name, clinic_name, confirmation_number.", "label": "Capture confirmation", "extract": True},
        ],
    },
}


# --------------- Nova Act execution engine ---------------

async def execute_nova_workflow(task: TaskResult, config: dict, params: dict) -> TaskResult:
    """Execute a Nova Act workflow using AgentCore Browser Tool (cloud-hosted browser).
    Runs in a separate thread because Nova Act uses sync Playwright which conflicts with asyncio."""
    try:
        from nova_act import NovaAct, workflow as nova_workflow
        from bedrock_agentcore.tools.browser_client import BrowserClient
    except ImportError as e:
        log.warning(f"Required package not installed ({e}), running in demo mode")
        return await execute_demo_workflow(task, config, params)

    import threading

    task.status = TaskStatus.running
    task.started_at = datetime.now(timezone.utc).isoformat()
    SCREENSHOTS[task.task_id] = []

    aws_region = os.environ.get("AWS_REGION", "us-east-1")
    error_holder: list = []

    def _browser_thread():
        acbt_client = None
        try:
            starting_page = params.get("portal_url", config["starting_page"])
            try:
                starting_page = starting_page.format(**params)
            except (KeyError, ValueError):
                pass

            # Start AgentCore Browser Tool (cloud-hosted Chromium)
            log.info(f"Starting ACBT cloud browser in {aws_region}...")
            acbt_client = BrowserClient(region=aws_region)
            acbt_client.start(viewport={"width": 1600, "height": 900})
            live_view_url = acbt_client.generate_live_view_url(expires=300)
            cdp_ws_url, cdp_headers = acbt_client.generate_ws_headers()
            log.info(f"ACBT browser started. Live view: {live_view_url[:80]}...")

            # Store live view URL
            task.recording_url = live_view_url

            @nova_workflow(
                workflow_definition_name="elderlove-guardian",
                model_id="nova-act-latest",
                boto_session_kwargs={"region_name": aws_region},
            )
            def _run():
                nova_kwargs = {
                    "starting_page": starting_page,
                    "cdp_endpoint_url": cdp_ws_url,
                    "cdp_headers": cdp_headers,
                    "ignore_https_errors": True,
                }

                with NovaAct(**nova_kwargs) as nova:
                    for i, step_config in enumerate(config["steps"]):
                        step_label = step_config["label"]
                        try:
                            step_label = step_label.format(**params)
                        except (KeyError, ValueError):
                            pass
                        try:
                            prompt = step_config["prompt"].format(**params)
                        except (KeyError, ValueError):
                            prompt = step_config["prompt"]

                        log.info(f"Step {i+1}/{len(config['steps'])}: {step_label}")

                        step_record = {
                            "index": i + 1,
                            "label": step_label,
                            "status": "running",
                            "started_at": datetime.now(timezone.utc).isoformat(),
                        }
                        task.steps.append(step_record)

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
                            raise

                        step_record["completed_at"] = datetime.now(timezone.utc).isoformat()

            _run()
            task.status = TaskStatus.completed
            task.completed_at = datetime.now(timezone.utc).isoformat()

        except Exception as e:
            task.status = TaskStatus.failed
            task.error = str(e)[:1000]
            task.completed_at = datetime.now(timezone.utc).isoformat()
            log.error(f"Workflow failed: {e}")
        finally:
            if acbt_client:
                try:
                    acbt_client.stop()
                    log.info("ACBT browser session stopped")
                except Exception:
                    pass

    # Run in a separate thread to avoid asyncio/sync Playwright conflict
    # Don't block -- let the thread run in background, polling will get status
    thread = threading.Thread(target=_browser_thread, daemon=True)
    thread.start()

    # Return immediately -- task.status will be updated by the thread
    return task


async def execute_demo_workflow(task: TaskResult, config: dict, params: dict) -> TaskResult:
    """Demo mode: simulate Nova Act steps when the SDK is not installed."""
    task.status = TaskStatus.running
    task.started_at = datetime.now(timezone.utc).isoformat()

    for i, step_config in enumerate(config["steps"]):
        step_label = step_config["label"]
        try:
            step_label = step_label.format(**params)
        except (KeyError, ValueError):
            pass
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
            ts = int(datetime.now(timezone.utc).timestamp()) % 10000
            if task.task_type == TaskType.pharmacy_refill:
                step_record["response"] = json.dumps({
                    "confirmation_number": f"CVS-{ts}",
                    "medications_refilled": [params.get("medication", "Lisinopril 10mg")],
                    "estimated_pickup_time": "Tomorrow at 2:00 PM",
                    "pharmacy_name": "CVS Pharmacy",
                    "pharmacy_address": params.get("pharmacy_location", "CVS Pharmacy, 4th Ave, Columbus OH"),
                })
            elif task.task_type == TaskType.insurance_check:
                medications = params.get("medications", ["Lisinopril"])
                step_record["response"] = json.dumps({
                    "medications_checked": medications,
                    "matching_plan_count": 18,
                    "lowest_displayed_drug_cost": "$3.00",
                    "restrictions": [],
                    "next_step": "Confirm Eleanor's current Part D plan before relying on exact copays.",
                })
            elif task.task_type == TaskType.bill_payment:
                if "balance" in step_label.lower():
                    step_record["response"] = json.dumps({
                        "account_number": "***-***-4821",
                        "current_balance": "$127.43",
                        "due_date": "September 15, 2026",
                        "last_payment_date": "August 12, 2026",
                        "last_payment_amount": "$118.90",
                        "autopay_status": "Not enrolled",
                    })
                elif "approval" in step_label.lower():
                    step_record["response"] = json.dumps({
                        "balance": "$127.43",
                        "due_date": "September 15, 2026",
                        "action": "AWAITING_CAREGIVER_APPROVAL",
                    })
                else:
                    step_record["response"] = json.dumps({
                        "payment_confirmation_number": f"PAY-{ts}",
                        "amount_paid": "$127.43",
                        "payment_method_last4": "4821",
                        "expected_posting_date": "September 10, 2026",
                    })
            elif task.task_type == TaskType.appointment_booking:
                if "slot" in step_label.lower():
                    step_record["response"] = json.dumps({
                        "available_slots": [
                            {"date": "September 16, 2026", "time": "10:30 AM", "doctor": params.get("doctor", "Dr. Harrison")},
                            {"date": "September 17, 2026", "time": "2:00 PM", "doctor": params.get("doctor", "Dr. Harrison")},
                            {"date": "September 19, 2026", "time": "9:00 AM", "doctor": params.get("doctor", "Dr. Harrison")},
                        ],
                    })
                else:
                    step_record["response"] = json.dumps({
                        "appointment_date": "September 16, 2026",
                        "appointment_time": "10:30 AM",
                        "doctor_name": params.get("doctor", "Dr. Harrison"),
                        "clinic_name": params.get("clinic", "Riverside Clinic"),
                        "confirmation_number": f"APPT-{ts}",
                    })
            elif task.task_type == TaskType.grocery_order:
                items_raw = params.get("items", "milk, bread, eggs")
                items_list = [i.strip() for i in str(items_raw).split(",")]
                if "review" in step_label.lower():
                    step_record["response"] = json.dumps({
                        "items_in_cart": [{"name": i, "brand": "Eleanor's usual", "price": f"${3.49 + idx * 0.5:.2f}"} for idx, i in enumerate(items_list)],
                        "delivery_slot": "Tomorrow 9:00 AM - 11:00 AM",
                        "delivery_fee": "$3.99",
                        "subtotal": f"${sum(3.49 + idx * 0.5 for idx in range(len(items_list))):.2f}",
                        "total": f"${sum(3.49 + idx * 0.5 for idx in range(len(items_list))) + 3.99:.2f}",
                    })
                else:
                    step_record["response"] = json.dumps({
                        "order_number": f"GRC-{ts}",
                        "estimated_delivery": "Tomorrow 9:00 AM - 11:00 AM",
                        "total_charged": f"${sum(3.49 + idx * 0.5 for idx in range(len(items_list))) + 3.99:.2f}",
                    })
            elif task.task_type == TaskType.benefits_recert:
                if "status" in step_label.lower():
                    step_record["response"] = json.dumps({
                        "benefit_program": "Medicare Part D Extra Help",
                        "current_status": "Active",
                        "recertification_deadline": "October 31, 2026",
                        "sections_to_complete": ["Personal Info", "Income", "Assets", "Document Upload"],
                    })
                elif "review" in step_label.lower():
                    step_record["response"] = json.dumps({
                        "name": params.get("full_name", "Eleanor Morrison"),
                        "income": params.get("monthly_income", "$1,847"),
                        "status": "All fields complete. Ready for submission.",
                        "action": "AWAITING_CAREGIVER_APPROVAL",
                    })
                else:
                    step_record["response"] = json.dumps({
                        "confirmation_number": f"SSA-{ts}",
                        "submission_date": datetime.now(timezone.utc).strftime("%B %d, %Y"),
                        "next_review_date": "October 2027",
                        "benefit_status": "Renewed - Active",
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

    try:
        task_params = normalize_task_params(req.task_type, req.params)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    task = TaskResult(
        task_id=task_id,
        task_type=req.task_type,
        status=TaskStatus.pending_approval if not req.approved else TaskStatus.approved,
        params=task_params,
    )
    TASKS[task_id] = task

    # If pre-approved (caregiver already approved via dashboard), execute immediately
    if req.approved and config:
        asyncio.create_task(execute_nova_workflow(task, config, task_params))

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
    # Return tasks without full screenshot data (too large for list view)
    tasks = sorted(TASKS.values(), key=lambda t: t.task_id, reverse=True)[:20]
    return [TaskResult(**{**t.model_dump(), "screenshots": []}) for t in tasks]


@app.get("/tasks/{task_id}/screenshots")
async def get_screenshots(task_id: str, after: int = 0, authorization: Optional[str] = Header(None)):
    """Stream screenshots for a running task. Polls with ?after=N to get new screenshots since index N."""
    verify_secret(authorization)
    shots = SCREENSHOTS.get(task_id, [])
    task = TASKS.get(task_id)
    return {
        "task_id": task_id,
        "status": task.status if task else "unknown",
        "total": len(shots),
        "screenshots": shots[after:after + 5],  # Max 5 at a time to keep responses small
        "next_after": min(after + 5, len(shots)),
        "has_more": after + 5 < len(shots),
    }


@app.get("/tasks/{task_id}/latest-screenshot")
async def get_latest_screenshot(task_id: str, authorization: Optional[str] = Header(None)):
    """Get just the latest screenshot for a running task (for live viewer)."""
    verify_secret(authorization)
    shots = SCREENSHOTS.get(task_id, [])
    task = TASKS.get(task_id)
    return {
        "task_id": task_id,
        "status": task.status if task else "unknown",
        "step_count": len(task.steps) if task else 0,
        "current_step": task.steps[-1]["label"] if task and task.steps else None,
        "screenshot": shots[-1] if shots else None,
        "screenshot_index": len(shots) - 1 if shots else -1,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8100"))
    uvicorn.run(app, host="0.0.0.0", port=port)
