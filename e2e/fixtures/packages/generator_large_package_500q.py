#!/usr/bin/env python3
def generate_500q(filename: str):
    with open(filename, 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n')
        f.write('  <question type="category">\n    <category><text>$course$/top/StressTest500</text></category>\n  </question>\n')
        for i in range(1, 501):
            f.write(f'  <question type="multichoice">\n    <name><text>Stress Question {i}</text></name>\n    <questiontext format="html"><text><![CDATA[<p>Stress test item #{i}</p>]]></text></questiontext>\n    <single>true</single>\n    <answer fraction="100"><text>Richtig</text></answer>\n    <answer fraction="0"><text>Falsch</text></answer>\n  </question>\n')
        f.write('</quiz>\n')

if __name__ == '__main__':
    generate_500q('large_package_500q.xml')
