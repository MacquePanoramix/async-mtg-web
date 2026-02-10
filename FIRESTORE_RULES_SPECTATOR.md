# Firestore rules update for spectator mode + user game index

Paste the following rules into your Firebase console (Firestore Rules):

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /games_v3/{gameId} {
      function isSignedIn() {
        return request.auth != null;
      }

      function isPlayer() {
        return isSignedIn()
          && resource.data.players.where(p, p.id == request.auth.uid).size() > 0;
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

      allow read: if isPlayer() || isSpectator();
      allow create: if isSignedIn();
      allow update: if isPlayer() || (isSpectator() && isChatOnlyUpdate());
      allow delete: if false;
    }

    match /users/{uid}/games/{gameId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Notes:
- The `users/{uid}/games/{gameId}` rule enables each signed-in user to manage only their own “My Games” index.
- Spectator users remain restricted to chat-only updates in active games.
