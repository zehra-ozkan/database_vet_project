from datetime import date, datetime

from psycopg2.extras import RealDictCursor
from flask import Blueprint, jsonify, request

from vet.vet_db import vet_get_db_connection, vet_serialize_records

vet_dashboard_bp = Blueprint("vet_dashboard_bp", __name__)


def _vet_get_microchip_news_for_vet(cursor, vet_id):
    cursor.execute(
        """
        SELECT
            lfr.reportid AS news_id,
            COALESCE(lfr.foundat, lfr.createddate::timestamp) AS created_at,
            (lfr.vetreadat IS NULL) AS is_unread,
            c.chipid AS chip_id,
            p.petid AS pet_id,
            p.name AS pet_name,
            uo.name AS owner_name,
            uo.phonenumber AS owner_phone,
            uo.email AS owner_email,
            lfr.foundbyvetid AS source_vet_id,
            COALESCE(uv.name, 'Unknown') AS source_vet_name,
            COALESCE(b.name, 'Unassigned') AS source_branch_name,
            lfr.targetvetid AS target_vet_id,
            COALESCE(lfr.foundnote, '') AS notes
        FROM lostfoundreport lfr
        JOIN pet p ON p.petid = lfr.petid
        LEFT JOIN chip c ON c.petid = p.petid
        JOIN users uo ON uo.userid = p.ownerid
        LEFT JOIN users uv ON uv.userid = lfr.foundbyvetid
        LEFT JOIN veterinarian vv ON vv.veterinarianid = lfr.foundbyvetid
        LEFT JOIN branch b ON b.branchid = vv.branchid
        WHERE COALESCE(lfr.isfound, FALSE) = TRUE
          AND lfr.targetvetid = %s
          AND lfr.foundbyvetid IS NOT NULL
          AND lfr.foundbyvetid <> lfr.targetvetid
        ORDER BY COALESCE(lfr.foundat, lfr.createddate::timestamp) DESC, lfr.reportid DESC
        """,
        (vet_id,),
    )
    return cursor.fetchall()


def _vet_get_microchip_unread_count(cursor, vet_id):
    cursor.execute(
        """
        SELECT COUNT(*)::int AS unread_count
        FROM lostfoundreport lfr
        WHERE COALESCE(lfr.isfound, FALSE) = TRUE
          AND lfr.targetvetid = %s
          AND lfr.foundbyvetid IS NOT NULL
          AND lfr.foundbyvetid <> lfr.targetvetid
          AND lfr.vetreadat IS NULL
        """,
        (vet_id,),
    )
    row = cursor.fetchone()
    return int(row["unread_count"]) if row else 0


def _vet_mark_microchip_news_as_read(cursor, vet_id):
    cursor.execute(
        """
        UPDATE lostfoundreport lfr
        SET vetreadat = NOW()
        WHERE COALESCE(lfr.isfound, FALSE) = TRUE
          AND lfr.targetvetid = %s
          AND lfr.foundbyvetid IS NOT NULL
          AND lfr.foundbyvetid <> lfr.targetvetid
          AND lfr.vetreadat IS NULL
        """,
        (vet_id,),
    )
    return int(cursor.rowcount)


def _vet_resolve_pet_registered_vet(cursor, pet_id, fallback_vet_id=None):
    """
    Resolve the pet's registered veterinarian.
    Priority:
    1) Most recent appointment linked to this pet via vaccination plan
    2) Most recent vaccination plan veterinarian for this pet
    3) Fallback veterinarian id (usually chip.veterinarianid)
    """
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
                COUNT(*) FILTER (WHERE a.datetime::date = %s)::int AS todays_appointments,
                COUNT(*) FILTER (WHERE a.datetime > NOW())::int AS upcoming_appointments,
                COUNT(*)::int AS total_appointments,
                COUNT(*) FILTER (
                    WHERE vs.appointmentid IS NULL
                      AND a.datetime <= NOW()
                )::int AS pending_documentation
            FROM appointment a
            LEFT JOIN visitsummary vs ON vs.appointmentid = a.appointmentid
            WHERE a.veterinarianid = %s
            """,
            (selected_date, vet_id),
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
            WITH scoped_pets AS (
                SELECT vp.petid
                FROM vaccinationplan vp
                WHERE vp.veterinarianid = %s
                UNION
                SELECT p.petid
                FROM appointment a
                JOIN pet p ON p.ownerid = a.petownerid
                WHERE a.veterinarianid = %s
            )
            SELECT
                vsv.petid,
                vsv.petname AS pet_name,
                COALESCE(vsv.vaccinename, 'Unknown') AS vaccine_name,
                vsv.shotdate,
                vsv.nextduedate,
                COALESCE(u.name, 'Unknown') AS admin_vet_name,
                CASE
                    WHEN vsv.nextduedate IS NULL THEN 'Unknown'
                    WHEN vsv.vaccinationstatus = 'Overdue' THEN
                        'Overdue ' || (CURRENT_DATE - vsv.nextduedate)::text || 'd'
                    WHEN vsv.vaccinationstatus = 'Upcoming' THEN
                        'Due in ' || (vsv.nextduedate - CURRENT_DATE)::text || 'd'
                    ELSE 'Normal'
                END AS vaccination_status
            FROM vaccinationstatusview vsv
            JOIN vaccinationrecord vr ON vr.recordid = vsv.recordid
            JOIN vaccinationplan vp ON vp.planid = vr.planid
            LEFT JOIN users u ON u.userid = vp.veterinarianid
            JOIN scoped_pets sp ON sp.petid = vsv.petid
            ORDER BY vsv.nextduedate ASC NULLS LAST, vsv.shotdate DESC NULLS LAST
            LIMIT 40
            """,
            (vet_id, vet_id),
        )
        vaccination_records = cursor.fetchall()

        microchip_news_count = _vet_get_microchip_unread_count(cursor, vet_id)

        return jsonify(
            {
                "vet_id": vet_id,
                "selected_date": selected_date.isoformat(),
                "profile": vet_serialize_records([profile])[0],
                "metrics": vet_serialize_records([metrics])[0],
                "today_schedule": vet_serialize_records(today_schedule),
                "vaccination_records": vet_serialize_records(vaccination_records),
                "microchip_news_count": int(microchip_news_count),
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_dashboard_bp.route("/api/vet/microchip/lookup", methods=["GET"])
def vet_lookup_microchip():
    """Lookup microchip information and related warning context."""
    vet_id_raw = request.args.get("vetId") or request.headers.get("X-Dev-User-Id") or "1"
    chip_id_raw = request.args.get("chipId")

    try:
        vet_id = int(vet_id_raw)
        chip_id = int(chip_id_raw or "")
        if vet_id <= 0 or chip_id <= 0:
            raise ValueError
    except ValueError:
        return jsonify({"error": "vetId and chipId must be positive integers."}), 400

    conn = None
    cursor = None

    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT
                c.chipid,
                c.islost,
                c.location AS chip_location,
                c.implantationdate,
                p.petid,
                p.name AS pet_name,
                p.species,
                p.breed,
                p.age,
                p.ownerid,
                uo.name AS owner_name,
                uo.phonenumber AS owner_phone,
                uo.email AS owner_email,
                c.veterinarianid AS chip_vet_id,
                lost_report.createddate AS last_lost_report_date,
                medical_warning.warning_text AS medical_warning
            FROM chip c
            JOIN pet p ON p.petid = c.petid
            JOIN users uo ON uo.userid = p.ownerid
            LEFT JOIN LATERAL (
                SELECT lfr.createddate
                FROM lostfoundreport lfr
                WHERE lfr.petid = c.petid
                  AND COALESCE(lfr.isfound, FALSE) = FALSE
                ORDER BY lfr.createddate DESC
                LIMIT 1
            ) lost_report ON TRUE
            LEFT JOIN LATERAL (
                SELECT
                    NULLIF(
                        TRIM(
                            CONCAT_WS(
                                ' | ',
                                NULLIF(string_agg(DISTINCT NULLIF(TRIM(mh.pastdiagnosis), ''), ' | '), ''),
                                NULLIF('Allergies: ' || string_agg(DISTINCT NULLIF(TRIM(mh.allergies), ''), ', '), 'Allergies: ')
                            )
                        ),
                        ''
                    ) AS warning_text
                FROM medicalhistory mh
                WHERE mh.petid = p.petid
            ) medical_warning ON TRUE
            WHERE c.chipid = %s
            LIMIT 1
            """,
            (chip_id,),
        )
        lookup = cursor.fetchone()
        if not lookup:
            return jsonify({"error": "Microchip not found."}), 404

        registered_vet = _vet_resolve_pet_registered_vet(
            cursor,
            int(lookup.get("petid")),
            lookup.get("chip_vet_id"),
        )
        registered_vet_id = registered_vet.get("veterinarianid")
        can_send_found_news = bool(lookup.get("islost"))

        return jsonify(
            {
                "chip": {
                    "chip_id": lookup.get("chipid"),
                    "is_lost": bool(lookup.get("islost")),
                    "last_known_location": lookup.get("chip_location"),
                    "implantation_date": lookup.get("implantationdate").isoformat() if lookup.get("implantationdate") else None,
                    "last_lost_report_date": lookup.get("last_lost_report_date").isoformat() if lookup.get("last_lost_report_date") else None,
                },
                "pet": {
                    "pet_id": lookup.get("petid"),
                    "pet_name": lookup.get("pet_name"),
                    "species": lookup.get("species"),
                    "breed": lookup.get("breed"),
                    "age": lookup.get("age"),
                },
                "owner": {
                    "owner_id": lookup.get("ownerid"),
                    "owner_name": lookup.get("owner_name"),
                    "owner_phone": lookup.get("owner_phone"),
                    "owner_email": lookup.get("owner_email"),
                },
                "registered_vet": {
                    "veterinarian_id": registered_vet_id,
                    "veterinarian_name": registered_vet.get("veterinarian_name"),
                    "branch_id": registered_vet.get("branchid"),
                    "branch_name": registered_vet.get("branch_name"),
                },
                "medical_warning": lookup.get("medical_warning"),
                "can_send_found_news": can_send_found_news,
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_dashboard_bp.route("/api/vet/microchip/news/found", methods=["POST"])
def vet_send_microchip_found_news():
    """Send microchip found notification to chip's registered veterinarian."""
    payload = request.get_json(silent=True) or {}
    vet_id_raw = payload.get("vetId") or request.headers.get("X-Dev-User-Id") or "1"
    chip_id_raw = payload.get("chipId")
    notes_raw = payload.get("notes")

    try:
        vet_id = int(vet_id_raw)
        chip_id = int(chip_id_raw)
        if vet_id <= 0 or chip_id <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "vetId and chipId must be positive integers."}), 400

    notes = str(notes_raw).strip() if isinstance(notes_raw, str) else ""

    conn = None
    cursor = None
    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT
                c.chipid,
                c.islost,
                c.petid,
                p.ownerid AS owner_id,
                c.veterinarianid AS chip_vet_id,
                p.name AS pet_name,
                uo.name AS owner_name,
                uo.phonenumber AS owner_phone,
                uo.email AS owner_email,
                us.name AS sender_vet_name,
                COALESCE(bs.name, 'Unknown') AS sender_branch_name
            FROM chip c
            JOIN pet p ON p.petid = c.petid
            JOIN users uo ON uo.userid = p.ownerid
            JOIN users us ON us.userid = %s
            LEFT JOIN veterinarian vs ON vs.veterinarianid = %s
            LEFT JOIN branch bs ON bs.branchid = vs.branchid
            WHERE c.chipid = %s
            LIMIT 1
            """,
            (vet_id, vet_id, chip_id),
        )
        context_row = cursor.fetchone()
        if not context_row:
            return jsonify({"error": "Microchip not found."}), 404

        if not bool(context_row.get("islost")):
            return jsonify({"error": "This microchip is not marked as lost."}), 409

        registered_vet = _vet_resolve_pet_registered_vet(
            cursor,
            int(context_row.get("petid")),
            context_row.get("chip_vet_id"),
        )
        target_vet_id = registered_vet.get("veterinarianid")
        should_notify_vet = bool(target_vet_id and int(target_vet_id) > 0 and int(target_vet_id) != vet_id)

        target_vet_id_int = int(target_vet_id) if target_vet_id and int(target_vet_id) > 0 else None
        found_at = datetime.now().replace(microsecond=0)
        vet_read_at = None if should_notify_vet else found_at

        cursor.execute(
            """
            UPDATE lostfoundreport
            SET isfound = TRUE
            WHERE petid = %s
              AND COALESCE(isfound, FALSE) = FALSE
            """,
            (context_row.get("petid"),),
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
                CURRENT_DATE,
                %s,
                %s,
                NULLIF(%s, ''),
                %s,
                %s,
                NULL
            )
            RETURNING
                reportid,
                createddate,
                foundat,
                vetreadat,
                targetvetid,
                foundnote
            """,
            (
                context_row.get("petid"),
                vet_id,
                target_vet_id_int,
                notes,
                found_at,
                vet_read_at,
            ),
        )
        inserted_news = cursor.fetchone()

        cursor.execute(
            """
            UPDATE chip
            SET islost = FALSE
            WHERE chipid = %s
            """,
            (chip_id,),
        )
        conn.commit()

        created_at_value = inserted_news.get("foundat") if inserted_news else None
        if created_at_value is None and inserted_news and inserted_news.get("createddate"):
            created_at_value = inserted_news.get("createddate")

        news_item = {
            "news_id": inserted_news.get("reportid") if inserted_news else None,
            "created_at": created_at_value.isoformat() if created_at_value else None,
            "is_unread": should_notify_vet,
            "chip_id": context_row.get("chipid"),
            "pet_id": context_row.get("petid"),
            "pet_name": context_row.get("pet_name"),
            "owner_name": context_row.get("owner_name"),
            "owner_phone": context_row.get("owner_phone"),
            "owner_email": context_row.get("owner_email"),
            "source_vet_id": vet_id,
            "source_vet_name": context_row.get("sender_vet_name"),
            "source_branch_name": context_row.get("sender_branch_name"),
            "target_vet_id": target_vet_id_int,
            "notes": notes,
        }

        return jsonify(
            {
                "message": "Microchip found news sent.",
                "news": news_item,
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


@vet_dashboard_bp.route("/api/vet/microchip/news", methods=["GET"])
def vet_get_microchip_news():
    """List microchip news records for current veterinarian."""
    vet_id_raw = request.args.get("vetId") or request.headers.get("X-Dev-User-Id") or "1"
    try:
        vet_id = int(vet_id_raw)
        if vet_id <= 0:
            raise ValueError
    except ValueError:
        return jsonify({"error": "vetId must be a positive integer."}), 400

    conn = None
    cursor = None
    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        news_rows = _vet_get_microchip_news_for_vet(cursor, vet_id)
        unread_count = _vet_get_microchip_unread_count(cursor, vet_id)
        return jsonify({"unread_count": int(unread_count), "news": vet_serialize_records(news_rows)})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@vet_dashboard_bp.route("/api/vet/microchip/news/mark-read", methods=["POST"])
def vet_mark_microchip_news_read():
    """Mark all unread microchip news as read for current veterinarian."""
    payload = request.get_json(silent=True) or {}
    vet_id_raw = payload.get("vetId") or request.headers.get("X-Dev-User-Id") or "1"
    try:
        vet_id = int(vet_id_raw)
        if vet_id <= 0:
            raise ValueError
    except ValueError:
        return jsonify({"error": "vetId must be a positive integer."}), 400

    conn = None
    cursor = None
    try:
        conn = vet_get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        updated_count = _vet_mark_microchip_news_as_read(cursor, vet_id)
        conn.commit()
        return jsonify({"marked_read_count": updated_count})
    except Exception as exc:
        if conn:
            conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
