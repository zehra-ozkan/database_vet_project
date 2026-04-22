import os
import psycopg2
from flask import Flask, jsonify
from flask_cors import CORS
from general import general_bp

app = Flask(__name__)
# Enable CORS so the Next.js frontend can communicate with Flask
CORS(app)

# Register the blueprint
app.register_blueprint(general_bp)

# Fetch the database connection string from the environment variables
DB_URL = os.environ.get("DATABASE_URL")

def get_db_connection():
    """Establish and return a connection to the PostgreSQL database."""
    conn = psycopg2.connect(DB_URL)
    return conn

@app.route('/api/test', methods=['GET'])
def status():
    """A simple route to check if the Flask backend is awake."""
    return jsonify({"message": "Backend is running!"})

@app.route('/api/db-check', methods=['GET'])
def db_check():
    """A route to fetch and display all contents from all tables in the database."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. Ask PostgreSQL for a list of all tables in the default 'public' schema
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        tables = cur.fetchall()
        
        all_database_data = {}
        
        # 2. Loop through each table name and fetch its contents
        for table in tables:
            table_name = table[0]
            
            # Execute a SELECT * for the current table
            # (Note: Using f-strings for table names is safe here since the names 
            # come directly from the database schema, not user input)
            cur.execute(f'SELECT * FROM "{table_name}";')
            
            # Extract column names from the cursor description
            column_names = [desc[0] for desc in cur.description]
            
            # Fetch all rows for this table
            rows = cur.fetchall()
            
            # Combine column names and row data into a list of dictionaries
            table_data = []
            for row in rows:
                row_dict = dict(zip(column_names, row))
                table_data.append(row_dict)
                
            # Add this table's data to our main dictionary
            all_database_data[table_name] = table_data
            
        # Close the cursor and connection
        cur.close()
        conn.close()
        
        return jsonify({
            "message": "Database contents retrieved successfully!", 
            "data": all_database_data
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Binding to 0.0.0.0 is required for Docker routing to work
    app.run(host='0.0.0.0', debug=True, port=5000)