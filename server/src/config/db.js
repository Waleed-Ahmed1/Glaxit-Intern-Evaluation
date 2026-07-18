import { MongoClient } from 'mongodb';

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.DB_NAME || 'quiz_app';

let client;
let db;

export async function connectDB() {
    if (db) return db; // reuse existing connection

    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);

    console.log(`Connected to MongoDB database: ${dbName}`);
    return db;
}

export function getDB() {
    if (!db) {
        throw new Error('Database not connected. Call connectDB() first.');
    }
    return db;
}