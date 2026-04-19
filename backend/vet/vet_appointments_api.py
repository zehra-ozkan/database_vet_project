from datetime import datetime

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from vet.vet_db import vet_get_db_connection, vet_serialize_records


vet_appointments_bp = Blueprint("vet_appointments_bp", __name__)


def _vet_parse_filter_date(raw_date):
    """Parse optional date filters in YYYY-MM-DD format."""
    if not raw_date:
        return None
    return datetime.strptime(raw_date, "%Y-%m-%d").date()


def _vet_parse_optional_int(raw_value):
    """Parse optional integer query params."""
    if raw_value is None or raw_value == "":
        return None
    parsed_value = int(raw_value)
    if parsed_value <= 0:
        raise ValueError
    return parsed_value


@vet_appointments_bp.route("/api/vet/appointments", methods=["GET"])
def vet_get_appointments():
    """Return veterinarian appointments with optional branch/date filters."""
    vet_id_raw = request.args.get("vetId") or request.headers.get("X-Dev-User-Id") or "1"
    date_raw = request.args.get("date")
    branch_id_raw = request.args.get("branchId")

    try:
        vet_id = int(vet_id_raw)
        if vet_id <= 0:
            raise ValueError
    except ValueError:
        return jsonify({"error": "vetId must be a positive integer."}), 400

    try:
        selected_date = _vet_parse_filter_date(date_raw)
    except ValueError:
        return jsonify({"error": "date must be in YYYY-MM-DD format."}), 400

    try:
        selected_branch_id = _vet_parse_optional_int(branch_id_raw)
    except ValueError:
        return jsonify({"error": "branchId must be a positive integer."}), 400

    conn = None
    cursor = None

    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT
                v.veterinarianid,
                u.name AS veterinarian_name,
                v.branchid,
                COALESCE(b.name, 'Unassigned') AS branch_name
            FROM veterinarian v
            JOIN users u ON u.userid = v.veterinarianid
            LEFT JOIN branch b ON b.branchid = v.branchid
            WHERE v.veterinarianid = %s
            """,
            (vet_id,),
        )
        profile = cursor.fetchone()
        if not profile:
            return jsonify({"error": "Veterinarian not found."}), 404

        cursor.execute(
            """
            SELECT DISTINCT
                b.branchid,
                b.name AS branch_name
            FROM veterinarian v
            LEFT JOIN branch b ON b.branchid = v.branchid
            WHERE v.veterinarianid = %s
              AND b.branchid IS NOT NULL
            ORDER BY b.name ASC
            """,
            (vet_id,),
        )
        available_branches = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                a.appointmentid,
                a.datetime,
                a.atype,
                COALESCE(p.name, 'Unknown') AS pet_name,
                uo.name AS owner_name,
                COALESCE(b.name, 'Unassigned') AS branch_name,
                CASE
                    WHEN vs.appointmentid IS NOT NULL THEN 'Completed'
                    WHEN a.datetime > NOW() THEN 'Scheduled'
                    ELSE 'Pending'
                END AS status
            FROM appointment a
            JOIN veterinarian v ON v.veterinarianid = a.veterinarianid
            LEFT JOIN branch b ON b.branchid = v.branchid
            JOIN petowner po ON po.ownerid = a.petownerid
            JOIN users uo ON uo.userid = po.ownerid
            LEFT JOIN LATERAL (
                SELECT p.name
                FROM pet p
                WHERE p.ownerid = a.petownerid
                ORDER BY p.petid ASC
                LIMIT 1
            ) p ON TRUE
            LEFT JOIN visitsummary vs ON vs.appointmentid = a.appointmentid
            WHERE a.veterinarianid = %s
              AND (%s::date IS NULL OR a.datetime::date = %s::date)
              AND (%s::int IS NULL OR v.branchid = %s::int)
            ORDER BY a.datetime ASC
            """,
            (vet_id, selected_date, selected_date, selected_branch_id, selected_branch_id),
        )
        appointments = cursor.fetchall()

        return jsonify(
            {
                "vet_id": vet_id,
                "filters": {
                    "date": selected_date.isoformat() if selected_date else None,
                    "branch_id": selected_branch_id,
                },
                "profile": vet_serialize_records([profile])[0],
                "available_branches": vet_serialize_records(available_branches),
                "appointments": vet_serialize_records(appointments),
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
