UMU ATTENDANCE SYSTEM - DEMO DATA
==================================

This folder contains ready-to-upload CSV files for realistic UMU Nkozi Campus demo data.

IMPORT ORDER (REQUIRED)
-----------------------
Upload these files in this exact order through the System Admin dashboard:

1. faculties.csv         → Academic Structure
2. programmes.csv        → Academic Structure  
3. course_units.csv      → Academic Structure
4. curriculum.csv        → Academic Structure
5. staff.csv             → CSV Imports → Lecturer Accounts (emails only)
6. students.csv          → CSV Imports → Student Accounts

CONTENTS SUMMARY
----------------
• 6 Faculties (FBAM, FED, FHS, FASS, FSC, FAGR) under Nkozi Campus (NKZ)
• 25 Programmes across all faculties
• 173 Course Units with realistic codes and names
• 611 standing curriculum mappings covering Years 1-4 and Semesters 1-2
• 33 Staff members:
  - 6 Faculty Admins (one per faculty)
  - 27 Lecturers (4-5 per faculty)
  - All linked to their faculty via facultyCode
• 4,004 sample student email accounts in students.csv

DEFAULT CREDENTIALS
-------------------
All imported accounts use the system default password and must change it on first login.

ACADEMIC PERIOD
---------------
Set the active academic year and semester in Global Settings before students
complete their profiles. This determines the period used when the system enrols
each student into curriculum units.

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
- Students are imported by email only. At first sign-in, each student completes
  their profile; the system then creates the appropriate curriculum enrolments.
- All emails follow UMU domain rules:
  - Staff: @umu.ac.ug
  - Students: @stud.umu.ac.ug
- CSV formats:
  - Staff (lecturers): email — one per row. Faculty admins are imported separately (email,facultyCode).
  - Students: email
  - Curriculum: courseUnitCode,programmeCode,year,semester

For questions, refer to docs/08-deployment-guide.md in the main repository.
