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
        JOIN VaccinationPlan vp ON vp.planID = a.vaccinationPlanID
        JOIN Veterinarian v ON v.veterinarianID = a.veterinarianID
        JOIN Branch b ON b.branchID = v.branchID
        WHERE vp.petID = %s
        ORDER BY a.dateTime DESC
        LIMIT 1
        """,
        (pet_id,),
    )
    last_visit = fetch_one(
        """
        SELECT vs.notes, a.dateTime
        FROM VisitSummary vs
        JOIN Appointment a ON a.appointmentID = vs.appointmentID
        JOIN VaccinationPlan vp ON vp.planID = a.vaccinationPlanID
        WHERE vp.petID = %s
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
        SELECT
            vr.recordID,
            vr.nextDueDate,
            m.name AS vaccineName
        FROM VaccinationRecord vr
        JOIN Pet p ON p.petID = vr.petID
        JOIN Involves i ON i.recordID = vr.recordID
        JOIN Vaccine v ON v.vaccineID = i.vaccineID
        JOIN Medicine m ON m.medicineID = v.vaccineID
        WHERE vr.petID = %s AND p.ownerID = %s
        ORDER BY vr.nextDueDate ASC
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
            a.dateTime,
            a.aType,
            b.name AS branchName
        FROM Appointment a
        JOIN Veterinarian v ON v.veterinarianID = a.veterinarianID
        JOIN Branch b ON b.branchID = v.branchID
        JOIN VaccinationPlan vp ON vp.planID = a.vaccinationPlanID
        WHERE vp.petID = %s
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
        JOIN Branch b ON b.branchID = v.branchID
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
            INSERT INTO Appointment (aType, dateTime, vaccinationPlanID, veterinarianID, petOwnerID)
            VALUES ('VACCINATION', %s, %s, %s, %s)
            RETURNING appointmentID
            """,
            (data["dateTime"], plan_id, data["veterinarianID"], owner_id),
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
            INSERT INTO Appointment (aType, dateTime, vaccinationPlanID, veterinarianID, petOwnerID)
            VALUES ('VACCINATION', %s, %s, %s, %s)
            RETURNING appointmentID;
            """,
            (
                data["dateTime"],
                data["vaccinationPlanId"],
                data["veterinarianId"],
                data["petOwnerId"],
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
        SELECT a.appointmentID, a.dateTime, a.aType
        FROM Appointment a
        WHERE a.petOwnerID = %s
        ORDER BY a.dateTime DESC;
        """,
        (owner_id,),
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
        SET name = %s, species = %s, breed = %s, age = %s, isAlive = %s
        WHERE petID = %s AND ownerID = %s
        RETURNING petID;
        """,
        (
            data["name"],
            data["species"],
            data["breed"],
            data["age"],
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
