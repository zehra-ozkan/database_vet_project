import os
import psycopg2
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
# Enable CORS so the Next.js frontend can communicate with Flask
CORS(app)

# Fetch the database connection string from the environment variables
DB_URL = os.environ.get("DATABASE_URL")

def get_db_connection():
    """Establish and return a connection to the PostgreSQL database."""
    conn = psycopg2.connect(DB_URL)
    return conn

@app.route('/api/status', methods=['GET'])
def status():
    """A simple route to check if the Flask backend is awake."""
    return jsonify({"message": "Backend is running!"})

@app.route('/api/db-check', methods=['GET'])
def db_check():
    """A route to test the connection to the PostgreSQL database."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # A simple raw SQL query to verify the database connection
        cur.execute('SELECT version();')
        db_version = cur.fetchone()
        
        # Close the cursor and connection to prevent memory leaks
        cur.close()
        conn.close()
        
        return jsonify({
            "message": "Database connected successfully!", 
            "version": db_version[0]
        })
    except Exception as e:
        # If the connection fails, this will output the exact error to the browser
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Binding to 0.0.0.0 is required for Docker routing to work
    app.run(host='0.0.0.0', debug=True, port=5000)