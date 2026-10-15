<?php
/**
 * CLI Server-Side Quiz Harness for Moodle Question Hub E2E Tests.
 * Executes automated quiz instance creation, attempt submission, grading, and cleanup.
 *
 * Usage:
 *   php moodle_quiz_harness.php <moodle_root> <action> <json_payload>
 */

define('CLI_SCRIPT', true);

$moodleroot = $argv[1] ?? '';
$action = $argv[2] ?? '';
$payload_raw = $argv[3] ?? '{}';

if (empty($moodleroot) || !is_dir($moodleroot)) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid moodle root directory: ' . $moodleroot]);
    exit(1);
}

require_once($moodleroot . '/config.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/mod/quiz/locallib.php');
require_once($CFG->libdir . '/questionlib.php');

$payload = json_decode($payload_raw, true);
if (!is_array($payload)) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload']);
    exit(1);
}

function delete_quiz_safely(int $quizid): bool {
    global $DB;
    $deleted = false;
    try {
        $cm = get_coursemodule_from_instance('quiz', $quizid);
        if ($cm) {
            course_delete_module($cm->id);
            $deleted = true;
        }
    } catch (Throwable $e) {
        // Fall through to quiz_delete_instance
    }
    if (!$deleted) {
        try {
            quiz_delete_instance($quizid);
            $deleted = true;
        } catch (Throwable $e) {
            // Direct database cleanup if quiz_settings::create fails on orphaned cm
            $quiz = $DB->get_record('quiz', ['id' => $quizid]);
            if ($quiz) {
                quiz_delete_all_attempts($quiz);
                $DB->delete_records('quiz_slots', ['quizid' => $quizid]);
                $DB->delete_records('quiz_sections', ['quizid' => $quizid]);
                $DB->delete_records('quiz_feedback', ['quizid' => $quizid]);
                $DB->delete_records('quiz_overrides', ['quiz' => $quizid]);
                $DB->delete_records('quiz', ['id' => $quizid]);
                $deleted = true;
            }
        }
    }
    return $deleted;
}

try {
    switch ($action) {
        case 'create_and_populate_quiz':
            $courseid = (int)($payload['courseid'] ?? 2);
            $quizname = $payload['quizname'] ?? ('E2E_Test_Quiz_' . time());
            $qids = array_map('intval', $payload['questionids'] ?? []);

            if (empty($qids)) {
                echo json_encode(['status' => 'error', 'message' => 'questionids cannot be empty']);
                exit(1);
            }

            $course = $DB->get_record('course', ['id' => $courseid], '*', MUST_EXIST);
            $module = $DB->get_record('modules', ['name' => 'quiz'], '*', MUST_EXIST);

            // 1. Create course module
            $cm = new stdClass();
            $cm->course = $course->id;
            $cm->module = $module->id;
            $cm->instance = 0;
            $cm->section = 0;
            $cm->visible = 1;
            $cm->id = add_course_module($cm);
            course_add_cm_to_section($course->id, $cm->id, 0);

            // 2. Create quiz record
            $quiz = new stdClass();
            $quiz->course = $course->id;
            $quiz->name = $quizname;
            $quiz->intro = '<p>Automated E2E Test Quiz</p>';
            $quiz->introformat = FORMAT_HTML;
            $quiz->quizpassword = '';
            $quiz->timeopen = 0;
            $quiz->timeclose = 0;
            $quiz->timelimit = 0;
            $quiz->overduehandling = 'autosubmit';
            $quiz->graceperiod = 0;
            $quiz->preferredbehaviour = 'deferredfeedback';
            $quiz->attempts = 0;
            $quiz->attemptonlast = 0;
            $quiz->grademethod = QUIZ_GRADEHIGHEST;
            $quiz->decimalpoints = 2;
            $quiz->questiondecimalpoints = -1;
            $quiz->questionsperpage = 0;
            $quiz->navmethod = QUIZ_NAVMETHOD_FREE;
            $quiz->shuffleanswers = 0;
            $quiz->sumgrades = count($qids);
            $quiz->grade = 100.0;
            $quiz->timecreated = time();
            $quiz->timemodified = time();
            $quiz->coursemodule = $cm->id;

            $quizid = quiz_add_instance($quiz);
            $DB->set_field('course_modules', 'instance', $quizid, ['id' => $cm->id]);
            rebuild_course_cache($course->id, true);

            // 3. Add question slots to quiz
            $slotnum = 1;
            foreach ($qids as $qid) {
                quiz_add_quiz_question($qid, $quiz, 0, 1.0);
                $slotnum++;
            }

            echo json_encode([
                'status' => 'ok',
                'quizid' => $quizid,
                'cmid' => $cm->id,
                'slots' => count($qids)
            ]);
            break;

        case 'execute_attempt':
            $quizid = (int)($payload['quizid'] ?? 0);
            $userid = (int)($payload['userid'] ?? 4); // default student1
            $answers = $payload['answers'] ?? []; // slot => [field => value]

            $user = $DB->get_record('user', ['id' => $userid], '*', MUST_EXIST);
            \core\session\manager::set_user($user);

            $quizobj = \mod_quiz\quiz_settings::create($quizid, $user->id);
            $attempt = quiz_prepare_and_start_new_attempt($quizobj, 1, null, false, [], [], $user->id);

            $attemptobj = \mod_quiz\quiz_attempt::create($attempt->id);

            // Format student responses per slot
            $tosubmit = [];
            foreach ($answers as $slot => $fields) {
                $slotint = (int)$slot;
                $tosubmit[$slotint] = [];
                $qa = $attemptobj->get_question_attempt($slotint);
                $q = $qa->get_question();
                $qtype = $q->get_type_name();
                foreach ($fields as $k => $v) {
                    if ($qtype === 'multichoice' && $k === 'answer') {
                        $answers_list = array_values($q->answers);
                        if (is_numeric($v) && isset($answers_list[(int)$v])) {
                            $v = clean_param($answers_list[(int)$v]->answer, PARAM_NOTAGS);
                        }
                    }
                    $tosubmit[$slotint][$k] = $v;
                }
            }

            $timenow = time();
            $attemptobj->process_submitted_actions($timenow, false, $tosubmit);
            if (method_exists($attemptobj, 'process_submit')) {
                // Moodle 5.0+: submission and grading are separate steps.
                $attemptobj->process_submit($timenow, false);
                $attemptobj->process_grade_submission($timenow);
            } else {
                // Moodle 4.5 LTS: process_finish() submits and grades in one step.
                $attemptobj->process_finish($timenow, false);
            }

            // Extract detailed slot reports
            $gradedattempt = \mod_quiz\quiz_attempt::create($attempt->id);
            $slotsreport = [];
            $totalfraction = 0.0;

            foreach ($gradedattempt->get_slots() as $slot) {
                $qa = $gradedattempt->get_question_attempt($slot);
                $fraction = $qa->get_fraction();
                $slotsreport[$slot] = [
                    'qtype' => $qa->get_question()->get_type_name(),
                    'questionid' => $qa->get_question_id(),
                    'mark' => $qa->get_mark(),
                    'maxmark' => $qa->get_max_mark(),
                    'fraction' => $fraction,
                    'state' => (string)$qa->get_state()
                ];
                $totalfraction += ($fraction ?? 0.0);
            }

            echo json_encode([
                'status' => 'ok',
                'attemptid' => $attempt->id,
                'is_finished' => $gradedattempt->is_finished(),
                'summarks' => $gradedattempt->get_sum_marks(),
                'totalfraction' => $totalfraction,
                'slotcount' => count($slotsreport),
                'slots' => $slotsreport
            ]);
            break;

        case 'cleanup_quiz':
            $cmid = (int)($payload['cmid'] ?? 0);
            if ($cmid > 0) {
                course_delete_module($cmid);
                echo json_encode(['status' => 'ok', 'cleaned' => $cmid]);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'cmid required for cleanup']);
            }
            break;

        case 'cleanup_question':
            $qid = (int)($payload['questionid'] ?? 0);
            if ($qid > 0) {
                \core\session\manager::set_user(get_admin());
                question_delete_question($qid);
                echo json_encode(['status' => 'ok', 'cleaned' => $qid]);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'questionid required for cleanup']);
            }
            break;

        case 'cleanup_category':
            $catid = (int)($payload['categoryid'] ?? 0);
            if ($catid > 0) {
                \core\session\manager::set_user(get_admin());
                $cat = $DB->get_record('question_categories', ['id' => $catid]);
                if ($cat && $cat->parent != 0) {
                    question_category_delete_safe($cat);
                    echo json_encode(['status' => 'ok', 'cleaned' => $catid]);
                } else {
                    echo json_encode(['status' => 'error', 'message' => 'Category not found or is root']);
                }
            } else {
                echo json_encode(['status' => 'error', 'message' => 'categoryid required for cleanup']);
            }
            break;

        case 'seed_default_question':
            // Makes the suite independent of leftover data: puts one short-answer question into the
            // categories the export tests pick (first non-top category of the course question
            // context, and the first non-top category in the whole database). cleanup_since removes it.
            \core\session\manager::set_user(get_admin());
            $courseid = (int)($payload['courseid'] ?? 2);
            $course = $DB->get_record('course', ['id' => $courseid], '*', MUST_EXIST);
            $context = \qbank_questionhub\package_exporter::resolve_course_question_context($course);
            $targets = [];
            foreach ($DB->get_records('question_categories', ['contextid' => $context->id], 'id ASC') as $cat) {
                if ($cat->name !== 'top') {
                    $targets[(int)$cat->id] = true;
                    break;
                }
            }
            $first = $DB->get_records_select('question_categories', "name <> 'top'", [], 'id ASC', 'id', 0, 1);
            foreach ($first as $cat) {
                $targets[(int)$cat->id] = true;
            }
            $xml = '<?xml version="1.0" encoding="UTF-8"?><quiz><question type="shortanswer">'
                . '<name><text>E2E Seed Frage</text></name>'
                . '<questiontext format="html"><text><![CDATA[<p>Wie heisst die Hauptstadt der Schweiz?</p>]]></text></questiontext>'
                . '<generalfeedback format="html"><text></text></generalfeedback>'
                . '<defaultgrade>1</defaultgrade><penalty>0.3333333</penalty><hidden>0</hidden><usecase>0</usecase>'
                . '<answer fraction="100" format="plain_text"><text>Bern</text><feedback format="html"><text></text></feedback></answer>'
                . '</question></quiz>';
            $seeded = [];
            foreach (array_keys($targets) as $catid) {
                $importer = new \qbank_questionhub\package_importer($courseid, $catid);
                $res = $importer->import_package($xml, false, ['id' => 'e2e-seed', 'version' => '0.0.1', 'title' => 'E2E seed']);
                $seeded[$catid] = $res->questioncount;
            }
            echo json_encode(['status' => 'ok', 'seeded' => $seeded]);
            break;

        case 'snapshot':
            // Highest existing IDs; everything above them afterwards was created by the test run.
            echo json_encode([
                'status' => 'ok',
                'maxquestionid' => (int)$DB->get_field_sql('SELECT COALESCE(MAX(id), 0) FROM {question}'),
                'maxcategoryid' => (int)$DB->get_field_sql('SELECT COALESCE(MAX(id), 0) FROM {question_categories}'),
                'maxquizid' => (int)$DB->get_field_sql('SELECT COALESCE(MAX(id), 0) FROM {quiz}'),
                'maxhistoryid' => (int)$DB->get_field_sql('SELECT COALESCE(MAX(id), 0) FROM {qbank_questionhub_history}'),
                'maxitemid' => (int)$DB->get_field_sql('SELECT COALESCE(MAX(id), 0) FROM {qbank_questionhub_items}'),
            ]);
            break;

        case 'cleanup_since':
            // Removes quizzes, questions, categories and Question Hub records created after a 'snapshot'.
            $maxquizid = (int)($payload['maxquizid'] ?? -1);
            $maxquestionid = (int)($payload['maxquestionid'] ?? -1);
            $maxcategoryid = (int)($payload['maxcategoryid'] ?? -1);
            if ($maxquizid < 0 || $maxquestionid < 0 || $maxcategoryid < 0) {
                echo json_encode(['status' => 'error', 'message' => 'maxquizid, maxquestionid and maxcategoryid required']);
                exit(1);
            }
            \core\session\manager::set_user(get_admin());

            // 1. Quizzes first, so their questions are no longer in use.
            $quizzes = 0;
            foreach ($DB->get_records_select('quiz', 'id > ?', [$maxquizid], 'id DESC', 'id') as $quiz) {
                if (delete_quiz_safely($quiz->id)) {
                    $quizzes++;
                }
            }
            $module = $DB->get_record('modules', ['name' => 'quiz']);
            if ($module) {
                $DB->delete_records('course_modules', ['course' => 2, 'module' => $module->id, 'instance' => 0]);
            }

            // 2. Questions.
            $questions = 0;
            foreach ($DB->get_fieldset_select('question', 'id', 'id > ? ORDER BY id DESC', [$maxquestionid]) as $qid) {
                question_delete_question($qid);
                $questions++;
            }

            // 3. Now delete categories using question_category_delete_safe.
            // Loop until all categories created since maxcategoryid are removed, deepest first.
            $categories = 0;
            do {
                $deleted_this_pass = 0;
                $cats = $DB->get_records_select('question_categories', 'id > ? AND parent <> 0', [$maxcategoryid], 'id DESC');
                foreach ($cats as $cat) {
                    $haschildren = $DB->record_exists('question_categories', ['parent' => $cat->id]);
                    if (!$haschildren) {
                        question_category_delete_safe($cat);
                        $categories++;
                        $deleted_this_pass++;
                    }
                }
            } while ($deleted_this_pass > 0);

            // 4. Question Hub plugin records (import/publish history, published versions, import
            // fingerprints). Otherwise test imports keep showing up as links in "My library" and as
            // sync status of categories. Optional, so older snapshots without these IDs still work.
            $history = 0;
            $items = 0;
            $maxhistoryid = (int)($payload['maxhistoryid'] ?? -1);
            $maxitemid = (int)($payload['maxitemid'] ?? -1);
            if ($maxhistoryid >= 0) {
                $DB->delete_records_select('qbank_questionhub_published', 'historyid > ?', [$maxhistoryid]);
                $history = $DB->count_records_select('qbank_questionhub_history', 'id > ?', [$maxhistoryid]);
                $DB->delete_records_select('qbank_questionhub_history', 'id > ?', [$maxhistoryid]);
            }
            if ($maxitemid >= 0) {
                $items = $DB->count_records_select('qbank_questionhub_items', 'id > ?', [$maxitemid]);
                $DB->delete_records_select('qbank_questionhub_items', 'id > ?', [$maxitemid]);
            }

            echo json_encode([
                'status' => 'ok',
                'deleted_quizzes' => $quizzes,
                'deleted_questions' => $questions,
                'deleted_categories' => $categories,
                'deleted_history' => $history,
                'deleted_items' => $items,
                'remaining_questions' => $DB->count_records_select('question', 'id > ?', [$maxquestionid]),
            ]);
            break;

        case 'cleanup_orphaned_tests':
            \core\session\manager::set_user(get_admin());

            // 1. Delete test quizzes in course 2
            $quizzes_deleted = 0;
            $test_quizzes = $DB->get_records_sql("
                SELECT q.id FROM {quiz} q
                WHERE q.course = 2 AND (
                    q.name LIKE 'Test Quiz%' OR
                    q.name LIKE 'StressQuiz%' OR
                    q.name LIKE 'E2E_%' OR
                    q.name LIKE 'Forensic_%' OR
                    q.name LIKE 'F15_%'
                )
            ");
            foreach ($test_quizzes as $tq) {
                if (delete_quiz_safely($tq->id)) {
                    $quizzes_deleted++;
                }
            }
            $module = $DB->get_record('modules', ['name' => 'quiz']);
            if ($module) {
                $DB->delete_records('course_modules', ['course' => 2, 'module' => $module->id, 'instance' => 0]);
            }

            // 2. Identify test categories and all their descendants
            $patterns = [
                "E2E_%", "Challenger%", "ConcTest_%", "FixConcTest_%", "ConcCat_%",
                "Gym_%", "Gymnasium%", "BranchRoot_%", "MediaTree_%", "MediaStressTest_%",
                "TestMedia%", "TestOuterTx%", "RT_%", "F15_%", "MediaCV_%", "MediaTest%"
            ];
            $where_clauses = [];
            $params = [];
            foreach ($patterns as $i => $pat) {
                $where_clauses[] = "name LIKE :pat$i";
                $params["pat$i"] = $pat;
            }
            $sql = "SELECT id FROM {question_categories} WHERE parent <> 0 AND (" . implode(" OR ", $where_clauses) . ")";
            $initial_cat_ids = $DB->get_fieldset_sql($sql, $params);

            // Recursively collect all descendant category IDs
            $target_cat_ids = $initial_cat_ids;
            $current_ids = $initial_cat_ids;
            while (!empty($current_ids)) {
                list($insql, $inparams) = $DB->get_in_or_equal($current_ids);
                $children = $DB->get_fieldset_select('question_categories', 'id', "parent $insql", $inparams);
                if (empty($children)) {
                    break;
                }
                $diff = array_diff($children, $target_cat_ids);
                if (empty($diff)) {
                    break;
                }
                $target_cat_ids = array_merge($target_cat_ids, $diff);
                $current_ids = $diff;
            }

            // 3. Delete questions belonging to these categories
            $questions_deleted = 0;
            $cats_deleted = 0;
            if (!empty($target_cat_ids)) {
                list($insql, $inparams) = $DB->get_in_or_equal($target_cat_ids);
                $qids = $DB->get_fieldset_sql("
                    SELECT qv.questionid
                    FROM {question_bank_entries} qbe
                    JOIN {question_versions} qv ON qv.questionbankentryid = qbe.id
                    WHERE qbe.questioncategoryid $insql
                ", $inparams);
                foreach ($qids as $qid) {
                    question_delete_question($qid);
                    $questions_deleted++;
                }

                // 4. Delete categories leaf-first using question_category_delete_safe
                do {
                    $deleted_this_pass = 0;
                    list($insql2, $inparams2) = $DB->get_in_or_equal($target_cat_ids);
                    $remaining_cats = $DB->get_records_select('question_categories', "id $insql2 AND parent <> 0", $inparams2, 'id DESC');
                    foreach ($remaining_cats as $cat) {
                        $haschildren = $DB->record_exists('question_categories', ['parent' => $cat->id]);
                        if (!$haschildren) {
                            question_category_delete_safe($cat);
                            $cats_deleted++;
                            $deleted_this_pass++;
                            $target_cat_ids = array_values(array_diff($target_cat_ids, [$cat->id]));
                        }
                    }
                } while ($deleted_this_pass > 0 && !empty($target_cat_ids));
            }

            rebuild_course_cache(2, true);

            echo json_encode([
                'status' => 'ok',
                'deleted_quizzes' => $quizzes_deleted,
                'deleted_questions' => $questions_deleted,
                'deleted_categories' => $cats_deleted,
            ]);
            break;

        default:
            echo json_encode(['status' => 'error', 'message' => 'Unknown action: ' . $action]);
            break;
    }
} catch (Throwable $t) {
    echo json_encode([
        'status' => 'error',
        'message' => $t->getMessage(),
        'file' => $t->getFile(),
        'line' => $t->getLine(),
        'trace' => $t->getTraceAsString(),
    ]);
    exit(1);
}
