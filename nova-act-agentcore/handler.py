#!/usr/bin/env python3
"""
Kinship Nova Act — AgentCore Runtime Handler

Deployed on Bedrock AgentCore with managed browser sessions.
Receives browser task requests from the Kinship app and executes
them via Nova Act with real browser automation.

Every task requires caregiver pre-approval before this handler is invoked.
"""

import logging
import sys
import os
import json
import re
import boto3
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_agentcore.tools.browser_client import browser_session
from nova_act import NovaAct, Workflow

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("kinship-nova-act")

app = BedrockAgentCoreApp()


# --------------- workflow step configs ---------------

TASK_CONFIGS = {
    "pharmacy_refill": {
        "default_url": "https://www.cvs.com/",
        "steps": [
            "Navigate to the pharmacy sign-in page and click 'Sign In' or 'Log In'.",
            "Navigate to 'My Prescriptions', 'Prescription Center', or 'Refills'.",
            "Find the prescription for '{medication}' and click 'Refill' or 'Request Refill'.",
            "Confirm the refill request. Select pickup at '{pharmacy_location}' if prompted.",
        ],
        "extract": "Return a JSON object: confirmation_number, medications_refilled, estimated_pickup_time, pharmacy_name.",
    },
    "insurance_check": {
        "default_url": "https://www.medicare.gov/plan-compare/",
        "steps": [
            "Enter exactly ZIP code '{zip_code}' once if Medicare asks for a location. Never guess or try another ZIP.",
            "Choose the Medicare drug plan (Part D) comparison path. Do not enroll or enter personal identifiers.",
            "Add these drugs one at a time: {medications_text}. Do not add any drug that is not listed.",
            "Compare local plans and note visible costs and restrictions. If exact coverage requires Eleanor's current plan details, say so instead of guessing.",
        ],
        "extract": "Return a JSON object: medications_checked, matching_plan_count, lowest_displayed_drug_cost, restrictions, next_step.",
    },
    "bill_payment": {
        "default_url": "{portal_url}",
        "steps": [
            "Navigate to 'Billing', 'Pay Bill', or 'Account Balance'.",
            "Find the current balance due, due date, and account number.",
        ],
        "extract": "Return a JSON object: account_number, current_balance, due_date, last_payment_date.",
    },
    "appointment_booking": {
        "default_url": "{portal_url}",
        "steps": [
            "Navigate to 'Schedule Appointment' or 'Appointments'.",
            "Search for appointments with '{doctor}' for '{reason}' on or after '{preferred_date}'.",
        ],
        "extract": "Return a JSON object with available_slots array (date, time, doctor for each).",
    },
    "grocery_order": {
        "default_url": "{portal_url}",
        "steps": [
            "Search for each item: {items}. Add each to the cart. Avoid subscription-only items.",
            "Go to cart. Check for hidden subscription sign-ups and uncheck them.",
            "Select delivery to '{address}'. Choose the next available morning slot.",
        ],
        "extract": "Return a JSON object: items_in_cart, delivery_slot, subtotal, total.",
    },
}


@app.route("/ping")
def ping() -> dict[str, str]:
    return {"status": "healthy", "service": "kinship-nova-act"}


def normalize_params(task_type: str, raw_params: dict) -> dict:
    params = dict(raw_params or {})
    if task_type != "insurance_check":
        return params
    source = params.get("medications") or params.get("medication") or []
    if isinstance(source, str):
        medications = [value.strip() for value in source.split(",") if value.strip()]
    elif isinstance(source, list):
        medications = [str(value).strip() for value in source if str(value).strip()]
    else:
        medications = []
    if not medications:
        medications = ["Lisinopril", "Metformin", "Vitamin D", "Atorvastatin"]
    zip_code = str(params.get("zip_code") or params.get("zip") or "43215").strip()
    if not re.fullmatch(r"\d{5}", zip_code):
        raise ValueError("Insurance checks require a valid 5-digit ZIP code.")
    params.update({
        "zip_code": zip_code,
        "medications": medications,
        "medications_text": ", ".join(medications),
    })
    return params


@app.entrypoint
def handler(payload):
    """
    AgentCore entrypoint: execute a browser automation task for an elder.

    Payload:
        task_type: str (pharmacy_refill, insurance_check, bill_payment, etc.)
        params: dict (medication, pharmacy_location, portal_url, etc.)
        starting_page: str (optional, overrides default)
    """
    log.info(f"Handler invoked with payload: {json.dumps(payload, default=str)[:500]}")

    task_type = payload.get("task_type", "insurance_check") if isinstance(payload, dict) else "insurance_check"
    params = payload.get("params", {}) if isinstance(payload, dict) else {}
    config = TASK_CONFIGS.get(task_type)

    if not config:
        return {"status": "error", "response": f"Unknown task_type: {task_type}"}
    try:
        params = normalize_params(task_type, params)
    except ValueError as error:
        return {"status": "error", "response": str(error)}

    starting_page = payload.get("starting_page") or params.get("portal_url") or config["default_url"]
    try:
        starting_page = starting_page.format(**params)
    except (KeyError, ValueError):
        pass

    steps_completed = []
    result_data = None

    try:
        session = boto3.Session()
        region = session.region_name or "us-east-1"
        log.info(f"Creating AgentCore browser session in {region}...")

        with browser_session(region) as client:
            ws_url, headers = client.generate_ws_headers()
            log.info(f"Browser session ready. CDP endpoint: {ws_url[:80]}...")

            nova_kwargs = {
                "starting_page": starting_page,
                "headless": True,
                "cdp_endpoint_url": ws_url,
                "cdp_headers": headers,
                "clone_user_data_dir": False,
                "record_video": False,
                "tty": False,
            }

            # Use Workflow for IAM auth
            with Workflow(
                workflow_definition_name="elderlove-guardian",
                model_id="nova-act-latest",
                boto_session_kwargs={"region_name": region},
            ) as workflow:
                nova_kwargs["workflow"] = workflow

                with NovaAct(**nova_kwargs) as nova:
                    # Execute each step
                    for i, step_prompt in enumerate(config["steps"]):
                        try:
                            prompt = step_prompt.format(**params)
                        except (KeyError, ValueError):
                            prompt = step_prompt

                        log.info(f"Step {i+1}/{len(config['steps'])}: {prompt[:100]}...")

                        try:
                            nova.act(prompt)
                            steps_completed.append({"step": i + 1, "status": "completed", "prompt": prompt[:200]})
                        except Exception as step_err:
                            steps_completed.append({"step": i + 1, "status": "failed", "error": str(step_err)[:300]})
                            log.error(f"Step {i+1} failed: {step_err}")

                    # Extract final data
                    try:
                        extract_prompt = config["extract"].format(**params)
                    except (KeyError, ValueError):
                        extract_prompt = config["extract"]

                    log.info(f"Extracting: {extract_prompt[:100]}...")
                    extract_result = nova.act_get(extract_prompt)
                    result_data = extract_result.response if hasattr(extract_result, "response") else str(extract_result)
                    steps_completed.append({"step": "extract", "status": "completed"})

        return {
            "status": "success",
            "task_type": task_type,
            "steps": steps_completed,
            "result": result_data,
            "starting_page": starting_page,
        }

    except Exception as e:
        log.error(f"Workflow failed: {e}")
        import traceback
        traceback.print_exc()
        return {
            "status": "error",
            "task_type": task_type,
            "steps": steps_completed,
            "response": str(e)[:500],
        }
    finally:
        if "client" in locals():
            try:
                client.stop()
            except Exception:
                pass


if __name__ == "__main__":
    app.run()
