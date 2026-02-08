# Firestore rules update for spectator mode

Paste the following rules into your Firebase console (Firestore Rules) to support spectators:

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
  }
}
```

Notes:
- `isChatOnlyUpdate` ensures spectators can only append one chat log entry per write.
- If your Firestore rules do not support `where` or `diff` in your rules runtime, you may need to denormalize `playerIds` as a top-level array to make these checks simpler.
