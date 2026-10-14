#!/usr/bin/env python3
"""
Generates the 5 Real-World Swiss Gymnasium Scenario XML packages for Tier 4:
1. scenario_cs_algorithms_25q.xml (Informatik GF, SEK II ZH - 25 Questions, all 7 types)
2. scenario_biology_20q.xml (Biologie SF, SEK II BE - 20 Questions, genetics & diagrams)
3. scenario_mathematics_18q.xml (Mathematik GF, SEK II AG - 18 Questions, calculus & tolerance)
4. scenario_chemistry_18q.xml (Chemie SF, SEK II LU - 18 Questions, equilibrium & titration)
5. scenario_physics_16q.xml (Physik EF, SEK II SG - 16 Questions, mechanics & diagnostics)

Complies strictly with Swiss Standard German spelling ("ss", zero "ß").
"""

import os
import base64

PACKAGES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "fixtures", "packages"))
os.makedirs(PACKAGES_DIR, exist_ok=True)

# 1x1 transparent PNG as placeholder media
TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

# Binary tree SVG
BINARY_TREE_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <circle cx="150" cy="40" r="20" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>
  <text x="150" y="46" font-family="sans-serif" font-size="14" fill="#ffffff" text-anchor="middle">10</text>
  <line x1="135" y1="54" x2="85" y2="86" stroke="#64748b" stroke-width="2"/>
  <line x1="165" y1="54" x2="215" y2="86" stroke="#64748b" stroke-width="2"/>
  <circle cx="70" cy="100" r="20" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>
  <text x="70" y="106" font-family="sans-serif" font-size="14" fill="#ffffff" text-anchor="middle">5</text>
  <circle cx="230" cy="100" r="20" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>
  <text x="230" y="106" font-family="sans-serif" font-size="14" fill="#ffffff" text-anchor="middle">15</text>
</svg>'''
BINARY_TREE_SVG_B64 = base64.b64encode(BINARY_TREE_SVG.encode("utf-8")).decode("utf-8")

# Titration SVG
TITRATION_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <line x1="40" y1="170" x2="280" y2="170" stroke="#333333" stroke-width="2"/>
  <line x1="40" y1="170" x2="40" y2="20" stroke="#333333" stroke-width="2"/>
  <path d="M 40 150 Q 140 145 160 95 T 280 40" fill="none" stroke="#2563eb" stroke-width="3"/>
  <circle cx="160" cy="95" r="4" fill="#ef4444"/>
  <text x="170" y="98" font-family="sans-serif" font-size="11" fill="#ef4444">Aequivalenzpunkt (pH 8.7)</text>
</svg>'''
TITRATION_SVG_B64 = base64.b64encode(TITRATION_SVG.encode("utf-8")).decode("utf-8")


def generate_scenario_cs():
    """Scenario 1: Informatik GF (SEK II ZH) - 25 Questions, all 7 types."""
    path = os.path.join(PACKAGES_DIR, "scenario_cs_algorithms_25q.xml")
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Gymnasium_ZH/Informatik_GF/Algorithmen_und_Datenstrukturen</text></category>
  </question>

  <!-- 1. MC Single: Best-case time complexity of Quicksort -->
  <question type="multichoice">
    <name><text>CS_Q01_Quicksort_BestCase</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche asymptotische Laufzeitkomplexitaet besitzt der Quicksort-Algorithmus im besten Fall (Best-Case)?</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>O(n log n)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>O(n^2)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>O(n)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>O(log n)</p>]]></text></answer>
  </question>

  <!-- 2. MC Single: BST Invariant with Embedded SVG Diagram -->
  <question type="multichoice">
    <name><text>CS_Q02_BST_Invariant</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Betrachten Sie den folgenden binaeren Suchbaum:<br/><img src="@@PLUGINFILE@@/binary_tree.svg" alt="Binaerbaum" /><br/>Welche Invariante muss fuer jeden Knoten k eines binaeren Suchbaums stets erfuellt sein?</p>]]></text>
      <file name="binary_tree.svg" encoding="base64">__SVG_TREE__</file>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>Alle Schluessel im linken Teilbaum sind kleiner als der Schluessel von k, alle im rechten groesser.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Der Baum muss auf allen Ebenen vollstaendig gefuellt sein.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Die Hoehe des linken Teilbaums ist stets gleich der des rechten Teilbaums.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Jeder Knoten besitzt genau zwei Kindknoten.</p>]]></text></answer>
  </question>

  <!-- 3. MC Multi: Stable sorting algorithms -->
  <question type="multichoice">
    <name><text>CS_Q03_Stabile_Sortieralgorithmen</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche der folgenden Sortieralgorithmen sind in ihrer Standardimplementierung stabil? (Waehlen Sie alle zutreffenden Optionen)</p>]]></text>
    </questiontext>
    <single>false</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="50" format="html"><text><![CDATA[<p>Mergesort</p>]]></text></answer>
    <answer fraction="50" format="html"><text><![CDATA[<p>Insertion Sort</p>]]></text></answer>
    <answer fraction="-50" format="html"><text><![CDATA[<p>Heapsort</p>]]></text></answer>
    <answer fraction="-50" format="html"><text><![CDATA[<p>Standard Quicksort</p>]]></text></answer>
  </question>

  <!-- 4. MC Single: Array Lookup -->
  <question type="multichoice">
    <name><text>CS_Q04_Array_Lookup_Komplexitaet</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche Laufzeitkomplexitaet hat der wahlfreie Zugriff auf ein Element ueber seinen Index in einem zusammenhaengenden statischen Array?</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>O(1)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>O(log n)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>O(n)</p>]]></text></answer>
  </question>

  <!-- 5. MC Multi: Tree Traversals -->
  <question type="multichoice">
    <name><text>CS_Q05_Traversierungsarten</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche der folgenden Traversierungsarten sind Tiefentraversierungen (Depth-First) bei Baeumen?</p>]]></text>
    </questiontext>
    <single>false</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="33.33333" format="html"><text><![CDATA[<p>Preorder</p>]]></text></answer>
    <answer fraction="33.33333" format="html"><text><![CDATA[<p>Inorder</p>]]></text></answer>
    <answer fraction="33.33334" format="html"><text><![CDATA[<p>Postorder</p>]]></text></answer>
    <answer fraction="-50" format="html"><text><![CDATA[<p>Level-Order (Breitensuche)</p>]]></text></answer>
  </question>

  <!-- 6. TF: Max height of binary tree -->
  <question type="truefalse">
    <name><text>CS_Q06_Binaerbaum_Maximale_Hoehe</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ein binaerer Baum mit n Knoten besitzt eine maximale Hoehe von n (wenn jeder Knoten maximal ein Kind hat und der Baum zu einer linearen Kette entartet).</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 7. TF: Bubble Sort average runtime -->
  <question type="truefalse">
    <name><text>CS_Q07_Bubblesort_Average_Komplexitaet</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Bubble Sort besitzt im durchschnittlichen Fall (Average-Case) eine asymptotische Laufzeit von O(n log n).</p>]]></text>
    </questiontext>
    <answer fraction="0" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 8. TF: Min-Heap Root -->
  <question type="truefalse">
    <name><text>CS_Q08_Min_Heap_Wurzeleigenschaft</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>In einem Min-Heap enthaelt der Wurzelknoten stets das kleinste Element aller im Heap gespeicherten Werte.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 9. SA: Inorder Traversal BST -->
  <question type="shortanswer">
    <name><text>CS_Q09_Inorder_Reihenfolge</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>In welcher Reihenfolge liefert die Inorder-Traversierung die Werte eines binaeren Suchbaums? Geben Sie das deutsche Adjektiv an (z. B. aufsteigend).</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>aufsteigend</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>sortiert</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>monoton steigend</text></answer>
  </question>

  <!-- 10. SA: Python Base Case Keyword -->
  <question type="shortanswer">
    <name><text>CS_Q10_Rekursion_Basisfall_Keyword</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welches Schluesselwort leitet in Python typischerweise die Rueckgabe des Werts im Basisfall einer rekursiven Funktion ein?</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>return</text></answer>
  </question>

  <!-- 11. SA: Divide and Conquer sorting algorithm -->
  <question type="shortanswer">
    <name><text>CS_Q11_Divide_Conquer_Algorithmus</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie heisst der Sortieralgorithmus, der das Array wiederholt in zwei Haelften teilt, diese rekursiv sortiert und anschliessend verschmilzt?</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>Mergesort</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>Merge Sort</text></answer>
  </question>

  <!-- 12. SA: Leaf node -->
  <question type="shortanswer">
    <name><text>CS_Q12_Baumknoten_Ohne_Kinder</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie nennt man in der Graphentheorie und Datenstrukturlehre einen Baumknoten, der keine Kindknoten besitzt?</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>Blatt</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>Leaf</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>Blattknoten</text></answer>
  </question>

  <!-- 13. NUM: Complete binary tree max nodes -->
  <question type="numerical">
    <name><text>CS_Q13_Knotenanzahl_Hoehe_4</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie viele Knoten besitzt ein vollstaendiger binaerer Baum maximal bei einer Hoehe von h = 4 (Wurzel besitzt Hoehe 0)? Formel: 2^(h+1) - 1.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>31</text>
      <tolerance>0</tolerance>
    </answer>
  </question>

  <!-- 14. NUM: Binary search comparisons -->
  <question type="numerical">
    <name><text>CS_Q14_Binaere_Suche_Vergleiche</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie viele Schluesselvergleiche fuehrt die binaere Suche auf einem sortierten Array mit 128 Elementen im unguenstigsten Fall hoechstens durch? (log2(128) + 1)</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>8</text>
      <tolerance>0</tolerance>
    </answer>
  </question>

  <!-- 15. NUM: Selection sort swaps -->
  <question type="numerical">
    <name><text>CS_Q15_Selection_Sort_Tausche</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie viele Vertauschungen (Swaps) von Elementen fuehrt Selection Sort auf einem Array mit 10 Elementen im unguenstigsten Fall maximal durch?</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>9</text>
      <tolerance>0</tolerance>
    </answer>
  </question>

  <!-- 16. NUM: Min height BST 15 nodes -->
  <question type="numerical">
    <name><text>CS_Q16_Minimale_Hoehe_BST_15</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche minimale Hoehe hat ein balancierter binaerer Suchbaum mit genau n = 15 Knoten (Wurzel hat Hoehe 0)?</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>3</text>
      <tolerance>0</tolerance>
    </answer>
  </question>

  <!-- 17. MATCH: Sorting algorithms to worst-case complexity -->
  <question type="matching">
    <name><text>CS_Q17_Sortieralgorithmen_Komplexitaet_Zuordnung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ordnen Sie die Sortieralgorithmen ihrer Worst-Case-Laufzeitkomplexitaet zu:</p>]]></text>
    </questiontext>
    <subquestion format="html">
      <text><![CDATA[<p>Quicksort</p>]]></text>
      <answer><text>O(n^2)</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Mergesort</p>]]></text>
      <answer><text>O(n log n)</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Bubble Sort</p>]]></text>
      <answer><text>O(n^2)</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Heapsort</p>]]></text>
      <answer><text>O(n log n)</text></answer>
    </subquestion>
  </question>

  <!-- 18. MATCH: Data structure memory nature -->
  <question type="matching">
    <name><text>CS_Q18_Datenstrukturen_Speicherlayout</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ordnen Sie die Datenstrukturen ihrem Speicherlayout im Arbeitsspeicher zu:</p>]]></text>
    </questiontext>
    <subquestion format="html">
      <text><![CDATA[<p>Statisches Array</p>]]></text>
      <answer><text>Feste Groesse im zusammenhaengenden Speicher</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Verkettete Liste</p>]]></text>
      <answer><text>Dynamische Knoten mit Zeigern und Referenzen</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Binaerbaum</p>]]></text>
      <answer><text>Nicht-lineare hierarchische Verzeigerung</text></answer>
    </subquestion>
  </question>

  <!-- 19. MATCH: Tree traversal visit order -->
  <question type="matching">
    <name><text>CS_Q19_Traversierungsreihenfolge_Zuordnung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ordnen Sie der Traversierungsart die korrekte Besuchsreihenfolge zu:</p>]]></text>
    </questiontext>
    <subquestion format="html">
      <text><![CDATA[<p>Preorder</p>]]></text>
      <answer><text>Wurzel, Links, Rechts</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Inorder</p>]]></text>
      <answer><text>Links, Wurzel, Rechts</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Postorder</p>]]></text>
      <answer><text>Links, Rechts, Wurzel</text></answer>
    </subquestion>
  </question>

  <!-- 20. CLOZE: Binary Search Python Code -->
  <question type="cloze">
    <name><text>CS_Q20_Binaere_Suche_Code_Lueckentext</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ergaenzen Sie die Schluesselstellen des binaeren Suchalgorithmus in Python:<br/>
<code>
def binary_search(arr, target):<br/>
&nbsp;&nbsp;&nbsp;&nbsp;low = 0<br/>
&nbsp;&nbsp;&nbsp;&nbsp;high = len(arr) - 1<br/>
&nbsp;&nbsp;&nbsp;&nbsp;while low &lt;= high:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;mid = {1:SA:=(low + high) // 2~=(high + low) // 2}<br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;if arr[mid] == target:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{1:MC:=return mid~return True~return low}<br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;elif arr[mid] &lt; target:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;low = mid + 1<br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;else:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;high = mid - 1<br/>
&nbsp;&nbsp;&nbsp;&nbsp;return -1
</code>
</p>]]></text>
    </questiontext>
  </question>

  <!-- 21. CLOZE: Factorial recursion -->
  <question type="cloze">
    <name><text>CS_Q21_Fakultaet_Rekursion_Lueckentext</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Vervollstaendigen Sie die rekursive Fakultaetsfunktion:<br/>
<code>
def fak(n):<br/>
&nbsp;&nbsp;&nbsp;&nbsp;if n &lt;= {1:NUMERICAL:=1:0}:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;return {1:NUMERICAL:=1:0}<br/>
&nbsp;&nbsp;&nbsp;&nbsp;else:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;return n * fak({1:SA:=n - 1~n-1})
</code>
</p>]]></text>
    </questiontext>
  </question>

  <!-- 22. CLOZE: Big-O Complexity Classification -->
  <question type="cloze">
    <name><text>CS_Q22_Komplexitaet_Klassifikation_Lueckentext</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Klassifizieren Sie die durchschnittlichen Laufzeiten:<br/>
Lineare Suche im unsortierten Array: {1:MC:=O(n)~O(log n)~O(1)}<br/>
Binaere Suche im sortierten Array: {1:MC:=O(log n)~O(n)~O(n^2)}<br/>
Quicksort im Average-Case: {1:MC:=O(n log n)~O(n^2)~O(n)}
</p>]]></text>
    </questiontext>
  </question>

  <!-- 23. ESSAY: Singly linked list reversal -->
  <question type="essay">
    <name><text>CS_Q23_Verkettete_Liste_Umkehren</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Entwerfen Sie einen Algorithmus (in Pseudocode oder Python) zum iterativen Umkehren einer einfach verketteten Liste. Der Algorithmus muss in O(n) Zeit und O(1) zusaetzlichem Speicherplatz arbeiten. Erklaeren Sie die Funktionsweise Ihrer Zeigermutationen.</p>]]></text>
    </questiontext>
    <responseformat>editor</responseformat>
    <responserequired>1</responserequired>
    <responsefieldlines>15</responsefieldlines>
    <graderinfo format="html">
      <text><![CDATA[<p>Bewertungskriterien:<br/>
1. Korrekte Initialisierung von prev = None, current = head (30%).<br/>
2. Korrekte Zeigerumlenkung current.next = prev unter Erhalt von next_node = current.next (40%).<br/>
3. Rueckgabe des neuen Kopfknotens (prev) und Zeit/Speicherkomplexitaet O(n)/O(1) (30%).</p>]]></text>
    </graderinfo>
  </question>

  <!-- 24. ESSAY: Array vs Linked Queue -->
  <question type="essay">
    <name><text>CS_Q24_Warteschlange_Implementierungsvergleich</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Vergleichen Sie die Vor- und Nachteile von Array-basierten (Ringpuffer) versus einfach verketteten Listen-Implementierungen fuer eine Warteschlange (Queue FIFO). Gehen Sie auf Speicheroverhead, Cache-Lokalitaet und dynamische Groessenaenderung ein.</p>]]></text>
    </questiontext>
    <responseformat>editor</responseformat>
    <responserequired>1</responserequired>
    <responsefieldlines>12</responsefieldlines>
    <graderinfo format="html">
      <text><![CDATA[<p>Kriterien: Ringpuffer hat exzellente Cache-Lokalitaet und minimalen Overhead pro Element, aber feste Groesse. Verkettete Liste waechst dynamisch ohne Reallokation, hat aber Zeigeroverhead und Cache-Misses.</p>]]></text>
    </graderinfo>
  </question>

  <!-- 25. ESSAY: Divide and Conquer in Mergesort -->
  <question type="essay">
    <name><text>CS_Q25_Divide_and_Conquer_Prinzip</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Erlaeutern Sie das Prinzip von Divide-and-Conquer anhand des Mergesort-Algorithmus. Beschreiben Sie praezise die drei Phasen: Teilen (Divide), Beherrschen (Conquer) und Verschmelzen (Combine).</p>]]></text>
    </questiontext>
    <responseformat>editor</responseformat>
    <responserequired>1</responserequired>
    <responsefieldlines>12</responsefieldlines>
    <graderinfo format="html">
      <text><![CDATA[<p>Divide: Array in der Mitte halbieren O(1). Conquer: Beide Teilarrays rekursiv sortieren. Combine: Die zwei sortierten Teillisten in O(n) durch 2-Zeiger-Verfahren zusammenfuegen.</p>]]></text>
    </graderinfo>
  </question>
</quiz>""".replace("__SVG_TREE__", BINARY_TREE_SVG_B64)
    with open(path, "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"Generated {path} (25 questions, 7 types)")


def generate_scenario_bio():
    """Scenario 2: Biologie SF (SEK II BE) - 20 Questions, genetics & diagrams."""
    path = os.path.join(PACKAGES_DIR, "scenario_biology_20q.xml")
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Gymnasium_BE/Biologie_SF/Molekulargenetik_und_Zellbiologie</text></category>
  </question>

  <!-- 1. MC Single: Base pairing in DNA with diagram -->
  <question type="multichoice">
    <name><text>BIO_Q01_DNA_Basenpaarung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Betrachten Sie die Abbildung der DNA-Doppelhelix:<br/><img src="@@PLUGINFILE@@/dna_replication.png" alt="DNA Doppelhelix" /><br/>Welche Basenpaarung ist komplementaer und ueber wie viele Wasserstoffbrueckenbindungen verknuepft?</p>]]></text>
      <file name="dna_replication.png" encoding="base64">__PNG_MEDIA__</file>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>Adenin paart mit Thymin ueber 2 Wasserstoffbrueckenbindungen.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Guanin paart mit Cytosin ueber 2 Wasserstoffbrueckenbindungen.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Adenin paart mit Uracil in der DNA ueber 3 Wasserstoffbrueckenbindungen.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Cytosin paart mit Thymin ueber 3 Wasserstoffbrueckenbindungen.</p>]]></text></answer>
  </question>

  <!-- 2. MC Single: Start codon -->
  <question type="multichoice">
    <name><text>BIO_Q02_Startcodon_Translation</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welches Codon fungiert bei Eukaryoten als Standard-Startcodon fuer die Translation und fuer welche Aminosaeure codiert es?</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>AUG (Methionin)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>UAA (Stopcodon)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>UAG (Leucin)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>GUG (Valin)</p>]]></text></answer>
  </question>

  <!-- 3. MC Multi: Enzymes in replication -->
  <question type="multichoice">
    <name><text>BIO_Q03_Replikationsenzyme</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche der folgenden Enzyme sind direkt an der semikonservativen Replikation der DNA beteiligt? (Waehlen Sie alle zutreffenden Enzyme)</p>]]></text>
    </questiontext>
    <single>false</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="33.33333" format="html"><text><![CDATA[<p>Helikase</p>]]></text></answer>
    <answer fraction="33.33333" format="html"><text><![CDATA[<p>DNA-Polymerase</p>]]></text></answer>
    <answer fraction="33.33334" format="html"><text><![CDATA[<p>DNA-Ligase</p>]]></text></answer>
    <answer fraction="-50" format="html"><text><![CDATA[<p>Ribulose-1,5-bisphosphat-carboxylase (Rubisco)</p>]]></text></answer>
  </question>

  <!-- 4. MC Single: Golgi apparatus function -->
  <question type="multichoice">
    <name><text>BIO_Q04_Golgi_Apparat_Funktion</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche Hauptfunktion erfuellt der Golgi-Apparat in eukaryotischen Zellen?</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>Modifikation, Sortierung und Verpackung von Proteinen fuer den Transport.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Synthese von ATP ueber oxidative Phosphorylierung.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Synthese ribosomaler RNA im Zellkern.</p>]]></text></answer>
  </question>

  <!-- 5. TF: RNA contains Uracil -->
  <question type="truefalse">
    <name><text>BIO_Q05_RNA_Uracil_Vorkommen</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Die Ribonukleinsaeure (RNA) enthaelt anstelle der Pyrimidinbase Thymin die Base Uracil.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 6. TF: Leading strand replication -->
  <question type="truefalse">
    <name><text>BIO_Q06_Leitstrang_Syntheserichtung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Der Leitstrang (Leading Strand) wird waehrend der DNA-Replikation diskontinuierlich ueber Okazaki-Fragmente synthetisiert.</p>]]></text>
    </questiontext>
    <answer fraction="0" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 7. TF: Mitochondria circular DNA -->
  <question type="truefalse">
    <name><text>BIO_Q07_Mitochondrien_Eigene_DNA</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Mitochondrien besitzen eine eigene, zirkulaere DNA und 70S-Ribosomen, was die Endosymbiontentheorie stuetzt.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 8. SA: Enzyme unzipping DNA -->
  <question type="shortanswer">
    <name><text>BIO_Q08_DNA_Entwindungsenzym</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welches Enzym trennt die Wasserstoffbrueckenbindungen zwischen den komplementaeren Basenpaaren und oeffnet die Replikationsgabel?</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>Helikase</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>DNA-Helikase</text></answer>
  </question>

  <!-- 9. SA: Non-coding intervening sequences -->
  <question type="shortanswer">
    <name><text>BIO_Q09_Nichtcodierende_Spleisssequenzen</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie nennt man die nicht-codierenden Abschnitte der prae-mRNA, die beim Spleissen herausgeschnitten werden?</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>Introns</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>Intron</text></answer>
  </question>

  <!-- 10. SA: Aerobic ATP synthesis organelle -->
  <question type="shortanswer">
    <name><text>BIO_Q10_Kraftwerk_Der_Zelle</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welches Organell wird aufgrund der oxidativen Phosphorylierung und aeroben ATP-Synthese als Kraftwerk der Zelle bezeichnet?</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>Mitochondrium</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>Mitochondrien</text></answer>
  </question>

  <!-- 11. NUM: Chargaff rule calculation -->
  <question type="numerical">
    <name><text>BIO_Q11_Chargaff_Regel_Berechnung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ein doppelstraengiger DNA-Abschnitt enthaelt 30% Cytosin. Wie hoch ist der prozentuale Anteil von Thymin nach den Chargaff-Regeln? (in Prozent)</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>20</text>
      <tolerance>0</tolerance>
    </answer>
  </question>

  <!-- 12. NUM: Codon length -->
  <question type="numerical">
    <name><text>BIO_Q12_Basen_Pro_Codon</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Aus wie vielen Nukleotidbasen besteht ein einzelnes Codon des genetischen Codes?</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>3</text>
      <tolerance>0</tolerance>
    </answer>
  </question>

  <!-- 13. NUM: Human gamete chromosomes -->
  <question type="numerical">
    <name><text>BIO_Q13_Menschliche_Keimzelle_Chromosomen</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie viele Chromosomen enthaelt eine gesunde menschliche haploide Keimzelle (Spermium oder Eizelle)?</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>23</text>
      <tolerance>0</tolerance>
    </answer>
  </question>

  <!-- 14. MATCH: Organelles to function -->
  <question type="matching">
    <name><text>BIO_Q14_Zellorganellen_Funktion_Zuordnung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ordnen Sie die Zellorganellen ihrer Stoffwechselfunktion zu:</p>]]></text>
    </questiontext>
    <subquestion format="html">
      <text><![CDATA[<p>Ribosom</p>]]></text>
      <answer><text>Translation der mRNA in Polypeptide</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Mitochondrium</p>]]></text>
      <answer><text>Zellatmung und ATP-Synthese</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Endoplasmatisches Retikulum</p>]]></text>
      <answer><text>Lipidsynthese und Proteinfaltung</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Chloroplast</p>]]></text>
      <answer><text>Photosynthese und Glukosebildung</text></answer>
    </subquestion>
  </question>

  <!-- 15. MATCH: RNA types to roles -->
  <question type="matching">
    <name><text>BIO_Q15_RNA_Typen_Aufgaben_Zuordnung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ordnen Sie die RNA-Typen ihren biologischen Aufgaben zu:</p>]]></text>
    </questiontext>
    <subquestion format="html">
      <text><![CDATA[<p>mRNA</p>]]></text>
      <answer><text>Traeger der genetischen Information vom Zellkern zum Ribosom</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>tRNA</p>]]></text>
      <answer><text>Transport spezifischer Aminosaeuren zum Ribosom</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>rRNA</p>]]></text>
      <answer><text>Struktureller und katalytischer Bestandteil der Ribosomen</text></answer>
    </subquestion>
  </question>

  <!-- 16. MATCH: Mutation types to consequences -->
  <question type="matching">
    <name><text>BIO_Q16_Mutationstypen_Konsequenz_Zuordnung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ordnen Sie den Punktmutationstyp seiner molekularen Konsequenz zu:</p>]]></text>
    </questiontext>
    <subquestion format="html">
      <text><![CDATA[<p>Stumme Mutation</p>]]></text>
      <answer><text>Keine Aenderung der Aminosaeuresequenz</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Missense-Mutation</p>]]></text>
      <answer><text>Einbau einer anderen Aminosaeure</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Nonsense-Mutation</p>]]></text>
      <answer><text>Vorzeitiges Stopcodon und Kettenabbruch</text></answer>
    </subquestion>
  </question>

  <!-- 17. CLOZE: Protein synthesis translation pathway -->
  <question type="cloze">
    <name><text>BIO_Q17_Proteinsynthese_Ablauf_Lueckentext</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Vervollstaendigen Sie die Schritte der eukaryotischen Proteinbiosynthese:<br/>
Die Transkription findet im {1:MC:=Zellkern~Zytoplasma~Ribosom} statt.<br/>
Das Enzym {1:SA:=RNA-Polymerase} synthetisiert die mRNA von 5' nach 3'.<br/>
An den {1:MC:=Ribosomen~Mitochondrien} bindet die tRNA mit ihrem passenden {1:SA:=Anticodon} an das Codon der mRNA.
</p>]]></text>
    </questiontext>
  </question>

  <!-- 18. CLOZE: Replication fork -->
  <question type="cloze">
    <name><text>BIO_Q18_Replikationsgabel_Lueckentext</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Replikationsmechanismus am Doppelstrang:<br/>
Der Leitstrang wird {1:MC:=kontinuierlich~diskontinuierlich} synthetisiert.<br/>
Der Folgestrang benoetigt {1:SA:=Okazaki-Fragmente~Okazakifragmente}, welche anschliessend durch die {1:SA:=Ligase~DNA-Ligase} kovalent verknuepft werden.
</p>]]></text>
    </questiontext>
  </question>

  <!-- 19. CLOZE: Mitosis phases ordering -->
  <question type="cloze">
    <name><text>BIO_Q19_Mitose_Phasen_Lueckentext</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Geben Sie die korrekte Reihenfolge der vier Kernteilungsphasen der Mitose an:<br/>
1. Prophase<br/>
2. {1:SA:=Metaphase}<br/>
3. {1:SA:=Anaphase}<br/>
4. {1:SA:=Telophase}
</p>]]></text>
    </questiontext>
  </question>

  <!-- 20. ESSAY: Endosymbiont theory -->
  <question type="essay">
    <name><text>BIO_Q20_Endosymbiontentheorie_Beweise</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Erlaeutern Sie die Endosymbiontentheorie zur evolutionaeren Entstehung von Mitochondrien und Chloroplasten in eukaryotischen Zellen. Nennen Sie mindestens drei unabhaengige zellbiologische Belege fuer diese Theorie.</p>]]></text>
    </questiontext>
    <responseformat>editor</responseformat>
    <responserequired>1</responserequired>
    <responsefieldlines>15</responsefieldlines>
    <graderinfo format="html">
      <text><![CDATA[<p>Kriterien:<br/>
1. Erklaerung der Phagozytose eines aeroben alpha-Proteobakteriums bzw. Cyanobakteriums durch Urkaryoten ohne Verdauung (Symbiose) (40%).<br/>
2. Nennung von mindestens 3 Belegen: Doppelmembran, eigene zirkulaere DNA, 70S-Ribosomen, Vermehrung durch Zweiteilung (60%).</p>]]></text>
    </graderinfo>
  </question>
</quiz>""".replace("__PNG_MEDIA__", TINY_PNG_B64)
    with open(path, "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"Generated {path} (20 questions, genetics & diagrams)")


def generate_scenario_math():
    """Scenario 3: Mathematik GF (SEK II AG) - 18 Questions, calculus & tolerance."""
    path = os.path.join(PACKAGES_DIR, "scenario_mathematics_18q.xml")
    xml = r"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Gymnasium_AG/Mathematik_GF/Differential_und_Integralrechnung</text></category>
  </question>

  <!-- 1. NUM: Area under sin(x) in [0, pi] -->
  <question type="numerical">
    <name><text>MATH_Q01_Integral_Sinus_Flaeche</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Berechnen Sie den Flaecheninhalt der Flaeche, die vom Graphen \( f(x) = \sin(x) \) und der \( x \)-Achse im Intervall \( [0, \pi] \) eingeschlossen wird. \( \int_0^\pi \sin(x) dx = [-\cos(x)]_0^\pi = -(-1) - (-1) = 2.0 \).</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>2.0</text>
      <tolerance>0.05</tolerance>
    </answer>
  </question>

  <!-- 2. NUM: Tangent slope -->
  <question type="numerical">
    <name><text>MATH_Q02_Tangentensteigung_Exp</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Bestimmen Sie die Steigung der Tangente an den Graphen von \( f(x) = e^{-0.5 x^2} \) an der Stelle \( x = 1 \). Es gilt \( f'(1) = -1 \cdot e^{-0.5} \approx -0.6065 \).</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>-0.6065</text>
      <tolerance>0.01</tolerance>
    </answer>
  </question>

  <!-- 3. NUM: Integral 1/x from 1 to 3 -->
  <question type="numerical">
    <name><text>MATH_Q03_Bestimmtes_Integral_Kehrwert</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Berechnen Sie den numerischen Wert des Integrals \( \int_1^3 \frac{1}{x} dx = \ln(3) \).</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>1.0986</text>
      <tolerance>0.02</tolerance>
    </answer>
  </question>

  <!-- 4. NUM: Volume of revolution -->
  <question type="numerical">
    <name><text>MATH_Q04_Rotationskoerper_Volumen</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Berechnen Sie das Volumen des Rotationskoerpers bei Rotation von \( f(x) = \sqrt{x} \) um die \( x \)-Achse im Intervall \( [0, 2] \): \( V = \pi \int_0^2 x dx = \pi \left[ \frac{x^2}{2} \right]_0^2 = 2\pi \approx 6.283 \).</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>6.283</text>
      <tolerance>0.05</tolerance>
    </answer>
  </question>

  <!-- 5. MC Single: Product rule derivative -->
  <question type="multichoice">
    <name><text>MATH_Q05_Ableitung_Produktregel</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche Funktion entspricht der ersten Ableitung von \( f(x) = x^2 \cdot \ln(x) \) fuer \( x &gt; 0 \)?</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>\( 2x \ln(x) + x \)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>\( 2x \cdot \frac{1}{x} = 2 \)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>\( 2x \ln(x) + 2x \)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>\( x^2 \ln(x) + x \)</p>]]></text></answer>
  </question>

  <!-- 6. MC Single: Limit sin(x)/x -->
  <question type="multichoice">
    <name><text>MATH_Q06_Grenzwert_Sinus_LHopital</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welcher Grenzwert ergibt sich fuer \( \lim_{x \to 0} \frac{\sin(x)}{x} \)?</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>\( 1 \)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>\( 0 \)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>\( \infty \)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Der Grenzwert existiert nicht.</p>]]></text></answer>
  </question>

  <!-- 7. MC Multi: Extremum conditions -->
  <question type="multichoice">
    <name><text>MATH_Q07_Extremum_Bedingungen</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche Bedingungen sichern hinreichend ein striktes lokales Maximum an der Stelle \( x_0 \) fuer eine zweimal stetig differenzierbare Funktion \( f \)?</p>]]></text>
    </questiontext>
    <single>false</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="50" format="html"><text><![CDATA[<p>\( f'(x_0) = 0 \)</p>]]></text></answer>
    <answer fraction="50" format="html"><text><![CDATA[<p>\( f''(x_0) &lt; 0 \)</p>]]></text></answer>
    <answer fraction="-50" format="html"><text><![CDATA[<p>\( f''(x_0) &gt; 0 \)</p>]]></text></answer>
  </question>

  <!-- 8. MC Single: Antiderivative e^(2x) -->
  <question type="multichoice">
    <name><text>MATH_Q08_Stammfunktion_Exp</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Geben Sie die allgemeine Stammfunktion von \( g(x) = e^{2x} \) an:</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>\( \frac{1}{2} e^{2x} + C \)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>\( 2 e^{2x} + C \)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>\( e^{2x} + C \)</p>]]></text></answer>
  </question>

  <!-- 9. TF: Differentiable implies continuous -->
  <question type="truefalse">
    <name><text>MATH_Q09_Differenzierbarkeit_Impliziert_Stetigkeit</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Jede an einer Stelle \( x_0 \) differenzierbare reelle Funktion ist an dieser Stelle auch stetig.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 10. TF: f'(x0) = 0 implies extremum -->
  <question type="truefalse">
    <name><text>MATH_Q10_Notwendige_Bedingung_Extremum</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wenn fuer eine differenzierbare Funktion \( f'(x_0) = 0 \) gilt, liegt an der Stelle \( x_0 \) garantiert ein lokales Extremum vor.</p>]]></text>
    </questiontext>
    <answer fraction="0" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 11. TF: Definite integral linear transformation -->
  <question type="truefalse">
    <name><text>MATH_Q11_Integral_Linearitaet</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Fuer integrierbare Funktionen gilt: \( \int_a^b (f(x) + g(x)) dx = \int_a^b f(x) dx + \int_a^b g(x) dx \).</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 12. SA: Second derivative cos(x) -->
  <question type="shortanswer">
    <name><text>MATH_Q12_Zweite_Ableitung_Cosinus</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Geben Sie die zweite Ableitung der Funktion \( f(x) = \cos(x) \) an:</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>-cos(x)</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>-\cos(x)</text></answer>
  </question>

  <!-- 13. SA: Curvature change point -->
  <question type="shortanswer">
    <name><text>MATH_Q13_Kruemmungswechsel_Punkt</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie heisst der Punkt auf einem Funktionsgraphen, an dem sich das Kruemmungsverhalten von links- nach rechtsgekruemmt (oder umgekehrt) aendert?</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>Wendepunkt</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>Wendestelle</text></answer>
  </question>

  <!-- 14. SA: Asymptote equation -->
  <question type="shortanswer">
    <name><text>MATH_Q14_Waagrechte_Asymptote_Gleichung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Geben Sie die Gleichung der waagrechten Asymptote von \( f(x) = \frac{1}{x} + 2 \) fuer \( x \to \infty \) an (z. B. y = 2):</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>y = 2</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>y=2</text></answer>
  </question>

  <!-- 15. CLOZE: Infimum and limit -->
  <question type="cloze">
    <name><text>MATH_Q15_Mengen_Infimum_Lueckentext</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Fuer die reelle Zahlenmenge \( M = (0, 1] \) ist das Infimum {1:NUMERICAL:=0:0}.<br/>
Die Folge \( a_n = 1/n \) ist {1:MC:=konvergent~divergent}.
</p>]]></text>
    </questiontext>
  </question>

  <!-- 16. CLOZE: Integration by parts rule -->
  <question type="cloze">
    <name><text>MATH_Q16_Partielle_Integration_Lueckentext</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ergaenzen Sie die Formel der partiellen Integration:<br/>
\( \int u(x) v'(x) dx = u(x) v(x) - \int \) {1:SA:=u'(x) v(x)~u' v~v(x) u'(x)} \( dx \).
</p>]]></text>
    </questiontext>
  </question>

  <!-- 17. ESSAY: Rolle's theorem and MVT -->
  <question type="essay">
    <name><text>MATH_Q17_Satz_Von_Rolle_Beweis</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Formulieren Sie den Satz von Rolle und leiten Sie daraus den Mittelwertsatz der Differentialrechnung fuer eine auf \( [a, b] \) stetige und auf \( (a, b) \) differenzierbare Funktion her.</p>]]></text>
    </questiontext>
    <responseformat>editor</responseformat>
    <responserequired>1</responserequired>
    <responsefieldlines>15</responsefieldlines>
    <graderinfo format="html">
      <text><![CDATA[<p>Kriterien:<br/>
1. Praezise Voraussetzungen: stetig auf [a, b], diffbar auf (a, b), f(a)=f(b) (30%).<br/>
2. Existenz eines Maximums/Minimums nach Weierstras und f'(xi)=0 (40%).<br/>
3. Konstruktion der Hilfsfunktion g(x) = f(x) - [f(a) + (f(b)-f(a))/(b-a)*(x-a)] (30%).</p>]]></text>
    </graderinfo>
  </question>

  <!-- 18. ESSAY: Kurvendiskussion -->
  <question type="essay">
    <name><text>MATH_Q18_Vollstaendige_Kurvendiskussion</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Fuehren Sie eine Kurvendiskussion fuer die rationale Funktion \( f(x) = \frac{x^3}{x^2 - 1} \) durch. Bestimmen Sie Definitionsbereich, Symmetrie, Nullstellen, Polstellen und die schiefe Asymptote via Polynomdivision.</p>]]></text>
    </questiontext>
    <responseformat>editor</responseformat>
    <responserequired>1</responserequired>
    <responsefieldlines>15</responsefieldlines>
    <graderinfo format="html">
      <text><![CDATA[<p>D = R ohne {-1, 1}. Punktsymmetrisch zum Ursprung f(-x) = -f(x). Nullstelle x=0 (dreifach). Polstellen bei x=1 und x=-1. Polynomdivision: f(x) = x + x/(x^2 - 1), folglich schiefe Asymptote y = x.</p>]]></text>
    </graderinfo>
  </question>
</quiz>"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"Generated {path} (18 questions, calculus & tolerance)")


def generate_scenario_chem():
    """Scenario 4: Chemie SF (SEK II LU) - 18 Questions, equilibrium & titration."""
    path = os.path.join(PACKAGES_DIR, "scenario_chemistry_18q.xml")
    xml = r"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Gymnasium_LU/Chemie_SF/Chemisches_Gleichgewicht_und_Saeure_Base</text></category>
  </question>

  <!-- 1. MC Single: Le Chatelier pressure effect -->
  <question type="multichoice">
    <name><text>CHEM_Q01_Le_Chatelier_Druckeinfluss</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Gegeben ist die Ammoniaksynthese nach Haber-Bosch:<br/>
\( N_2(g) + 3 H_2(g) \rightleftharpoons 2 NH_3(g) \quad \Delta H &lt; 0 \)<br/>
Wie verschiebt sich das chemische Gleichgewicht bei einer Erhoehung des Gesamtdrucks nach dem Prinzip von Le Chatelier?</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>Das Gleichgewicht verschiebt sich nach rechts (zur Seite der geringeren Stoffmenge an Gas).</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Das Gleichgewicht verschiebt sich nach links (zu den Edukten).</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Der Druck hat keinen Einfluss auf die Gleichgewichtslage.</p>]]></text></answer>
  </question>

  <!-- 2. MC Single: Amphoteric definition -->
  <question type="multichoice">
    <name><text>CHEM_Q02_Ampholyte_Definition</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche der folgenden chemischen Teilchenart kann sowohl als Broensted-Saeure (Protonendonator) als auch als Broensted-Base (Protonenakzeptor) reagieren (Ampholyt)?</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>\( HCO_3^- \) (Hydrogencarbonat-Ion)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>\( Cl^- \) (Chlorid-Ion)</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>\( NH_4^+ \) (Ammonium-Ion)</p>]]></text></answer>
  </question>

  <!-- 3. MC Multi: Factors altering equilibrium constant Kc -->
  <question type="multichoice">
    <name><text>CHEM_Q03_Kc_Abhaengigkeit_Faktoren</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche der folgenden Faktoren veraendern den thermodynamischen Zahlenwert der Gleichgewichtskonstanten Kc?</p>]]></text>
    </questiontext>
    <single>false</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>Temperatur</p>]]></text></answer>
    <answer fraction="-50" format="html"><text><![CDATA[<p>Einsatz eines Katalysators</p>]]></text></answer>
    <answer fraction="-50" format="html"><text><![CDATA[<p>Konzentrationsaenderung der Edukte</p>]]></text></answer>
  </question>

  <!-- 4. MC Single: Buffer capacity -->
  <question type="multichoice">
    <name><text>CHEM_Q04_Pufferkapazitaet_Optimum</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wann ist die Pufferkapazitaet eines Essigsaeure/Acetat-Puffersystems am groessten?</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>Wenn das Verhaeltnis c(CH3COOH) : c(CH3COO-) gleich 1:1 ist (pH = pKs).</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Bei stark alkalischem pH-Wert &gt; 12.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Wenn die Saeurekomponente vollstaendig deprotoniert vorliegt.</p>]]></text></answer>
  </question>

  <!-- 5. NUM: pH of HCl 0.005 M -->
  <question type="numerical">
    <name><text>CHEM_Q05_pH_Starke_Saeure</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Berechnen Sie den pH-Wert einer Salzsaeureloesung mit einer Konzentration von c(HCl) = 0.005 mol/l (pH = -log10(0.005)).</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>2.301</text>
      <tolerance>0.02</tolerance>
    </answer>
  </question>

  <!-- 6. NUM: pH of acetic acid 0.1 M -->
  <question type="numerical">
    <name><text>CHEM_Q06_pH_Schwache_Saeure_Essigsaeure</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Berechnen Sie den pH-Wert einer 0.10 mol/l Essigsaeureloesung mit pKs = 4.75 ueber die Naeherungsformel pH = 0.5 * (pKs - log10(c0)). (4.75 - (-1)) * 0.5 = 2.875.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>2.875</text>
      <tolerance>0.03</tolerance>
    </answer>
  </question>

  <!-- 7. NUM: pH of buffer -->
  <question type="numerical">
    <name><text>CHEM_Q07_pH_Henderson_Hasselbalch_Puffer</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ein Acetatpuffer enthaelt c(CH3COOH) = 0.20 mol/l und c(CH3COO-) = 0.40 mol/l (pKs = 4.75). Berechnen Sie den pH-Wert nach Henderson-Hasselbalch: pH = 4.75 + log10(0.40/0.20) = 4.75 + 0.301 = 5.051.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>5.051</text>
      <tolerance>0.02</tolerance>
    </answer>
  </question>

  <!-- 8. NUM: Titration concentration calculation with SVG diagram -->
  <question type="numerical">
    <name><text>CHEM_Q08_Titration_Konzentrationsberechnung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Betrachten Sie die Titrationskurve:<br/><img src="@@PLUGINFILE@@/titration_curve.svg" alt="Titrationskurve" /><br/>Zur Neutralisation von 20.0 ml einer Essigsaeureloesung unbekannter Konzentration werden bis zum Aequivalenzpunkt genau 18.5 ml einer 0.100 mol/l NaOH-Massloesung verbraucht. Berechnen Sie die Stoffmengenkonzentration c der Essigsaeure in mol/l: c = (18.5 * 0.100) / 20.0 = 0.0925.</p>]]></text>
      <file name="titration_curve.svg" encoding="base64">__SVG_TITRATION__</file>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>0.0925</text>
      <tolerance>0.002</tolerance>
    </answer>
  </question>

  <!-- 9. SA: Conjugate acid of H2O -->
  <question type="shortanswer">
    <name><text>CHEM_Q09_Konjugierte_Saeure_Wasser</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Geben Sie die Summenformel der konjugierten Saeure (des Oxonium-Ions) von Wasser (H2O) an:</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>H3O+</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>H3O^+ </text></answer>
  </question>

  <!-- 10. SA: Le Chatelier principle -->
  <question type="shortanswer">
    <name><text>CHEM_Q10_Prinzip_Vom_Kleinsten_Zwang</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie lautet der Name des franzoesischen Chemikers, nach dem das Prinzip vom kleinsten Zwang fuer chemische Gleichgewichte benannt ist?</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>Le Chatelier</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>Prinzip von Le Chatelier</text></answer>
  </question>

  <!-- 11. SA: Equivalence point -->
  <question type="shortanswer">
    <name><text>CHEM_Q11_Aequivalenzpunkt_Fachbegriff</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie nennt man bei einer Titration den Punkt, an dem die Stoffmenge der zugegebenen Massloesung exakt aequivalent zur Stoffmenge des Analyten ist?</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>Aequivalenzpunkt</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>Äquivalenzpunkt</text></answer>
  </question>

  <!-- 12. TF: Catalyst does not shift equilibrium -->
  <question type="truefalse">
    <name><text>CHEM_Q12_Katalysator_Gleichgewichtslage</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ein Katalysator beschleunigt Hin- und Rueckreaktion gleichermassen und veraendert die thermodynamische Gleichgewichtslage nicht.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 13. TF: Ammonium chloride acidic -->
  <question type="truefalse">
    <name><text>CHEM_Q13_Ammoniumchlorid_Sauer</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Eine waessrige Loesung von Ammoniumchlorid (NH4Cl) reagiert basisch (pH &gt; 7).</p>]]></text>
    </questiontext>
    <answer fraction="0" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 14. TF: Exothermic Kc with temperature -->
  <question type="truefalse">
    <name><text>CHEM_Q14_Exotherm_Kc_Temperatur</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Bei einer exothermen Reaktion sinkt der Wert der Gleichgewichtskonstanten Kc mit steigender Temperatur.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 15. MATCH: Indicators to transition range and color -->
  <question type="matching">
    <name><text>CHEM_Q15_pH_Indikatoren_Umschlagsbereich</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ordnen Sie die Saeure-Base-Indikatoren ihrem Umschlagsbereich und Farbwechsel zu:</p>]]></text>
    </questiontext>
    <subquestion format="html">
      <text><![CDATA[<p>Phenolphthalein</p>]]></text>
      <answer><text>Farblos zu Pink/Magenta (pH 8.2 - 10.0)</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Methylorange</p>]]></text>
      <answer><text>Rot zu Gelb/Orange (pH 3.1 - 4.4)</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Bromthymolblau</p>]]></text>
      <answer><text>Gelb zu Blau (pH 6.0 - 7.6)</text></answer>
    </subquestion>
  </question>

  <!-- 16. MATCH: Conjugate acid-base pairs -->
  <question type="matching">
    <name><text>CHEM_Q16_Konjugierte_Saeure_Base_Paare</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ordnen Sie der Broensted-Saeure ihre korrespondierende Broensted-Base zu:</p>]]></text>
    </questiontext>
    <subquestion format="html">
      <text><![CDATA[<p>Schwefelsaeure (H2SO4)</p>]]></text>
      <answer><text>Hydrogensulfat-Ion (HSO4-)</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Ammonium-Ion (NH4+)</p>]]></text>
      <answer><text>Ammoniak (NH3)</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Hydrogencarbonat-Ion (HCO3-)</p>]]></text>
      <answer><text>Carbonat-Ion (CO3 2-)</text></answer>
    </subquestion>
  </question>

  <!-- 17. ESSAY: CaCO3 solubility in carbonated water -->
  <question type="essay">
    <name><text>CHEM_Q17_Kalkloeslichkeit_Karstbildung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Erlaeutern Sie anhand des Massenwirkungsgesetzes und gekoppelter chemischer Gleichgewichte, warum Calciumcarbonat (CaCO3) in kohlensaeurehaltigem Wasser signifikant loeslicher ist als in reinem Wasser (Verkarstungsprozess). Formulieren Sie die Reaktionsgleichungen.</p>]]></text>
    </questiontext>
    <responseformat>editor</responseformat>
    <responserequired>1</responserequired>
    <responsefieldlines>15</responsefieldlines>
    <graderinfo format="html">
      <text><![CDATA[<p>Kriterien:<br/>
1. Loeslichkeitsgleichgewicht: CaCO3(s) &lt;=&gt; Ca2+ + CO3(2-) mit KL (30%).<br/>
2. Saeure-Base-Reaktion: CO2 + H2O &lt;=&gt; H2CO3 &lt;=&gt; H+ + HCO3- (30%).<br/>
3. Gekoppeltes Gleichgewicht: CO3(2-) + H+ &lt;=&gt; HCO3-. Entzug von Carbonationen verschiebt das Kalkgleichgewicht nach rechts (Le Chatelier) (40%).</p>]]></text>
    </graderinfo>
  </question>

  <!-- 18. ESSAY: Titration curve interpretation -->
  <question type="essay">
    <name><text>CHEM_Q18_Titrationskurve_Halbaequivalenzpunkt</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Skizzieren und interpretieren Sie den Verlauf einer Titrationskurve bei der Titration einer schwachen einprotonigen Saeure (z. B. Essigsaeure) mit starker Base (NaOH). Erklaeren Sie die besondere Bedeutung des Halbaequivalenzpunktes.</p>]]></text>
    </questiontext>
    <responseformat>editor</responseformat>
    <responserequired>1</responserequired>
    <responsefieldlines>12</responsefieldlines>
    <graderinfo format="html">
      <text><![CDATA[<p>Kriterien: Start-pH im schwach sauren Bereich. Pufferbereich mit flachem Anstieg. Am Halbaequivalenzpunkt gilt c(HA)=c(A-), folglich pH = pKs nach Henderson-Hasselbalch. Am Aequivalenzpunkt ist pH &gt; 7 wegen Hydrolyse des Acetats.</p>]]></text>
    </graderinfo>
  </question>
</quiz>""".replace("__SVG_TITRATION__", TITRATION_SVG_B64)
    with open(path, "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"Generated {path} (18 questions, equilibrium & titration)")


def generate_scenario_phys():
    """Scenario 5: Physik EF (SEK II SG) - 16 Questions, mechanics & diagnostics."""
    path = os.path.join(PACKAGES_DIR, "scenario_physics_16q.xml")
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/Gymnasium_SG/Physik_EF/Klassische_Mechanik_und_Schwingungen</text></category>
  </question>

  <!-- 1. NUM: Kinetic energy m=2.5kg, h=5.0m -->
  <question type="numerical">
    <name><text>PHYS_Q01_Kinetische_Energie_Freier_Fall</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ein Koerper der Masse m = 2.5 kg faellt im Schwerefeld der Erde (g = 9.81 m/s^2) aus der Ruhe um die Hoehe h = 5.0 m. Berechnen Sie die kinetische Energie beim Aufprall unter Vernachlaessigung des Luftwiderstands (E_kin = m * g * h = 2.5 * 9.81 * 5.0 = 122.625 J).</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>122.625</text>
      <tolerance>0.5</tolerance>
    </answer>
  </question>

  <!-- 2. NUM: Pendulum period l=1.0m -->
  <question type="numerical">
    <name><text>PHYS_Q02_Fadenpendel_Periodendauer</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Berechnen Sie die Periodendauer T eines mathematischen Fadenpendels der Laenge l = 1.0 m fuer kleine Auslenkungen (g = 9.81 m/s^2): T = 2 * pi * sqrt(l / g) = 2 * pi * sqrt(1.0 / 9.81) = 2.006 s.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>2.006</text>
      <tolerance>0.02</tolerance>
    </answer>
  </question>

  <!-- 3. NUM: Satellite speed -->
  <question type="numerical">
    <name><text>PHYS_Q03_Satelliten_Bahngeschwindigkeit</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ein geostationaerer Satellit umkreist die Erde auf einer Kreisbahn mit Radius r = 42164 km in T = 86164 s. Berechnen Sie seine Bahngeschwindigkeit v = 2 * pi * r / T in m/s: (2 * pi * 42164000) / 86164 = 3075 m/s.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>3075.0</text>
      <tolerance>10.0</tolerance>
    </answer>
  </question>

  <!-- 4. NUM: Spring constant m=0.5kg, T=0.8s -->
  <question type="numerical">
    <name><text>PHYS_Q04_Federkonstante_Harmonischer_Oszillator</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ein Federpendel mit Masse m = 0.5 kg schwingt mit einer Periode T = 0.8 s. Berechnen Sie die Federkonstante D = 4 * pi^2 * m / T^2 = (4 * pi^2 * 0.5) / 0.64 = 30.84 N/m.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format">
      <text>30.84</text>
      <tolerance>0.2</tolerance>
    </answer>
  </question>

  <!-- 5. MC Single: Centripetal force direction -->
  <question type="multichoice">
    <name><text>PHYS_Q05_Zentripetalkraft_Richtung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>In welche Richtung zeigt der Vektor der Zentripetalkraft bei einer gleichfoermigen Kreisbewegung?</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>Stets radial zum Kreismittelpunkt gerichtet.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Tangential in Richtung des Geschwindigkeitsvektors.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>Vom Kreismittelpunkt nach aussen (Fliehkraftrichtung).</p>]]></text></answer>
  </question>

  <!-- 6. MC Multi: Elastic collision conservation -->
  <question type="multichoice">
    <name><text>PHYS_Q06_Elastischer_Stoss_Erhaltungsgroessen</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche physikalischen Groessen bleiben bei einem ideal elastischen Stoss in einem abgeschlossenen System vollstaendig erhalten?</p>]]></text>
    </questiontext>
    <single>false</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="50" format="html"><text><![CDATA[<p>Gesamtimpuls des Systems</p>]]></text></answer>
    <answer fraction="50" format="html"><text><![CDATA[<p>Gesamte kinetische Energie des Systems</p>]]></text></answer>
    <answer fraction="-50" format="html"><text><![CDATA[<p>Geschwindigkeit jedes einzelnen Koerpers</p>]]></text></answer>
  </question>

  <!-- 7. MC Single: Kepler's 3rd law -->
  <question type="multichoice">
    <name><text>PHYS_Q07_Keplersches_Drittes_Gesetz</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Welche Beziehung beschreibt das 3. Keplersche Gesetz fuer Planetenbahnen um die Sonne?</p>]]></text>
    </questiontext>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text><![CDATA[<p>Das Verhaeltnis T^2 / a^3 ist fuer alle Planeten konstant.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>T proportional zu a.</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>T^3 / a^2 ist konstant.</p>]]></text></answer>
  </question>

  <!-- 8. TF: Gravity at poles vs equator -->
  <question type="truefalse">
    <name><text>PHYS_Q08_Erdbeschleunigung_Pole_Aequator</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Die effektive Erdbeschleunigung g ist an den geografischen Erdpolen geringer als am Aequator.</p>]]></text>
    </questiontext>
    <answer fraction="0" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 9. TF: Undamped oscillator energy constant -->
  <question type="truefalse">
    <name><text>PHYS_Q09_Ungedaempfter_Oszillator_Energie</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Bei einer ungedaempften harmonischen Schwingung ist die mechanische Gesamtenergie (Summe aus kinetischer und potentieller Energie) zeitlich konstant.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 10. TF: Inelastic collision momentum conservation -->
  <question type="truefalse">
    <name><text>PHYS_Q10_Inelastischer_Stoss_Impulserhaltung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Der Gesamtimpuls eines abgeschlossenen Systems bleibt auch bei einem vollkommen inelastischen Stoss stets erhalten.</p>]]></text>
    </questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>

  <!-- 11. SA: SI unit of force -->
  <question type="shortanswer">
    <name><text>PHYS_Q11_SI_Einheit_Kraft</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie lautet der Name oder das Einheitenzeichen der abgeleiteten SI-Einheit der Kraft?</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>Newton</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>N</text></answer>
  </question>

  <!-- 12. SA: Resonance -->
  <question type="shortanswer">
    <name><text>PHYS_Q12_Resonanz_Fachbegriff</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Wie nennt man das physikalische Phaenomen eines maximalen Amplitudenanstiegs, wenn die Erregerfrequenz mit der Eigenfrequenz eines schwingungsfaehigen Systems uebereinstimmt?</p>]]></text>
    </questiontext>
    <usecase>0</usecase>
    <answer fraction="100" format="moodle_auto_format"><text>Resonanz</text></answer>
    <answer fraction="100" format="moodle_auto_format"><text>Resonanzkatastrophe</text></answer>
  </question>

  <!-- 13. MATCH: Physical quantities to base SI units -->
  <question type="matching">
    <name><text>PHYS_Q13_SI_Basiseinheiten_Zuordnung</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ordnen Sie die abgeleiteten physikalischen Groessen ihren Darstellungen in SI-Basiseinheiten zu:</p>]]></text>
    </questiontext>
    <subquestion format="html">
      <text><![CDATA[<p>Kraft (N)</p>]]></text>
      <answer><text>kg * m * s^-2</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Energie / Arbeit (J)</p>]]></text>
      <answer><text>kg * m^2 * s^-2</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Leistung (W)</p>]]></text>
      <answer><text>kg * m^2 * s^-3</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Druck (Pa)</p>]]></text>
      <answer><text>kg * m^-1 * s^-2</text></answer>
    </subquestion>
  </question>

  <!-- 14. MATCH: Pendulum parameters to influence on period -->
  <question type="matching">
    <name><text>PHYS_Q14_Fadenpendel_Parameter_Einfluss</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Ordnen Sie die Parameter eines Fadenpendels ihrem Einfluss auf die Schwingungsdauer T zu:</p>]]></text>
    </questiontext>
    <subquestion format="html">
      <text><![CDATA[<p>Pendellaenge l</p>]]></text>
      <answer><text>Periodendauer steigt proportional zu sqrt(l)</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Pendelmasse m</p>]]></text>
      <answer><text>Kein Einfluss auf die Periodendauer</text></answer>
    </subquestion>
    <subquestion format="html">
      <text><![CDATA[<p>Erdbeschleunigung g</p>]]></text>
      <answer><text>Periodendauer sinkt umgekehrt proportional zu sqrt(g)</text></answer>
    </subquestion>
  </question>

  <!-- 15. Diagnostic Warning Probe 1: Non-standard qtype "stack" -->
  <question type="stack">
    <name><text>PHYS_Q15_Stack_Question_Diagnostic_Probe</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Berechnen Sie die Ableitung von x^3 mit dem Computeralgebrasystem Maxima.</p>]]></text>
    </questiontext>
  </question>

  <!-- 16. Diagnostic Warning Probe 2: Multiple Choice fractions sum 99.9% -->
  <question type="multichoice">
    <name><text>PHYS_Q16_Rounding_Fraction_Sum_Probe</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Drei gleichwertige Antworten mit 33.3% Rundung:</p>]]></text>
    </questiontext>
    <single>false</single>
    <shuffleanswers>true</shuffleanswers>
    <answer fraction="33.3" format="html"><text><![CDATA[<p>A</p>]]></text></answer>
    <answer fraction="33.3" format="html"><text><![CDATA[<p>B</p>]]></text></answer>
    <answer fraction="33.3" format="html"><text><![CDATA[<p>C</p>]]></text></answer>
  </question>
</quiz>"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"Generated {path} (16 questions, mechanics & diagnostics)")

    # Also generate the standard-only 14-question package for Moodle core import
    path_std = os.path.join(PACKAGES_DIR, "scenario_physics_standard_14q.xml")
    xml_std = xml[:xml.find("<!-- 15. Diagnostic Warning Probe 1: Non-standard qtype \"stack\" -->")].strip() + "\n</quiz>"
    with open(path_std, "w", encoding="utf-8") as f:
        f.write(xml_std)
    print(f"Generated {path_std} (14 standard physics questions)")


if __name__ == "__main__":
    generate_scenario_cs()
    generate_scenario_bio()
    generate_scenario_math()
    generate_scenario_chem()
    generate_scenario_phys()
    print("All 5 scenario XML packages successfully generated.")
