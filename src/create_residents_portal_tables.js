const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function createTables() {
    let connection;
    try {
        // Create a connection to the database
        connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'root',
            database: 'hostel_booking'
        });

        console.log('Connected to the database');

        // Read the SQL file
        const sqlFile = path.join(__dirname, 'create_residents_portal_tables.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');

        // Execute the SQL
        const statements = sql.split(';').filter(statement => statement.trim());
        
        for (const statement of statements) {
            if (statement.trim()) {
                await connection.query(statement);
                console.log('Executed SQL statement');
            }
        }

        console.log('All tables created successfully');
    } catch (error) {
        console.error('Error creating tables:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed');
        }
    }
}

createTables(); 