from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from vet.vet_db import vet_get_db_connection, vet_serialize_records


vet_timeline_bp = Blueprint("vet_timeline_bp", __name__)

_VET_REFERRAL_APPROVAL_MARKER = "[[APPROVED_APPT:"


def _vet_parse_optional_positive_int(raw_value):
    """Parse positive integer values, allowing empty values as None."""
    if raw_value is None or raw_value == "":
        return None
    parsed_value = int(raw_value)
    if parsed_value <= 0:
        raise ValueError
    return parsed_value


def _vet_resolve_vet_id(payload=None):
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


def _vet_clean_referral_diagnosis(diagnosis):
    """Hide internal referral approval marker from UI responses."""
    if diagnosis is None:
        return None

    diagnosis_text = str(diagnosis)
    marker_index = diagnosis_text.find(_VET_REFERRAL_APPROVAL_MARKER)
    if marker_index < 0:
        normalized = diagnosis_text.strip()
        return normalized if normalized else None

    diagnosis_without_marker = diagnosis_text[:marker_index].strip()
    return diagnosis_without_marker if diagnosis_without_marker else None


def _vet_resolve_pet_registered_vet(cursor, pet_id, fallback_vet_id=None):
    """Resolve registered veterinarian for pet based on pet-level history."""
    cursor.execute(
        """
        SELECT
            rv.veterinarianid,
            COALESCE(u.name, 'Unknown') AS veterinarian_name,
            v.branchid,
            COALESCE(b.name, 'Unknown') AS branch_name
        FROM (
            SELECT a.veterinarianid
            FROM appointment a
            JOIN vaccinationplan vp ON vp.planid = a.vaccinationplanid
            WHERE vp.petid = %s
            ORDER BY a.datetime DESC
            LIMIT 1
        ) rv
        LEFT JOIN users u ON u.userid = rv.veterinarianid
        LEFT JOIN veterinarian v ON v.veterinarianid = rv.veterinarianid
        LEFT JOIN branch b ON b.branchid = v.branchid
        """,
        (pet_id,),
    )
    resolved = cursor.fetchone()
    if resolved and resolved.get("veterinarianid"):
        return resolved

    cursor.execute(
        """
        SELECT
            vp.veterinarianid,
            COALESCE(u.name, 'Unknown') AS veterinarian_name,
            v.branchid,
            COALESCE(b.name, 'Unknown') AS branch_name
        FROM vaccinationplan vp
        LEFT JOIN users u ON u.userid = vp.veterinarianid
        LEFT JOIN veterinarian v ON v.veterinarianid = vp.veterinarianid
        LEFT JOIN branch b ON b.branchid = v.branchid
        WHERE vp.petid = %s
        ORDER BY vp.nextvaccinationdate DESC NULLS LAST, vp.planid DESC
        LIMIT 1
        """,
        (pet_id,),
    )
    resolved = cursor.fetchone()
    if resolved and resolved.get("veterinarianid"):
        return resolved

    if fallback_vet_id and int(fallback_vet_id) > 0:
        cursor.execute(
            """
            SELECT
                v.veterinarianid,
                COALESCE(u.name, 'Unknown') AS veterinarian_name,
                v.branchid,
                COALESCE(b.name, 'Unknown') AS branch_name
            FROM veterinarian v
            LEFT JOIN users u ON u.userid = v.veterinarianid
            LEFT JOIN branch b ON b.branchid = v.branchid
            WHERE v.veterinarianid = %s
            LIMIT 1
            """,
            (int(fallback_vet_id),),
        )
        resolved = cursor.fetchone()
        if resolved and resolved.get("veterinarianid"):
            return resolved

    return {
        "veterinarianid": None,
        "veterinarian_name": "Unknown",
        "branchid": None,
        "branch_name": "Unknown",
    }


@vet_timeline_bp.route("/api/vet/timeline", methods=["GET"])
def vet_get_timeline():
    """Return timeline-oriented data for veterinarian and selected pet."""
    pet_id_raw = request.args.get("petId")

    try:
        vet_id = _vet_resolve_vet_id()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

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
            SELECT
                v.veterinarianid,
                u.name AS veterinarian_name,
                COALESCE(b.name, 'Unassigned') AS branch_name
            FROM veterinarian v
            JOIN users u ON u.userid = v.veterinarianid
            LEFT JOIN branch b ON b.branchid = v.branchid
            WHERE v.veterinarianid <> %s
            ORDER BY u.name ASC
            """,
            (vet_id,),
        )
        referral_targets = cursor.fetchall()

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
                    "incoming_referral_events": [],
                    "referral_targets": vet_serialize_records(referral_targets),
                    "microchip": None,
                    "timeline_notice": "Timeline is empty for this veterinarian.",
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
                c.chipid AS chip_id,
                c.implantationdate AS implantation_date,
                COALESCE(u.name, 'Unknown') AS registered_by,
                CASE
                    WHEN c.islost THEN 'Reported Lost'
                    ELSE 'Active'
                END AS status,
                c.location AS last_known_location
            FROM chip c
            LEFT JOIN users u ON u.userid = c.veterinarianid
            WHERE c.petid = %s
            ORDER BY c.chipid DESC
            LIMIT 1
            """,
            (selected_pet_id,),
        )
        microchip = cursor.fetchone()

        cursor.execute(
            """
            SELECT
                a.appointmentid,
                a.datetime,
                vs.notes,
                COALESCE(u.name, 'Unknown') AS veterinarian_name,
                COALESCE(b.name, 'Unknown') AS branch_name,
                vp.petid AS linked_pet_id,
                p.name AS linked_pet_name,
                CASE
                    WHEN vp.petid IS NULL THEN TRUE
                    ELSE FALSE
                END AS owner_level_event
            FROM appointment a
            JOIN visitsummary vs ON vs.appointmentid = a.appointmentid
            LEFT JOIN users u ON u.userid = a.veterinarianid
            LEFT JOIN veterinarian vv ON vv.veterinarianid = a.veterinarianid
            LEFT JOIN branch b ON b.branchid = vv.branchid
            LEFT JOIN vaccinationplan vp ON vp.planid = a.vaccinationplanid
            LEFT JOIN pet p ON p.petid = vp.petid
            WHERE a.petownerid = %s
              AND (vp.petid IS NULL OR vp.petid = %s)
            ORDER BY a.datetime DESC
            """,
            (owner_id, selected_pet_id),
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
              AND COALESCE(r.diagnosis, '') NOT LIKE %s
            ORDER BY r.referraldate DESC
            LIMIT 20
            """,
            (vet_id, "[[MICROCHIP_NEWS|%"),
        )
        referral_events = cursor.fetchall()
        for referral_event in referral_events:
            referral_event["diagnosis"] = _vet_clean_referral_diagnosis(
                referral_event.get("diagnosis")
            )

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
            WHERE r.referee = %s
              AND COALESCE(r.diagnosis, '') NOT LIKE %s
            ORDER BY r.referraldate DESC
            LIMIT 20
            """,
            (vet_id, "[[MICROCHIP_NEWS|%"),
        )
        incoming_referral_events = cursor.fetchall()
        for referral_event in incoming_referral_events:
            referral_event["diagnosis"] = _vet_clean_referral_diagnosis(
                referral_event.get("diagnosis")
            )

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
                "incoming_referral_events": vet_serialize_records(incoming_referral_events),
                "referral_targets": vet_serialize_records(referral_targets),
                "microchip": vet_serialize_records([microchip])[0] if microchip else None,
                "timeline_notice": (
                    "Appointments are linked to pet owner, not directly to pet. "
                    "Owner-level visit events may appear when appointment pet is unspecified."
                ),
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_timeline_bp.route("/api/vet/pets/<int:pet_id>/lost-found-report", methods=["POST"])
def vet_create_lost_found_report(pet_id):
    """Create lost/found report for a pet and rely on DB trigger to update chip status."""
    payload = request.get_json(silent=True) or {}

    try:
        vet_id = _vet_resolve_vet_id(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    is_found = payload.get("isFound")
    if not isinstance(is_found, bool):
        return jsonify({"error": "isFound must be a boolean."}), 400

    created_date = payload.get("createdDate")

    conn = None
    cursor = None
    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT
                v.veterinarianid,
                COALESCE(u.name, 'Unknown') AS veterinarian_name,
                COALESCE(b.name, 'Unknown') AS branch_name
            FROM veterinarian v
            LEFT JOIN users u ON u.userid = v.veterinarianid
            LEFT JOIN branch b ON b.branchid = v.branchid
            WHERE v.veterinarianid = %s
            """,
            (vet_id,),
        )
        finder_vet = cursor.fetchone()
        if finder_vet is None:
            return jsonify({"error": "Veterinarian not found."}), 404

        cursor.execute(
            """
            SELECT
                p.petid,
                p.name AS pet_name,
                p.ownerid,
                c.chipid,
                c.veterinarianid AS chip_vet_id,
                COALESCE(uo.name, 'Unknown') AS owner_name,
                uo.phonenumber AS owner_phone,
                uo.email AS owner_email
            FROM pet p
            LEFT JOIN chip c ON c.petid = p.petid
            LEFT JOIN users uo ON uo.userid = p.ownerid
            WHERE p.petid = %s
            """,
            (pet_id,),
        )
        pet_context = cursor.fetchone()
        if pet_context is None:
            return jsonify({"error": "Pet not found."}), 404

        if is_found:
            if pet_context.get("chipid") is None:
                return jsonify({"error": "Microchip record is required to mark found from timeline."}), 409

            registered_vet = _vet_resolve_pet_registered_vet(
                cursor,
                int(pet_id),
                pet_context.get("chip_vet_id"),
            )
            target_vet_id = registered_vet.get("veterinarianid")
            should_notify_vet = bool(target_vet_id and int(target_vet_id) > 0 and int(target_vet_id) != vet_id)
            target_vet_id_int = int(target_vet_id) if target_vet_id and int(target_vet_id) > 0 else None

            # Close unresolved lost reports for this pet first.
            cursor.execute(
                """
                UPDATE lostfoundreport
                SET isfound = TRUE
                WHERE petid = %s
                  AND COALESCE(isfound, FALSE) = FALSE
                """,
                (pet_id,),
            )

            cursor.execute(
                """
                INSERT INTO lostfoundreport (
                    isfound,
                    petid,
                    createddate,
                    foundbyvetid,
                    targetvetid,
                    foundnote,
                    foundat,
                    vetreadat,
                    ownerreadat
                )
                VALUES (
                    TRUE,
                    %s,
                    COALESCE(%s::date, CURRENT_DATE),
                    %s,
                    %s,
                    %s,
                    NOW(),
                    CASE WHEN %s THEN NULL ELSE NOW() END,
                    NULL
                )
                RETURNING reportid, isfound, petid, createddate, foundbyvetid, targetvetid, foundnote, foundat
                """,
                (
                    pet_id,
                    created_date,
                    vet_id,
                    target_vet_id_int,
                    "Found update from timeline action.",
                    should_notify_vet,
                ),
            )
            created_report = cursor.fetchone()
        else:
            cursor.execute(
                """
                INSERT INTO lostfoundreport (isfound, petid, createddate)
                VALUES (
                    %s,
                    %s,
                    COALESCE(%s::date, CURRENT_DATE)
                )
                RETURNING reportid, isfound, petid, createddate
                """,
                (False, pet_id, created_date),
            )
            created_report = cursor.fetchone()

        cursor.execute(
            """
            SELECT
                c.chipid AS chip_id,
                c.islost,
                c.location AS last_known_location,
                c.implantationdate AS implantation_date
            FROM chip c
            WHERE c.petid = %s
            ORDER BY c.chipid DESC
            LIMIT 1
            """,
            (pet_id,),
        )
        updated_chip = cursor.fetchone()

        conn.commit()
        return jsonify(
            {
                "message": "Lost/found report saved and chip status synchronized.",
                "report": vet_serialize_records([created_report])[0],
                "chip": vet_serialize_records([updated_chip])[0] if updated_chip else None,
            }
        ), 201
    except Exception as exc:
        if conn:
            conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
