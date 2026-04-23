import os
from datetime import date, datetime
from decimal import Decimal

import psycopg2
from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

manager_bp = Blueprint("manager", __name__)
DB_URL = os.environ.get("DATABASE_URL")


def get_db_connection():
    return psycopg2.connect(DB_URL)


def serialize_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def serialize_rows(rows):
    return [
        {key: serialize_value(value) for key, value in dict(row).items()}
        for row in rows
    ]


def fetch_all(query, params=None):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(query, params or ())
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return serialize_rows(rows)


def fetch_one(query, params=None):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(query, params or ())
    row = cur.fetchone()
    cur.close()
    conn.close()
    if row is None:
        return None
    return {key: serialize_value(value) for key, value in dict(row).items()}


def money_sum_expression():
    return "COALESCE(consultationFee, 0) + COALESCE(treatmentCost, 0) + COALESCE(medicationCost, 0)"


@manager_bp.route("/api/manager/dashboard/summary", methods=["GET"])
def dashboard_summary():
    total_expr = money_sum_expression()
    summary = fetch_one(
        f"""
        SELECT
            (SELECT COUNT(*) FROM Medicine WHERE quantity <= COALESCE(threshold, 0)) AS lowStockItems,
            (SELECT COUNT(*) FROM Medicine WHERE status IN ('expired', 'damaged')) AS expiredDamagedItems,
            (SELECT COUNT(*) FROM VaccinationRecord WHERE nextDueDate < CURRENT_DATE) AS overdueVaccinations,
            (SELECT COALESCE(SUM({total_expr}), 0) FROM Bill WHERE paid = FALSE) AS unpaidBillsTotal
        """
    )
    return jsonify(summary)


@manager_bp.route("/api/manager/dashboard/alerts", methods=["GET"])
def dashboard_alerts():
    total_expr = money_sum_expression()
    low_stock = fetch_all(
        """
        SELECT m.medicineID, m.name, m.quantity, m.threshold, b.name AS branch
        FROM Medicine m
        JOIN Branch b ON b.branchID = m.branchID
        WHERE m.quantity <= COALESCE(m.threshold, 0)
        ORDER BY m.quantity ASC, m.name ASC
        LIMIT 5
        """
    )
    vaccinations = fetch_all(
        """
        SELECT vr.recordID, p.name AS petName, u.name AS ownerName, vr.nextDueDate
        FROM VaccinationRecord vr
        JOIN Pet p ON p.petID = vr.petID
        JOIN Users u ON u.userID = p.ownerID
        WHERE vr.nextDueDate < CURRENT_DATE
        ORDER BY vr.nextDueDate ASC
        LIMIT 5
        """
    )
    bills = fetch_all(
        f"""
        SELECT b.billNo, b.appointmentID, u.name AS ownerName, b.dueDate, {total_expr} AS total
        FROM Bill b
        JOIN Users u ON u.userID = b.payerID
        WHERE b.paid = FALSE
        ORDER BY b.dueDate ASC NULLS LAST
        LIMIT 5
        """
    )
    return jsonify({"lowStock": low_stock, "vaccinations": vaccinations, "bills": bills})


@manager_bp.route("/api/manager/dashboard/low-stock-preview", methods=["GET"])
def low_stock_preview():
    rows = fetch_all(
        """
        SELECT
            m.medicineID,
            m.name,
            m.category::text AS category,
            b.name AS branch,
            m.quantity,
            m.threshold,
            m.expiracyDate AS expiryDate,
            m.status::text AS status
        FROM Medicine m
        JOIN Branch b ON b.branchID = m.branchID
        WHERE m.quantity <= COALESCE(m.threshold, 0)
        ORDER BY m.quantity ASC, m.name ASC
        LIMIT 8
        """
    )
    return jsonify(rows)


@manager_bp.route("/api/manager/dashboard/recent-activity", methods=["GET"])
def recent_activity():
    total_expr = money_sum_expression()
    rows = fetch_all(
        f"""
        SELECT * FROM (
            SELECT
                'Waste log' AS type,
                wl.wasteLogID::text AS reference,
                m.name || ': ' || wl.notes AS description,
                NULL::date AS activityDate
            FROM WasteLog wl
            JOIN Medicine m ON m.medicineID = wl.medicineID
            UNION ALL
            SELECT
                'Bill' AS type,
                b.billNo::text AS reference,
                u.name || ' invoice total ' || ({total_expr})::text AS description,
                b.dueDate AS activityDate
            FROM Bill b
            JOIN Users u ON u.userID = b.payerID
            UNION ALL
            SELECT
                a.aType::text AS type,
                a.appointmentID::text AS reference,
                'Appointment with ' || vu.name AS description,
                a.dateTime::date AS activityDate
            FROM Appointment a
            JOIN Users vu ON vu.userID = a.veterinarianID
        ) activity
        ORDER BY activityDate DESC NULLS LAST, reference DESC
        LIMIT 8
        """
    )
    return jsonify(rows)


@manager_bp.route("/api/manager/inventory", methods=["GET"])
def inventory():
    clauses = []
    params = []

    branch = request.args.get("branch")
    name = request.args.get("name")
    category = request.args.get("category")
    status = request.args.get("status")
    expiry = request.args.get("expiry")
    sort = request.args.get("sort", "name")

    if branch:
        clauses.append("m.branchID = %s")
        params.append(branch)
    if name:
        clauses.append("LOWER(m.name) LIKE LOWER(%s)")
        params.append(f"%{name}%")
    if category:
        clauses.append("m.category::text = %s")
        params.append(category)
    if status == "low_stock":
        clauses.append("m.quantity <= COALESCE(m.threshold, 0)")
    elif status:
        clauses.append("m.status::text = %s")
        params.append(status)
    if expiry == "expired":
        clauses.append("m.expiracyDate < CURRENT_DATE")
    elif expiry == "soon":
        clauses.append("m.expiracyDate BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'")

    sort_map = {
        "name": "m.name ASC",
        "quantity": "m.quantity ASC",
        "expiry": "m.expiracyDate ASC NULLS LAST",
        "branch": "b.name ASC",
    }
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = fetch_all(
        f"""
        SELECT
            m.medicineID,
            m.name,
            m.category::text AS category,
            b.branchID,
            b.name AS branch,
            m.quantity,
            m.threshold,
            m.expiracyDate AS expiryDate,
            m.status::text AS status,
            CASE
                WHEN m.status <> 'safe' THEN m.status::text
                WHEN m.expiracyDate < CURRENT_DATE THEN 'expired'
                WHEN m.quantity <= COALESCE(m.threshold, 0) THEN 'low_stock'
                ELSE 'safe'
            END AS displayStatus
        FROM Medicine m
        JOIN Branch b ON b.branchID = m.branchID
        {where}
        ORDER BY {sort_map.get(sort, sort_map["name"])}
        """,
        tuple(params),
    )
    return jsonify(rows)


@manager_bp.route("/api/manager/inventory/<int:medicine_id>/threshold", methods=["PATCH"])
def update_threshold(medicine_id):
    data = request.get_json() or {}
    threshold = data.get("threshold")
    if threshold is None:
        return jsonify({"error": "threshold is required"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        UPDATE Medicine
        SET threshold = %s
        WHERE medicineID = %s
        RETURNING medicineID, threshold
        """,
        (threshold, medicine_id),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if row is None:
        return jsonify({"error": "Medicine not found"}), 404
    return jsonify({key: serialize_value(value) for key, value in dict(row).items()})


@manager_bp.route("/api/manager/inventory/<int:medicine_id>/status", methods=["PATCH"])
def update_medicine_status(medicine_id):
    data = request.get_json() or {}
    status = data.get("status")
    notes = data.get("notes")
    if status not in ["safe", "damaged", "expired"]:
        return jsonify({"error": "status must be safe, damaged, or expired"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            UPDATE Medicine
            SET status = %s
            WHERE medicineID = %s
            RETURNING medicineID, status::text AS status
            """,
            (status, medicine_id),
        )
        row = cur.fetchone()
        if row is None:
            conn.rollback()
            return jsonify({"error": "Medicine not found"}), 404
        if status in ["damaged", "expired"] and notes:
            cur.execute(
                "INSERT INTO WasteLog (medicineID, notes) VALUES (%s, %s)",
                (medicine_id, notes),
            )
        conn.commit()
        return jsonify({key: serialize_value(value) for key, value in dict(row).items()})
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


@manager_bp.route("/api/manager/inventory/supply", methods=["POST"])
def log_supply():
    data = request.get_json() or {}
    medicine_id = data.get("medicineID")
    quantity = data.get("quantity")
    if not medicine_id or quantity is None:
        return jsonify({"error": "medicineID and quantity are required"}), 400
    if int(quantity) <= 0:
        return jsonify({"error": "quantity must be positive"}), 400

    # The schema has no SupplyLog table, so this endpoint records supply by updating stock only.
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        UPDATE Medicine
        SET quantity = COALESCE(quantity, 0) + %s
        WHERE medicineID = %s
        RETURNING medicineID, name, quantity
        """,
        (quantity, medicine_id),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if row is None:
        return jsonify({"error": "Medicine not found"}), 404
    return jsonify({key: serialize_value(value) for key, value in dict(row).items()}), 201


@manager_bp.route("/api/manager/logs/waste", methods=["GET"])
def waste_logs():
    rows = fetch_all(
        """
        SELECT
            wl.wasteLogID,
            wl.medicineID,
            m.name AS medicineName,
            m.category::text AS category,
            b.name AS branch,
            m.status::text AS status,
            wl.notes
        FROM WasteLog wl
        JOIN Medicine m ON m.medicineID = wl.medicineID
        JOIN Branch b ON b.branchID = m.branchID
        ORDER BY wl.wasteLogID DESC
        """
    )
    return jsonify(rows)


@manager_bp.route("/api/manager/logs/supply", methods=["GET"])
def supply_logs():
    # No supply history table exists in the schema. This returns current stock snapshots as a limited substitute.
    rows = fetch_all(
        """
        SELECT
            m.medicineID,
            m.name AS medicineName,
            b.name AS branch,
            m.quantity,
            m.threshold,
            'Current stock only - no persistent supply log table in schema' AS notes
        FROM Medicine m
        JOIN Branch b ON b.branchID = m.branchID
        ORDER BY m.name ASC
        """
    )
    return jsonify(rows)


@manager_bp.route("/api/manager/logs/waste", methods=["POST"])
def create_waste_log():
    data = request.get_json() or {}
    medicine_id = data.get("medicineID")
    notes = data.get("notes")
    if not medicine_id or not notes:
        return jsonify({"error": "medicineID and notes are required"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        INSERT INTO WasteLog (medicineID, notes)
        VALUES (%s, %s)
        RETURNING wasteLogID, medicineID, notes
        """,
        (medicine_id, notes),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({key: serialize_value(value) for key, value in dict(row).items()}), 201


@manager_bp.route("/api/manager/vaccinations/summary", methods=["GET"])
def vaccination_summary():
    summary = fetch_one(
        """
        SELECT
            COUNT(*) FILTER (WHERE nextDueDate < CURRENT_DATE) AS overdue,
            COUNT(*) FILTER (WHERE nextDueDate BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') AS dueWithin30Days,
            COUNT(*) FILTER (WHERE nextDueDate >= CURRENT_DATE + INTERVAL '30 days') AS upToDate,
            CASE
                WHEN COUNT(*) = 0 THEN 100
                ELSE ROUND((COUNT(*) FILTER (WHERE nextDueDate >= CURRENT_DATE)::numeric / COUNT(*)::numeric) * 100, 1)
            END AS complianceRate
        FROM VaccinationRecord
        """
    )
    return jsonify(summary)


@manager_bp.route("/api/manager/vaccinations", methods=["GET"])
def vaccinations():
    clauses = []
    params = []

    branch = request.args.get("branch")
    pet_name = request.args.get("petName")
    species = request.args.get("species")
    breed = request.args.get("breed")
    status = request.args.get("status")
    sort = request.args.get("sort", "due")

    if branch:
        clauses.append("v.branchID = %s")
        params.append(branch)
    if pet_name:
        clauses.append("LOWER(p.name) LIKE LOWER(%s)")
        params.append(f"%{pet_name}%")
    if species:
        clauses.append("LOWER(p.species) LIKE LOWER(%s)")
        params.append(f"%{species}%")
    if breed:
        clauses.append("LOWER(p.breed) LIKE LOWER(%s)")
        params.append(f"%{breed}%")
    if status == "overdue":
        clauses.append("vr.nextDueDate < CURRENT_DATE")
    elif status == "due_soon":
        clauses.append("vr.nextDueDate BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'")
    elif status == "up_to_date":
        clauses.append("vr.nextDueDate >= CURRENT_DATE + INTERVAL '30 days'")

    sort_map = {
        "due": "vr.nextDueDate ASC NULLS LAST",
        "pet": "p.name ASC",
        "owner": "owner.name ASC",
        "vet": "vet.name ASC",
    }
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = fetch_all(
        f"""
        SELECT
            vr.recordID,
            p.name AS petName,
            owner.name AS ownerName,
            p.species,
            p.breed,
            COALESCE(m.name, 'Vaccine plan') AS vaccineName,
            vr.shotDate AS lastShotDate,
            vr.nextDueDate,
            CASE
                WHEN vr.nextDueDate < CURRENT_DATE THEN 'overdue'
                WHEN vr.nextDueDate <= CURRENT_DATE + INTERVAL '30 days' THEN 'due_soon'
                ELSE 'up_to_date'
            END AS status,
            vet.name AS recommendedVet,
            br.name AS branch
        FROM VaccinationRecord vr
        JOIN Pet p ON p.petID = vr.petID
        JOIN Users owner ON owner.userID = p.ownerID
        JOIN VaccinationPlan vp ON vp.planID = vr.planID
        LEFT JOIN Veterinarian v ON v.veterinarianID = vp.veterinarianID
        LEFT JOIN Users vet ON vet.userID = v.veterinarianID
        LEFT JOIN Branch br ON br.branchID = v.branchID
        LEFT JOIN Involves i ON i.recordID = vr.recordID
        LEFT JOIN Vaccine vac ON vac.vaccineID = i.vaccineID
        LEFT JOIN Medicine m ON m.medicineID = vac.vaccineID
        {where}
        ORDER BY {sort_map.get(sort, sort_map["due"])}
        """,
        tuple(params),
    )
    return jsonify(rows)


@manager_bp.route("/api/manager/billing/summary", methods=["GET"])
def billing_summary():
    total_expr = money_sum_expression()
    summary = fetch_one(
        f"""
        SELECT
            COUNT(*) FILTER (WHERE paid = FALSE) AS unpaidInvoicesCount,
            COALESCE(SUM({total_expr}) FILTER (WHERE paid = TRUE AND dueDate >= date_trunc('month', CURRENT_DATE)), 0) AS paidThisMonth,
            COUNT(*) FILTER (WHERE paid = FALSE AND dueDate < CURRENT_DATE) AS overdueBills,
            COALESCE(AVG({total_expr}), 0) AS averageBill
        FROM Bill
        """
    )
    return jsonify(summary)


@manager_bp.route("/api/manager/bills", methods=["GET"])
def bills():
    total_expr = money_sum_expression()
    rows = fetch_all(
        f"""
        SELECT
            b.billNo,
            b.appointmentID,
            owner.name AS ownerName,
            {total_expr} AS total,
            b.dueDate,
            b.paid,
            CASE
                WHEN b.paid = TRUE THEN 'paid'
                WHEN b.dueDate < CURRENT_DATE THEN 'overdue'
                ELSE 'unpaid'
            END AS status,
            a.aType::text AS appointmentType,
            a.dateTime
        FROM Bill b
        JOIN Appointment a ON a.appointmentID = b.appointmentID
        JOIN Users owner ON owner.userID = b.payerID
        ORDER BY b.dueDate ASC NULLS LAST, b.billNo ASC
        """
    )
    return jsonify(rows)


@manager_bp.route("/api/manager/bills/<int:bill_no>/pay", methods=["PATCH"])
def mark_bill_paid(bill_no):
    appointment_id = request.args.get("appointmentID")
    if not appointment_id:
        return jsonify({"error": "appointmentID query parameter is required"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        UPDATE Bill
        SET paid = TRUE
        WHERE billNo = %s AND appointmentID = %s
        RETURNING billNo, appointmentID, paid
        """,
        (bill_no, appointment_id),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if row is None:
        return jsonify({"error": "Bill not found"}), 404
    return jsonify({key: serialize_value(value) for key, value in dict(row).items()})


@manager_bp.route("/api/manager/bills/<int:bill_no>/due-date", methods=["PATCH"])
def update_bill_due_date(bill_no):
    appointment_id = request.args.get("appointmentID")
    data = request.get_json() or {}
    due_date = data.get("dueDate")
    if not appointment_id or not due_date:
        return jsonify({"error": "appointmentID query parameter and dueDate are required"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        UPDATE Bill
        SET dueDate = %s
        WHERE billNo = %s AND appointmentID = %s
        RETURNING billNo, appointmentID, dueDate
        """,
        (due_date, bill_no, appointment_id),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if row is None:
        return jsonify({"error": "Bill not found"}), 404
    return jsonify({key: serialize_value(value) for key, value in dict(row).items()})


@manager_bp.route("/api/manager/reports/stock-consumption", methods=["GET"])
def stock_consumption_report():
    rows = fetch_all(
        """
        SELECT
            b.name AS branch,
            COUNT(pr.medicineID) AS prescribedItems,
            COALESCE(SUM(m.quantity), 0) AS remainingStock
        FROM Branch b
        LEFT JOIN Medicine m ON m.branchID = b.branchID
        LEFT JOIN Prescribes pr ON pr.medicineID = m.medicineID
        GROUP BY b.branchID, b.name
        ORDER BY b.name
        """
    )
    return jsonify(rows)


@manager_bp.route("/api/manager/reports/waste-statistics", methods=["GET"])
def waste_statistics_report():
    rows = fetch_all(
        """
        SELECT
            b.name AS branch,
            COUNT(wl.wasteLogID) AS wasteEntries,
            COUNT(*) FILTER (WHERE m.status = 'damaged') AS damagedItems,
            COUNT(*) FILTER (WHERE m.status = 'expired') AS expiredItems
        FROM Branch b
        LEFT JOIN Medicine m ON m.branchID = b.branchID
        LEFT JOIN WasteLog wl ON wl.medicineID = m.medicineID
        GROUP BY b.branchID, b.name
        ORDER BY b.name
        """
    )
    return jsonify(rows)


@manager_bp.route("/api/manager/reports/vaccination-overdue-rate", methods=["GET"])
def vaccination_overdue_rate_report():
    row = fetch_one(
        """
        SELECT
            COUNT(*) AS totalRecords,
            COUNT(*) FILTER (WHERE nextDueDate < CURRENT_DATE) AS overdueRecords,
            CASE
                WHEN COUNT(*) = 0 THEN 0
                ELSE ROUND((COUNT(*) FILTER (WHERE nextDueDate < CURRENT_DATE)::numeric / COUNT(*)::numeric) * 100, 1)
            END AS overdueRate
        FROM VaccinationRecord
        """
    )
    return jsonify(row)


@manager_bp.route("/api/manager/reports/cost-breakdown", methods=["GET"])
def cost_breakdown_report():
    row = fetch_one(
        """
        SELECT
            COALESCE(SUM(consultationFee), 0) AS consultationFees,
            COALESCE(SUM(treatmentCost), 0) AS treatmentCosts,
            COALESCE(SUM(medicationCost), 0) AS medicationCosts
        FROM Bill
        """
    )
    return jsonify(row)
