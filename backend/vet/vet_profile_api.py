import psycopg2
from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from vet.vet_db import vet_get_db_connection, vet_serialize_records


vet_profile_bp = Blueprint("vet_profile_bp", __name__)


def _resolve_vet_id(payload=None):
    payload = payload or {}
    raw_vet_id = (
        payload.get("vetId")
        or request.args.get("vetId")
        or request.headers.get("X-Dev-User-Id")
        or "1"
    )
    vet_id = int(raw_vet_id)
    if vet_id <= 0:
        raise ValueError("vetId must be a positive integer.")
    return vet_id


def _fetch_profile(cursor, vet_id):
    cursor.execute(
        """
        SELECT
            v.veterinarianid,
            u.name AS veterinarian_name,
            u.email,
            u.phonenumber,
            v.speciesexpertise,
            v.rating,
            v.maxdailyappointmentlimit,
            b.branchid,
            b.name AS branch_name,
            b.location AS branch_location
        FROM veterinarian v
        JOIN users u ON u.userid = v.veterinarianid
        LEFT JOIN branch b ON b.branchid = v.branchid
        WHERE v.veterinarianid = %s
        """,
        (vet_id,),
    )
    return cursor.fetchone()


def _normalize_optional_text(raw_value, field_name):
    if raw_value is None:
        return None
    if not isinstance(raw_value, str):
        raise ValueError(f"{field_name} must be text.")
    normalized = raw_value.strip()
    if not normalized:
        raise ValueError(f"{field_name} cannot be empty.")
    return normalized


def _normalize_daily_limit(raw_value):
    if raw_value is None:
        return None
    parsed = int(raw_value)
    if parsed <= 0:
        raise ValueError("maxDailyAppointmentLimit must be a positive integer.")
    return parsed


def _map_error(exc):
    status_code = 500
    message = str(exc).strip() if str(exc).strip() else "Database operation failed."

    if isinstance(exc, psycopg2.Error):
        if exc.pgcode in {"23505", "23514"}:
            status_code = 409
        elif exc.pgcode == "22P02":
            status_code = 400

    return jsonify({"error": message}), status_code


@vet_profile_bp.route("/api/vet/profile", methods=["GET"])
def vet_get_profile():
    try:
        vet_id = _resolve_vet_id()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = None
    cursor = None
    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        profile = _fetch_profile(cursor, vet_id)
        if not profile:
            return jsonify({"error": "Veterinarian not found."}), 404
        return jsonify({"vet_id": vet_id, "profile": vet_serialize_records([profile])[0]})
    except Exception as exc:
        return _map_error(exc)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_profile_bp.route("/api/vet/profile", methods=["PUT"])
def vet_update_profile():
    payload = request.get_json(silent=True) or {}
    try:
        vet_id = _resolve_vet_id(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = None
    cursor = None
    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        if _fetch_profile(cursor, vet_id) is None:
            return jsonify({"error": "Veterinarian not found."}), 404

        user_updates = []
        user_params = []
        vet_updates = []
        vet_params = []

        if "email" in payload:
            email = _normalize_optional_text(payload.get("email"), "email")
            user_updates.append("email = %s")
            user_params.append(email)

        if "phoneNumber" in payload:
            phone_number = _normalize_optional_text(payload.get("phoneNumber"), "phoneNumber")
            user_updates.append("phonenumber = %s")
            user_params.append(phone_number)

        if "speciesExpertise" in payload:
            species_expertise = _normalize_optional_text(payload.get("speciesExpertise"), "speciesExpertise")
            vet_updates.append("speciesexpertise = %s")
            vet_params.append(species_expertise)

        if "maxDailyAppointmentLimit" in payload:
            daily_limit = _normalize_daily_limit(payload.get("maxDailyAppointmentLimit"))
            vet_updates.append("maxdailyappointmentlimit = %s")
            vet_params.append(daily_limit)

        if not user_updates and not vet_updates:
            return jsonify({"error": "No updatable fields provided."}), 400

        if user_updates:
            cursor.execute(
                f"""
                UPDATE users
                SET {", ".join(user_updates)}
                WHERE userid = %s
                """,
                (*user_params, vet_id),
            )

        if vet_updates:
            cursor.execute(
                f"""
                UPDATE veterinarian
                SET {", ".join(vet_updates)}
                WHERE veterinarianid = %s
                """,
                (*vet_params, vet_id),
            )

        profile = _fetch_profile(cursor, vet_id)
        conn.commit()
        return jsonify(
            {
                "message": "Profile updated successfully.",
                "vet_id": vet_id,
                "profile": vet_serialize_records([profile])[0],
            }
        )
    except ValueError as exc:
        if conn:
            conn.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        if conn:
            conn.rollback()
        return _map_error(exc)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
