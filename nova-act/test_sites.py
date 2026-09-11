"""
Kinship Site Compatibility Tester
Tests public websites for CAPTCHA/bot-blocking to find demo-friendly sites.
Each site gets a quick 2-3 step test with Nova Act.
"""

import os
import sys
import time
import json
import traceback

os.environ["AWS_DEFAULT_REGION"] = "us-east-1"

from nova_act import NovaAct, Workflow

LOGS = "/tmp/opencode/site-tests"
os.makedirs(LOGS, exist_ok=True)

# Sites to test: (name, url, test_prompt, description)
SITES = [
    {
        "name": "Nova Act Gym (Flight Search)",
        "url": "https://nova.amazon.com/act/gym/next-dot/search",
        "prompt": "In the flight search form, type 'New York' in the 'From' or origin field. Then type 'Los Angeles' in the 'To' or destination field. Click the search button.",
        "category": "Demo sandbox",
        "max_steps": 5,
    },
    {
        "name": "WebMD Drug Lookup",
        "url": "https://www.webmd.com/drugs/2/index",
        "prompt": "Search for the drug 'Lisinopril' using the search box or the alphabetical index. Click on the result for Lisinopril if one appears.",
        "category": "Health info",
        "max_steps": 5,
    },
    {
        "name": "ZocDoc Doctor Search",
        "url": "https://www.zocdoc.com/",
        "prompt": "Search for a 'Primary Care' doctor near 'New York, NY' using the search fields on the page. Click the search or find button.",
        "category": "Appointment booking",
        "max_steps": 5,
    },
    {
        "name": "Drugs.com Medication Info",
        "url": "https://www.drugs.com/",
        "prompt": "Type 'Lisinopril' in the search box and press Enter or click the search button to look up medication information.",
        "category": "Medication reference",
        "max_steps": 5,
    },
    {
        "name": "RxList Drug Interactions",
        "url": "https://www.rxlist.com/",
        "prompt": "Find the search box and type 'Lisinopril' then press Enter or click search to look up the drug.",
        "category": "Drug reference",
        "max_steps": 5,
    },
    {
        "name": "Medicare.gov Plan Finder",
        "url": "https://www.medicare.gov/plan-compare/",
        "prompt": "Look for a way to browse or search Medicare plans. If there is a zip code field, enter '10001'. Click any 'Find Plans', 'Search', or 'Get Started' button.",
        "category": "Insurance/Medicare",
        "max_steps": 5,
    },
]


def test_site(workflow, site):
    """Test a single site with Nova Act. Returns a result dict."""
    name = site["name"]
    url = site["url"]
    prompt = site["prompt"]
    max_steps = site.get("max_steps", 5)

    print(f"\n{'='*70}")
    print(f"TESTING: {name}")
    print(f"URL: {url}")
    print(f"{'='*70}")

    result = {
        "name": name,
        "url": url,
        "category": site["category"],
        "status": "unknown",
        "captcha_blocked": None,
        "steps_taken": None,
        "time_seconds": None,
        "response": None,
        "error": None,
    }

    start = time.time()
    try:
        site_log_dir = os.path.join(LOGS, name.replace(" ", "_").replace("/", "_"))
        os.makedirs(site_log_dir, exist_ok=True)

        with NovaAct(
            starting_page=url,
            workflow=workflow,
            headless=True,
            logs_directory=site_log_dir,
            tty=False,
        ) as nova:
            act_result = nova.act(prompt, max_steps=max_steps)
            elapsed = time.time() - start

            result["time_seconds"] = round(elapsed, 1)
            result["response"] = repr(act_result)
            result["status"] = "SUCCESS"
            result["captcha_blocked"] = False

            # Check metadata
            if hasattr(act_result, 'metadata'):
                meta = act_result.metadata
                if hasattr(meta, 'time_worked_s'):
                    result["work_time"] = meta.time_worked_s

            print(f"  Result: {repr(act_result)[:300]}")
            print(f"  Time: {elapsed:.1f}s")
            print(f"  Status: SUCCESS")

    except Exception as e:
        elapsed = time.time() - start
        err_str = str(e)
        result["time_seconds"] = round(elapsed, 1)
        result["error"] = err_str[:500]

        # Check if this looks like a CAPTCHA/bot block
        captcha_keywords = ["captcha", "robot", "bot", "challenge", "blocked",
                            "access denied", "cloudflare", "verify you are human",
                            "recaptcha", "hcaptcha"]
        err_lower = err_str.lower()
        is_captcha = any(kw in err_lower for kw in captcha_keywords)

        if is_captcha:
            result["status"] = "CAPTCHA_BLOCKED"
            result["captcha_blocked"] = True
        else:
            result["status"] = "ERROR"
            result["captcha_blocked"] = False

        print(f"  Error: {err_str[:300]}")
        print(f"  Time: {elapsed:.1f}s")
        print(f"  Status: {result['status']}")
        traceback.print_exc()

    return result


def main():
    print("=" * 70)
    print("Kinship Site Compatibility Tester")
    print("Testing sites for CAPTCHA/bot-blocking compatibility")
    print("=" * 70)

    results = []

    with Workflow(
        workflow_definition_name="elderlove-guardian",
        model_id="nova-act-latest",
        boto_session_kwargs={"region_name": "us-east-1"},
    ) as workflow:
        for site in SITES:
            try:
                r = test_site(workflow, site)
                results.append(r)
            except Exception as e:
                print(f"\n  FATAL ERROR testing {site['name']}: {e}")
                traceback.print_exc()
                results.append({
                    "name": site["name"],
                    "url": site["url"],
                    "category": site["category"],
                    "status": "FATAL_ERROR",
                    "captcha_blocked": None,
                    "error": str(e)[:500],
                })

    # Print summary
    print("\n\n")
    print("=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)
    print(f"{'Site':<35} {'Status':<18} {'Time':>8}  {'Category'}")
    print("-" * 70)

    for r in results:
        t = f"{r.get('time_seconds', '?')}s" if r.get('time_seconds') else "N/A"
        print(f"{r['name']:<35} {r['status']:<18} {t:>8}  {r['category']}")

    # Save detailed results
    results_file = os.path.join(LOGS, "results.json")
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nDetailed results saved to: {results_file}")

    # Ranked list
    print("\n\nRANKED SITES (best for demos):")
    print("-" * 40)
    success = [r for r in results if r["status"] == "SUCCESS"]
    errors = [r for r in results if r["status"] == "ERROR"]
    blocked = [r for r in results if r["status"] == "CAPTCHA_BLOCKED"]
    fatal = [r for r in results if r["status"] == "FATAL_ERROR"]

    rank = 1
    for r in sorted(success, key=lambda x: x.get("time_seconds", 999)):
        print(f"  {rank}. {r['name']} - WORKS ({r.get('time_seconds', '?')}s)")
        rank += 1
    for r in errors:
        print(f"  {rank}. {r['name']} - ERROR (may still work, needs investigation)")
        rank += 1
    for r in blocked:
        print(f"  {rank}. {r['name']} - CAPTCHA BLOCKED (not suitable)")
        rank += 1
    for r in fatal:
        print(f"  {rank}. {r['name']} - FATAL ERROR (not suitable)")
        rank += 1


if __name__ == "__main__":
    main()
