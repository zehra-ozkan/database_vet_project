INSERT INTO Users (userID, name, password, phoneNumber, email)
VALUES
    (-1, 'default_vet', 'password', 0000000000, 'default_vet@example.com');
INSERT INTO Veterinarian (veterinarianID, availableDates, rating, maxDailyAppointmentLimit, speciesExpertise, branchID)
VALUES
    (-1, NULL, NULL, 0, NULL, NULL);