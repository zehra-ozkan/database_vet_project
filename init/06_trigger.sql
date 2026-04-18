-- 1. Prevent Negative Medicine Stock

-- First, create the function
CREATE OR REPLACE FUNCTION check_negative_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantity < 0 THEN
        RAISE EXCEPTION 'Medicine stock cannot become negative.';
    END IF;
    
    -- In PostgreSQL, BEFORE triggers must return NEW so the row is updated
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Second, create the trigger
CREATE TRIGGER trg_prevent_negative_stock
BEFORE UPDATE ON Medicine
FOR EACH ROW
EXECUTE FUNCTION check_negative_stock();


-- 2. Deduct Stock After Prescribes

CREATE OR REPLACE FUNCTION deduct_stock_after_prescribes()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE Medicine
    SET quantity = quantity - 1
    WHERE medicineID = NEW.medicineID;
    
    -- AFTER triggers can just return NEW
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deduct_stock_after_prescribes
AFTER INSERT ON Prescribes
FOR EACH ROW
EXECUTE FUNCTION deduct_stock_after_prescribes();


-- 3. Synchronize Lost/Found Report

CREATE OR REPLACE FUNCTION update_chip_status_after_report()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE Chip
    SET isLost = NOT NEW.isFound
    WHERE petID = NEW.petID;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_chip_status_after_report
AFTER INSERT ON LostFoundReport
FOR EACH ROW
EXECUTE FUNCTION update_chip_status_after_report();


CREATE OR REPLACE FUNCTION check_daily_appointment_limit()
RETURNS TRIGGER AS $$
DECLARE
    appointment_count INT;
    max_limit INT := 10; -- Change this to your project's required maximum!
BEGIN
    -- Count the number of appointments for this vet on the same calendar day
    SELECT COUNT(*) INTO appointment_count
    FROM Appointment
    WHERE veterinarianID = NEW.veterinarianID
      -- We cast TIMESTAMP to DATE to ignore the time and just compare the day
      AND dateTime::DATE = NEW.dateTime::DATE;

    -- If the count is already at or above the limit, block the insertion
    IF appointment_count >= max_limit THEN
        RAISE EXCEPTION 'Veterinarian % has reached the maximum daily appointment limit of %.', NEW.veterinarianID, max_limit;
    END IF;

    -- If it's under the limit, allow the row to be inserted/updated
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_enforce_daily_limit
BEFORE INSERT OR UPDATE ON Appointment
FOR EACH ROW
EXECUTE FUNCTION check_daily_appointment_limit(); 