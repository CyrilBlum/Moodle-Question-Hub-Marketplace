import { SafeXmlValidatorService } from './xml-validator.service';
import { SanitizedPreview, SanitizedQuestion, SanitizedOption } from '../types/xml.types';

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
      const qtype = q['@_type'] || q.type;
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

      const sanitizedQ: SanitizedQuestion = {
        id: qId,
        name: qName,
        type: qtype,
        category: currentCategoryId,
        questiontextHtml: rawQuestionHtml,
        mediaFiles,
      };

      // Sanitize question options based on type (STRICTLY NO fractions or feedback!)
      if (qtype === 'multichoice') {
        const answersRaw = q.answer;
        const answers: any[] = Array.isArray(answersRaw) ? answersRaw : (answersRaw ? [answersRaw] : []);
        const options: SanitizedOption[] = answers.map((ans, idx) => ({
          id: `opt_${idx + 1}`,
          textHtml: this.extractText(ans),
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
          return { textHtml: stem };
        });
        sanitizedQ.subquestions = subList;
      } else if (qtype === 'cloze' || qtype === 'multianswer') {
        // Replace cloze solutions with generic placeholder
        sanitizedQ.questiontextHtml = rawQuestionHtml.replace(
          /\{[0-9]+:(?:SHORTANSWER|MULTICHOICE|NUMERICAL):[^}]*\}/g,
          '[ ... ]'
        );
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
