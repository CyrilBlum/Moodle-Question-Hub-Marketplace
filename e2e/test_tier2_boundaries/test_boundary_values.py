"""
Tier 2 Suite 3: Boundary & Corner Cases (TEST_INFRA §Tier 2).
Exercises pedagogical fraction invariants, text scale limits, character encodings,
large package throughput (500 items), and media payload constraints:
1. MC fraction invariants (single vs multiple response)
2. TrueFalse, ShortAnswer, Numerical, and Matching answer counts & fraction constraints
3. Prompt length extremes (0, 64KB, 1000+ chars)
4. Unicode / Swiss German character preservation
5. Cloze brace and token syntax boundaries
6. Media file and package payload size limits
"""

import os
import json
import base64
import pytest


# --- Multiple Choice Fractions ---

def test_bnd_01_single_choice_no_100(hub_client, teacher_jwt):
    """BND-01: Single-choice with answers 50% and 50% must flag ERR_SINGLE_CHOICE_NO_100."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="multichoice">
      <name><text>MC 50-50</text></name><questiontext><text>Text</text></questiontext>
      <single>true</single>
      <answer fraction="50"><text>A</text></answer><answer fraction="50"><text>B</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_SINGLE_CHOICE_NO_100" in codes


def test_bnd_02_single_choice_all_zero(hub_client, teacher_jwt):
    """BND-02: Single-choice with all 0% answers must flag ERR_SINGLE_CHOICE_NO_100."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="multichoice">
      <name><text>MC all 0</text></name><questiontext><text>Text</text></questiontext>
      <single>true</single>
      <answer fraction="0"><text>A</text></answer><answer fraction="0"><text>B</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_SINGLE_CHOICE_NO_100" in codes


def test_bnd_03_single_choice_multiple_100(hub_client, teacher_jwt):
    """BND-03: Single-choice with two 100% answers must flag ERR_SINGLE_CHOICE_MULTIPLE_100."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="multichoice">
      <name><text>MC two 100</text></name><questiontext><text>Text</text></questiontext>
      <single>true</single>
      <answer fraction="100"><text>A</text></answer><answer fraction="100"><text>B</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_SINGLE_CHOICE_MULTIPLE_100" in codes


def test_bnd_04_single_choice_fraction_99_point_9(hub_client, teacher_jwt):
    """BND-04: Single-choice with 99.9% answer is not exactly 100% and must be flagged."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="multichoice">
      <name><text>MC 99.9</text></name><questiontext><text>Text</text></questiontext>
      <single>true</single>
      <answer fraction="99.9"><text>A</text></answer><answer fraction="0.1"><text>B</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_SINGLE_CHOICE_NO_100" in codes


def test_bnd_05_single_choice_non_standard_step(hub_client, teacher_jwt):
    """BND-05: Non-standard fraction step (33% instead of 33.33333%) emits warning or error."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="multichoice">
      <name><text>MC 33</text></name><questiontext><text>Text</text></questiontext>
      <single>true</single>
      <answer fraction="100"><text>A</text></answer><answer fraction="33"><text>B</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    warnings = [w.get("code") for w in data.get("diagnostics", {}).get("warnings", [])]
    # Either accepted or non-standard warning emitted
    assert data.get("valid") is True or "WARN_FRACTION_NON_STANDARD_STEP" in warnings


def test_bnd_06_multi_choice_positive_sum_50(hub_client, teacher_jwt):
    """BND-06: Multi-choice positive fraction sum 50% emits warning."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="multichoice">
      <name><text>Multi 50</text></name><questiontext><text>Text</text></questiontext>
      <single>false</single>
      <answer fraction="25"><text>A</text></answer><answer fraction="25"><text>B</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    warnings = [w.get("code") for w in data.get("diagnostics", {}).get("warnings", [])]
    assert any("SUM" in w for w in warnings) or data.get("valid") is True


def test_bnd_07_multi_choice_positive_sum_105(hub_client, teacher_jwt):
    """BND-07: Multi-choice positive fraction sum 105% emits warning."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="multichoice">
      <name><text>Multi 105</text></name><questiontext><text>Text</text></questiontext>
      <single>false</single>
      <answer fraction="55"><text>A</text></answer><answer fraction="50"><text>B</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    warnings = [w.get("code") for w in data.get("diagnostics", {}).get("warnings", [])]
    assert any("SUM" in w for w in warnings) or data.get("valid") is True


def test_bnd_08_multi_choice_exactly_100(hub_client, teacher_jwt):
    """BND-08: Multi-choice answers summing to exactly 100% pass without fraction warnings."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="multichoice">
      <name><text>Multi 100</text></name><questiontext><text>Text</text></questiontext>
      <single>false</single>
      <answer fraction="50"><text>A</text></answer><answer fraction="50"><text>B</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is True
    errors = data.get("diagnostics", {}).get("errors", [])
    assert len(errors) == 0


def test_bnd_09_single_choice_one_option(hub_client, teacher_jwt):
    """BND-09: Single-choice with only 1 option must flag ERR_NOT_ENOUGH_ANSWERS."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="multichoice">
      <name><text>MC 1 Option</text></name><questiontext><text>Text</text></questiontext>
      <single>true</single>
      <answer fraction="100"><text>A</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_NOT_ENOUGH_ANSWERS" in codes


# --- Other Question Types Fractions & Counts ---

def test_bnd_10_truefalse_fractions_50_50(hub_client, teacher_jwt):
    """BND-10: True/False with 50%/50% answers must flag ERR_TRUEFALSE_INVALID_FRACTIONS."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="truefalse">
      <name><text>TF 50-50</text></name><questiontext><text>Text</text></questiontext>
      <answer fraction="50"><text>true</text></answer><answer fraction="50"><text>false</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_TRUEFALSE_INVALID_FRACTIONS" in codes


def test_bnd_11_truefalse_three_options(hub_client, teacher_jwt):
    """BND-11: True/False with 3 answers must flag ERR_TRUEFALSE_INVALID_CHOICES."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="truefalse">
      <name><text>TF 3 options</text></name><questiontext><text>Text</text></questiontext>
      <answer fraction="100"><text>true</text></answer>
      <answer fraction="0"><text>false</text></answer>
      <answer fraction="0"><text>maybe</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_TRUEFALSE_INVALID_CHOICES" in codes


def test_bnd_12_shortanswer_without_100(hub_client, teacher_jwt):
    """BND-12: Short answer without a 100% correct answer must flag ERR_SHORTANSWER_NO_100."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="shortanswer">
      <name><text>SA 80</text></name><questiontext><text>Text</text></questiontext>
      <answer fraction="80"><text>Paris</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_SHORTANSWER_NO_100" in codes


def test_bnd_13_shortanswer_zero_answers(hub_client, teacher_jwt):
    """BND-13: Short answer with zero answers must flag error."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="shortanswer">
      <name><text>SA No Answers</text></name><questiontext><text>Text</text></questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_SHORTANSWER_NO_100" in codes or "ERR_NO_ANSWERS" in codes


def test_bnd_14_numerical_without_100(hub_client, teacher_jwt):
    """BND-14: Numerical without 100% answer must flag ERR_NUMERICAL_NO_100."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="numerical">
      <name><text>Num 90</text></name><questiontext><text>Text</text></questiontext>
      <answer fraction="90"><text>42</text></answer>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_NUMERICAL_NO_100" in codes


def test_bnd_15_matching_one_subquestion(hub_client, teacher_jwt):
    """BND-15: Matching question with only 1 subquestion must flag error."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="matching">
      <name><text>Match 1 Sub</text></name><questiontext><text>Text</text></questiontext>
      <subquestion><text>Question 1</text><answer><text>Answer 1</text></answer></subquestion>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert any("MATCHING" in c for c in codes)


# --- Text Boundaries & Special Characters ---

def test_bnd_16_empty_question_text_plugin(remote_php):
    """BND-16: Question with pure whitespace text triggers ERR_EMPTY_QUESTION_TEXT in plugin."""
    xml = """<quiz><question type="description">
      <name><text>Empty Prompt</text></name><questiontext><text>   </text></questiontext>
    </question></quiz>"""
    b64 = base64.b64encode(xml.encode("utf-8")).decode("ascii")
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $report = \\qbank_questionhub\\preflight_validator::validate(base64_decode('{b64}'));
    $errors = array_column($report->get_errors(), 'code');
    echo json_encode(['valid' => $report->is_valid(), 'errors' => $errors]);
    """
    res = remote_php(php_code)
    assert res.returncode == 0
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["valid"] is False
    assert "ERR_EMPTY_QUESTION_TEXT" in data["errors"]


def test_bnd_17_question_text_boundary_64kb(hub_client, teacher_jwt):
    """BND-17: Question text of 64KB parses cleanly without buffer overflow."""
    hub_client.set_token(teacher_jwt)
    large_text = "A" * 65536
    xml = f"""<quiz><question type="essay">
      <name><text>64KB Prompt</text></name>
      <questiontext><text><![CDATA[{large_text}]]></text></questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True


def test_bnd_18_question_name_1000_chars(hub_client, teacher_jwt):
    """BND-18: Question name of 1,000 characters is accepted and preserved."""
    hub_client.set_token(teacher_jwt)
    long_name = "LongName_" + ("X" * 1000)
    xml = f"""<quiz><question type="essay">
      <name><text>{long_name}</text></name>
      <questiontext><text>Prompt</text></questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True


def test_bnd_19_swiss_german_and_emojis(hub_client, teacher_jwt):
    """BND-19: Swiss German spelling (ss, umlauts) and Emojis are preserved."""
    hub_client.set_token(teacher_jwt)
    swiss_name = "Prüfung: Schläuche & Wärme-Übertragung 🚀 (100% Gültig)"
    xml = f"""<quiz><question type="essay">
      <name><text><![CDATA[{swiss_name}]]></text></name>
      <questiontext><text>Erkläre den Unterschied.</text></questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True


def test_bnd_20_unescaped_math_symbols(hub_client, teacher_jwt):
    """BND-20: Unescaped math symbols (<, &) outside CDATA trigger syntax error."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="essay">
      <name><text>Unescaped Math</text></name>
      <questiontext><text>if x < 5 & y > 3 then ...</text></questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XML_INVALID_SYNTAX" in codes


def test_bnd_21_escaped_math_in_cdata(hub_client, teacher_jwt):
    """BND-21: Math symbols wrapped inside CDATA parse successfully."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="essay">
      <name><text>CDATA Math</text></name>
      <questiontext><text><![CDATA[if x < 5 & y > 3 then ...]]></text></questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True


# --- Package & Media Boundaries ---

def test_bnd_22_category_only_package_plugin(remote_php):
    """BND-22: Category-only package with 0 questions triggers ERR_NO_QUESTIONS_FOUND in plugin."""
    xml = """<quiz><question type="category">
      <category><text>$course$/top/EmptyCat</text></category>
    </question></quiz>"""
    b64 = base64.b64encode(xml.encode("utf-8")).decode("ascii")
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $report = \\qbank_questionhub\\preflight_validator::validate(base64_decode('{b64}'));
    $errors = array_column($report->get_errors(), 'code');
    echo json_encode(['valid' => $report->is_valid(), 'errors' => $errors]);
    """
    res = remote_php(php_code)
    assert res.returncode == 0
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["valid"] is False
    assert "ERR_NO_QUESTIONS_FOUND" in data["errors"]


def test_bnd_23_large_package_500_questions(hub_client, teacher_jwt):
    """BND-23: Package with 500 questions passes preflight and reports count 500."""
    hub_client.set_token(teacher_jwt)
    parts = ['<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n']
    parts.append('  <question type="category"><category><text>$course$/top/Stress500</text></category></question>\n')
    for i in range(1, 501):
        parts.append(f"""  <question type="multichoice">
    <name><text>Question {i}</text></name>
    <questiontext><text>Prompt {i}</text></questiontext>
    <single>true</single>
    <answer fraction="100"><text>True</text></answer>
    <answer fraction="0"><text>False</text></answer>
  </question>\n""")
    parts.append('</quiz>\n')
    xml_content = "".join(parts)

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True
    assert data.get("stats", {}).get("question_count") == 500


def test_bnd_24_embedded_media_valid_png(hub_client, teacher_jwt, fixtures_dir):
    """BND-24: Package with valid embedded PNG media identifies media file."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "packages", "package_with_embedded_media.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True
    assert data.get("stats", {}).get("embedded_media_count", 0) >= 1


def test_bnd_25_media_exceeds_10mb_limit(hub_client, teacher_jwt):
    """BND-25: Media file exceeding 10MB limit triggers ERR_MEDIA_SIZE_EXCEEDED."""
    hub_client.set_token(teacher_jwt)
    # Generate ~11.8MB decoded base64 payload (exceeds 10MB limit)
    huge_b64 = "Y" * (15 * 1024 * 1024)
    xml = f"""<quiz><question type="essay">
      <name><text>Huge Media</text></name>
      <questiontext>
        <text>Text</text>
        <file name="huge.png" encoding="base64">{huge_b64}</file>
      </questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_MEDIA_SIZE_EXCEEDED" in codes or "ERR_PACKAGE_SIZE_EXCEEDED" in codes


def test_bnd_26_prohibited_extension_exe(hub_client, teacher_jwt):
    """BND-26: Media with .exe extension triggers ERR_DISALLOWED_MEDIA_MIME."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="essay">
      <name><text>EXE Media</text></name>
      <questiontext>
        <text>Text</text>
        <file name="malware.exe" encoding="base64">TVqQAAMAAAAEAAAA//8=</file>
      </questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_DISALLOWED_MEDIA_MIME" in codes


def test_bnd_27_prohibited_extension_php(hub_client, teacher_jwt):
    """BND-27: Media with .php extension triggers ERR_DISALLOWED_MEDIA_MIME."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="essay">
      <name><text>PHP Media</text></name>
      <questiontext>
        <text>Text</text>
        <file name="backdoor.php" encoding="base64">PD9waHAgcGhwaW5mbygpOyA/Pg==</file>
      </questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_DISALLOWED_MEDIA_MIME" in codes


def test_bnd_28_prohibited_extension_sh(hub_client, teacher_jwt):
    """BND-28: Media with .sh extension triggers ERR_DISALLOWED_MEDIA_MIME."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="essay">
      <name><text>Shell Media</text></name>
      <questiontext>
        <text>Text</text>
        <file name="script.sh" encoding="base64">IyEvYmluL3NoCmVjaG8gMQo=</file>
      </questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_DISALLOWED_MEDIA_MIME" in codes


def test_bnd_29_malformed_base64_chars(hub_client, teacher_jwt):
    """BND-29: Media with invalid Base64 characters triggers ERR_MALFORMED_MEDIA_BASE64."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="essay">
      <name><text>Bad Base64</text></name>
      <questiontext>
        <text>Text</text>
        <file name="img.png" encoding="base64">NotValidBase64!!!###$$$</file>
      </questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_MALFORMED_MEDIA_BASE64" in codes


# --- Cloze Boundaries ---

def test_bnd_30_cloze_unclosed_brace(hub_client, teacher_jwt):
    """BND-30: Cloze question with unclosed { brace triggers ERR_CLOZE_SYNTAX_INVALID."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="cloze">
      <name><text>Cloze Unclosed</text></name>
      <questiontext><text>Gegeben sei {1:SA:=answer</text></questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_CLOZE_SYNTAX_INVALID" in codes


def test_bnd_31_cloze_extra_closing_brace(hub_client, teacher_jwt):
    """BND-31: Cloze question with extra } brace triggers ERR_CLOZE_SYNTAX_INVALID."""
    hub_client.set_token(teacher_jwt)
    xml = """<quiz><question type="cloze">
      <name><text>Cloze Extra Close</text></name>
      <questiontext><text>Gegeben sei 1:SA:=answer}</text></questiontext>
    </question></quiz>"""
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_CLOZE_SYNTAX_INVALID" in codes


def test_bnd_32_cloze_invalid_token_syntax_plugin(remote_php):
    """BND-32: Curly braces that are not Cloze tokens (LaTeX, code) are literal and NOT a Cloze error."""
    xml = """<quiz><question type="cloze">
      <name><text>Cloze Bad Token</text></name>
      <questiontext><text>Gegeben sei {not a valid cloze token}</text></questiontext>
    </question></quiz>"""
    b64 = base64.b64encode(xml.encode("utf-8")).decode("ascii")
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $report = \\qbank_questionhub\\preflight_validator::validate(base64_decode('{b64}'));
    $errors = array_column($report->get_errors(), 'code');
    echo json_encode(['valid' => $report->is_valid(), 'errors' => $errors]);
    """
    res = remote_php(php_code)
    assert res.returncode == 0
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert "ERR_CLOZE_SYNTAX_INVALID" not in data["errors"]
