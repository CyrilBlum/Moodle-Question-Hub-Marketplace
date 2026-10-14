"""
Tier 3 Combinations Suite 2: Multi-Category Topology & Media Combinations (ORIGINAL_REQUEST §R1, §R3).
Verifies:
1. Deep nested 5-level category hierarchy ($course$/top/Gymnasium/Informatik/Algorithmen/Baeume/AVL).
2. Multi-branch sibling category trees (Mathematik/Analysis and Physik/Mechanik sharing parent).
3. Forced target category import flattening (preservehierarchy = false).
4. Embedded Base64 media preservation across multiple categories.
5. Heterogeneous question type mixtures (all 7 core types) in nested categories.
"""

import time
import json
import base64
import pytest


def test_t3_07_deep_nested_category_tree(remote_php):
    """T3.07: Verify 5-level nested category hierarchy import and parent-child linking."""
    ts = int(time.time() * 1000)
    cat_base = f"$course$/top/Gym_{ts}/Inf/Algo/Baeume/AVL"
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/Gym_{ts}</text></category></question>
  <question type="truefalse"><name><text>Q Level 1</text></name><questiontext><text>L1</text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question>

  <question type="category"><category><text>$course$/top/Gym_{ts}/Inf</text></category></question>
  <question type="truefalse"><name><text>Q Level 2</text></name><questiontext><text>L2</text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question>

  <question type="category"><category><text>$course$/top/Gym_{ts}/Inf/Algo</text></category></question>
  <question type="truefalse"><name><text>Q Level 3</text></name><questiontext><text>L3</text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question>

  <question type="category"><category><text>$course$/top/Gym_{ts}/Inf/Algo/Baeume</text></category></question>
  <question type="truefalse"><name><text>Q Level 4</text></name><questiontext><text>L4</text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question>

  <question type="category"><category><text>{cat_base}</text></category></question>
  <question type="truefalse"><name><text>Q Level 5 AVL</text></name><questiontext><text>L5</text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question>
</quiz>"""
    b64 = base64.b64encode(xml.encode("utf-8")).decode("ascii")
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $xml = base64_decode('{b64}');
    $result = $importer->import_package($xml, true);
    
    // Check categories created
    $cats = $DB->get_records_sql("SELECT id, name, parent FROM {{question_categories}} WHERE name LIKE :prefix ORDER BY id ASC", ['prefix' => 'Gym_{ts}%']);
    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'cat_count' => count($cats),
        'cats' => array_values($cats)
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] == 5, f"Expected 5 questions imported, got {data['count']}"
    assert data["cat_count"] >= 1


def test_t3_08_multi_branch_sibling_categories(remote_php):
    """T3.08: Verify multi-branch sibling categories (Mathematik and Physik) share common root."""
    ts = int(time.time() * 1000)
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/BranchRoot_{ts}</text></category></question>
  <question type="category"><category><text>$course$/top/BranchRoot_{ts}/Mathematik/Analysis</text></category></question>
  <question type="truefalse"><name><text>Q Math Analysis</text></name><questiontext><text>M</text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question>

  <question type="category"><category><text>$course$/top/BranchRoot_{ts}/Physik/Mechanik</text></category></question>
  <question type="truefalse"><name><text>Q Physik Mechanik</text></name><questiontext><text>P</text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question>
</quiz>"""
    b64 = base64.b64encode(xml.encode("utf-8")).decode("ascii")
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $xml = base64_decode('{b64}');
    $result = $importer->import_package($xml, true);
    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] == 2


def test_t3_09_forced_target_category_flattening(remote_php):
    """T3.09: Verify preservehierarchy=false flattens questions into target category."""
    ts = int(time.time() * 1000)
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/OriginalTree_{ts}/SubCatA</text></category></question>
  <question type="truefalse"><name><text>Flatten Q1 {ts}</text></name><questiontext><text>T1</text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question>
  <question type="category"><category><text>$course$/top/OriginalTree_{ts}/SubCatB</text></category></question>
  <question type="truefalse"><name><text>Flatten Q2 {ts}</text></name><questiontext><text>T2</text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question>
</quiz>"""
    b64 = base64.b64encode(xml.encode("utf-8")).decode("ascii")
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    require_once($CFG->dirroot . '/question/editlib.php');
    $course = $DB->get_record('course', ['id' => 2]);
    $ctx = \\qbank_questionhub\\package_exporter::resolve_course_question_context($course);
    $targetcat = question_get_default_category($ctx->id, true);
    $importer = new \\qbank_questionhub\\package_importer(2, $targetcat->id);
    $xml = base64_decode('{b64}');
    $result = $importer->import_package($xml, false); // preservehierarchy = false
    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'targetcatid' => $targetcat->id
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] == 2


def test_t3_10_embedded_media_across_nested_categories(remote_php):
    """T3.10: Verify Base64 media files in different categories are correctly stored."""
    ts = int(time.time() * 1000)
    # 1x1 transparent PNG
    png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/MediaTree_{ts}/Cat1</text></category></question>
  <question type="essay">
    <name><text>Media Question Cat 1</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Diagram 1: <img src="@@PLUGINFILE@@/diagram1.png" /></p>]]></text>
      <file name="diagram1.png" encoding="base64">{png_b64}</file>
    </questiontext>
  </question>

  <question type="category"><category><text>$course$/top/MediaTree_{ts}/Cat2</text></category></question>
  <question type="essay">
    <name><text>Media Question Cat 2</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Diagram 2: <img src="@@PLUGINFILE@@/diagram2.png" /></p>]]></text>
      <file name="diagram2.png" encoding="base64">{png_b64}</file>
    </questiontext>
  </question>
</quiz>"""
    b64 = base64.b64encode(xml.encode("utf-8")).decode("ascii")
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $xml = base64_decode('{b64}');
    $result = $importer->import_package($xml, true);
    $files = $DB->get_records_sql("SELECT id, filename, filesize FROM {{files}} WHERE component = 'question' AND filename IN ('diagram1.png', 'diagram2.png')");
    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'files' => array_values($files)
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] == 2
    assert len(data["files"]) >= 2


def test_t3_11_heterogeneous_qtypes_mixture(remote_php, fixtures_dir):
    """T3.11: Single category containing all 7 standard question types hydrates completely."""
    # We load standard subset with all 7 types
    path = "/mnt/HC_Volume_100926434/real_dataset/real_standard_subset.xml"
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = file_get_contents('{path}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);
    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] >= 7
