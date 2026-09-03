<?php
// =============================================================================
// Uganda Martyrs University - Moodle Web Services setup (idempotent)
//
// Prepares a Moodle instance for the UMU Attendance System sync:
//   1. Enables Web Services + the REST protocol
//   2. Creates the custom external service "UMU Attendance Sync"
//      (shortname: umu_attendance_sync) with the function set from
//      docs/12-moodle-integration-plan.md $2.2
//   3. Creates the service account user `umu_sync_admin` (manual auth)
//   4. Assigns the system Manager role so the token can read all users/enrolments
//   5. Creates/reuses a permanent token and prints it
//
// Deploy + run on the Moodle server:
//   docker cp setup-webservice.php umu-moodle:/var/www/html/admin/cli/setup-webservice.php
//   docker exec -u www-data umu-moodle php /var/www/html/admin/cli/setup-webservice.php
//
// Idempotent: re-running reuses the existing service/user/token.
// =============================================================================

define('CLI_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/adminlib.php');
require_once($CFG->libdir . '/moodlelib.php');
require_once($CFG->libdir . '/accesslib.php');

$DB = $GLOBALS['DB'];

mtrace('');
mtrace('== UMU Moodle Web Services setup ==');
mtrace('Moodle site: ' . $CFG->wwwroot);

// --- 1. Enable Web Services + REST protocol ---------------------------------
set_config('enablewebservices', '1');
if (empty($CFG->webserviceprotocols)) {
    set_config('webserviceprotocols', 'rest');
} else {
    $active = array_map('trim', explode(',', $CFG->webserviceprotocols));
    if (!in_array('rest', $active)) {
        $active[] = 'rest';
    }
    set_config('webserviceprotocols', implode(',', $active));
}
set_config('enablewsdocumentation', '0');
mtrace('[1/5] Web services enabled, REST protocol active (config saved in DB).');

// --- 2. Custom external service + functions ---------------------------------
$SERVICE_SHORTNAME = 'umu_attendance_sync';

$functions = [
    'core_webservice_get_site_info',      // Verify token works
    'core_course_get_courses',            // Fetch all courses
    'core_course_get_courses_by_field',   // Fetch courses by category
    'core_course_get_categories',         // Category tree (faculties/programmes)
    'core_course_get_contents',           // Activities per course
    'core_user_get_users_by_field',       // Lookup users by email/username
    'core_user_get_users_by_id',          // User details by ID
    'core_user_get_course_user_profiles', // Roles within a course context
    'core_enrol_get_enrolled_users',      // Paginated roster per course
    'core_enrol_get_users_courses',       // A user's course list
];

$service = $DB->get_record('external_services', ['shortname' => $SERVICE_SHORTNAME]);
if (!$service) {
    $service = new stdClass();
    $service->name             = 'UMU Attendance Sync';
    $service->shortname        = $SERVICE_SHORTNAME;
    $service->enabled          = 1;
    $service->restrictedusers  = 0;
    $service->downloadfiles    = 0;
    $service->uploadfiles      = 0;
    $service->requiredcapability = null;
    $service->component        = '';
    $service->timecreated      = time();
    $service->timemodified     = time();
    $service->id = $DB->insert_record('external_services', $service);
    mtrace("[2/5] Created external service: {$service->name} (#{$service->id})");
} else {
    $service->enabled = 1;
    $DB->update_record('external_services', $service);
    mtrace("[2/5] External service already exists (#{$service->id}) — enabled.");
}

$added = 0;
foreach ($functions as $fn) {
    if (!$DB->record_exists('external_services_functions', [
        'externalserviceid' => $service->id,
        'functionname'      => $fn,
    ])) {
        $DB->insert_record('external_services_functions', [
            'externalserviceid' => $service->id,
            'functionname'      => $fn,
        ]);
        $added++;
    }
}
mtrace("[2/5] Functions attached: {$added} added, " . (count($functions) - $added) . " already present.");

// --- 3. Service account user ------------------------------------------------
$USERNAME = 'umu_sync_admin';
$user = $DB->get_record('user', ['username' => $USERNAME]);
if (!$user) {
    $pass = bin2hex(random_bytes(12));
    $user = create_user_record($USERNAME, $pass, 'manual', false, true);
    if (!$user) {
        mtrace('ERROR: could not create service account user.');
        exit(1);
    }
    mtrace("[3/5] Created service account user: {$USERNAME} (generated password, never used for login).");
} else {
    mtrace("[3/5] Service account user already exists ({$USERNAME}).");
}
// Moodle refuses web-service calls from users whose profile is not "fully set
// up" (empty firstname/lastname/email triggers errorcoursecontextnotvalid).
$user->firstname = 'UMU';
$user->lastname  = 'Sync';
$user->email     = 'umu_sync@umu.ac.ug';
$user->confirmed = 1;
$user->maildisplay = 1;
$user->timemodified = time();
$DB->update_record('user', $user);

// --- 4. Manager role (system context) for full read access ------------------
$sysctx = context_system::instance();
$managerRole = $DB->get_record('role', ['shortname' => 'manager']);
if (!$managerRole) {
    mtrace('ERROR: system Manager role not found.');
    exit(1);
}
if (!$DB->record_exists('role_assignments', [
    'roleid'    => $managerRole->id,
    'contextid' => $sysctx->id,
    'userid'    => $user->id,
])) {
    role_assign($managerRole->id, $user->id, $sysctx->id);
    mtrace('[4/5] Assigned Manager role at system context.');
} else {
    mtrace('[4/5] Manager role already assigned.');
}

// --- 5. Permanent token -----------------------------------------------------
$token = $DB->get_record('external_tokens', [
    'userid'             => $user->id,
    'externalserviceid'  => $service->id,
    'tokentype'          => 0, // EXTERNAL_TOKEN_PERMANENT
]);
if (!$token) {
    $admin = get_admin();
    $token = new stdClass();
    $token->token             = bin2hex(random_bytes(32)); // 64 hex chars
    $token->tokentype         = 0;
    $token->userid            = $user->id;
    $token->externalserviceid = $service->id;
    $token->sid               = null;
    $token->contextid         = $sysctx->id;
    $token->creatorid         = $admin->id;
    $token->timecreated       = time();
    $token->validuntil        = 0;
    $token->id = $DB->insert_record('external_tokens', $token);
    mtrace('[5/5] Issued new permanent token.');
} else {
    mtrace('[5/5] Reusing existing permanent token.');
}

mtrace('');
mtrace('=============================================================');
mtrace(' Setup complete. Use these values in the attendance server:');
mtrace('   MOODLE_BASE_URL=' . $CFG->wwwroot);
mtrace('   MOODLE_WS_TOKEN=' . $token->token);
mtrace('=============================================================');
mtrace('');

// Smoke test: call core_webservice_get_site_info -------------------------
mtrace('Smoke test: POST core_webservice_get_site_info ...');
$ch = curl_init();
// IMPORTANT: build the query string manually. Moodle sets
// ini arg_separator.output='&amp;', which would otherwise make
// http_build_query emit '&amp;' and break the REST body.
curl_setopt_array($ch, [
    CURLOPT_URL => $CFG->wwwroot . '/webservice/rest/server.php',
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => 'wstoken=' . urlencode($token->token)
        . '&wsfunction=core_webservice_get_site_info'
        . '&moodlewsrestformat=json',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 15,
    // Practice servers use a self-signed cert; the smoke test only proves the
    // token/service are set up. The attendance app trusts this same cert via
    // NODE_EXTRA_CA_CERTS, so real TLS verification still happens there.
    CURLOPT_SSL_VERIFYPEER => false,
]);
$resp = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$json = json_decode($resp, true);
if ($code == 200 && isset($json['sitename'])) {
    mtrace('PASS: token works — site "'.$json['sitename'].'" ('.$json['siteurl'].')');
} else {
    mtrace('FAILED smoke test (HTTP '.$code.'): ' . substr($resp, 0, 300));
    mtrace('Check that the cert SAN matches MOODLE_URL (see docs/13-moodle-deployment-guide.md).');
    exit(1);
}