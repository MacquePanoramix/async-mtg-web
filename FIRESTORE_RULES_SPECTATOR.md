# Firestore rules update for spectator mode + user game index + Proxy AutoPass

Paste the following rules into your Firebase console (Firestore Rules):

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ✅ user-scoped index for "My Games"
    match /users/{uid}/games/{gameId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // ✅ game docs
    match /games_v3/{gameId} {

      function isSignedIn() {
        return request.auth != null;
      }

      function isPlayer() {
        return isSignedIn() &&
          (
            (resource.data.players.size() > 0 && resource.data.players[0].id == request.auth.uid) ||
            (resource.data.players.size() > 1 && resource.data.players[1].id == request.auth.uid)
          );
      }

      function isJoiningAsPlayer2() {
        return isSignedIn()
          && resource.data.players.size() == 1
          && request.resource.data.players.size() == 2
          && request.resource.data.players[0].id == resource.data.players[0].id
          && request.resource.data.players[1].id == request.auth.uid;
      }

      function isSpectator() {
        return isSignedIn()
          && resource.data.spectatorIds.hasAny([request.auth.uid]);
      }

      function isChatOnlyUpdate() {
        return request.resource.data.diff(resource.data).changedKeys().hasOnly(['log'])
          && request.resource.data.log.size() == resource.data.log.size() + 1
          && request.resource.data.log[request.resource.data.log.size() - 1].type == 'CHAT'
          && request.resource.data.log[request.resource.data.log.size() - 1].playerId == request.auth.uid;
      }

      function isSpectatorJoinUpdate() {
        return isSignedIn()
          && request.resource.data.diff(resource.data).changedKeys().hasOnly(['spectatorIds'])
          && request.resource.data.spectatorIds.size() == resource.data.spectatorIds.size() + 1
          && request.resource.data.spectatorIds.hasAll(resource.data.spectatorIds)
          && request.auth.uid in request.resource.data.spectatorIds
          && !(request.auth.uid in resource.data.spectatorIds);
      }

      // ✅ NEW: Proxy AutoPass update guard (from Codex), adapted to games_v3
      // This is for when ONE client "drives" state forward on behalf of the other player's AutoPass config.
      function isProxyAutopassUpdate() {
        let changed = request.resource.data.diff(resource.data).changedKeys();
        let actorId = request.auth.uid;

        let oldPriority = resource.data.priorityPlayerId;

        // autopass map: { "<uid>": { mode: "off"|"until_end_of_turn"|... , ... } }
        let oldAutopass = resource.data.autopass == null ? {} : resource.data.autopass;
        let oldCfg = oldPriority == null ? null : oldAutopass[oldPriority];

        let newLogSize = request.resource.data.log.size();
        let oldLogSize = resource.data.log.size();
        let last = request.resource.data.log[newLogSize - 1];

        return isPlayer()
          && oldPriority != null
          && resource.data.players.where(p, p.id == oldPriority).size() > 0
          && oldCfg != null
          && (oldCfg.mode is string) && oldCfg.mode != 'off'

          // Only allow the proxy engine to touch core state fields
          && changed.hasOnly([
            'phase',
            'step',
            'turnNumber',
            'activePlayerIndex',
            'priorityIndex',
            'priorityPlayerId',
            'stack',
            'cards',
            'log',
            'autopass'
          ])

          // Require exactly ONE new log entry describing the proxy action
          && newLogSize == oldLogSize + 1

          // These fields are what Codex’s proxy engine usually writes.
          // If your log schema differs, tell me what fields your log entries have.
          && (last.type == 'AUTOPASS' || last.type == 'AUTOPASS_PROXY')
          && (last.playerId == oldPriority)
          && (last.actorId == actorId);
      }

      // 🔐 Read policy (your current behavior)
      allow read: if isSignedIn();
      // If you ever want stricter privacy, swap to:
      // allow read: if isPlayer() || isSpectator();

      allow create: if isSignedIn();

      allow update: if
          isPlayer()
          || isJoiningAsPlayer2()
          || isSpectatorJoinUpdate()
          || (isSpectator() && isChatOnlyUpdate())
          || isProxyAutopassUpdate();

      allow delete: if false;
    }
  }
}

```

Notes:
- The `users/{uid}/games/{gameId}` rule enables each signed-in user to manage only their own “My Games” index.
- Spectator users remain restricted to chat-only updates in active games.
- Proxy AutoPass updates are restricted to pass/phase/step/log/autopass style fields, and logs must record both `playerId` (autopassing user) and `actorId` (proxy executor).
