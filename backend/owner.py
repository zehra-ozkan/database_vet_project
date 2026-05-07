import os
from datetime import date, datetime
from decimal import Decimal

import psycopg2
from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

owner_bp = Blueprint("owner", __name__)
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


def get_owner_id():
    owner_id = request.args.get("ownerId", type=int)
    if owner_id is not None:
        return owner_id

    data = request.get_json(silent=True) or {}
    owner_id = data.get("ownerId")
    if owner_id is not None:
        try:
            return int(owner_id)
        except (TypeError, ValueError):
            return None

    header_owner_id = request.headers.get("X-User-ID")
    if header_owner_id:
        try:
            return int(header_owner_id)
        except ValueError:
            return None

    return None


def owner_route(path: str, **options):
    def decorator(func):
        owner_bp.route(f"/api/petOwner{path}", **options)(func)
        owner_bp.route(f"/api/owner{path}", **options)(func)
        return func

    return decorator


def _owner_get_microchip_found_news(owner_id: int):
    rows = fetch_all(
        """
        SELECT
            lfr.reportid AS news_id,
            COALESCE(lfr.foundat, lfr.createddate::timestamp) AS created_at,
            c.chipid AS chip_id,
            p.petid AS pet_id,
            p.name AS pet_name,
            p.ownerid AS owner_id,
            uo.name AS owner_name,
            lfr.foundbyvetid AS source_vet_id,
            COALESCE(uv.name, 'Unknown') AS source_vet_name,
            COALESCE(b.name, 'Unassigned') AS source_branch_name,
            COALESCE(lfr.foundnote, '') AS notes,
            (lfr.ownerreadat IS NULL) AS is_unread_owner
        FROM lostfoundreport lfr
        JOIN pet p ON p.petid = lfr.petid
        LEFT JOIN chip c ON c.petid = p.petid
        JOIN users uo ON uo.userid = p.ownerid
        LEFT JOIN users uv ON uv.userid = lfr.foundbyvetid
        LEFT JOIN veterinarian vv ON vv.veterinarianid = lfr.foundbyvetid
        LEFT JOIN branch b ON b.branchid = vv.branchid
        WHERE p.ownerid = %s
          AND COALESCE(lfr.isfound, FALSE) = TRUE
          AND lfr.foundbyvetid IS NOT NULL
        ORDER BY COALESCE(lfr.foundat, lfr.createddate::timestamp) DESC, lfr.reportid DESC
        """,
        (owner_id,),
    )
    return rows


# Load all pets of the current owner
@owner_route("/pets", methods=["GET"])
def owner_pets():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT
            p.petID,
            p.name,
            p.species,
            p.breed,
            p.age,
            p.sex,
            p.isAlive,
            mh.allergies,
            c.chipID
        FROM Pet p
        LEFT JOIN (
            SELECT petID, MAX(allergies) AS allergies
            FROM MedicalHistory
            GROUP BY petID
        ) mh ON mh.petID = p.petID
        LEFT JOIN Chip c ON c.petID = p.petID
        WHERE p.ownerID = %s
        ORDER BY p.name
        """,
        (owner_id,),
    )
    return jsonify(rows)


@owner_route("/chip/<int:pet_id>", methods=["GET"])
def owner_pet_chip(pet_id: int):
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    row = fetch_one(
        """
        SELECT c.chipID, c.petID, c.location, c.isLost
        FROM Chip c
        JOIN Pet p ON p.petID = c.petID
        WHERE c.petID = %s AND p.ownerID = %s
        """,
        (pet_id, owner_id),
    )
    if row is None:
        return jsonify(None)
    return jsonify(row)


@owner_route("/lost-report", methods=["POST"])
def create_lost_report():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    data = request.get_json() or {}
    pet_id = data.get("petID")
    lost_date = data.get("lostDate")
    location = data.get("location")
    if not pet_id or not lost_date or not location:
        return jsonify({"error": "petID, lostDate, and location are required"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT petID FROM Pet WHERE petID = %s AND ownerID = %s", (pet_id, owner_id))
        if cur.fetchone() is None:
            conn.rollback()
            return jsonify({"error": "Pet not found"}), 404

        cur.execute(
            """
            INSERT INTO LostFoundReport (isFound, petID, createdDate)
            VALUES (FALSE, %s, %s)
            RETURNING reportID, petID, isFound, createdDate
            """,
            (pet_id, lost_date),
        )
        report = cur.fetchone()
        cur.execute(
            """
            UPDATE Chip
            SET isLost = TRUE,
                location = %s
            WHERE petID = %s
            """,
            (location, pet_id),
        )
        conn.commit()
        return jsonify({key: serialize_value(value) for key, value in dict(report).items()}), 201
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


@owner_route("/lost-reports", methods=["GET"])
def owner_lost_reports():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT
            lfr.reportID,
            p.name AS petName,
            lfr.createdDate AS lostDate,
            c.location,
            lfr.createdDate AS reportCreatedDate,
            lfr.isFound
        FROM LostFoundReport lfr
        JOIN Pet p ON p.petID = lfr.petID
        LEFT JOIN Chip c ON c.petID = p.petID
        WHERE p.ownerID = %s
        ORDER BY lfr.createdDate DESC, lfr.reportID DESC
        """,
        (owner_id,),
    )
    return jsonify(rows)


@owner_route("/lost-report/<int:report_id>/found", methods=["PUT"])
def mark_lost_report_found(report_id: int):
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            UPDATE LostFoundReport lfr
            SET isFound = TRUE
            FROM Pet p
            WHERE lfr.reportID = %s
              AND p.petID = lfr.petID
              AND p.ownerID = %s
            RETURNING lfr.reportID, lfr.petID, lfr.isFound
            """,
            (report_id, owner_id),
        )
        row = cur.fetchone()
        if row is None:
            conn.rollback()
            return jsonify({"error": "Lost report not found"}), 404

        cur.execute("UPDATE Chip SET isLost = FALSE WHERE petID = %s", (row["petid"],))
        conn.commit()
        return jsonify({key: serialize_value(value) for key, value in dict(row).items()})
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


# Load pet profile details together with chip information
@owner_route("/pets/profile", methods=["GET"])
def owner_pet_profiles():
    owner_id = request.args.get("ownerId", type=int)
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT p.petID, p.name, p.species, p.breed, p.age, p.sex, p.canBreed, p.isAlive,
               c.chipID, c.implantationDate, c.isLost
        FROM Pet p
        LEFT JOIN Chip c ON c.petID = p.petID
        WHERE p.ownerID = %s
        ORDER BY p.name;
        """,
        (owner_id,),
    )
    return jsonify(rows)


@owner_route("/pet/<int:pet_id>", methods=["GET"])
def owner_pet_detail(pet_id: int):
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    pet = fetch_one(
        """
        SELECT
            p.petID,
            p.name,
            p.species,
            p.breed,
            p.age,
            mh.allergies
        FROM Pet p
        LEFT JOIN (
            SELECT petID, MAX(allergies) AS allergies
            FROM MedicalHistory
            GROUP BY petID
        ) mh ON mh.petID = p.petID
        WHERE p.petID = %s AND p.ownerID = %s
        """,
        (pet_id, owner_id),
    )
    if pet is None:
        return jsonify({"error": "Pet not found"}), 404

    chip = fetch_one(
        """
        SELECT
            c.chipID,
            c.location
        FROM Chip c
        WHERE c.petID = %s
        """,
        (pet_id,),
    )
    pet["chipid"] = chip["chipid"] if chip else None
    pet["location"] = chip["location"] if chip else None

    primary_clinic = fetch_one(
        """
        SELECT b.name AS branchName
        FROM Appointment a
        JOIN Veterinarian v ON v.veterinarianID = a.veterinarianID
        JOIN Branch b ON b.branchID = v.branchID
        WHERE a.petID = %s
        ORDER BY a.dateTime DESC
        LIMIT 1
        """,
        (pet_id,),
    )
    last_visit = fetch_one(
        """
        SELECT
            a.dateTime,
            vs.notes
        FROM Appointment a
        LEFT JOIN VisitSummary vs ON vs.appointmentID = a.appointmentID
        WHERE a.petID = %s
        ORDER BY a.dateTime DESC
        LIMIT 1
        """,
        (pet_id,),
    )
    return jsonify({"pet": pet, "primaryClinic": primary_clinic, "lastVisit": last_visit})


@owner_route("/pet/<int:pet_id>/vaccinations", methods=["GET"])
def owner_pet_vaccinations(pet_id: int):
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        WITH scoped_plans AS (
            SELECT
                vp.planID,
                vp.nextVaccinationDate
            FROM VaccinationPlan vp
            JOIN Pet p ON p.petID = vp.petID
            WHERE vp.petID = %s
              AND p.ownerID = %s
        ),
        plan_totals AS (
            SELECT
                sp.planID,
                sp.nextVaccinationDate,
                COUNT(vr.recordID)::int AS completedDoses,
                MAX(vr.threshold) FILTER (
                    WHERE vr.threshold IS NOT NULL
                      AND vr.threshold > 0
                )::int AS totalDoses
            FROM scoped_plans sp
            LEFT JOIN VaccinationRecord vr ON vr.planID = sp.planID
            GROUP BY sp.planID, sp.nextVaccinationDate
        ),
        last_plan_record AS (
            SELECT DISTINCT ON (vr.planID)
                vr.planID,
                vr.recordID,
                vr.nextDueDate,
                COALESCE(m.name, 'No data') AS vaccineName
            FROM VaccinationRecord vr
            LEFT JOIN Involves i ON i.recordID = vr.recordID
            LEFT JOIN Vaccine v ON v.vaccineID = i.vaccineID
            LEFT JOIN Medicine m ON m.medicineID = v.vaccineID
            WHERE vr.planID IN (SELECT planID FROM scoped_plans)
            ORDER BY vr.planID, vr.shotDate DESC NULLS LAST, vr.recordID DESC
        )
        SELECT
            COALESCE(lpr.recordID, pt.planID) AS recordID,
            COALESCE(lpr.vaccineName, 'No data') AS vaccineName,
            COALESCE(pt.nextVaccinationDate, lpr.nextDueDate) AS nextDueDate,
            pt.planID,
            COALESCE(pt.completedDoses, 0) AS completedDoses,
            pt.totalDoses,
            CASE
                WHEN pt.totalDoses IS NOT NULL
                     AND COALESCE(pt.completedDoses, 0) >= pt.totalDoses
                    THEN 'Completed'
                WHEN COALESCE(pt.nextVaccinationDate, lpr.nextDueDate) IS NULL
                    THEN 'No data'
                WHEN COALESCE(pt.nextVaccinationDate, lpr.nextDueDate) < CURRENT_DATE
                    THEN 'Overdue'
                WHEN COALESCE(pt.nextVaccinationDate, lpr.nextDueDate) <= CURRENT_DATE + INTERVAL '7 days'
                    THEN 'Due this week'
                WHEN COALESCE(pt.nextVaccinationDate, lpr.nextDueDate) <= CURRENT_DATE + INTERVAL '30 days'
                    THEN 'Due'
                ELSE 'Up to date'
            END AS planStatus
        FROM plan_totals pt
        LEFT JOIN last_plan_record lpr ON lpr.planID = pt.planID
        ORDER BY
            CASE
                WHEN pt.totalDoses IS NOT NULL
                     AND COALESCE(pt.completedDoses, 0) >= pt.totalDoses
                    THEN 2
                ELSE 1
            END,
            COALESCE(pt.nextVaccinationDate, lpr.nextDueDate) ASC NULLS LAST,
            pt.planID ASC
        """,
        (pet_id, owner_id),
    )
    return jsonify(rows)


@owner_route("/pet/<int:pet_id>/activity", methods=["GET"])
def owner_pet_activity(pet_id: int):
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT
            a.appointmentID,
            a.dateTime,
            a.aType,
            b.name AS branchName,
            CASE
                WHEN a.dateTime < CURRENT_TIMESTAMP THEN 'Completed'
                ELSE 'Scheduled'
            END AS status,
            vs.notes
        FROM Appointment a
        JOIN Veterinarian v ON v.veterinarianID = a.veterinarianID
        JOIN Branch b ON b.branchID = v.branchID
        LEFT JOIN VisitSummary vs ON vs.appointmentID = a.appointmentID
        WHERE a.petID = %s
        ORDER BY a.dateTime DESC
        """,
        (pet_id,),
    )
    return jsonify(rows)


@owner_route("/recent-activity", methods=["GET"])
def owner_recent_activity():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT
            a.appointmentID,
            a.dateTime,
            a.aType,
            b.name AS branchName,
            CASE
                WHEN a.dateTime < CURRENT_TIMESTAMP THEN 'Completed'
                ELSE 'Scheduled'
            END AS status,
            vs.notes
        FROM Appointment a
        JOIN Veterinarian v ON v.veterinarianID = a.veterinarianID
        LEFT JOIN Branch b ON b.branchID = v.branchID
        LEFT JOIN VisitSummary vs ON vs.appointmentID = a.appointmentID
        WHERE a.petOwnerID = %s
        ORDER BY a.dateTime DESC
        """,
        (owner_id,),
    )
    return jsonify(rows)


@owner_route("/vaccination-plan/<int:pet_id>", methods=["GET"])
def owner_vaccination_plan(pet_id: int):
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT
            vp.planID,
            vp.nextVaccinationDate,
            vp.petID,
            vp.veterinarianID
        FROM VaccinationPlan vp
        JOIN Pet p ON p.petID = vp.petID
        WHERE vp.petID = %s
          AND p.ownerID = %s
        ORDER BY vp.nextVaccinationDate ASC
        """,
        (pet_id, owner_id),
    )
    return jsonify(rows)


@owner_route("/recommended-vets/<int:plan_id>", methods=["GET"])
def owner_recommended_vets(plan_id: int):
    pet_id = request.args.get("petID", type=int)

    rows = []
    if plan_id > 0:
        rows = fetch_all(
            """
            SELECT DISTINCT
                v.veterinarianID,
                u.name AS veterinarianName,
                b.name AS branchName,
                b.branchID,
                v.speciesExpertise,
                v.availableDates
            FROM Appointment a
            JOIN Veterinarian v ON v.veterinarianID = a.veterinarianID
            JOIN Users u ON u.userID = v.veterinarianID
            LEFT JOIN Branch b ON b.branchID = v.branchID
            WHERE a.vaccinationPlanID = %s
            ORDER BY u.name
            """,
            (plan_id,),
        )

    if rows:
        return jsonify(rows)

    if pet_id is None:
        return jsonify([])

    fallback_rows = fetch_all(
        """
        SELECT DISTINCT
            v.veterinarianID,
            u.name AS veterinarianName,
            b.name AS branchName,
            b.branchID,
            v.speciesExpertise,
            v.availableDates
        FROM Pet p
        JOIN Veterinarian v
          ON v.speciesExpertise ILIKE CONCAT('%%', p.species, '%%')
        JOIN Users u ON u.userID = v.veterinarianID
        LEFT JOIN Branch b ON b.branchID = v.branchID
        WHERE p.petID = %s
        ORDER BY u.name
        """,
        (pet_id,),
    )
    if fallback_rows:
        return jsonify(fallback_rows)

    all_vets = fetch_all(
        """
        SELECT DISTINCT
            v.veterinarianID,
            u.name AS veterinarianName,
            b.name AS branchName,
            b.branchID,
            v.speciesExpertise,
            v.availableDates
        FROM Veterinarian v
        JOIN Users u ON u.userID = v.veterinarianID
        LEFT JOIN Branch b ON b.branchID = v.branchID
        ORDER BY u.name
        """
    )
    return jsonify(all_vets)


@owner_route("/vet-availability", methods=["GET"])
def owner_vet_availability():
    veterinarian_id = request.args.get("veterinarianID", type=int)
    appointment_date = request.args.get("date")
    if veterinarian_id is None or not appointment_date:
        return jsonify({"error": "veterinarianID and date are required"}), 400

    rows = fetch_all(
        """
        SELECT appointmentID, dateTime
        FROM Appointment
        WHERE veterinarianID = %s
          AND DATE(dateTime) = %s
        ORDER BY dateTime
        """,
        (veterinarian_id, appointment_date),
    )
    return jsonify(rows)


@owner_route("/branches", methods=["GET"])
def owner_branches():
    rows = fetch_all(
        """
        SELECT branchID, name
        FROM Branch
        ORDER BY name
        """
    )
    return jsonify(rows)


@owner_route("/vaccines", methods=["GET"])
def owner_vaccines():
    rows = fetch_all(
        """
        SELECT v.vaccineID, m.name
        FROM Vaccine v
        JOIN Medicine m ON m.medicineID = v.vaccineID
        ORDER BY m.name
        """
    )
    return jsonify(rows)


@owner_route("/vets", methods=["GET"])
def owner_vets():
    branch_id = request.args.get("branchID", type=int)
    if branch_id is None:
        return jsonify({"error": "branchID is required"}), 400

    rows = fetch_all(
        """
        SELECT
            v.veterinarianID,
            u.name
        FROM Veterinarian v
        JOIN Users u ON u.userID = v.veterinarianID
        WHERE v.branchID = %s
        ORDER BY u.name
        """,
        (branch_id,),
    )
    return jsonify(rows)


@owner_route("/appointments", methods=["POST"])
def owner_create_appointment():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    data = request.get_json() or {}
    required_fields = ["dateTime", "veterinarianID", "petID"]
    missing = [field for field in required_fields if data.get(field) is None]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT petID FROM Pet WHERE petID = %s AND ownerID = %s", (data["petID"], owner_id))
        if cur.fetchone() is None:
            conn.rollback()
            return jsonify({"error": "Pet not found"}), 404

        plan_id = data.get("vaccinationPlanID")
        if plan_id:
            cur.execute(
                """
                SELECT planID
                FROM VaccinationPlan
                WHERE planID = %s AND petID = %s
                """,
                (plan_id, data["petID"]),
            )
            if cur.fetchone() is None:
                conn.rollback()
                return jsonify({"error": "Vaccination plan not found"}), 404
        else:
            cur.execute(
                """
                INSERT INTO VaccinationPlan (nextVaccinationDate, petID, veterinarianID)
                VALUES (%s, %s, %s)
                RETURNING planID
                """,
                (str(data["dateTime"])[:10], data["petID"], data["veterinarianID"]),
            )
            plan = cur.fetchone()
            plan_id = plan["planid"]

        cur.execute(
            """
            INSERT INTO Appointment (aType, dateTime, vaccinationPlanID, veterinarianID, petOwnerID, petID)
            VALUES ('VACCINATION', %s, %s, %s, %s, %s)
            RETURNING appointmentID
            """,
            (data["dateTime"], plan_id, data["veterinarianID"], owner_id, data["petID"]),
        )
        row = cur.fetchone()
        conn.commit()
        return jsonify({key: serialize_value(value) for key, value in dict(row).items()}), 201
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


# Load selected pet profile details
@owner_route("/pets/<int:pet_id>/profile", methods=["GET"])
def owner_pet_profile(pet_id: int):
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    row = fetch_one(
        """
        SELECT p.petID, p.name, p.species, p.breed, p.age,
               c.chipID, c.location, c.isLost
        FROM Pet p
        LEFT JOIN Chip c ON c.petID = p.petID
        WHERE p.petID = %s AND p.ownerID = %s;
        """,
        (pet_id, owner_id),
    )
    if row is None:
        return jsonify({"error": "Pet not found"}), 404
    return jsonify(row)


# Load the vaccination plan of the selected pet
@owner_route("/pets/<int:pet_id>/vaccination-plan-booking", methods=["GET"])
def get_vaccination_plan_booking(pet_id: int):
    rows = fetch_all(
        """
        SELECT vp.planID, vp.nextVaccinationDate, vp.petID, vp.veterinarianID
        FROM VaccinationPlan vp
        WHERE vp.petID = %s
        ORDER BY vp.nextVaccinationDate ASC;
        """,
        (pet_id,),
    )
    return jsonify(rows)


# Load recommended veterinarians for the selected vaccination plan
@owner_route("/vaccination-plans/<int:plan_id>/recommended-vets", methods=["GET"])
def get_recommended_vets(plan_id: int):
    rows = fetch_all(
        """
        SELECT DISTINCT
            r.appointmentID,
            v.veterinarianID,
            u.name AS veterinarianName,
            b.name AS branchName,
            v.speciesExpertise,
            v.availableDates
        FROM Appointment a
        JOIN Recommended r ON r.appointmentID = a.appointmentID
        JOIN Veterinarian v ON v.veterinarianID = r.veterinarianID
        JOIN Users u ON u.userID = v.veterinarianID
        LEFT JOIN Branch b ON b.branchID = v.branchID
        WHERE a.vaccinationPlanID = %s
        ORDER BY u.name;
        """,
        (plan_id,),
    )
    return jsonify(rows)


# Check occupied appointment times of the selected veterinarian
@owner_route("/appointments/occupied", methods=["GET"])
def get_occupied_slots():
    vet_id = request.args.get("vetId", type=int)
    date_str = request.args.get("date")
    if vet_id is None or not date_str:
        return jsonify({"error": "vetId and date are required"}), 400

    rows = fetch_all(
        """
        SELECT appointmentID, dateTime, aType
        FROM Appointment
        WHERE veterinarianID = %s AND DATE(dateTime) = %s
        ORDER BY dateTime;
        """,
        (vet_id, date_str),
    )
    return jsonify(rows)


# Create the vaccination appointment
@owner_route("/appointments/vaccination", methods=["POST"])
def create_vaccination_appointment():
    data = request.get_json() or {}
    required_fields = ["dateTime", "vaccinationPlanId", "veterinarianId", "petOwnerId"]
    missing = [field for field in required_fields if data.get(field) is None]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT vp.petID
            FROM VaccinationPlan vp
            JOIN Pet p ON p.petID = vp.petID
            WHERE vp.planID = %s
              AND p.ownerID = %s
            """,
            (data["vaccinationPlanId"], data["petOwnerId"]),
        )
        plan_row = cur.fetchone()
        if plan_row is None:
            conn.rollback()
            return jsonify({"error": "Vaccination plan not found for this owner"}), 404

        resolved_pet_id = int(plan_row["petid"])
        requested_pet_id = data.get("petId")
        if requested_pet_id is not None:
            try:
                parsed_requested_pet_id = int(requested_pet_id)
            except (TypeError, ValueError):
                conn.rollback()
                return jsonify({"error": "petId must be a valid integer"}), 400
            if parsed_requested_pet_id != resolved_pet_id:
                conn.rollback()
                return jsonify({"error": "Selected pet does not match vaccination plan"}), 409

        cur.execute(
            """
            INSERT INTO Appointment (aType, dateTime, vaccinationPlanID, veterinarianID, petOwnerID, petID)
            VALUES ('VACCINATION', %s, %s, %s, %s, %s)
            RETURNING appointmentID;
            """,
            (
                data["dateTime"],
                data["vaccinationPlanId"],
                data["veterinarianId"],
                data["petOwnerId"],
                resolved_pet_id,
            ),
        )
        row = cur.fetchone()
        conn.commit()
        return jsonify({"appointmentId": row["appointmentid"]})
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


# Load allergy information of the pet
@owner_route("/pets/<int:pet_id>/allergies", methods=["GET"])
def get_pet_allergies(pet_id: int):
    rows = fetch_all(
        """
        SELECT pastDiagnosis, allergies
        FROM MedicalHistory
        WHERE petID = %s;
        """,
        (pet_id,),
    )
    return jsonify(rows)


# Load vaccination status
@owner_route("/pets/<int:pet_id>/vaccination-plans", methods=["GET"])
def get_vaccination_plans(pet_id: int):
    rows = fetch_all(
        """
        SELECT vp.planID, vp.nextVaccinationDate
        FROM VaccinationPlan vp
        WHERE vp.petID = %s
        ORDER BY vp.nextVaccinationDate ASC;
        """,
        (pet_id,),
    )
    return jsonify(rows)


# Load recent vaccination records
@owner_route("/pets/<int:pet_id>/vaccination-records", methods=["GET"])
def get_vaccination_records(pet_id: int):
    rows = fetch_all(
        """
        SELECT vr.recordID, vr.shotDate, vr.nextDueDate
        FROM VaccinationRecord vr
        WHERE vr.petID = %s
        ORDER BY vr.shotDate DESC;
        """,
        (pet_id,),
    )
    return jsonify(rows)


# Load recent activity
@owner_route("/pets/<int:pet_id>/activity", methods=["GET"])
def get_pet_activity(pet_id: int):
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT
            a.appointmentID,
            a.dateTime,
            a.aType AS type,
            a.aType,
            b.name AS branchName,
            CASE
                WHEN a.dateTime < CURRENT_TIMESTAMP THEN 'Completed'
                ELSE 'Scheduled'
            END AS status
        FROM Appointment a
        JOIN Veterinarian v ON v.veterinarianID = a.veterinarianID
        JOIN Branch b ON b.branchID = v.branchID
        WHERE a.petID = %s
        ORDER BY a.dateTime DESC;
        """,
        (pet_id,),
    )
    return jsonify(rows)


# Load microchip details
@owner_route("/pets/<int:pet_id>/chip", methods=["GET"])
def get_chip_details(pet_id: int):
    row = fetch_one(
        """
        SELECT chipID, location, isLost, implantationDate, veterinarianID
        FROM Chip
        WHERE petID = %s;
        """,
        (pet_id,),
    )
    if row is None:
        return jsonify({"error": "No chip registered"}), 404
    return jsonify(row)


# Welcome information
@owner_route("/dashboard/welcome", methods=["GET"])
def dashboard_welcome():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    user_info = fetch_one(
        """
        SELECT u.userID, u.name, u.email, u.phoneNumber
        FROM Users u
        JOIN PetOwner po ON po.ownerID = u.userID
        WHERE po.ownerID = %s;
        """,
        (owner_id,),
    )

    upcoming = fetch_one(
        """
        SELECT COUNT(*) AS upcomingAppointmentCount
        FROM Appointment
        WHERE petOwnerID = %s AND dateTime > NOW();
        """,
        (owner_id,),
    )

    outstanding = fetch_one(
        """
        SELECT SUM(consultationFee + treatmentCost + medicationCost) AS outstandingAmount
        FROM Bill
        WHERE payerID = %s AND paid = FALSE;
        """,
        (owner_id,),
    )

    due_soon_vaccinations = fetch_one(
        """
        SELECT COUNT(*) AS dueSoonVaccinationCount
        FROM VaccinationPlan vp
        JOIN Pet p ON p.petID = vp.petID
        WHERE p.ownerID = %s
          AND vp.nextVaccinationDate IS NOT NULL
          AND vp.nextVaccinationDate BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days';
        """,
        (owner_id,),
    )

    return jsonify({
        "user": user_info,
        "upcomingCount": int(upcoming["upcomingappointmentcount"]) if upcoming else 0,
        "outstandingAmount": float(outstanding["outstandingamount"]) if outstanding and outstanding["outstandingamount"] is not None else 0,
        "dueSoonVaccinationCount": int(due_soon_vaccinations["duesoonvaccinationcount"]) if due_soon_vaccinations else 0,
    })


# Microchip status
@owner_route("/dashboard/chip-status", methods=["GET"])
def dashboard_chip_status():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT p.petID, p.name AS petName, c.chipID, c.location, c.isLost, c.implantationDate, u.name AS veterinarianName
        FROM Pet p
        JOIN Chip c ON c.petID = p.petID
        LEFT JOIN Veterinarian v ON v.veterinarianID = c.veterinarianID
        LEFT JOIN Users u ON u.userID = v.veterinarianID
        WHERE p.ownerID = %s;
        """,
        (owner_id,),
    )
    owner_news = _owner_get_microchip_found_news(owner_id)
    latest_news_by_chip = {}
    for news_item in owner_news:
        chip_id = int(news_item.get("chip_id") or 0)
        if chip_id <= 0:
            continue
        if chip_id in latest_news_by_chip:
            continue
        latest_news_by_chip[chip_id] = news_item

    for row in rows:
        chip_id = int(row.get("chipid") or 0)
        latest_news = latest_news_by_chip.get(chip_id)
        row["has_found_vet_info"] = bool(latest_news)
        row["found_vet_name"] = latest_news.get("source_vet_name") if latest_news else None
        row["found_vet_branch_name"] = latest_news.get("source_branch_name") if latest_news else None
        row["found_at"] = latest_news.get("created_at") if latest_news else None
        row["found_notes"] = latest_news.get("notes") if latest_news else None
        row["has_unread_found_news"] = bool(latest_news and latest_news.get("is_unread_owner"))

    return jsonify(rows)


@owner_route("/dashboard/microchip-found-news", methods=["GET"])
def dashboard_microchip_found_news():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    news_items = _owner_get_microchip_found_news(owner_id)
    unread_count = sum(1 for item in news_items if bool(item.get("is_unread_owner")))

    return jsonify(
        {
            "unread_count": unread_count,
            "items": news_items,
        }
    )


@owner_route("/dashboard/microchip-found-news/mark-read", methods=["POST"])
def dashboard_microchip_found_news_mark_read():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            UPDATE lostfoundreport lfr
            SET ownerreadat = NOW()
            FROM pet p
            WHERE p.petid = lfr.petid
              AND p.ownerid = %s
              AND COALESCE(lfr.isfound, FALSE) = TRUE
              AND lfr.foundbyvetid IS NOT NULL
              AND lfr.ownerreadat IS NULL
            """,
            (owner_id,),
        )
        marked_count = int(cur.rowcount)
        conn.commit()
        return jsonify({"marked_read_count": marked_count})
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


# Upcoming visits list
@owner_route("/dashboard/upcoming-visits", methods=["GET"])
def dashboard_upcoming_visits():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT a.appointmentID, a.dateTime, a.aType, uv.name AS veterinarianName, b.name AS branchName, b.location
        FROM Appointment a
        JOIN Veterinarian v ON v.veterinarianID = a.veterinarianID
        JOIN Users uv ON uv.userID = v.veterinarianID
        LEFT JOIN Branch b ON b.branchID = v.branchID
        WHERE a.petOwnerID = %s AND a.dateTime >= NOW()
        ORDER BY a.dateTime ASC;
        """,
        (owner_id,),
    )
    return jsonify(rows)


# Recent activity
@owner_route("/dashboard/activity", methods=["GET"])
def dashboard_activity():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT a.dateTime AS activityDate, 'Appointment' AS activityType, a.aType::text AS detail, b.name AS branchName
        FROM Appointment a
        JOIN Veterinarian v ON v.veterinarianID = a.veterinarianID
        LEFT JOIN Branch b ON b.branchID = v.branchID
        WHERE a.petOwnerID = %s
        UNION
        SELECT CAST(bl.dueDate AS TIMESTAMP) AS activityDate, 'Bill' AS activityType, CONCAT('Bill #', bl.billNo) AS detail, NULL AS branchName
        FROM Bill bl
        WHERE bl.payerID = %s
        ORDER BY activityDate DESC;
        """,
        (owner_id, owner_id),
    )
    return jsonify(rows)


# Find time slots button / start booking action
@owner_route("/dashboard/find-slots", methods=["GET"])
def dashboard_find_slots():
    branch_id = request.args.get("branchId", type=int)
    date_str = request.args.get("date")
    if branch_id is None or not date_str:
        return jsonify({"error": "branchId and date are required"}), 400

    rows = fetch_all(
        """
        SELECT v.veterinarianID, u.name AS veterinarianName, v.speciesExpertise, v.availableDates, b.name AS branchName
        FROM Veterinarian v
        JOIN Users u ON u.userID = v.veterinarianID
        JOIN Branch b ON b.branchID = v.branchID
        WHERE b.branchID = %s AND v.availableDates LIKE %s;
        """,
        (branch_id, f"%{date_str}%"),
    )
    return jsonify(rows)


# Mark a pet as lost / update chip status
@owner_route("/dashboard/mark-lost", methods=["POST"])
def dashboard_mark_lost():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    data = request.get_json() or {}
    chip_id = data.get("chipId")
    pet_id = data.get("petId")
    if chip_id is None or pet_id is None:
        return jsonify({"error": "chipId and petId are required"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            UPDATE Chip SET isLost = TRUE
            WHERE chipID = %s AND petID IN (SELECT petID FROM Pet WHERE ownerID = %s);
            """,
            (chip_id, owner_id),
        )
        cur.execute(
            """
            INSERT INTO LostFoundReport (isFound, petID, createdDate)
            VALUES (FALSE, %s, CURRENT_DATE);
            """,
            (pet_id,),
        )
        conn.commit()
        return jsonify({"success": True}), 201
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


# Load available branches for browsing
@owner_route("/book/branches", methods=["GET"])
def book_branches():
    rows = fetch_all(
        """
        SELECT branchID, name, location, specialization
        FROM Branch
        ORDER BY name;
        """
    )
    return jsonify(rows)


# Browse veterinarians with filters
@owner_route("/book/vets", methods=["GET"])
def book_vets():
    branch_id = request.args.get("branchId", type=int)
    species = request.args.get("species", "").strip()
    specialization = request.args.get("specialization", "").strip()
    date_str = request.args.get("date", "").strip()

    conditions = []
    params = []

    if branch_id:
        conditions.append("b.branchID = %s")
        params.append(branch_id)

    if specialization:
        conditions.append("b.specialization ILIKE %s")
        params.append(f"%{specialization}%")

    if species:
        conditions.append("v.speciesExpertise ILIKE %s")
        params.append(f"%{species}%")

    # When a date is provided, exclude vets who have already reached their
    # maxDailyAppointmentLimit on that day.
    if date_str:
        conditions.append("""(
            v.maxDailyAppointmentLimit IS NULL
            OR (SELECT COUNT(*) FROM Appointment a
                WHERE a.veterinarianID = v.veterinarianID
                  AND DATE(a.dateTime) = %s
            ) < v.maxDailyAppointmentLimit
        )""")
        params.append(date_str)

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    rows = fetch_all(
        f"""
        SELECT v.veterinarianID, u.name AS veterinarianName, b.name AS branchName,
               v.speciesExpertise, v.availableDates, v.rating
        FROM Veterinarian v
        JOIN Users u ON u.userID = v.veterinarianID
        LEFT JOIN Branch b ON b.branchID = v.branchID
        {where_clause}
        ORDER BY u.name;
        """,
        tuple(params) if params else None,
    )
    return jsonify(rows)


# Check unpaid bills before booking
@owner_route("/book/check-bills", methods=["GET"])
def book_check_bills():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT billNo, dueDate, consultationFee, treatmentCost, medicationCost
        FROM Bill
        WHERE payerID = %s AND paid = FALSE;
        """,
        (owner_id,),
    )
    return jsonify(rows)


# Create the appointment
@owner_route("/book/create", methods=["POST"])
def book_create():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    data = request.get_json() or {}
    vet_id = data.get("vetId")
    appt_datetime = data.get("dateTime")
    pet_id = data.get("petId")
    atype = data.get("aType", "CHECKUP")
    vaccination_plan_id = data.get("vaccinationPlanId")

    if not vet_id or not appt_datetime or not pet_id:
        return jsonify({"error": "vetId, dateTime and petId are required"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Check unpaid bills before booking
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM Bill WHERE payerID = %s AND paid = FALSE;",
            (owner_id,),
        )
        bill_count = cur.fetchone()["cnt"]
        if bill_count > 0:
            return jsonify({"error": "You have unpaid bills. Please clear them before booking."}), 409

        # Check vet's daily appointment limit
        cur.execute(
            """
            SELECT v.maxDailyAppointmentLimit,
                   COUNT(a.appointmentID) AS booked
            FROM Veterinarian v
            LEFT JOIN Appointment a
                ON a.veterinarianID = v.veterinarianID
               AND DATE(a.dateTime) = DATE(%s::TIMESTAMP)
            WHERE v.veterinarianID = %s
            GROUP BY v.maxDailyAppointmentLimit;
            """,
            (appt_datetime, vet_id),
        )
        limit_row = cur.fetchone()
        if limit_row and limit_row["maxdailyappointmentlimit"] is not None:
            if int(limit_row["booked"]) >= int(limit_row["maxdailyappointmentlimit"]):
                return jsonify({"error": "This veterinarian has reached their daily appointment limit."}), 409

        cur.execute(
            """
            SELECT petID
            FROM Pet
            WHERE petID = %s
              AND ownerID = %s
            """,
            (pet_id, owner_id),
        )
        if cur.fetchone() is None:
            return jsonify({"error": "Selected pet was not found for this owner."}), 404

        if vaccination_plan_id is not None:
            cur.execute(
                """
                SELECT planID
                FROM VaccinationPlan
                WHERE planID = %s
                  AND petID = %s
                """,
                (vaccination_plan_id, pet_id),
            )
            if cur.fetchone() is None:
                return jsonify({"error": "Vaccination plan was not found for selected pet."}), 404

        # Create the appointment
        cur.execute(
            """
            INSERT INTO Appointment (aType, dateTime, vaccinationPlanID, veterinarianID, petOwnerID, petID)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING appointmentID;
            """,
            (atype, appt_datetime, vaccination_plan_id, vet_id, owner_id, pet_id),
        )
        new_id = cur.fetchone()["appointmentid"]
        conn.commit()
        return jsonify({"success": True, "appointmentId": new_id}), 201
    except Exception as exc:
        conn.rollback()
        error_msg = str(exc)
        if "uq_vet_datetime" in error_msg:
            return jsonify({"error": "This time slot is already taken. Please choose another."}), 409
        return jsonify({"error": error_msg}), 500
    finally:
        cur.close()
        conn.close()


# Load appointment list of the pet owner
@owner_route("/appointments/list", methods=["GET"])
def appointments_list():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT
            a.appointmentID,
            a.aType,
            a.dateTime,
            u.name AS veterinarianName,
            b.name AS branchName,
            p.name AS petName
        FROM Appointment a
        JOIN Veterinarian v ON v.veterinarianID = a.veterinarianID
        JOIN Users u ON u.userID = v.veterinarianID
        LEFT JOIN Pet p ON p.petID = a.petID
        LEFT JOIN Branch b ON b.branchID = v.branchID
        WHERE a.petOwnerID = %s
        ORDER BY a.dateTime DESC;
        """,
        (owner_id,),
    )
    return jsonify(rows)


# Load invoice list of the pet owner
@owner_route("/appointments/invoices", methods=["GET"])
def appointments_invoices():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT bl.billNo, bl.appointmentID, bl.consultationFee, bl.treatmentCost,
               bl.medicationCost, bl.dueDate, bl.paid
        FROM Bill bl
        WHERE bl.payerID = %s
        ORDER BY bl.dueDate DESC;
        """,
        (owner_id,),
    )
    return jsonify(rows)


# Load billing summary: outstanding amount and paid this month
@owner_route("/appointments/summary", methods=["GET"])
def appointments_summary():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    # Calculate total outstanding amount
    outstanding_row = fetch_one(
        """
        SELECT SUM(consultationFee + treatmentCost + medicationCost) AS outstandingAmount
        FROM Bill
        WHERE payerID = %s AND paid = FALSE;
        """,
        (owner_id,),
    )

    # Calculate amount paid this month
    paid_row = fetch_one(
        """
        SELECT SUM(consultationFee + treatmentCost + medicationCost) AS paidThisMonth
        FROM Bill
        WHERE payerID = %s AND paid = TRUE
          AND dueDate BETWEEN DATE_TRUNC('month', CURRENT_DATE)
                          AND (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
        """,
        (owner_id,),
    )

    return jsonify(
        {
            "outstandingAmount": float(outstanding_row["outstandingamount"] or 0),
            "paidThisMonth": float(paid_row["paidthismonth"] or 0),
        }
    )


# Mark an invoice as paid
@owner_route("/appointments/pay-bill", methods=["PATCH"])
def appointments_pay_bill():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    data = request.get_json() or {}
    bill_no = data.get("billNo")
    appointment_id = data.get("appointmentId")

    if bill_no is None or appointment_id is None:
        return jsonify({"error": "billNo and appointmentId are required"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            UPDATE Bill SET paid = TRUE
            WHERE billNo = %s AND appointmentID = %s AND payerID = %s;
            """,
            (bill_no, appointment_id, owner_id),
        )
        conn.commit()
        return jsonify({"success": True})
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


# Cancel an upcoming appointment
@owner_route("/appointments/cancel", methods=["POST"])
def appointments_cancel():
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    data = request.get_json() or {}
    appointment_id = data.get("appointmentId")

    if appointment_id is None:
        return jsonify({"error": "appointmentId is required"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            DELETE FROM Appointment
            WHERE appointmentID = %s AND petOwnerID = %s AND dateTime > NOW();
            """,
            (appointment_id, owner_id),
        )
        deleted = cur.rowcount
        conn.commit()
        if deleted == 0:
            return jsonify({"error": "Appointment not found or cannot be cancelled (already past)."}), 404
        return jsonify({"success": True})
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


# Add a new pet profile
@owner_route("/pets", methods=["POST"])
def add_pet():
    data = request.get_json() or {}
    required_fields = ["name", "species", "breed", "age", "ownerId"]
    missing = [field for field in required_fields if data.get(field) is None]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        INSERT INTO Pet (name, sex, canBreed, age, isAlive, species, breed, ownerID)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING petID;
        """,
        (
            data["name"],
            data.get("sex") or "F",
            data.get("canBreed", False),
            data["age"],
            data.get("isAlive", True),
            data["species"],
            data["breed"],
            data["ownerId"],
        ),
    )
    row = cur.fetchone()
    if data.get("allergies"):
        cur.execute(
            """
            INSERT INTO MedicalHistory (petID, pastDiagnosis, allergies)
            VALUES (%s, %s, %s)
            """,
            (row["petid"], "Initial profile entry", data["allergies"]),
        )

    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"petId": row["petid"]})


# Update pet profile information
@owner_route("/pets/<int:pet_id>", methods=["PATCH"])
def update_pet(pet_id: int):
    data = request.get_json() or {}
    required_fields = ["name", "species", "breed", "age", "isAlive", "ownerId"]
    missing = [field for field in required_fields if data.get(field) is None]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        UPDATE Pet
        SET name = %s, species = %s, breed = %s, age = %s, sex = %s, isAlive = %s
        WHERE petID = %s AND ownerID = %s
        RETURNING petID;
        """,
        (
            data["name"],
            data["species"],
            data["breed"],
            data["age"],
            data.get("sex") or "F",
            data["isAlive"],
            pet_id,
            data["ownerId"],
        ),
    )
    row = cur.fetchone()
    if row is None:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": "Pet not found"}), 404

    if "allergies" in data:
        cur.execute(
            """
            UPDATE MedicalHistory
            SET allergies = %s
            WHERE petID = %s
            RETURNING petID
            """,
            (data.get("allergies") or None, pet_id),
        )
        if cur.fetchone() is None:
            cur.execute(
                """
                INSERT INTO MedicalHistory (petID, pastDiagnosis, allergies)
                VALUES (%s, %s, %s)
                """,
                (pet_id, "Profile details", data.get("allergies") or None),
            )

    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"petId": row["petid"]})


# Update allergy-related information
@owner_route("/pets/<int:pet_id>/allergies", methods=["PATCH"])
def update_allergies(pet_id: int):
    data = request.get_json() or {}
    required_fields = ["pastDiagnosis", "previousAllergies", "allergies"]
    missing = [field for field in required_fields if data.get(field) is None]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        UPDATE MedicalHistory
        SET allergies = %s
        WHERE petID = %s AND pastDiagnosis = %s AND allergies = %s
        RETURNING petID;
        """,
        (
            data["allergies"],
            pet_id,
            data["pastDiagnosis"],
            data["previousAllergies"],
        ),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if row is None:
        return jsonify({"error": "Medical history entry not found"}), 404
    return jsonify({"petId": row["petid"]})


# Register a chip for a pet
@owner_route("/pets/<int:pet_id>/chip", methods=["POST"])
def register_chip(pet_id: int):
    data = request.get_json() or {}
    owner_id = get_owner_id()
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    required_fields = ["chipId", "location", "isLost", "veterinarianId", "implantationDate"]
    missing = [field for field in required_fields if data.get(field) is None]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT petID FROM Pet WHERE petID = %s AND ownerID = %s", (pet_id, owner_id))
    if cur.fetchone() is None:
        cur.close()
        conn.close()
        return jsonify({"error": "Pet not found"}), 404

    cur.execute(
        """
        INSERT INTO Chip (chipID, location, isLost, petID, veterinarianID, implantationDate)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (chipID) DO UPDATE
        SET location = EXCLUDED.location,
            isLost = EXCLUDED.isLost,
            petID = EXCLUDED.petID,
            veterinarianID = EXCLUDED.veterinarianID,
            implantationDate = EXCLUDED.implantationDate
        RETURNING chipID;
        """,
        (
            data["chipId"],
            data["location"],
            data["isLost"],
            pet_id,
            data["veterinarianId"],
            data["implantationDate"],
        ),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"chipId": row["chipid"]})
