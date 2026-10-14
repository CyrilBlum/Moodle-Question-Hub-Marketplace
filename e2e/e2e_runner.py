#!/usr/bin/env python3
"""
Master E2E Test Runner for Moodle Question Hub.
Orchestrates multi-tier opaque-box end-to-end testing across live testbeds:
- Tier 1: Feature Coverage (F01–F15)
- Tier 2: Boundaries, Corner Cases & Attack Suites (XXE, Malformed, BVA, Unsupported)
- Tier 3: Cross-Feature Combinations (Auth × SemVer × Topology × Cross-Version)
- Tier 4: Real-World Swiss Gymnasium Scenarios (5 Subjects, Live Quizzes)
"""

import argparse
import sys
import os
import time
import json
from typing import List, Dict, Any, Optional

try:
    import pytest
except ImportError:
    pytest = None

TIER_DIRS = {
    "1": "e2e/test_tier1_features",
    "2": "e2e/test_tier2_boundaries",
    "3": "e2e/test_tier3_combinations",
    "4": "e2e/test_tier4_scenarios",
}


class TabularTestSummaryPlugin:
    """Pytest plugin collecting per-test metrics for tabular summary reporting."""

    def __init__(self):
        self.results: List[Dict[str, Any]] = []
        self.suite_metrics: Dict[str, Dict[str, Any]] = {}

    def pytest_runtest_logreport(self, report):
        if report.when == "call" or (report.failed and report.when == "setup"):
            suite = report.nodeid.split("::")[0]
            if suite not in self.suite_metrics:
                self.suite_metrics[suite] = {
                    "total": 0,
                    "passed": 0,
                    "failed": 0,
                    "skipped": 0,
                    "duration": 0.0,
                }

            self.suite_metrics[suite]["total"] += 1
            self.suite_metrics[suite]["duration"] += report.duration

            if report.passed:
                self.suite_metrics[suite]["passed"] += 1
            elif report.failed:
                self.suite_metrics[suite]["failed"] += 1
            elif report.skipped:
                self.suite_metrics[suite]["skipped"] += 1

            self.results.append({
                "nodeid": report.nodeid,
                "suite": suite,
                "outcome": report.outcome,
                "duration": report.duration,
                "failed": report.failed,
                "passed": report.passed,
                "skipped": report.skipped,
            })


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Moodle Question Hub Master E2E Test Runner",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--tier",
        choices=["all", "1", "2", "3", "4"],
        default="all",
        help="Select specific test tier to execute",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable detailed test output",
    )
    parser.add_argument(
        "-x", "--fail-fast",
        action="store_true",
        help="Stop test execution immediately upon first failure",
    )
    parser.add_argument(
        "-k", "--filter",
        type=str,
        default="",
        help="Pytest test expression filter",
    )
    parser.add_argument(
        "--moodle1-url",
        type=str,
        default="https://moodle-one.in-form-atik.ch",
        help="Moodle 1 Base URL (Moodle 5.0)",
    )
    parser.add_argument(
        "--moodle2-url",
        type=str,
        default="https://moodle-two.in-form-atik.ch",
        help="Moodle 2 Base URL (Moodle 4.5 LTS)",
    )
    parser.add_argument(
        "--hub-url",
        type=str,
        default="https://hub.cblum.ch",
        help="Marketplace Hub Base URL",
    )
    parser.add_argument(
        "--report-json",
        type=str,
        default="",
        help="File path to write structured JSON summary report",
    )
    return parser.parse_args()


def determine_tier_from_suite(suite_path: str) -> str:
    for tier_num, tier_dir in TIER_DIRS.items():
        if tier_dir in suite_path:
            return f"Tier {tier_num}"
    return "Other"


def print_summary_report(
    tier_arg: str,
    plugin: TabularTestSummaryPlugin,
    total_duration: float,
):
    print("\n" + "=" * 102)
    print("                      MOODLE QUESTION HUB — E2E TEST SUMMARY REPORT")
    print("=" * 102)
    print(f"{'Tier':<8} {'Suite Name':<42} {'Total':<7} {'Pass':<7} {'Fail':<7} {'Skip':<7} {'Duration':<10} {'Status':<10}")
    print("-" * 102)

    total_all = 0
    passed_all = 0
    failed_all = 0
    skipped_all = 0

    # Sort suites for clean display
    for suite, m in sorted(plugin.suite_metrics.items()):
        total_all += m["total"]
        passed_all += m["passed"]
        failed_all += m["failed"]
        skipped_all += m["skipped"]

        tier_lbl = determine_tier_from_suite(suite)
        clean_name = os.path.basename(suite)
        status = "PASSED" if m["failed"] == 0 and m["total"] > 0 else ("FAILED" if m["failed"] > 0 else "SKIPPED")

        print(f"{tier_lbl:<8} {clean_name:<42} {m['total']:<7} {m['passed']:<7} {m['failed']:<7} {m['skipped']:<7} {m['duration']:<9.2f}s {status:<10}")

    print("-" * 102)
    overall_status = "100% PASS" if failed_all == 0 and total_all > 0 else ("FAILURES DETECTED" if failed_all > 0 else "NO TESTS")
    print(f"{'TOTAL':<8} {'All Discovered Suites':<42} {total_all:<7} {passed_all:<7} {failed_all:<7} {skipped_all:<7} {total_duration:<9.2f}s {overall_status:<10}")
    print("=" * 102 + "\n")


def main() -> int:
    args = parse_args()

    if pytest is None:
        print("ERROR: pytest is required. Please install via: pip install -r e2e/requirements.txt", file=sys.stderr)
        return 2

    # Resolve target test directories
    if args.tier == "all":
        target_dirs = list(TIER_DIRS.values())
    else:
        target_dirs = [TIER_DIRS[args.tier]]

    # Ensure directories exist
    target_dirs = [d for d in target_dirs if os.path.isdir(d)]
    if not target_dirs:
        print(f"ERROR: No matching test directories found for tier '{args.tier}'.", file=sys.stderr)
        return 2

    # Assemble pytest CLI arguments
    pytest_args = target_dirs.copy()
    if args.verbose:
        pytest_args.append("-v")
    if args.fail_fast:
        pytest_args.append("-x")
    if args.filter:
        pytest_args.extend(["-k", args.filter])

    # Pass live URL overrides to pytest fixtures
    pytest_args.extend([
        f"--moodle1-url={args.moodle1_url}",
        f"--moodle2-url={args.moodle2_url}",
        f"--hub-url={args.hub_url}",
    ])

    plugin = TabularTestSummaryPlugin()
    start_time = time.time()
    exit_code = pytest.main(pytest_args, plugins=[plugin])
    total_duration = time.time() - start_time

    print_summary_report(args.tier, plugin, total_duration)

    if args.report_json:
        report_data = {
            "tier": args.tier,
            "duration_seconds": total_duration,
            "exit_code": int(exit_code),
            "summary": {
                "total": len(plugin.results),
                "passed": sum(1 for r in plugin.results if r["outcome"] == "passed"),
                "failed": sum(1 for r in plugin.results if r["outcome"] == "failed"),
                "skipped": sum(1 for r in plugin.results if r["outcome"] == "skipped"),
            },
            "suites": plugin.suite_metrics,
            "results": plugin.results,
        }
        with open(args.report_json, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2)
        print(f"JSON summary report written to {args.report_json}")

    return 0 if exit_code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
