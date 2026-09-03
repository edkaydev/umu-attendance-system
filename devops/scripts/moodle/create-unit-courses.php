<?php
// =============================================================================
// UMU Moodle - create course-unit-level courses + enrollments (idempotent)
//
// The UMU Attendance system matches enrollments via
//   Moodle course.shortname  <=>  UMU course_unit.code
// The practice Moodle only had programme-level courses (BSC-CS, BBA...), so no
// enrollments mapped. This script:
//   1. Creates one Moodle course per UMU course unit (shortname = unit code)
//      placed in the same category as the unit's programme(s) in the curriculum.
//   2. For every program course that has student/editingteacher enrolments,
//      mirrors those enrolments onto each of the programme's unit courses.
//
// Data files (must exist in umu-data/ next to this script):
//   course_units.csv  (name,code,facultyCode)
//   curriculum.csv    (courseUnitCode,programmeCode,year,semester)
//
// Run inside the moodle container:
//   docker cp create-unit-courses.php umu-moodle:/var/www/html/admin/cli/create-unit-courses.php
//   docker exec -u www-data umu-moodle php /var/www/html/admin/cli/create-unit-courses.php
// =============================================================================

define('CLI_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/adminlib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/enrol/manual/lib.php');

@set_time_limit(0);
ini_set('memory_limit', '512M');
$DB->set_debug(true);

$quiet = in_array('--quiet', $argv);
function logmsg($msg) {
    global $quiet;
    if (!$quiet) { mtrace($msg); }
}

$datadir = __DIR__ . '/umu-data';

function loadcsv($path) {
    if (!file_exists($path)) { fwrite(STDERR, "missing $path\n"); exit(1); }
    $fh = fopen($path, 'r');
    $headers = fgetcsv($fh);
    $rows = [];
    while (($r = fgetcsv($fh)) !== false) {
        if (count($r) === 1 && trim((string)$r[0]) === '') { continue; }
        $rows[] = array_combine($headers, array_pad(array_map('trim', $r), count($headers), ''));
    }
    fclose($fh);
    return $rows;
}

// --- Load CSVs --------------------------------------------------------------
$courseUnits = loadcsv("$datadir/course_units.csv");   // name, code, facultyCode
$curriculum  = loadcsv("$datadir/curriculum.csv");     // courseUnitCode, programmeCode, year, semester

// --- Existing programme courses (shortname => [id, category]) ---------------
$progCourseByShort = [];
foreach ($DB->get_records('course', null, 'id', 'id,shortname,category,fullname') as $c) {
    $progCourseByShort[strtoupper($c->shortname)] = $c;
}
logmsg('Found ' . count($progCourseByShort) . ' existing courses.');

function ensure_course($fullname, $shortname, $category, $summary = '') {
    global $DB;
    $existing = $DB->get_field('course', 'id', ['shortname' => $shortname]);
    if ($existing) { return (int)$existing; }
    $data = (object)[
        'fullname'  => $fullname,
        'shortname' => $shortname,
        'idnumber'  => $shortname,
        'visible'   => 1,
        'category'  => (int)$category,
        'summary'   => $summary,
        'format'    => 'topics',
        'numsections' => 4,
        'enablecompletion' => 0,
    ];
    return (int)create_course($data)->id;
}

function manual_enrol_instance($courseid) {
    global $DB;
    $inst = $DB->get_record('enrol', ['courseid' => $courseid, 'enrol' => 'manual', 'status' => 0]);
    if ($inst) { return $inst; }
    $plugin = enrol_get_plugin('manual');
    $id = $plugin->add_instance($DB->get_record('course', ['id' => $courseid]));
    return $DB->get_record('enrol', ['id' => $id]);
}

function enrol_in($courseid, $userid, $rolename) {
    global $DB;
    $ctx = context_course::instance($courseid);
    $roleid = $DB->get_field('role', 'id', ['shortname' => $rolename]);
    if (!$roleid) { return 0; }
    if ($DB->record_exists('role_assignments', ['contextid' => $ctx->id, 'userid' => $userid, 'roleid' => $roleid])) {
        return 0;
    }
    $instance = manual_enrol_instance($courseid);
    $plugin = enrol_get_plugin('manual');
    $plugin->enrol_user($instance, $userid, $roleid);
    return 1;
}

// --- Unit -> programmes -----------------------------------------------------
$unitProgrammes = []; // unitCode => [programmeCode, ...]
foreach ($curriculum as $row) {
    $uc = strtoupper($row['courseUnitCode']);
    $pc = strtoupper($row['programmeCode']);
    if (!isset($unitProgrammes[$uc])) { $unitProgrammes[$uc] = []; }
    if (!in_array($pc, $unitProgrammes[$uc], true)) { $unitProgrammes[$uc][] = $pc; }
}

// Fallback category for units with no matching programme course.
$fallbackCat = $DB->get_field('course_categories', 'id', ['idnumber' => 'UMU-COURSE-UNITS']);
if (!$fallbackCat) {
    $cat = new stdClass();
    $cat->name = 'Course Units';
    $cat->idnumber = 'UMU-COURSE-UNITS';
    $cat->parent = 0;
    $cat->visible = 1;
    $cat->sortorder = $DB->get_field_select('course_categories', 'MAX(sortorder)', '1=1') + 1;
    $cat->timemodified = time();
    $cat->depth = 0;
    $cat->path = '';
    $cat->description = '';
    $cat->descriptionformat = FORMAT_HTML;
    $fallbackCat = $DB->insert_record('course_categories', $cat);
    $DB->update_record('course_categories', ['id' => $fallbackCat,
        'path' => '/' . $fallbackCat, 'depth' => 1]);
}
logmsg("Fallback category id: $fallbackCat");

// --- Create unit courses + mirror enrolments --------------------------------
$stats = ['courses' => 0, 'already' => 0, 'students' => 0, 'tutors' => 0, 'noprogrammes' => 0];

foreach ($courseUnits as $unit) {
    $code = strtoupper($unit['code']);
    $name = $unit['name'];

    $programmes = $unitProgrammes[$code] ?? [];
    $programmeCourses = [];
    foreach ($programmes as $pc) {
        if (isset($progCourseByShort[$pc])) { $programmeCourses[] = $progCourseByShort[$pc]; }
    }

    if (empty($programmeCourses)) {
        $stats['noprogrammes']++;
        // Create the course anyway (in fallback category) so the unit exists
        // in Moodle for the roster; enrolment mirroring just has no source.
        if (!ensure_course($name, $code, $fallbackCat, "UMU course unit $code")) {
            $stats['already']++;
        } else {
            $stats['courses']++;
        }
        continue;
    }

    // Category: reuse the first matching programme course's category.
    $category = $programmeCourses[0]->category;
    $progNames = array_map(fn($pc) => $pc->fullname, $programmeCourses);

    $existing = $DB->get_field('course', 'id', ['shortname' => $code]);
    $cid = ensure_course($name, $code, $category, "UMU course unit $code — " . implode(' | ', $progNames));
    if (!$existing) { $stats['courses']++; } else { $stats['already']++; }

    $studentIds = [];
    $tutorIds   = [];
    foreach ($programmeCourses as $pc) {
        $ctxid = context_course::instance($pc->id)->id;
        $sql = "SELECT ra.userid, r.shortname
                  FROM {role_assignments} ra
                  JOIN {context} c ON c.id = ra.contextid
                  JOIN {role} r ON r.id = ra.roleid
                 WHERE c.id = ?
                   AND r.shortname IN ('student','editingteacher','teacher')";
        foreach ($DB->get_records_sql($sql, [$ctxid]) as $ra) {
            if ($ra->shortname === 'student') { $studentIds[$ra->userid] = true; }
            else { $tutorIds[$ra->userid] = true; }
        }
    }

    foreach (array_keys($studentIds) as $uid) { $stats['students'] += enrol_in($cid, $uid, 'student'); }
    foreach (array_keys($tutorIds)   as $uid) { $stats['tutors']   += enrol_in($cid, $uid, 'editingteacher'); }
}

logmsg('');
logmsg('DONE. unit courses created: ' . $stats['courses'] . ' (already existed: ' . $stats['already'] . ')');
logmsg('enrolments added  -> students: ' . $stats['students'] . ', lecturers: ' . $stats['tutors']);
logmsg('units with no curriculum match (course created, no mirrors): ' . $stats['noprogrammes']);