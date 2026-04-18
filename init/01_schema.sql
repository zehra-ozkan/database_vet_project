-- 2.1 user related tables
CREATE TABLE Branch (
    branchID SERIAL PRIMARY KEY,
    location VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    specialization VARCHAR(255)
);

CREATE TABLE Users (
    userID SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    phoneNumber VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(20) UNIQUE NOT NULL
);


CREATE TABLE PetOwner (
    ownerID INT PRIMARY KEY,
    FOREIGN KEY (ownerID) REFERENCES Users(userID) ON DELETE CASCADE
);

CREATE TABLE ClinicManager (
    managerID INT PRIMARY KEY,
    FOREIGN KEY (managerID) REFERENCES Users(userID) ON DELETE CASCADE
);

CREATE TABLE Veterinarian (
    veterinarianID INT PRIMARY KEY,
    availableDates VARCHAR(255),
    rating DECIMAL(3, 2),
    maxDailyAppointmentLimit INT,
    speciesExpertise VARCHAR(255),
    branchID INT,
    FOREIGN KEY (veterinarianID) REFERENCES Users(userID) ON DELETE CASCADE,
    FOREIGN KEY (branchID) REFERENCES Branch(branchID) ON DELETE SET NULL
);

CREATE TABLE Rates (
    ownerID INT NOT NULL,
    veterinarianID INT NOT NULL,
    date DATE NOT NULL,
    rating INT CHECK (rating BETWEEN 0 AND 10),
    PRIMARY KEY (ownerID, veterinarianID, date),
    FOREIGN KEY (ownerID) REFERENCES PetOwner(ownerID) ON DELETE CASCADE,
    FOREIGN KEY (veterinarianID) REFERENCES Veterinarian(veterinarianID) ON
    DELETE CASCADE
);

CREATE TABLE Refers (
    referrer INT NOT NULL,
    referee INT NOT NULL,
    referralDate DATE NOT NULL,
    diagnosis TEXT,
    PRIMARY KEY (referrer, referee, referralDate, diagnosis),
    FOREIGN KEY (referrer) REFERENCES Veterinarian(veterinarianID) ON DELETE
    CASCADE,
    FOREIGN KEY (referee) REFERENCES Veterinarian(veterinarianID) ON DELETE
    CASCADE
);


