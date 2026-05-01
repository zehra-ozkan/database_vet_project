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
