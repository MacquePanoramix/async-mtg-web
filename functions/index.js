const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const EVENT_DELETE_BATCH_SIZE = 100;

const DELETE_STEPS = {
  VERIFY_AUTH: 'Step A: verify current user is signed in',
  READ_GAME: 'Step B: read the game doc',
  VERIFY_HOST: 'Step C: verify game.hostId === currentUser.uid',
  DELETE_EVENTS: 'Step D: delete events subcollection docs in safe batches',
  DELETE_GAME: 'Step E: delete the game document itself',
  CONFIRM_DELETE: 'Step F: confirm the game document no longer exists'
};

function getErrorCode(error) {
  return error?.code || error?.details?.code || 'unknown';
}

function getErrorName(error) {
  return error?.name || error?.details?.name || 'Error';
}

function getErrorMessage(error) {
  return error?.message || error?.details?.message || 'Unknown error';
}

function logAndThrowStepError(gameId, step, error, fallbackCode = 'internal') {
  const originalCode = getErrorCode(error);
  const originalName = getErrorName(error);
  const originalMessage = getErrorMessage(error);

  logger.error('Hard delete game step failed', {
    gameId,
    step,
    error,
    code: originalCode,
    name: originalName,
    message: originalMessage
  });

  throw new HttpsError(
    fallbackCode,
    `Failed to delete ${gameId || 'game'} during ${step}: ${originalCode} — ${originalMessage}`,
    {
      gameId,
      step,
      code: originalCode,
      name: originalName,
      message: originalMessage
    }
  );
}

async function runDeleteStep(gameId, step, action) {
  try {
    return await action();
  } catch (error) {
    logAndThrowStepError(gameId, step, error);
  }
}

async function deleteCollectionInBatches(collectionRef, gameId, batchSize = EVENT_DELETE_BATCH_SIZE) {
  let deletedCount = 0;

  while (true) {
    const snapshot = await runDeleteStep(gameId, DELETE_STEPS.DELETE_EVENTS, () => collectionRef.limit(batchSize).get());
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    await runDeleteStep(gameId, DELETE_STEPS.DELETE_EVENTS, () => batch.commit());
    deletedCount += snapshot.size;
  }

  return deletedCount;
}

exports.hardDeleteGame = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.', {
      step: DELETE_STEPS.VERIFY_AUTH,
      code: 'unauthenticated',
      name: 'HttpsError',
      message: 'Authentication is required.'
    });
  }

  const { gameId, confirm, skipMembershipCleanup } = request.data || {};
  const stepGameId = typeof gameId === 'string' ? gameId.trim() : gameId;

  if (confirm !== true) {
    throw new HttpsError(
      'failed-precondition',
      'This operation is destructive. Re-submit with { confirm: true } to continue.',
      {
        gameId: stepGameId,
        step: DELETE_STEPS.VERIFY_AUTH,
        code: 'failed-precondition',
        name: 'HttpsError',
        message: 'This operation is destructive. Re-submit with { confirm: true } to continue.'
      }
    );
  }

  if (typeof gameId !== 'string' || !GAME_ID_PATTERN.test(gameId)) {
    throw new HttpsError(
      'invalid-argument',
      'Invalid gameId. It must be a non-empty string containing only letters, numbers, underscores, or hyphens.',
      {
        gameId: stepGameId,
        step: DELETE_STEPS.READ_GAME,
        code: 'invalid-argument',
        name: 'HttpsError',
        message: 'Invalid gameId. It must be a non-empty string containing only letters, numbers, underscores, or hyphens.'
      }
    );
  }

  const trimmedGameId = gameId.trim();
  if (!trimmedGameId) {
    throw new HttpsError('invalid-argument', 'gameId is required.', {
      gameId: trimmedGameId,
      step: DELETE_STEPS.READ_GAME,
      code: 'invalid-argument',
      name: 'HttpsError',
      message: 'gameId is required.'
    });
  }

  const gameRef = db.collection('games_v3').doc(trimmedGameId);
  const gameSnap = await runDeleteStep(trimmedGameId, DELETE_STEPS.READ_GAME, () => gameRef.get());

  if (!gameSnap.exists) {
    throw new HttpsError('not-found', `Game ${trimmedGameId} does not exist.`, {
      gameId: trimmedGameId,
      step: DELETE_STEPS.READ_GAME,
      code: 'not-found',
      name: 'HttpsError',
      message: `Game ${trimmedGameId} does not exist.`
    });
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
      'Only the host can delete this game.',
      {
        gameId: trimmedGameId,
        step: DELETE_STEPS.VERIFY_HOST,
        code: 'permission-denied',
        name: 'HttpsError',
        message: 'Only the host can delete this game.'
      }
    );
  }

  const deletedEvents = await deleteCollectionInBatches(gameRef.collection('events'), trimmedGameId);
  await runDeleteStep(trimmedGameId, DELETE_STEPS.DELETE_GAME, () => gameRef.delete());

  const confirmSnap = await runDeleteStep(trimmedGameId, DELETE_STEPS.CONFIRM_DELETE, () => gameRef.get());
  if (confirmSnap.exists) {
    throw new HttpsError('internal', `Game ${trimmedGameId} still exists after delete.`, {
      gameId: trimmedGameId,
      step: DELETE_STEPS.CONFIRM_DELETE,
      code: 'internal',
      name: 'HttpsError',
      message: `Game ${trimmedGameId} still exists after delete.`
    });
  }

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
