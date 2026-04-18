-- =========================================================================
-- 1. BASE TABLES (No Foreign Keys)
-- =========================================================================

INSERT INTO Branch (branchID, location, name, specialization) VALUES
(1, '123 Main St, Ankara', 'Downtown Vet Clinic', 'General Practice'),
(2, '456 Oak Rd, Ankara', 'Suburban Animal Hospital', 'Exotics and Surgery');

INSERT INTO Users (userID, name, password, phoneNumber, email) VALUES
(1, 'Dr. Alice Smith', 'hashed_pw_1', '555-0101', 'alice@vetclinic.com'),
(2, 'Dr. Bob Jones', 'hashed_pw_2', '555-0102', 'bob@vetclinic.com'),
(3, 'Charlie Brown', 'hashed_pw_3', '555-0201', 'charlie@email.com'),
(4, 'Diana Prince', 'hashed_pw_4', '555-0202', 'diana@email.com'),
(5, 'Eve Manager', 'hashed_pw_5', '555-0301', 'eve@vetclinic.com');

-- =========================================================================
-- 2. USER ROLE TABLES
-- =========================================================================

INSERT INTO Veterinarian (veterinarianID, availableDates, rating, maxDailyAppointmentLimit, speciesExpertise, branchID) VALUES
(1, 'Mon,Wed,Fri', 4.8, 10, 'Feline, Canine', 1),
(2, 'Tue,Thu', 4.5, 8, 'Avian, Exotic', 2);

INSERT INTO PetOwner (ownerID) VALUES 
(3), 
(4);

INSERT INTO ClinicManager (managerID) VALUES 
(5);

-- =========================================================================
-- 3. PET & MEDICAL RECORDS
-- =========================================================================

INSERT INTO Pet (petID, name, sex, canBreed, age, isAlive, species, breed, ownerID) VALUES
(1, 'Snoopy', 'M', FALSE, 5, TRUE, 'Dog', 'Beagle', 3),
(2, 'Garfield', 'M', TRUE, 7, TRUE, 'Cat', 'Tabby', 4),
(3, 'Hedwig', 'F', FALSE, 3, TRUE, 'Bird', 'Owl', 4);

INSERT INTO Chip (chipID, location, isLost, petID, veterinarianID, implantationDate) VALUES
(1, 'Neck', FALSE, 1, 1, '2022-05-10'),
(2, 'Shoulder', FALSE, 2, 2, '2023-01-15');

INSERT INTO LostFoundReport (reportID, isFound, petID, createdDate) VALUES
(1, TRUE, 1, '2024-02-20');

-- We don't specify the historyID here because it auto-generates a UUID!
INSERT INTO MedicalHistory (petID, pastDiagnosis, allergies) VALUES
(1, 'Mild arthritis in back legs', 'Penicillin'),
(2, 'Overweight', 'None');

-- =========================================================================
-- 4. INVENTORY & MEDICINE
-- =========================================================================

INSERT INTO Medicine (medicineID, name, status, threshold, category, quantity, expiracyDate, branchID) VALUES
(1, 'Amoxicillin', 'safe', 10, 'antibiotic', 50, '2028-12-31', 1),
(2, 'Rabies Vaccine', 'safe', 5, 'vaccine', 20, '2027-10-01', 1),
(3, 'Painkiller Plus', 'safe', 15, 'analgesic', 100, '2029-05-01', 2);

INSERT INTO Vaccine (vaccineID, type) VALUES
(2, 'Inactivated');

INSERT INTO WasteLog (wasteLogID, medicineID, notes) VALUES
(1, 2, 'Dropped a vial of the vaccine on the floor, glass shattered.');

-- =========================================================================
-- 5. APPOINTMENTS & PLANS
-- =========================================================================

INSERT INTO VaccinationPlan (planID, nextVaccinationDate, petID, veterinarianID) VALUES
(1, '2026-05-20', 1, 1);

INSERT INTO VaccinationRecord (recordID, threshold, shotDate, frequency, nextDueDate, planID, petID) VALUES
(1, 1, '2025-05-20', 'Annual', '2026-05-20', 1, 1);

INSERT INTO Involves (recordID, vaccineID) VALUES
(1, 2);

INSERT INTO Appointment (appointmentID, aType, dateTime, vaccinationPlanID, veterinarianID, petOwnerID) VALUES
(1, 'CHECKUP', '2026-04-20 09:00:00', NULL, 1, 3),
(2, 'VACCINATION', '2026-04-20 10:00:00', 1, 1, 3),
(3, 'COMPLAINT', '2026-04-21 11:30:00', NULL, 2, 4);

-- =========================================================================
-- 6. POST-APPOINTMENT (Bills, Summaries, Prescriptions, Ratings)
-- =========================================================================

INSERT INTO VisitSummary (appointmentID, notes) VALUES
(1, 'General checkup went well. Diet plan recommended.'),
(3, 'Bird is slightly agitated. Recommended rest.');

INSERT INTO Bill (billNo, appointmentID, consultationFee, treatmentCost, medicationCost, dueDate, paid, payerID) VALUES
(101, 1, 50.00, 0.00, 0.00, '2026-05-01', TRUE, 3),
(102, 3, 75.00, 20.00, 15.00, '2026-05-05', FALSE, 4);

INSERT INTO Prescription (prescriptionID, treatment, veterinarianID, petID, prescriptionDate) VALUES
(1, 'Take 1 pill daily for a week to help with joint pain.', 1, 1, '2026-04-18');

INSERT INTO Prescribes (prescriptionID, medicineID) VALUES
(1, 3); -- Note: This will trigger your 'trg_deduct_stock_after_prescribes' trigger and reduce Painkiller Plus stock by 1!

INSERT INTO Rates (ownerID, veterinarianID, date, rating) VALUES 
(3, 1, '2026-04-18', 9);

INSERT INTO Refers (referrer, referee, referralDate, diagnosis) VALUES 
(1, 2, '2026-04-10', 'Requires specialized avian care. Transferred to suburban branch.');

-- =========================================================================
-- 7. SEQUENCE FIXES (Crucial for Postgres!)
-- =========================================================================
-- Because we hardcoded IDs (like userID 1, 2, 3) to make the foreign keys 
-- work easily, we need to tell PostgreSQL's auto-increment counters to jump 
-- ahead. Otherwise, your first insert from the frontend will crash!

SELECT setval('branch_branchid_seq', (SELECT MAX(branchID) FROM Branch));
SELECT setval('users_userid_seq', (SELECT MAX(userID) FROM Users));
SELECT setval('pet_petid_seq', (SELECT MAX(petID) FROM Pet));
SELECT setval('chip_chipid_seq', (SELECT MAX(chipID) FROM Chip));
SELECT setval('lostfoundreport_reportid_seq', (SELECT MAX(reportID) FROM LostFoundReport));
SELECT setval('medicine_medicineid_seq', (SELECT MAX(medicineID) FROM Medicine));
SELECT setval('wastelog_wastelogid_seq', (SELECT MAX(wasteLogID) FROM WasteLog));
SELECT setval('vaccinationplan_planid_seq', (SELECT MAX(planID) FROM VaccinationPlan));
SELECT setval('vaccinationrecord_recordid_seq', (SELECT MAX(recordID) FROM VaccinationRecord));
SELECT setval('appointment_appointmentid_seq', (SELECT MAX(appointmentID) FROM Appointment));
SELECT setval('prescription_prescriptionid_seq', (SELECT MAX(prescriptionID) FROM Prescription));