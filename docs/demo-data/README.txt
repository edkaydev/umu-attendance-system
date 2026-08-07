UMU ATTENDANCE SYSTEM - DEMO DATA
==================================

This folder contains complete, ready-to-upload CSV files to populate the 
UMU Attendance System database with realistic demo data for Nkozi Campus.

IMPORT ORDER (REQUIRED)
-----------------------
Upload these files in this exact order through the System Admin dashboard:

1. faculties.csv         → Academic Structure
2. programmes.csv        → Academic Structure  
3. course_units.csv      → Academic Structure
4. curriculum.csv        → Academic Structure
5. staff.csv             → CSV Imports → Staff Accounts
6. students.csv          → CSV Imports → Student Accounts

CONTENTS SUMMARY
----------------
• 6 Faculties (FBAM, FED, FHS, FASS, FSC, FAGR) under Nkozi Campus (NKZ)
• 25 Programmes across all faculties
• 173 Course Units with realistic codes and names
• 612 Curriculum mappings for academic year 2025/2026, Semesters 1 & 2,
  covering Years 1-4 for every programme
• 33 Staff members:
  - 6 Faculty Admins (one per faculty)
  - 27 Lecturers (4-5 per faculty)
  - All linked to their faculty via facultyCode
• 4,000 sample Students (students.csv):
  - Distributed across all 6 faculties and 25 programmes
  - Realistic Ugandan names with name-based emails
    (firstname.lastname@stud.umu.ac.ug) — no duplicates
  - Realistic registration numbers (e.g. 2024-B101-00001: intake year +
    programme number + sequence) — intake years 2022-2025 give a proper
    spread across Years 1-4
• students-zeevarsity-sample.csv: a sample Zeevarsity export (Student No,
  Registration No, First Name, Last Name, Gender, Program Code, Year of
  Study, Academic Year, Status) to test the direct Zeevarsity import path.
  Real Zeevarsity exports can be uploaded WITHOUT any cleaning — emails are
  generated automatically and the year of study is computed from the first
  4 digits of the Registration No.

DEFAULT CREDENTIALS
-------------------
All users (staff and students) have the password: Umu@2026
They will be required to change it on first login.

ACADEMIC PERIOD
---------------
Students are enrolled into the period set in Global Settings BEFORE importing.
Set it to:
  Academic Year: 2025/2026
  Semester: 1
(The system defaults to the current academic year + Semester 1 if unset, so
importing without touching Global Settings also works while the default is
2025/2026.)

NEXT STEPS
----------
1. Faculty Admins can assign lecturers to their course units
2. Lecturers can open attendance sessions
3. Students can check in using session codes
4. Faculty Admins can generate reports

NOTES
-----
- Staff are linked to faculties but lecturers have NO course unit assignments 
  (this is done by Faculty Admins after import)
- Students have complete profiles and automatic curriculum enrollments
- All emails follow UMU domain rules:
  - Staff: @umu.ac.ug
  - Students: @stud.umu.ac.ug
- Student CSV accepts two formats:
  1. Native:    name,email,facultyCode,programmeCode,regNumber,password
     (regNumber + password optional; facultyCode optional — derived from the
     programme if omitted)
  2. Zeevarsity: firstname,lastname,registrationNo,programCode,yearOfStudy
     (+ optional email). Headers are case-insensitive and spaces are ignored.
- The bundled students.csv uses the native format with realistic reg numbers
  pre-filled. Students can still edit their reg number in their profile.
- Year of study is determined by the system: intake year (first 4 digits of
  the registration number) vs the current academic year. E.g. a 2024 intake
  in 2025/2026 = Year 2. Falls back to the yearOfStudy column, then Year 1.
  The bundled students.csv therefore spans Years 1-4 (intakes 2025-2022).

For questions, refer to docs/08-deployment-guide.md in the main repository.
