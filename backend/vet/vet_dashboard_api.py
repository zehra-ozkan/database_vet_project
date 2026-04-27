from datetime import date, datetime

from psycopg2.extras import RealDictCursor
from flask import Blueprint, jsonify, request

from vet.vet_db import vet_get_db_connection, vet_serialize_records

vet_dashboard_bp = Blueprint("vet_dashboard_bp", __name__)

def _vet_parse_date(raw_date):
    """Parse YYYY-MM-DD date values used by dashboard filters."""
    if not raw_date:
        return date.today()
    return datetime.strptime(raw_date, "%Y-%m-%d").date()


@vet_dashboard_bp.route("/api/vet/dashboard", methods=["GET"])
def vet_get_dashboard():
    """Return veterinarian dashboard data for the selected veterinarian."""
    vet_id_raw = request.args.get("vetId") or request.headers.get("X-Dev-User-Id") or "1"
    date_raw = request.args.get("date")

    try:
        vet_id = int(vet_id_raw)
        if vet_id <= 0:
            raise ValueError
    except ValueError:
        return jsonify({"error": "vetId must be a positive integer."}), 400

    try:
        selected_date = _vet_parse_date(date_raw)
    except ValueError:
        return jsonify({"error": "date must be in YYYY-MM-DD format."}), 400

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
        profile = cursor.fetchone()
        if not profile:
            return jsonify({"error": "Veterinarian not found."}), 404

        cursor.execute(
            """
            SELECT
                COUNT(*)::int AS todays_appointments,
                COUNT(*) FILTER (
                    WHERE vs.appointmentid IS NULL
                      AND a.datetime <= NOW()
                )::int AS pending_documentation
            FROM appointment a
            LEFT JOIN visitsummary vs ON vs.appointmentid = a.appointmentid
            WHERE a.veterinarianid = %s
              AND a.datetime::date = %s
            """,
            (vet_id, selected_date),
        )
        metrics = cursor.fetchone()

        cursor.execute(
            """
            SELECT
                a.appointmentid,
                a.datetime,
                a.atype,
                COALESCE(p.name, 'Unknown') AS pet_name,
                uo.name AS owner_name,
                CASE
                    WHEN vs.appointmentid IS NOT NULL THEN 'Completed'
                    WHEN a.datetime > NOW() THEN 'Upcoming'
                    ELSE 'Pending'
                END AS status
            FROM appointment a
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
              AND a.datetime::date = %s
            ORDER BY a.datetime ASC
            """,
            (vet_id, selected_date),
        )
        today_schedule = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                p.name AS pet_name,
                COALESCE(m.name, 'Unknown') AS vaccine_name,
                vr.shotdate,
                vr.nextduedate,
                COALESCE(u.name, 'Unknown') AS admin_vet_name,
                CASE
                    WHEN vr.nextduedate IS NULL THEN 'Unknown'
                    WHEN vr.nextduedate < CURRENT_DATE THEN
                        'Overdue ' || (CURRENT_DATE - vr.nextduedate)::text || 'd'
                    WHEN vr.nextduedate <= CURRENT_DATE + 30 THEN
                        'Due in ' || (vr.nextduedate - CURRENT_DATE)::text || 'd'
                    ELSE 'Normal'
                END AS vaccination_status
            FROM vaccinationrecord vr
            JOIN pet p ON p.petid = vr.petid
            JOIN vaccinationplan vp ON vp.planid = vr.planid
            LEFT JOIN users u ON u.userid = vp.veterinarianid
            LEFT JOIN involves i ON i.recordid = vr.recordid
            LEFT JOIN vaccine v ON v.vaccineid = i.vaccineid
            LEFT JOIN medicine m ON m.medicineid = v.vaccineid
            WHERE vp.veterinarianid = %s
            ORDER BY vr.nextduedate ASC NULLS LAST, vr.shotdate DESC NULLS LAST
            LIMIT 12
            """,
            (vet_id,),
        )
        vaccination_records = cursor.fetchall()

        return jsonify(
            {
                "vet_id": vet_id,
                "selected_date": selected_date.isoformat(),
                "profile": vet_serialize_records([profile])[0],
                "metrics": vet_serialize_records([metrics])[0],
                "today_schedule": vet_serialize_records(today_schedule),
                "vaccination_records": vet_serialize_records(vaccination_records),
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
