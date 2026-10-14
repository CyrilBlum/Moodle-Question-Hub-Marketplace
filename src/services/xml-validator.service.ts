import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { DiagnosticItem, DiagnosticReport } from '../types/xml.types';

export class SafeXmlValidatorService {
  public static readonly MAX_PACKAGE_SIZE_BYTES = 52_428_800; // 50 MB
  public static readonly MAX_MEDIA_FILE_BYTES = 10_485_760; // 10 MB

  // Canonical Moodle valid fractions matching question_bank::fraction_options_full()
  public static readonly VALID_FRACTIONS: number[] = [
    100, 90, 83.33333, 80, 75, 70, 66.66667, 60, 50, 40, 33.33333, 30, 25, 20, 16.66667, 14.28571, 12.5, 11.11111, 10, 5,
    0,
    -5, -10, -11.11111, -12.5, -14.28571, -16.66667, -20, -25, -30, -33.33333, -40, -50, -60, -66.66667, -70, -75, -80, -83.33333, -90, -100
  ];

  public static readonly SUPPORTED_QUESTION_TYPES = new Set([
    'multichoice',
    'truefalse',
    'shortanswer',
    'numerical',
    'matching',
    'multianswer',
    'cloze',
    'essay',
    'description',
    'category'
  ]);

  public static readonly DISALLOWED_EXTENSIONS = new Set([
    'exe', 'sh', 'bat', 'cmd', 'bin', 'msi', 'php', 'phtml', 'js', 'html', 'py', 'vbs', 'com'
  ]);

  /**
   * Decodes an uploaded XML buffer, detecting UTF-16 (with or without BOM) so that the
   * DOCTYPE/ENTITY guards in assertSafeMarkup() inspect the real markup instead of mojibake.
   * UTF-16 input is normalised to a UTF-8 declaration, since the result is stored as UTF-8.
   */
  public static decodeUpload(buffer: Buffer): string {
    let encoding: 'utf-8' | 'utf-16le' | 'utf-16be' = 'utf-8';
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
      encoding = 'utf-16le';
    } else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
      encoding = 'utf-16be';
    } else if (buffer.length >= 2 && buffer[0] === 0x3C && buffer[1] === 0x00) {
      encoding = 'utf-16le'; // '<' without BOM
    } else if (buffer.length >= 2 && buffer[0] === 0x00 && buffer[1] === 0x3C) {
      encoding = 'utf-16be'; // '<' without BOM
    }

    // TextDecoder strips a leading BOM for every encoding.
    const text = new TextDecoder(encoding).decode(buffer);
    if (encoding === 'utf-8') {
      return text;
    }
    return text.replace(/^(<\?xml[^>]*\bencoding\s*=\s*["'])utf-16(?:le|be)?(["'])/i, '$1UTF-8$2');
  }

  /**
   * Pre-validation regex inspection before parser execution.
   * Strips CDATA sections to isolate structural XML markup and forbids DOCTYPE/ENTITY/XInclude.
   */
  public static assertSafeMarkup(rawXml: string): void {
    if (!rawXml || typeof rawXml !== 'string') {
      throw new Error('ERR_EMPTY_PAYLOAD: XML payload is empty.');
    }

    if (Buffer.byteLength(rawXml, 'utf8') > this.MAX_PACKAGE_SIZE_BYTES) {
      throw new Error(`ERR_PACKAGE_SIZE_EXCEEDED: Package size exceeds maximum limit of 50 MB.`);
    }

    // Step 1: Strip CDATA sections to isolate structural XML markup
    const markupOnly = rawXml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

    // Step 2: Forbid DOCTYPE declarations in structural markup
    if (/<!\s*DOCTYPE\b/i.test(markupOnly)) {
      throw new Error('ERR_XXE_DOCTYPE_FORBIDDEN: Security violation: DOCTYPE declarations are strictly forbidden in question packages.');
    }

    // Step 3: Forbid ENTITY declarations in structural markup
    if (/<!\s*ENTITY\b/i.test(markupOnly)) {
      throw new Error('ERR_XXE_ENTITY_FORBIDDEN: Security violation: ENTITY declarations are strictly forbidden in question packages.');
    }

    // Step 4: Forbid XInclude directives
    if (/<(?:[a-zA-Z0-9_-]+:)?include\b/i.test(markupOnly)) {
      throw new Error('ERR_XXE_XINCLUDE_FORBIDDEN: Security violation: XInclude elements are strictly forbidden.');
    }

    // Step 5: Forbid XML stylesheets
    if (/<\?\s*xml-stylesheet\b/i.test(markupOnly)) {
      throw new Error('ERR_XXE_STYLESHEET_FORBIDDEN: Security violation: xml-stylesheet processing instructions are forbidden.');
    }
  }

  /**
   * Builds the safe fast-xml-parser instance with entity expansion disabled.
   */
  public static createParser(): XMLParser {
    return new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: false,
      processEntities: false,     // Critical security setting
      htmlEntities: false,
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: true,
      stopNodes: ['*.file', 'file'],
    });
  }

  /**
   * Safe parse method with pre-validation and syntax validation.
   */
  public static parseSafe(rawXml: string): any {
    this.assertSafeMarkup(rawXml);

    const validationResult = XMLValidator.validate(rawXml, {
      allowBooleanAttributes: false,
    });

    if (validationResult !== true) {
      const err = validationResult.err;
      throw new Error(`ERR_XML_INVALID_SYNTAX: Malformed XML syntax at line ${err.line}, col ${err.col}: ${err.msg}`);
    }

    const parser = this.createParser();
    const parsed = parser.parse(rawXml);

    if (!parsed || !parsed.quiz) {
      throw new Error('ERR_MISSING_QUIZ_ROOT: Root element must be <quiz>');
    }

    return parsed;
  }

  /**
   * Finds the nearest canonical Moodle grading fraction.
   */
  public static findNearestFraction(fraction: number): { nearest: number; isExact: boolean } {
    let closest = this.VALID_FRACTIONS[0];
    let minDiff = Math.abs(fraction - closest);

    for (const valid of this.VALID_FRACTIONS) {
      const diff = Math.abs(fraction - valid);
      if (diff < minDiff) {
        minDiff = diff;
        closest = valid;
      }
    }

    const isExact = minDiff < 0.001;
    return { nearest: closest, isExact };
  }

  /**
   * Validates Base64 encoded media payload and detects MIME type via magic bytes.
   */
  public static validateMediaFile(fileName: string, base64Content: string): {
    valid: boolean;
    mime?: string;
    sizeBytes: number;
    error?: string;
  } {
    // Check file extension
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (this.DISALLOWED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        sizeBytes: 0,
        error: `ERR_DISALLOWED_MEDIA_MIME: Dateityp .${ext} ist aus Sicherheitsgründen nicht erlaubt.`,
      };
    }

    // Clean whitespace
    const cleanedBase64 = base64Content.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanedBase64)) {
      return {
        valid: false,
        sizeBytes: 0,
        error: 'ERR_MALFORMED_MEDIA_BASE64: Ungültige Base64-Zeichen im Medienanhang.',
      };
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(cleanedBase64, 'base64');
    } catch (err: any) {
      return {
        valid: false,
        sizeBytes: 0,
        error: `ERR_MALFORMED_MEDIA_BASE64: Fehler beim Decodieren der Base64-Daten: ${err.message}`,
      };
    }

    if (buffer.length > this.MAX_MEDIA_FILE_BYTES) {
      return {
        valid: false,
        sizeBytes: buffer.length,
        error: `ERR_MEDIA_SIZE_EXCEEDED: Datei ${fileName} überschreitet die Maximalgrösse von 10 MB.`,
      };
    }

    // Detect MIME by magic bytes
    let mime = 'application/octet-stream';

    // PNG: 89 50 4E 47
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      mime = 'image/png';
    }
    // JPEG: FF D8 FF
    else if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      mime = 'image/jpeg';
    }
    // GIF: 47 49 46 38
    else if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'GIF8') {
      mime = 'image/gif';
    }
    // WEBP: RIFF .... WEBP
    else if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      mime = 'image/webp';
    }
    // PDF: %PDF
    else if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF') {
      mime = 'application/pdf';
    }
    // SVG: <svg
    else if (ext === 'svg' || buffer.slice(0, 500).toString('utf-8').includes('<svg')) {
      mime = 'image/svg+xml';
      const svgText = buffer.toString('utf-8');
      // Forbid scripts in SVG
      if (/<script\b/i.test(svgText) || /on\w+\s*=/i.test(svgText)) {
        return {
          valid: false,
          sizeBytes: buffer.length,
          error: 'ERR_SVG_MALICIOUS_SCRIPT: SVG enthält verbotene Skripte oder Ereignis-Handler.',
        };
      }
    }

    // Executable check (MZ / ELF / Shell)
    if (buffer.length >= 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) { // MZ PE
      return {
        valid: false,
        sizeBytes: buffer.length,
        error: 'ERR_DISALLOWED_MEDIA_MIME: Ausführbare Binärdateien (PE/EXE) sind verboten.',
      };
    }
    if (buffer.length >= 4 && buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) { // ELF
      return {
        valid: false,
        sizeBytes: buffer.length,
        error: 'ERR_DISALLOWED_MEDIA_MIME: Ausführbare Binärdateien (ELF) sind verboten.',
      };
    }

    return {
      valid: true,
      mime,
      sizeBytes: buffer.length,
    };
  }

  /**
   * Helper to normalize XML node text.
   */
  private static extractText(node: any): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (node.text !== undefined) return this.extractText(node.text);
    if (node['#text'] !== undefined) return String(node['#text']);
    return '';
  }

  /**
   * Full package validation generating structured diagnostic reports.
   */
  public static validatePackage(rawXml: string): DiagnosticReport {
    const errors: DiagnosticItem[] = [];
    const warnings: DiagnosticItem[] = [];

    let parsed: any;
    try {
      parsed = this.parseSafe(rawXml);
    } catch (err: any) {
      const codeMatch = err.message.match(/^(ERR_[A-Z_]+):/);
      const code = codeMatch ? codeMatch[1] : 'ERR_XML_INVALID_SYNTAX';
      errors.push({
        code,
        severity: 'error',
        message: err.message,
      });
      return {
        valid: false,
        can_publish: false,
        stats: {
          question_count: 0,
          categories_count: 0,
          categories: [],
          qtypes_breakdown: {},
          embedded_media_count: 0,
          total_media_bytes: 0,
        },
        diagnostics: { errors, warnings },
      };
    }

    const quiz = parsed.quiz;
    let questionsRaw = quiz.question;
    if (!questionsRaw) {
      errors.push({
        code: 'ERR_NO_QUESTIONS_FOUND',
        severity: 'error',
        message: 'Paket enthält keine <question> Elemente.',
      });
      return {
        valid: false,
        can_publish: false,
        stats: {
          question_count: 0,
          categories_count: 0,
          categories: [],
          qtypes_breakdown: {},
          embedded_media_count: 0,
          total_media_bytes: 0,
        },
        diagnostics: { errors, warnings },
      };
    }

    const questionList: any[] = Array.isArray(questionsRaw) ? questionsRaw : [questionsRaw];
    if (questionList.length === 0) {
      errors.push({
        code: 'ERR_NO_QUESTIONS_FOUND',
        severity: 'error',
        message: 'Paket enthält keine <question> Elemente.',
      });
    }

    const categoriesSet = new Set<string>();
    const qtypesBreakdown: Record<string, number> = {};
    let realQuestionCount = 0;
    let currentCategory = '$course$/top/Imported Questions';
    let totalMediaFiles = 0;
    let totalMediaBytes = 0;

    const allDefinedMediaFiles = new Set<string>();
    const allReferencedMediaFiles = new Set<string>();

    for (let index = 0; index < questionList.length; index++) {
      const q = questionList[index];
      const qtype = q['@_type'] || q.type;

      if (!qtype) {
        errors.push({
          code: 'ERR_QUESTION_MISSING_TYPE',
          severity: 'error',
          questionIndex: index,
          message: `Frage an Index ${index} besitzt kein 'type' Attribut.`,
        });
        continue;
      }

      const qName = this.extractText(q.name) || `Frage ${index + 1}`;

      // Handle category pseudo-question
      if (qtype === 'category') {
        let catPath = this.extractText(q.category?.text || q.category);
        if (!catPath) {
          warnings.push({
            code: 'WARN_CATEGORY_EMPTY',
            severity: 'warning',
            questionIndex: index,
            message: 'Kategorie-Element hat keinen Pfadtext.',
          });
          continue;
        }

        // Normalise category path
        let normalizedPath = catPath.replace(/\/+/g, '/').replace(/\/$/, '');
        if (!normalizedPath.startsWith('$course$')) {
          warnings.push({
            code: 'WARN_CATEGORY_PATH_MISSING_CONTEXT',
            severity: 'warning',
            questionIndex: index,
            categoryPath: catPath,
            message: `Kategoriepfad '${catPath}' fehlte der Kontext $course$; wurde angepasst.`,
          });
          normalizedPath = `$course$/${normalizedPath.replace(/^\//, '')}`;
        }

        if (!normalizedPath.includes('/top')) {
          warnings.push({
            code: 'WARN_CATEGORY_PATH_MISSING_TOP',
            severity: 'warning',
            questionIndex: index,
            categoryPath: catPath,
            message: `Kategoriepfad '${catPath}' fehlte die '/top/' Ebene; wurde angepasst.`,
          });
          normalizedPath = normalizedPath.replace('$course$', '$course$/top');
        }

        currentCategory = normalizedPath;
        categoriesSet.add(normalizedPath);
        continue;
      }

      realQuestionCount++;
      qtypesBreakdown[qtype] = (qtypesBreakdown[qtype] || 0) + 1;

      // Check supported question types
      if (!this.SUPPORTED_QUESTION_TYPES.has(qtype)) {
        warnings.push({
          code: 'WARN_UNSUPPORTED_QUESTION_TYPE',
          severity: 'warning',
          questionIndex: index,
          questionName: qName,
          categoryPath: currentCategory,
          message: `Fragentyp '${qtype}' ist ein Drittanbieter-Plugin. Importierte Instanzen benötigen möglicherweise dieses Plugin.`,
        });
      }

      // Scan question text for embedded files and @@PLUGINFILE@@ references
      const qTextContainer = q.questiontext;
      const qTextHtml = this.extractText(qTextContainer);

      // Check pluginfile references in HTML
      const matches = qTextHtml.matchAll(/@@PLUGINFILE@@\/([^"'<>\s]+)/g);
      for (const match of matches) {
        allReferencedMediaFiles.add(match[1]);
      }

      // Check media files inside container
      if (qTextContainer && qTextContainer.file) {
        const fileList: any[] = Array.isArray(qTextContainer.file) ? qTextContainer.file : [qTextContainer.file];
        for (const f of fileList) {
          const fName = f['@_name'] || f.name || 'unnamed.bin';
          const fContent = this.extractText(f);
          allDefinedMediaFiles.add(fName);

          const mediaValidation = this.validateMediaFile(fName, fContent);
          if (!mediaValidation.valid) {
            errors.push({
              code: mediaValidation.error?.split(':')[0] || 'ERR_MALFORMED_MEDIA_BASE64',
              severity: 'error',
              questionIndex: index,
              questionName: qName,
              message: mediaValidation.error || `Fehler bei Mediendatei ${fName}`,
            });
          } else {
            totalMediaFiles++;
            totalMediaBytes += mediaValidation.sizeBytes;
          }
        }
      }

      // Question-type specific validation
      if (qtype === 'multichoice') {
        const singleVal = String(q.single ?? '').trim().toLowerCase();
        const isSingle = singleVal === 'true' || singleVal === '1';

        const answersRaw = q.answer;
        const answers: any[] = Array.isArray(answersRaw) ? answersRaw : (answersRaw ? [answersRaw] : []);

        if (answers.length < 2) {
          errors.push({
            code: 'ERR_NOT_ENOUGH_ANSWERS',
            severity: 'error',
            questionIndex: index,
            questionName: qName,
            categoryPath: currentCategory,
            message: `Multiple-Choice-Frage '${qName}' benötigt mindestens 2 Antwortoptionen (gefunden: ${answers.length}).`,
          });
        }

        let count100 = 0;
        let positiveFractionsSum = 0;

        for (const ans of answers) {
          const fractionStr = ans['@_fraction'] || ans.fraction || '0';
          const fractionNum = parseFloat(fractionStr);

          // Check fraction step
          const stepCheck = this.findNearestFraction(fractionNum);
          if (!stepCheck.isExact) {
            warnings.push({
              code: 'WARN_FRACTION_NON_STANDARD_STEP',
              severity: 'warning',
              questionIndex: index,
              questionName: qName,
              message: `Bewertungsanteil ${fractionNum}% bei '${qName}' entspricht keinem Standard-Moodle-Schritt; wurde zu ${stepCheck.nearest}% gerundet.`,
            });
          }

          if (Math.abs(fractionNum - 100) < 0.001) {
            count100++;
          }
          if (fractionNum > 0) {
            positiveFractionsSum += fractionNum;
          }
        }

        if (isSingle) {
          if (count100 === 0) {
            errors.push({
              code: 'ERR_SINGLE_CHOICE_NO_100',
              severity: 'error',
              questionIndex: index,
              questionName: qName,
              categoryPath: currentCategory,
              message: `Single-Choice-Frage '${qName}' hat keine Antwort mit 100% Bewertung.`,
            });
          } else if (count100 > 1) {
            errors.push({
              code: 'ERR_SINGLE_CHOICE_MULTIPLE_100',
              severity: 'error',
              questionIndex: index,
              questionName: qName,
              categoryPath: currentCategory,
              message: `Single-Choice-Frage '${qName}' hat ${count100} Antworten mit 100% Bewertung (erlaubt ist genau 1).`,
            });
          }
        } else {
          // Multiple response: positive fractions should sum to 100%
          if (Math.abs(positiveFractionsSum - 100) > 0.1) {
            warnings.push({
              code: 'WARN_MULTIPLE_CHOICE_FRACTIONS_SUM',
              severity: 'warning',
              questionIndex: index,
              questionName: qName,
              categoryPath: currentCategory,
              message: `Bei Mehrfachauswahl '${qName}' summieren sich die positiven Anteile auf ${positiveFractionsSum.toFixed(2)}% (erwartet: 100%).`,
            });
          }
        }
      } else if (qtype === 'truefalse') {
        const answersRaw = q.answer;
        const answers: any[] = Array.isArray(answersRaw) ? answersRaw : (answersRaw ? [answersRaw] : []);
        if (answers.length !== 2) {
          errors.push({
            code: 'ERR_TRUEFALSE_INVALID_CHOICES',
            severity: 'error',
            questionIndex: index,
            questionName: qName,
            categoryPath: currentCategory,
            message: `Wahr/Falsch-Frage '${qName}' muss genau 2 Antworten haben (gefunden: ${answers.length}).`,
          });
        } else {
          const frac1 = parseFloat(answers[0]['@_fraction'] || answers[0].fraction || '0');
          const frac2 = parseFloat(answers[1]['@_fraction'] || answers[1].fraction || '0');
          const has100 = (frac1 === 100 && frac2 === 0) || (frac1 === 0 && frac2 === 100);
          if (!has100) {
            errors.push({
              code: 'ERR_TRUEFALSE_INVALID_FRACTIONS',
              severity: 'error',
              questionIndex: index,
              questionName: qName,
              categoryPath: currentCategory,
              message: `Wahr/Falsch-Frage '${qName}' muss genau eine Antwort mit 100% und eine mit 0% besitzen.`,
            });
          }
        }
      } else if (qtype === 'shortanswer') {
        const answersRaw = q.answer;
        const answers: any[] = Array.isArray(answersRaw) ? answersRaw : (answersRaw ? [answersRaw] : []);
        if (answers.length === 0) {
          errors.push({
            code: 'ERR_NO_ANSWERS',
            severity: 'error',
            questionIndex: index,
            questionName: qName,
            categoryPath: currentCategory,
            message: `Kurzantwort-Frage '${qName}' besitzt keine definierten Lösungen.`,
          });
        } else {
          const has100 = answers.some(a => parseFloat(a['@_fraction'] || a.fraction || '0') === 100);
          if (!has100) {
            errors.push({
              code: 'ERR_SHORTANSWER_NO_100',
              severity: 'error',
              questionIndex: index,
              questionName: qName,
              categoryPath: currentCategory,
              message: `Kurzantwort-Frage '${qName}' hat keine Musterlösung mit 100% Bewertung.`,
            });
          }
        }
      } else if (qtype === 'numerical') {
        const answersRaw = q.answer;
        const answers: any[] = Array.isArray(answersRaw) ? answersRaw : (answersRaw ? [answersRaw] : []);
        if (answers.length === 0) {
          errors.push({
            code: 'ERR_NO_ANSWERS',
            severity: 'error',
            questionIndex: index,
            questionName: qName,
            categoryPath: currentCategory,
            message: `Numerische Frage '${qName}' besitzt keine definierten Lösungen.`,
          });
        } else {
          const has100 = answers.some(a => parseFloat(a['@_fraction'] || a.fraction || '0') === 100);
          if (!has100) {
            errors.push({
              code: 'ERR_NUMERICAL_NO_100',
              severity: 'error',
              questionIndex: index,
              questionName: qName,
              categoryPath: currentCategory,
              message: `Numerische Frage '${qName}' hat keine Lösung mit 100% Bewertung.`,
            });
          }
        }
      } else if (qtype === 'matching') {
        const subqsRaw = q.subquestion;
        const subqs: any[] = Array.isArray(subqsRaw) ? subqsRaw : (subqsRaw ? [subqsRaw] : []);
        if (subqs.length < 2) {
          errors.push({
            code: 'ERR_MATCHING_INSUFFICIENT_SUBQUESTIONS',
            severity: 'error',
            questionIndex: index,
            questionName: qName,
            categoryPath: currentCategory,
            message: `Zuordnungsfrage '${qName}' benötigt mindestens 2 Teilfragen/Zuordnungspaare.`,
          });
        }
      } else if (qtype === 'multianswer' || qtype === 'cloze') {
        // Balanced curly braces check
        let openBraces = 0;
        let balanced = true;
        for (let i = 0; i < qTextHtml.length; i++) {
          if (qTextHtml.charCodeAt(i) === 92 || qTextHtml[i] === '\\') {
            i++;
            continue;
          }
          if (qTextHtml[i] === '{') openBraces++;
          if (qTextHtml[i] === '}') {
            openBraces--;
            if (openBraces < 0) {
              balanced = false;
              break;
            }
          }
        }
        if (!balanced || openBraces !== 0) {
          errors.push({
            code: 'ERR_CLOZE_SYNTAX_INVALID',
            severity: 'error',
            questionIndex: index,
            questionName: qName,
            categoryPath: currentCategory,
            message: `Lückentext/Cloze-Frage '${qName}' enthält unausgeglichene geschweifte Klammern {}.`,
          });
        }
      } else if (qtype === 'essay') {
        const respFormat = this.extractText(q.responseformat);
        const attachReq = parseInt(this.extractText(q.attachmentsrequired) || '0', 10);
        if (respFormat === 'noinline' && attachReq === 0) {
          errors.push({
            code: 'ERR_ESSAY_INVALID_ATTACHMENTS',
            severity: 'error',
            questionIndex: index,
            questionName: qName,
            categoryPath: currentCategory,
            message: `Freitext-Frage '${qName}' mit 'noinline' Format erfordert mindestens einen Dateianhang.`,
          });
        }
      }
    }

    // Reference integrity warnings for media
    for (const ref of allReferencedMediaFiles) {
      if (!allDefinedMediaFiles.has(ref)) {
        warnings.push({
          code: 'WARN_MISSING_MEDIA_FILE',
          severity: 'warning',
          message: `Fragentext verweist auf @@PLUGINFILE@@/${ref}, aber keine passende <file> Definition ist vorhanden.`,
        });
      }
    }

    for (const def of allDefinedMediaFiles) {
      if (!allReferencedMediaFiles.has(def)) {
        warnings.push({
          code: 'WARN_UNREFERENCED_MEDIA_FILE',
          severity: 'warning',
          message: `Eingebettete Mediendatei '${def}' wird in keinem Fragentext referenziert.`,
        });
      }
    }

    if (categoriesSet.size === 0) {
      categoriesSet.add(currentCategory);
    }

    const isValid = errors.length === 0;

    return {
      valid: isValid,
      can_publish: isValid,
      stats: {
        question_count: realQuestionCount,
        categories_count: categoriesSet.size,
        categories: Array.from(categoriesSet),
        qtypes_breakdown: qtypesBreakdown,
        embedded_media_count: totalMediaFiles,
        total_media_bytes: totalMediaBytes,
      },
      diagnostics: {
        errors,
        warnings,
      },
    };
  }
}
