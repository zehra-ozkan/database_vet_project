from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from vet.vet_db import vet_get_db_connection, vet_serialize_records


vet_timeline_bp = Blueprint("vet_timeline_bp", __name__)


def _vet_parse_optional_positive_int(raw_value):
    """Parse positive integer values, allowing empty values as None."""
    if raw_value is None or raw_value == "":
        return None
    parsed_value = int(raw_value)
    if parsed_value <= 0:
        raise ValueError
    return parsed_value


@vet_timeline_bp.route("/api/vet/timeline", methods=["GET"])
def vet_get_timeline():
    """Return timeline-oriented data for veterinarian and selected pet."""
    vet_id_raw = request.args.get("vetId") or request.headers.get("X-Dev-User-Id") or "1"
    pet_id_raw = request.args.get("petId")

    try:
        vet_id = int(vet_id_raw)
        if vet_id <= 0:
            raise ValueError
    except ValueError:
        return jsonify({"error": "vetId must be a positive integer."}), 400

    try:
        selected_pet_id = _vet_parse_optional_positive_int(pet_id_raw)
    except ValueError:
        return jsonify({"error": "petId must be a positive integer."}), 400

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
                p.petid,
                p.name AS pet_name,
                p.species,
                p.breed,
                p.age,
                p.ownerid,
                uo.name AS owner_name
            FROM appointment a
            JOIN pet p ON p.ownerid = a.petownerid
            JOIN users uo ON uo.userid = p.ownerid
            WHERE a.veterinarianid = %s
            ORDER BY p.name ASC
            """,
            (vet_id,),
        )
        available_pets = cursor.fetchall()
        serialized_pets = vet_serialize_records(available_pets)

        if not serialized_pets:
            return jsonify(
                {
                    "vet_id": vet_id,
                    "profile": vet_serialize_records([profile])[0],
                    "selected_pet_id": None,
                    "available_pets": [],
                    "selected_pet": None,
                    "vaccination_plans": [],
                    "vaccination_records": [],
                    "visit_events": [],
                    "prescription_events": [],
                    "referral_events": [],
                }
            )

        if selected_pet_id is None:
            selected_pet_id = int(serialized_pets[0]["petid"])

        selected_pet = next(
            (pet for pet in serialized_pets if int(pet["petid"]) == selected_pet_id),
            None,
        )
        if not selected_pet:
            return jsonify({"error": "Selected pet is not available for this veterinarian."}), 404

        owner_id = int(selected_pet["ownerid"])

        cursor.execute(
            """
            SELECT
                vp.planid,
                vp.nextvaccinationdate,
                vp.veterinarianid,
                COALESCE(u.name, 'Unknown') AS admin_vet_name,
                COALESCE(b.name, 'Unknown') AS branch_name
            FROM vaccinationplan vp
            LEFT JOIN users u ON u.userid = vp.veterinarianid
            LEFT JOIN veterinarian vv ON vv.veterinarianid = vp.veterinarianid
            LEFT JOIN branch b ON b.branchid = vv.branchid
            WHERE vp.petid = %s
            ORDER BY vp.nextvaccinationdate ASC NULLS LAST
            """,
            (selected_pet_id,),
        )
        vaccination_plans = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                vr.recordid,
                vr.shotdate,
                vr.nextduedate,
                vr.frequency,
                COALESCE(m.name, 'Unknown') AS vaccine_name,
                COALESCE(u.name, 'Unknown') AS admin_vet_name,
                COALESCE(b.name, 'Unknown') AS branch_name
            FROM vaccinationrecord vr
            LEFT JOIN vaccinationplan vp ON vp.planid = vr.planid
            LEFT JOIN users u ON u.userid = vp.veterinarianid
            LEFT JOIN veterinarian vv ON vv.veterinarianid = vp.veterinarianid
            LEFT JOIN branch b ON b.branchid = vv.branchid
            LEFT JOIN involves i ON i.recordid = vr.recordid
            LEFT JOIN vaccine v ON v.vaccineid = i.vaccineid
            LEFT JOIN medicine m ON m.medicineid = v.vaccineid
            WHERE vr.petid = %s
            ORDER BY vr.shotdate DESC NULLS LAST, vr.nextduedate DESC NULLS LAST
            """,
            (selected_pet_id,),
        )
        vaccination_records = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                a.appointmentid,
                a.datetime,
                vs.notes,
                COALESCE(u.name, 'Unknown') AS veterinarian_name,
                COALESCE(b.name, 'Unknown') AS branch_name
            FROM appointment a
            JOIN visitsummary vs ON vs.appointmentid = a.appointmentid
            LEFT JOIN users u ON u.userid = a.veterinarianid
            LEFT JOIN veterinarian vv ON vv.veterinarianid = a.veterinarianid
            LEFT JOIN branch b ON b.branchid = vv.branchid
            WHERE a.petownerid = %s
            ORDER BY a.datetime DESC
            """,
            (owner_id,),
        )
        visit_events = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                p.prescriptionid,
                p.prescriptiondate,
                p.treatment,
                COALESCE(u.name, 'Unknown') AS veterinarian_name,
                COALESCE(b.name, 'Unknown') AS branch_name,
                COALESCE(string_agg(DISTINCT m.name, ', '), '') AS medicines
            FROM prescription p
            LEFT JOIN users u ON u.userid = p.veterinarianid
            LEFT JOIN veterinarian vv ON vv.veterinarianid = p.veterinarianid
            LEFT JOIN branch b ON b.branchid = vv.branchid
            LEFT JOIN prescribes pr ON pr.prescriptionid = p.prescriptionid
            LEFT JOIN medicine m ON m.medicineid = pr.medicineid
            WHERE p.petid = %s
            GROUP BY p.prescriptionid, p.prescriptiondate, p.treatment, u.name, b.name
            ORDER BY p.prescriptiondate DESC NULLS LAST
            """,
            (selected_pet_id,),
        )
        prescription_events = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                r.referraldate,
                r.diagnosis,
                COALESCE(ur.name, 'Unknown') AS referrer_name,
                COALESCE(ue.name, 'Unknown') AS referee_name
            FROM refers r
            LEFT JOIN users ur ON ur.userid = r.referrer
            LEFT JOIN users ue ON ue.userid = r.referee
            WHERE r.referrer = %s
            ORDER BY r.referraldate DESC
            LIMIT 20
            """,
            (vet_id,),
        )
        referral_events = cursor.fetchall()

        return jsonify(
            {
                "vet_id": vet_id,
                "profile": vet_serialize_records([profile])[0],
                "selected_pet_id": selected_pet_id,
                "available_pets": serialized_pets,
                "selected_pet": selected_pet,
                "vaccination_plans": vet_serialize_records(vaccination_plans),
                "vaccination_records": vet_serialize_records(vaccination_records),
                "visit_events": vet_serialize_records(visit_events),
                "prescription_events": vet_serialize_records(prescription_events),
                "referral_events": vet_serialize_records(referral_events),
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
