#!/usr/bin/env python3
"""
Generates the complete fixture catalog for Moodle Question Hub tests:
1. tests/fixtures/packages/ (valid packages, all 7 question types, media, real-world sample)
2. tests/fixtures/attacks/ (XXE vectors, Billion Laughs, SSRF, XInclude, BOM, malicious SVGs)
3. tests/fixtures/corrupted/ (truncated, syntax errors, non-XML binaries, missing quiz root)
"""

import os
import sys
import base64

FIXTURES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "fixtures"))
PACKAGES_DIR = os.path.join(FIXTURES_DIR, "packages")
ATTACKS_DIR = os.path.join(FIXTURES_DIR, "attacks")
CORRUPTED_DIR = os.path.join(FIXTURES_DIR, "corrupted")

# 1x1 transparent PNG in base64
TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

# Simple valid SVG in base64
VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" /></svg>'
VALID_SVG_B64 = base64.b64encode(VALID_SVG.encode("utf-8")).decode("utf-8")

# Malicious SVGs
MALICIOUS_SVG_SCRIPT = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle cx="10" cy="10" r="5"/></svg>'
MALICIOUS_SVG_SCRIPT_B64 = base64.b64encode(MALICIOUS_SVG_SCRIPT.encode("utf-8")).decode("utf-8")

MALICIOUS_SVG_ONLOAD = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle cx="10" cy="10" r="5"/></svg>'
MALICIOUS_SVG_ONLOAD_B64 = base64.b64encode(MALICIOUS_SVG_ONLOAD.encode("utf-8")).decode("utf-8")

MALICIOUS_SVG_XLINK = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="javascript:alert(1)"/></svg>'
MALICIOUS_SVG_XLINK_B64 = base64.b64encode(MALICIOUS_SVG_XLINK.encode("utf-8")).decode("utf-8")


def write_file(path: str, content: str, binary: bool = False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = "wb" if binary else "w"
    encoding = None if binary else "utf-8"
    with open(path, mode, encoding=encoding) as f:
        f.write(content)


def generate_packages():
    # 1. Minimal Multichoice Single
    write_file(os.path.join(PACKAGES_DIR, "minimal_multichoice_single.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Default/MultichoiceSingle</text></category>
  </question>
  <question type="multichoice">
    <name><text>MC Single Valid</text></name>
    <questiontext format="html"><text><![CDATA[<p>Was ist die Hauptstadt der Schweiz?</p>]]></text></questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html">
      <text><![CDATA[<p>Bern</p>]]></text>
      <feedback><text><![CDATA[<p>Richtig!</p>]]></text></feedback>
    </answer>
    <answer fraction="0" format="html">
      <text><![CDATA[<p>Zuerich</p>]]></text>
      <feedback><text><![CDATA[<p>Falsch, Zuerich ist die groesste Stadt, aber nicht die Bundesstadt.</p>]]></text></feedback>
    </answer>
    <answer fraction="0" format="html">
      <text><![CDATA[<p>Genf</p>]]></text>
      <feedback><text><![CDATA[<p>Falsch.</p>]]></text></feedback>
    </answer>
  </question>
</quiz>""")

    # 2. Minimal Multichoice Multiple
    write_file(os.path.join(PACKAGES_DIR, "minimal_multichoice_multiple.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Default/MultichoiceMultiple</text></category>
  </question>
  <question type="multichoice">
    <name><text>MC Multi Valid</text></name>
    <questiontext format="html"><text><![CDATA[<p>Welche der folgenden Staedte liegen in der Schweiz?</p>]]></text></questiontext>
    <single>false</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="50" format="html">
      <text><![CDATA[<p>Basel</p>]]></text>
    </answer>
    <answer fraction="50" format="html">
      <text><![CDATA[<p>Luzern</p>]]></text>
    </answer>
    <answer fraction="-50" format="html">
      <text><![CDATA[<p>Muenchen</p>]]></text>
    </answer>
  </question>
</quiz>""")

    # 3. Minimal True/False
    write_file(os.path.join(PACKAGES_DIR, "minimal_truefalse.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Default/TrueFalse</text></category>
  </question>
  <question type="truefalse">
    <name><text>TF Valid</text></name>
    <questiontext format="html"><text><![CDATA[<p>Der Mount Everest ist der hoechste Berg der Erde.</p>]]></text></questiontext>
    <answer fraction="100" format="html">
      <text>true</text>
      <feedback><text><![CDATA[<p>Korrekt!</p>]]></text></feedback>
    </answer>
    <answer fraction="0" format="html">
      <text>false</text>
      <feedback><text><![CDATA[<p>Falsch.</p>]]></text></feedback>
    </answer>
  </question>
</quiz>""")

    # 4. Minimal Short Answer
    write_file(os.path.join(PACKAGES_DIR, "minimal_shortanswer.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Default/ShortAnswer</text></category>
  </question>
  <question type="shortanswer">
    <name><text>SA Valid</text></name>
    <questiontext format="html"><text><![CDATA[<p>Welches chemische Element hat das Symbol Au?</p>]]></text></questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="plain_text">
      <text>Gold</text>
      <feedback><text><![CDATA[<p>Genau!</p>]]></text></feedback>
    </answer>
    <answer fraction="100" format="plain_text">
      <text>Aurum</text>
    </answer>
  </question>
</quiz>""")

    # 5. Minimal Numerical
    write_file(os.path.join(PACKAGES_DIR, "minimal_numerical.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Default/Numerical</text></category>
  </question>
  <question type="numerical">
    <name><text>NUM Valid</text></name>
    <questiontext format="html"><text><![CDATA[<p>Berechnen Sie die Kreiszahl Pi auf zwei Nachkommastellen gerundet.</p>]]></text></questiontext>
    <answer fraction="100">
      <text>3.14</text>
      <tolerance>0.01</tolerance>
      <tolerancetype>1</tolerancetype>
      <feedback><text><![CDATA[<p>Richtig!</p>]]></text></feedback>
    </answer>
  </question>
</quiz>""")

    # 6. Minimal Matching
    write_file(os.path.join(PACKAGES_DIR, "minimal_matching.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Default/Matching</text></category>
  </question>
  <question type="matching">
    <name><text>MATCH Valid</text></name>
    <questiontext format="html"><text><![CDATA[<p>Ordnen Sie die Kantone ihren Hauptorten zu:</p>]]></text></questiontext>
    <shuffleanswers>true</shuffleanswers>
    <subquestion format="html">
      <text><![CDATA[<p>Bern</p>]]></text>
      <answer><text>Bern</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Waadt</p>]]></text>
      <answer><text>Lausanne</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Tessin</p>]]></text>
      <answer><text>Bellinzona</text></answer>
    </subquestion>
  </question>
</quiz>""")

    # 7. Minimal Cloze (Multianswer)
    write_file(os.path.join(PACKAGES_DIR, "minimal_cloze.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Default/Cloze</text></category>
  </question>
  <question type="cloze">
    <name><text>CLOZE Valid</text></name>
    <questiontext format="html"><text><![CDATA[<p>Vervollstaendigen Sie: {1:SHORTANSWER:=Schweiz} ist ein Bundesstaat in {1:MULTICHOICE:=Europa~Asien~Afrika}.</p>]]></text></questiontext>
  </question>
</quiz>""")

    # 8. Minimal Essay
    write_file(os.path.join(PACKAGES_DIR, "minimal_essay.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Default/Essay</text></category>
  </question>
  <question type="essay">
    <name><text>ESSAY Valid</text></name>
    <questiontext format="html"><text><![CDATA[<p>Beschreiben Sie die Funktion des Schweizer Bundesrats.</p>]]></text></questiontext>
    <responseformat>editor</responseformat>
    <responserequired>1</responserequired>
    <responsefieldlines>15</responsefieldlines>
    <graderinfo format="html"><text><![CDATA[<p>Kriterien: Kollegialitaetsprinzip, 7 Mitglieder, Zauberformel.</p>]]></text></graderinfo>
  </question>
</quiz>""")

    # 9. Package with Embedded Media (PNG and SVG)
    write_file(os.path.join(PACKAGES_DIR, "package_with_embedded_media.xml"), f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Default/MediaTest</text></category>
  </question>
  <question type="multichoice">
    <name><text>MC With Embedded Images</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Betrachten Sie das folgende Diagramm:<br /><img src="@@PLUGINFILE@@/diagram.png" alt="Diagramm" /><br /><img src="@@PLUGINFILE@@/shape.svg" alt="Vektor" /></p>]]></text>
      <file name="diagram.png" encoding="base64">{TINY_PNG_B64}</file>
      <file name="shape.svg" encoding="base64">{VALID_SVG_B64}</file>
    </questiontext>
    <single>true</single>
    <answer fraction="100" format="html">
      <text><![CDATA[<p>Korrekt</p>]]></text>
    </answer>
    <answer fraction="0" format="html">
      <text><![CDATA[<p>Inkorrekt</p>]]></text>
    </answer>
  </question>
</quiz>""")

    # 10. Large Package Generator (500 questions)
    write_file(os.path.join(PACKAGES_DIR, "generator_large_package_500q.py"), """#!/usr/bin/env python3
def generate_500q(filename: str):
    with open(filename, 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\\n<quiz>\\n')
        f.write('  <question type="category">\\n    <category><text>$course$/top/StressTest500</text></category>\\n  </question>\\n')
        for i in range(1, 501):
            f.write(f'  <question type="multichoice">\\n    <name><text>Stress Question {i}</text></name>\\n    <questiontext format="html"><text><![CDATA[<p>Stress test item #{i}</p>]]></text></questiontext>\\n    <single>true</single>\\n    <answer fraction="100"><text>Richtig</text></answer>\\n    <answer fraction="0"><text>Falsch</text></answer>\\n  </question>\\n')
        f.write('</quiz>\\n')

if __name__ == '__main__':
    generate_500q('large_package_500q.xml')
""")


def generate_attacks():
    # 1. Classic XXE passwd
    write_file(os.path.join(ATTACKS_DIR, "xxe_file_disclosure_passwd.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE quiz [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<quiz>
  <question type="description">
    <name><text>XXE Passwd</text></name>
    <questiontext format="html"><text><![CDATA[<p>&xxe;</p>]]></text></questiontext>
  </question>
</quiz>""")

    # 2. XXE /etc/hosts
    write_file(os.path.join(ATTACKS_DIR, "xxe_file_disclosure_hosts.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE quiz [
  <!ENTITY xxe SYSTEM "file:///etc/hosts">
]>
<quiz>
  <question type="description">
    <name><text>XXE Hosts</text></name>
    <questiontext format="html"><text><![CDATA[<p>&xxe;</p>]]></text></questiontext>
  </question>
</quiz>""")

    # 3. SSRF AWS Metadata
    write_file(os.path.join(ATTACKS_DIR, "xxe_ssrf_aws_metadata.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE quiz [
  <!ENTITY ssrf SYSTEM "http://169.254.169.254/latest/meta-data/">
]>
<quiz>
  <question type="description">
    <name><text>SSRF AWS</text></name>
    <questiontext format="html"><text><![CDATA[<p>&ssrf;</p>]]></text></questiontext>
  </question>
</quiz>""")

    # 4. SSRF MariaDB 3306
    write_file(os.path.join(ATTACKS_DIR, "xxe_ssrf_mariadb_3306.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE quiz [
  <!ENTITY ssrf SYSTEM "http://127.0.0.1:3306/">
]>
<quiz>
  <question type="description">
    <name><text>SSRF MariaDB</text></name>
    <questiontext format="html"><text><![CDATA[<p>&ssrf;</p>]]></text></questiontext>
  </question>
</quiz>""")

    # 5. SSRF Marketplace 8090
    write_file(os.path.join(ATTACKS_DIR, "xxe_ssrf_marketplace_8090.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE quiz [
  <!ENTITY ssrf SYSTEM "http://127.0.0.1:8090/admin">
]>
<quiz>
  <question type="description">
    <name><text>SSRF Marketplace</text></name>
    <questiontext format="html"><text><![CDATA[<p>&ssrf;</p>]]></text></questiontext>
  </question>
</quiz>""")

    # 6. Billion Laughs
    write_file(os.path.join(ATTACKS_DIR, "xxe_billion_laughs.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE quiz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;">
  <!ENTITY lol4 "&lol3;&lol3;">
  <!ENTITY lol5 "&lol4;&lol4;">
  <!ENTITY lol6 "&lol5;&lol5;">
  <!ENTITY lol7 "&lol6;&lol6;">
  <!ENTITY lol8 "&lol7;&lol7;">
  <!ENTITY lol9 "&lol8;&lol8;">
]>
<quiz>
  <question type="description">
    <name><text>&lol9;</text></name>
    <questiontext format="html"><text>&lol9;</text></questiontext>
  </question>
</quiz>""")

    # 7. Quadratic Blowup
    write_file(os.path.join(ATTACKS_DIR, "xxe_quadratic_blowup.xml"), f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE quiz [
  <!ENTITY a "{'A' * 1000}">
  <!ENTITY bomb "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
]>
<quiz>
  <question type="description">
    <name><text>&bomb;</text></name>
  </question>
</quiz>""")

    # 8. Parameter Entity Probe
    write_file(os.path.join(ATTACKS_DIR, "xxe_parameter_entity.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE quiz [
  <!ENTITY % dtd SYSTEM "http://127.0.0.1:8090/evil.dtd">
  %dtd;
]>
<quiz>
  <question type="description"><name><text>T</text></name></question>
</quiz>""")

    # 9. External Public DTD
    write_file(os.path.join(ATTACKS_DIR, "xxe_public_dtd.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE quiz PUBLIC "-//OASIS//DTD DITA//EN" "http://127.0.0.1:8090/dita.dtd">
<quiz>
  <question type="description"><name><text>T</text></name></question>
</quiz>""")

    # 10. XInclude Injection
    write_file(os.path.join(ATTACKS_DIR, "xxe_xinclude_injection.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<quiz xmlns:xi="http://www.w3.org/2001/XInclude">
  <xi:include href="file:///etc/passwd" parse="text"/>
  <question type="description"><name><text>XInclude</text></name></question>
</quiz>""")

    # 11. XML Stylesheet Processing Instruction
    write_file(os.path.join(ATTACKS_DIR, "xxe_stylesheet_injection.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="http://127.0.0.1:8090/evil.xsl"?>
<quiz>
  <question type="description"><name><text>Stylesheet</text></name></question>
</quiz>""")

    # 12. Whitespace DOCTYPE
    write_file(os.path.join(ATTACKS_DIR, "xxe_whitespace_doctype.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<!   DOCTYPE   quiz [ <!   ENTITY   xxe SYSTEM "file:///etc/passwd"> ]>
<quiz>
  <question type="description"><name><text>&xxe;</text></name></question>
</quiz>""")

    # 13. Post-CDATA DOCTYPE
    write_file(os.path.join(ATTACKS_DIR, "xxe_post_cdata_doctype.xml"), """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description"><name><text><![CDATA[Safe]]></text></name></question>
</quiz>
<!DOCTYPE quiz [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>""")

    # 14. UTF-16LE BOM Payload
    utf16le_str = '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE quiz [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><quiz><question type="description"><name><text>&xxe;</text></name></question></quiz>'
    utf16le_bytes = b'\xff\xfe' + utf16le_str.encode('utf-16le')
    write_file(os.path.join(ATTACKS_DIR, "xxe_utf16le_bom.bin"), utf16le_bytes, binary=True)

    # 15. UTF-16BE BOM Payload
    utf16be_bytes = b'\xfe\xff' + utf16le_str.encode('utf-16be')
    write_file(os.path.join(ATTACKS_DIR, "xxe_utf16be_bom.bin"), utf16be_bytes, binary=True)

    # 16. Standalone Entity Declaration
    write_file(os.path.join(ATTACKS_DIR, "xxe_standalone_entity.xml"), """<?xml version="1.0"?>
<!ENTITY xxe "evil">
<quiz><question type="description"><name><text>&xxe;</text></name></question></quiz>""")

    # 17. Media Path Traversal Relative
    write_file(os.path.join(ATTACKS_DIR, "media_traversal_relative.xml"), f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>Traversal Probe</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Path traversal test</p>]]></text>
      <file name="../../etc/passwd" encoding="base64">{TINY_PNG_B64}</file>
    </questiontext>
  </question>
</quiz>""")

    # 18. Media Path Traversal Windows
    write_file(os.path.join(ATTACKS_DIR, "media_traversal_windows.xml"), f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>Windows Traversal</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Windows path traversal</p>]]></text>
      <file name="..\\..\\boot.ini" encoding="base64">{TINY_PNG_B64}</file>
    </questiontext>
  </question>
</quiz>""")

    # 19. Media Malicious SVG Script
    write_file(os.path.join(ATTACKS_DIR, "media_svg_script.xml"), f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>SVG Script</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Malicious SVG</p>]]></text>
      <file name="xss.svg" encoding="base64">{MALICIOUS_SVG_SCRIPT_B64}</file>
    </questiontext>
  </question>
</quiz>""")

    # 20. Media Malicious SVG Onload
    write_file(os.path.join(ATTACKS_DIR, "media_svg_onload.xml"), f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>SVG Onload</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Malicious SVG onload</p>]]></text>
      <file name="onload.svg" encoding="base64">{MALICIOUS_SVG_ONLOAD_B64}</file>
    </questiontext>
  </question>
</quiz>""")

    # 21. Media Disallowed PHP extension
    write_file(os.path.join(ATTACKS_DIR, "media_disallowed_php.xml"), f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>PHP Upload Probe</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Disallowed extension</p>]]></text>
      <file name="exploit.php" encoding="base64">{TINY_PNG_B64}</file>
    </questiontext>
  </question>
</quiz>""")


def generate_corrupted():
    # 1. Truncated tag
    write_file(os.path.join(CORRUPTED_DIR, "truncated_tag.xml"), """<?xml version="1.0"?><quiz><question type="multichoice"><name><text>Incom""")

    # 2. Truncated CDATA
    write_file(os.path.join(CORRUPTED_DIR, "truncated_cdata.xml"), """<?xml version="1.0"?><quiz><question type="essay"><questiontext><text><![CDATA[Unfinished""")

    # 3. Mismatched closing tag
    write_file(os.path.join(CORRUPTED_DIR, "mismatched_tags.xml"), """<quiz><question type="truefalse"><name><text>Q</text></question></name></quiz>""")

    # 4. Unclosed quiz root
    write_file(os.path.join(CORRUPTED_DIR, "unclosed_quiz_root.xml"), """<?xml version="1.0"?><quiz><question type="description"><name><text>T</text></name></question>""")

    # 5. Missing quiz root (<root>)
    write_file(os.path.join(CORRUPTED_DIR, "missing_quiz_root_root.xml"), """<?xml version="1.0"?><root><question type="description"><name><text>T</text></name></question></root>""")

    # 6. Missing quiz root (<questions>)
    write_file(os.path.join(CORRUPTED_DIR, "missing_quiz_root_questions.xml"), """<?xml version="1.0"?><questions><question type="description"><name><text>T</text></name></question></questions>""")

    # 7. Binary ELF Executable
    write_file(os.path.join(CORRUPTED_DIR, "binary_elf_executable.xml"), b"\x7FELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00\x3E\x00", binary=True)

    # 8. Binary PE Executable
    write_file(os.path.join(CORRUPTED_DIR, "binary_pe_executable.xml"), b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFF\x00\x00", binary=True)

    # 9. Non-XML JSON
    write_file(os.path.join(CORRUPTED_DIR, "non_xml_json.xml"), '{"quiz": {"questions": []}}')

    # 10. Non-XML HTML5
    write_file(os.path.join(CORRUPTED_DIR, "non_xml_html5.xml"), '<!DOCTYPE html><html><body><br><img></body></html>')

    # 11. Empty Payload (0 bytes)
    write_file(os.path.join(CORRUPTED_DIR, "empty_payload.xml"), "")

    # 12. Whitespace only
    write_file(os.path.join(CORRUPTED_DIR, "whitespace_only.xml"), "   \n\t  \n  ")

    # 13. Empty quiz tag
    write_file(os.path.join(CORRUPTED_DIR, "empty_quiz_tag.xml"), "<quiz></quiz>")

    # 14. Missing question type
    write_file(os.path.join(CORRUPTED_DIR, "missing_question_type.xml"), """<quiz><question><name><text>No Type</text></name></question></quiz>""")

    # 15. Corrupted Base64 media characters
    write_file(os.path.join(CORRUPTED_DIR, "media_corrupted_base64_chars.xml"), """<quiz><question type="description"><name><text>Bad B64</text></name><questiontext><file name="bad.png" encoding="base64">!@#$%^&amp;*()_+</file></questiontext></question></quiz>""")

    # 16. Cloze unmatched open brace
    write_file(os.path.join(CORRUPTED_DIR, "cloze_unmatched_open_brace.xml"), """<quiz><question type="cloze"><name><text>Bad Cloze</text></name><questiontext><text>Gegeben sei {1:SA:=answer ohne Ende</text></questiontext></question></quiz>""")

    # 17. Cloze unmatched close brace
    write_file(os.path.join(CORRUPTED_DIR, "cloze_unmatched_close_brace.xml"), """<quiz><question type="cloze"><name><text>Bad Cloze</text></name><questiontext><text>Gegeben sei 1:SA:=answer}</text></questiontext></question></quiz>""")

    # 18. Cloze malformed token
    write_file(os.path.join(CORRUPTED_DIR, "cloze_malformed_token.xml"), """<quiz><question type="cloze"><name><text>Bad Cloze</text></name><questiontext><text>Gegeben sei {1:INVALIDTOKEN:answer}</text></questiontext></question></quiz>""")


def sample_real_world_database():
    source_path = os.environ.get("QHUB_REAL_DB_XML", "")
    if not source_path or not os.path.exists(source_path):
        print("WARNING: QHUB_REAL_DB_XML not set or file missing, skipping real-world sample extraction.")
        return

    sample_out = os.path.join(PACKAGES_DIR, "real_world_dataset_sample.xml")
    target_counts = {
        "category": 1,
        "multichoice": 2,
        "shortanswer": 2,
        "numerical": 2,
        "matching": 2,
        "cloze": 2,
        "essay": 2,
        "truefalse": 2,
        "coderunner": 3,
        "stack": 2,
        "oumultiresponse": 1,
        "drawing": 1,
        "gapselect": 1,
    }
    collected = {k: 0 for k in target_counts}

    with open(source_path, "r", encoding="utf-8", errors="ignore") as f_in:
        with open(sample_out, "w", encoding="utf-8") as f_out:
            f_out.write('<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n')

            current_q = []
            in_q = False
            current_qtype = None

            for line in f_in:
                if "<question " in line:
                    in_q = True
                    current_q = [line]
                    if 'type="' in line:
                        current_qtype = line.split('type="')[1].split('"')[0]
                    else:
                        current_qtype = None
                    continue

                if in_q:
                    current_q.append(line)
                    if "</question>" in line:
                        in_q = False
                        if current_qtype in collected and collected[current_qtype] < target_counts[current_qtype]:
                            f_out.writelines(current_q)
                            collected[current_qtype] += 1
                        current_q = []
                        current_qtype = None

                        if all(collected[k] >= target_counts[k] for k in target_counts):
                            break

            f_out.write('</quiz>\n')

    print(f"Sampled real-world dataset to {sample_out}: {collected}")


if __name__ == "__main__":
    generate_packages()
    generate_attacks()
    generate_corrupted()
    sample_real_world_database()
    print("Fixtures generation completed successfully.")
