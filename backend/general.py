import os
import psycopg2
from flask import Blueprint, request, jsonify

general_bp = Blueprint('general', __name__)
DB_URL = os.environ.get("DATABASE_URL")

def get_db_connection():
    """Establish and return a connection to the PostgreSQL database."""
    conn = psycopg2.connect(DB_URL)
    return conn

@general_bp.route('/api/login', methods=['POST'])
def login():
    """Authenticate a user using their email and password."""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "Invalid request body"}), 400
        
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Query the Users table for a matching email and plaintext password
        # TODO: CHANGE TO THE FILE
        cur.execute('SELECT userID, name, email FROM Users WHERE email = %s AND password = %s', (email, password))
        user = cur.fetchone()
        
        cur.close()
        conn.close()

        if user:
            return jsonify({
                "message": "Login successful",
                "user": {
                    "id": user[0],
                    "name": user[1],
                    "email": user[2]
                }
            }), 200
        else:
            return jsonify({"error": "Invalid email or password"}), 401

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@general_bp.route('/api/register', methods=['POST'])
def register():
    """Register a new user and add them to their respective role table."""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "Invalid request body"}), 400
        
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    phone = data.get('phoneNumber')
    role = data.get('role')
    
    if not all([name, email, password, phone, role]):
        return jsonify({"error": "All fields are required"}), 400
        
    if role not in ['owner', 'vet', 'manager']:
        return jsonify({"error": "Invalid role"}), 400
        
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Insert into Users table
        cur.execute(
            'INSERT INTO Users (name, email, password, phoneNumber) VALUES (%s, %s, %s, %s) RETURNING userID',
            (name, email, password, phone)
        )
        user_id = cur.fetchone()[0]
        
        # Insert into role-specific table
        if role == 'owner':
            cur.execute('INSERT INTO PetOwner (ownerID) VALUES (%s)', (user_id,))
        elif role == 'vet':
            cur.execute('INSERT INTO Veterinarian (veterinarianID) VALUES (%s)', (user_id,))
        elif role == 'manager':
            cur.execute('INSERT INTO ClinicManager (managerID) VALUES (%s)', (user_id,))
            
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            "message": "Registration successful",
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "role": role
            }
        }), 201
        
    except psycopg2.IntegrityError as e:
        if conn:
            conn.rollback()
        error_msg = str(e).lower()
        if 'email' in error_msg:
            return jsonify({"error": "Email already exists"}), 409
        elif 'phonenumber' in error_msg:
            return jsonify({"error": "Phone number already exists"}), 409
        else:
            return jsonify({"error": "A user with this information already exists."}), 409
            
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": str(e)}), 500
