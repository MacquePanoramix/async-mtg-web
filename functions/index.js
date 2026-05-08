const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

async function deleteCollectionInBatches(collectionRef, batchSize = 500) {
  let deletedCount = 0;

  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    await batch.commit();
    deletedCount += snapshot.size;

    if (snapshot.size < batchSize) break;
  }

  return deletedCount;
}

exports.hardDeleteGame = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const { gameId, confirm, skipMembershipCleanup } = request.data || {};

  if (confirm !== true) {
    throw new HttpsError(
      'failed-precondition',
      'This operation is destructive. Re-submit with { confirm: true } to continue.'
    );
  }

  if (typeof gameId !== 'string' || !GAME_ID_PATTERN.test(gameId)) {
    throw new HttpsError(
      'invalid-argument',
      'Invalid gameId. It must be a non-empty string containing only letters, numbers, underscores, or hyphens.'
    );
  }

  const trimmedGameId = gameId.trim();
  if (!trimmedGameId) {
    throw new HttpsError('invalid-argument', 'gameId is required.');
  }

  const gameRef = db.collection('games_v3').doc(trimmedGameId);
  const gameSnap = await gameRef.get();

  if (!gameSnap.exists) {
    throw new HttpsError('not-found', `Game ${trimmedGameId} does not exist.`);
  }

  const gameData = gameSnap.data() || {};
  const playerIds = Array.isArray(gameData.players)
    ? gameData.players
        .map((player) => (player && typeof player.id === 'string' ? player.id : null))
        .filter(Boolean)
    : [];
  const spectatorIds = Array.isArray(gameData.spectatorIds)
    ? gameData.spectatorIds.filter((id) => typeof id === 'string' && id)
    : [];

  const callerUid = request.auth.uid;
  const hostId = typeof gameData.hostId === 'string' ? gameData.hostId : '';

  if (hostId !== callerUid) {
    throw new HttpsError(
      'permission-denied',
      'Only the host can delete this game.'
    );
  }

  const deletedEvents = await deleteCollectionInBatches(gameRef.collection('events'));
  await gameRef.delete();

  const membershipUidSet = new Set([hostId, ...playerIds, ...spectatorIds].filter(Boolean));
  let deletedMembershipDocs = 0;
  if (skipMembershipCleanup !== true && membershipUidSet.size > 0) {
    const membershipBatch = db.batch();
    membershipUidSet.forEach((uid) => {
      membershipBatch.delete(db.collection('users').doc(uid).collection('games').doc(trimmedGameId));
      deletedMembershipDocs += 1;
    });
    await membershipBatch.commit();
  }

  logger.info('Hard deleted game', {
    gameId: trimmedGameId,
    requestedBy: callerUid,
    deletedEvents,
    deletedMembershipDocs,
    skippedMembershipCleanup: skipMembershipCleanup === true
  });

  return {
    success: true,
    message: `Game ${trimmedGameId} was permanently deleted.`,
    gameId: trimmedGameId,
    deletedEvents,
    deletedMembershipDocs,
    skippedMembershipCleanup: skipMembershipCleanup === true
  };
});
