const Database = require('better-sqlite3');
try {
    const db = new Database('test.db');
    console.log('Database opened successfully');
    db.close();
} catch (e) {
    console.error('Failed to open database:', e);
}
