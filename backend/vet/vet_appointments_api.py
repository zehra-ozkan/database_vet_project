from datetime import date, datetime
from decimal import Decimal

import psycopg2
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
    """Parse optional integer values."""
    if raw_value is None or raw_value == "":
        return None
    parsed_value = int(raw_value)
    if parsed_value <= 0:
        raise ValueError
    return parsed_value


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
        conn.commit()

        return jsonify({"message": "Referral created.", "referral": _vet_serialize_row(referral)}), 201
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
