-- =========================================================================
-- ADDITIONAL MOCK DATA
-- =========================================================================

-- Insert Users (Veterinarians and Pet Owners)
INSERT INTO Users (userID, name, password, phoneNumber, email) VALUES
(10, 'Dr. Sarah Connor', 'hashed_pw_10', '555-1001', 'sarah.connor@vetclinic.com'),
(11, 'Dr. John Smith', 'hashed_pw_11', '555-1002', 'john.smith@vetclinic.com'),
(12, 'Emily Davis', 'hashed_pw_12', '555-1003', 'emily.davis@email.com'),
(13, 'Michael Wilson', 'hashed_pw_13', '555-1004', 'michael.wilson@email.com');

-- Insert Roles
INSERT INTO Veterinarian (veterinarianID, availableDates, rating, maxDailyAppointmentLimit, speciesExpertise, branchID) VALUES
(10, 'Mon,Tue,Wed', 4.9, 12, 'Canine, Feline', 1),
(11, 'Thu,Fri,Sat', 4.7, 10, 'Small Mammals, Canine', 2);

INSERT INTO PetOwner (ownerID) VALUES
(12),
(13);

-- Insert Pets
INSERT INTO Pet (petID, name, sex, canBreed, age, isAlive, species, breed, ownerID) VALUES
(10, 'Bella', 'F', FALSE, 4, TRUE, 'Dog', 'Golden Retriever', 12),
(11, 'Max', 'M', TRUE, 2, TRUE, 'Cat', 'Siamese', 13),
(12, 'Luna', 'F', FALSE, 1, TRUE, 'Rabbit', 'Holland Lop', 13),
(13, 'Rocky', 'M', TRUE, 5, TRUE, 'Dog', 'Bulldog', 3),
(14, 'Daisy', 'F', TRUE, 3, TRUE, 'Dog', 'Poodle', 4),
(15, 'Oliver', 'M', FALSE, 6, TRUE, 'Cat', 'Maine Coon', 12),
(16, 'Chloe', 'F', FALSE, 2, TRUE, 'Cat', 'Persian', 12),
(17, 'Simba', 'M', TRUE, 4, TRUE, 'Dog', 'German Shepherd', 13);

-- Insert Chips
INSERT INTO Chip (chipID, location, isLost, petID, veterinarianID, implantationDate) VALUES
(10, 'Left Shoulder', FALSE, 10, 10, '2023-06-12'),
(11, 'Neck', FALSE, 11, 11, '2024-02-05');

-- Insert Medicines / Vaccines
INSERT INTO Medicine (medicineID, name, status, threshold, category, quantity, expiracyDate, branchID) VALUES
(10, 'Canine Parvovirus Vaccine', 'safe', 10, 'vaccine', 40, '2027-12-01', 1),
(11, 'Feline Leukemia Vaccine', 'safe', 10, 'vaccine', 30, '2027-11-15', 2);

INSERT INTO Vaccine (vaccineID, type) VALUES
(10, 'Attenuated'),
(11, 'Recombinant');

-- Insert Vaccination Plans & Records
INSERT INTO VaccinationPlan (planID, nextVaccinationDate, petID, veterinarianID) VALUES
(10, '2026-10-15', 10, 10),
(11, '2026-09-20', 11, 11);

INSERT INTO VaccinationRecord (recordID, threshold, shotDate, frequency, nextDueDate, planID, petID) VALUES
(10, 1, '2025-10-15', 'Annual', '2026-10-15', 10, 10),
(11, 1, '2025-09-20', 'Annual', '2026-09-20', 11, 11);

INSERT INTO Involves (recordID, vaccineID) VALUES
(10, 10),
(11, 11);

-- Insert Appointments (Includes the new petID column)
INSERT INTO Appointment (appointmentID, aType, dateTime, vaccinationPlanID, veterinarianID, petOwnerID, petID) VALUES
(10, 'CHECKUP', '2026-05-15 10:00:00', NULL, 10, 12, 10),
(11, 'VACCINATION', '2026-05-16 14:00:00', 11, 11, 13, 11);

-- Insert Visit Summaries
INSERT INTO VisitSummary (appointmentID, notes) VALUES
(10, 'Bella is in great health. Recommended continuing current diet.'),
(11, 'Administered Feline Leukemia Vaccine. Max behaved well.');

-- Insert Bills
INSERT INTO Bill (billNo, appointmentID, consultationFee, treatmentCost, medicationCost, dueDate, paid, payerID) VALUES
(110, 10, 60.00, 0.00, 0.00, '2026-05-30', TRUE, 12),
(111, 11, 45.00, 10.00, 25.00, '2026-05-31', FALSE, 13);

-- Update Sequences
SELECT setval('users_userid_seq', (SELECT MAX(userID) FROM Users));
SELECT setval('pet_petid_seq', (SELECT MAX(petID) FROM Pet));
SELECT setval('chip_chipid_seq', (SELECT MAX(chipID) FROM Chip));
SELECT setval('medicine_medicineid_seq', (SELECT MAX(medicineID) FROM Medicine));
SELECT setval('vaccinationplan_planid_seq', (SELECT MAX(planID) FROM VaccinationPlan));
SELECT setval('vaccinationrecord_recordid_seq', (SELECT MAX(recordID) FROM VaccinationRecord));
SELECT setval('appointment_appointmentid_seq', (SELECT MAX(appointmentID) FROM Appointment));
