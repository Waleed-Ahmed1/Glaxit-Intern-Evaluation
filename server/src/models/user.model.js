import { getDB } from '../config/db.js';

const COLLECTION = 'users';

// role: 'admin' | 'student'
export function usersCollection() {
    return getDB().collection(COLLECTION);
}

export async function findUserByEmail(email) {
    return usersCollection().findOne({ email: email.toLowerCase() });
}

export async function findUserById(id) {
    const { ObjectId } = await import('mongodb');
    return usersCollection().findOne({ _id: new ObjectId(id) });
}

export async function createUser({ name, email, passwordHash, role = 'student', domain = null }) {
    const doc = {
        name,
        email: email.toLowerCase(),
        passwordHash,
        role, // 'admin' or 'student'
        domain, // e.g. 'Frontend Development', 'Backend Development', etc.
        createdAt: new Date(),
    };
    const result = await usersCollection().insertOne(doc);
    return { _id: result.insertedId, ...doc };
}

// Used by the admin dashboard's Student Management screen.
// Optionally filter by role (e.g. listUsers({ role: 'student' })).
export async function listUsers({ role } = {}) {
    const filter = role ? { role } : {};
    return usersCollection().find(filter).project({ passwordHash: 0 }).toArray();
}

export async function updateUser(id, updates) {
    const { ObjectId } = await import('mongodb');
    // Never allow role/password to be silently overwritten through generic updates
    const { passwordHash, role, _id, ...safeUpdates } = updates;

    const result = await usersCollection().findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: safeUpdates },
        { returnDocument: 'after', projection: { passwordHash: 0 } }
    );
    return result;
}

export async function deleteUser(id) {
    const { ObjectId } = await import('mongodb');
    const result = await usersCollection().deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
}