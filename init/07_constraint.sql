-- A Pet Can Have At Most One Chip

ALTER TABLE Chip
ADD CONSTRAINT uq_chip_pet
UNIQUE (petID);

-- Non-Negative Medicine Quantity and Threshold

ALTER TABLE Medicine
ADD CONSTRAINT chk_medicine_nonnegative
CHECK (quantity >= 0 AND threshold >= 0);

--- Valid Rating Range
ALTER TABLE Rates
ADD CONSTRAINT chk_rating_range
CHECK (rating BETWEEN 0 AND 10);