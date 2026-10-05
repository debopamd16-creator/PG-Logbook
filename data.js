'use strict';
// Shared settings and built-in data. Edit this file to change defaults for everyone.

const CONFIG = {
  // Paste the Google Apps Script web-app URL here (see SETUP.md). Empty = schedules stay on this phone only.
  SYNC_URL: '',
  DEPARTMENT: 'Department of Pharmacology, AIIMS Guwahati',
  // Fingerprint (SHA-256) of the provider passkey, so the passkey itself is not readable in this public file.
  PASS_HASH: 'f7198420e02fcfcc0432f74fad804694d5fb525f2b74f1e4217b4ed18a160c9b',
  VERSION: '1.1.0'
};

const CATS = {
  attendance:   { label: 'Attendance marking',                short: 'Attendance' },
  interdept:    { label: 'Interdepartmental discussion class', short: 'Interdepartmental class' },
  ug_theory:    { label: 'UG theory class',                    short: 'UG Theory' },
  ug_practical: { label: 'UG practical class',                 short: 'UG Practical' },
  nursing:      { label: 'Nursing class',                      short: 'Nursing' },
  pg_practical: { label: 'PG practical',                       short: 'PG Practical' },
  seminar:      { label: 'Seminar',                            short: 'Seminar' },
  journal:      { label: 'Journal club',                       short: 'Journal Club' },
  pg_activity:  { label: 'PG activity',                        short: 'PG Activity' },
  conference:   { label: 'Conference / CME',                   short: 'Conference' },
  exam:         { label: 'Exam',                               short: 'Exam' },
  holiday:      { label: 'Holiday',                            short: 'Holiday' },
  other:        { label: 'Other work',                         short: 'Other' }
};

// Routine items shown automatically. days: 0 = Sunday ... 6 = Saturday. skipMonths: 1 = January ... 12 = December.
const DEFAULT_ROUTINE = [
  { id: 'att', label: 'Attendance marking', cat: 'attendance', days: [1, 2, 3, 4, 5, 6] },
  { id: 'interdept', label: 'Morning interdepartmental discussion class (8 AM)', cat: 'interdept', days: [2, 4], skipMonths: [6, 7, 12, 1] }
];

// Nursing classes run in a fixed slot that the monthly sheet does not print.
const NURSING_TIME = '2:30 PM - 3:30 PM';

// Schedules shipped with the app. A provider publishing the same type, batch and month replaces these.
// Row: [date, time, category, group, topic, faculty, JR in-charge]
const BUILTIN_SCHEDULE = (() => {
  const P = '2 PM - 4 PM', DF1 = 'Demonstration Understanding of the Use of Various Dosage Forms of Drugs-';
  const sets = {
    'ug_theory|MBBS 2025': [
      ['2026-10-01', '8 AM', 'ug_theory', 'MBBS 2025', 'Pharmacodynamics-2', 'Dr Satyajit Mohapatra', ''],
      ['2026-10-05', '9 AM', 'ug_theory', 'MBBS 2025', 'Factors Modifying Drug Action - Seminar', 'Moderator: Dr Dibyajyoti Saikia', ''],
      ['2026-10-08', '8 AM', 'ug_theory', 'MBBS 2025', 'Fixed Dose Combinations & Rational Prescribing', 'Dr Harish Kumar', ''],
      ['2026-10-12', '9 AM', 'ug_theory', 'MBBS 2025', 'Introduction to ANS, cholinergic system - transmitter, receptors, actions', 'Dr Satyajit Mohapatra', ''],
      ['2026-10-15', '8 AM', 'ug_theory', 'MBBS 2025', 'Cholinergic Drugs-1', 'Dr Joonmoni Lahon', ''],
      ['2026-10-19', '9 AM', 'ug_theory', 'MBBS 2025', 'Cholinergic Drugs-2', 'Dr Phulen Sarma', ''],
      ['2026-10-22', '8 AM', 'ug_theory', 'MBBS 2025', 'Anticholinergic Drugs-1', 'Dr Joonmoni Lahon', ''],
      ['2026-10-26', '9 AM', 'ug_theory', 'MBBS 2025', 'Anticholinergic Drugs-2', 'Dr Joonmoni Lahon', ''],
      ['2026-10-29', '8 AM', 'ug_theory', 'MBBS 2025', 'Adrenergic Drugs-1', 'Dr Dibyajyoti Saikia', '']
    ],
    'ug_practical|MBBS 2025': [
      ['2026-10-05', P, 'ug_practical', 'MBBS 2025 - Batch B', DF1 + '1', 'Dr Joonmoni Lahon', 'Dr Anuj'],
      ['2026-10-12', P, 'ug_practical', 'MBBS 2025 - Batch B', DF1 + '2', 'Dr Joonmoni Lahon', 'Dr Karansen'],
      ['2026-10-19', P, 'ug_practical', 'MBBS 2025 - Batch B', DF1 + '3', 'Dr Dibyajyoti Saikia', 'Dr Bipasha'],
      ['2026-10-26', P, 'ug_practical', 'MBBS 2025 - Batch B', 'Demonstration the Use of Various Drug Delivery Devices-1', 'Dr Phulen Sarma', 'Dr Pooja'],
      ['2026-10-06', P, 'ug_practical', 'MBBS 2025 - Batch A', DF1 + '1', 'Dr Joonmoni Lahon', 'Dr Anuj'],
      ['2026-10-13', P, 'ug_practical', 'MBBS 2025 - Batch A', DF1 + '2', 'Dr Joonmoni Lahon', 'Dr Karansen'],
      ['2026-10-27', P, 'ug_practical', 'MBBS 2025 - Batch A', DF1 + '3', 'Dr Dibyajyoti Saikia', 'Dr Bipasha']
    ],
    'ug_theory|MBBS 2024': [
      ['2026-10-06', '9 AM', 'ug_theory', 'MBBS 2024', 'Broad-spectrum antimicrobial agents', 'Dr Joonmoni Lahon', ''],
      ['2026-10-07', '8 AM', 'ug_theory', 'MBBS 2024', 'Quinolones', 'Dr Phulen Sarma', ''],
      ['2026-10-13', '9 AM', 'ug_theory', 'MBBS 2024', 'Sulphonamides & Cotrimoxazole', 'Dr Joonmoni Lahon', ''],
      ['2026-10-14', '8 AM', 'ug_theory', 'MBBS 2024', 'Macrolides', 'Dr Dibyajyoti Saikia', ''],
      ['2026-10-21', '8 AM', 'ug_theory', 'MBBS 2024', 'Antileprotic Drugs', 'Dr Harish', ''],
      ['2026-10-24', '10 AM - 1 PM', 'ug_theory', 'MBBS 2024', 'Part Completion: GIT', 'In Charge Faculty: Dr Harish Kumar', ''],
      ['2026-10-27', '9 AM', 'ug_theory', 'MBBS 2024', 'Lincosamide, Glycopeptide, Oxazolidinones & Newer Antimicrobial Agents - Seminar', 'Moderator: Dr Phulen Sarma', ''],
      ['2026-10-28', '8 AM', 'ug_theory', 'MBBS 2024', 'Antitubercular Drugs-1', 'Dr Dibyajyoti Saikia', '']
    ],
    'ug_practical|MBBS 2024': [
      ['2026-10-07', P, 'ug_practical', 'MBBS 2024 - Batch B', 'Therapeutic Problem-4 (GIT)', 'Dr Joonmoni Lahon', 'Dr Karansen'],
      ['2026-10-14', P, 'ug_practical', 'MBBS 2024 - Batch B', 'Prescription Writing - GIT', 'Dr Joonmoni Lahon', 'Dr Debopam'],
      ['2026-10-21', P, 'ug_practical', 'MBBS 2024 - Batch B', 'Therapeutic Problem-5 (Common Infectious diseases)', 'Dr Phulen Sarma', 'Dr Debopam'],
      ['2026-10-28', P, 'ug_practical', 'MBBS 2024 - Batch B', 'Criticise, Correct and Rewrite (CCR) Prescriptions-4', 'Dr Harish Kumar', 'Dr Bipasha'],
      ['2026-10-01', P, 'ug_practical', 'MBBS 2024 - Batch A', 'Preparing and Explaining a List of P-drugs for a given Case/Condition-2', 'Dr Dibyajyoti Saikia', 'Dr Anuj'],
      ['2026-10-08', P, 'ug_practical', 'MBBS 2024 - Batch A', 'Therapeutic Problem-4 (GIT)', 'Dr Joonmoni Lahon', 'Dr Karansen'],
      ['2026-10-15', P, 'ug_practical', 'MBBS 2024 - Batch A', 'Prescription Writing - GIT', 'Dr Joonmoni Lahon', 'Dr Debopam'],
      ['2026-10-22', P, 'ug_practical', 'MBBS 2024 - Batch A', 'Therapeutic Problem-5 (Common Infectious diseases)', 'Dr Phulen Sarma', 'Dr Debopam'],
      ['2026-10-29', P, 'ug_practical', 'MBBS 2024 - Batch A', 'Criticise, Correct and Rewrite (CCR) Prescriptions-4', 'Dr Harish Kumar', 'Dr Bipasha']
    ],
    // The nursing sheet gives no class time, so the fixed slot is used; the facilitator is the PGT taking the class.
    'nursing|BSc Nursing 2025': [
      ['2026-10-01', NURSING_TIME, 'nursing', 'BSc Nursing 2025', 'Adrenergic and anti-adrenergic drugs; Cholinergic and anticholinergic; Vasodilators', '', 'Dr Pooja'],
      ['2026-10-07', NURSING_TIME, 'nursing', 'BSc Nursing 2025', 'Hypolipidemics; Haematinics & treatment of anaemia; Plasma expanders & treatment of shock', '', 'Dr Anuj'],
      ['2026-10-08', NURSING_TIME, 'nursing', 'BSc Nursing 2025', 'Drugs acting on renin-angiotensin-aldosterone; Antihypertensives; Antiarrhythmics; CHF', '', 'Dr Bipasha'],
      ['2026-10-14', NURSING_TIME, 'nursing', 'BSc Nursing 2025', 'Coagulants & anticoagulants; Antiplatelets & thrombolytics; Anti-anginal drugs', '', 'Dr Karansen'],
      ['2026-10-15', NURSING_TIME, 'nursing', 'BSc Nursing 2025', 'Insulins & oral hypoglycaemics', '', 'Dr Pooja'],
      ['2026-10-21', NURSING_TIME, 'nursing', 'BSc Nursing 2025', 'Steroids: corticosteroids, anabolic steroids, topical steroids', '', 'Dr Anuj'],
      ['2026-10-22', NURSING_TIME, 'nursing', 'BSc Nursing 2025', 'Calcium metabolism: Calcitonin, Parathormone, Vitamin D3', '', 'Dr Bipasha'],
      ['2026-10-28', NURSING_TIME, 'nursing', 'BSc Nursing 2025', 'General principles for use of antimicrobials; Penicillin, Cephalosporins, Macrolides, Sulfonamide, Quinolones, Misc. antimicrobials, Anaerobic infections', '', 'Dr Karansen'],
      ['2026-10-29', NURSING_TIME, 'nursing', 'BSc Nursing 2025', 'Anthelminthics', '', 'Dr Pooja']
    ]
  };
  return Object.entries(sets).flatMap(([src, rows]) => rows.map(([date, time, cat, batch, title, faculty, jr]) => ({ src, date, time, cat, batch, title, faculty, jr })));
})();

// 2026: closed holidays for Central Government offices in Assam (list issued by CDA Guwahati).
// 2027: the 14 compulsory holidays from the DoPT order of 16 July 2026. The 3 locally chosen
// holidays for Guwahati (usually Magh Bihu, Holi, Bohag Bihu) are not announced yet - add them when they are.
const DEFAULT_HOLIDAYS = [
  { date: '2026-01-14', title: 'Magh Bihu' },
  { date: '2026-01-26', title: 'Republic Day' },
  { date: '2026-03-04', title: 'Holi' },
  { date: '2026-03-21', title: 'Id-ul-Fitr' },
  { date: '2026-03-31', title: 'Mahavir Jayanti' },
  { date: '2026-04-03', title: 'Good Friday' },
  { date: '2026-04-15', title: 'Bohag Bihu' },
  { date: '2026-05-01', title: 'Buddha Purnima' },
  { date: '2026-05-27', title: 'Id-ul-Zuha (Bakrid)' },
  { date: '2026-06-26', title: 'Muharram' },
  { date: '2026-08-15', title: 'Independence Day' },
  { date: '2026-08-26', title: 'Milad-un-Nabi' },
  { date: '2026-10-02', title: "Mahatma Gandhi's Birthday" },
  { date: '2026-10-20', title: 'Dussehra' },
  { date: '2026-11-08', title: 'Diwali' },
  { date: '2026-11-24', title: "Guru Nanak's Birthday" },
  { date: '2026-12-25', title: 'Christmas Day' },
  { date: '2027-01-26', title: 'Republic Day' },
  { date: '2027-03-10', title: 'Id-ul-Fitr' },
  { date: '2027-03-26', title: 'Good Friday' },
  { date: '2027-04-19', title: 'Mahavir Jayanti' },
  { date: '2027-05-17', title: 'Id-ul-Zuha (Bakrid)' },
  { date: '2027-05-20', title: 'Buddha Purnima' },
  { date: '2027-06-16', title: 'Muharram' },
  { date: '2027-08-15', title: 'Independence Day / Milad-un-Nabi' },
  { date: '2027-10-02', title: "Mahatma Gandhi's Birthday" },
  { date: '2027-10-09', title: 'Dussehra' },
  { date: '2027-10-29', title: 'Diwali' },
  { date: '2027-11-14', title: "Guru Nanak's Birthday" },
  { date: '2027-12-25', title: 'Christmas Day' }
];
