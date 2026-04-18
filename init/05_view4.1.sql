-- Upcoming and Overdue Vaccinations
CREATE VIEW VaccinationStatusView AS
SELECT
    vr.recordID,
    vr.petID,
    p.name AS petName,
    vr.shotDate,
    vr.nextDueDate,
    m.name AS vaccineName,
    CASE
        WHEN vr.nextDueDate < CURRENT_DATE THEN 'Overdue'
        -- FIX: Added single quotes around the interval string
        WHEN vr.nextDueDate <= CURRENT_DATE + INTERVAL '30 days' THEN 'Upcoming'
        ELSE 'Normal'
    END AS vaccinationStatus
FROM VaccinationRecord vr
JOIN Pet p ON vr.petID = p.petID
JOIN Involves i ON vr.recordID = i.recordID
JOIN Vaccine v ON i.vaccineID = v.vaccineID
JOIN Medicine m ON v.vaccineID = m.medicineID;

-- low stock medicines by branch
CREATE VIEW LowStockMedicineView AS
SELECT
    medicineID,
    name AS medicineName,
    branchID,
    quantity,
    threshold,
    status,
    expiracyDate
FROM Medicine
WHERE quantity < threshold
AND status = 'safe';

-- unpaid bills of pet owners
CREATE VIEW UnpaidBillsView AS
SELECT
    payerID,
    billNo,
    appointmentID,
    dueDate,
    consultationFee,
    treatmentCost,
    medicationCost
FROM Bill
WHERE paid = FALSE;