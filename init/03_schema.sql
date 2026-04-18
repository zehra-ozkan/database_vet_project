-- appointment tables
CREATE TABLE VaccinationPlan (
    planID SERIAL PRIMARY KEY,
    nextVaccinationDate DATE,
    petID INT NOT NULL,
    veterinarianID INT NOT NULL DEFAULT -1,
    FOREIGN KEY (petID) REFERENCES Pet(petID) ON DELETE CASCADE,
    FOREIGN KEY (veterinarianID) REFERENCES Veterinarian(veterinarianID) ON DELETE SET DEFAULT
);
CREATE TYPE appointment_type AS ENUM ('CHECKUP', 'VACCINATION', 'COMPLAINT', 'EMERGENCY');

CREATE TABLE Appointment (
    appointmentID SERIAL PRIMARY KEY,
    aType appointment_type NOT NULL DEFAULT 'CHECKUP',
    dateTime TIMESTAMP NOT NULL,
    vaccinationPlanID INT,
    veterinarianID INT NOT NULL,
    petOwnerID INT NOT NULL,
    FOREIGN KEY (vaccinationPlanID) REFERENCES VaccinationPlan(planID) ON DELETE SET NULL,
    FOREIGN KEY (veterinarianID) REFERENCES Veterinarian(veterinarianID) ON DELETE CASCADE,
    FOREIGN KEY (petOwnerID) REFERENCES PetOwner(ownerID) ON DELETE CASCADE
);


CREATE TABLE Recommended (
    veterinarianID INT NOT NULL,
    appointmentID INT NOT NULL,
    PRIMARY KEY (veterinarianID, appointmentID),
    FOREIGN KEY (veterinarianID) REFERENCES Veterinarian(veterinarianID) ON DELETE CASCADE,
    FOREIGN KEY (appointmentID) REFERENCES Appointment(appointmentID) ON DELETE CASCADE
);

CREATE TABLE VisitSummary (
    visitID UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    appointmentID INT NOT NULL,
    notes TEXT NOT NULL,
    FOREIGN KEY (appointmentID) REFERENCES Appointment(appointmentID) ON DELETE CASCADE
);

CREATE TABLE Bill (
    billNo INT NOT NULL,
    appointmentID INT NOT NULL,
    consultationFee DECIMAL(10, 2) DEFAULT 0,
    treatmentCost DECIMAL(10, 2) DEFAULT 0,
    medicationCost DECIMAL(10, 2) DEFAULT 0,
    dueDate DATE,
    paid BOOLEAN DEFAULT FALSE,
    payerID INT NOT NULL,
    PRIMARY KEY (billNo, appointmentID),
    FOREIGN KEY (appointmentID) REFERENCES Appointment(appointmentID) ON
    DELETE CASCADE,
    FOREIGN KEY (payerID) REFERENCES PetOwner(ownerID) ON DELETE CASCADE
);