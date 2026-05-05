from datetime import date, datetime, timedelta
from decimal import Decimal

import psycopg2
from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from vet.vet_db import vet_get_db_connection, vet_serialize_records


vet_appointments_bp = Blueprint("vet_appointments_bp", __name__)

_VET_REFERRAL_APPROVAL_MARKER = "[[APPROVED_APPT:"
_VET_REFERRAL_APPROVAL_SUFFIX = "]]"


def _vet_parse_filter_date(raw_date):
    """Parse optional date filters in YYYY-MM-DD format."""
    if not raw_date:
        return None
    return datetime.strptime(raw_date, "%Y-%m-%d").date()


def _vet_parse_optional_date(raw_value, field_name):
    """Parse optional YYYY-MM-DD date values."""
    if raw_value is None or raw_value == "":
        return None
    if not isinstance(raw_value, str):
        raise ValueError(f"{field_name} must be a YYYY-MM-DD date.")
    return datetime.strptime(raw_value.strip(), "%Y-%m-%d").date()


def _vet_parse_optional_int(raw_value):
    """Parse optional integer values."""
    if raw_value is None or raw_value == "":
        return None
    parsed_value = int(raw_value)
    if parsed_value <= 0:
        raise ValueError
    return parsed_value


def _vet_parse_positive_int_list(raw_values, field_name):
    """Parse a list of positive integers."""
    if raw_values is None:
        return []
    if not isinstance(raw_values, list):
        raise ValueError(f"{field_name} must be an array.")

    parsed_values = []
    for raw_value in raw_values:
        try:
            parsed_value = int(raw_value)
        except (TypeError, ValueError):
            raise ValueError(f"{field_name} must contain positive integers.")
        if parsed_value <= 0:
            raise ValueError(f"{field_name} must contain positive integers.")
        parsed_values.append(parsed_value)
    return parsed_values


def _vet_parse_required_text(raw_value, field_name):
    """Validate required non-empty string values."""
    if not isinstance(raw_value, str) or not raw_value.strip():
        raise ValueError(f"{field_name} is required.")
    return raw_value.strip()


def _vet_resolve_vet_id(payload=None):
    """Resolve veterinarian id from body, query, header, or fallback."""
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


def _vet_serialize_row(row):
    """Serialize one RealDict row with date/time/decimal safety."""
    if row is None:
        return None
    serialized = {}
    for key, value in row.items():
        if isinstance(value, (date, datetime)):
            serialized[key] = value.isoformat()
        elif isinstance(value, Decimal):
            serialized[key] = float(value)
        else:
            serialized[key] = value
    return serialized


def _vet_parse_referral_diagnosis_status(diagnosis):
    """Split referral diagnosis text from internal approval marker."""
    if diagnosis is None:
        return None, False

    diagnosis_text = str(diagnosis)
    marker_index = diagnosis_text.find(_VET_REFERRAL_APPROVAL_MARKER)
    if marker_index < 0:
        normalized = diagnosis_text.strip()
        return normalized if normalized else None, False

    diagnosis_without_marker = diagnosis_text[:marker_index].strip()
    return diagnosis_without_marker if diagnosis_without_marker else None, True


def _vet_build_approved_referral_diagnosis(diagnosis, appointment_id, appointment_datetime):
    """Append a compact internal marker so approved referrals remain identifiable."""
    diagnosis_text = "" if diagnosis is None else str(diagnosis)
    if _VET_REFERRAL_APPROVAL_MARKER in diagnosis_text:
        return diagnosis_text

    approval_token = (
        f"{_VET_REFERRAL_APPROVAL_MARKER}{appointment_id}|"
        f"{appointment_datetime.isoformat()}{_VET_REFERRAL_APPROVAL_SUFFIX}"
    )
    diagnosis_body = diagnosis_text.strip()
    if diagnosis_body:
        return f"{diagnosis_body} {approval_token}"
    return approval_token


def _vet_error_response(exc):
    """Map database errors to cleaner API responses."""
    message = str(exc).strip() if str(exc).strip() else "Database operation failed."
    status_code = 500

    if isinstance(exc, psycopg2.Error):
        pgcode = exc.pgcode
        if pgcode in {"23503", "23505", "23514"}:
            status_code = 409
        elif pgcode == "22P02":
            status_code = 400

    if "Medicine stock cannot become negative" in message:
        return jsonify({"error": "Insufficient medicine stock for this prescription."}), 409

    if "maximum daily appointment limit" in message:
        return jsonify({"error": message}), 409

    return jsonify({"error": message}), status_code


def _vet_fetch_appointment_context(cursor, appointment_id, vet_id):
    """Fetch appointment row owned by veterinarian and required context."""
    cursor.execute(
        """
        SELECT
            a.appointmentid,
            a.datetime,
            a.atype,
            a.vaccinationplanid,
            a.veterinarianid,
            a.petownerid,
            uo.name AS owner_name,
            COALESCE(b.branchid, 0) AS branchid,
            COALESCE(b.name, 'Unassigned') AS branch_name
        FROM appointment a
        JOIN petowner po ON po.ownerid = a.petownerid
        JOIN users uo ON uo.userid = po.ownerid
        LEFT JOIN veterinarian v ON v.veterinarianid = a.veterinarianid
        LEFT JOIN branch b ON b.branchid = v.branchid
        WHERE a.appointmentid = %s
          AND a.veterinarianid = %s
        """,
        (appointment_id, vet_id),
    )
    return cursor.fetchone()


def _vet_fetch_owner_pets(cursor, owner_id):
    """Fetch pets belonging to the appointment owner."""
    cursor.execute(
        """
        SELECT
            p.petid,
            p.name AS pet_name,
            p.species,
            p.breed,
            p.age,
            p.sex
        FROM pet p
        WHERE p.ownerid = %s
        ORDER BY p.name ASC, p.petid ASC
        """,
        (owner_id,),
    )
    return cursor.fetchall()


def _vet_find_next_available_datetime(cursor, veterinarian_id, starting_datetime):
    """Find next available datetime slot for veterinarian with 30-minute increments."""
    candidate = starting_datetime.replace(second=0, microsecond=0)
    for _ in range(96):  # 48 hours window
        cursor.execute(
            """
            SELECT 1
            FROM appointment
            WHERE veterinarianid = %s
              AND datetime = %s
            LIMIT 1
            """,
            (veterinarian_id, candidate),
        )
        if cursor.fetchone() is None:
            return candidate
        candidate += timedelta(minutes=30)
    raise ValueError("No available appointment slot found for veterinarian.")


def _vet_resolve_selected_pet_id(owner_pets, requested_pet_id):
    """Choose selected pet id within owner's pets."""
    if not owner_pets:
        return None

    allowed_pet_ids = {int(row["petid"]) for row in owner_pets}
    if requested_pet_id is None:
        return int(owner_pets[0]["petid"])

    if requested_pet_id not in allowed_pet_ids:
        raise ValueError("Selected pet is not owned by the appointment owner.")
    return requested_pet_id


@vet_appointments_bp.route("/api/vet/appointments", methods=["GET"])
def vet_get_appointments():
    """Return veterinarian appointments with optional branch/date filters."""
    date_raw = request.args.get("date")
    branch_id_raw = request.args.get("branchId")

    try:
        vet_id = _vet_resolve_vet_id()
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
                COALESCE(vp_pet.petid, p.petid) AS petid,
                COALESCE(vp_pet.name, p.name, 'Unknown') AS pet_name,
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
            LEFT JOIN vaccinationplan vp ON vp.planid = a.vaccinationplanid
            LEFT JOIN pet vp_pet ON vp_pet.petid = vp.petid
            LEFT JOIN LATERAL (
                SELECT p.petid, p.name
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

        cursor.execute(
            """
            SELECT
                r.referraldate,
                r.diagnosis,
                r.referrer AS referrer_vet_id,
                COALESCE(ur.name, 'Unknown') AS referrer_name,
                COALESCE(br.name, 'Unassigned') AS referrer_branch_name,
                inferred.petownerid AS inferred_owner_id,
                COALESCE(uo.name, 'Unknown') AS inferred_owner_name,
                inferred.vaccinationplanid AS inferred_vaccination_plan_id,
                inferred.atype::text AS inferred_appointment_type
            FROM refers r
            LEFT JOIN users ur ON ur.userid = r.referrer
            LEFT JOIN veterinarian vr ON vr.veterinarianid = r.referrer
            LEFT JOIN branch br ON br.branchid = vr.branchid
            LEFT JOIN LATERAL (
                SELECT
                    a.petownerid,
                    a.vaccinationplanid,
                    a.atype
                FROM appointment a
                WHERE a.veterinarianid = r.referrer
                ORDER BY ABS(a.datetime::date - r.referraldate) ASC, a.datetime DESC
                LIMIT 1
            ) inferred ON TRUE
            LEFT JOIN users uo ON uo.userid = inferred.petownerid
            WHERE r.referee = %s
              AND COALESCE(r.diagnosis, '') NOT LIKE %s
            ORDER BY r.referraldate DESC
            LIMIT 20
            """,
            (vet_id, "[[MICROCHIP_NEWS|%"),
        )
        incoming_referrals = cursor.fetchall()
        normalized_incoming_referrals = []
        for referral in incoming_referrals:
            diagnosis_raw = referral.get("diagnosis")
            diagnosis_text, approved = _vet_parse_referral_diagnosis_status(diagnosis_raw)
            referral["diagnosis_raw"] = diagnosis_raw
            referral["diagnosis"] = diagnosis_text
            referral["approved"] = approved
            normalized_incoming_referrals.append(referral)

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
                "incoming_referrals": vet_serialize_records(normalized_incoming_referrals),
            }
        )
    except Exception as exc:
        return _vet_error_response(exc)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_appointments_bp.route("/api/vet/appointments/<int:appointment_id>/detail", methods=["GET"])
def vet_get_appointment_detail(appointment_id):
    """Return detailed appointment context for veterinarian workflows."""
    pet_id_raw = request.args.get("petId")

    try:
        vet_id = _vet_resolve_vet_id()
    except ValueError:
        return jsonify({"error": "vetId must be a positive integer."}), 400

    try:
        selected_pet_id_requested = _vet_parse_optional_int(pet_id_raw)
    except ValueError:
        return jsonify({"error": "petId must be a positive integer."}), 400

    conn = None
    cursor = None

    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        appointment = _vet_fetch_appointment_context(cursor, appointment_id, vet_id)
        if not appointment:
            return jsonify({"error": "Appointment not found for this veterinarian."}), 404

        owner_pets = _vet_fetch_owner_pets(cursor, int(appointment["petownerid"]))

        try:
            selected_pet_id = _vet_resolve_selected_pet_id(owner_pets, selected_pet_id_requested)
        except ValueError:
            return jsonify({"error": "Selected pet is not available for this appointment owner."}), 404

        selected_pet = next(
            (pet for pet in owner_pets if int(pet["petid"]) == selected_pet_id),
            None,
        )

        if selected_pet_id:
            cursor.execute(
                """
                SELECT
                    mh.historyid,
                    mh.pastdiagnosis,
                    mh.allergies
                FROM medicalhistory mh
                WHERE mh.petid = %s
                ORDER BY mh.historyid DESC
                LIMIT 20
                """,
                (selected_pet_id,),
            )
            medical_history = cursor.fetchall()

            cursor.execute(
                """
                SELECT
                    p.prescriptionid,
                    p.prescriptiondate,
                    p.treatment,
                    COALESCE(string_agg(DISTINCT m.name, ', '), '') AS medicines,
                    COALESCE(u.name, 'Unknown') AS veterinarian_name
                FROM prescription p
                LEFT JOIN prescribes pr ON pr.prescriptionid = p.prescriptionid
                LEFT JOIN medicine m ON m.medicineid = pr.medicineid
                LEFT JOIN users u ON u.userid = p.veterinarianid
                WHERE p.petid = %s
                GROUP BY p.prescriptionid, p.prescriptiondate, p.treatment, u.name
                ORDER BY p.prescriptiondate DESC NULLS LAST, p.prescriptionid DESC
                LIMIT 20
                """,
                (selected_pet_id,),
            )
            prescription_history = cursor.fetchall()

            cursor.execute(
                """
                SELECT
                    vr.recordid,
                    vr.shotdate,
                    vr.nextduedate,
                    vr.frequency,
                    COALESCE(m.name, 'Unknown') AS vaccine_name
                FROM vaccinationrecord vr
                LEFT JOIN involves i ON i.recordid = vr.recordid
                LEFT JOIN vaccine v ON v.vaccineid = i.vaccineid
                LEFT JOIN medicine m ON m.medicineid = v.vaccineid
                WHERE vr.petid = %s
                ORDER BY vr.shotdate DESC NULLS LAST, vr.nextduedate DESC NULLS LAST
                LIMIT 20
                """,
                (selected_pet_id,),
            )
            vaccination_history = cursor.fetchall()
        else:
            medical_history = []
            prescription_history = []
            vaccination_history = []

        cursor.execute(
            """
            SELECT
                vs.visitid,
                vs.notes
            FROM visitsummary vs
            WHERE vs.appointmentid = %s
            ORDER BY vs.visitid DESC
            LIMIT 1
            """,
            (appointment_id,),
        )
        latest_visit_summary = cursor.fetchone()

        cursor.execute(
            """
            SELECT
                b.billno,
                b.appointmentid,
                b.consultationfee,
                b.treatmentcost,
                b.medicationcost,
                b.duedate,
                b.paid
            FROM bill b
            WHERE b.appointmentid = %s
            LIMIT 1
            """,
            (appointment_id,),
        )
        existing_bill = cursor.fetchone()

        cursor.execute(
            """
            SELECT
                m.medicineid,
                m.name,
                m.quantity,
                m.status::text AS status,
                m.category::text AS category,
                m.expiracydate
            FROM medicine m
            WHERE m.branchid = (
                SELECT v.branchid
                FROM veterinarian v
                WHERE v.veterinarianid = %s
            )
            ORDER BY m.name ASC
            """,
            (vet_id,),
        )
        available_medicines = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                lsmv.medicineid,
                lsmv.medicinename,
                lsmv.quantity,
                lsmv.threshold,
                lsmv.status::text AS status,
                lsmv.expiracydate
            FROM lowstockmedicineview lsmv
            WHERE lsmv.branchid = %s
            ORDER BY lsmv.quantity ASC, lsmv.medicinename ASC
            LIMIT 12
            """,
            (appointment["branchid"],),
        )
        low_stock_medicines = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                ubv.billno,
                ubv.appointmentid,
                ubv.duedate,
                ubv.consultationfee,
                ubv.treatmentcost,
                ubv.medicationcost
            FROM unpaidbillsview ubv
            WHERE ubv.payerid = %s
            ORDER BY ubv.duedate ASC NULLS LAST, ubv.billno ASC
            LIMIT 12
            """,
            (appointment["petownerid"],),
        )
        unpaid_owner_bills = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                v.veterinarianid,
                u.name AS veterinarian_name,
                v.speciesexpertise,
                COALESCE(b.branchid, 0) AS branchid,
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

        return jsonify(
            {
                "vet_id": vet_id,
                "appointment": _vet_serialize_row(appointment),
                "pet_options": vet_serialize_records(owner_pets),
                "selected_pet_id": selected_pet_id,
                "selected_pet": _vet_serialize_row(selected_pet),
                "medical_history": vet_serialize_records(medical_history),
                "prescription_history": vet_serialize_records(prescription_history),
                "vaccination_history": vet_serialize_records(vaccination_history),
                "latest_visit_summary": _vet_serialize_row(latest_visit_summary),
                "is_completed": existing_bill is not None,
                "existing_bill": _vet_serialize_row(existing_bill),
                "available_medicines": vet_serialize_records(available_medicines),
                "low_stock_medicines": vet_serialize_records(low_stock_medicines),
                "unpaid_owner_bills": vet_serialize_records(unpaid_owner_bills),
                "referral_targets": vet_serialize_records(referral_targets),
            }
        )
    except Exception as exc:
        return _vet_error_response(exc)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_appointments_bp.route("/api/vet/appointments/<int:appointment_id>/visit-summary", methods=["POST"])
def vet_upsert_visit_summary(appointment_id):
    """Insert or update appointment visit summary notes."""
    payload = request.get_json(silent=True) or {}

    try:
        vet_id = _vet_resolve_vet_id(payload)
        notes = _vet_parse_required_text(payload.get("notes"), "notes")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = None
    cursor = None

    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        appointment = _vet_fetch_appointment_context(cursor, appointment_id, vet_id)
        if not appointment:
            return jsonify({"error": "Appointment not found for this veterinarian."}), 404

        cursor.execute(
            """
            SELECT vs.visitid
            FROM visitsummary vs
            WHERE vs.appointmentid = %s
            ORDER BY vs.visitid DESC
            LIMIT 1
            """,
            (appointment_id,),
        )
        existing = cursor.fetchone()

        if existing:
            cursor.execute(
                """
                UPDATE visitsummary
                SET notes = %s
                WHERE visitid = %s
                RETURNING visitid, appointmentid, notes
                """,
                (notes, existing["visitid"]),
            )
        else:
            cursor.execute(
                """
                INSERT INTO visitsummary (appointmentid, notes)
                VALUES (%s, %s)
                RETURNING visitid, appointmentid, notes
                """,
                (appointment_id, notes),
            )

        saved_summary = cursor.fetchone()
        conn.commit()

        return jsonify(
            {
                "message": "Visit summary saved.",
                "visit_summary": _vet_serialize_row(saved_summary),
            }
        )
    except Exception as exc:
        if conn:
            conn.rollback()
        return _vet_error_response(exc)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_appointments_bp.route("/api/vet/appointments/<int:appointment_id>/prescriptions", methods=["POST"])
def vet_create_prescription(appointment_id):
    """Create prescription and attach medicines via Prescribes relation."""
    payload = request.get_json(silent=True) or {}

    try:
        vet_id = _vet_resolve_vet_id(payload)
        pet_id = _vet_parse_optional_int(payload.get("petId"))
        treatment = _vet_parse_required_text(payload.get("treatment"), "treatment")
        if pet_id is None:
            raise ValueError("petId is required.")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    medicine_ids_raw = payload.get("medicineIds") or []
    if not isinstance(medicine_ids_raw, list):
        return jsonify({"error": "medicineIds must be an array."}), 400

    medicine_ids = []
    try:
        for raw_medicine_id in medicine_ids_raw:
            parsed_medicine_id = int(raw_medicine_id)
            if parsed_medicine_id <= 0:
                raise ValueError
            medicine_ids.append(parsed_medicine_id)
    except (TypeError, ValueError):
        return jsonify({"error": "medicineIds must contain positive integers."}), 400

    prescription_date = payload.get("prescriptionDate")

    conn = None
    cursor = None

    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        appointment = _vet_fetch_appointment_context(cursor, appointment_id, vet_id)
        if not appointment:
            return jsonify({"error": "Appointment not found for this veterinarian."}), 404

        owner_pets = _vet_fetch_owner_pets(cursor, int(appointment["petownerid"]))
        allowed_pet_ids = {int(row["petid"]) for row in owner_pets}
        if pet_id not in allowed_pet_ids:
            return jsonify({"error": "Selected pet does not belong to this appointment owner."}), 409

        cursor.execute(
            """
            INSERT INTO prescription (treatment, veterinarianid, petid, prescriptiondate)
            VALUES (
                %s,
                %s,
                %s,
                COALESCE(%s::date, CURRENT_DATE)
            )
            RETURNING prescriptionid, treatment, veterinarianid, petid, prescriptiondate
            """,
            (treatment, vet_id, pet_id, prescription_date),
        )
        prescription = cursor.fetchone()

        linked_medicines = []
        for medicine_id in medicine_ids:
            cursor.execute(
                """
                INSERT INTO prescribes (prescriptionid, medicineid)
                VALUES (%s, %s)
                RETURNING prescriptionid, medicineid
                """,
                (prescription["prescriptionid"], medicine_id),
            )
            linked_medicines.append(cursor.fetchone())

        conn.commit()

        return jsonify(
            {
                "message": "Prescription saved.",
                "prescription": _vet_serialize_row(prescription),
                "linked_medicines": vet_serialize_records(linked_medicines),
            }
        ), 201
    except Exception as exc:
        if conn:
            conn.rollback()
        return _vet_error_response(exc)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_appointments_bp.route("/api/vet/referrals", methods=["POST"])
def vet_create_referral():
    """Create referral record between veterinarians."""
    payload = request.get_json(silent=True) or {}

    try:
        referrer_vet_id = _vet_resolve_vet_id(payload)
        referee_vet_id = _vet_parse_optional_int(payload.get("refereeVetId"))
        if referee_vet_id is None:
            raise ValueError("refereeVetId is required.")
        if referee_vet_id == referrer_vet_id:
            raise ValueError("refereeVetId must be different from referrer veterinarian.")
        diagnosis = payload.get("diagnosis")
        referral_date = payload.get("referralDate")
        pet_owner_id = _vet_parse_optional_int(payload.get("petOwnerId"))
        vaccination_plan_id = _vet_parse_optional_int(payload.get("vaccinationPlanId"))
        appointment_type_raw = payload.get("appointmentType")
        appointment_type = (
            appointment_type_raw.strip().upper()
            if isinstance(appointment_type_raw, str) and appointment_type_raw.strip()
            else "COMPLAINT"
        )
        if appointment_type not in {"CHECKUP", "VACCINATION", "COMPLAINT", "EMERGENCY"}:
            raise ValueError("appointmentType is invalid.")

        follow_up_datetime_raw = payload.get("followUpDateTime")
        parsed_follow_up_datetime = None
        if isinstance(follow_up_datetime_raw, str) and follow_up_datetime_raw.strip():
            normalized_for_parse = follow_up_datetime_raw.strip().replace("Z", "+00:00")
            parsed_follow_up_datetime = datetime.fromisoformat(normalized_for_parse)
            if parsed_follow_up_datetime.tzinfo is not None:
                parsed_follow_up_datetime = parsed_follow_up_datetime.replace(tzinfo=None)
            parsed_follow_up_datetime = parsed_follow_up_datetime.replace(second=0, microsecond=0)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = None
    cursor = None

    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT v.veterinarianid
            FROM veterinarian v
            WHERE v.veterinarianid = %s
            """,
            (referrer_vet_id,),
        )
        if cursor.fetchone() is None:
            return jsonify({"error": "Referrer veterinarian not found."}), 404

        cursor.execute(
            """
            SELECT v.veterinarianid
            FROM veterinarian v
            WHERE v.veterinarianid = %s
            """,
            (referee_vet_id,),
        )
        if cursor.fetchone() is None:
            return jsonify({"error": "Referee veterinarian not found."}), 404

        if pet_owner_id is not None:
            cursor.execute(
                """
                SELECT po.ownerid
                FROM petowner po
                WHERE po.ownerid = %s
                """,
                (pet_owner_id,),
            )
            if cursor.fetchone() is None:
                return jsonify({"error": "petOwnerId not found."}), 404

        cursor.execute(
            """
            INSERT INTO refers (referrer, referee, referraldate, diagnosis)
            VALUES (
                %s,
                %s,
                COALESCE(%s::date, CURRENT_DATE),
                %s
            )
            RETURNING referrer, referee, referraldate, diagnosis
            """,
            (
                referrer_vet_id,
                referee_vet_id,
                referral_date,
                diagnosis,
            ),
        )
        referral = cursor.fetchone()

        follow_up_appointment = None
        if pet_owner_id is not None:
            base_datetime = parsed_follow_up_datetime or (
                datetime.now().replace(second=0, microsecond=0) + timedelta(days=1)
            )
            slot_datetime = _vet_find_next_available_datetime(cursor, referee_vet_id, base_datetime)

            cursor.execute(
                """
                INSERT INTO appointment (
                    atype,
                    datetime,
                    vaccinationplanid,
                    veterinarianid,
                    petownerid
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING appointmentid, atype, datetime, vaccinationplanid, veterinarianid, petownerid
                """,
                (
                    appointment_type,
                    slot_datetime,
                    vaccination_plan_id,
                    referee_vet_id,
                    pet_owner_id,
                ),
            )
            follow_up_appointment = cursor.fetchone()

        conn.commit()

        return jsonify(
            {
                "message": "Referral created.",
                "referral": _vet_serialize_row(referral),
                "follow_up_appointment": _vet_serialize_row(follow_up_appointment),
            }
        ), 201
    except Exception as exc:
        if conn:
            conn.rollback()
        return _vet_error_response(exc)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_appointments_bp.route("/api/vet/referrals/approve", methods=["POST"])
def vet_approve_referral():
    """Approve incoming referral by scheduling it as a new appointment."""
    payload = request.get_json(silent=True) or {}

    try:
        referee_vet_id = _vet_resolve_vet_id(payload)
        referrer_vet_id = _vet_parse_optional_int(payload.get("referrerVetId"))
        if referrer_vet_id is None:
            raise ValueError("referrerVetId is required.")

        referral_date_raw = payload.get("referralDate")
        if not isinstance(referral_date_raw, str) or not referral_date_raw.strip():
            raise ValueError("referralDate is required.")
        referral_date = datetime.strptime(referral_date_raw.strip(), "%Y-%m-%d").date()

        diagnosis_raw = payload.get("diagnosisRaw")
        if diagnosis_raw is not None and not isinstance(diagnosis_raw, str):
            raise ValueError("diagnosisRaw must be a string or null.")

        scheduled_datetime_raw = payload.get("scheduledDateTime")
        if not isinstance(scheduled_datetime_raw, str) or not scheduled_datetime_raw.strip():
            raise ValueError("scheduledDateTime is required.")
        normalized_for_parse = scheduled_datetime_raw.strip().replace("Z", "+00:00")
        parsed_datetime = datetime.fromisoformat(normalized_for_parse)
        if parsed_datetime.tzinfo is not None:
            parsed_datetime = parsed_datetime.replace(tzinfo=None)
        parsed_datetime = parsed_datetime.replace(second=0, microsecond=0)

        pet_owner_id = _vet_parse_optional_int(payload.get("petOwnerId"))
        vaccination_plan_id = _vet_parse_optional_int(payload.get("vaccinationPlanId"))
        appointment_type_raw = payload.get("appointmentType")
        appointment_type = (
            appointment_type_raw.strip().upper()
            if isinstance(appointment_type_raw, str) and appointment_type_raw.strip()
            else "COMPLAINT"
        )
        if appointment_type not in {"CHECKUP", "VACCINATION", "COMPLAINT", "EMERGENCY"}:
            raise ValueError("appointmentType is invalid.")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = None
    cursor = None
    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT r.diagnosis
            FROM refers r
            WHERE r.referrer = %s
              AND r.referee = %s
              AND r.referraldate = %s
              AND r.diagnosis IS NOT DISTINCT FROM %s
            FOR UPDATE
            LIMIT 1
            """,
            (referrer_vet_id, referee_vet_id, referral_date, diagnosis_raw),
        )
        referral_row = cursor.fetchone()
        if referral_row is None:
            return jsonify({"error": "Referral record not found."}), 404

        _, is_already_approved = _vet_parse_referral_diagnosis_status(referral_row.get("diagnosis"))
        if is_already_approved:
            return jsonify({"message": "Referral already approved.", "approved": True}), 200

        if pet_owner_id is None:
            cursor.execute(
                """
                SELECT a.petownerid, a.vaccinationplanid, a.atype
                FROM appointment a
                WHERE a.veterinarianid = %s
                ORDER BY ABS(a.datetime::date - %s::date) ASC, a.datetime DESC
                LIMIT 1
                """,
                (referrer_vet_id, referral_date),
            )
            inferred = cursor.fetchone()
            if inferred is None:
                return jsonify({"error": "Could not infer pet owner context for this referral."}), 409
            pet_owner_id = int(inferred["petownerid"])
            if vaccination_plan_id is None:
                vaccination_plan_id = inferred["vaccinationplanid"]
            if payload.get("appointmentType") is None and inferred.get("atype"):
                appointment_type = str(inferred["atype"]).upper()

        slot_datetime = _vet_find_next_available_datetime(cursor, referee_vet_id, parsed_datetime)

        cursor.execute(
            """
            INSERT INTO appointment (
                atype,
                datetime,
                vaccinationplanid,
                veterinarianid,
                petownerid
            )
            VALUES (%s, %s, %s, %s, %s)
            RETURNING appointmentid, atype, datetime, vaccinationplanid, veterinarianid, petownerid
            """,
            (
                appointment_type,
                slot_datetime,
                vaccination_plan_id,
                referee_vet_id,
                pet_owner_id,
            ),
        )
        created_appointment = cursor.fetchone()

        updated_diagnosis = _vet_build_approved_referral_diagnosis(
            diagnosis_raw,
            int(created_appointment["appointmentid"]),
            created_appointment["datetime"],
        )
        cursor.execute(
            """
            UPDATE refers
            SET diagnosis = %s
            WHERE referrer = %s
              AND referee = %s
              AND referraldate = %s
              AND diagnosis IS NOT DISTINCT FROM %s
            """,
            (
                updated_diagnosis,
                referrer_vet_id,
                referee_vet_id,
                referral_date,
                diagnosis_raw,
            ),
        )
        conn.commit()

        return jsonify(
            {
                "message": "Referral approved and appointment created.",
                "approved": True,
                "appointment": _vet_serialize_row(created_appointment),
            }
        ), 201
    except Exception as exc:
        if conn:
            conn.rollback()
        return _vet_error_response(exc)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_appointments_bp.route("/api/vet/appointments/<int:appointment_id>/reschedule", methods=["POST"])
def vet_reschedule_appointment(appointment_id):
    """Update appointment datetime to support clinical scheduling workflows."""
    payload = request.get_json(silent=True) or {}

    try:
        vet_id = _vet_resolve_vet_id(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    new_datetime_raw = payload.get("newDateTime")
    if not isinstance(new_datetime_raw, str) or not new_datetime_raw.strip():
        return jsonify({"error": "newDateTime is required."}), 400

    normalized_datetime_raw = new_datetime_raw.strip()
    try:
        normalized_for_parse = normalized_datetime_raw.replace("Z", "+00:00")
        parsed_datetime = datetime.fromisoformat(normalized_for_parse)
        if parsed_datetime.tzinfo is not None:
            parsed_datetime = parsed_datetime.replace(tzinfo=None)
        parsed_datetime = parsed_datetime.replace(second=0, microsecond=0)
    except ValueError:
        return jsonify({"error": "newDateTime must be a valid ISO datetime string."}), 400

    conn = None
    cursor = None

    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        appointment = _vet_fetch_appointment_context(cursor, appointment_id, vet_id)
        if not appointment:
            return jsonify({"error": "Appointment not found for this veterinarian."}), 404

        cursor.execute(
            """
            UPDATE appointment
            SET datetime = %s
            WHERE appointmentid = %s
              AND veterinarianid = %s
            RETURNING appointmentid, datetime, atype, veterinarianid, petownerid, vaccinationplanid
            """,
            (parsed_datetime, appointment_id, vet_id),
        )
        updated_appointment = cursor.fetchone()
        conn.commit()

        return jsonify(
            {
                "message": "Appointment rescheduled successfully.",
                "appointment": _vet_serialize_row(updated_appointment),
            }
        )
    except Exception as exc:
        if conn:
            conn.rollback()
        return _vet_error_response(exc)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_appointments_bp.route("/api/vet/appointments/<int:appointment_id>/finalize", methods=["POST"])
def vet_finalize_appointment(appointment_id):
    """Finalize draft clinical actions and complete appointment in one transaction."""
    payload = request.get_json(silent=True) or {}

    try:
        vet_id = _vet_resolve_vet_id(payload)
        notes_raw = payload.get("notes")
        if isinstance(notes_raw, str) and notes_raw.strip():
            notes = notes_raw.strip()
        else:
            notes = "Visit completed."
        consultation_fee = payload.get("consultationFee", 0)
        treatment_cost = payload.get("treatmentCost", 0)
        medication_cost = payload.get("medicationCost", 0)
        due_date = payload.get("dueDate")

        selected_pet_id = _vet_parse_optional_int(payload.get("petId"))
        treatment_raw = payload.get("treatment")
        treatment = treatment_raw.strip() if isinstance(treatment_raw, str) and treatment_raw.strip() else None
        medicine_ids = _vet_parse_positive_int_list(payload.get("medicineIds"), "medicineIds")

        referee_vet_id = _vet_parse_optional_int(payload.get("refereeVetId"))
        referral_diagnosis_raw = payload.get("referralDiagnosis")
        referral_diagnosis = (
            referral_diagnosis_raw.strip()
            if isinstance(referral_diagnosis_raw, str) and referral_diagnosis_raw.strip()
            else None
        )

        vaccination_vaccine_id = _vet_parse_optional_int(payload.get("vaccinationVaccineId"))
        vaccination_shot_date = _vet_parse_optional_date(
            payload.get("vaccinationShotDate"),
            "vaccinationShotDate",
        )
        vaccination_next_due_date = _vet_parse_optional_date(
            payload.get("vaccinationNextDueDate"),
            "vaccinationNextDueDate",
        )
        vaccination_frequency_days = _vet_parse_optional_int(
            payload.get("vaccinationFrequencyDays")
        )
        vaccination_dose_count = _vet_parse_optional_int(
            payload.get("vaccinationDoseCount")
        )
        vaccination_frequency_legacy_raw = payload.get("vaccinationFrequency")
        vaccination_frequency_legacy = (
            vaccination_frequency_legacy_raw.strip()
            if isinstance(vaccination_frequency_legacy_raw, str)
            and vaccination_frequency_legacy_raw.strip()
            else None
        )

        new_datetime_raw = payload.get("newDateTime")
        parsed_datetime = None
        if isinstance(new_datetime_raw, str) and new_datetime_raw.strip():
            normalized_for_parse = new_datetime_raw.strip().replace("Z", "+00:00")
            parsed_datetime = datetime.fromisoformat(normalized_for_parse)
            if parsed_datetime.tzinfo is not None:
                parsed_datetime = parsed_datetime.replace(tzinfo=None)
            parsed_datetime = parsed_datetime.replace(second=0, microsecond=0)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if medicine_ids and not treatment:
        return jsonify({"error": "treatment is required when medicineIds are provided."}), 400
    if treatment and selected_pet_id is None:
        return jsonify({"error": "petId is required when treatment is provided."}), 400
    if vaccination_vaccine_id is None and (
        vaccination_shot_date is not None
        or vaccination_next_due_date is not None
        or vaccination_frequency_days is not None
        or vaccination_dose_count is not None
        or vaccination_frequency_legacy is not None
    ):
        return jsonify({"error": "vaccinationVaccineId is required when vaccination details are provided."}), 400
    if vaccination_vaccine_id is not None and selected_pet_id is None:
        return jsonify({"error": "petId is required when vaccination is provided."}), 400
    if (
        vaccination_vaccine_id is not None
        and vaccination_next_due_date is None
        and vaccination_frequency_days is None
        and vaccination_dose_count is None
    ):
        return jsonify(
            {
                "error": (
                    "Provide vaccinationNextDueDate, vaccinationFrequencyDays, "
                    "or vaccinationDoseCount for vaccination records."
                )
            }
        ), 400
    if (referee_vet_id is None) != (referral_diagnosis is None):
        return jsonify({"error": "refereeVetId and referralDiagnosis must be provided together."}), 400
    if referee_vet_id is not None and referee_vet_id == vet_id:
        return jsonify({"error": "refereeVetId must be different from current veterinarian."}), 400

    conn = None
    cursor = None

    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        appointment = _vet_fetch_appointment_context(cursor, appointment_id, vet_id)
        if not appointment:
            return jsonify({"error": "Appointment not found for this veterinarian."}), 404

        cursor.execute(
            """
            SELECT b.billno
            FROM bill b
            WHERE b.appointmentid = %s
            LIMIT 1
            """,
            (appointment_id,),
        )
        existing_bill = cursor.fetchone()
        if existing_bill:
            return jsonify({"error": "Appointment is already completed."}), 409

        follow_up_appointment = None
        current_datetime = appointment["datetime"]
        if isinstance(current_datetime, datetime):
            current_datetime = current_datetime.replace(second=0, microsecond=0)

        cursor.execute(
            """
            SELECT vs.visitid
            FROM visitsummary vs
            WHERE vs.appointmentid = %s
            ORDER BY vs.visitid DESC
            LIMIT 1
            """,
            (appointment_id,),
        )
        existing_summary = cursor.fetchone()

        if existing_summary:
            cursor.execute(
                """
                UPDATE visitsummary
                SET notes = %s
                WHERE visitid = %s
                RETURNING visitid, appointmentid, notes
                """,
                (notes, existing_summary["visitid"]),
            )
        else:
            cursor.execute(
                """
                INSERT INTO visitsummary (appointmentid, notes)
                VALUES (%s, %s)
                RETURNING visitid, appointmentid, notes
                """,
                (appointment_id, notes),
            )
        saved_summary = cursor.fetchone()

        created_prescription = None
        linked_medicines = []
        owner_pets = None
        allowed_pet_ids = set()
        if treatment or vaccination_vaccine_id is not None:
            owner_pets = _vet_fetch_owner_pets(cursor, int(appointment["petownerid"]))
            allowed_pet_ids = {int(row["petid"]) for row in owner_pets}
            if selected_pet_id not in allowed_pet_ids:
                return jsonify({"error": "Selected pet does not belong to this appointment owner."}), 409

        if treatment:
            cursor.execute(
                """
                INSERT INTO prescription (treatment, veterinarianid, petid, prescriptiondate)
                VALUES (%s, %s, %s, CURRENT_DATE)
                RETURNING prescriptionid, treatment, veterinarianid, petid, prescriptiondate
                """,
                (treatment, vet_id, selected_pet_id),
            )
            created_prescription = cursor.fetchone()

            for medicine_id in medicine_ids:
                cursor.execute(
                    """
                    INSERT INTO prescribes (prescriptionid, medicineid)
                    VALUES (%s, %s)
                    RETURNING prescriptionid, medicineid
                    """,
                    (created_prescription["prescriptionid"], medicine_id),
                )
                linked_medicines.append(cursor.fetchone())

        created_vaccination_record = None
        linked_vaccine = None
        if vaccination_vaccine_id is not None:
            cursor.execute(
                """
                SELECT v.vaccineid
                FROM vaccine v
                WHERE v.vaccineid = %s
                """,
                (vaccination_vaccine_id,),
            )
            if cursor.fetchone() is None:
                return jsonify({"error": "Selected vaccine was not found."}), 404

            effective_shot_date = vaccination_shot_date or date.today()
            vaccination_frequency = None
            if vaccination_frequency_days is not None:
                vaccination_frequency = f"{vaccination_frequency_days} days"
            elif vaccination_frequency_legacy is not None:
                vaccination_frequency = vaccination_frequency_legacy

            resolved_plan_id = appointment["vaccinationplanid"]
            if resolved_plan_id is not None:
                cursor.execute(
                    """
                    SELECT vp.planid
                    FROM vaccinationplan vp
                    WHERE vp.planid = %s
                      AND vp.petid = %s
                    """,
                    (resolved_plan_id, selected_pet_id),
                )
                if cursor.fetchone() is None:
                    resolved_plan_id = None

            if resolved_plan_id is None:
                doses_completed_before = 0
                cursor.execute(
                    """
                    INSERT INTO vaccinationplan (nextvaccinationdate, petid, veterinarianid)
                    VALUES (%s, %s, %s)
                    RETURNING planid
                    """,
                    (vaccination_next_due_date, selected_pet_id, vet_id),
                )
                resolved_plan_id = cursor.fetchone()["planid"]
            else:
                cursor.execute(
                    """
                    SELECT COUNT(*)::int AS dose_count
                    FROM vaccinationrecord
                    WHERE planid = %s
                    """,
                    (resolved_plan_id,),
                )
                existing_dose_row = cursor.fetchone()
                doses_completed_before = int(existing_dose_row["dose_count"]) if existing_dose_row else 0

            inferred_total_dose_count = None
            if vaccination_dose_count is None:
                cursor.execute(
                    """
                    SELECT vr.threshold
                    FROM vaccinationrecord vr
                    WHERE vr.planid = %s
                      AND vr.threshold IS NOT NULL
                      AND vr.threshold > 0
                    ORDER BY vr.shotdate DESC NULLS LAST, vr.recordid DESC
                    LIMIT 1
                    """,
                    (resolved_plan_id,),
                )
                inferred_dose_row = cursor.fetchone()
                if inferred_dose_row and inferred_dose_row.get("threshold"):
                    inferred_total_dose_count = int(inferred_dose_row["threshold"])

            effective_total_dose_count = (
                vaccination_dose_count
                if vaccination_dose_count is not None
                else inferred_total_dose_count
            )
            current_dose_number = doses_completed_before + 1
            if (
                effective_total_dose_count is not None
                and effective_total_dose_count < current_dose_number
            ):
                return jsonify(
                    {
                        "error": (
                            "vaccinationDoseCount is lower than already recorded doses "
                            "for this vaccination plan."
                        )
                    }
                ), 409

            plan_completed = (
                effective_total_dose_count is not None
                and current_dose_number >= effective_total_dose_count
            )
            resolved_next_due_date = vaccination_next_due_date
            if not plan_completed and resolved_next_due_date is None and vaccination_frequency_days is not None:
                resolved_next_due_date = effective_shot_date + timedelta(days=vaccination_frequency_days)
            if plan_completed:
                resolved_next_due_date = None
            if not plan_completed and resolved_next_due_date is None:
                return jsonify(
                    {
                        "error": (
                            "Vaccination next due date is required unless this shot completes "
                            "the dose schedule."
                        )
                    }
                ), 400

            cursor.execute(
                """
                UPDATE vaccinationplan
                SET nextvaccinationdate = %s,
                    veterinarianid = %s
                WHERE planid = %s
                """,
                (resolved_next_due_date, vet_id, resolved_plan_id),
            )

            cursor.execute(
                """
                INSERT INTO vaccinationrecord (
                    threshold,
                    shotdate,
                    frequency,
                    nextduedate,
                    planid,
                    petid
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING recordid, threshold, shotdate, frequency, nextduedate, planid, petid
                """,
                (
                    effective_total_dose_count,
                    effective_shot_date,
                    vaccination_frequency,
                    resolved_next_due_date,
                    resolved_plan_id,
                    selected_pet_id,
                ),
            )
            created_vaccination_record = cursor.fetchone()

            cursor.execute(
                """
                INSERT INTO involves (recordid, vaccineid)
                VALUES (%s, %s)
                RETURNING recordid, vaccineid
                """,
                (created_vaccination_record["recordid"], vaccination_vaccine_id),
            )
            linked_vaccine = cursor.fetchone()

        created_referral = None
        if referee_vet_id is not None and referral_diagnosis is not None:
            cursor.execute(
                """
                SELECT v.veterinarianid
                FROM veterinarian v
                WHERE v.veterinarianid = %s
                """,
                (referee_vet_id,),
            )
            if cursor.fetchone() is None:
                return jsonify({"error": "Referee veterinarian not found."}), 404

            cursor.execute(
                """
                INSERT INTO refers (referrer, referee, referraldate, diagnosis)
                VALUES (%s, %s, CURRENT_DATE, %s)
                RETURNING referrer, referee, referraldate, diagnosis
                """,
                (vet_id, referee_vet_id, referral_diagnosis),
            )
            created_referral = cursor.fetchone()

        if parsed_datetime is not None and current_datetime != parsed_datetime:
            slot_datetime = _vet_find_next_available_datetime(cursor, vet_id, parsed_datetime)
            cursor.execute(
                """
                INSERT INTO appointment (
                    atype,
                    datetime,
                    vaccinationplanid,
                    veterinarianid,
                    petownerid
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING appointmentid, datetime, atype, veterinarianid, petownerid, vaccinationplanid
                """,
                (
                    appointment["atype"],
                    slot_datetime,
                    appointment["vaccinationplanid"],
                    vet_id,
                    appointment["petownerid"],
                ),
            )
            follow_up_appointment = cursor.fetchone()

        cursor.execute("SELECT COALESCE(MAX(b.billno), 0) + 1 AS next_bill_no FROM bill b")
        next_bill_no = int(cursor.fetchone()["next_bill_no"])

        cursor.execute(
            """
            INSERT INTO bill (
                billno,
                appointmentid,
                consultationfee,
                treatmentcost,
                medicationcost,
                duedate,
                paid,
                payerid
            )
            VALUES (
                %s,
                %s,
                %s::numeric,
                %s::numeric,
                %s::numeric,
                COALESCE(%s::date, CURRENT_DATE + INTERVAL '7 days'),
                FALSE,
                %s
            )
            RETURNING billno, appointmentid, consultationfee, treatmentcost, medicationcost, duedate, paid
            """,
            (
                next_bill_no,
                appointment_id,
                consultation_fee,
                treatment_cost,
                medication_cost,
                due_date,
                appointment["petownerid"],
            ),
        )
        created_bill = cursor.fetchone()
        conn.commit()

        return jsonify(
            {
                "message": "Appointment finalized successfully.",
                "follow_up_appointment": _vet_serialize_row(follow_up_appointment),
                "visit_summary": _vet_serialize_row(saved_summary),
                "prescription": _vet_serialize_row(created_prescription),
                "linked_medicines": vet_serialize_records(linked_medicines),
                "vaccination_record": _vet_serialize_row(created_vaccination_record),
                "linked_vaccine": _vet_serialize_row(linked_vaccine),
                "referral": _vet_serialize_row(created_referral),
                "bill": _vet_serialize_row(created_bill),
            }
        ), 201
    except Exception as exc:
        if conn:
            conn.rollback()
        return _vet_error_response(exc)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_appointments_bp.route("/api/vet/appointments/<int:appointment_id>/complete", methods=["POST"])
def vet_complete_appointment(appointment_id):
    """Finalize appointment by ensuring summary exists and creating billing row."""
    payload = request.get_json(silent=True) or {}

    try:
        vet_id = _vet_resolve_vet_id(payload)
        notes = payload.get("notes")
        consultation_fee = payload.get("consultationFee", 0)
        treatment_cost = payload.get("treatmentCost", 0)
        medication_cost = payload.get("medicationCost", 0)
        due_date = payload.get("dueDate")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = None
    cursor = None

    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        appointment = _vet_fetch_appointment_context(cursor, appointment_id, vet_id)
        if not appointment:
            return jsonify({"error": "Appointment not found for this veterinarian."}), 404

        cursor.execute(
            """
            SELECT vs.visitid, vs.notes
            FROM visitsummary vs
            WHERE vs.appointmentid = %s
            ORDER BY vs.visitid DESC
            LIMIT 1
            """,
            (appointment_id,),
        )
        existing_summary = cursor.fetchone()

        if notes and isinstance(notes, str) and notes.strip():
            normalized_notes = notes.strip()
            if existing_summary:
                cursor.execute(
                    """
                    UPDATE visitsummary
                    SET notes = %s
                    WHERE visitid = %s
                    RETURNING visitid, appointmentid, notes
                    """,
                    (normalized_notes, existing_summary["visitid"]),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO visitsummary (appointmentid, notes)
                    VALUES (%s, %s)
                    RETURNING visitid, appointmentid, notes
                    """,
                    (appointment_id, normalized_notes),
                )
            saved_summary = cursor.fetchone()
        elif existing_summary:
            saved_summary = existing_summary
        else:
            return jsonify({"error": "Visit summary is required before completion."}), 400

        cursor.execute(
            """
            SELECT b.billno, b.appointmentid, b.consultationfee, b.treatmentcost, b.medicationcost, b.duedate, b.paid
            FROM bill b
            WHERE b.appointmentid = %s
            LIMIT 1
            """,
            (appointment_id,),
        )
        existing_bill = cursor.fetchone()
        if existing_bill:
            conn.commit()
            return jsonify(
                {
                    "message": "Appointment already completed.",
                    "visit_summary": _vet_serialize_row(saved_summary),
                    "bill": _vet_serialize_row(existing_bill),
                }
            )

        cursor.execute("SELECT COALESCE(MAX(b.billno), 0) + 1 AS next_bill_no FROM bill b")
        next_bill_no = int(cursor.fetchone()["next_bill_no"])

        cursor.execute(
            """
            INSERT INTO bill (
                billno,
                appointmentid,
                consultationfee,
                treatmentcost,
                medicationcost,
                duedate,
                paid,
                payerid
            )
            VALUES (
                %s,
                %s,
                %s::numeric,
                %s::numeric,
                %s::numeric,
                COALESCE(%s::date, CURRENT_DATE + INTERVAL '7 days'),
                FALSE,
                %s
            )
            RETURNING billno, appointmentid, consultationfee, treatmentcost, medicationcost, duedate, paid
            """,
            (
                next_bill_no,
                appointment_id,
                consultation_fee,
                treatment_cost,
                medication_cost,
                due_date,
                appointment["petownerid"],
            ),
        )
        created_bill = cursor.fetchone()
        conn.commit()

        return jsonify(
            {
                "message": "Appointment completed and billing generated.",
                "visit_summary": _vet_serialize_row(saved_summary),
                "bill": _vet_serialize_row(created_bill),
            }
        ), 201
    except Exception as exc:
        if conn:
            conn.rollback()
        return _vet_error_response(exc)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
