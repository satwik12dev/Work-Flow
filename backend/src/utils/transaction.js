import mongoose from 'mongoose';

let _isReplicaSet = null;

/**
 * Detect whether the connected MongoDB deployment supports multi-document transactions.
 * Caches result per process.
 */
const supportsTransactions = async () => {
  if (_isReplicaSet !== null) return _isReplicaSet;

  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.command({ hello: 1 });
    _isReplicaSet = Boolean(info.setName || info.msg === 'isdbgrid');
  } catch {
    _isReplicaSet = false;
  }

  return _isReplicaSet;
};

/**
 * Execute `work(session)` inside a MongoDB transaction when running on a replica set/mongos,
 * or run directly with `session = null` on standalone MongoDB instances.
 *
 * @template T
 * @param {(session: mongoose.ClientSession | null) => Promise<T>} work
 * @returns {Promise<T>}
 */
export const runInTransaction = async (work) => {
  const canTransact = await supportsTransactions();

  if (!canTransact) {
    return work(null);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

