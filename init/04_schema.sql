-- medicine related tables
CREATE TYPE medicine_status AS ENUM ('damaged', 'safe', 'expired');
CREATE TYPE medicine_category AS ENUM ('antibiotic', 'analgesic', 'vaccine', 'other');

CREATE TABLE Medicine (
    medicineID SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status medicine_status DEFAULT 'safe',
    threshold INT,
    category medicine_category,
    quantity INT,
    expiracyDate DATE,
    branchID INT NOT NULL,
    FOREIGN KEY (branchID) REFERENCES Branch(branchID) ON DELETE CASCADE
);

CREATE TABLE WasteLog (
    wasteLogID SERIAL PRIMARY KEY,
    medicineID INT NOT NULL,    
    notes TEXT NOT NULL,
    FOREIGN KEY (medicineID) REFERENCES Medicine(medicineID) ON DELETE CASCADE
);

CREATE TABLE Vaccine (
    vaccineID SERIAL PRIMARY KEY,
    type VARCHAR(100),
    FOREIGN KEY (vaccineID) REFERENCES Medicine(medicineID) ON DELETE CASCADE
);


CREATE TABLE VaccinationRecord (
    recordID SERIAL PRIMARY KEY,
    threshold INT,
    shotDate DATE,
    frequency VARCHAR(50),
    nextDueDate DATE,
    planID INT NOT NULL,
    petID INT NOT NULL,
    
    -- We completely remove pastDiagnosis and allergies from this table!
    
    FOREIGN KEY (planID) REFERENCES VaccinationPlan(planID) ON DELETE CASCADE,
    
    -- Now we just safely link this vaccination directly to the Pet
    FOREIGN KEY (petID) REFERENCES Pet(petID) ON DELETE CASCADE
);

CREATE TABLE Involves (
    recordID INT NOT NULL,
    vaccineID INT NOT NULL,
    PRIMARY KEY (recordID, vaccineID),
    FOREIGN KEY (recordID) REFERENCES VaccinationRecord(recordID) ON DELETE CASCADE,
    FOREIGN KEY (vaccineID) REFERENCES Vaccine(vaccineID) ON DELETE CASCADE
);

CREATE TABLE Prescription (
    prescriptionID SERIAL PRIMARY KEY,
    treatment TEXT,
    veterinarianID INT NOT NULL DEFAULT -1,
    petID INT NOT NULL,
    prescriptionDate DATE,
    
    -- Keep your veterinarian foreign key exactly as is
    FOREIGN KEY (veterinarianID) REFERENCES Veterinarian(veterinarianID) ON DELETE SET DEFAULT,
    
    -- Fix the pet foreign key by pointing only to the Pet table's ID
    FOREIGN KEY (petID) REFERENCES Pet(petID) ON DELETE CASCADE
);

CREATE TABLE Prescribes (
    prescriptionID INT NOT NULL,
    medicineID INT NOT NULL,
    PRIMARY KEY (prescriptionID, medicineID),
    FOREIGN KEY (prescriptionID) REFERENCES Prescription(prescriptionID) ON DELETE CASCADE,
    FOREIGN KEY (medicineID) REFERENCES Medicine(medicineID) ON DELETE CASCADE
);