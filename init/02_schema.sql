-- pet related tables

-- 1. Create the custom ENUM type first
CREATE TYPE animal_sex AS ENUM ('F', 'M');

-- 2. Then create your table using that type
CREATE TABLE Pet (
    petID SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    sex animal_sex NOT NULL DEFAULT 'F', -- Use the custom type here
    canBreed BOOLEAN,
    age INT,
    isAlive BOOLEAN,
    species VARCHAR(100),
    breed VARCHAR(100),
    ownerID INT NOT NULL,
    FOREIGN KEY (ownerID) REFERENCES PetOwner(ownerID) ON DELETE CASCADE
);
CREATE TABLE LostFoundReport (
    reportID SERIAL PRIMARY KEY,
    isFound BOOLEAN DEFAULT TRUE,
    petID INT NOT NULL,
    createdDate DATE NOT NULL,
    FOREIGN KEY (petID) REFERENCES Pet(petID) ON DELETE CASCADE
);

CREATE TABLE Chip (
    chipID SERIAL PRIMARY KEY,
    location VARCHAR(255),
    isLost BOOLEAN DEFAULT FALSE,
    petID INT NOT NULL,
    veterinarianID INT NOT NULL DEFAULT -1,
    implantationDate DATE,
    FOREIGN KEY (petID) REFERENCES Pet(petID) ON DELETE CASCADE,
    FOREIGN KEY (veterinarianID) REFERENCES Veterinarian(veterinarianID) ON DELETE SET DEFAULT
);

CREATE TABLE MedicalHistory (
    -- Use the UUID type and tell Postgres to auto-generate it
    historyID UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    petID INT NOT NULL,
    pastDiagnosis TEXT,
    allergies TEXT,
    FOREIGN KEY (petID) REFERENCES Pet(petID) ON DELETE CASCADE
);
