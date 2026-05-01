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


# Load all pets of the current owner
@owner_bp.route("/api/owner/pets", methods=["GET"])
def owner_pets():
    owner_id = request.args.get("ownerId", type=int)
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT petID, name, species, breed, age, isAlive
        FROM Pet
        WHERE ownerID = %s
        ORDER BY name;
        """,
        (owner_id,),
    )
    return jsonify(rows)


# Load pet profile details together with chip information
@owner_bp.route("/api/owner/pets/profile", methods=["GET"])
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


# Load selected pet profile details
@owner_bp.route("/api/owner/pets/<int:pet_id>/profile", methods=["GET"])
def owner_pet_profile(pet_id: int):
    owner_id = request.args.get("ownerId", type=int)
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
@owner_bp.route("/api/owner/pets/<int:pet_id>/vaccination-plan-booking", methods=["GET"])
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
@owner_bp.route("/api/owner/vaccination-plans/<int:plan_id>/recommended-vets", methods=["GET"])
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
        JOIN User u ON u.userID = v.veterinarianID
        LEFT JOIN Branch b ON b.branchID = v.branchID
        WHERE a.vaccinationPlanID = %s
        ORDER BY u.name;
        """,
        (plan_id,),
    )
    return jsonify(rows)


# Check occupied appointment times of the selected veterinarian
@owner_bp.route("/api/owner/appointments/occupied", methods=["GET"])
def get_occupied_slots():
    vet_id = request.args.get("vetId", type=int)
    date = request.args.get("date")
    if vet_id is None or not date:
        return jsonify({"error": "vetId and date are required"}), 400

    rows = fetch_all(
        """
        SELECT appointmentID, dateTime, type
        FROM Appointment
        WHERE veterinarianID = %s AND DATE(dateTime) = %s
        ORDER BY dateTime;
        """,
        (vet_id, date),
    )
    return jsonify(rows)


# Create the vaccination appointment
@owner_bp.route("/api/owner/appointments/vaccination", methods=["POST"])
def create_vaccination_appointment():
    data = request.get_json() or {}
    required_fields = ["appointmentId", "dateTime", "vaccinationPlanId", "veterinarianId", "petOwnerId"]
    missing = [field for field in required_fields if data.get(field) is None]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        INSERT INTO Appointment (appointmentID, type, dateTime, vaccinationPlanID, veterinarianID, petOwnerID)
        VALUES (%s, 'VACCINATION', %s, %s, %s, %s);
        """,
        (
            data["appointmentId"],
            data["dateTime"],
            data["vaccinationPlanId"],
            data["veterinarianId"],
            data["petOwnerId"],
        ),
    )
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"appointmentId": data["appointmentId"]})


# Load allergy information of the pet
@owner_bp.route("/api/owner/pets/<int:pet_id>/allergies", methods=["GET"])
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
@owner_bp.route("/api/owner/pets/<int:pet_id>/vaccination-plans", methods=["GET"])
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
@owner_bp.route("/api/owner/pets/<int:pet_id>/vaccination-records", methods=["GET"])
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
@owner_bp.route("/api/owner/pets/<int:pet_id>/activity", methods=["GET"])
def get_pet_activity(pet_id: int):
    owner_id = request.args.get("ownerId", type=int)
    if owner_id is None:
        return jsonify({"error": "ownerId is required"}), 400

    rows = fetch_all(
        """
        SELECT a.appointmentID, a.dateTime, a.type
        FROM Appointment a
        WHERE a.petOwnerID = %s
        ORDER BY a.dateTime DESC;
        """,
        (owner_id,),
    )
    return jsonify(rows)


# Add a new pet profile
@owner_bp.route("/api/owner/pets", methods=["POST"])
def add_pet():
    data = request.get_json() or {}
    required_fields = ["petId", "name", "sex", "canBreed", "age", "isAlive", "species", "breed", "ownerId"]
    missing = [field for field in required_fields if data.get(field) is None]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        INSERT INTO Pet (petID, name, sex, canBreed, age, isAlive, species, breed, ownerID)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING petID;
        """,
        (
            data["petId"],
            data["name"],
            data["sex"],
            data["canBreed"],
            data["age"],
            data["isAlive"],
            data["species"],
            data["breed"],
            data["ownerId"],
        ),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"petId": row["petid"]})


# Update pet profile information
@owner_bp.route("/api/owner/pets/<int:pet_id>", methods=["PATCH"])
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
    conn.commit()
    cur.close()
    conn.close()
    if row is None:
        return jsonify({"error": "Pet not found"}), 404
    return jsonify({"petId": row["petid"]})


# Update allergy-related information
@owner_bp.route("/api/owner/pets/<int:pet_id>/allergies", methods=["PATCH"])
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


# Load microchip details
@owner_bp.route("/api/owner/pets/<int:pet_id>/chip", methods=["GET"])
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


# Register a chip for a pet
@owner_bp.route("/api/owner/pets/<int:pet_id>/chip", methods=["POST"])
def register_chip(pet_id: int):
    data = request.get_json() or {}
    required_fields = ["chipId", "location", "isLost", "veterinarianId", "implantationDate"]
    missing = [field for field in required_fields if data.get(field) is None]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        INSERT INTO Chip (chipID, location, isLost, petID, veterinarianID, implantationDate)
        VALUES (%s, %s, %s, %s, %s, %s)
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
