import DOMPurify from 'isomorphic-dompurify';
import { SafeXmlValidatorService } from './xml-validator.service';
import { SanitizedPreview, SanitizedQuestion, SanitizedOption } from '../types/xml.types';

const SERVER_SANITIZE_CONFIG = {
  USE_PROFILES: {
    html: true,
    mathMl: true,
    svg: true,
  },
  ADD_DATA_URI_TAGS: ['img'],
  ADD_TAGS: [
    'annotation',
    'semantics',
    'annotation-xml',
  ],
  ADD_ATTR: [
    'target',
    'encoding',
    'display',
    'mathvariant',
    'mathsize',
    'mathcolor',
    'mathbackground',
    'columnalign',
    'rowalign',
    'linethickness',
    'accent',
    'accentunder',
    'fence',
    'separator',
    'stretchy',
    'symmetric',
    'largeop',
    'movablelimits',
    'dir',
    'aria-hidden',
    'aria-label',
    'role',
    'colspan',
    'rowspan',
    'border',
    'cellpadding',
    'cellspacing',
    'scope',
  ],
  FORBID_TAGS: [
    'script',
    'iframe',
    'frame',
    'object',
    'embed',
    'applet',
    'form',
    'input',
    'button',
    'select',
    'textarea',
    'base',
    'link',
    'meta',
    'style',
  ],
  FORBID_ATTR: [
    'onerror',
    'onload',
    'onclick',
    'onmouseover',
    'onmouseout',
    'onmouseenter',
    'onmouseleave',
    'onfocus',
    'onblur',
    'onchange',
    'onsubmit',
    'onreset',
    'onkeydown',
    'onkeypress',
    'onkeyup',
    'ontoggle',
  ],
  ALLOW_DATA_ATTR: false,
  SANITIZE_DOM: true,
};

export class PreviewSanitizerService {
  private static extractText(node: any): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (node.text !== undefined) return this.extractText(node.text);
    if (node['#text'] !== undefined) return String(node['#text']);
    return '';
  }

  /**
   * Bereinigt unvertrauenswuerdiges HTML in Fragetexten und Optionen mit DOMPurify.
   * Bewahrt mathematische Notationen (MathML/KaTeX), Tabellen, Listen und sichere data:image-URIs.
   */
  public static sanitizeHtml(dirtyHtml: string | null | undefined): string {
    if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';
    return DOMPurify.sanitize(dirtyHtml, SERVER_SANITIZE_CONFIG);
  }

  /**
   * Bereinigt eingebettete Cloze-Fragetexte (multianswer), indem alle Unterfragendefinitionen
   * (Antworten, Gewichtungen, Feedback, Toleranzen) durch den Platzhalter '[ ... ]' ersetzt werden.
   *
   * Verarbeitet:
   * - Alle Standard-Short-Codes: SA, MC, NM, MR, MW, SAC, MWC
   * - Layout-Subtypen: MULTICHOICE_V, MCS, MCH, MULTIRESPONSE_H etc.
   * - Gross-/Kleinschreibung: lowercase (shortanswer, mc), mixed-case
   * - Weggelassene Gewichtungen: {:MC:...}
   * - Beliebige Leerzeichen: { 1 : SA : =answer }
   * - Maskierte Trennzeichen: \} in Antworten oder Feedback
   * - Verschachtelte geschweifte Klammern: LaTeX-Makros oder balancierte Ausdruecke
   */
  public static sanitizeClozeQuestionText(text: string): string {
    if (!text) return '';

    const clozePrefixRegex = /^\{\s*\d*\s*:\s*[A-Za-z0-9_]+\s*:/;

    let result = '';
    let i = 0;
    const len = text.length;

    while (i < len) {
      if (text[i] === '{') {
        const slice = text.slice(i);
        const match = slice.match(clozePrefixRegex);
        if (match) {
          let depth = 1;
          let j = i + match[0].length;
          while (j < len && depth > 0) {
            if (text.charCodeAt(j) === 92 || text[j] === '\\') {
              // Maskiertes Zeichen ueberspringen (z. B. \} oder \{)
              j += 2;
              continue;
            }
            if (text[j] === '{') {
              depth++;
            } else if (text[j] === '}') {
              depth--;
            }
            j++;
          }
          result += '[ ... ]';
          i = j;
          continue;
        }
      }
      result += text[i];
      i++;
    }

    return result;
  }

  /**
   * Sanitizes Moodle XML into a pedagogical preview stripping all answer keys and feedback.
   */
  public static sanitizeXmlToPreview(
    packageId: string,
    version: string,
    title: string,
    xmlContent: string
  ): SanitizedPreview {
    const parsed = SafeXmlValidatorService.parseSafe(xmlContent);
    const quiz = parsed.quiz;

    const questionsRaw = quiz.question;
    const questionList: any[] = Array.isArray(questionsRaw) ? questionsRaw : (questionsRaw ? [questionsRaw] : []);

    const categoriesMap = new Map<string, { id: string; name: string; path: string; questionCount: number }>();
    const sanitizedQuestions: SanitizedQuestion[] = [];

    let currentCategoryPath = '$course$/top/Imported Questions';
    let currentCategoryId = 'cat_default';

    categoriesMap.set(currentCategoryId, {
      id: currentCategoryId,
      name: 'Imported Questions',
      path: currentCategoryPath,
      questionCount: 0,
    });

    let catCounter = 1;
    let qCounter = 1;

    for (const q of questionList) {
      const rawQType = q['@_type'] || q.type;
      const qtype = typeof rawQType === 'string' ? rawQType.toLowerCase().trim() : '';
      if (!qtype) continue;

      if (qtype === 'category') {
        const pathText = this.extractText(q.category?.text || q.category) || '$course$/top/Default';
        currentCategoryPath = pathText;
        currentCategoryId = `cat_${catCounter++}`;
        const parts = pathText.split('/');
        const catName = parts[parts.length - 1] || 'Kategorie';

        categoriesMap.set(currentCategoryId, {
          id: currentCategoryId,
          name: catName,
          path: currentCategoryPath,
          questionCount: 0,
        });
        continue;
      }

      // Regular question
      const catObj = categoriesMap.get(currentCategoryId);
      if (catObj) {
        catObj.questionCount++;
      }

      const qName = this.extractText(q.name) || `Frage ${qCounter}`;
      const qId = `q_${qCounter++}`;

      // Extract media files in questiontext
      const mediaFiles: Record<string, string> = {};
      const qTextContainer = q.questiontext;
      let rawQuestionHtml = this.extractText(qTextContainer);

      if (qTextContainer && qTextContainer.file) {
        const fileList: any[] = Array.isArray(qTextContainer.file) ? qTextContainer.file : [qTextContainer.file];
        for (const f of fileList) {
          const fName = f['@_name'] || f.name || 'image.png';
          const fContent = this.extractText(f);
          const val = SafeXmlValidatorService.validateMediaFile(fName, fContent);
          if (val.valid && val.mime) {
            const dataUri = `data:${val.mime};base64,${fContent.replace(/\s+/g, '')}`;
            mediaFiles[fName] = dataUri;
            // Rewrite @@PLUGINFILE@@/fName in HTML
            const regex = new RegExp(`@@PLUGINFILE@@\\/${fName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
            rawQuestionHtml = rawQuestionHtml.replace(regex, dataUri);
          }
        }
      }

      // If Cloze / multianswer, strip solutions before HTML sanitization
      let processedQuestionHtml = rawQuestionHtml;
      if (qtype === 'cloze' || qtype === 'multianswer') {
        processedQuestionHtml = this.sanitizeClozeQuestionText(processedQuestionHtml);
      }

      const sanitizedQ: SanitizedQuestion = {
        id: qId,
        name: qName,
        type: qtype,
        category: currentCategoryId,
        questiontextHtml: this.sanitizeHtml(processedQuestionHtml),
        mediaFiles,
      };

      // Sanitize question options based on type (STRICTLY NO fractions or feedback!)
      if (qtype === 'multichoice') {
        const answersRaw = q.answer;
        const answers: any[] = Array.isArray(answersRaw) ? answersRaw : (answersRaw ? [answersRaw] : []);
        const options: SanitizedOption[] = answers.map((ans, idx) => ({
          id: `opt_${idx + 1}`,
          textHtml: this.sanitizeHtml(this.extractText(ans)),
        }));
        sanitizedQ.options = options;
      } else if (qtype === 'truefalse') {
        sanitizedQ.options = [
          { id: 'opt_true', textHtml: 'Wahr' },
          { id: 'opt_false', textHtml: 'Falsch' },
        ];
      } else if (qtype === 'matching') {
        const subqsRaw = q.subquestion;
        const subqs: any[] = Array.isArray(subqsRaw) ? subqsRaw : (subqsRaw ? [subqsRaw] : []);
        // Shuffle or present subquestions without linking correct answers
        const subList = subqs.map((sq) => {
          const stem = this.extractText(sq.text || sq);
          return { textHtml: this.sanitizeHtml(stem) };
        });
        sanitizedQ.subquestions = subList;
      }

      sanitizedQuestions.push(sanitizedQ);
    }

    return {
      packageId,
      version,
      title,
      categories: Array.from(categoriesMap.values()).filter(c => c.questionCount > 0),
      questions: sanitizedQuestions,
    };
  }
}

