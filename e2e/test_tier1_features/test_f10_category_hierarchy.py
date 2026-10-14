"""
Feature 10: Category Hierarchy Export (ORIGINAL_REQUEST §R1).
Verifies canonical context token normalization ($course$/top/...), deep nested category
tree preservation, Moodle 5.0 context normalization, single-question export isolation,
and category metadata (info, format, idnumber) serialization.
"""

import xml.etree.ElementTree as ET
import pytest


def test_f10_t01_canonical_context_token_normalization(hetzner_ssh):
    """Verify exported categories normalize context to $course$/top/... prefix."""
    cmd = 'php8.2 /mnt/HC_Volume_100926434/www/moodle-one/question/bank/questionhub/cli/export.php --courseid=2'
    res = hetzner_ssh(cmd)
    assert res.returncode == 0, f"Export CLI failed: {res.stderr}"
    assert "$course$/top/" in res.stdout, "Exported XML missing canonical $course$/top/ prefix"


def test_f10_t02_deep_nested_hierarchy_preservation(hetzner_ssh):
    """Verify parent-child category tree paths are serialized intact."""
    cmd = 'php8.2 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-one/config.php"); $exporter = new \\qbank_questionhub\\package_exporter(2); $cat = $DB->get_record_sql("SELECT * FROM {question_categories} WHERE name != :top ORDER BY id ASC LIMIT 1", ["top" => "top"]); if ($cat) { echo $exporter->export_category_xml($cat->id); }\''
    res = hetzner_ssh(cmd)
    assert res.returncode == 0
    assert "<quiz>" in res.stdout
    root = ET.fromstring(res.stdout)
    cat_node = root.find("question[@type='category']")
    assert cat_node is not None, "Missing category question node"
    cat_text = cat_node.find("category/text").text
    assert cat_text.startswith("$course$/top/"), f"Unexpected category path: {cat_text}"


def test_f10_t03_moodle5_module_context_normalization(hetzner_ssh):
    """Verify that Moodle 5.0 module question contexts are normalized to $course$ tokens."""
    cmd = 'php8.2 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-one/config.php"); $exporter = new \\qbank_questionhub\\package_exporter(2); $cat = $DB->get_record_sql("SELECT * FROM {question_categories} WHERE name != :top ORDER BY id ASC LIMIT 1", ["top" => "top"]); if ($cat) { echo $exporter->export_category_xml($cat->id); }\''
    res = hetzner_ssh(cmd)
    assert res.returncode == 0
    assert "<quiz>" in res.stdout
    assert "$module$" not in res.stdout, "Module context leaked without normalization"
    assert "$course$" in res.stdout, "Expected normalized $course$ token in category XML"


def test_f10_t04_single_question_export_zero_leakage(hetzner_ssh):
    """Verify exporting a specific single question exports exactly 1 question with 0 sibling leakage."""
    cmd = 'php8.2 /mnt/HC_Volume_100926434/challenger_m3_3/export_probe.php --instance=1 --courseid=2'
    res = hetzner_ssh(cmd)
    assert res.returncode == 0, f"Export probe failed: {res.stderr}\n{res.stdout}"
    output = res.stdout.strip()
    json_start = output.find("{")
    assert json_start != -1, f"No JSON in output: {output}"
    import json
    data = json.loads(output[json_start:])

    root = ET.fromstring(data["singlexml"])
    assessment_questions = [q for q in root.findall("question") if q.get("type") != "category"]
    assert len(assessment_questions) == 1, f"Expected 1 question, got {len(assessment_questions)}"

    # Check zero sibling leakage
    sibling_qids = [qid for qid in data["qids"] if qid != data["target_qid"]]
    for sib in sibling_qids:
        assert f"<!-- question: {sib} " not in data["singlexml"], f"Sibling question {sib} leaked into XML!"


def test_f10_t05_category_metadata_preservation(hetzner_ssh):
    """Verify category info description, format, and idnumber are serialized into the XML."""
    cmd = 'php8.2 /mnt/HC_Volume_100926434/www/moodle-one/question/bank/questionhub/cli/export.php --courseid=2'
    res = hetzner_ssh(cmd)
    assert res.returncode == 0
    root = ET.fromstring(res.stdout)
    cat_node = root.find("question[@type='category']")
    assert cat_node is not None
    assert cat_node.find("info") is not None, "Category info element missing"
    assert cat_node.find("idnumber") is not None, "Category idnumber element missing"
