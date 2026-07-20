import { MongoClient } from 'mongodb';

const uri =
    process.env.MONGO_URI ||
    'mongodb://127.0.0.1:27017';

const dbName =
    process.env.DB_NAME ||
    'quiz_app';

let client;
let db;
let connectionPromise = null;

async function ensureIndexes(database) {
    await Promise.all([
        database
            .collection('users')
            .createIndex(
                { email: 1 },
                {
                    unique: true,
                    name: 'unique_user_email',
                }
            ),

        database
            .collection('registration_otps')
            .createIndex(
                {
                    email: 1,
                    purpose: 1,
                },
                {
                    unique: true,
                    name: 'unique_registration_otp',
                }
            ),

        database
            .collection('registration_otps')
            .createIndex(
                { expiresAt: 1 },
                {
                    expireAfterSeconds: 0,
                    name: 'expire_registration_otps',
                }
            ),
    ]);
}

export async function connectDB() {
    if (db) {
        return db;
    }

    if (connectionPromise) {
        return connectionPromise;
    }

    connectionPromise = (async () => {
        const nextClient = new MongoClient(uri);

        await nextClient.connect();

        const nextDb = nextClient.db(dbName);

        await ensureIndexes(nextDb);

        client = nextClient;
        db = nextDb;

        console.log(
            `Connected to MongoDB database: ${dbName}`
        );

        return db;
    })();

    try {
        return await connectionPromise;
    } catch (error) {
        connectionPromise = null;
        client = null;
        db = null;

        throw error;
    }
}

export function getDB() {
    if (!db) {
        throw new Error(
            'Database not connected. Call connectDB() first.'
        );
    }

    return db;
}