import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, linkWithPopup, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, updateDoc, arrayUnion, serverTimestamp, runTransaction, query, orderBy, where, deleteDoc, getDoc, getDocs, addDoc, writeBatch, limit } from 'firebase/firestore';
import { X, ArrowRight, Clock, Shield, Skull, Layers, Eye, ChevronDown, ChevronUp, BookOpen, Shuffle, Plus, Copy, UserCheck, EyeOff, RotateCw, Search, Hexagon, Unlock, Lock, Move, Dices, Coins, LayoutGrid, LogOut, Users, User, Bug, Loader2, RefreshCw, AlertTriangle, Repeat, Check, ArrowUp, ArrowDown, MessageSquare, Trash2, Paperclip, Crown, Undo2, Bell } from 'lucide-react';

// --- Firebase Configuration ---
// UPDATED: Using standard Vite env vars
const resolvedAuthDomain =
  typeof window !== 'undefined' && window.location.hostname === 'magicbypost.netlify.app'
    ? 'magicbypost.netlify.app'
    : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: resolvedAuthDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// REMOVED: const appId... (no longer needed)

// --- Constants & Types ---

const GAME_MODES = {
  REGULAR: 'regular',
  COMMANDER: 'commander'
};

const TUTORIAL_SCRIPT_VERSION = 4;
const TUTORIAL_SCRIPT_STEPS = [
  { id: 'intro', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'Nicol Bolas and the Board of Doom', scene: 'The lobby has cracked open into an arena. Seven cards wait at the edge of your battlefield.', dialogue: 'Enough doors. Sit. Draw. Learn.', objective: 'Tap the room code so you know where a duel lives.', hint: 'Tap the room code in the header. Real games use this code for players and watchers.', anchor: 'room-code', completion: 'detect' },
  { id: 'room_code', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'The Doorway Sigil', scene: 'A six-character room code burns above the battlefield.', dialogue: 'This code is the doorway. Send it to the friend you wish to inconvenience.', objective: 'Tap the room code to copy the doorway sigil.', hint: 'The tap copies the code and advances the tutorial.', anchor: 'room-code', completion: 'detect' },
  { id: 'battlefields', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'Two Battlefields', scene: 'Two battlefields rise: yours below, mine above.', dialogue: 'Know the geography before you begin losing territory.', objective: 'Tap your battlefield to inspect your side of the arena.', hint: 'Your battlefield is near the bottom. Nicol Bolas is above.', anchor: 'own-battlefield', completion: 'detect' },
  { id: 'hand_area', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'Opening Hand', scene: 'Seven cards fan out like possible futures.', dialogue: 'Seven choices. Most mortals need only one to disappoint me.', objective: 'Tap a card in your hand to open its detail panel.', hint: 'Your hand is at the bottom. Scroll sideways if needed, then tap any hand card.', anchor: 'hand-area', completion: 'detect' },
  { id: 'import_deck', chapter: 'Act 1 / Turn 1 — Before the First Spell', title: 'The Deck You Brought', scene: 'Your prepared tutorial deck waits, but the import altar is visible beside your hand.', dialogue: 'Before a real duel, bring a real deck. Commander lists may even declare their Commander before the Deck.', objective: 'Open Import Deck.', hint: 'Tap Import Deck. The tutorial opens a demo list without replacing your scripted duel deck.', anchor: 'import-deck-button', completion: 'detect' },
  { id: 'play_land', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'Play Mountain', scene: 'The floor splits into red stone.', dialogue: 'Put a place beneath your power.', objective: 'Play Mountain.', hint: 'Tap Mountain in your hand, then choose Play Land.', anchor: 'hand-area', completion: 'detect' },
  { id: 'undo_play_land', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'Undo and Replay', scene: 'Time stutters around the Mountain.', dialogue: 'Regret is the first spell every player learns.', objective: 'Undo the Mountain, then play it again.', hint: 'Tap Undo, confirm, then replay Mountain. This uses the normal Play Land undo flow.', anchor: 'undo-button', completion: 'detect' },
  { id: 'cast_spell_to_stack', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'Lightning Bolt Enters the Stack', scene: 'A red spell ignites above your hand.', dialogue: 'Do not throw it at me yet. In Magic, even violence must wait in line.', objective: 'Cast Lightning Bolt targeting Nicol Bolas.', hint: 'Tap Lightning Bolt in your hand and choose Cast Spell or Cast + Target.', anchor: 'hand-area', completion: 'detect' },
  { id: 'inspect_stack', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'Open the Stack', scene: 'The bolt freezes in the air.', dialogue: 'The stack: where intentions become paperwork before becoming pain.', objective: 'Open the Stack panel.', hint: 'Tap the Stack button near the top of the screen.', anchor: 'stack-button', completion: 'detect' },
  { id: 'bolas_negate', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'Bolas Responds with Negate', scene: 'Blue light wraps around your spell.', dialogue: 'Denied? Not yet. Merely contested.', objective: 'Open the Stack and inspect Bolas’s Negate above Lightning Bolt.', hint: 'Tap the Stack button or the Negate stack item. The newest stack item resolves first.', anchor: 'stack-button', completion: 'detect' },
  { id: 'copy_stack_item', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'Copy the Bolt', scene: 'Your spell casts a second shadow.', dialogue: 'Ah. Multiplication. Dangerous when discovered by the desperate.', objective: 'Copy Lightning Bolt.', hint: 'Open Lightning Bolt’s stack item details and use Copy Stack Item.', anchor: 'stack-panel', completion: 'detect' },
  { id: 'resolve_stack_item', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'Resolve the Copy', scene: 'The copied bolt slips past the counterspell.', dialogue: 'The imitation wounds first. How vulgar.', objective: 'Resolve the top Lightning Bolt copy.', hint: 'Use Resolve Top Stack Item. The top object resolves first.', anchor: 'stack-panel', completion: 'detect' },
  { id: 'counter_stack_item', chapter: 'Act 1 / Turn 1 — Main Phase', title: 'Negate Closes', scene: 'Negate closes around the original spell.', dialogue: 'The first future dies. Remember: the top resolves first.', objective: 'Counter or fizzle the remaining original spell as instructed by the stack.', hint: 'Use Counter/Fizzle or resolve the counterspell, depending on the current top item.', anchor: 'stack-panel', completion: 'detect' },
  { id: 'pass_priority', chapter: 'Act 1 / Turn 1 — End Step', title: 'Pass Priority', scene: 'Silence returns to the battlefield.', dialogue: 'In async Magic, silence must be announced.', objective: 'Pass priority.', hint: 'Tap Pass when you are done acting.', anchor: 'pass-button', completion: 'detect' },
  { id: 'game_log', chapter: 'Act 1 / Turn 1 — End Step', title: 'The Arena Remembers', scene: 'The arena wall records every insult.', dialogue: 'Memory is a weapon. The log is where your excuses go to die.', objective: 'Open the log/chat.', hint: 'Use the chat/log icon near the top to review actions and leave clear async notes.', anchor: 'chat-button', completion: 'detect' },
  { id: 'beginning_phase_draw', chapter: 'Act 2 / Turn 2 — Untap, Upkeep, Draw', title: 'The Ritual of a Turn', scene: 'A new turn opens like a blade.', dialogue: 'Untap. Upkeep. Draw. The ritual matters because mistakes love shortcuts.', objective: 'Open phase controls, set the draw step, then draw a card.', hint: 'Tap the phase indicator, choose Draw, then use Draw from the library tools.', anchor: 'phase-indicator', completion: 'detect' },
  { id: 'cast_delver', chapter: 'Act 2 / Turn 2 — Main Phase', title: 'Cast Delver of Secrets', scene: 'A small wizard steps onto the board carrying a terrible secret.', dialogue: 'Small creatures are often containers for larger problems.', objective: 'Cast Delver of Secrets and resolve it onto the battlefield.', hint: 'Tap Delver in your hand, cast it, then resolve the stack item.', anchor: 'hand-area', completion: 'detect' },
  { id: 'reveal_top_delver', chapter: 'Act 2 / Turn 2 — Upkeep Trigger', title: 'Reveal the Top Card', scene: 'The top of your library glows with instant magic.', dialogue: 'Show the insect what it wants to become.', objective: 'Use Library tools to reveal the top card for Delver’s trigger.', hint: 'Tap the book/library icon and reveal the top card.', anchor: 'library-menu-button', completion: 'detect' },
  { id: 'transform_card', chapter: 'Act 2 / Turn 2 — Upkeep Trigger', title: 'Transform Delver', scene: 'The wizard’s shadow unfolds into wings.', dialogue: 'Identity is just a face with ambition.', objective: 'Transform Delver into Insectile Aberration.', hint: 'Open Delver’s card detail and use Transform / Switch face.', anchor: 'card-detail', completion: 'detect' },
  { id: 'bolas_removal', chapter: 'Act 2 / Turn 2 — Main Phase', title: 'Doom Blade on the Stack', scene: 'Black fire forms around the insect.', dialogue: 'Now let us see whether your little revelation survives contact with removal.', objective: 'Open the Stack and inspect Bolas’s Doom Blade targeting Delver.', hint: 'The scripted Doom Blade demonstrates targets and why protection/phase-out tools matter.', anchor: 'stack-button', completion: 'detect' },
  { id: 'phase_card', chapter: 'Act 2 / Turn 2 — In Response', title: 'Slip Out the Back', scene: 'Delver folds sideways out of reality.', dialogue: 'Annoying. You have found the door marked not here.', objective: 'Phase out Delver.', hint: 'Open Delver details and use Phase Out when a card like Slip Out the Back makes it phase out.', anchor: 'card-detail', completion: 'detect' },
  { id: 'add_counter', chapter: 'Act 2 / Turn 2 — In Response', title: '+1/+1 Counter', scene: 'A counter remains where the spell touched your creature.', dialogue: 'A number appears. Soon it will demand respect.', objective: 'Add a +1/+1 counter to Delver.', hint: 'Use card detail counters to represent counters from real effects.', anchor: 'card-detail', completion: 'detect' },
  { id: 'add_reminder', chapter: 'Act 2 / Turn 2 — Cleanup Memory', title: 'Until End of Turn Reminder', scene: 'A temporary note clings to the creature’s outline.', dialogue: 'Until end of turn is where memory goes to be betrayed.', objective: 'Add a reminder marker.', hint: 'Use a reminder like “Can’t block” or “+3/+3 until EOT” when a temporary effect needs remembering.', anchor: 'card-detail', completion: 'detect' },
  { id: 'tap_card', chapter: 'Act 2 / Turn 2 — Main Phase', title: 'Tap and Untap', scene: 'The creature returns, exhausted from not existing.', dialogue: 'Turn it sideways. The oldest gesture of usefulness.', objective: 'Tap and untap a permanent.', hint: 'Open card details and use Tap/Untap.', anchor: 'card-detail', completion: 'detect' },
  { id: 'face_down_reveal', chapter: 'Act 2 / Turn 2 — Hidden Information', title: 'Face Down and Reveal', scene: 'Bolas places a blank mask over a card.', dialogue: 'Sometimes a card is a secret with corners.', objective: 'Open Delver details, turn it face down, then reveal or switch it back.', hint: 'Use Turn Face Down / Reveal only when a card effect creates hidden information.', anchor: 'card-detail', completion: 'detect' },
  { id: 'set_attackers_phase', chapter: 'Act 3 / Turn 3 — Beginning of Combat', title: 'Scheduled Violence', scene: 'The arena lowers its walls.', dialogue: 'Combat is not violence. It is scheduled violence.', objective: 'Move to the attackers step.', hint: 'Tap the phase indicator and choose Attackers after beginning combat.', anchor: 'phase-indicator', completion: 'detect' },
  { id: 'declare_attacker_player', chapter: 'Act 3 / Turn 3 — Declare Attackers', title: 'Attack Bolas', scene: 'Your creature crosses the line.', dialogue: 'Very well. Aim your little rebellion.', objective: 'Declare an attacker against Nicol Bolas.', hint: 'Tap your creature, choose Attack, then choose Nicol Bolas.', anchor: 'card-detail', completion: 'detect' },
  { id: 'attack_planeswalker_battle_note', chapter: 'Act 3 / Turn 3 — Declare Attackers', title: 'Not Every Attack Seeks a Face', scene: 'Bolas places a false throne between you and him.', dialogue: 'Some attacks seek a planeswalker. Some seek a battle.', objective: 'Open the attack target picker and choose Nicol Bolas or the planeswalker.', hint: 'Tap your attacker, choose Attack, then choose a target from the picker.', anchor: 'card-detail', completion: 'detect' },
  { id: 'declare_blocker_note', chapter: 'Act 3 / Turn 3 — Declare Blockers', title: 'A Blocker Appears', scene: 'A Zombie lurches between blade and dragon.', dialogue: 'The honorable thing would be to block. Fortunately, I am flexible.', objective: 'Open blocker tools and mark a blocker for the attack.', hint: 'Use the blocker controls on a creature or combat row when a defender blocks.', anchor: 'combat-summary', completion: 'detect' },
  { id: 'first_strike_step', chapter: 'Act 3 / Turn 3 — First-Strike Damage', title: 'The Early Wound', scene: 'One blade lands before time catches up.', dialogue: 'First strike is violence arriving early.', objective: 'Set combat damage to First-strike damage.', hint: 'Use phase/combat controls when first strike or double strike matters.', anchor: 'phase-indicator', completion: 'detect' },
  { id: 'regular_damage_step', chapter: 'Act 3 / Turn 3 — Regular Damage', title: 'Damage on Schedule', scene: 'The second wound arrives on schedule.', dialogue: 'Then time remembers the rest of the damage.', objective: 'Set combat damage to Regular damage.', hint: 'Use combat damage step controls for the normal damage step.', anchor: 'phase-indicator', completion: 'detect' },
  { id: 'damage_markers', chapter: 'Act 3 / Turn 3 — End of Combat', title: 'Damage Markers', scene: 'Red marks flare on damaged creatures.', dialogue: 'Damage fades at cleanup. Arguments do not.', objective: 'Open a creature detail panel and add temporary damage.', hint: 'Use the damage controls; damage clears at cleanup.', anchor: 'card-detail', completion: 'detect' },
  { id: 'combat_summary_note', chapter: 'Act 3 / Turn 3 — End Combat', title: 'Combat Summary', scene: 'The arena writes down who is trying to hurt whom.', dialogue: 'The combat summary exists because memory is not a legal game object.', objective: 'Tap Combat Summary to inspect the war record.', hint: 'It lists attackers, blockers, attack targets, and damage-step state.', anchor: 'combat-summary', completion: 'detect' },
  { id: 'private_hand_peek', chapter: 'Act 4 / Turn 4 — The Library Labyrinth', title: 'Duress the Dragon', scene: 'A thought-spell slips behind Bolas’s eyes.', dialogue: 'Public knowledge is vulgar. Private knowledge wins games.', objective: 'Use Private hand peek on Nicol Bolas.', hint: 'Use private peek only when a spell or effect lets you see hidden cards privately.', anchor: 'private-hand-peek-button', completion: 'detect' },
  { id: 'reveal_hand_note', chapter: 'Act 4 / Turn 4 — Public Knowledge', title: 'Reveal and Hide Hand', scene: 'Bolas opens one hand to the arena, then closes it.', dialogue: 'Public reveal is not the same as private knowledge. Do not confuse theatre with espionage.', objective: 'Open Reveal tools and reveal or hide your hand.', hint: 'Use reveal tools when the whole table should see a player’s hand.', anchor: 'reveal-tools', completion: 'detect' },
  { id: 'open_library_tools', chapter: 'Act 4 / Turn 4 — Your Library', title: 'Open the Library Labyrinth', scene: 'Your next draws appear as floating cards.', dialogue: 'The future is fragile. Rearrange it before it notices.', objective: 'Open Library tools.', hint: 'Tap the book/library icon. Swipe the bottom toolbar if it is off-screen.', anchor: 'library-menu-button', completion: 'detect' },
  { id: 'batch_library_actions', chapter: 'Act 4 / Turn 4 — Batch Actions', title: 'One Card, Ten Cards', scene: 'Several cards fall from the top of a library at once.', dialogue: 'One card is a choice. Ten cards is weather.', objective: 'Open Batch Actions.', hint: 'Batch Actions covers Draw N, Mill N, Reveal top N, Exile top N, Scry N, and Surveil N.', anchor: 'library-menu-button', completion: 'detect' },
  { id: 'opponent_library_tools', chapter: 'Act 4 / Turn 4 — Portent', title: 'Trespass with Permission', scene: 'Portent points at Bolas’s library instead of yours.', dialogue: 'Permission to trespass is still trespassing.', objective: 'Open Library tools and inspect the opponent library section.', hint: 'Use opponent library tools only when an effect like Portent lets you look at or reorder an opponent’s library.', anchor: 'library-menu-button', completion: 'detect' },
  { id: 'create_token', chapter: 'Act 5 / Turn 5 — Main Phase', title: 'Dragon Fodder', scene: 'Two goblins crawl out of a spell-shaped hole.', dialogue: 'Some creatures were never cards. Still, they insist on standing there.', objective: 'Create Goblin tokens.', hint: 'Use Token Tools or deck-derived token templates when a spell creates tokens.', anchor: 'token-tools', completion: 'detect' },
  { id: 'deck_tokens_note', chapter: 'Act 5 / Turn 5 — Main Phase', title: 'Deck-Derived Templates', scene: 'Dragon Fodder remembers what it usually creates.', dialogue: 'Your deck has habits. The app can remember them.', objective: 'Open Token Tools and tap a From Your Deck token template if one is present.', hint: 'Imported decks can surface token, emblem, and dungeon references without storing huge card data.', anchor: 'token-tools', completion: 'detect' },
  { id: 'custom_token_note', chapter: 'Act 5 / Turn 5 — Main Phase', title: 'Custom Monster', scene: 'Bolas names a creature no preset has prepared for.', dialogue: 'When reality lacks the correct monster, fill out the form.', objective: 'Open Token Tools and edit the Custom Token form.', hint: 'Custom Token lets you choose name, stats, colors, text, and quantity.', anchor: 'token-tools', completion: 'detect' },
  { id: 'target_system', chapter: 'Act 5 / Turn 5 — Main Phase', title: 'A Promise with Consequences', scene: 'A red line connects spell and victim.', dialogue: 'A target is a promise with consequences.', objective: 'Mark a target.', hint: 'Use Ability/Target tools on a spell or permanent when an effect targets something.', anchor: 'target-tools', completion: 'detect' },
  { id: 'attach_to_permanent', chapter: 'Act 5 / Turn 5 — Main Phase', title: 'Rancor Finds a Body', scene: 'Rancor coils around a creature.', dialogue: 'Attachments are relationships with rules text.', objective: 'Use Attach to permanent on Rancor or another attachment.', hint: 'Use Attach to permanent when a card becomes attached to a creature, artifact, or other permanent.', anchor: 'card-detail', completion: 'detect' },
  { id: 'attach_to_player_note', chapter: 'Act 5 / Turn 5 — Main Phase', title: 'Curse the Dragon', scene: 'Curse of the Pierced Heart hangs behind Bolas like a bad moon.', dialogue: 'Why curse a creature when you can curse the person making decisions?', objective: 'Use Attach to player to curse Nicol Bolas.', hint: 'Use Attach to player for player-bound Auras such as Curses.', anchor: 'card-detail', completion: 'detect' },
  { id: 'clone_control', chapter: 'Act 5 / Turn 5 — Main Phase', title: 'Clone and Betrayal', scene: 'A creature looks at itself and makes a tactical error.', dialogue: 'Copies are lies that learned anatomy. Control changes are betrayal with timestamps.', objective: 'Open card detail and use Clone or Give Control.', hint: 'Use these tools when a spell copies a permanent or changes control.', anchor: 'card-detail', completion: 'detect' },
  { id: 'player_panel', chapter: 'Act 6 / Turn 6 — The Player Becomes the Battlefield', title: 'Open Player Panel', scene: 'Bolas points at you instead of your cards.', dialogue: 'The battlefield is not only where creatures stand. Sometimes it is you.', objective: 'Open Player Counters & Statuses.', hint: 'Tap the player/status/counter button near your battlefield.', anchor: 'player-counters-button', completion: 'detect' },
  { id: 'mana_pool', chapter: 'Act 6 / Turn 6 — Mana Pool', title: 'Floating Mana', scene: 'Green mana floats like a captured firefly.', dialogue: 'Mana unspent is a threat looking for a sentence.', objective: 'Add mana to your mana pool, then clear it.', hint: 'Mana Pool controls are manual and do not automatically pay for spells.', anchor: 'mana-pool-panel', completion: 'detect' },
  { id: 'player_counters', chapter: 'Act 6 / Turn 6 — Player Counters', title: 'Invisible Ledgers', scene: 'Poison, energy, and experience ledgers open beside your name.', dialogue: 'Some numbers sit on players because cards are too fragile to hold them.', objective: 'Add and remove a player counter.', hint: 'Use Poison, Energy, Experience, or custom player counters.', anchor: 'player-counters-panel', completion: 'detect' },
  { id: 'statuses', chapter: 'Act 6 / Turn 6 — Statuses', title: 'Crowns and Nightfall', scene: 'A crown, a dungeon door, a city seal, and a changing sky appear.', dialogue: 'Titles are counters with better costumes.', objective: 'Toggle a status, Day/Night, or Ring temptation.', hint: 'Use Monarch, Initiative, City’s Blessing, Day/Night, and Ring controls as cards require.', anchor: 'status-panel', completion: 'detect' },
  { id: 'emblems', chapter: 'Act 6 / Turn 6 — Emblems', title: 'A Scar the Rules Remember', scene: 'A planeswalker’s threat remains after the planeswalker is gone.', dialogue: 'An emblem is a scar the rules refuse to forget.', objective: 'Add an emblem.', hint: 'Use preset, custom, or deck-derived emblems.', anchor: 'player-counters-panel', completion: 'detect' },
  { id: 'dungeons_note', chapter: 'Act 6 / Turn 6 — Dungeons', title: 'Checklist with Walls', scene: 'A map appears beneath the turn order.', dialogue: 'Dungeons are not places. They are checklists with walls.', objective: 'Open the dungeon reference from Player Counters & Statuses.', hint: 'Use dungeon references for venture/initiative cards. Progress is manual.', anchor: 'player-counters-panel', completion: 'detect' },
  { id: 'commander_note', chapter: 'Act 6 / Turn 6 — Commander', title: 'The Command Zone', scene: 'A command zone opens like a throne room.', dialogue: 'In Commander, death is merely a tax increase.', objective: 'Open the commander/player tools panel and inspect commander status.', hint: 'Commander games start at 40 life and add command zone, commander tax, and commander damage tools.', anchor: 'player-counters-panel', completion: 'detect' },
  { id: 'final_spell', chapter: 'Act 7 / Final Turn — Main Phase', title: 'The Final Spell', scene: 'Your battlefield has become a weapon with several moving parts.', dialogue: 'Show me the oldest phrase in Magic. Show me you know when to answer.', objective: 'Cast the final Lightning Bolt or declare the final attack.', hint: 'Use the shown card or combat tool. The board is prepared for a lethal line.', anchor: 'hand-area', completion: 'detect' },
  { id: 'final_bolas_response', chapter: 'Act 7 / Final Turn — In Response', title: 'Bolas Responds', scene: 'Bolas places one last spell above yours.', dialogue: 'Victory is adorable when it believes the stack is empty.', objective: 'Open the stack and inspect Bolas’s response.', hint: 'The newest spell is on top.', anchor: 'stack-button', completion: 'detect' },
  { id: 'final_in_response', chapter: 'Act 7 / Final Turn — In Response', title: 'In Response', scene: 'Your answer appears above his answer.', dialogue: 'Ah. There it is. The phrase that ruins kings.', objective: 'Respond on the stack by copying, countering, or resolving the shown item.', hint: 'Use the active stack controls to answer Bolas.', anchor: 'stack-panel', completion: 'detect' },
  { id: 'final_trial', chapter: 'Act 7 / Final Turn — Pass Priority', title: 'Let the Future Happen', scene: 'The arena waits.', dialogue: 'No more tricks? Then pass. Let the future happen.', objective: 'Pass priority.', hint: 'Tap Pass to finish the duel.', anchor: 'pass-button', completion: 'detect' },
  { id: 'async_oath', chapter: 'Act 8 / After the Duel — Async Survival', title: 'The Async Oath', scene: 'The dragon’s shadow cracks, but its smile remains.', dialogue: 'Leave clear board states. Pass priority. Use the log. Do not make your friends solve archaeology.', objective: 'Open log/chat, then pass priority so the async state is clear.', hint: 'Use pass, logs, and clear markers so friends can understand the game later.', anchor: 'chat-button', completion: 'detect' },
  { id: 'watch_cleanup_note', chapter: 'Act 8 / After the Duel — Async Survival', title: 'Watchers and Cleanup', scene: 'The arena folds back toward the lobby.', dialogue: 'Some will watch. Some rooms will rot. Know the difference.', objective: 'Tap the room code again to practice sharing a room before cleanup later.', hint: 'Watch and cleanup live in the lobby; in-game, copying the room code is the real table action.', anchor: 'room-code', completion: 'detect' },
  { id: 'manual_toolbox_note', chapter: 'Act 8 / After the Duel — Async Survival', title: 'The Manual Toolbox', scene: 'Bolas hands you a toolbox and pointedly not a judge.', dialogue: 'This machine is not a judge. It is a table, a memory, and a knife drawer.', objective: 'Open the log/chat and focus the message field as your table note scratchpad.', hint: 'Players are responsible for legal play; the app helps represent paper Magic.', anchor: 'chat-button', completion: 'detect' },
  { id: 'tutorial_complete', chapter: 'Victory, Temporarily', title: 'Nicol Bolas Defeated', scene: 'The dragon’s shadow cracks, but its smile remains.', dialogue: 'You have not defeated me. You have merely become inconvenient.', objective: 'Finish the tutorial duel.', hint: 'You can now return to the lobby, keep exploring this board, or restart the guided duel.', anchor: null, completion: 'finish' },
];
const TUTORIAL_LOBBY_SCENES = [
  { id: 'name', completion: 'NAME_CONFIRMED', title: 'L0 — Name Yourself', scene: 'The lobby darkens like a summoning circle.', dialogue: 'Before a duel can wound you, it must know what to call you.', objective: 'Tap your name field and confirm the name you will use in the duel.', hint: 'Do it now: focus or edit Your Name. The name must not be empty.', anchor: 'lobby-name-input', reaction: 'Good. Now the room knows what to blame.' },
  { id: 'laws', completion: 'GAME_MODE_SELECTED', title: 'L1 — Choose the Laws', scene: 'Two rule-stones burn: Regular and Commander.', dialogue: 'Twenty life is a duel. Forty life is a declaration of stubbornness.', objective: 'Choose Regular or Commander.', hint: 'Touch one of the mode buttons. Regular starts at 20 life; Commander starts at 40 and adds command-zone tools.', anchor: 'lobby-game-mode', reaction: 'A law chosen is a cage accepted.' },
  { id: 'title', completion: 'GAME_TITLE_TOUCHED', title: 'L2 — Title the Duel', scene: 'A blank banner waits above the table.', dialogue: 'A battle with a title is easier to find when your memory has failed you.', objective: 'Tap the Game Title field.', hint: 'The title is optional, but touch the field so you know where to name rooms later.', anchor: 'lobby-game-title', reaction: 'Even an unnamed disaster should know where its banner hangs.' },
  { id: 'create', completion: 'CREATE_GAME_PRACTICED', title: 'L3 — Create a Room', scene: 'The room folds itself toward existence, then waits.', dialogue: 'A battle is not found. It is authored.', objective: 'Tap Create Game.', hint: 'This is tutorial-safe practice: tapping Create Game here will not create a normal room.', anchor: 'lobby-create-game', reaction: 'Good. You found the forge without making unnecessary paperwork.' },
  { id: 'join', completion: 'JOIN_GAME_PRACTICED', title: 'L4 — Join Door', scene: 'A door with a blade waits for a code.', dialogue: 'Enter to fight. Try not to look eager.', objective: 'Tap Join Game.', hint: 'This practice tap will not join a real game or require a code.', anchor: 'lobby-join-game', reaction: 'Correct door. Incorrect confidence.' },
  { id: 'watch', completion: 'WATCH_GAME_PRACTICED', title: 'L5 — Watcher Door', scene: 'A door with an eye blinks from the lobby.', dialogue: 'Watching is safer, which is how you know it teaches less.', objective: 'Tap Watch Game.', hint: 'This practice tap will not navigate into a real game.', anchor: 'lobby-watch-game', reaction: 'Good. Spectatorship: cowardice with note-taking.' },
  { id: 'room_code', completion: 'ROOM_CODE_INSPECTED', title: 'L6 — Room Code', scene: 'A six-character sigil burns into the air.', dialogue: 'This code is the doorway. Send it to the friend you wish to inconvenience.', objective: 'Touch the room code example.', hint: 'Room codes let friends join as players or watch as spectators.', anchor: 'lobby-room-code-example', reaction: 'A sigil noticed is a door weaponized.' },
  { id: 'my_games', completion: 'MY_GAMES_INSPECTED', title: 'L7 — My Games', scene: 'Recent rooms whisper from the bottom of the lobby.', dialogue: 'Abandoned games breed in the dark. Find them before they unionize.', objective: 'Inspect My Games.', hint: 'Tap or scroll to the My Games panel to find rooms you hosted, joined, or watched.', anchor: 'lobby-my-games', reaction: 'Yes. Your past mistakes have an index.' },
  { id: 'cleanup', completion: 'CLEANUP_BUTTON_INSPECTED', title: 'L8 — Clean Old Rooms', scene: 'Old rooms rattle their bones.', dialogue: 'Sweep them away before they unionize.', objective: 'Tap Clean up old games.', hint: 'This tutorial-safe tap will not delete anything.', anchor: 'lobby-cleanup-games', reaction: 'Good. Use this later when old host-owned rooms pile up.' },
  { id: 'begin', completion: 'START_TUTORIAL_CONFIRMED', title: 'L9 — Begin Bolas Duel', scene: 'The lobby cracks open. A second seat fills itself.', dialogue: 'Enough doors. Sit. Draw. Learn.', objective: 'Tap Start Tutorial Battle.', hint: 'This action creates or opens the scripted Nicol Bolas tutorial duel.', anchor: 'lobby-tutorial-start', final: true }
];

const TUTORIAL_FALLBACK_STEP = {
  id: 'intro',
  chapter: 'Tutorial',
  title: 'Tutorial step unavailable',
  dialogue: 'Tutorial step unavailable. Skip or restart tutorial.',
  objective: 'Tutorial step unavailable. Skip or restart tutorial.',
  hint: 'Tutorial step unavailable. Skip or restart tutorial.',
  anchor: null,
  completion: 'manual'
};
const normalizeTutorialStep = (step, fallbackId = 'intro') => {
  const safeStep = step && typeof step === 'object' ? step : {};
  return {
    ...TUTORIAL_FALLBACK_STEP,
    ...safeStep,
    id: typeof safeStep.id === 'string' && safeStep.id ? safeStep.id : fallbackId,
    chapter: typeof safeStep.chapter === 'string' && safeStep.chapter ? safeStep.chapter : TUTORIAL_FALLBACK_STEP.chapter,
    title: typeof safeStep.title === 'string' && safeStep.title ? safeStep.title : TUTORIAL_FALLBACK_STEP.title,
    scene: typeof safeStep.scene === 'string' && safeStep.scene ? safeStep.scene : TUTORIAL_FALLBACK_STEP.scene,
    dialogue: typeof safeStep.dialogue === 'string' && safeStep.dialogue ? safeStep.dialogue : TUTORIAL_FALLBACK_STEP.dialogue,
    reaction: typeof safeStep.reaction === 'string' ? safeStep.reaction : '',
    objective: typeof safeStep.objective === 'string' && safeStep.objective ? safeStep.objective : TUTORIAL_FALLBACK_STEP.objective,
    hint: typeof safeStep.hint === 'string' && safeStep.hint ? safeStep.hint : TUTORIAL_FALLBACK_STEP.hint,
    anchor: typeof safeStep.anchor === 'string' || Array.isArray(safeStep.anchor) ? safeStep.anchor : null,
    completion: ['manual', 'detect', 'detect-or-manual', 'finish'].includes(safeStep.completion) ? safeStep.completion : 'manual'
  };
};
const TUTORIAL_STEP_IDS = TUTORIAL_SCRIPT_STEPS.map((step) => step?.id).filter(Boolean);
const getTutorialStepById = (stepId) => {
  const requestedId = typeof stepId === 'string' && stepId ? stepId : 'intro';
  const foundStep = TUTORIAL_SCRIPT_STEPS.find((step) => step?.id === requestedId) || TUTORIAL_SCRIPT_STEPS.find((step) => step?.id === 'intro') || TUTORIAL_SCRIPT_STEPS[0];
  return normalizeTutorialStep(foundStep, requestedId);
};
const getTutorialStepIndex = (stepId) => {
  const index = TUTORIAL_STEP_IDS.indexOf(stepId);
  return Math.min(Math.max(index >= 0 ? index : 0, 0), Math.max(TUTORIAL_STEP_IDS.length - 1, 0));
};
const getNextTutorialStepId = (stepId) => TUTORIAL_SCRIPT_STEPS[Math.min(getTutorialStepIndex(stepId) + 1, TUTORIAL_SCRIPT_STEPS.length - 1)]?.id || 'intro';
const getPreviousTutorialStepId = (stepId) => TUTORIAL_SCRIPT_STEPS[Math.max(getTutorialStepIndex(stepId) - 1, 0)]?.id || 'intro';
const capTutorialCompletedStepIds = (stepIds = []) => [...new Set((Array.isArray(stepIds) ? stepIds : []).filter(Boolean))].slice(-80);
const getTutorialAnchorClass = (activeAnchor, anchor, pulseAnchor = null) => {
  if (!activeAnchor || !anchor) return '';
  const anchors = Array.isArray(anchor) ? anchor : [anchor];
  const isActive = anchors.includes(activeAnchor) || (activeAnchor === 'battlefields' && (anchors.includes('own-battlefield') || anchors.includes('opponent-battlefield')));
  const isPulsing = Boolean(pulseAnchor && (anchors.includes(pulseAnchor) || (pulseAnchor === 'battlefields' && (anchors.includes('own-battlefield') || anchors.includes('opponent-battlefield')))));
  return isActive
    ? ` ring-2 ring-amber-300/80 shadow-[0_0_18px_rgba(252,211,77,0.45)] transition-shadow ${isPulsing ? ' tutorial-target-pulse' : ''}`
    : '';
};

const getGameMode = (game) => game?.gameMode || GAME_MODES.REGULAR;
const isCommanderGame = (game) => getGameMode(game) === GAME_MODES.COMMANDER;
const getStartingLifeForMode = (gameMode) => gameMode === GAME_MODES.COMMANDER ? 40 : 20;

const BUILT_IN_PLAYER_COUNTERS = ['poison', 'energy', 'experience'];
const COMMANDER_PLAYER_COUNTERS = ['commanderTax', 'commanderDamage'];
const PLAYER_COUNTER_LABELS = {
  poison: 'Poison',
  energy: 'Energy',
  experience: 'Experience',
  commanderTax: 'Commander Tax',
  commanderDamage: 'Commander Damage',
  monarch: 'Monarch',
  ringTempted: 'Ring tempted'
};
const PLAYER_COUNTER_BADGE_LABELS = {
  commanderTax: 'Cmd tax',
  commanderDamage: 'Cmd dmg'
};

const COMMANDER_SECTION_HEADERS = new Set(['commander', 'commanders']);
const DECK_SECTION_HEADERS = new Set(['deck', 'main deck', 'mainboard']);

const MANA_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
const DEFAULT_MANA_POOL = Object.freeze({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
const MANA_COLOR_LABELS = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colorless'
};

const PLAYER_STATUS_LABELS = {
  monarch: 'Monarch',
  initiative: 'Initiative',
  citysBlessing: "City’s Blessing"
};
const PLAYER_STATUS_BADGE_STYLES = {
  monarch: 'border-amber-500/50 bg-amber-950/60 text-amber-100',
  initiative: 'border-emerald-500/50 bg-emerald-950/60 text-emerald-100',
  citysBlessing: 'border-cyan-500/50 bg-cyan-950/60 text-cyan-100',
  ring: 'border-orange-500/50 bg-orange-950/60 text-orange-100',
  custom: 'border-violet-500/50 bg-violet-950/60 text-violet-100'
};
const DAY_NIGHT_LABELS = { day: 'Day', night: 'Night' };
const MAX_CUSTOM_PLAYER_STATUS_LENGTH = 48;
const MAX_CUSTOM_PLAYER_STATUSES = 8;
const MAX_PLAYER_EMBLEM_NAME_LENGTH = 64;
const MAX_PLAYER_EMBLEM_SOURCE_LENGTH = 80;
const MAX_PLAYER_EMBLEM_TEXT_LENGTH = 600;
const MAX_PLAYER_EMBLEMS = 20;
const MAX_DECK_EXTRA_TOKENS = 30;
const MAX_DECK_EXTRA_EMBLEMS = 20;
const MAX_DECK_EXTRA_DUNGEONS = 10;
const MAX_DECK_EXTRA_SOURCE_CARDS = 6;
const DUNGEON_FALLBACK_NAMES = ['Lost Mine of Phandelver', 'Dungeon of the Mad Mage', 'Tomb of Annihilation'];
const INITIATIVE_DUNGEON_FALLBACK_NAMES = ['The Undercity'];
const PLAYER_EMBLEM_PRESETS = [
  { label: 'Chandra', name: 'Chandra Emblem', sourceName: 'Chandra, Torch of Defiance', text: 'Whenever you cast a spell, this emblem deals 5 damage to any target.' },
  { label: 'Teferi', name: 'Teferi Emblem', sourceName: 'Teferi, Temporal Archmage', text: 'You may activate loyalty abilities of planeswalkers you control on any player’s turn any time you could cast an instant.' },
  { label: 'Narset', name: 'Narset Emblem', sourceName: 'Narset Transcendent', text: 'Your opponents can’t cast noncreature spells.' }
];

const clampRingTemptationLevel = (value) => clamp(Number.parseInt(value, 10) || 0, 0, 4);
const normalizeManaAmount = (value) => Math.max(0, Number.parseInt(value, 10) || 0);
const getPlayerManaPool = (player = {}) => {
  const manaPool = player?.manaPool && typeof player.manaPool === 'object' ? player.manaPool : {};
  return MANA_COLORS.reduce((pool, color) => ({ ...pool, [color]: normalizeManaAmount(manaPool[color]) }), {});
};
const clearManaPool = () => ({ ...DEFAULT_MANA_POOL });
const hasFloatingMana = (player = {}) => Object.values(getPlayerManaPool(player)).some((amount) => amount > 0);
const getManaPoolSummary = (player = {}, { includeZeroes = false } = {}) => {
  const manaPool = getPlayerManaPool(player);
  const entries = MANA_COLORS
    .filter((color) => includeZeroes || manaPool[color] > 0)
    .map((color) => `${color}${manaPool[color]}`);
  return entries.length > 0 ? entries.join(' ') : 'Empty';
};

const sanitizeCustomPlayerStatusText = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CUSTOM_PLAYER_STATUS_LENGTH);
const sanitizeEmblemName = (name) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYER_EMBLEM_NAME_LENGTH);
const sanitizeEmblemSourceName = (sourceName) => String(sourceName || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYER_EMBLEM_SOURCE_LENGTH);
const sanitizeEmblemText = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYER_EMBLEM_TEXT_LENGTH);
const sanitizeDeckExtraText = (text, maxLength = 900) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
const normalizeDeckExtraKeyText = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const getDeckExtraDedupKey = (template = {}) => template.id ? `id:${template.id}` : `name:${normalizeDeckExtraKeyText(template.name)}|type:${normalizeDeckExtraKeyText(template.typeLine)}`;
const getDeckExtraCap = (kind) => ({ tokens: MAX_DECK_EXTRA_TOKENS, emblems: MAX_DECK_EXTRA_EMBLEMS, dungeons: MAX_DECK_EXTRA_DUNGEONS }[kind] || 0);
const getEmptyDeckExtras = () => ({ tokens: [], emblems: [], dungeons: [] });
const getPlayerDeckExtras = (player = {}) => {
  const extras = player?.deckExtras && typeof player.deckExtras === 'object' ? player.deckExtras : {};
  return {
    tokens: Array.isArray(extras.tokens) ? extras.tokens.map((template) => sanitizeDeckExtraTemplate(template, 'tokens')).filter(Boolean).slice(0, MAX_DECK_EXTRA_TOKENS) : [],
    emblems: Array.isArray(extras.emblems) ? extras.emblems.map((template) => sanitizeDeckExtraTemplate(template, 'emblems')).filter(Boolean).slice(0, MAX_DECK_EXTRA_EMBLEMS) : [],
    dungeons: Array.isArray(extras.dungeons) ? extras.dungeons.map((template) => sanitizeDeckExtraTemplate(template, 'dungeons')).filter(Boolean).slice(0, MAX_DECK_EXTRA_DUNGEONS) : []
  };
};

const getDeckExtraOracleText = (card = {}) => {
  if (typeof card.oracle_text === 'string' && card.oracle_text.trim()) return card.oracle_text;
  if (!Array.isArray(card.card_faces)) return '';
  return card.card_faces
    .map((face) => [face?.name, face?.oracle_text].filter(Boolean).join(': '))
    .filter(Boolean)
    .join(' // ');
};

const sanitizeDeckExtraSourceCards = (sourceCards = []) => (Array.isArray(sourceCards) ? sourceCards : [sourceCards])
  .map((name) => sanitizeDeckExtraText(name, 80))
  .filter(Boolean)
  .filter((name, index, names) => names.indexOf(name) === index)
  .slice(0, MAX_DECK_EXTRA_SOURCE_CARDS);

const sanitizeDeckExtraTemplate = (template = {}, kind = 'tokens') => {
  if (!template || typeof template !== 'object') return null;
  const name = sanitizeDeckExtraText(template.name, 80);
  const typeLine = sanitizeDeckExtraText(template.typeLine || template.type_line, 120);
  if (!name || !typeLine) return null;
  const compact = {
    ...(template.id ? { id: String(template.id).slice(0, 80) } : {}),
    name,
    typeLine,
    ...(sanitizeDeckExtraText(template.oracleText || template.oracle_text, kind === 'tokens' ? 500 : 900) ? { oracleText: sanitizeDeckExtraText(template.oracleText || template.oracle_text, kind === 'tokens' ? 500 : 900) } : {}),
    ...(template.imageUrl || template.image_uri ? { imageUrl: String(template.imageUrl || template.image_uri).slice(0, 300) } : {}),
    sourceCards: sanitizeDeckExtraSourceCards(template.sourceCards)
  };
  if (kind === 'tokens') {
    const colorIdentity = Array.isArray(template.colorIdentity || template.color_identity) ? (template.colorIdentity || template.color_identity).filter((symbol) => MANA_COLORS.includes(symbol)).slice(0, 5) : [];
    return {
      ...compact,
      ...(template.power !== undefined ? { power: String(template.power).slice(0, 12) } : {}),
      ...(template.toughness !== undefined ? { toughness: String(template.toughness).slice(0, 12) } : {}),
      colors: Array.isArray(template.colors) ? template.colors.filter((symbol) => MANA_COLORS.includes(symbol)).slice(0, 5) : colorIdentity,
      colorIdentity
    };
  }
  return compact;
};

const mergeDeckExtraLists = (existing = [], incoming = [], kind = 'tokens') => {
  const merged = new Map();
  [...existing, ...incoming].forEach((template) => {
    const compact = sanitizeDeckExtraTemplate(template, kind);
    if (!compact) return;
    const key = getDeckExtraDedupKey(compact);
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, compact);
      return;
    }
    merged.set(key, {
      ...previous,
      ...Object.fromEntries(Object.entries(compact).filter(([, value]) => value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0))),
      sourceCards: sanitizeDeckExtraSourceCards([...(previous.sourceCards || []), ...(compact.sourceCards || [])])
    });
  });
  return [...merged.values()].slice(0, getDeckExtraCap(kind));
};

const mergePlayerDeckExtras = (existingExtras = getEmptyDeckExtras(), incomingExtras = getEmptyDeckExtras()) => ({
  tokens: mergeDeckExtraLists(existingExtras.tokens, incomingExtras.tokens, 'tokens'),
  emblems: mergeDeckExtraLists(existingExtras.emblems, incomingExtras.emblems, 'emblems'),
  dungeons: mergeDeckExtraLists(existingExtras.dungeons, incomingExtras.dungeons, 'dungeons')
});

const getPlayerEmblems = (player = {}) => (Array.isArray(player?.emblems) ? player.emblems : [])
  .filter((emblem) => emblem && typeof emblem === 'object')
  .map((emblem) => ({
    id: String(emblem.id || ''),
    name: sanitizeEmblemName(emblem.name) || 'Emblem',
    text: sanitizeEmblemText(emblem.text),
    sourceName: sanitizeEmblemSourceName(emblem.sourceName),
    createdAt: Number(emblem.createdAt) || 0,
    createdBy: emblem.createdBy || null
  }))
  .filter((emblem) => emblem.id && (emblem.name || emblem.text || emblem.sourceName))
  .slice(0, MAX_PLAYER_EMBLEMS);

const buildPlayerEmblem = ({ name, text, sourceName, createdBy }) => ({
  id: `${Date.now()}-${generateCardId()}`,
  name: sanitizeEmblemName(name) || 'Custom Emblem',
  text: sanitizeEmblemText(text),
  ...(sanitizeEmblemSourceName(sourceName) ? { sourceName: sanitizeEmblemSourceName(sourceName) } : {}),
  createdAt: Date.now(),
  createdBy: createdBy || null
});

const getPlayerEmblemBadgeLabel = (player = {}) => {
  const emblems = getPlayerEmblems(player);
  if (emblems.length === 0) return null;
  if (emblems.length === 1) return `Emblem: ${emblems[0].name.replace(/\s+Emblem$/i, '')}`;
  return `Emblems ${emblems.length}`;
};

const getPlayerStatuses = (player = {}) => {
  const statuses = player?.statuses && typeof player.statuses === 'object' ? player.statuses : {};
  return {
    monarch: Boolean(statuses.monarch),
    initiative: Boolean(statuses.initiative),
    citysBlessing: Boolean(statuses.citysBlessing),
    ringBearerLevel: clampRingTemptationLevel(statuses.ringBearerLevel),
    custom: Array.isArray(statuses.custom)
      ? statuses.custom.map(sanitizeCustomPlayerStatusText).filter(Boolean).slice(0, MAX_CUSTOM_PLAYER_STATUSES)
      : []
  };
};

const getPlayerStatusBadges = (player = {}) => {
  const statuses = getPlayerStatuses(player);
  const badges = [];
  if (statuses.monarch) badges.push({ key: 'monarch', label: PLAYER_STATUS_LABELS.monarch, style: PLAYER_STATUS_BADGE_STYLES.monarch });
  if (statuses.initiative) badges.push({ key: 'initiative', label: PLAYER_STATUS_LABELS.initiative, style: PLAYER_STATUS_BADGE_STYLES.initiative });
  if (statuses.citysBlessing) badges.push({ key: 'citysBlessing', label: PLAYER_STATUS_LABELS.citysBlessing, style: PLAYER_STATUS_BADGE_STYLES.citysBlessing });
  if (statuses.ringBearerLevel > 0) badges.push({ key: 'ring', label: `Ring ${statuses.ringBearerLevel}`, style: PLAYER_STATUS_BADGE_STYLES.ring });
  statuses.custom.forEach((text, index) => badges.push({ key: `custom-${index}-${text}`, label: text, style: PLAYER_STATUS_BADGE_STYLES.custom, customIndex: index }));
  return badges;
};

const getDayNightValue = (game = {}) => (game?.dayNight === 'day' || game?.dayNight === 'night' ? game.dayNight : null);

const REMINDER_EXPIRATION = {
  CLEANUP: 'cleanup',
  MANUAL: 'manual'
};

const REMINDER_PRESETS = [
  { label: '+1/+1 until EOT', expires: REMINDER_EXPIRATION.CLEANUP },
  { label: '+2/+2 until EOT', expires: REMINDER_EXPIRATION.CLEANUP },
  { label: '+3/+3 until EOT', expires: REMINDER_EXPIRATION.CLEANUP },
  { label: 'Flying until EOT', expires: REMINDER_EXPIRATION.CLEANUP },
  { label: "Can’t block", expires: REMINDER_EXPIRATION.CLEANUP },
  { label: 'Must attack', expires: REMINDER_EXPIRATION.CLEANUP },
  { label: "Doesn’t untap", expires: REMINDER_EXPIRATION.MANUAL },
  { label: 'Sacrifice at end step', expires: REMINDER_EXPIRATION.CLEANUP },
  { label: 'Return later', expires: REMINDER_EXPIRATION.MANUAL }
];

const PHASES = [
  { id: 'untap', label: 'Untap' },
  { id: 'upkeep', label: 'Upkeep' },
  { id: 'draw', label: 'Draw' },
  { id: 'main1', label: 'Main 1' },
  { id: 'combat_begin', label: 'Begin Combat' },
  { id: 'combat_attackers', label: 'Attackers' },
  { id: 'combat_blockers', label: 'Blockers' },
  { id: 'combat_damage', label: 'Damage' },
  { id: 'combat_end', label: 'End Combat' },
  { id: 'main2', label: 'Main 2' },
  { id: 'end', label: 'End Step' },
  { id: 'cleanup', label: 'Cleanup' }
];

const COMBAT_DAMAGE_STEPS = {
  FIRST_STRIKE: 'firstStrike',
  REGULAR: 'regular'
};
const COMBAT_DAMAGE_STEP_LABELS = {
  [COMBAT_DAMAGE_STEPS.FIRST_STRIKE]: 'First-strike damage',
  [COMBAT_DAMAGE_STEPS.REGULAR]: 'Regular combat damage'
};

const ZONES = {
  LIBRARY: 'library',
  HAND: 'hand',
  BATTLEFIELD: 'battlefield',
  GRAVEYARD: 'graveyard',
  EXILE: 'exile',
  COMMAND: 'command'
};

const TUTORIAL_DELVER_CARD = {
  name: 'Delver of Secrets // Insectile Aberration',
  mana_cost: '{U}',
  type_line: 'Creature — Human Wizard // Creature — Human Insect',
  oracle_text: 'At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.',
  layout: 'transform',
  colors: ['U'],
  color_identity: ['U'],
  power: '1',
  toughness: '1',
  card_faces: [
    {
      name: 'Delver of Secrets',
      mana_cost: '{U}',
      type_line: 'Creature — Human Wizard',
      oracle_text: 'At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.',
      colors: ['U'],
      power: '1',
      toughness: '1',
      image_uris: { normal: 'https://cards.scryfall.io/normal/front/7/9/79c24d7c-5c4b-4989-b25f-b168e5dfd861.jpg' }
    },
    {
      name: 'Insectile Aberration',
      type_line: 'Creature — Human Insect',
      oracle_text: 'Flying',
      colors: ['U'],
      color_indicator: ['U'],
      power: '3',
      toughness: '2',
      image_uris: { normal: 'https://cards.scryfall.io/normal/back/7/9/79c24d7c-5c4b-4989-b25f-b168e5dfd861.jpg' }
    }
  ],
  activeFaceIndex: 0
};

const TUTORIAL_STARTER_CARD_SEED = [
  { name: 'Mountain', type_line: 'Basic Land — Mountain', oracle_text: '({T}: Add {R}.)', color_identity: ['R'] },
  { name: 'Lightning Bolt', mana_cost: '{R}', type_line: 'Instant', oracle_text: 'Lightning Bolt deals 3 damage to any target.', colors: ['R'], color_identity: ['R'] },
  { name: 'Reverberate', mana_cost: '{R}{R}', type_line: 'Instant', oracle_text: 'Copy target instant or sorcery spell. You may choose new targets for the copy.', colors: ['R'], color_identity: ['R'] },
  TUTORIAL_DELVER_CARD,
  { name: 'Island', type_line: 'Basic Land — Island', oracle_text: '({T}: Add {U}.)', color_identity: ['U'] },
  { name: 'Llanowar Elves', mana_cost: '{G}', type_line: 'Creature — Elf Druid', oracle_text: '{T}: Add {G}.', colors: ['G'], color_identity: ['G'], power: '1', toughness: '1' },
  { name: 'Dragon Fodder', mana_cost: '{1}{R}', type_line: 'Sorcery', oracle_text: 'Create two 1/1 red Goblin creature tokens.', colors: ['R'], color_identity: ['R'] },
  { name: 'Forest', type_line: 'Basic Land — Forest', oracle_text: '({T}: Add {G}.)', color_identity: ['G'] },
  { name: 'Ponder', mana_cost: '{U}', type_line: 'Sorcery', oracle_text: 'Look at the top three cards of your library, then put them back in any order. You may shuffle. Draw a card.', colors: ['U'], color_identity: ['U'] },
  { name: 'Giant Growth', mana_cost: '{G}', type_line: 'Instant', oracle_text: 'Target creature gets +3/+3 until end of turn.', colors: ['G'], color_identity: ['G'] },
  { name: 'Slip Out the Back', mana_cost: '{U}', type_line: 'Instant', oracle_text: 'Put a +1/+1 counter on target creature. It phases out.', colors: ['U'], color_identity: ['U'] },
  { name: 'Young Pyromancer', mana_cost: '{1}{R}', type_line: 'Creature — Human Shaman', oracle_text: 'Whenever you cast an instant or sorcery spell, create a 1/1 red Elemental creature token.', colors: ['R'], color_identity: ['R'], power: '2', toughness: '1' },
  { name: 'Rancor', mana_cost: '{G}', type_line: 'Enchantment — Aura', oracle_text: 'Enchant creature. Enchanted creature gets +2/+0 and has trample.', colors: ['G'], color_identity: ['G'] },
  { name: 'Curse of the Pierced Heart', mana_cost: '{1}{R}', type_line: 'Enchantment — Aura Curse', oracle_text: 'Enchant player. At the beginning of enchanted player’s upkeep, Curse of the Pierced Heart deals 1 damage to that player.', colors: ['R'], color_identity: ['R'] },
  { name: 'Act of Treason', mana_cost: '{2}{R}', type_line: 'Sorcery', oracle_text: 'Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn.', colors: ['R'], color_identity: ['R'] },
  { name: 'Clone', mana_cost: '{3}{U}', type_line: 'Creature — Shapeshifter', oracle_text: 'You may have Clone enter as a copy of any creature on the battlefield.', colors: ['U'], color_identity: ['U'], power: '0', toughness: '0' },
  { name: 'Portent', mana_cost: '{U}', type_line: 'Sorcery', oracle_text: 'Look at the top three cards of target player’s library, then put them back in any order. That player shuffles. Draw a card at the beginning of the next turn’s upkeep.', colors: ['U'], color_identity: ['U'] },
  { name: 'Nicol Bolas, Planeswalker', mana_cost: '{4}{U}{B}{B}{R}', type_line: 'Legendary Planeswalker — Bolas', oracle_text: '+3: Destroy target noncreature permanent. −2: Gain control of target creature. −9: Nicol Bolas, Planeswalker deals 7 damage to target player. That player discards seven cards, then sacrifices seven permanents.', colors: ['U', 'B', 'R'], color_identity: ['U', 'B', 'R'], loyalty: '5' },
  { name: 'Negate', mana_cost: '{1}{U}', type_line: 'Instant', oracle_text: 'Counter target noncreature spell.', colors: ['U'], color_identity: ['U'] },
  { name: 'Doom Blade', mana_cost: '{1}{B}', type_line: 'Instant', oracle_text: 'Destroy target nonblack creature.', colors: ['B'], color_identity: ['B'] },
  { name: 'Zombie Token', type_line: 'Token Creature — Zombie', oracle_text: '', colors: ['B'], color_identity: ['B'], power: '2', toughness: '2' }
];

const buildTutorialStarterCards = (playerId) => TUTORIAL_STARTER_CARD_SEED.map((card, index) => sanitizeScryfallCardForGame(card, {
  id: `tutorial-seed-${card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  instanceId: generateCardId(),
  ownerId: playerId,
  controllerId: playerId,
  zone: index < 7 ? ZONES.HAND : ZONES.LIBRARY,
  tapped: false,
  counters: {},
  tempDamage: 0,
  faceDown: false,
  x: 5 + (index * 5),
  y: 5
}));

const hydrateTutorialCardPreviewData = (card = {}) => {
  const seed = TUTORIAL_STARTER_CARD_SEED.find((candidate) => candidate.name === card.name || candidate.card_faces?.some((face) => face?.name === card.name || card.card_faces?.some((cardFace) => cardFace?.name === face?.name)));
  if (!seed) return card;
  const hydrated = sanitizeScryfallCardForGame({ ...seed, ...card, card_faces: seed.card_faces || card.card_faces }, card);
  return {
    ...card,
    ...hydrated,
    instanceId: card.instanceId,
    ownerId: card.ownerId,
    controllerId: card.controllerId,
    zone: card.zone,
    activeFaceIndex: Number.isInteger(card.activeFaceIndex) ? card.activeFaceIndex : hydrated.activeFaceIndex
  };
};

const shouldSeedTutorialCardsForPlayer = (cards = [], playerId) => !cards.some((card) => card?.ownerId === playerId && [
  ZONES.LIBRARY,
  ZONES.HAND,
  ZONES.BATTLEFIELD,
  ZONES.GRAVEYARD,
  ZONES.EXILE,
  ZONES.COMMAND
].includes(card?.zone));



const getPhaseLabel = (phaseId) => PHASES.find((phase) => phase.id === phaseId)?.label || phaseId || 'Unknown step';

const CLEANUP_OLD_GAME_DAYS = 7;
const CLEANUP_OLD_GAME_MS = CLEANUP_OLD_GAME_DAYS * 24 * 60 * 60 * 1000;

const toDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const formatCleanupDate = (value) => {
  const date = toDateValue(value);
  return date ? date.toLocaleString() : '—';
};

const isCleanupCandidateOld = (game) => {
  const activityDate = toDateValue(game?.updatedAt) || toDateValue(game?.createdAt);
  if (!activityDate) return false;
  return Date.now() - activityDate.getTime() > CLEANUP_OLD_GAME_MS;
};

const CLEANUP_DELETE_STEPS = {
  VERIFY_AUTH: 'Step A: verify current user is signed in',
  READ_GAME: 'Step B: read the game doc',
  VERIFY_HOST: 'Step C: verify game.hostId === currentUser.uid',
  DELETE_EVENTS: 'Step D: delete events subcollection docs in safe batches',
  DELETE_GAME: 'Step E: delete the game document itself',
  CONFIRM_DELETE: 'Step F: confirm the game document no longer exists'
};

const getErrorCode = (error) => error?.details?.code || error?.code || 'unknown';
const getErrorName = (error) => error?.details?.name || error?.name || 'Error';
const getErrorMessage = (error) => error?.details?.message || error?.message || 'Unknown error';
const getErrorStep = (error, fallbackStep = 'unknown step') => error?.details?.step || error?.step || fallbackStep;

const formatCleanupDeleteError = (gameId, error, fallbackStep = 'unknown step') => (
  `Failed to delete ${gameId} during ${getErrorStep(error, fallbackStep)}: ${getErrorCode(error)} — ${getErrorMessage(error)}`
);

const logCleanupDeleteError = (gameId, step, error) => {
  console.error('Old Game Cleanup delete failed', {
    gameId,
    step,
    error,
    code: getErrorCode(error),
    detailsCode: error?.details?.code,
    name: getErrorName(error),
    detailsName: error?.details?.name,
    message: getErrorMessage(error),
    detailsMessage: error?.details?.message
  });
};

const CLEANUP_DELETE_BATCH_SIZE = 450;

const throwCleanupError = (message, code, step) => {
  const error = new Error(message);
  error.code = code;
  error.step = step;
  throw error;
};

const deleteEventsSubcollectionInBatches = async (gameId) => {
  const eventsRef = collection(db, 'games_v3', gameId, 'events');
  let deletedEvents = 0;

  while (true) {
    const eventsSnapshot = await getDocs(query(eventsRef, limit(CLEANUP_DELETE_BATCH_SIZE)));
    if (eventsSnapshot.empty) return deletedEvents;

    const batch = writeBatch(db);
    eventsSnapshot.docs.forEach((eventDoc) => batch.delete(eventDoc.ref));
    await batch.commit();
    deletedEvents += eventsSnapshot.size;
  }
};

const hardDeleteGamePermanently = async ({ user, gameId, removeCurrentUserMembership = false }) => {
  if (!user || !gameId) {
    throwCleanupError('Authentication is required.', 'unauthenticated', CLEANUP_DELETE_STEPS.VERIFY_AUTH);
  }

  const gameRef = doc(db, 'games_v3', gameId);
  let gameSnap;
  try {
    gameSnap = await getDoc(gameRef);
  } catch (error) {
    error.step = CLEANUP_DELETE_STEPS.READ_GAME;
    throw error;
  }
  if (!gameSnap.exists()) {
    throwCleanupError('Game not found in Firebase.', 'not-found', CLEANUP_DELETE_STEPS.READ_GAME);
  }

  const gameData = gameSnap.data() || {};
  if (gameData.hostId !== user.uid) {
    throwCleanupError('Only the host can delete this game.', 'permission-denied', CLEANUP_DELETE_STEPS.VERIFY_HOST);
  }

  let deletedEvents = 0;
  try {
    deletedEvents = await deleteEventsSubcollectionInBatches(gameId);
  } catch (error) {
    error.step = CLEANUP_DELETE_STEPS.DELETE_EVENTS;
    throw error;
  }

  try {
    const deleteGameBatch = writeBatch(db);
    deleteGameBatch.delete(gameRef);
    if (removeCurrentUserMembership) {
      deleteGameBatch.delete(doc(db, 'users', user.uid, 'games', gameId));
    }
    await deleteGameBatch.commit();
  } catch (error) {
    error.step = CLEANUP_DELETE_STEPS.DELETE_GAME;
    throw error;
  }

  try {
    const confirmSnap = await getDoc(gameRef);
    if (confirmSnap.exists()) {
      throwCleanupError('Game still exists after delete.', 'internal', CLEANUP_DELETE_STEPS.CONFIRM_DELETE);
    }
  } catch (error) {
    error.step = error.step || CLEANUP_DELETE_STEPS.CONFIRM_DELETE;
    throw error;
  }

  return { deletedEvents };
};

const ZONE_LABELS = {
  [ZONES.LIBRARY]: 'library',
  [ZONES.HAND]: 'hand',
  [ZONES.BATTLEFIELD]: 'battlefield',
  [ZONES.GRAVEYARD]: 'graveyard',
  [ZONES.EXILE]: 'exile',
  [ZONES.COMMAND]: 'command zone',
  stack_zone: 'stack'
};

const PUBLIC_ZONES = new Set([ZONES.BATTLEFIELD, ZONES.GRAVEYARD, ZONES.EXILE, ZONES.COMMAND, 'stack_zone']);

const TOKEN_COLOR_SYMBOLS = [
  { symbol: 'W', name: 'White', chip: 'bg-amber-100 text-slate-950 border-amber-300' },
  { symbol: 'U', name: 'Blue', chip: 'bg-sky-500 text-white border-sky-200' },
  { symbol: 'B', name: 'Black', chip: 'bg-zinc-900 text-white border-zinc-400' },
  { symbol: 'R', name: 'Red', chip: 'bg-red-600 text-white border-red-200' },
  { symbol: 'G', name: 'Green', chip: 'bg-green-600 text-white border-green-200' }
];
const TOKEN_COLOR_NAMES = Object.fromEntries(TOKEN_COLOR_SYMBOLS.map(({ symbol, name }) => [symbol, name]));
const TOKEN_COLOR_NAME_TO_SYMBOL = Object.fromEntries(TOKEN_COLOR_SYMBOLS.map(({ symbol, name }) => [name.toLowerCase(), symbol]));

const TOKEN_COLOR_ACCENTS = {
  white: {
    frame: 'from-amber-100 via-stone-100 to-yellow-200 border-amber-300/80 text-slate-950',
    band: 'bg-amber-200/80 text-slate-900 border-amber-500/40',
    pip: 'bg-amber-200 border-amber-400'
  },
  blue: {
    frame: 'from-sky-950 via-sky-800 to-blue-950 border-sky-300/70 text-sky-50',
    band: 'bg-sky-900/85 text-sky-50 border-sky-300/40',
    pip: 'bg-sky-400 border-sky-100'
  },
  black: {
    frame: 'from-zinc-950 via-slate-900 to-neutral-950 border-zinc-400/70 text-zinc-50',
    band: 'bg-black/80 text-zinc-50 border-zinc-300/40',
    pip: 'bg-zinc-700 border-zinc-300'
  },
  red: {
    frame: 'from-red-950 via-rose-900 to-orange-950 border-red-300/70 text-red-50',
    band: 'bg-red-950/85 text-red-50 border-red-300/40',
    pip: 'bg-red-500 border-red-100'
  },
  green: {
    frame: 'from-emerald-950 via-green-900 to-lime-950 border-green-300/70 text-green-50',
    band: 'bg-green-950/85 text-green-50 border-green-300/40',
    pip: 'bg-green-500 border-green-100'
  },
  multicolor: {
    frame: 'from-slate-900 via-amber-800 to-slate-900 border-amber-200/80 text-amber-50',
    band: 'bg-amber-950/85 text-amber-50 border-amber-200/50',
    pip: 'bg-gradient-to-br from-amber-200 via-sky-300 to-green-400 border-amber-100'
  },
  fiveColor: {
    frame: 'from-amber-100 via-sky-700 to-rose-900 border-yellow-200/80 text-white',
    band: 'bg-slate-950/80 text-white border-yellow-200/50',
    pip: 'bg-gradient-to-br from-amber-200 via-sky-300 via-red-400 to-green-400 border-white'
  },
  gold: {
    frame: 'from-yellow-900 via-amber-700 to-orange-900 border-yellow-200/80 text-yellow-50',
    band: 'bg-yellow-900/85 text-yellow-50 border-yellow-200/50',
    pip: 'bg-yellow-400 border-yellow-100'
  },
  colorless: {
    frame: 'from-slate-800 via-slate-700 to-slate-900 border-slate-300/60 text-slate-50',
    band: 'bg-slate-900/80 text-slate-50 border-slate-300/30',
    pip: 'bg-slate-400 border-slate-100'
  }
};

const TOKEN_PRESETS = [
  { id: 'treasure', label: 'Treasure', name: 'Treasure', color: 'Colorless', typeLine: 'Token Artifact — Treasure', power: '', toughness: '', quantity: 1, tapped: false },
  { id: 'food', label: 'Food', name: 'Food', color: 'Colorless', typeLine: 'Token Artifact — Food', power: '', toughness: '', quantity: 1, tapped: false },
  { id: 'clue', label: 'Clue', name: 'Clue', color: 'Colorless', typeLine: 'Token Artifact — Clue', power: '', toughness: '', quantity: 1, tapped: false },
  { id: 'soldier', label: '1/1 Soldier', name: 'Soldier', color: 'White', typeLine: 'Token Creature — Soldier', power: '1', toughness: '1', quantity: 1, tapped: false },
  { id: 'saproling', label: '1/1 Saproling', name: 'Saproling', color: 'Green', typeLine: 'Token Creature — Saproling', power: '1', toughness: '1', quantity: 1, tapped: false },
  { id: 'zombie', label: '2/2 Zombie', name: 'Zombie', color: 'Black', typeLine: 'Token Creature — Zombie', power: '2', toughness: '2', quantity: 1, tapped: false },
  { id: 'spirit', label: '1/1 Spirit flying', name: 'Spirit', color: 'White', typeLine: 'Token Creature — Spirit', power: '1', toughness: '1', quantity: 1, tapped: false, rulesText: 'Flying' }
];

const getDefaultCustomToken = () => ({
  name: 'Saproling',
  color: 'Green',
  colorIdentity: ['G'],
  typeLine: 'Token Creature — Saproling',
  power: '1',
  toughness: '1',
  rulesText: '',
  quantity: 1,
  tapped: false
});

const normalizeTokenColorKey = (color) => String(color || 'Colorless').trim().toLowerCase() || 'colorless';
const normalizeTokenColorIdentity = (colorIdentity, color = 'Colorless') => {
  if (Array.isArray(colorIdentity)) {
    return TOKEN_COLOR_SYMBOLS.map(({ symbol }) => symbol).filter((symbol) => colorIdentity.includes(symbol));
  }
  const colorText = String(color || 'Colorless').trim();
  const key = normalizeTokenColorKey(colorText);
  if (!colorText || key === 'colorless') return [];
  if (key === 'five-color' || key === 'five color' || key === 'fivecolor') return TOKEN_COLOR_SYMBOLS.map(({ symbol }) => symbol);
  if (key === 'gold' || key === 'multicolor' || key === 'multicolor / gold') return ['W', 'U'];
  return colorText.split(/[\s,/-]+/).map((part) => TOKEN_COLOR_NAME_TO_SYMBOL[part.toLowerCase()]).filter(Boolean);
};
const getTokenColorLabel = (colorIdentity, color = 'Colorless') => {
  const symbols = normalizeTokenColorIdentity(colorIdentity, color);
  if (symbols.length === 0) return 'Colorless';
  if (symbols.length === TOKEN_COLOR_SYMBOLS.length) return 'Five-color';
  return symbols.map((symbol) => TOKEN_COLOR_NAMES[symbol]).join('-');
};
const getTokenColorAccent = (color, colorIdentity) => {
  const symbols = normalizeTokenColorIdentity(colorIdentity, color);
  if (symbols.length === 0) return TOKEN_COLOR_ACCENTS.colorless;
  if (symbols.length === TOKEN_COLOR_SYMBOLS.length) return TOKEN_COLOR_ACCENTS.fiveColor;
  if (symbols.length > 1) return TOKEN_COLOR_ACCENTS.multicolor;
  return TOKEN_COLOR_ACCENTS[normalizeTokenColorKey(TOKEN_COLOR_NAMES[symbols[0]])] || TOKEN_COLOR_ACCENTS.colorless;
};
const isCreatureTypeLine = (typeLine) => String(typeLine || '').toLowerCase().includes('creature');
const getZoneLabel = (zone) => ZONE_LABELS[zone] || zone || 'unknown zone';
const isPublicZone = (zone) => PUBLIC_ZONES.has(zone);

const getUsableCardFaces = (card) => {
  if (!Array.isArray(card?.card_faces)) return [];
  const faces = card.card_faces.filter((face) => face && typeof face === 'object' && (
    face.name || face.type_line || face.oracle_text || face.image_uris?.normal || face.image_uris?.large || face.mana_cost
  ));
  return faces.length >= 2 ? faces : [];
};

const isDoubleFacedCard = (card) => getUsableCardFaces(card).length >= 2;

const getActiveFaceIndex = (card) => {
  const faces = getUsableCardFaces(card);
  if (faces.length < 2) return 0;
  const index = Number.isInteger(card?.activeFaceIndex) ? card.activeFaceIndex : 0;
  return Math.min(Math.max(index, 0), faces.length - 1);
};

const getActiveCardFace = (card) => {
  const faces = getUsableCardFaces(card);
  return faces.length >= 2 ? faces[getActiveFaceIndex(card)] : null;
};

const getCardFaceAt = (card, index) => {
  const faces = getUsableCardFaces(card);
  if (faces.length < 2) return null;
  const safeIndex = Math.min(Math.max(Number.isInteger(index) ? index : 0, 0), faces.length - 1);
  return faces[safeIndex] || null;
};

const getCardDisplayName = (card, fallback = 'Unknown') => getActiveCardFace(card)?.name || card?.name || fallback;
const getCardTypeLine = (card, fallback = '') => getActiveCardFace(card)?.type_line || card?.type_line || fallback;
const getCardManaCost = (card, fallback = '') => getActiveCardFace(card)?.mana_cost || card?.mana_cost || fallback;
const getCardOracleText = (card, fallback = '') => getActiveCardFace(card)?.oracle_text || card?.oracle_text || card?.rulesText || fallback;
const getCardPower = (card, fallback = '') => getActiveCardFace(card)?.power || card?.power || fallback;
const getCardToughness = (card, fallback = '') => getActiveCardFace(card)?.toughness || card?.toughness || fallback;
const getBestImageUriFromImageUris = (imageUris) => {
  if (!imageUris || typeof imageUris !== 'object') return null;
  return imageUris.normal || imageUris.large || imageUris.png || imageUris.small || null;
};
const getCardImageUri = (card) => {
  const faceImageUri = getBestImageUriFromImageUris(getActiveCardFace(card)?.image_uris);
  if (faceImageUri) return faceImageUri;
  return getBestImageUriFromImageUris(card?.image_uris) || card?.image_uri || null;
};

const isDebugActionsEnabled = () => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    return params.get('debugActions') === '1' || window.localStorage?.getItem('debugActions') === '1';
  } catch {
    return false;
  }
};

const persistPerfActionsFromUrl = () => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('perfActions') !== '1') return false;
    window.localStorage.setItem('perfActions', '1');
    return true;
  } catch {
    return false;
  }
};

const isPerfActionsEnabled = () => {
  if (typeof window === 'undefined') return false;
  try {
    return persistPerfActionsFromUrl() || window.localStorage?.getItem('perfActions') === '1';
  } catch {
    return false;
  }
};

persistPerfActionsFromUrl();

const disablePerfActions = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem('perfActions');
    const url = new URL(window.location.href);
    url.searchParams.delete('perfActions');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Best-effort debug toggle only.
  }
  perfActionsStore.state = createEmptyPerfState();
  perfActionsStore.activeActionId = null;
  perfActionsStore.lastWriteDoneActionId = null;
  perfActionsStore.lastWriteDonePerfNow = null;
  perfActionsStore.lastSnapshotPerfNow = null;
  perfActionsStore.lastVisibleSignature = null;
  emitPerfActionsState();
};

const getActionPerfNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
const getActionPerfWallNow = () => Date.now();
const roundPerfMs = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null);
const PERF_ACTION_LIMIT = 8;
const PERF_SLOW_LIMITS = { clickToHandler: 250, normalization: 200, undo: 200, firestore: 2000, snapshot: 2000, render: 250 };
const IMPORTANT_PERF_ACTIONS = new Set([
  'CAST_SPELL',
  'PLAY_LAND',
  'MOVE_ZONE',
  'RESOLVE_STACK_TOP',
  'COUNTER_STACK_TOP',
  'COPY_STACK_ITEM',
  'TOGGLE_FACE',
  'SWITCH_CARD_FACE',
  'TAP_TOGGLE',
  'PHASE_TOGGLE',
  'ADD_CARD_REMINDER',
  'REMOVE_CARD_REMINDER',
  'ADD_PLAYER_EMBLEM',
  'REMOVE_PLAYER_EMBLEM',
  'DRAW_CARD',
  'BATCH_DRAW_LIBRARY',
  'BATCH_MILL_LIBRARY',
  'BATCH_REVEAL_LIBRARY',
  'BATCH_EXILE_LIBRARY',
  'BATCH_SCRY_LIBRARY',
  'BATCH_SURVEIL_LIBRARY',
  'PASS',
  'PASS_PRIORITY',
  'UNDO_LAST_ACTION'
]);

const createEmptyPerfState = () => ({
  enabled: false,
  actions: [],
  activeActionId: null,
  pendingClicks: [],
  lastSnapshot: null,
  lastVisibleUpdate: null,
  listenerEvents: []
});

const perfActionsStore = {
  state: createEmptyPerfState(),
  listeners: new Set(),
  activeActionId: null,
  lastWriteDoneActionId: null,
  lastWriteDonePerfNow: null,
  lastSnapshotPerfNow: null,
  lastVisibleSignature: null,
  listenerInstanceSeq: 0
};

const getPerfActionsState = () => perfActionsStore.state;

const emitPerfActionsState = () => {
  perfActionsStore.listeners.forEach((listener) => listener(perfActionsStore.state));
};

const updatePerfActionsState = (updater) => {
  if (!isPerfActionsEnabled()) return;
  perfActionsStore.state = updater(perfActionsStore.state);
  emitPerfActionsState();
};

const subscribePerfActions = (listener) => {
  perfActionsStore.listeners.add(listener);
  return () => perfActionsStore.listeners.delete(listener);
};

const getPerfActionCardId = (payload = {}) => payload?.cardId || payload?.sourceId || payload?.targetId || payload?.stackItemId || null;

const getPerfActionCardName = (payload = {}, currentGame = null) => {
  if (payload?.cardName) return payload.cardName;
  const cardId = getPerfActionCardId(payload);
  if (!cardId) return null;
  const card = (currentGame?.cards || []).find((candidate) => candidate.instanceId === cardId);
  if (card) return getCardDisplayName(card, card.name || 'Card');
  const stackItem = (currentGame?.stack || []).find((item) => item.id === cardId || item.sourceId === cardId);
  return stackItem?.name || null;
};

const compactPerfPayload = (payload = {}) => {
  if (!payload || typeof payload !== 'object') return {};
  return Object.fromEntries(Object.entries(payload).filter(([key]) => ['cardId', 'sourceId', 'targetId', 'targetZone', 'stackItemId', 'faceIndex', 'clientActionId'].includes(key)));
};

const getPerfGameCounts = (currentGame = {}) => {
  const cards = currentGame?.cards || [];
  const stack = currentGame?.stack || [];
  return {
    stackLength: stack.length,
    cardsLength: cards.length,
    handCount: cards.filter((card) => card.zone === ZONES.HAND).length,
    libraryCount: cards.filter((card) => card.zone === ZONES.LIBRARY).length,
    battlefieldCount: cards.filter((card) => card.zone === ZONES.BATTLEFIELD).length,
    graveyardCount: cards.filter((card) => card.zone === ZONES.GRAVEYARD).length
  };
};

const getPerfExpectedLogType = (actionType) => {
  if (actionType === 'RESOLVE_STACK_TOP') return 'RESOLVE_SPELL';
  if (actionType === 'COUNTER_STACK_TOP') return 'COUNTER_STACK_ITEM';
  if (actionType === 'UNDO_LAST_ACTION') return 'UNDO';
  return actionType;
};

const getPerfActionMarker = ({ actionType, payload = {}, currentGame = null } = {}) => {
  const before = getPerfGameCounts(currentGame);
  const marker = {
    expectedLogType: getPerfExpectedLogType(actionType),
    cardId: getPerfActionCardId(payload),
    stackItemId: payload?.stackItemId || null,
    before
  };
  if (actionType === 'DRAW_CARD') marker.expected = { handCount: before.handCount + 1, libraryCount: Math.max(0, before.libraryCount - 1) };
  if (actionType === 'CAST_SPELL') marker.expected = { stackLength: before.stackLength + 1, cardZone: 'stack_zone' };
  if (actionType === 'PLAY_LAND') marker.expected = { cardZone: ZONES.BATTLEFIELD };
  if (actionType === 'MOVE_ZONE') marker.expected = { cardZone: payload?.targetZone || null };
  if (actionType === 'TAP_TOGGLE') {
    const card = (currentGame?.cards || []).find((candidate) => candidate.instanceId === marker.cardId);
    marker.expected = { tapped: !card?.tapped };
  }
  if (actionType === 'PHASE_TOGGLE') {
    const card = (currentGame?.cards || []).find((candidate) => candidate.instanceId === marker.cardId);
    marker.expected = { phasedOut: !card?.phasedOut };
  }
  if (actionType === 'SWITCH_CARD_FACE') marker.expected = { activeFaceIndex: payload?.faceIndex ?? null };
  if (actionType === 'ADD_CARD_REMINDER') marker.expected = { reminderText: sanitizeReminderText(payload?.text || '') };
  if (actionType === 'REMOVE_CARD_REMINDER') marker.expected = { reminderId: payload?.reminderId || null };
  if (actionType === 'COPY_STACK_ITEM') marker.expected = { stackLength: before.stackLength + 1 };
  if (actionType === 'RESOLVE_STACK_TOP' || actionType === 'COUNTER_STACK_TOP') marker.expected = { stackLength: Math.max(0, before.stackLength - 1) };
  if (actionType === 'UNDO_LAST_ACTION') marker.expected = { undoneActionId: payload?.undoEntryId || null, cardZone: payload?.restoredZone || null };
  return marker;
};

const getPerfSnapshotCounts = (data = {}) => getPerfGameCounts(data);

const getPerfCard = (data = {}, cardId = null) => {
  if (!cardId) return null;
  return (data.cards || []).find((card) => card.instanceId === cardId) || null;
};

const getPerfCardZone = (data = {}, cardId = null) => getPerfCard(data, cardId)?.zone || null;

const getPerfCardZoneDetails = (cards = [], cardId = null) => {
  const card = cardId && Array.isArray(cards) ? cards.find((candidate) => candidate.instanceId === cardId) : null;
  return {
    found: Boolean(card),
    zone: card?.zone || null,
    inHand: card?.zone === ZONES.HAND,
    inBattlefield: card?.zone === ZONES.BATTLEFIELD
  };
};

const buildPerfUndoCardDebug = ({ cardId = null, currentGame = {}, previousState = {}, postActionCards = null, restoredCards = null } = {}) => {
  if (!cardId) return null;
  const before = getPerfCardZoneDetails(currentGame?.cards || [], cardId);
  const previous = getPerfCardZoneDetails(previousState?.cards || [], cardId);
  const debug = {
    cardId,
    zoneBeforeAction: before.zone,
    undoPreviousStateZone: previous.zone,
    previousStateContainsCard: previous.found,
    previousStateCardInHand: previous.inHand,
    previousStateCardInBattlefield: previous.inBattlefield
  };
  if (Array.isArray(postActionCards)) {
    const after = getPerfCardZoneDetails(postActionCards, cardId);
    debug.zoneAfterAction = after.zone;
    debug.afterActionContainsCard = after.found;
  }
  if (Array.isArray(restoredCards)) {
    const restored = getPerfCardZoneDetails(restoredCards, cardId);
    debug.undoRestoredZone = restored.zone;
    debug.restoredContainsCard = restored.found;
    debug.restoredCardInHand = restored.inHand;
    debug.restoredCardInBattlefield = restored.inBattlefield;
  }
  return debug;
};

const getPerfRecentLogs = (data = {}, limit = 8) => (Array.isArray(data.log) ? data.log.slice(-limit).reverse() : []);

const getPerfLatestUndoEntry = (data = {}) => (Array.isArray(data.undoStack) && data.undoStack.length > 0 ? data.undoStack[data.undoStack.length - 1] : null);
const getPerfRecentUndoEntries = (data = {}, limit = 8) => (Array.isArray(data.undoStack) ? data.undoStack.slice(-limit) : []);
const getPerfUndoActionOrder = (data = {}, limit = 5) => getPerfRecentUndoEntries(data, limit).map((entry) => entry?.actionType || 'UNKNOWN').join(' > ');

const getPerfEntryActionId = (entry = {}) => entry?.clientActionId || entry?.perfActionId || entry?.actionId || null;

const perfEntryMatchesAction = (entry = {}, action = {}) => {
  if (!entry || !action) return false;
  const actionId = action.payload?.clientActionId || action.clientActionId || action.id || null;
  const entryActionId = getPerfEntryActionId(entry);
  const actionIdMatches = Boolean(actionId && entryActionId && actionId === entryActionId);
  const typeMatches = !action.actionType || !entry.actionType || entry.actionType === action.actionType;
  const cardMatches = !action.cardId || !entry.cardId || entry.cardId === action.cardId;
  return actionIdMatches || (typeMatches && cardMatches);
};

const perfLogMatchesAction = (log = {}, action = {}, marker = {}) => {
  if (!log || !action?.actionType) return false;
  const actionId = action.payload?.clientActionId || action.clientActionId || action.id || null;
  const logActionId = getPerfEntryActionId(log);
  if (actionId && logActionId && actionId === logActionId) return true;
  const logTimestamp = Number(log?.timestamp || 0);
  const logIsNewEnough = !action.handlerStartWallNow || !logTimestamp || logTimestamp >= action.handlerStartWallNow - 2000;
  const logTypeMatches = log?.type === marker.expectedLogType;
  const cardMatchNotRequired = ['COPY_STACK_ITEM', 'RESOLVE_STACK_TOP', 'COUNTER_STACK_TOP'].includes(action.actionType);
  const logCardMatches = cardMatchNotRequired || !action.cardId || !log?.cardId || log.cardId === action.cardId;
  const stackItemMatches = !marker.stackItemId || !log?.copiedFromStackItemId || log.copiedFromStackItemId === marker.stackItemId;
  return logTypeMatches && logCardMatches && stackItemMatches && logIsNewEnough;
};

const getPerfSnapshotReflection = (action = {}, data = {}, lastLog = null) => {
  if (!action?.actionType || !data) return { reflects: false, reason: 'missing action or snapshot' };
  const marker = action.marker || getPerfActionMarker({ actionType: action.actionType, payload: action.payload, currentGame: null });
  const counts = getPerfSnapshotCounts(data);
  const expected = marker.expected || {};
  const recentLogs = getPerfRecentLogs(data);
  const logsToCheck = recentLogs.length > 0 ? recentLogs : (lastLog ? [lastLog] : []);
  const matchingLog = logsToCheck.find((log) => perfLogMatchesAction(log, action, marker)) || null;
  const logMatches = Boolean(matchingLog);
  const latestUndoEntry = getPerfLatestUndoEntry(data);
  const recentUndoEntries = getPerfRecentUndoEntries(data);
  const latestUndoPendingSync = Boolean(latestUndoEntry?.pendingSync);
  const latestUndoMatches = Boolean(latestUndoEntry && !latestUndoPendingSync && perfEntryMatchesAction(latestUndoEntry, action));
  const recentMatchingUndoEntry = [...recentUndoEntries].reverse().find((entry) => entry && !entry.pendingSync && perfEntryMatchesAction(entry, action)) || null;
  const actualCardZone = getPerfCardZone(data, action.cardId);
  const debug = {
    actionType: action.actionType,
    cardId: action.cardId || null,
    expectedZone: expected.cardZone || null,
    actualZone: actualCardZone,
    latestUndoActionType: latestUndoEntry?.actionType || null,
    latestUndoActionLabel: latestUndoEntry?.actionLabel || null,
    latestUndoPendingSync,
    latestUndoCardId: latestUndoEntry?.cardId || null,
    newestServerUndoActionType: latestUndoEntry?.actionType || null,
    newestServerUndoCardId: latestUndoEntry?.cardId || null,
    latestUndoCardIdMatches: !action.cardId || latestUndoEntry?.cardId === action.cardId,
    latestUndoMatches,
    recentMatchingUndoActionType: recentMatchingUndoEntry?.actionType || null,
    recentMatchingUndoCardId: recentMatchingUndoEntry?.cardId || null,
    recentMatchingUndoIsLatest: Boolean(recentMatchingUndoEntry && latestUndoEntry && recentMatchingUndoEntry.id === latestUndoEntry.id),
    undoStackLength: Array.isArray(data.undoStack) ? data.undoStack.length : null,
    undoStackActionOrder: getPerfUndoActionOrder(data),
    recentLogMatchType: matchingLog?.type || null,
    recentLogMatchMessage: matchingLog?.message || matchingLog?.desc || null
  };

  if (action.actionType === 'PLAY_LAND') {
    const cardInExpectedZone = actualCardZone === expected.cardZone;
    if (cardInExpectedZone && latestUndoMatches) return { reflects: true, reason: 'played card is on battlefield and latest server undo entry matches', debug };
    if (cardInExpectedZone && recentMatchingUndoEntry) return { reflects: true, reason: 'played card is on battlefield and a recent server undo entry matches', debug };
    if (cardInExpectedZone && logMatches) return { reflects: true, reason: 'played card is on battlefield and a recent log entry matches', debug };
    if (!cardInExpectedZone) return { reflects: false, reason: `played card zone is ${actualCardZone || 'missing'}, expected ${expected.cardZone}`, debug };
    if (latestUndoEntry && latestUndoPendingSync) return { reflects: false, reason: 'latest undo entry is still pendingSync', debug };
    if (latestUndoEntry && !latestUndoMatches) return { reflects: false, reason: 'latest undo entry does not match PLAY_LAND/card', debug };
    return { reflects: false, reason: 'no matching server undo entry or recent PLAY_LAND log', debug };
  }

  if (action.actionType === 'DRAW_CARD') {
    return { reflects: logMatches && counts.handCount >= expected.handCount && counts.libraryCount <= expected.libraryCount, reason: logMatches ? 'DRAW_CARD log and counts match' : 'no matching DRAW_CARD log' };
  }
  if (action.actionType === 'MOVE_ZONE') {
    return { reflects: logMatches && (!expected.cardZone || actualCardZone === expected.cardZone || !getPerfCard(data, action.cardId)), reason: logMatches ? 'MOVE_ZONE log and card zone match' : 'no matching MOVE_ZONE log' };
  }
  if (action.actionType === 'TAP_TOGGLE') {
    return { reflects: logMatches && getPerfCard(data, action.cardId)?.tapped === expected.tapped, reason: logMatches ? 'TAP_TOGGLE log and tapped state match' : 'no matching TAP_TOGGLE log' };
  }
  if (action.actionType === 'PHASE_TOGGLE') {
    return { reflects: logMatches && Boolean(getPerfCard(data, action.cardId)?.phasedOut) === expected.phasedOut, reason: logMatches ? 'PHASE_TOGGLE log and phased state match' : 'no matching PHASE_TOGGLE log' };
  }
  if (action.actionType === 'SWITCH_CARD_FACE') {
    return { reflects: logMatches && (expected.activeFaceIndex == null || getPerfCard(data, action.cardId)?.activeFaceIndex === expected.activeFaceIndex), reason: logMatches ? 'SWITCH_CARD_FACE log and face match' : 'no matching SWITCH_CARD_FACE log' };
  }
  if (action.actionType === 'ADD_CARD_REMINDER') {
    const reminders = getEntityReminders(getPerfCard(data, action.cardId));
    return { reflects: logMatches && reminders.some((reminder) => reminder.text === expected.reminderText), reason: logMatches ? 'ADD_CARD_REMINDER log and reminder match' : 'no matching ADD_CARD_REMINDER log' };
  }
  if (action.actionType === 'REMOVE_CARD_REMINDER') {
    const reminders = getEntityReminders(getPerfCard(data, action.cardId));
    return { reflects: logMatches && expected.reminderId && !reminders.some((reminder) => reminder.id === expected.reminderId), reason: logMatches ? 'REMOVE_CARD_REMINDER log and reminder removal match' : 'no matching REMOVE_CARD_REMINDER log' };
  }
  if (action.actionType === 'CAST_SPELL') {
    return { reflects: logMatches && counts.stackLength >= expected.stackLength && (!action.cardId || actualCardZone === expected.cardZone || (data.stack || []).some((item) => item.sourceId === action.cardId)), reason: logMatches ? 'CAST_SPELL log and stack/card state match' : 'no matching CAST_SPELL log' };
  }
  if (action.actionType === 'COPY_STACK_ITEM') {
    return { reflects: logMatches && counts.stackLength >= expected.stackLength, reason: logMatches ? 'COPY_STACK_ITEM log and stack count match' : 'no matching COPY_STACK_ITEM log' };
  }
  if (action.actionType === 'RESOLVE_STACK_TOP' || action.actionType === 'COUNTER_STACK_TOP') {
    return { reflects: logMatches && counts.stackLength <= expected.stackLength, reason: logMatches ? 'stack-top log and stack count match' : 'no matching stack-top log' };
  }
  if (action.actionType === 'UNDO_LAST_ACTION') {
    const cardZoneMatches = !action.cardId || !expected.cardZone || actualCardZone === expected.cardZone;
    return { reflects: logMatches && (!expected.undoneActionId || matchingLog?.undoneActionId === expected.undoneActionId) && cardZoneMatches, reason: logMatches ? 'UNDO log and restored state match' : 'no matching UNDO log' };
  }
  return { reflects: logMatches, reason: logMatches ? 'recent log matches action' : 'no matching recent log' };
};


const recordPerfListenerEvent = (event = {}) => {
  if (!isPerfActionsEnabled()) return;
  const listenerEvent = { ...event, perfNow: getActionPerfNow(), wallNow: getActionPerfWallNow() };
  console.debug('[Perf actions] Firestore listener', listenerEvent);
  updatePerfActionsState((state) => ({
    ...state,
    enabled: true,
    listenerEvents: [listenerEvent, ...(state.listenerEvents || [])].slice(0, 12)
  }));
};

const getPerfWarningsForAction = (action = {}) => {
  const warnings = [];
  if ((action.clickToHandlerMs || 0) > PERF_SLOW_LIMITS.clickToHandler) warnings.push('Click handler delayed');
  if ((action.handlerToFirestoreDoneMs || 0) > PERF_SLOW_LIMITS.firestore || (action.firestore?.totalMs || 0) > PERF_SLOW_LIMITS.firestore) warnings.push('Slow Firestore write');
  if ((action.optimisticVisibleToFirestoreConfirmedMs || 0) > PERF_SLOW_LIMITS.firestore) warnings.push('Optimistic waiting on Firestore');
  if ((action.firestoreDoneToSnapshotMs || 0) > PERF_SLOW_LIMITS.snapshot) warnings.push('Snapshot delayed');
  if ((action.snapshotToVisibleUpdateMs || 0) > PERF_SLOW_LIMITS.render) warnings.push('UI render delayed');
  if ((action.normalization || []).some((item) => (item.elapsedMs || 0) > PERF_SLOW_LIMITS.normalization)) warnings.push('Slow normalization');
  if (action.undo?.includesCards) warnings.push('Undo snapshot includes cards');
  if ((action.undo?.elapsedMs || 0) > PERF_SLOW_LIMITS.undo) warnings.push('Slow undo build');
  return warnings;
};

const patchPerfAction = (actionId, patch) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  updatePerfActionsState((state) => ({
    ...state,
    actions: state.actions.map((action) => {
      if (action.id !== actionId) return action;
      const nextAction = typeof patch === 'function' ? patch(action) : { ...action, ...patch };
      return { ...nextAction, warnings: getPerfWarningsForAction(nextAction) };
    })
  }));
};

const recordPerfActionClick = ({ actionType, payload = {}, buttonName = null, cardName = null, currentGame = null } = {}) => {
  if (!isPerfActionsEnabled() || !IMPORTANT_PERF_ACTIONS.has(actionType)) return null;
  const now = getActionPerfNow();
  const click = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actionType,
    payload: compactPerfPayload(payload),
    cardId: getPerfActionCardId(payload),
    cardName: cardName || getPerfActionCardName(payload, currentGame),
    buttonName: buttonName || actionType,
    perfNow: now,
    wallNow: getActionPerfWallNow()
  };
  updatePerfActionsState((state) => ({
    ...state,
    enabled: true,
    pendingClicks: [...state.pendingClicks.slice(-10), click]
  }));
  return click;
};

const startPerfAction = ({ actionType, payload = {}, currentGame = null } = {}) => {
  if (!isPerfActionsEnabled() || !IMPORTANT_PERF_ACTIONS.has(actionType)) return null;
  const handlerStartPerfNow = getActionPerfNow();
  let matchedClick = null;
  const cardId = getPerfActionCardId(payload);
  const state = getPerfActionsState();
  for (let i = state.pendingClicks.length - 1; i >= 0; i -= 1) {
    const click = state.pendingClicks[i];
    if (click.actionType === actionType && (!cardId || !click.cardId || click.cardId === cardId) && handlerStartPerfNow - click.perfNow < 10000) {
      matchedClick = click;
      break;
    }
  }
  const action = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actionType,
    cardId,
    cardName: matchedClick?.cardName || getPerfActionCardName(payload, currentGame),
    payload: compactPerfPayload(payload),
    clickPerfNow: matchedClick?.perfNow || null,
    clickWallNow: matchedClick?.wallNow || null,
    handlerStartPerfNow,
    handlerStartWallNow: getActionPerfWallNow(),
    clickToHandlerMs: matchedClick ? roundPerfMs(handlerStartPerfNow - matchedClick.perfNow) : null,
    gameBefore: getPerfGameCounts(currentGame),
    marker: getPerfActionMarker({ actionType, payload, currentGame }),
    normalization: [],
    firestore: {},
    warnings: []
  };
  perfActionsStore.activeActionId = action.id;
  updatePerfActionsState((current) => ({
    ...current,
    enabled: true,
    activeActionId: action.id,
    pendingClicks: matchedClick ? current.pendingClicks.filter((click) => click.id !== matchedClick.id) : current.pendingClicks,
    actions: [action, ...current.actions].slice(0, PERF_ACTION_LIMIT)
  }));
  return action.id;
};

const finishPerfAction = (actionId) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  const finishedAt = getActionPerfNow();
  patchPerfAction(actionId, (action) => ({
    ...action,
    handlerDonePerfNow: finishedAt,
    handleActionTotalMs: roundPerfMs(finishedAt - action.handlerStartPerfNow)
  }));
  if (perfActionsStore.activeActionId === actionId) perfActionsStore.activeActionId = null;
};

const failPerfAction = (actionId, error) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  patchPerfAction(actionId, { error: error?.message || String(error) });
  finishPerfAction(actionId);
};

const recordPerfCheckpoint = (phase, details = {}, actionId = perfActionsStore.activeActionId) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  const at = getActionPerfNow();
  patchPerfAction(actionId, (action) => ({
    ...action,
    checkpoints: [...(action.checkpoints || []), { phase, at, sinceHandlerStartMs: roundPerfMs(at - action.handlerStartPerfNow), ...details }]
  }));
};

const recordPerfUndo = (details = {}, actionId = perfActionsStore.activeActionId) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  patchPerfAction(actionId, (action) => ({
    ...action,
    undo: { ...(action.undo || {}), ...details }
  }));
};

const recordPerfNormalization = (details = {}, actionId = perfActionsStore.activeActionId) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  patchPerfAction(actionId, (action) => ({
    ...action,
    normalization: [...(action.normalization || []), details].slice(-8)
  }));
};

const recordPerfOptimisticApplied = (details = {}, actionId = perfActionsStore.activeActionId) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  const optimisticVisiblePerfNow = getActionPerfNow();
  patchPerfAction(actionId, (action) => ({
    ...action,
    optimistic: { ...(action.optimistic || {}), applied: true, visiblePerfNow: optimisticVisiblePerfNow, ...details },
    optimisticApplied: true,
    optimisticVisiblePerfNow,
    clickToOptimisticVisibleMs: action.clickPerfNow ? roundPerfMs(optimisticVisiblePerfNow - action.clickPerfNow) : null,
    handlerToOptimisticVisibleMs: roundPerfMs(optimisticVisiblePerfNow - action.handlerStartPerfNow)
  }));
};

const recordPerfOptimisticSkipped = (reason, actionId = perfActionsStore.activeActionId) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  patchPerfAction(actionId, (action) => ({
    ...action,
    optimistic: { ...(action.optimistic || {}), applied: false, skippedReason: reason },
    optimisticApplied: false
  }));
};

const recordPerfOptimisticConfirmed = (details = {}, actionId = perfActionsStore.activeActionId) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  const confirmedPerfNow = getActionPerfNow();
  patchPerfAction(actionId, (action) => ({
    ...action,
    optimistic: { ...(action.optimistic || {}), confirmed: true, reverted: false, confirmedPerfNow, ...details },
    optimisticReconciled: true,
    optimisticReverted: false,
    optimisticVisibleToFirestoreConfirmedMs: action.optimisticVisiblePerfNow ? roundPerfMs(confirmedPerfNow - action.optimisticVisiblePerfNow) : null
  }));
};

const recordPerfOptimisticReverted = (reason, actionId = perfActionsStore.activeActionId) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  patchPerfAction(actionId, (action) => ({
    ...action,
    optimistic: { ...(action.optimistic || {}), reverted: true, revertReason: reason },
    optimisticReverted: true,
    optimisticReconciled: false
  }));
};

const recordPerfFirestore = (details = {}, actionId = perfActionsStore.activeActionId) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  patchPerfAction(actionId, (action) => {
    const nextFirestore = { ...(action.firestore || {}), ...details };
    const firestoreDonePerfNow = details.firestoreDonePerfNow || action.firestoreDonePerfNow;
    return {
      ...action,
      firestore: nextFirestore,
      firestoreDonePerfNow,
      handlerToFirestoreDoneMs: firestoreDonePerfNow ? roundPerfMs(firestoreDonePerfNow - action.handlerStartPerfNow) : action.handlerToFirestoreDoneMs,
    optimisticVisibleToFirestoreConfirmedMs: firestoreDonePerfNow && action.optimisticVisiblePerfNow ? roundPerfMs(firestoreDonePerfNow - action.optimisticVisiblePerfNow) : action.optimisticVisibleToFirestoreConfirmedMs
    };
  });
};

const markPerfFirestoreDone = (actionId = perfActionsStore.activeActionId, details = {}) => {
  if (!isPerfActionsEnabled() || !actionId) return;
  const doneAt = getActionPerfNow();
  perfActionsStore.lastWriteDoneActionId = actionId;
  perfActionsStore.lastWriteDonePerfNow = doneAt;
  recordPerfFirestore({ ...details, firestoreDonePerfNow: doneAt }, actionId);
};

const recordPerfSnapshot = (snapshotDetails = {}) => {
  if (!isPerfActionsEnabled()) return;
  const snapshotPerfNow = getActionPerfNow();
  perfActionsStore.lastSnapshotPerfNow = snapshotPerfNow;
  const state = getPerfActionsState();
  const actions = state.actions || [];
  const matchingAction = actions.find((action) => (
    action.firestoreDonePerfNow &&
    snapshotPerfNow >= action.firestoreDonePerfNow &&
    snapshotPerfNow - action.firestoreDonePerfNow < 60000 &&
    (snapshotDetails.reflectsByActionId?.[action.id] || !action.firstSnapshotAfterWrite)
  )) || actions.find((action) => (
    action.handlerStartPerfNow &&
    snapshotPerfNow >= action.handlerStartPerfNow &&
    snapshotPerfNow - action.handlerStartPerfNow < 60000
  ));
  const actionId = matchingAction?.id || null;
  const reflectsAction = actionId ? Boolean(snapshotDetails.reflectsByActionId?.[actionId] ?? snapshotDetails.reflectsLastAction) : false;
  const snapshotRecord = { ...snapshotDetails, reflectsAction, snapshotPerfNow, wallNow: getActionPerfWallNow(), actionId };
  updatePerfActionsState((current) => ({ ...current, enabled: true, lastSnapshot: snapshotRecord }));
  if (actionId) {
    patchPerfAction(actionId, (action) => {
      const firestoreDoneToThisSnapshotMs = action.firestoreDonePerfNow ? roundPerfMs(snapshotPerfNow - action.firestoreDonePerfNow) : null;
      const firstSnapshotAfterWrite = action.firstSnapshotAfterWrite || (action.firestoreDonePerfNow && snapshotPerfNow >= action.firestoreDonePerfNow ? snapshotRecord : null);
      const firstSnapshotAfterAction = action.firstSnapshotAfterAction || snapshotRecord;
      const firstReflectingSnapshot = action.firstReflectingSnapshot || (reflectsAction ? snapshotRecord : null);
      const firstLocalReflectingSnapshot = action.firstLocalReflectingSnapshot || (reflectsAction && snapshotDetails.hasPendingWrites ? snapshotRecord : null);
      const firstServerReflectingSnapshot = action.firstServerReflectingSnapshot || (reflectsAction && !snapshotDetails.hasPendingWrites && !snapshotDetails.fromCache ? snapshotRecord : null);
      return {
        ...action,
        snapshot: snapshotRecord,
        firstSnapshotAfterAction,
        firstSnapshotAfterWrite,
        firstReflectingSnapshot,
        firstLocalReflectingSnapshot,
        firstServerReflectingSnapshot,
        firestoreDoneToFirstSnapshotMs: firstSnapshotAfterWrite?.snapshotPerfNow && action.firestoreDonePerfNow ? roundPerfMs(firstSnapshotAfterWrite.snapshotPerfNow - action.firestoreDonePerfNow) : action.firestoreDoneToFirstSnapshotMs,
        firestoreDoneToSnapshotMs: firstReflectingSnapshot?.snapshotPerfNow && action.firestoreDonePerfNow ? roundPerfMs(firstReflectingSnapshot.snapshotPerfNow - action.firestoreDonePerfNow) : firestoreDoneToThisSnapshotMs,
        firestoreDoneToServerReflectingSnapshotMs: firstServerReflectingSnapshot?.snapshotPerfNow && action.firestoreDonePerfNow ? roundPerfMs(firstServerReflectingSnapshot.snapshotPerfNow - action.firestoreDonePerfNow) : action.firestoreDoneToServerReflectingSnapshotMs,
        snapshotReflectsLastAction: reflectsAction,
        localSnapshotIgnored: Boolean(firstSnapshotAfterWrite?.hasPendingWrites && !firstSnapshotAfterWrite?.reflectsAction && firstReflectingSnapshot && firstReflectingSnapshot.snapshotPerfNow > firstSnapshotAfterWrite.snapshotPerfNow)
      };
    });
  }
};

const recordPerfVisibleUpdate = (visibleDetails = {}) => {
  if (!isPerfActionsEnabled()) return;
  const visiblePerfNow = getActionPerfNow();
  const recentWriteActionId = perfActionsStore.lastWriteDonePerfNow && visiblePerfNow - perfActionsStore.lastWriteDonePerfNow < 30000 ? perfActionsStore.lastWriteDoneActionId : null;
  const actionId = visibleDetails.actionId || recentWriteActionId || getPerfActionsState().lastSnapshot?.actionId;
  const record = { ...visibleDetails, visiblePerfNow, wallNow: getActionPerfWallNow(), actionId };
  updatePerfActionsState((state) => ({ ...state, enabled: true, lastVisibleUpdate: record }));
  if (actionId) {
    patchPerfAction(actionId, (action) => ({
      ...action,
      visibleUpdate: record,
      snapshotToVisibleUpdateMs: action.snapshot?.snapshotPerfNow ? roundPerfMs(visiblePerfNow - action.snapshot.snapshotPerfNow) : null,
      gameAfter: {
        stackLength: visibleDetails.stackLength,
        cardsLength: visibleDetails.cardsLength,
        handCount: visibleDetails.handCount,
        battlefieldCount: visibleDetails.battlefieldCount
      }
    }));
  }
};

const debugActionsLog = (message, details = {}) => {
  if (!isDebugActionsEnabled()) return;
  console.log(`[Debug card actions] ${message}`, details);
};

const debugActionsError = (message, details = {}) => {
  if (!isDebugActionsEnabled()) return;
  console.error(`[Debug card actions] ${message}`, details);
};

const logActionPerf = (actionType, details = {}) => {
  if (!isDebugActionsEnabled()) return;
  debugActionsLog('action perf', { actionType, ...details });
};


const COMPACT_IMAGE_URI_KEYS = ['small', 'normal', 'large'];
const COMPACT_CARD_FACE_FIELDS = [
  'name',
  'mana_cost',
  'type_line',
  'oracle_text',
  'colors',
  'power',
  'toughness',
  'loyalty',
  'defense',
  'image_uri'
];
const COMPACT_CARD_FIELDS = [
  'id',
  'oracle_id',
  'name',
  'mana_cost',
  'type_line',
  'oracle_text',
  'colors',
  'color_identity',
  'colorIdentity',
  'layout',
  'power',
  'toughness',
  'loyalty',
  'defense',
  'image_uri',
  'set',
  'set_name',
  'collector_number',
  'rarity',
  'artist',
  'scryfall_uri',
  'scryfallId',
  'typeLine',
  'rulesText',
  'color',
  'displayName'
];
const GAMEPLAY_CARD_FIELDS = [
  'instanceId',
  'ownerId',
  'controllerId',
  'zone',
  'tapped',
  'faceDown',
  'counters',
  'reminders',
  'attachment',
  'attachedToType',
  'attachedToId',
  'isToken',
  'quantity',
  'isCommander',
  'commanderTax',
  'commanderDamage',
  'x',
  'y',
  'nx',
  'ny',
  'positionMode',
  'positionBasisWidthPx',
  'positionBasisHeightPx',
  'tempDamage',
  'controllerName',
  'activeFaceIndex',
  'phasedOut'
];

const copyDefinedFields = (source, fieldNames) => {
  const result = {};
  if (!source || typeof source !== 'object') return result;
  fieldNames.forEach((field) => {
    if (source[field] !== undefined) result[field] = source[field];
  });
  return result;
};

const sanitizeImageUris = (imageUris) => {
  if (!imageUris || typeof imageUris !== 'object') return undefined;
  const compact = {};
  COMPACT_IMAGE_URI_KEYS.forEach((key) => {
    if (typeof imageUris[key] === 'string' && imageUris[key]) compact[key] = imageUris[key];
  });
  return Object.keys(compact).length > 0 ? compact : undefined;
};

const sanitizeScryfallCardFaceForGame = (face = {}) => {
  const compactFace = copyDefinedFields(face, COMPACT_CARD_FACE_FIELDS);
  const imageUris = sanitizeImageUris(face.image_uris);
  if (imageUris) compactFace.image_uris = imageUris;
  if (!compactFace.image_uri) compactFace.image_uri = getBestImageUriFromImageUris(imageUris);
  Object.keys(compactFace).forEach((key) => compactFace[key] === undefined && delete compactFace[key]);
  return compactFace;
};

const getSanitizedCardFaces = (card = {}) => {
  if (!Array.isArray(card.card_faces)) return undefined;
  const faces = card.card_faces
    .filter((face) => face && typeof face === 'object')
    .map(sanitizeScryfallCardFaceForGame)
    .filter((face) => face.name || face.type_line || face.oracle_text || face.image_uri || face.image_uris?.normal || face.image_uris?.large || face.mana_cost);
  return faces.length > 0 ? faces : undefined;
};

const sanitizeScryfallCardForGame = (data = {}, extraFields = {}) => {
  const compactCard = {
    ...copyDefinedFields(data, COMPACT_CARD_FIELDS),
    ...copyDefinedFields(extraFields, [...COMPACT_CARD_FIELDS, ...GAMEPLAY_CARD_FIELDS])
  };
  const imageUris = sanitizeImageUris(data.image_uris || extraFields.image_uris);
  if (imageUris) compactCard.image_uris = imageUris;
  const faces = getSanitizedCardFaces(data.card_faces ? data : extraFields);
  if (faces) {
    compactCard.card_faces = faces;
    compactCard.activeFaceIndex = Number.isInteger(extraFields.activeFaceIndex) ? extraFields.activeFaceIndex : (Number.isInteger(data.activeFaceIndex) ? data.activeFaceIndex : 0);
  }
  if (!compactCard.image_uri) compactCard.image_uri = getCardImageUri({ ...compactCard, activeFaceIndex: compactCard.activeFaceIndex || 0 }) || getCardImageUri(data);
  Object.keys(compactCard).forEach((key) => compactCard[key] === undefined && delete compactCard[key]);
  return compactCard;
};

const normalizeGameCardForFirestore = (card = {}) => {
  if (!card || typeof card !== 'object') return card;
  const normalized = sanitizeScryfallCardForGame(card, card);
  const faces = getSanitizedCardFaces(card);
  if (faces) normalized.card_faces = faces;
  else delete normalized.card_faces;
  if (faces && Number.isInteger(card.activeFaceIndex)) normalized.activeFaceIndex = Math.min(Math.max(card.activeFaceIndex, 0), faces.length - 1);
  else if (!faces) delete normalized.activeFaceIndex;
  if (card.scryfallId === undefined && card.id !== undefined) normalized.scryfallId = card.id;
  return normalized;
};

const normalizeGameCardsForFirestore = (cards = []) => Array.isArray(cards) ? cards.map(normalizeGameCardForFirestore) : cards;

const getDeckExtraKindFromScryfallCard = (card = {}) => {
  const typeLine = String(card.type_line || '').toLowerCase();
  const component = String(card.component || '').toLowerCase();
  if (typeLine.includes('dungeon') || component.includes('dungeon')) return 'dungeons';
  if (typeLine.includes('emblem') || component.includes('emblem')) return 'emblems';
  if (typeLine.includes('token') || component.includes('token')) return 'tokens';
  return null;
};

const buildDeckExtraTemplateFromScryfallCard = (card = {}, kind = getDeckExtraKindFromScryfallCard(card), sourceCards = []) => {
  if (!kind) return null;
  const imageUrl = getCardImageUri(card) || getBestImageUriFromImageUris(sanitizeImageUris(card.image_uris));
  return sanitizeDeckExtraTemplate({
    id: card.id,
    name: card.name,
    typeLine: card.type_line,
    oracleText: getDeckExtraOracleText(card),
    power: card.power,
    toughness: card.toughness,
    colors: Array.isArray(card.colors) ? card.colors : [],
    colorIdentity: Array.isArray(card.color_identity) ? card.color_identity : [],
    imageUrl,
    sourceCards
  }, kind);
};

const collectDeckExtraCandidatesFromCard = (card = {}, sourceCardName = '') => {
  const candidates = [];
  const sourceCards = sanitizeDeckExtraSourceCards([sourceCardName || card.name]);
  if (Array.isArray(card.all_parts)) {
    card.all_parts.forEach((part) => {
      const kind = getDeckExtraKindFromScryfallCard(part);
      if (!kind) return;
      candidates.push({
        kind,
        id: part.id,
        uri: part.uri,
        fallback: sanitizeDeckExtraTemplate({
          id: part.id,
          name: part.name,
          typeLine: part.type_line,
          sourceCards
        }, kind),
        sourceCards
      });
    });
  }

  const oracleText = [card.oracle_text, ...(Array.isArray(card.card_faces) ? card.card_faces.map((face) => face?.oracle_text) : [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (oracleText.includes('venture into the dungeon')) {
    DUNGEON_FALLBACK_NAMES.forEach((name) => candidates.push({ kind: 'dungeons', exactName: name, fallback: { name, typeLine: 'Dungeon', sourceCards }, sourceCards }));
  }
  if (oracleText.includes('take the initiative') || /\binitiative\b/.test(oracleText)) {
    INITIATIVE_DUNGEON_FALLBACK_NAMES.forEach((name) => candidates.push({ kind: 'dungeons', exactName: name, fallback: { name, typeLine: 'Dungeon', sourceCards }, sourceCards }));
  }
  return candidates;
};

const fetchScryfallJsonSafely = async (url) => {
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data?.name) return null;
    return data;
  } catch (error) {
    console.warn('Skipping deck extra Scryfall fetch', error);
    return null;
  }
};

const resolveDeckExtraTemplates = async (candidates = []) => {
  const incoming = getEmptyDeckExtras();
  const seenFetchKeys = new Set();
  const cappedCandidates = candidates.slice(0, MAX_DECK_EXTRA_TOKENS + MAX_DECK_EXTRA_EMBLEMS + MAX_DECK_EXTRA_DUNGEONS + 20);

  for (const candidate of cappedCandidates) {
    const kind = candidate.kind;
    if (!getDeckExtraCap(kind) || incoming[kind].length >= getDeckExtraCap(kind)) continue;
    const fetchKey = candidate.id || candidate.uri || candidate.exactName;
    let card = null;
    if (fetchKey && !seenFetchKeys.has(`${kind}:${fetchKey}`)) {
      seenFetchKeys.add(`${kind}:${fetchKey}`);
      const url = candidate.uri || `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(candidate.exactName)}`;
      card = await fetchScryfallJsonSafely(url);
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
    const template = card
      ? buildDeckExtraTemplateFromScryfallCard(card, kind, candidate.sourceCards)
      : sanitizeDeckExtraTemplate({ ...(candidate.fallback || {}), sourceCards: candidate.sourceCards }, kind);
    if (template) incoming[kind] = mergeDeckExtraLists(incoming[kind], [template], kind);
  }
  return incoming;
};

const estimateJsonByteSize = (value) => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    try {
      return JSON.stringify(value).length;
    } catch {
      return null;
    }
  }
};

const FIRESTORE_DOCUMENT_SIZE_LIMIT_BYTES = 1048576;
const FIRESTORE_DOCUMENT_WARNING_BYTES = 900000;
const FIRESTORE_UNDO_STACK_BUDGET_BYTES = 256 * 1024;
const MAX_UNDO_STACK_ENTRIES = 3;
const MAX_UNDO_STACK_CARD_SNAPSHOT_ENTRIES = 2;
const MAX_GAME_LOG_ENTRIES = 150;
const EMERGENCY_REPAIR_LOG_ENTRIES = 100;
const LOCAL_ONLY_UNDO_ENTRY_FIELDS = new Set([
  'pendingSync',
  '__optimisticActionId',
  '__localOnly',
  'optimistic',
  'perf',
  'debug'
]);

const normalizeUndoEntryForFirestore = (entry = {}) => {
  if (!entry || typeof entry !== 'object') return entry;
  const normalizedEntry = {};
  Object.entries(entry).forEach(([key, value]) => {
    if (!LOCAL_ONLY_UNDO_ENTRY_FIELDS.has(key) && !key.startsWith('__')) normalizedEntry[key] = value;
  });
  const previousState = normalizedEntry.previousState && typeof normalizedEntry.previousState === 'object'
    ? { ...normalizedEntry.previousState }
    : normalizedEntry.previousState;
  if (previousState && Array.isArray(previousState.cards)) previousState.cards = normalizeGameCardsForFirestore(previousState.cards);
  normalizedEntry.previousState = previousState;
  return normalizedEntry;
};

const undoEntryIncludesCardSnapshot = (entry = {}) => Array.isArray(entry?.previousState?.cards);

const pruneUndoStackForFirestore = (undoStack = [], { maxEntries = MAX_UNDO_STACK_ENTRIES, maxCardSnapshotEntries = MAX_UNDO_STACK_CARD_SNAPSHOT_ENTRIES, budgetBytes = FIRESTORE_UNDO_STACK_BUDGET_BYTES } = {}) => {
  if (!Array.isArray(undoStack)) return undoStack;
  let pruned = undoStack.map(normalizeUndoEntryForFirestore).slice(-maxEntries);

  // The newest entry is the action currently being persisted. Keep it at the end
  // so undo reconciliation never sees an older action as latest after pruning.
  while (pruned.filter(undoEntryIncludesCardSnapshot).length > maxCardSnapshotEntries) {
    const olderCardSnapshotIndex = pruned.slice(0, -1).findIndex(undoEntryIncludesCardSnapshot);
    if (olderCardSnapshotIndex < 0) break;
    pruned = [...pruned.slice(0, olderCardSnapshotIndex), ...pruned.slice(olderCardSnapshotIndex + 1)];
  }

  let estimatedBytes = estimateJsonByteSize(pruned);
  while (pruned.length > 1 && estimatedBytes != null && estimatedBytes > budgetBytes) {
    pruned = pruned.slice(1);
    estimatedBytes = estimateJsonByteSize(pruned);
  }
  return pruned;
};

const normalizeUndoStackForFirestore = (undoStack = []) => pruneUndoStackForFirestore(undoStack);

const pruneLogForFirestore = (log = [], maxEntries = MAX_GAME_LOG_ENTRIES) => (Array.isArray(log) ? log.slice(-maxEntries) : log);

const getGameDocumentSizeEstimate = (gameData = {}) => {
  if (!gameData || typeof gameData !== 'object') return null;
  const undoStack = Array.isArray(gameData.undoStack) ? gameData.undoStack : [];
  const log = Array.isArray(gameData.log) ? gameData.log : [];
  return {
    documentBytes: estimateJsonByteSize(gameData),
    undoStackBytes: estimateJsonByteSize(undoStack),
    logBytes: estimateJsonByteSize(log),
    undoEntryCount: undoStack.length,
    logEntryCount: log.length,
    undoEntriesWithCards: undoStack.filter(undoEntryIncludesCardSnapshot).length,
    firestoreLimitBytes: FIRESTORE_DOCUMENT_SIZE_LIMIT_BYTES,
    isNearLimit: (estimateJsonByteSize(gameData) || 0) >= FIRESTORE_DOCUMENT_WARNING_BYTES
  };
};

const normalizeGameUpdatesForFirestore = (updates = {}, debugContext = 'card write') => {
  if (!updates || typeof updates !== 'object') return updates;
  const debugEnabled = isDebugActionsEnabled();
  const measurePerf = debugEnabled || isPerfActionsEnabled();
  const startedAt = measurePerf ? getActionPerfNow() : 0;
  const normalized = { ...updates };
  const updatesIncludeCards = Array.isArray(normalized.cards);
  const updatesIncludeLog = Array.isArray(normalized.log);
  const undoStackIncludesCards = Array.isArray(normalized.undoStack)
    && normalized.undoStack.some(undoEntryIncludesCardSnapshot);
  let cardsNormalizeMs = null;
  let undoStackNormalizeMs = null;
  if (updatesIncludeCards) {
    const cardsNormalizeStartedAt = measurePerf ? getActionPerfNow() : 0;
    normalized.cards = normalizeGameCardsForFirestore(normalized.cards);
    cardsNormalizeMs = measurePerf ? roundPerfMs(getActionPerfNow() - cardsNormalizeStartedAt) : null;
  }
  if (Array.isArray(normalized.undoStack)) {
    const undoStackNormalizeStartedAt = measurePerf ? getActionPerfNow() : 0;
    normalized.undoStack = pruneUndoStackForFirestore(normalized.undoStack);
    undoStackNormalizeMs = measurePerf ? roundPerfMs(getActionPerfNow() - undoStackNormalizeStartedAt) : null;
  }
  if (updatesIncludeLog) normalized.log = pruneLogForFirestore(normalized.log);
  if (updatesIncludeCards) logDebugCardWriteSize(debugContext, normalized.cards, normalized);
  if (measurePerf) {
    const elapsedMs = getActionPerfNow() - startedAt;
    const details = {
      phase: 'normalizeGameUpdatesForFirestore',
      updateFields: Object.keys(updates),
      updatesIncludeCards,
      undoStackIncludesCards,
      previousStateFields: Array.isArray(normalized.undoStack)
        ? Object.keys(normalized.undoStack[normalized.undoStack.length - 1]?.previousState || {})
        : [],
      cardCount: updatesIncludeCards ? normalized.cards.length : 0,
      cardsNormalizeMs,
      undoStackNormalizeMs,
      undoStackLength: Array.isArray(normalized.undoStack) ? normalized.undoStack.length : null,
      undoStackBytes: Array.isArray(normalized.undoStack) ? estimateJsonByteSize(normalized.undoStack) : null,
      logLength: Array.isArray(normalized.log) ? normalized.log.length : null,
      logBytes: Array.isArray(normalized.log) ? estimateJsonByteSize(normalized.log) : null,
      approxUpdateBytes: estimateJsonByteSize(normalized),
      elapsedMs: Math.round(elapsedMs * 10) / 10
    };
    logActionPerf(debugContext, details);
    recordPerfNormalization(details);
  }
  return normalized;
};

const logDebugCardWriteSize = (context, cards, updates = {}) => {
  if (!isDebugActionsEnabled() || !Array.isArray(cards)) return;
  const cardSizes = cards.map((card) => ({
    name: getCardDisplayName(card, card?.name || 'Unknown'),
    instanceId: card?.instanceId || null,
    bytes: estimateJsonByteSize(card) || 0
  })).sort((a, b) => b.bytes - a.bytes);
  debugActionsLog('card write size estimate', {
    context,
    approxUpdateBytes: estimateJsonByteSize(updates),
    approxCardsBytes: estimateJsonByteSize(cards),
    cardCount: cards.length,
    largestCards: cardSizes.slice(0, 5)
  });
};


const debugObjectsDiffer = (a, b) => {
  if (!a || !b) return false;
  try {
    return JSON.stringify(a) !== JSON.stringify(b);
  } catch {
    return a !== b;
  }
};

const summarizeDebugElement = (element) => {
  if (!element) return null;
  return {
    tagName: element.tagName,
    id: element.id || null,
    className: typeof element.className === 'string' ? element.className : null,
    text: element.textContent?.trim().slice(0, 120) || null,
    ariaLabel: element.getAttribute?.('aria-label') || null,
    role: element.getAttribute?.('role') || null,
    pointerEvents: typeof window !== 'undefined' ? window.getComputedStyle(element).pointerEvents : null
  };
};

const getSafeCardName = (card, fallback = 'a card') => {
  if (!card || card.faceDown) return fallback;
  return getCardDisplayName(card, fallback);
};

const getSafeMoveCardName = (card, fromZone, toZone) => {
  if (!card || card.faceDown) return 'a face-down card';
  if (isPublicZone(fromZone) || isPublicZone(toZone)) return getCardDisplayName(card, 'a card');
  return 'a card';
};

const normalizeAttachment = (card) => {
  const attachment = card?.attachment;
  if (attachment?.type && attachment?.id) return { type: attachment.type, id: attachment.id };
  if (card?.attachedToType && card?.attachedToId) return { type: card.attachedToType, id: card.attachedToId };
  return null;
};

const clearAttachmentFields = (card) => {
  const rest = { ...(card || {}) };
  delete rest.attachment;
  delete rest.attachedToType;
  delete rest.attachedToId;
  return rest;
};

const setCardAttachment = (card, type, id) => ({
  ...clearAttachmentFields(card),
  attachment: { type, id }
});

const getCardsAttachedTo = (cards = [], hostCardId) => cards.filter((card) => {
  const attachment = normalizeAttachment(card);
  return attachment?.type === 'card' && attachment.id === hostCardId && card.zone === ZONES.BATTLEFIELD;
});

const getCardsAttachedToPlayer = (cards = [], playerId) => cards.filter((card) => {
  const attachment = normalizeAttachment(card);
  return attachment?.type === 'player' && attachment.id === playerId && card.zone === ZONES.BATTLEFIELD;
});

const getPlayerNameById = (currentGame, playerId, fallback = 'Player') => (
  (currentGame?.players || []).find((player) => player.id === playerId)?.name || fallback
);


const UNDO_STATE_FIELDS = [
  'players',
  'cards',
  'stack',
  'combat',
  'activePlayerIndex',
  'turnPlayerId',
  'phase',
  'turnNumber',
  'priorityIndex',
  'priorityPlayerId',
  'consecutivePasses',
  'reveals',
  'targets',
  'autopass',
  'gameMode',
  'dayNight'
];
const STACK_ONLY_UNDO_STATE_FIELDS = [
  'stack',
  'priorityIndex',
  'priorityPlayerId',
  'consecutivePasses'
];
const CARDS_ONLY_UNDO_STATE_FIELDS = ['cards'];
const PLAYERS_ONLY_UNDO_STATE_FIELDS = ['players'];
const COMBAT_ONLY_UNDO_STATE_FIELDS = ['combat'];
const TARGETS_ONLY_UNDO_STATE_FIELDS = ['targets'];
const REVEALS_ONLY_UNDO_STATE_FIELDS = ['reveals'];
const DAY_NIGHT_ONLY_UNDO_STATE_FIELDS = ['dayNight'];

const appendUndoFieldIfUpdated = (fields, updates, field) => (
  updates && Object.prototype.hasOwnProperty.call(updates, field)
    ? [...fields, field]
    : fields
);

const UNDO_FIELDS_BY_ACTION_TYPE = {
  DRAW_CARD: CARDS_ONLY_UNDO_STATE_FIELDS,
  BATCH_DRAW_LIBRARY: CARDS_ONLY_UNDO_STATE_FIELDS,
  BATCH_MILL_LIBRARY: CARDS_ONLY_UNDO_STATE_FIELDS,
  BATCH_EXILE_LIBRARY: CARDS_ONLY_UNDO_STATE_FIELDS,
  BATCH_SCRY_LIBRARY: CARDS_ONLY_UNDO_STATE_FIELDS,
  BATCH_SURVEIL_LIBRARY: CARDS_ONLY_UNDO_STATE_FIELDS,
  BATCH_REVEAL_LIBRARY: REVEALS_ONLY_UNDO_STATE_FIELDS,
  PLAY_LAND: CARDS_ONLY_UNDO_STATE_FIELDS,
  CAST_SPELL: ['cards', ...STACK_ONLY_UNDO_STATE_FIELDS],
  MOVE_ZONE: ({ updates } = {}) => appendUndoFieldIfUpdated(CARDS_ONLY_UNDO_STATE_FIELDS, updates, 'combat'),
  MOVE_TO_LIBRARY: ({ updates } = {}) => appendUndoFieldIfUpdated(CARDS_ONLY_UNDO_STATE_FIELDS, updates, 'combat'),
  TAP_TOGGLE: CARDS_ONLY_UNDO_STATE_FIELDS,
  PHASE_TOGGLE: CARDS_ONLY_UNDO_STATE_FIELDS,
  SWITCH_CARD_FACE: CARDS_ONLY_UNDO_STATE_FIELDS,
  ADD_CARD_REMINDER: CARDS_ONLY_UNDO_STATE_FIELDS,
  REMOVE_CARD_REMINDER: CARDS_ONLY_UNDO_STATE_FIELDS,
  ADD_PLAYER_REMINDER: PLAYERS_ONLY_UNDO_STATE_FIELDS,
  REMOVE_PLAYER_REMINDER: PLAYERS_ONLY_UNDO_STATE_FIELDS,
  ADD_PLAYER_EMBLEM: PLAYERS_ONLY_UNDO_STATE_FIELDS,
  REMOVE_PLAYER_EMBLEM: PLAYERS_ONLY_UNDO_STATE_FIELDS,
  PLAYER_STATUS_TOGGLE: PLAYERS_ONLY_UNDO_STATE_FIELDS,
  RING_TEMPTATION: PLAYERS_ONLY_UNDO_STATE_FIELDS,
  PLAYER_STATUS_ADD_CUSTOM: PLAYERS_ONLY_UNDO_STATE_FIELDS,
  PLAYER_STATUS_REMOVE_CUSTOM: PLAYERS_ONLY_UNDO_STATE_FIELDS,
  MANA_POOL_ADJUST: PLAYERS_ONLY_UNDO_STATE_FIELDS,
  MANA_POOL_CLEAR: PLAYERS_ONLY_UNDO_STATE_FIELDS,
  SET_DAY_NIGHT: DAY_NIGHT_ONLY_UNDO_STATE_FIELDS,
  CLEAR_CLEANUP_REMINDERS: ({ updates } = {}) => ['cards', 'players'].filter((field) => updates && Object.prototype.hasOwnProperty.call(updates, field)),
  SET_COMBAT_DAMAGE_STEP: COMBAT_ONLY_UNDO_STATE_FIELDS,
  SET_ATTACK_TARGET: COMBAT_ONLY_UNDO_STATE_FIELDS,
  TOGGLE_BLOCK_TARGET: COMBAT_ONLY_UNDO_STATE_FIELDS,
  TARGET: TARGETS_ONLY_UNDO_STATE_FIELDS,
  CLEAR_TARGETS: TARGETS_ONLY_UNDO_STATE_FIELDS
};

const getUndoFieldsForAction = (actionType, context = {}) => {
  const configuredFields = UNDO_FIELDS_BY_ACTION_TYPE[actionType];
  if (!configuredFields) return UNDO_STATE_FIELDS;
  const fields = typeof configuredFields === 'function' ? configuredFields(context) : configuredFields;
  return Array.isArray(fields) && fields.length > 0 ? [...new Set(fields)] : UNDO_STATE_FIELDS;
};

const UNDOABLE_ACTION_TYPES = new Set([
  'DRAW_CARD',
  'BATCH_DRAW_LIBRARY',
  'BATCH_MILL_LIBRARY',
  'BATCH_REVEAL_LIBRARY',
  'BATCH_EXILE_LIBRARY',
  'BATCH_SCRY_LIBRARY',
  'BATCH_SURVEIL_LIBRARY',
  'MULLIGAN',
  'IMPORT',
  'PLAY_LAND',
  'CAST_SPELL',
  'ACTIVATE_ABILITY',
  'MOVE_ZONE',
  'MOVE_TO_LIBRARY',
  'TAP_TOGGLE',
  'PHASE_TOGGLE',
  'REVEAL_CARD',
  'REVEAL_ALL_HAND',
  'CLEAR_REVEALS',
  'TOGGLE_HAND_REVEAL',
  'TOGGLE_FACE',
  'SWITCH_CARD_FACE',
  'MOD_COUNTER',
  'TEMP_DAMAGE',
  'PLAYER_COUNTER',
  'CREATE_TOKEN',
  'CLONE_CARD',
  'CHANGE_CONTROL',
  'ATTACH_CARD',
  'DETACH_CARD',
  'SET_ATTACK_TARGET',
  'TOGGLE_BLOCK_TARGET',
  'RESOLVE_STACK_TOP',
  'COUNTER_STACK_TOP',
  'COPY_STACK_ITEM',
  'DISCARD_RANDOM',
  'SCRY_BOTTOM',
  'REORDER_TOP_LIBRARY',
  'SHUFFLE_LIBRARY',
  'MANUAL_SET_STEP',
  'START_EXTRA_COMBAT',
  'GO_EXTRA_MAIN',
  'START_EXTRA_TURN',
  'SET_ACTIVE_PLAYER',
  'SET_COMBAT_DAMAGE_STEP',
  'PASS',
  'PASS_PRIORITY',
  'SET_COMMANDER',
  'UNSET_COMMANDER',
  'COMMANDER_TAX',
  'COMMANDER_DAMAGE',
  'DECK_DELETE',
  'ADD_CARD_REMINDER',
  'REMOVE_CARD_REMINDER',
  'ADD_PLAYER_REMINDER',
  'REMOVE_PLAYER_REMINDER',
  'ADD_PLAYER_EMBLEM',
  'REMOVE_PLAYER_EMBLEM',
  'PLAYER_STATUS_TOGGLE',
  'RING_TEMPTATION',
  'PLAYER_STATUS_ADD_CUSTOM',
  'PLAYER_STATUS_REMOVE_CUSTOM',
  'MANA_POOL_ADJUST',
  'MANA_POOL_CLEAR',
  'SET_DAY_NIGHT',
  'CLEAR_CLEANUP_REMINDERS'
]);

const cloneUndoValue = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

const buildUndoPreviousState = (currentGame = {}, fields = UNDO_STATE_FIELDS) => {
  const previousState = {};
  const selectedFields = Array.isArray(fields) && fields.length > 0 ? [...new Set(fields)] : UNDO_STATE_FIELDS;
  selectedFields.forEach((field) => {
    if (currentGame[field] !== undefined) previousState[field] = field === 'cards' ? normalizeGameCardsForFirestore(cloneUndoValue(currentGame[field])) : cloneUndoValue(currentGame[field]);
  });
  if (selectedFields.includes('combat') && previousState.combat === undefined) previousState.combat = getEmptyCombatState();
  if (selectedFields.includes('stack') && previousState.stack === undefined) previousState.stack = [];
  if (selectedFields.includes('cards')) {
    if (previousState.cards === undefined) previousState.cards = [];
    else previousState.cards = normalizeGameCardsForFirestore(previousState.cards);
  }
  if (selectedFields.includes('players') && previousState.players === undefined) previousState.players = [];
  if (selectedFields.includes('reveals') && previousState.reveals === undefined) previousState.reveals = [];
  if (selectedFields.includes('targets') && previousState.targets === undefined) previousState.targets = [];
  return previousState;
};

const normalizeUndoActionLabel = (message, actorName) => {
  let label = String(message || '').trim();
  if (!label) return 'last game action';
  const actorPrefix = String(actorName || '').trim();
  if (actorPrefix && label.toLowerCase().startsWith(actorPrefix.toLowerCase())) {
    label = label.slice(actorPrefix.length).trim();
  }
  label = label.replace(/^\s*(has|have|was)\s+/i, '').replace(/\.$/, '').trim();
  return label || 'last game action';
};

const buildUndoEntry = ({ currentGame, actorId, actorName, actionLabel, fields, actionType, cardId = null, postActionCards = null, clientActionId = null }) => {
  const selectedFields = Array.isArray(fields) && fields.length > 0 ? [...new Set(fields)] : UNDO_STATE_FIELDS;
  const measureUndo = isDebugActionsEnabled() || isPerfActionsEnabled();
  const startedAt = measureUndo ? getActionPerfNow() : 0;
  const previousState = buildUndoPreviousState(currentGame, selectedFields);
  const elapsedMs = measureUndo ? getActionPerfNow() - startedAt : 0;
  const cardDebug = buildPerfUndoCardDebug({ cardId, currentGame, previousState, postActionCards });
  const undoDetails = {
    phase: 'buildUndoEntry',
    includesCards: Object.prototype.hasOwnProperty.call(previousState, 'cards'),
    previousStateFields: Object.keys(previousState),
    cardCount: Array.isArray(previousState.cards) ? previousState.cards.length : 0,
    undoStackLength: Array.isArray(currentGame?.undoStack) ? currentGame.undoStack.length : 0,
    elapsedMs: Math.round(elapsedMs * 10) / 10,
    ...(cardDebug ? { cardDebug } : {})
  };
  if (measureUndo) {
    logActionPerf(actionType || 'UNDO_ENTRY', undoDetails);
    recordPerfUndo(undoDetails);
  }
  return {
    id: `${Date.now()}-${generateCardId()}`,
    timestamp: Date.now(),
    actorId: actorId || null,
    actorName: actorName || 'Unknown',
    actionLabel: actionLabel || 'last game action',
    actionType: actionType || null,
    clientActionId: clientActionId || null,
    cardId: cardId || null,
    cardZoneBefore: cardDebug?.zoneBeforeAction || null,
    cardZoneAfter: cardDebug?.zoneAfterAction || null,
    previousState
  };
};

const appendUndoEntry = (currentGame, undoEntry) => pruneUndoStackForFirestore([
  ...((currentGame?.undoStack || [])),
  undoEntry
]);

const appendOptimisticUndoEntry = (currentGame, undoEntry) => [
  ...((currentGame?.undoStack || [])).slice(-(MAX_UNDO_STACK_ENTRIES - 1)).map(normalizeUndoEntryForFirestore),
  undoEntry
];

const getUndoRestoreUpdates = (previousState = {}) => {
  const updates = {};
  UNDO_STATE_FIELDS.forEach((field) => {
    if (previousState[field] !== undefined) updates[field] = field === 'cards' ? normalizeGameCardsForFirestore(cloneUndoValue(previousState[field])) : cloneUndoValue(previousState[field]);
  });
  return updates;
};

const getUndoRestoredFields = (previousState = {}) => Object.keys(getUndoRestoreUpdates(previousState));

const buildOptimisticUndoPatch = (currentGame = {}, undoEntry = {}) => {
  if (!undoEntry?.previousState) return null;
  const restoredUpdates = getUndoRestoreUpdates(undoEntry.previousState);
  if (Object.keys(restoredUpdates).length === 0) return null;
  const currentUndoStack = Array.isArray(currentGame?.undoStack) ? currentGame.undoStack : [];
  const latestUndoEntry = currentUndoStack[currentUndoStack.length - 1];
  const nextUndoStack = latestUndoEntry?.id === undoEntry.id
    ? currentUndoStack.slice(0, -1)
    : currentUndoStack.filter((entry) => entry?.id !== undoEntry.id);
  return {
    ...restoredUpdates,
    undoStack: nextUndoStack
  };
};

const actionUpdatesRestorableState = (updates = {}) => UNDO_STATE_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(updates, field));

const getCopyStackItemName = (item = {}) => {
  const baseName = String(item?.name || item?.copiedFromName || 'Stack item').trim() || 'Stack item';
  return /\(copy\)$/i.test(baseName) ? baseName : `${baseName} (Copy)`;
};

const buildCopiedStackItem = (item = {}) => {
  const copiedItem = {
    id: generateCardId(),
    sourceId: item.sourceId || null,
    copiedFromStackItemId: item.id || item.sourceId || null,
    copiedFromName: String(item.name || item.copiedFromName || 'Stack item').trim() || 'Stack item',
    name: getCopyStackItemName(item),
    controllerId: item.controllerId || null,
    timestamp: Date.now(),
    targetIds: Array.isArray(item.targetIds) ? [...item.targetIds] : [],
    targetPlayerIds: Array.isArray(item.targetPlayerIds) ? [...item.targetPlayerIds] : [],
    isCopy: true
  };
  ['cardImage', 'typeLine', 'itemType', 'type'].forEach((field) => {
    if (item[field] !== undefined && item[field] !== null) copiedItem[field] = item[field];
  });
  return copiedItem;
};

const buildGameLogEntry = ({ currentGame, playerId, playerName, type, category, message, timestamp = Date.now(), ...extra }) => ({
  timestamp,
  playerId: playerId || null,
  playerName: playerName || 'Unknown',
  type: type || category || 'GAME_ACTION',
  category: category || type || 'game',
  turnNumber: currentGame?.turnNumber ?? null,
  turnPlayerId: currentGame?.turnPlayerId || null,
  phase: currentGame?.phase || null,
  phaseLabel: getPhaseLabel(currentGame?.phase),
  message,
  desc: message,
  ...extra
});

const AUTO_PASS_MODE = {
  OFF: 'off',
  END_OF_TURN: 'end_of_turn',
  PHASE: 'phase'
};

const AUTO_PASS_MENU_WIDTH = 224;

// --- Helper Functions ---
const generateGameId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const getEntityReminders = (entity) => Array.isArray(entity?.reminders) ? entity.reminders.filter(Boolean) : [];

const sanitizeReminderText = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);

const normalizeReminderExpiration = (expires) => expires === REMINDER_EXPIRATION.MANUAL ? REMINDER_EXPIRATION.MANUAL : REMINDER_EXPIRATION.CLEANUP;

const buildReminder = ({ text, expires, createdBy }) => ({
  id: `${Date.now()}-${generateCardId()}`,
  text: sanitizeReminderText(text),
  expires: normalizeReminderExpiration(expires),
  createdAt: Date.now(),
  createdBy: createdBy || null
});

const getReminderTitle = (reminder) => `${reminder?.text || 'Reminder'}${reminder?.expires === REMINDER_EXPIRATION.MANUAL ? ' · Manual' : ' · Clear at cleanup'}`;

const ReminderTool = ({ label = 'Add Reminder', onAdd, disabled = false }) => {
  const [customText, setCustomText] = useState('');
  const [expires, setExpires] = useState(REMINDER_EXPIRATION.CLEANUP);
  const addPreset = (preset) => {
    if (disabled) return;
    onAdd?.({ text: preset.label, expires: preset.expires || expires });
  };
  const addCustom = () => {
    const text = sanitizeReminderText(customText);
    if (!text || disabled) return;
    onAdd?.({ text, expires });
    setCustomText('');
    setExpires(REMINDER_EXPIRATION.CLEANUP);
  };

  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-200"><Bell size={12} /> {label}</h3>
        <select
          value={expires}
          onChange={(event) => setExpires(normalizeReminderExpiration(event.target.value))}
          disabled={disabled}
          className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] font-bold text-slate-100"
          aria-label="Reminder expiration"
        >
          <option value={REMINDER_EXPIRATION.CLEANUP}>Clear at cleanup</option>
          <option value={REMINDER_EXPIRATION.MANUAL}>Manual</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {REMINDER_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => addPreset(preset)}
            disabled={disabled}
            className="min-h-8 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-left text-[11px] font-bold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            title={preset.expires === REMINDER_EXPIRATION.MANUAL ? 'Defaults to manual' : 'Defaults to cleanup'}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={customText}
          onChange={(event) => setCustomText(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') addCustom(); }}
          maxLength={80}
          disabled={disabled}
          placeholder="Custom reminder…"
          className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
        />
        <button type="button" onClick={addCustom} disabled={disabled || !sanitizeReminderText(customText)} className="rounded bg-violet-700 px-3 py-2 text-xs font-black text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">Custom…</button>
      </div>
    </div>
  );
};


const generateCardId = () => Math.random().toString(36).substr(2, 9);

const shuffleArray = (array) => {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
};

const copyToClipboard = (text) => {
  // Robust fallback for copy
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => alert(`Copied: ${text}`)).catch(() => prompt("Copy this code:", text));
  } else {
    // Fallback for older browsers / iframe restrictions
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      alert(`Copied: ${text}`);
    } catch {
      prompt("Copy this code:", text);
    }
    document.body.removeChild(textArea);
  }
};

const isMobileOrTouchDevice = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const isMobileUa = /iPhone|iPad|iPod|Android/i.test(ua);
  const isCoarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const isNarrowViewport = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 900px)').matches;

  return isMobileUa || (isCoarsePointer && isNarrowViewport);
};

const NON_MEANINGFUL_AUTOPASS_TYPES = new Set([
  'PASS',
  'PASS_PRIORITY',
  'PRIORITY_PASS',
  'CHAT',
  'PHASE_ADVANCE',
  'STEP_ADVANCE',
  'UNTAP',
  'UNTAP_STEP',
  'DRAW',
  'DRAW_STEP'
]);

const isMeaningfulOpponentAction = (entry, currentUid) => {
  if (!entry || !currentUid || entry.playerId === currentUid) return false;

  const entryType = (entry.type || '').toUpperCase();
  if (NON_MEANINGFUL_AUTOPASS_TYPES.has(entryType)) return false;

  const description = (entry.description || entry.desc || '').trim();
  if (/^(phase|step)\s*:/i.test(description)) return false;
  // Housekeeping steps happen every turn and should not be treated as meaningful actions.
  if (/\b(untap|untapped|draw|drew|draws a card|draw step|untap step)\b/i.test(description)) return false;

  return true;
};

const getAutoPassLogKey = (entry, entryIndex) => {
  if (!entry) return null;
  const safeIndex = Number.isInteger(entryIndex) ? entryIndex : -1;
  const playerId = entry.playerId || 'na';
  const type = entry.type || 'na';
  const desc = entry.desc || 'na';
  return `${safeIndex}:${playerId}:${type}:${desc}`;
};

const MAX_PROXY_AUTOPASS_ADVANCES = 10;
const BATTLEFIELD_CARD_WIDTH_PX = 80;
const BATTLEFIELD_CARD_HEIGHT_PX = 112;
const BATTLEFIELD_BASE_MIN_HEIGHT_PX = 420;
const BATTLEFIELD_DEFAULT_WIDTH_PX = 360;
const BATTLEFIELD_NORMALIZED_MIN = 0.03;
const BATTLEFIELD_NORMALIZED_MAX = 0.97;
const BATTLEFIELD_SIDE_PADDING_PX = 16;
const BATTLEFIELD_LABEL_EXTRA_PADDING_PX = 0;
const BATTLEFIELD_CARD_GAP_PX = 16;
const BATTLEFIELD_POSITION_MODE_AUTO = 'auto';
const BATTLEFIELD_POSITION_MODE_MANUAL = 'manual';

const getCardPositionMode = (card) => (
  card?.positionMode === BATTLEFIELD_POSITION_MODE_MANUAL
    ? BATTLEFIELD_POSITION_MODE_MANUAL
    : BATTLEFIELD_POSITION_MODE_AUTO
);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clampBattlefieldNormalized = (value) => clamp(value, BATTLEFIELD_NORMALIZED_MIN, BATTLEFIELD_NORMALIZED_MAX);
const clampBattlefieldCenterNormalized = (value, dimensionPx, cardDimensionPx, sidePaddingPx = 0) => {
  const safeDimension = Number.isFinite(dimensionPx) && dimensionPx > 0 ? dimensionPx : BATTLEFIELD_DEFAULT_WIDTH_PX;
  const halfCard = (Number.isFinite(cardDimensionPx) && cardDimensionPx > 0 ? cardDimensionPx : 0) / 2;
  const safeSidePadding = Number.isFinite(sidePaddingPx) && sidePaddingPx > 0 ? sidePaddingPx : 0;
  const min = clamp((halfCard + safeSidePadding) / safeDimension, BATTLEFIELD_NORMALIZED_MIN, 0.5);
  const max = clamp(1 - min, 0.5, BATTLEFIELD_NORMALIZED_MAX);
  return clamp(value, min, max);
};

const isLandCard = (card) => getCardTypeLine(card).toLowerCase().includes('land');

const getIsNarrowBattlefield = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 900px)').matches;
};

const getBattlefieldLayoutConfig = (isMobile = getIsNarrowBattlefield()) => ({
  headerSafeTopPx: isMobile ? 90 : 96,
  cardWidthPx: BATTLEFIELD_CARD_WIDTH_PX,
  cardHeightPx: BATTLEFIELD_CARD_HEIGHT_PX,
  labelSafePx: 28,
  rowGapPx: 12,
  laneGapPx: 28,
  bottomPaddingPx: 48,
  minHeightPx: BATTLEFIELD_BASE_MIN_HEIGHT_PX,
  maxHeightPx: isMobile ? 1500 : 1800,
  gapPx: BATTLEFIELD_CARD_GAP_PX,
  sidePaddingPx: BATTLEFIELD_SIDE_PADDING_PX
});

const getBattlefieldHorizontalSafeBounds = ({ containerWidth, cardWidthPx }) => {
  const width = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : BATTLEFIELD_DEFAULT_WIDTH_PX;
  const safeCardWidthPx = Number.isFinite(cardWidthPx) && cardWidthPx > 0 ? cardWidthPx : BATTLEFIELD_CARD_WIDTH_PX;
  const halfCard = safeCardWidthPx / 2;
  const sidePaddingPx = BATTLEFIELD_SIDE_PADDING_PX;
  const labelExtraPaddingPx = BATTLEFIELD_LABEL_EXTRA_PADDING_PX;

  return {
    usableLeftPx: halfCard + sidePaddingPx + labelExtraPaddingPx,
    usableRightPx: width - halfCard - sidePaddingPx - labelExtraPaddingPx,
    halfCard,
    sidePaddingPx,
    labelExtraPaddingPx
  };
};

const calculateBattlefieldColumns = ({ containerWidth, cardWidthPx, gapPx, sidePaddingPx }) => {
  const battlefieldWidthPx = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : BATTLEFIELD_DEFAULT_WIDTH_PX;
  const safeCardWidthPx = Number.isFinite(cardWidthPx) && cardWidthPx > 0 ? cardWidthPx : BATTLEFIELD_CARD_WIDTH_PX;
  const safeGapPx = Number.isFinite(gapPx) && gapPx >= 0 ? gapPx : BATTLEFIELD_CARD_GAP_PX;
  const safeSidePaddingPx = Number.isFinite(sidePaddingPx) && sidePaddingPx >= 0 ? sidePaddingPx : BATTLEFIELD_SIDE_PADDING_PX;
  const availableWidth = Math.max(0, battlefieldWidthPx - (safeSidePaddingPx * 2));
  const calculatedMaxColumns = Math.floor((availableWidth + safeGapPx) / (safeCardWidthPx + safeGapPx));
  const columns = Math.max(1, calculatedMaxColumns);
  const rowWidth = (columns * safeCardWidthPx) + (Math.max(0, columns - 1) * safeGapPx);
  const startX = (battlefieldWidthPx / 2) - (rowWidth / 2) + (safeCardWidthPx / 2);
  const columnCentersPx = Array.from({ length: columns }, (_unused, col) => startX + (col * (safeCardWidthPx + safeGapPx)));

  return {
    battlefieldWidthPx,
    cardWidthPx: safeCardWidthPx,
    gapPx: safeGapPx,
    sidePaddingPx: safeSidePaddingPx,
    availableWidth,
    calculatedMaxColumns,
    columns,
    rowWidth,
    startX,
    columnCentersPx
  };
};

const getBattlefieldLayoutGroupKey = (card) => (isLandCard(card) ? 'land' : 'nonland');

const getBattlefieldLayoutGroupLabel = (groupKey) => (groupKey === 'land' ? 'Lands' : 'Nonlands');

const computeAutoBattlefieldLayout = ({
  cards = [],
  controllerId = null,
  containerWidth = BATTLEFIELD_DEFAULT_WIDTH_PX,
  isMobile = getIsNarrowBattlefield(),
  debugLabel = 'BATTLEFIELD_AUTO_LAYOUT',
  battlefieldType = 'unknown',
  treatManualAsAuto = false
} = {}) => {
  const battlefieldWidth = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : BATTLEFIELD_DEFAULT_WIDTH_PX;
  const config = getBattlefieldLayoutConfig(isMobile);
  const cardWidthPx = config.cardWidthPx;
  const cardHeightPx = config.cardHeightPx;
  const columnLayout = calculateBattlefieldColumns({
    containerWidth: battlefieldWidth,
    cardWidthPx,
    gapPx: config.gapPx,
    sidePaddingPx: config.sidePaddingPx
  });
  const maxColumns = columnLayout.columns;
  const { usableLeftPx, usableRightPx } = getBattlefieldHorizontalSafeBounds({
    containerWidth: battlefieldWidth,
    cardWidthPx
  });

  const relevantBattlefieldCards = cards.filter((card) => {
    if (!card || card.zone !== ZONES.BATTLEFIELD) return false;
    if (controllerId && card.controllerId !== controllerId) return false;
    return true;
  });
  const autoCards = treatManualAsAuto
    ? relevantBattlefieldCards
    : relevantBattlefieldCards.filter(card => getCardPositionMode(card) === BATTLEFIELD_POSITION_MODE_AUTO);
  const manualCards = treatManualAsAuto
    ? []
    : relevantBattlefieldCards.filter(card => getCardPositionMode(card) === BATTLEFIELD_POSITION_MODE_MANUAL);

  const groupDefinitions = [
    { key: 'nonland', label: getBattlefieldLayoutGroupLabel('nonland') },
    { key: 'land', label: getBattlefieldLayoutGroupLabel('land') }
  ];
  const groups = groupDefinitions.map((definition) => {
    const groupCards = autoCards.filter(card => getBattlefieldLayoutGroupKey(card) === definition.key);
    const rows = [];
    for (let rowStart = 0; rowStart < groupCards.length; rowStart += maxColumns) {
      const rowCards = groupCards.slice(rowStart, rowStart + maxColumns);
      const columns = Math.max(1, rowCards.length);
      const rowLayout = calculateBattlefieldColumns({
        containerWidth: battlefieldWidth,
        cardWidthPx,
        gapPx: config.gapPx,
        sidePaddingPx: config.sidePaddingPx
      });
      const rowWidth = (columns * cardWidthPx) + (Math.max(0, columns - 1) * rowLayout.gapPx);
      const startX = (battlefieldWidth / 2) - (rowWidth / 2) + (cardWidthPx / 2);
      rows.push({
        index: rows.length,
        cards: rowCards,
        columns,
        rowWidth,
        startX,
        columnCentersPx: Array.from({ length: columns }, (_unused, col) => startX + (col * (cardWidthPx + rowLayout.gapPx)))
      });
    }
    return {
      ...definition,
      cards: groupCards,
      rows,
      rowCount: rows.length,
      columns: rows.map(row => row.columns)
    };
  });

  const nonlandGroup = groups.find(group => group.key === 'nonland');
  const landGroup = groups.find(group => group.key === 'land');
  const nonlandRows = nonlandGroup?.rowCount || 0;
  const landRows = landGroup?.rowCount || 0;
  const nonlandRowsHeightPx = nonlandRows * (cardHeightPx + config.labelSafePx);
  const landRowsHeightPx = landRows * (cardHeightPx + config.labelSafePx);
  const nonlandGapsPx = Math.max(0, nonlandRows - 1) * config.rowGapPx;
  const landGapsPx = Math.max(0, landRows - 1) * config.rowGapPx;
  const laneGapPx = nonlandRows > 0 && landRows > 0 ? config.laneGapPx : 0;
  const neededHeight = config.headerSafeTopPx
    + nonlandRowsHeightPx
    + nonlandGapsPx
    + laneGapPx
    + landRowsHeightPx
    + landGapsPx
    + config.bottomPaddingPx;
  const battlefieldHeightPx = Math.ceil(clamp(neededHeight, config.minHeightPx, config.maxHeightPx));
  const rowPitchPx = cardHeightPx + config.labelSafePx + config.rowGapPx;
  const groupStartYPx = new Map([
    ['nonland', config.headerSafeTopPx],
    ['land', config.headerSafeTopPx + nonlandRowsHeightPx + nonlandGapsPx + laneGapPx]
  ]);
  const tidyPositions = new Map();

  groups.forEach((group) => {
    const laneStartY = groupStartYPx.get(group.key) || config.headerSafeTopPx;
    group.rows.forEach((row) => {
      row.cards.forEach((card, col) => {
        const slotIndex = row.index * maxColumns + col;
        const pixelX = row.columnCentersPx[Math.min(col, row.columnCentersPx.length - 1)] ?? (battlefieldWidth / 2);
        const unclampedPixelY = laneStartY + (row.index * rowPitchPx) + (cardHeightPx / 2);
        const pixelY = clamp(unclampedPixelY, cardHeightPx / 2, battlefieldHeightPx - (cardHeightPx / 2) - config.bottomPaddingPx / 4);
        const nx = Number(clampBattlefieldCenterNormalized(pixelX / battlefieldWidth, battlefieldWidth, cardWidthPx, BATTLEFIELD_SIDE_PADDING_PX).toFixed(4));
        const ny = Number(clampBattlefieldCenterNormalized(pixelY / battlefieldHeightPx, battlefieldHeightPx, cardHeightPx).toFixed(4));
        tidyPositions.set(card.instanceId, {
          nx,
          ny,
          x: Number((nx * 100).toFixed(1)),
          y: Number((ny * 100).toFixed(1)),
          pixelX: Number(pixelX.toFixed(1)),
          pixelY: Number(pixelY.toFixed(1)),
          lane: group.key,
          groupKey: group.key,
          groupLabel: group.label,
          slotIndex,
          row: row.index,
          col,
          rows: group.rowCount,
          rowColumns: row.columns,
          battlefieldWidth,
          battlefieldHeightPx,
          positionBasisWidthPx: battlefieldWidth,
          positionBasisHeightPx: battlefieldHeightPx,
          positionMode: BATTLEFIELD_POSITION_MODE_AUTO
        });
      });
    });
  });

  const groupingDebug = groups.map(group => ({
    key: group.key,
    label: group.label,
    count: group.cards.length,
    order: group.cards.map(card => ({ instanceId: card.instanceId, name: card.name || 'Unknown card' })),
    chosenColumnsPerRow: group.rows.map(row => row.columns),
    rowCount: group.rowCount,
    rows: group.rows.map(row => ({
      row: row.index,
      columns: row.columns,
      cardOrder: row.cards.map(card => ({ instanceId: card.instanceId, name: card.name || 'Unknown card' }))
    }))
  }));
  const generatedPositionsDebug = autoCards.map((card) => {
    const position = tidyPositions.get(card.instanceId);
    return {
      instanceId: card.instanceId,
      name: card.name || 'Unknown card',
      group: position?.groupKey,
      row: position?.row,
      col: position?.col,
      nx: position?.nx,
      ny: position?.ny,
      pixelX: position?.pixelX,
      pixelY: position?.pixelY
    };
  });
  const debugInfo = {
    battlefieldType,
    measuredWidth: battlefieldWidth,
    battlefieldWidthPx: battlefieldWidth,
    battlefieldHeightPx,
    contentHeightPx: neededHeight,
    clampedContentHeightPx: battlefieldHeightPx,
    autoCardsCount: autoCards.length,
    manualCardsCount: manualCards.length,
    manualCards: manualCards.map(card => ({ instanceId: card.instanceId, name: card.name || 'Unknown card', nx: card.nx, ny: card.ny })),
    treatManualAsAuto,
    grouping: groupingDebug,
    generatedPositions: generatedPositionsDebug,
    maxColumns,
    columnCentersPx: columnLayout.columnCentersPx.map(centerX => Number(centerX.toFixed(1))),
    rowGapPx: config.rowGapPx,
    laneGapPx: config.laneGapPx,
    gapPx: columnLayout.gapPx,
    sidePaddingPx: columnLayout.sidePaddingPx,
    availableWidth: Number(columnLayout.availableWidth.toFixed(1)),
    calculatedMaxColumns: columnLayout.calculatedMaxColumns,
    rowWidth: Number(columnLayout.rowWidth.toFixed(1)),
    startX: Number(columnLayout.startX.toFixed(1)),
    usableLeftPx: Number(usableLeftPx.toFixed(1)),
    usableRightPx: Number(usableRightPx.toFixed(1))
  };

  console.log(`[${debugLabel}]`, debugInfo);
  groups.forEach((group) => {
    console.log(`[${debugLabel}_GROUP]`, {
      battlefieldType,
      group: group.key,
      label: group.label,
      order: group.cards.map(card => `${card.instanceId}:${card.name || 'Unknown card'}`),
      chosenColumnsPerRow: group.rows.map(row => row.columns),
      rowCount: group.rowCount
    });
  });
  generatedPositionsDebug.forEach((position) => {
    console.log(`[${debugLabel}_CARD]`, { battlefieldType, ...position });
  });

  return {
    positionedCards: autoCards.map(card => ({ card, position: tidyPositions.get(card.instanceId) })).filter(entry => entry.position),
    battlefieldHeightPx,
    contentHeightPx: neededHeight,
    cardWidthPx,
    cardHeightPx,
    columnCentersPx: columnLayout.columnCentersPx,
    nonlandRows,
    landRows,
    tidyPositions,
    columns: maxColumns,
    battlefieldWidth,
    usableLeftPx,
    usableRightPx,
    rowGapPx: config.rowGapPx,
    laneGapPx: config.laneGapPx,
    gapPx: columnLayout.gapPx,
    sidePaddingPx: columnLayout.sidePaddingPx,
    availableWidth: columnLayout.availableWidth,
    calculatedMaxColumns: columnLayout.calculatedMaxColumns,
    rowWidth: columnLayout.rowWidth,
    startX: columnLayout.startX,
    groups,
    autoCards,
    manualCards,
    debugInfo
  };
};

const getBattlefieldGridPosition = ({
  card,
  existingBattlefieldCards = [],
  controllerId,
  containerWidth = BATTLEFIELD_DEFAULT_WIDTH_PX,
  isMobile = getIsNarrowBattlefield(),
  debugLabel = 'BATTLEFIELD_GRID_POSITION'
} = {}) => {
  if (!card) return null;
  const controlledBattlefieldCards = existingBattlefieldCards.filter((existingCard) => {
    if (!existingCard) return false;
    if (controllerId && existingCard.controllerId !== controllerId) return false;
    if (existingCard.zone !== ZONES.BATTLEFIELD) return false;
    return existingCard.instanceId !== card.instanceId;
  });
  const battlefieldCard = { ...card, zone: ZONES.BATTLEFIELD, controllerId: card.controllerId || controllerId };
  const layout = computeAutoBattlefieldLayout({
    cards: [...controlledBattlefieldCards, battlefieldCard],
    containerWidth,
    isMobile,
    debugLabel,
    battlefieldType: 'grid-position'
  });
  return layout.tidyPositions.get(card.instanceId) || null;
};

const getBattlefieldPositionCoordinates = (position, positionMode = BATTLEFIELD_POSITION_MODE_AUTO) => ({
  nx: position?.nx,
  ny: position?.ny,
  x: position?.x,
  y: position?.y,
  positionBasisWidthPx: position?.positionBasisWidthPx,
  positionBasisHeightPx: position?.positionBasisHeightPx,
  positionMode
});

const logBattlefieldEntry = (card, source, position) => {
  console.log('[BATTLEFIELD_ENTRY]', {
    name: card?.name || 'Unknown card',
    source,
    lane: position?.lane || (isLandCard(card) ? 'land' : 'nonland'),
    slotIndex: position?.slotIndex,
    row: position?.row,
    col: position?.col,
    rows: position?.rows,
    pixelX: position?.pixelX,
    pixelY: position?.pixelY,
    battlefieldWidth: position?.battlefieldWidth,
    battlefieldHeightPx: position?.battlefieldHeightPx,
    nx: position?.nx,
    ny: position?.ny,
    positionMode: position?.positionMode || BATTLEFIELD_POSITION_MODE_AUTO
  });
};

const getDefaultAutoPassConfig = () => ({
  mode: AUTO_PASS_MODE.OFF,
  phaseId: null,
  stopOnOpponentAction: false,
  startTurnNumber: null,
  startActivePlayerIndex: null
});

const normalizeAutoPassConfig = (config) => {
  const stopOnOpponentAction = config?.stopOnOpponentAction === true;
  const startTurnNumber = Number.isFinite(config?.startTurnNumber) ? config.startTurnNumber : null;
  const startActivePlayerIndex = Number.isFinite(config?.startActivePlayerIndex) ? config.startActivePlayerIndex : null;

  if (!config || config.mode === AUTO_PASS_MODE.OFF) {
    return { mode: AUTO_PASS_MODE.OFF, phaseId: null, stopOnOpponentAction, startTurnNumber: null, startActivePlayerIndex: null };
  }
  if (config.mode === AUTO_PASS_MODE.END_OF_TURN) {
    return { mode: AUTO_PASS_MODE.END_OF_TURN, phaseId: null, stopOnOpponentAction, startTurnNumber, startActivePlayerIndex };
  }
  if (config.mode === AUTO_PASS_MODE.PHASE && config.phaseId) {
    return { mode: AUTO_PASS_MODE.PHASE, phaseId: config.phaseId, stopOnOpponentAction, startTurnNumber: null, startActivePlayerIndex: null };
  }
  return { mode: AUTO_PASS_MODE.OFF, phaseId: null, stopOnOpponentAction, startTurnNumber: null, startActivePlayerIndex: null };
};

const hasReachedAutoPassTarget = (currentGame, config) => {
  if (!currentGame || !config || config.mode === AUTO_PASS_MODE.OFF) return false;
  if (config.mode === AUTO_PASS_MODE.END_OF_TURN) {
    if (!Number.isFinite(config.startTurnNumber) || !Number.isFinite(config.startActivePlayerIndex)) return false;
    return currentGame.turnNumber !== config.startTurnNumber || currentGame.activePlayerIndex !== config.startActivePlayerIndex;
  }
  if (config.mode === AUTO_PASS_MODE.PHASE) {
    return currentGame.phase === config.phaseId;
  }
  return false;
};

const getPlayerAutoPassConfig = (currentGame, playerId) => {
  const autopassMap = currentGame?.autopass || {};
  return normalizeAutoPassConfig(autopassMap[playerId]);
};

const appendEvent = async (gameId, event) => {
  if (!gameId) return;
  await addDoc(collection(db, 'games_v3', gameId, 'events'), {
    createdAt: serverTimestamp(),
    ...event
  });
};

const buildTurnStartEvent = (currentGame) => {
  const players = currentGame.players || [];
  const activePlayer = players[currentGame.activePlayerIndex] || players.find(p => p.id === currentGame.turnPlayerId);
  return {
    type: 'TURN_START',
    turnNumber: currentGame.turnNumber,
    phase: currentGame.phase,
    actorId: activePlayer?.id || currentGame.turnPlayerId || null,
    actorName: activePlayer?.name || 'Unknown',
    text: `Turn ${currentGame.turnNumber} start: ${activePlayer?.name || 'Unknown'}`
  };
};

const normalizeCombatDamageStep = (step) => (
  step === COMBAT_DAMAGE_STEPS.FIRST_STRIKE || step === COMBAT_DAMAGE_STEPS.REGULAR ? step : null
);
const getCombatDamageStepLabel = (step) => COMBAT_DAMAGE_STEP_LABELS[normalizeCombatDamageStep(step)] || null;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const getCombatDamageStep = (combatState = {}) => normalizeCombatDamageStep(isPlainObject(combatState) ? combatState.combatDamageStep : null);
const getEmptyCombatState = () => ({ attackers: {}, blockers: {}, combatDamageStep: null });
const normalizeCombatAssignmentMap = (assignments) => (isPlainObject(assignments) ? assignments : {});
const normalizeCombatState = (combatState = getEmptyCombatState()) => {
  const safeCombatState = isPlainObject(combatState) ? combatState : {};
  return {
    ...safeCombatState,
    attackers: normalizeCombatAssignmentMap(safeCombatState.attackers),
    blockers: normalizeCombatAssignmentMap(safeCombatState.blockers),
    combatDamageStep: getCombatDamageStep(safeCombatState)
  };
};
const withCombatDamageStep = (combatState = getEmptyCombatState(), step = null) => ({
  ...normalizeCombatState(combatState),
  combatDamageStep: normalizeCombatDamageStep(step)
});

const isCombatPhase = (phase) => typeof phase === 'string' && phase.startsWith('combat_');
const shouldClearCombatState = (fromPhase, toPhase) => fromPhase?.startsWith('combat_') && !toPhase?.startsWith('combat_');
const resetTemporaryDamage = (cards = []) => cards.map((card) => (card.tempDamage ? { ...card, tempDamage: 0 } : card));
const shouldResetTemporaryDamageForPhase = (phase) => phase === 'cleanup' || phase === 'untap';
const clearCombatAssignmentsForCard = (combatState = getEmptyCombatState(), instanceId) => {
  const normalizedCombatState = normalizeCombatState(combatState);
  if (!instanceId) return normalizedCombatState;

  const nextAttackers = { ...(normalizedCombatState.attackers || {}) };
  const nextBlockers = {};

  delete nextAttackers[instanceId];

  Object.entries(normalizedCombatState.blockers || {}).forEach(([blockerId, attackerIds]) => {
    if (blockerId === instanceId) return;
    const filteredAttackers = (attackerIds || []).filter((attackerId) => attackerId !== instanceId);
    if (filteredAttackers.length > 0) {
      nextBlockers[blockerId] = filteredAttackers;
    }
  });

  return { ...normalizedCombatState, attackers: nextAttackers, blockers: nextBlockers };
};


const buildDuplicateDisplayNameMap = (cards = []) => {
  const grouped = new Map();
  cards.forEach((card) => {
    if (!card?.instanceId) return;
    const key = (getCardDisplayName(card, 'Unknown') || '').trim() || 'Unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(card.instanceId);
  });

  const labels = new Map();
  grouped.forEach((ids, name) => {
    const total = ids.length;
    ids.forEach((id, index) => {
      labels.set(id, total > 1 ? `${name} (${index + 1}/${total})` : name);
    });
  });
  return labels;
};



const TARGET_PLAYER_PREFIX = 'player:';
const getPlayerTargetIdFromRaw = (value) => typeof value === 'string' && value.startsWith(TARGET_PLAYER_PREFIX) ? value.slice(TARGET_PLAYER_PREFIX.length) : null;

const getPublicTargetDisplayName = (targetId, currentGame, displayNameMap = null, fallback = 'a target') => {
  const playerId = getPlayerTargetIdFromRaw(targetId);
  if (playerId) return getPlayerNameById(currentGame, playerId, 'Player');

  const card = (currentGame?.cards || []).find((candidate) => candidate.instanceId === targetId);
  if (!card) return fallback;
  if (card.faceDown) return 'a face-down card';
  if (!isPublicZone(card.zone)) return fallback;

  const publicDisplayNames = displayNameMap || buildDuplicateDisplayNameMap(
    (currentGame?.cards || []).filter((candidate) => isPublicZone(candidate.zone))
  );
  return publicDisplayNames.get(card.instanceId) || getCardDisplayName(card, fallback);
};

const getPublicSourceDisplayName = (sourceId, currentGame, displayNameMap = null, fallback = 'a source') => {
  const stackItem = (currentGame?.stack || []).find((item) => item?.id === sourceId || item?.sourceId === sourceId);
  if (stackItem?.name) return stackItem.name;

  const sourceCard = (currentGame?.cards || []).find((candidate) => candidate.instanceId === sourceId);
  if (!sourceCard) return fallback;
  if (sourceCard.faceDown) return 'a face-down card';
  if (!isPublicZone(sourceCard.zone)) return fallback;

  const publicDisplayNames = displayNameMap || buildDuplicateDisplayNameMap(
    (currentGame?.cards || []).filter((candidate) => isPublicZone(candidate.zone))
  );
  return publicDisplayNames.get(sourceCard.instanceId) || getCardDisplayName(sourceCard, fallback);
};

const getStackItemTargets = (item) => [
  ...((item?.targetIds || []).map((targetId) => ({ targetId, targetType: 'card' }))),
  ...((item?.targetPlayerIds || []).map((playerId) => ({ targetId: `${TARGET_PLAYER_PREFIX}${playerId}`, targetType: 'player' })))
];

const getCardTargetInfo = (cardOrStackItem, currentGame, displayNameMap = null) => {
  const targetEntries = currentGame?.targets || [];
  const stackItems = currentGame?.stack || [];
  const isStackItem = Boolean(cardOrStackItem?.sourceId && (cardOrStackItem?.targetIds || cardOrStackItem?.targetPlayerIds || cardOrStackItem?.itemType || cardOrStackItem?.type));
  const cardId = isStackItem ? cardOrStackItem?.sourceId : cardOrStackItem?.instanceId;
  const stackItemId = isStackItem ? cardOrStackItem?.id : null;

  const publicDisplayNames = displayNameMap || buildDuplicateDisplayNameMap(
    (currentGame?.cards || []).filter((candidate) => isPublicZone(candidate.zone))
  );

  const chosenTargets = [];
  const addChosenTarget = (targetId, sourceType = 'manual') => {
    if (!targetId) return;
    chosenTargets.push({
      targetId,
      targetType: getPlayerTargetIdFromRaw(targetId) ? 'player' : 'card',
      displayName: getPublicTargetDisplayName(targetId, currentGame, publicDisplayNames),
      sourceType
    });
  };

  if (isStackItem) {
    getStackItemTargets(cardOrStackItem).forEach(({ targetId }) => addChosenTarget(targetId, 'stack'));
  } else if (cardId) {
    targetEntries
      .filter((entry) => entry?.sourceId === cardId)
      .forEach((entry) => addChosenTarget(entry.targetId, 'manual'));

    stackItems
      .filter((item) => item?.sourceId === cardId)
      .forEach((item) => getStackItemTargets(item).forEach(({ targetId }) => addChosenTarget(targetId, 'stack')));
  }

  const targetedBy = [];
  const addTargetedBy = ({ sourceId, stackItem = null, controllerId = null, sourceType = 'manual' }) => {
    if (!sourceId && !stackItem?.sourceId) return;
    const resolvedSourceId = sourceId || stackItem?.sourceId;
    targetedBy.push({
      sourceId: resolvedSourceId,
      stackItemId: stackItem?.id || null,
      displayName: stackItem?.name || getPublicSourceDisplayName(resolvedSourceId, currentGame, publicDisplayNames),
      controllerId: controllerId || stackItem?.controllerId || null,
      controllerName: getPlayerNameById(currentGame, controllerId || stackItem?.controllerId, 'Player'),
      sourceType
    });
  };

  if (cardId && !isStackItem) {
    targetEntries
      .filter((entry) => entry?.targetId === cardId)
      .forEach((entry) => addTargetedBy({ sourceId: entry.sourceId, controllerId: entry.controllerId, sourceType: 'manual' }));

    stackItems.forEach((item) => {
      if ((item?.targetIds || []).includes(cardId)) {
        addTargetedBy({ stackItem: item, sourceType: 'stack' });
      }
    });
  } else if (stackItemId) {
    targetEntries
      .filter((entry) => entry?.targetId === stackItemId)
      .forEach((entry) => addTargetedBy({ sourceId: entry.sourceId, controllerId: entry.controllerId, sourceType: 'manual' }));
  }

  return {
    cardId: cardId || stackItemId || null,
    targetsChosenByThisCard: chosenTargets,
    targetDisplayNames: chosenTargets.map((target) => target.displayName),
    targetedByCards: targetedBy,
    targetedByDisplayNames: targetedBy.map((source) => source.displayName),
    targetedByPlayers: targetedBy.map((source) => ({ playerId: source.controllerId, name: source.controllerName })).filter((player) => player.playerId),
    hasTargets: chosenTargets.length > 0,
    isTargeted: targetedBy.length > 0
  };
};

const formatTargetListInline = (names = [], maxItems = 2) => {
  const cleanNames = names.filter(Boolean);
  if (cleanNames.length === 0) return '';
  const shown = cleanNames.slice(0, maxItems).join(', ');
  const remaining = cleanNames.length - maxItems;
  return remaining > 0 ? `${shown} +${remaining}` : shown;
};

const getCombatDisplayName = (cardOrId, currentGame, displayNameMap = null) => {
  const card = typeof cardOrId === 'string'
    ? (currentGame?.cards || []).find((candidate) => candidate.instanceId === cardOrId)
    : cardOrId;
  if (!card) return 'Unknown';
  const battlefieldDisplayNames = displayNameMap || buildDuplicateDisplayNameMap(
    (currentGame?.cards || []).filter((candidate) => candidate.zone === ZONES.BATTLEFIELD)
  );
  return battlefieldDisplayNames.get(card.instanceId) || getCardDisplayName(card, 'Unknown');
};

const getAttackTargetObjectId = (attackTarget) => attackTarget?.id || attackTarget?.targetId || null;

const getOpponentPlayerForController = (currentGame, controllerId) => {
  const players = currentGame?.players || [];
  return players.find((player) => player.id !== controllerId) || players[0] || null;
};

const getAttackableCardKind = (card) => {
  if (!card || card.faceDown || card.zone !== ZONES.BATTLEFIELD) return null;
  const typeLine = getCardTypeLine(card).toLowerCase();
  if (typeLine.includes('planeswalker')) return 'planeswalker';
  if (typeLine.includes('battle')) return 'battle';
  return null;
};

const getAttackTargetLabelPrefix = (kind) => {
  if (kind === 'planeswalker') return 'Planeswalker';
  if (kind === 'battle') return 'Battle';
  if (kind === 'player') return 'Player';
  return null;
};

const normalizeAttackTarget = (attackTarget, currentGame, attackerCard = null, displayNameMap = null) => {
  if (!attackTarget || typeof attackTarget !== 'object') {
    const defender = getOpponentPlayerForController(currentGame, attackerCard?.controllerId);
    return defender ? { type: 'player', id: defender.id, targetId: defender.id, label: defender.name || 'Player', kind: 'player' } : null;
  }

  const rawType = attackTarget.type || 'player';
  const rawId = getAttackTargetObjectId(attackTarget);
  if (rawType === 'player') {
    const playerId = rawId || getOpponentPlayerForController(currentGame, attackerCard?.controllerId)?.id || null;
    const player = (currentGame?.players || []).find((candidate) => candidate.id === playerId);
    return {
      ...attackTarget,
      type: 'player',
      id: playerId,
      targetId: playerId,
      label: attackTarget.label || player?.name || 'Player',
      kind: 'player'
    };
  }

  const targetCard = (currentGame?.cards || []).find((candidate) => candidate.instanceId === rawId);
  const detectedKind = getAttackableCardKind(targetCard);
  const kind = attackTarget.kind || (rawType === 'planeswalker' || rawType === 'battle' ? rawType : detectedKind) || 'card';
  const cardLabel = targetCard ? getCombatDisplayName(targetCard, currentGame, displayNameMap) : null;
  return {
    ...attackTarget,
    type: 'card',
    id: rawId,
    targetId: rawId,
    label: attackTarget.label || cardLabel || attackTarget.name || 'Card',
    kind
  };
};

const getCombatAttackTargetName = (attackTarget, currentGame, displayNameMap = null, attackerCard = null) => {
  const normalizedTarget = normalizeAttackTarget(attackTarget, currentGame, attackerCard, displayNameMap);
  if (!normalizedTarget) return null;
  return normalizedTarget.label || null;
};

const getCardCombatInfo = (card, currentGame, displayNameMapOverride = null) => {
  const combat = normalizeCombatState(currentGame?.combat);
  const attackers = combat.attackers || {};
  const blockers = combat.blockers || {};
  const instanceId = card?.instanceId || null;
  const displayNameMap = displayNameMapOverride || buildDuplicateDisplayNameMap(
    (currentGame?.cards || []).filter((candidate) => candidate.zone === ZONES.BATTLEFIELD)
  );
  const hasAttackerAssignment = Boolean(instanceId && Object.prototype.hasOwnProperty.call(attackers, instanceId));
  const attackingTarget = hasAttackerAssignment ? attackers[instanceId] : null;
  const blockedByIds = instanceId
    ? Object.entries(blockers)
      .filter(([, attackerIds]) => Array.isArray(attackerIds) && attackerIds.includes(instanceId))
      .map(([blockerId]) => blockerId)
    : [];
  const blockingIds = instanceId && Array.isArray(blockers[instanceId]) ? blockers[instanceId] : [];

  return {
    cardId: instanceId,
    cardName: card?.name || 'Unknown',
    controllerId: card?.controllerId || null,
    isAttacking: hasAttackerAssignment,
    attackingTargetId: normalizeAttackTarget(attackingTarget, currentGame, card, displayNameMap)?.id || null,
    attackingTargetName: getCombatAttackTargetName(attackingTarget, currentGame, displayNameMap, card),
    isBlocked: blockedByIds.length > 0,
    blockedByIds,
    blockedByDisplayNames: blockedByIds.map((id) => getCombatDisplayName(id, currentGame, displayNameMap)),
    isBlocking: blockingIds.length > 0,
    blockingIds,
    blockedAttackerIds: blockingIds,
    blockingDisplayNames: blockingIds.map((id) => getCombatDisplayName(id, currentGame, displayNameMap))
  };
};

const hasAnyCombatInfo = (combatInfo) => Boolean(combatInfo?.isAttacking || combatInfo?.isBlocked || combatInfo?.isBlocking);

const shortenCombatName = (name, maxLength = 18) => {
  if (!name) return 'Unknown';
  if (name.length <= maxLength) return name;
  const duplicateSuffix = name.match(/\s+\(\d+\/\d+\)$/)?.[0] || '';
  const baseName = duplicateSuffix ? name.slice(0, -duplicateSuffix.length).trim() : name;
  const words = baseName.split(/\s+/).filter(Boolean);
  const meaningfulBase = words.length > 1 ? words[words.length - 1] : baseName;
  const shortened = `${meaningfulBase}${duplicateSuffix}`;
  return shortened.length <= maxLength ? shortened : `${shortened.slice(0, Math.max(1, maxLength - 1))}…`;
};

const getCombatInfoLogPayload = (combatInfo, renderContext) => ({
  cardName: combatInfo?.cardName || 'Unknown',
  instanceId: combatInfo?.cardId || null,
  controllerId: combatInfo?.controllerId || null,
  isAttacking: Boolean(combatInfo?.isAttacking),
  attackingTargetName: combatInfo?.attackingTargetName || null,
  isBlocked: Boolean(combatInfo?.isBlocked),
  blockedByDisplayNames: combatInfo?.blockedByDisplayNames || [],
  isBlocking: Boolean(combatInfo?.isBlocking),
  blockingDisplayNames: combatInfo?.blockingDisplayNames || [],
  renderContext
});

const logRenderedCombatInfo = (combatInfo, renderContext) => {
  if (!combatInfo?.cardId) return;
  console.log('[CARD_COMBAT_INFO_RENDER]', getCombatInfoLogPayload(combatInfo, renderContext));
};

const getNextCombatState = (currentGame, nextPhase, turnChanged = false) => {
  if (!isCombatPhase(nextPhase) || turnChanged || shouldClearCombatState(currentGame.phase, nextPhase)) {
    return getEmptyCombatState();
  }
  return normalizeCombatState(currentGame.combat || getEmptyCombatState());
};

const advancePassPriorityState = (currentGame, logEntry, onTurnStart, layoutOptions = {}) => {
  const players = currentGame.players || [];
  const updatedGame = {
    ...currentGame,
    cards: [...(currentGame.cards || [])],
    stack: [...(currentGame.stack || [])],
    log: [...(currentGame.log || [])]
  };
  const actorName = logEntry.playerName || getPlayerNameById(currentGame, logEntry.playerId, 'Player');
  const withUpdatedLogContext = (entry, type, category, message, overrides = {}) => ({
    ...entry,
    type,
    category,
    turnNumber: updatedGame.turnNumber ?? entry.turnNumber ?? null,
    turnPlayerId: updatedGame.turnPlayerId || entry.turnPlayerId || null,
    phase: updatedGame.phase || entry.phase || null,
    phaseLabel: getPhaseLabel(updatedGame.phase || entry.phase),
    message,
    desc: message,
    ...overrides
  });

  if (players.length < 2) {
    const currentPhaseIdx = PHASES.findIndex(p => p.id === currentGame.phase);
    const nextPhaseIdx = (currentPhaseIdx + 1) % PHASES.length;
    const nextPhase = PHASES[nextPhaseIdx];

    let nextTurnNum = currentGame.turnNumber;
    if (nextPhase.id === 'untap') nextTurnNum++;

    updatedGame.combat = getNextCombatState(currentGame, nextPhase.id, nextPhase.id === 'untap');

    updatedGame.phase = nextPhase.id;
    updatedGame.turnNumber = nextTurnNum;
    updatedGame.log.push(withUpdatedLogContext(logEntry, 'PHASE_ADVANCE', 'phase', `${actorName} moved to ${nextPhase.label}.`));

    if (shouldResetTemporaryDamageForPhase(nextPhase.id)) {
      updatedGame.cards = resetTemporaryDamage(updatedGame.cards);
    }

    if (nextPhase.id === 'untap') {
      if (onTurnStart) onTurnStart(buildTurnStartEvent(updatedGame));
      updatedGame.cards = updatedGame.cards.map(c => {
        if (c.controllerId === logEntry.playerId && c.zone === ZONES.BATTLEFIELD) return { ...c, tapped: false };
        return c;
      });
    }

    return updatedGame;
  }

  const nextPriorityIdx = (currentGame.priorityIndex + 1) % players.length;
  const allPassed = (currentGame.consecutivePasses + 1) >= players.length;

  if (allPassed) {
    if (updatedGame.stack.length > 0) {
      const item = updatedGame.stack[updatedGame.stack.length - 1];
      updatedGame.stack.pop();

      const cardIndex = updatedGame.cards.findIndex(c => c.instanceId === item.sourceId);
      if (cardIndex >= 0) {
        const card = { ...updatedGame.cards[cardIndex] };
        const typeLine = getCardTypeLine(card).toLowerCase();
        const isPerm = !typeLine.includes('instant') && !typeLine.includes('sorcery');
        card.zone = isPerm ? ZONES.BATTLEFIELD : ZONES.GRAVEYARD;
        card.tapped = false;

        if (isPerm) {
          const battlefieldWidthPx = layoutOptions.getBattlefieldWidthForController?.(card.controllerId);
          const spawnPosition = getBattlefieldGridPosition({
            card,
            existingBattlefieldCards: updatedGame.cards,
            controllerId: card.controllerId,
            containerWidth: battlefieldWidthPx
          });
          Object.assign(card, getBattlefieldPositionCoordinates(spawnPosition));
          logBattlefieldEntry(card, 'STACK_RESOLUTION', spawnPosition);
        }

        updatedGame.cards[cardIndex] = card;
      }

      updatedGame.consecutivePasses = 0;
      updatedGame.priorityIndex = currentGame.activePlayerIndex;
      updatedGame.priorityPlayerId = players[currentGame.activePlayerIndex]?.id || currentGame.priorityPlayerId;
      updatedGame.log.push(withUpdatedLogContext(logEntry, 'RESOLVE_SPELL', 'stack', `${item.name} resolved.`, { cardName: item.name, cardId: item.sourceId }));
      return updatedGame;
    }

    const currentPhaseIdx = PHASES.findIndex(p => p.id === currentGame.phase);
    const nextPhaseIdx = (currentPhaseIdx + 1) % PHASES.length;
    const nextPhase = PHASES[nextPhaseIdx];

    let nextTurnNum = currentGame.turnNumber;
    let nextActivePlayerIdx = currentGame.activePlayerIndex;
    let nextTurnPlayerId = currentGame.turnPlayerId;

    if (nextPhase.id === 'untap') {
      nextTurnNum++;
      nextActivePlayerIdx = (currentGame.activePlayerIndex + 1) % players.length;
      nextTurnPlayerId = players[nextActivePlayerIdx].id;
    }

    updatedGame.combat = getNextCombatState(currentGame, nextPhase.id, nextPhase.id === 'untap');

    updatedGame.phase = nextPhase.id;
    updatedGame.consecutivePasses = 0;
    updatedGame.priorityIndex = nextActivePlayerIdx;
    updatedGame.priorityPlayerId = players[nextActivePlayerIdx].id;
    updatedGame.activePlayerIndex = nextActivePlayerIdx;
    updatedGame.turnPlayerId = nextTurnPlayerId;
    updatedGame.turnNumber = nextTurnNum;
    updatedGame.log.push(withUpdatedLogContext(logEntry, 'PHASE_ADVANCE', 'phase', `${actorName} moved to ${nextPhase.label}.`));

    if (shouldResetTemporaryDamageForPhase(nextPhase.id)) {
      updatedGame.cards = resetTemporaryDamage(updatedGame.cards);
    }

    if (nextPhase.id === 'untap') {
      if (onTurnStart) onTurnStart(buildTurnStartEvent(updatedGame));
      updatedGame.cards = updatedGame.cards.map(c => {
        if (c.controllerId === nextTurnPlayerId && c.zone === ZONES.BATTLEFIELD) return { ...c, tapped: false };
        return c;
      });
    }

    return updatedGame;
  }

  const nextPlayerId = players[nextPriorityIdx].id;
  updatedGame.consecutivePasses = currentGame.consecutivePasses + 1;
  updatedGame.priorityIndex = nextPriorityIdx;
  updatedGame.priorityPlayerId = nextPlayerId;
  updatedGame.log.push(withUpdatedLogContext(logEntry, 'PASS_PRIORITY', 'priority', `${actorName} passed priority.`));
  return updatedGame;
};


const runProxyAutoPassAdvances = (startingGame, actorId, actorName, onTurnStart) => {
  let workingGame = {
    ...startingGame,
    cards: [...(startingGame.cards || [])],
    stack: [...(startingGame.stack || [])],
    log: [...(startingGame.log || [])],
    autopass: { ...(startingGame.autopass || {}) }
  };

  let advances = 0;
  while (advances < MAX_PROXY_AUTOPASS_ADVANCES) {
    const autoPassPlayerId = workingGame.priorityPlayerId;
    if (!autoPassPlayerId) break;

    const players = workingGame.players || [];
    const autoPassPlayer = players.find(p => p.id === autoPassPlayerId);
    if (!autoPassPlayer) break;

    const config = getPlayerAutoPassConfig(workingGame, autoPassPlayerId);
    if (config.mode === AUTO_PASS_MODE.OFF) break;
    if ((workingGame.stack || []).length > 0) break;
    if (hasReachedAutoPassTarget(workingGame, config)) {
      workingGame.autopass[autoPassPlayerId] = getDefaultAutoPassConfig();
      break;
    }

    const latestLog = (workingGame.log || [])[workingGame.log.length - 1];
    if (config.stopOnOpponentAction && isMeaningfulOpponentAction(latestLog, autoPassPlayerId)) {
      workingGame.autopass[autoPassPlayerId] = getDefaultAutoPassConfig();
      break;
    }

    const proxyLogEntry = buildGameLogEntry({
      currentGame: workingGame,
      timestamp: Date.now() + advances + 1,
      playerId: autoPassPlayerId,
      playerName: autoPassPlayer.name || 'Unknown',
      type: 'PASS_PRIORITY',
      category: 'priority',
      message: `${autoPassPlayer.name || 'Unknown'} passed priority.`,
      actorId,
      actorName: actorName || 'Proxy'
    });

    workingGame = advancePassPriorityState(workingGame, proxyLogEntry, onTurnStart);
    advances += 1;

    const nextConfig = getPlayerAutoPassConfig(workingGame, autoPassPlayerId);
    if (hasReachedAutoPassTarget(workingGame, nextConfig)) {
      workingGame.autopass[autoPassPlayerId] = getDefaultAutoPassConfig();
      break;
    }
  }

  return { game: workingGame, advances };
};
// --- Components ---
const Lobby = ({
  onCreate,
  onJoin,
  onWatch,
  onStartTutorial,
  onDeleteGame,
  onLoadCleanupGames,
  onDeleteCleanupGames,
  cleanupGames,
  isCleanupLoading,
  isCleanupDeleting,
  cleanupError,
  activeGameId,
  onContinueWithGoogle,
  onSignOut,
  myGames,
  toastMessage,
  suggestedName,
  isError,
  errorMsg,
  currentUser,
  isActionLoading
}) => {
  const [name, setName] = useState('');
  const [gameTitle, setGameTitle] = useState('');
  const [gameMode, setGameMode] = useState(GAME_MODES.REGULAR);
  const [code, setCode] = useState('');
  const [mode, setMode] = useState('menu');
  const [pendingDeleteGame, setPendingDeleteGame] = useState(null);
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);
  const [selectedCleanupIds, setSelectedCleanupIds] = useState(() => new Set());
  const [deletingCleanupIds, setDeletingCleanupIds] = useState(() => new Set());
  const [failedCleanupMessages, setFailedCleanupMessages] = useState({});
  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [lobbyTutorialOpen, setLobbyTutorialOpen] = useState(false);
  const [lobbyTutorialIndex, setLobbyTutorialIndex] = useState(0);
  const [lobbyTutorialMinimized, setLobbyTutorialMinimized] = useState(false);
  const [lobbyTutorialDock, setLobbyTutorialDock] = useState('bottom');
  const [lobbyTutorialReaction, setLobbyTutorialReaction] = useState('');
  const lobbyTutorialAdvanceTimerRef = useRef(null);
  const isInitLoading = !currentUser;
  const isGoogleConnected = currentUser?.isAnonymous === false;
  const effectiveName = name || suggestedName || '';
  const selectedCleanupGames = cleanupGames.filter((game) => selectedCleanupIds.has(game.id));
  const requiresDeleteText = selectedCleanupGames.length > 1;
  const canConfirmCleanup = selectedCleanupGames.length > 0 && (!requiresDeleteText || cleanupConfirmText === 'DELETE') && !isCleanupDeleting;
  const lobbyTutorialScene = TUTORIAL_LOBBY_SCENES[Math.min(lobbyTutorialIndex, TUTORIAL_LOBBY_SCENES.length - 1)];
  const isLobbyTutorialActive = lobbyTutorialOpen && lobbyTutorialScene;

  useEffect(() => () => {
    if (lobbyTutorialAdvanceTimerRef.current) window.clearTimeout(lobbyTutorialAdvanceTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isLobbyTutorialActive || !lobbyTutorialScene?.anchor || typeof document === 'undefined') return undefined;
    const updateDock = () => {
      const target = document.querySelector(`[data-tutorial-anchor="${lobbyTutorialScene.anchor}"]`);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const viewportMid = window.innerHeight / 2;
      setLobbyTutorialDock(rect.top > viewportMid ? 'top' : 'bottom');
    };
    const rafId = window.requestAnimationFrame(updateDock);
    window.addEventListener('resize', updateDock);
    window.addEventListener('scroll', updateDock, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateDock);
      window.removeEventListener('scroll', updateDock, true);
    };
  }, [isLobbyTutorialActive, lobbyTutorialScene?.anchor]);

  const focusLobbyTutorialTarget = () => {
    if (!lobbyTutorialScene?.anchor || typeof document === 'undefined') return;
    setLobbyTutorialMinimized(true);
    const target = document.querySelector(`[data-tutorial-anchor="${lobbyTutorialScene.anchor}"]`);
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
    target?.classList?.add('tutorial-target-pulse');
    setTimeout(() => target?.classList?.remove('tutorial-target-pulse'), 1600);
  };

  const advanceLobbyTutorial = ({ launchFinal = false } = {}) => {
    if (lobbyTutorialAdvanceTimerRef.current) {
      window.clearTimeout(lobbyTutorialAdvanceTimerRef.current);
      lobbyTutorialAdvanceTimerRef.current = null;
    }
    if (lobbyTutorialScene?.final) {
      if (!launchFinal) return;
      setLobbyTutorialOpen(false);
      onStartTutorial(effectiveName);
      return;
    }
    setLobbyTutorialReaction('');
    setLobbyTutorialIndex((current) => Math.min(current + 1, TUTORIAL_LOBBY_SCENES.length - 1));
  };

  const completeLobbyTutorialStep = (stepId) => {
    if (!isLobbyTutorialActive || lobbyTutorialScene.id !== stepId || lobbyTutorialAdvanceTimerRef.current) return false;
    if (lobbyTutorialScene.final) {
      setLobbyTutorialOpen(false);
      onStartTutorial(effectiveName);
      return true;
    }
    setLobbyTutorialReaction(lobbyTutorialScene.reaction || 'Good. Continue.');
    lobbyTutorialAdvanceTimerRef.current = window.setTimeout(() => {
      lobbyTutorialAdvanceTimerRef.current = null;
      setLobbyTutorialReaction('');
      setLobbyTutorialIndex((current) => Math.min(current + 1, TUTORIAL_LOBBY_SCENES.length - 1));
    }, 900);
    return true;
  };

  const startLobbyTutorial = () => {
    if (lobbyTutorialAdvanceTimerRef.current) {
      window.clearTimeout(lobbyTutorialAdvanceTimerRef.current);
      lobbyTutorialAdvanceTimerRef.current = null;
    }
    setLobbyTutorialIndex(0);
    setLobbyTutorialReaction('');
    setLobbyTutorialMinimized(false);
    setLobbyTutorialOpen(true);
    window.setTimeout(() => {
      const target = document.querySelector('[data-tutorial-anchor="lobby-name-input"]');
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
      target?.classList?.add('tutorial-target-pulse');
      setTimeout(() => target?.classList?.remove('tutorial-target-pulse'), 1600);
    }, 0);
  };

  const openCleanup = async () => {
    setIsCleanupOpen(true);
    await onLoadCleanupGames();
  };

  const closeCleanup = () => {
    setIsCleanupOpen(false);
    setSelectedCleanupIds(new Set());
    setDeletingCleanupIds(new Set());
    setFailedCleanupMessages({});
    setCleanupConfirmText('');
  };

  const toggleCleanupGame = (gameId) => {
    setSelectedCleanupIds((existing) => {
      const next = new Set(existing);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  };

  const selectOldInactiveCleanupGames = () => {
    setSelectedCleanupIds(new Set(
      cleanupGames
        .filter((game) => game.id !== activeGameId && isCleanupCandidateOld(game))
        .map((game) => game.id)
    ));
  };

  const confirmCleanupDelete = async () => {
    if (!canConfirmCleanup) return;
    setFailedCleanupMessages({});
    setDeletingCleanupIds(new Set(selectedCleanupGames.map((game) => game.id)));
    const result = await onDeleteCleanupGames(selectedCleanupGames);
    const failedItems = Array.isArray(result) ? result.map((id) => ({ id })) : result?.failed || [];
    const nextFailedMessages = failedItems.reduce((messages, item) => {
      if (item?.id) messages[item.id] = item.message || 'Delete failed.';
      return messages;
    }, {});
    setFailedCleanupMessages(nextFailedMessages);
    setSelectedCleanupIds((existing) => new Set([...existing].filter((id) => failedItems.some((item) => item.id === id))));
    setDeletingCleanupIds(new Set());
    setCleanupConfirmText('');
  };

  const openGameFromHistory = (game) => {
    const params = new URLSearchParams({ room: game.roomCode });
    if (game.role === 'spectator') params.set('mode', 'viewer');
    window.open(`/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
      <PerfDebugIndicator />
      <div className="max-w-md w-full space-y-8 relative">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Async MTG
          </h1>
          <p className="mt-2 text-slate-400">The Swiss Army Knife for Magic</p>
        </div>

        {isError && (
          <div className="bg-red-500/20 border border-red-500 p-4 rounded-lg text-red-200 text-sm flex items-start gap-3">
            <AlertTriangle className="shrink-0 text-red-400" size={20} />
            <div>
              <strong>Error:</strong> {errorMsg}
            </div>
          </div>
        )}

        <div className="bg-slate-800 p-6 rounded-xl shadow-xl border border-slate-700 space-y-4">
          <div
            className={`rounded-lg border p-3 ${
              isGoogleConnected
                ? 'bg-emerald-950/40 border-emerald-700/60'
                : 'bg-slate-900 border-slate-700'
            }`}
          >
            {isGoogleConnected ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                  <Check size={16} />
                  <span>Signed in with Google</span>
                </div>
                {currentUser?.displayName && (
                  <div className="text-sm text-slate-200 break-words">{currentUser.displayName}</div>
                )}
                {currentUser?.email && (
                  <div className="text-sm text-slate-300 break-all">{currentUser.email}</div>
                )}
                {currentUser?.uid && (
                  <div className="text-xs text-slate-400 font-mono break-all">UID: {currentUser.uid}</div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-300">Guest mode</div>
                {currentUser?.uid && (
                  <div className="text-xs text-slate-400 font-mono break-all">UID: {currentUser.uid}</div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Your Name</label>
            <input
              data-tutorial-anchor="lobby-name-input"
              type="text"
              value={effectiveName}
              onFocus={() => { if (effectiveName.trim()) completeLobbyTutorialStep('name'); }}
              onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) completeLobbyTutorialStep('name'); }}
              className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
              placeholder="Planeswalker Name"
            />
          </div>

          {mode === 'menu' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  data-tutorial-anchor="lobby-create-game"
                  onClick={() => {
                    if (completeLobbyTutorialStep('create')) return;
                    if (isLobbyTutorialActive) { focusLobbyTutorialTarget(); return; }
                    onCreate(effectiveName, gameTitle, gameMode);
                  }}
                  disabled={!effectiveName.trim() || isInitLoading || isActionLoading}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-wait text-white p-3 rounded-lg font-bold transition-colors flex justify-center items-center gap-2"
                >
                  {isActionLoading ? <Loader2 className="animate-spin" size={18}/> : 'Create Game'}
                </button>
                <button
                  data-tutorial-anchor="lobby-join-game"
                  onClick={() => {
                    if (completeLobbyTutorialStep('join')) return;
                    if (isLobbyTutorialActive) { focusLobbyTutorialTarget(); return; }
                    setMode('join');
                  }}
                  disabled={!effectiveName.trim() || isInitLoading || isActionLoading}
                  className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-wait text-white p-3 rounded-lg font-bold transition-colors flex justify-center items-center gap-2"
                >
                  {isInitLoading ? <Loader2 className="animate-spin" size={18}/> : 'Join Game'}
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Game Title (optional)</label>
                <input
                  type="text"
                  value={gameTitle}
                  data-tutorial-anchor="lobby-game-title"
                  onFocus={() => completeLobbyTutorialStep('title')}
                  onChange={(e) => { setGameTitle(e.target.value); completeLobbyTutorialStep('title'); }}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="e.g. 'Mono-Red vs Elves'"
                  maxLength={80}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Game Mode</label>
                <div data-tutorial-anchor="lobby-game-mode" className="grid grid-cols-2 gap-2">
                  {[
                    { id: GAME_MODES.REGULAR, label: 'Regular', detail: '20 life' },
                    { id: GAME_MODES.COMMANDER, label: 'Commander', detail: '40 life' }
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => { setGameMode(option.id); completeLobbyTutorialStep('laws'); }}
                      className={`rounded-lg border p-3 text-left transition-colors ${gameMode === option.id ? 'border-purple-400 bg-purple-900/40 text-white' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'}`}
                    >
                      <div className="text-sm font-bold">{option.label}</div>
                      <div className="text-xs text-slate-400">{option.detail}</div>
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" data-tutorial-anchor="lobby-room-code-example" onClick={() => completeLobbyTutorialStep('room_code')} className="w-full rounded-lg border border-slate-700 bg-slate-900/70 p-2 text-left text-xs text-slate-400 hover:border-amber-400/60">Example room code: <span className="font-mono tracking-widest text-slate-200">A7X92B</span></button>
              <button
                data-tutorial-anchor="lobby-watch-game"
                onClick={() => {
                  if (completeLobbyTutorialStep('watch')) return;
                  if (isLobbyTutorialActive) { focusLobbyTutorialTarget(); return; }
                  setMode('watch');
                }}
                disabled={!effectiveName.trim() || isInitLoading || isActionLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait text-white p-3 rounded-lg font-bold transition-colors flex justify-center items-center gap-2"
              >
                {isInitLoading ? <Loader2 className="animate-spin" size={18}/> : 'Watch Game'}
              </button>
              <button
                type="button"
                data-tutorial-anchor="lobby-tutorial-start"
                onClick={() => {
                  if (isLobbyTutorialActive && lobbyTutorialScene?.final) {
                    completeLobbyTutorialStep('begin');
                    return;
                  }
                  if (isLobbyTutorialActive) { focusLobbyTutorialTarget(); return; }
                  startLobbyTutorial();
                }}
                disabled={!effectiveName.trim() || isInitLoading || isActionLoading}
                className="w-full rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-950/80 to-purple-950/70 p-3 text-left text-amber-50 transition-colors hover:border-amber-300/70 hover:from-amber-900/80 hover:to-purple-900/80 disabled:cursor-wait disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-extrabold">Start Tutorial Battle</div>
                    <div className="mt-0.5 text-xs font-medium text-amber-100/80">Learn the app in a scripted duel against Nicol Bolas.</div>
                  </div>
                  {isActionLoading ? <Loader2 className="shrink-0 animate-spin" size={18}/> : <ArrowRight className="shrink-0 text-amber-200" size={18}/>} 
                </div>
              </button>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Room Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none tracking-widest font-mono uppercase"
                  placeholder="A7X92B"
                  maxLength={6}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setMode('menu')}
                  disabled={isActionLoading}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white p-3 rounded-lg font-bold"
                >
                  Back
                </button>
                <button
                  onClick={() => onJoin(effectiveName, code)}
                  disabled={!code || isInitLoading || isActionLoading}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white p-3 rounded-lg font-bold flex justify-center items-center gap-2"
                >
                  {isActionLoading ? <Loader2 className="animate-spin" size={18}/> : 'Enter'}
                </button>
              </div>
            </div>
          )}

          {mode === 'watch' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Room Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none tracking-widest font-mono uppercase"
                  placeholder="A7X92B"
                  maxLength={6}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setMode('menu')}
                  disabled={isActionLoading}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white p-3 rounded-lg font-bold"
                >
                  Back
                </button>
                <button
                  onClick={() => onWatch(effectiveName, code)}
                  disabled={!code || isInitLoading || isActionLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-3 rounded-lg font-bold flex justify-center items-center gap-2"
                >
                  {isActionLoading ? <Loader2 className="animate-spin" size={18}/> : 'Watch'}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={isGoogleConnected ? undefined : onContinueWithGoogle}
            disabled={isGoogleConnected || isInitLoading || isActionLoading}
            className={`w-full p-3 rounded-lg font-bold transition-colors ${
              isGoogleConnected
                ? 'bg-emerald-900/40 border border-emerald-700/50 text-emerald-200 cursor-default'
                : 'bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-wait'
            }`}
          >
            {isGoogleConnected ? 'Google connected' : 'Continue with Google'}
          </button>
          {isGoogleConnected && (
            <button
              onClick={onSignOut}
              disabled={isActionLoading}
              className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-wait text-white p-3 rounded-lg font-bold transition-colors flex justify-center items-center gap-2"
            >
              <LogOut size={16} />
              Sign out
            </button>
          )}

          <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
            Current ID: {currentUser ? (
              <span className="text-slate-300">{currentUser.uid.slice(0, 8) + '...'}</span>
            ) : (
              <span className="text-yellow-500 flex items-center gap-1"><Loader2 className="animate-spin" size={10}/> Initializing...</span>
            )}
            {isGoogleConnected && <span className="text-emerald-300">(Google)</span>}
          </div>

          <div data-tutorial-anchor="lobby-my-games" onClick={() => completeLobbyTutorialStep('my_games')} className="border border-slate-700 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-300">My Games</div>
              <button
                data-tutorial-anchor="lobby-cleanup-games"
                onClick={(event) => {
                  event.stopPropagation();
                  if (completeLobbyTutorialStep('cleanup')) return;
                  if (isLobbyTutorialActive) { focusLobbyTutorialTarget(); return; }
                  openCleanup();
                }}
                disabled={isInitLoading || isActionLoading || isCleanupLoading}
                className="text-[11px] bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-slate-300 border border-slate-700 rounded px-2 py-1 flex items-center gap-1"
              >
                {isCleanupLoading ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                Clean up old games
              </button>
            </div>
            {myGames.length === 0 ? (
              <div className="text-xs text-slate-500">No recent games yet.</div>
            ) : (
              <div className="space-y-2">
                {myGames.map((game) => (
                  <div
                    key={game.id}
                    className="bg-slate-900 p-2 rounded text-sm border border-slate-700 flex items-center gap-2"
                  >
                    <button
                      onClick={() => openGameFromHistory(game)}
                      className="flex-1 text-left hover:bg-slate-700/60 rounded p-1"
                    >
                      <div className="text-white truncate">{(game.title || '').trim() || game.roomCode || game.id}</div>
                      <div className="text-xs text-slate-400 capitalize">{game.role} • <span className="font-mono tracking-widest">{game.roomCode}</span></div>
                    </button>
                    <button
                      onClick={() => setPendingDeleteGame(game)}
                      className="p-2 rounded bg-slate-800 hover:bg-red-700/40 text-slate-300 hover:text-red-300"
                      aria-label={`Remove ${game.roomCode} from list`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {toastMessage && (
            <div className="text-xs text-emerald-300 bg-emerald-900/30 border border-emerald-800 rounded p-2">
              {toastMessage}
            </div>
          )}
        </div>
      </div>
      {pendingDeleteGame && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-800 w-full max-w-sm rounded-xl border border-slate-700 p-4 space-y-3">
            <div className="text-base font-semibold text-white">Delete or remove this game?</div>
            <div className="text-sm text-slate-300 space-y-2">
              <p>If you are the host, this deletes the game for everyone and cannot be undone.</p>
              <p>Delete this game permanently? This removes the game and its event history from Firebase.</p>
              <p>If you are not the host, it will only be removed from YOUR list.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingDeleteGame(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white p-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onDeleteGame(pendingDeleteGame);
                  setPendingDeleteGame(null);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white p-2 rounded"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {lobbyTutorialOpen && lobbyTutorialScene && (
        <div className={`pointer-events-none fixed inset-x-0 ${lobbyTutorialDock === 'top' ? 'top-16 sm:top-4' : 'bottom-4'} z-[100] px-3 sm:px-4`}>
          <div className={`pointer-events-auto mx-auto overflow-hidden rounded-2xl border border-amber-400/40 bg-slate-950/95 shadow-2xl shadow-black/60 backdrop-blur ${lobbyTutorialMinimized ? 'max-w-sm' : 'max-w-md'}`}>
            <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-gradient-to-r from-amber-950/80 to-purple-950/80 px-4 py-3">
              <button type="button" onClick={lobbyTutorialMinimized ? () => setLobbyTutorialMinimized(false) : undefined} className="min-w-0 flex-1 text-left" aria-label={lobbyTutorialMinimized ? 'Expand lobby tutorial' : undefined}>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Lobby Tutorial · {lobbyTutorialIndex + 1}/{TUTORIAL_LOBBY_SCENES.length}</div>
                <h2 className="mt-1 truncate text-sm font-black text-white">{lobbyTutorialScene.title}</h2>
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={focusLobbyTutorialTarget} className="rounded-full border border-amber-300/40 px-3 py-1.5 text-xs font-black text-amber-100 hover:bg-white/10">Show me</button>
                <button type="button" onClick={() => setLobbyTutorialMinimized((value) => !value)} className="rounded-full p-2 text-amber-100 hover:bg-white/10" aria-label={lobbyTutorialMinimized ? 'Expand lobby tutorial' : 'Minimize lobby tutorial'}>
                  {lobbyTutorialMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <button type="button" onClick={() => setLobbyTutorialOpen(false)} className="rounded-full p-2 text-slate-300 hover:bg-red-950/60 hover:text-red-100" aria-label="Exit lobby tutorial"><X size={16} /></button>
              </div>
            </div>
            {!lobbyTutorialMinimized && (
              <div className="space-y-3 p-4">
                <p className="text-sm text-slate-300">{lobbyTutorialScene.scene}</p>
                <p className="rounded-xl border border-purple-500/20 bg-purple-950/30 p-3 text-sm italic text-purple-100"><span className="font-black not-italic text-purple-200">Bolas:</span> “{lobbyTutorialScene.dialogue}”</p>
                {lobbyTutorialReaction && <p className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-sm font-bold text-amber-100">{lobbyTutorialReaction}</p>}
                <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm"><div className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Objective</div><div className="mt-1 text-slate-100">{lobbyTutorialScene.objective}</div></div>
                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm"><div className="text-[10px] font-black uppercase tracking-widest text-sky-300">Hint</div><div className="mt-1 text-slate-300">{lobbyTutorialScene.hint}</div></div>
                <div className="flex flex-wrap justify-between gap-2 pt-1">
                  <button type="button" onClick={() => { if (lobbyTutorialAdvanceTimerRef.current) { window.clearTimeout(lobbyTutorialAdvanceTimerRef.current); lobbyTutorialAdvanceTimerRef.current = null; } setLobbyTutorialReaction(''); setLobbyTutorialIndex((current) => Math.max(current - 1, 0)); }} disabled={lobbyTutorialIndex === 0} className="min-h-10 rounded-lg border border-slate-700 px-3 text-sm font-bold text-slate-300 disabled:opacity-40">Back</button>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={focusLobbyTutorialTarget} className="min-h-10 rounded-lg border border-amber-500/40 px-3 text-sm font-black text-amber-100">Show me</button>
                    <button type="button" onClick={() => setLobbyTutorialOpen(false)} className="min-h-10 rounded-lg border border-slate-700 px-3 text-sm font-bold text-slate-300">Exit</button>
                    <button type="button" onClick={() => advanceLobbyTutorial()} className="min-h-10 rounded-lg border border-slate-700 px-3 text-sm font-bold text-slate-400 hover:bg-slate-800">Skip Step</button>
                    <button type="button" disabled className="min-h-10 rounded-lg bg-slate-700 px-4 text-sm font-black text-slate-300 opacity-70">Waiting…</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isCleanupOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-800 w-full sm:max-w-2xl max-h-[88vh] rounded-t-2xl sm:rounded-xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-white">Old Game Cleanup</div>
                <div className="text-xs text-slate-400">Host-owned games only. Nothing is deleted until you select games and confirm.</div>
              </div>
              <button
                onClick={closeCleanup}
                disabled={isCleanupDeleting}
                className="p-2 rounded bg-slate-900 hover:bg-slate-700 text-slate-300"
                aria-label="Close cleanup"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              <div className="rounded-lg border border-red-700/70 bg-red-950/30 p-3 text-sm text-red-100 flex gap-2">
                <AlertTriangle className="shrink-0 text-red-300" size={18} />
                <div>This permanently deletes the selected games and their event history from Firebase. This cannot be undone.</div>
              </div>

              {cleanupError && (
                <div className="rounded-lg border border-yellow-700/70 bg-yellow-950/30 p-3 text-sm text-yellow-100 whitespace-pre-wrap">
                  {cleanupError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <div className="text-xs text-slate-400">{cleanupGames.length} host-owned candidate{cleanupGames.length === 1 ? '' : 's'} found.</div>
                <div className="flex gap-2">
                  <button
                    onClick={onLoadCleanupGames}
                    disabled={isCleanupLoading || isCleanupDeleting}
                    className="flex-1 sm:flex-none bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-2"
                  >
                    {isCleanupLoading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                    Refresh
                  </button>
                  <button
                    onClick={selectOldInactiveCleanupGames}
                    disabled={isCleanupLoading || isCleanupDeleting || cleanupGames.length === 0}
                    className="flex-1 sm:flex-none bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3 py-2 rounded text-sm"
                  >
                    Select old/inactive games
                  </button>
                </div>
              </div>

              {isCleanupLoading ? (
                <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin" size={18} /> Loading games…
                </div>
              ) : cleanupGames.length === 0 ? (
                <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">No old zombie game candidates found for your user.</div>
              ) : (
                <div className="space-y-2">
                  {cleanupGames.map((game) => {
                    const checked = selectedCleanupIds.has(game.id);
                    const isActive = game.id === activeGameId;
                    const isDeletingGame = deletingCleanupIds.has(game.id);
                    const failedMessage = failedCleanupMessages[game.id];
                    return (
                      <label
                        key={game.id}
                        className={`block rounded-lg border p-3 ${checked ? 'border-red-500 bg-red-950/20' : 'border-slate-700 bg-slate-900'} ${isActive ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isActive || isCleanupDeleting}
                            onChange={() => toggleCleanupGame(game.id)}
                            className="mt-1 h-4 w-4 accent-red-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                              <div className="font-mono text-sm text-white break-all">{game.id}</div>
                              <div className="flex flex-wrap items-center gap-2">
                                {isDeletingGame && (
                                  <span className="text-[11px] text-blue-200 flex items-center gap-1">
                                    <Loader2 className="animate-spin" size={12} /> Deleting…
                                  </span>
                                )}
                                {isActive && <span className="text-[11px] text-yellow-300">Currently active — not selectable</span>}
                              </div>
                            </div>
                            <div className="text-sm text-slate-200 truncate">{(game.title || '').trim() || 'Untitled game'}</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                              <div>Created: <span className="text-slate-300">{formatCleanupDate(game.createdAt)}</span></div>
                              <div>Updated: <span className="text-slate-300">{formatCleanupDate(game.updatedAt)}</span></div>
                              <div>Players: <span className="text-slate-300">{game.playerCount}</span></div>
                              <div>Cards: <span className="text-slate-300">{game.cardCount}</span></div>
                            </div>
                            {game.lastLogMessage && (
                              <div className="mt-2 text-xs text-slate-500 line-clamp-2">Last log: {game.lastLogMessage}</div>
                            )}
                            {failedMessage && (
                              <div className="mt-2 rounded border border-yellow-700/70 bg-yellow-950/30 p-2 text-xs text-yellow-100 whitespace-pre-wrap">{failedMessage}</div>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-700 space-y-3 bg-slate-900">
              {requiresDeleteText && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Type DELETE to confirm deleting {selectedCleanupGames.length} games.</label>
                  <input
                    type="text"
                    value={cleanupConfirmText}
                    onChange={(e) => setCleanupConfirmText(e.target.value)}
                    disabled={isCleanupDeleting}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-red-500 outline-none"
                    placeholder="DELETE"
                  />
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <button
                  onClick={closeCleanup}
                  disabled={isCleanupDeleting}
                  className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-2 rounded"
                >
                  Close
                </button>
                <button
                  onClick={confirmCleanupDelete}
                  disabled={!canConfirmCleanup}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-bold flex items-center justify-center gap-2"
                >
                  {isCleanupDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                  Delete selected ({selectedCleanupGames.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const getBattlefieldBadgeLayout = ({
  hasCombatBadge = false,
  hasTargetBadge = false,
  hasSourceBadge = false,
  hasDamageBadge = false,
  targetLabel = null,
  targetCount = 0
} = {}) => {
  const compactTargetLabel = targetCount > 1 ? `🎯${targetCount}` : '🎯';

  return {
    combatBadges: {
      show: hasCombatBadge,
      className: 'absolute inset-x-0 top-1 z-30 pointer-events-none flex flex-col items-start gap-0.5 px-1'
    },
    targetBadges: {
      show: hasTargetBadge || hasSourceBadge,
      targetLabel: hasTargetBadge && hasDamageBadge ? compactTargetLabel : targetLabel,
      showTargetCountSuffix: hasTargetBadge && !hasDamageBadge && targetCount > 1,
      className: `absolute bottom-1 left-1 z-30 pointer-events-none flex flex-col items-start gap-0.5 ${hasDamageBadge ? 'max-w-[1.75rem]' : 'max-w-[calc(100%-0.5rem)]'}`,
      badgeClassName: hasDamageBadge ? 'max-w-full min-w-[1.75rem] text-center' : 'max-w-full truncate'
    },
    damageBadge: {
      show: hasDamageBadge,
      className: 'absolute bottom-1 right-1 z-40 pointer-events-none max-w-[3.25rem] rounded-md border border-red-100/90 bg-red-700 text-white px-1.5 py-0.5 text-[10px] font-black leading-none shadow-[0_1px_6px_rgba(0,0,0,0.65)] whitespace-nowrap'
    }
  };
};

const DamageBadge = ({ amount, className = '' }) => {
  const damageAmount = Math.max(0, Number(amount) || 0);
  if (damageAmount <= 0) return null;

  return (
    <div className={className || getBattlefieldBadgeLayout({ hasDamageBadge: true }).damageBadge.className}>
      DMG {damageAmount}
    </div>
  );
};


const TokenCardPreview = ({ token, size = 'small' }) => {
  const accent = getTokenColorAccent(token.color, token.colorIdentity);
  const colorLabel = getTokenColorLabel(token.colorIdentity, token.color);
  const typeLine = token.type_line || token.typeLine || 'Token';
  const showPowerToughness = isCreatureTypeLine(typeLine) && token.power !== undefined && token.power !== '' && token.toughness !== undefined && token.toughness !== '';
  const rulesText = String(token.rulesText || '').trim();
  const isLarge = size === 'large';
  const frameClasses = isLarge
    ? 'h-[min(72vh,34rem)] w-[min(88vw,24rem)] rounded-2xl border-4 p-4 text-base shadow-2xl'
    : 'h-full w-full p-1 text-xs';
  const headerPipClasses = isLarge ? 'h-5 w-5' : 'h-2.5 w-2.5';
  const tokenBadgeClasses = isLarge ? 'px-2.5 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[7px]';
  const titleClasses = isLarge ? 'text-3xl' : 'text-[12px]';
  const colorClasses = isLarge ? 'text-xs' : 'text-[7px]';
  const typeClasses = isLarge ? 'px-3 py-1.5 text-sm' : 'px-1 py-0.5 text-[7px]';
  const textClasses = isLarge ? 'min-h-28 px-3 py-3 text-base' : 'min-h-[1.5rem] px-1 py-0.5 text-[8px]';
  const compactTextBoxClasses = showPowerToughness
    ? 'flex min-h-[2.1rem] flex-1 flex-col justify-between gap-0.5 px-1 py-0.5 text-[8px] text-left'
    : 'flex-1 px-1 py-0.5 text-[8px]';
  const ptClasses = isLarge ? 'bottom-4 right-4 px-4 py-1.5 text-2xl' : 'px-1.5 py-0.5 text-[9px]';
  const contentPadding = showPowerToughness && isLarge ? 'pb-16' : 'pb-1';
  const contentGapClasses = isLarge ? 'gap-1.5' : 'gap-1';
  const contentMarginClasses = isLarge ? 'mt-1' : 'mt-0.5';
  const nameBoxClasses = isLarge ? 'px-2 py-1' : 'px-1.5 py-0.5';

  return (
    <div className={`relative flex flex-col overflow-hidden bg-gradient-to-br text-center ${accent.frame} ${frameClasses}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full border ${accent.pip} ${headerPipClasses}`} aria-hidden="true" />
        <span className={`rounded-full bg-black/35 font-black uppercase tracking-wider text-white/90 ${tokenBadgeClasses}`}>Token</span>
      </div>

      <div className={`${contentMarginClasses} flex min-h-0 flex-1 flex-col ${contentGapClasses} ${contentPadding}`}>
        <div className={`rounded bg-black/30 shadow-inner ${nameBoxClasses}`}>
          <div className={`break-words font-black leading-tight ${titleClasses}`}>{token.name || 'Token'}</div>
          <div className={`mt-0.5 font-bold uppercase tracking-wider opacity-80 ${colorClasses}`}>{colorLabel}</div>
        </div>

        <div className={`rounded border font-bold leading-tight ${accent.band} ${typeClasses}`}>
          {typeLine}
        </div>

        <div className={`rounded border border-white/15 bg-black/25 font-semibold leading-snug text-white/90 shadow-inner ${isLarge ? textClasses : compactTextBoxClasses}`}>
          {isLarge ? (
            rulesText ? <div className="whitespace-pre-wrap break-words">{rulesText}</div> : <div className="opacity-45">&nbsp;</div>
          ) : showPowerToughness ? (
            <>
              <div className="min-h-0 flex-1" aria-hidden="true">
                &nbsp;
              </div>
              <div className="flex min-h-[1.05rem] shrink-0 items-end justify-between gap-1 border-t border-white/10 pt-0.5">
                <div className="min-w-0 flex-1 truncate text-left font-bold leading-none text-white/90">
                  {rulesText || <span className="opacity-35">&nbsp;</span>}
                </div>
                <span className={`shrink-0 rounded border border-white/35 bg-white/15 font-black leading-none text-white ${ptClasses}`} aria-label="Power and toughness">
                  {token.power}/{token.toughness}
                </span>
              </div>
            </>
          ) : (
            rulesText ? <div className="whitespace-pre-wrap break-words">{rulesText}</div> : <div className="opacity-45">&nbsp;</div>
          )}
        </div>
      </div>

      {isLarge && showPowerToughness && (
        <span className={`absolute rounded-md border border-white/40 bg-black/75 font-black leading-none text-white shadow-lg ${ptClasses}`}>
          {token.power}/{token.toughness}
        </span>
      )}
    </div>
  );
};

const Card = ({ card, zone, onMove, onZoom, onPeek, style = {}, onMouseDown, isDraggable, targets = [], stack = [], isSelected = false, combatBadgeLabel = null, combatBadges = null, displayName = null, markedDamage = null, targetInfo = null, attachmentLabel = null, attachedCount = 0 }) => {
  const isTapped = card.tapped;
  const isFaceDown = card.faceDown;
  const counters = card.counters || {};
  const tempDamage = Math.max(0, markedDamage ?? card.tempDamage ?? 0);
  const reminders = getEntityReminders(card);
  const isPhasedOut = Boolean(card.phasedOut);
  const displayCardName = getCardDisplayName(card);
  const displayImageUri = getCardImageUri(card);
  const displayManaCost = getCardManaCost(card);
  const displayPower = getCardPower(card);
  const displayToughness = getCardToughness(card);

  // Calculate Target/Source status from BOTH persistent targets AND stack items
  const persistentSource = targets.some(t => t.sourceId === card.instanceId);
  const persistentTarget = targets.some(t => t.targetId === card.instanceId);
  const stackSource = stack.some(s => s.sourceId === card.instanceId);
  const stackTarget = stack.some(s => s.targetIds && s.targetIds.includes(card.instanceId));

  const isSource = targetInfo?.hasTargets ?? (persistentSource || stackSource);
  const isTarget = targetInfo?.isTargeted ?? (persistentTarget || stackTarget);

  // Count how many times this card is targeted
  const targetCount = targetInfo?.targetedByDisplayNames?.length ?? (targets.filter(t => t.targetId === card.instanceId).length + stack.filter(s => s.targetIds && s.targetIds.includes(card.instanceId)).length);
  const targetBadgeLabel = targetInfo?.targetedByDisplayNames?.length
    ? `Targeted by ${formatTargetListInline(targetInfo.targetedByDisplayNames, 1)}`
    : (isTarget ? '🎯 Targeted' : null);
  const sourceTargetLabel = targetInfo?.targetDisplayNames?.length
    ? `Targets: ${formatTargetListInline(targetInfo.targetDisplayNames, 1)}`
    : null;
  const normalizedCombatBadges = Array.isArray(combatBadges)
    ? combatBadges.filter((badge) => badge && typeof badge.label === 'string' && badge.label.length > 0)
    : (typeof combatBadgeLabel === 'string' && combatBadgeLabel.length > 0 ? [{ label: combatBadgeLabel, tone: 'neutral' }] : []);
  const hasCombatBadge = normalizedCombatBadges.length > 0;
  const battlefieldBadgeLayout = zone === ZONES.BATTLEFIELD
    ? getBattlefieldBadgeLayout({
        hasCombatBadge,
        hasTargetBadge: Boolean(targetBadgeLabel),
        hasSourceBadge: Boolean(sourceTargetLabel),
        hasDamageBadge: tempDamage > 0,
        targetLabel: targetBadgeLabel,
        targetCount
      })
    : null;

  let rotateClass = isTapped ? 'rotate-90' : '';
  const positionClass = zone === ZONES.BATTLEFIELD ? 'absolute' : 'relative';

  // FIX 1: High visibility styles for target/source + Selection Ring
  let borderStyle = isTapped ? 'border-slate-600 opacity-80' : 'border-black';
  if (isSelected) {
    borderStyle = 'border-amber-400 ring-4 ring-amber-400/70 shadow-[0_0_15px_rgba(251,191,36,0.6)] scale-105 z-50';
  } else if (isSource) {
    borderStyle = 'border-red-500 ring-2 ring-red-500 shadow-[0_0_10px_rgba(220,38,38,0.5)]';
  } else if (isTarget) {
    borderStyle = 'border-blue-500 ring-2 ring-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.5)]';
  } else if (isPhasedOut) {
    borderStyle = 'border-cyan-200/90 ring-2 ring-cyan-300/60 shadow-[0_0_14px_rgba(103,232,249,0.45)]';
  }

  return (
    <div
      className={`group cursor-pointer select-none transition-transform duration-200 ${zone === ZONES.HAND ? 'w-24 h-34 hover:-translate-y-4 flex-shrink-0 relative' : positionClass} ${rotateClass} `}
      style={{
        ...(zone === ZONES.BATTLEFIELD ? { width: `${BATTLEFIELD_CARD_WIDTH_PX}px`, height: `${BATTLEFIELD_CARD_HEIGHT_PX}px` } : {}),
        ...style,
        zIndex: isSelected ? 100 : (isDraggable ? ((style?.zIndex || 10)) : ((style?.zIndex || 5))),
        touchAction: isDraggable ? 'none' : 'auto'
      }}
      onClick={!isDraggable ? () => onMove(card) : undefined}
      onMouseDown={isDraggable ? onMouseDown : undefined}
      onTouchStart={isDraggable ? onMouseDown : undefined}
    >
      <div className={`w-full h-full rounded-lg overflow-hidden border-2 shadow-md relative bg-slate-800 pointer-events-none ${borderStyle} ${zone === ZONES.BATTLEFIELD ? 'shadow-lg' : ''} ${isPhasedOut ? 'grayscale saturate-50' : ''}`}>
        

        {isFaceDown ? (
          <div className="w-full h-full bg-slate-700 flex flex-col items-center justify-center p-1 border-4 border-slate-600">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center mb-1">
              <EyeOff size={14} className="text-slate-500"/>
            </div>
            <span className="text-[10px] font-bold text-slate-400">2 / 2</span>
          </div>
        ) : displayImageUri ? (
          <img src={displayImageUri} alt={displayCardName} className="w-full h-full object-cover" />
        ) : card.isToken ? (
          <TokenCardPreview token={card} />
        ) : (
          <div className="w-full h-full p-1 flex flex-col items-center justify-center text-center text-xs bg-slate-800">
            <span className="font-bold text-white leading-tight">{displayCardName}</span>
            <span className="text-slate-400 text-[9px] mt-1">{displayManaCost}</span>
            {displayPower && <span className="absolute bottom-1 right-1 bg-black/50 px-1 rounded text-[9px]">{displayPower}/{displayToughness}</span>}
          </div>
        )}


        {zone === ZONES.BATTLEFIELD && isPhasedOut && (
          <>
            <div className="absolute inset-0 z-20 pointer-events-none bg-slate-950/35" />
            <div className="absolute left-1/2 top-1/2 z-40 pointer-events-none -translate-x-1/2 -translate-y-1/2 rounded-md border border-cyan-100/90 bg-cyan-950/90 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wide text-cyan-50 shadow-[0_1px_8px_rgba(0,0,0,0.75)] whitespace-nowrap">
              Phased out
            </div>
          </>
        )}

        {card.isCommander && !card.faceDown && (
          <div className="absolute top-1 left-1 z-30 rounded-full border border-amber-300/70 bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-950 shadow" title="Commander">
            <span className="inline sm:hidden">♛</span><span className="hidden sm:inline">Commander</span>
          </div>
        )}

        <div className="absolute top-5 left-1 flex flex-col gap-1 pointer-events-none">
          {Object.entries(counters).map(([label, count]) => (
            count > 0 && (
              <div key={label} className="bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded border border-white/30 shadow-sm whitespace-nowrap z-10">
                {label === 'default' ? `+${count}/+${count}` : `${label}: ${count}`}
              </div>
            )
          ))}
        </div>

        {zone === ZONES.BATTLEFIELD && attachmentLabel && (
          <div className="absolute top-1 right-1 z-30 pointer-events-none max-w-[calc(100%-0.5rem)] truncate rounded-md border border-fuchsia-200/80 bg-fuchsia-800/95 px-1.5 py-0.5 text-[8px] font-black leading-none text-white shadow-[0_1px_6px_rgba(0,0,0,0.65)]">
            {attachmentLabel}
          </div>
        )}

        {zone === ZONES.BATTLEFIELD && attachedCount > 0 && (
          <div className="absolute left-1 top-[3.1rem] z-30 pointer-events-none flex items-center gap-0.5 rounded-md border border-violet-200/80 bg-violet-800/95 px-1.5 py-0.5 text-[9px] font-black leading-none text-white shadow-[0_1px_6px_rgba(0,0,0,0.65)]" title={`${attachedCount} attached`}>
            <Paperclip size={9} /> {attachedCount}
          </div>
        )}

        {zone === ZONES.BATTLEFIELD && reminders.length > 0 && (
          <div className="absolute bottom-1 left-1 right-1 z-30 pointer-events-none flex flex-col gap-0.5">
            {reminders.slice(0, 2).map((reminder) => (
              <div key={reminder.id} className="max-w-full truncate rounded border border-violet-200/70 bg-violet-950/95 px-1.5 py-0.5 text-[8px] font-black leading-none text-violet-50 shadow-[0_1px_6px_rgba(0,0,0,0.65)]" title={getReminderTitle(reminder)}>
                🔔 {reminder.text}
              </div>
            ))}
            {reminders.length > 2 && (
              <div className="w-fit rounded border border-violet-200/50 bg-violet-950/90 px-1.5 py-0.5 text-[8px] font-black leading-none text-violet-100">+{reminders.length - 2}</div>
            )}
          </div>
        )}

        {battlefieldBadgeLayout?.targetBadges.show && (
          <div className={battlefieldBadgeLayout.targetBadges.className}>
            {targetBadgeLabel && (
              <div className={`${battlefieldBadgeLayout.targetBadges.badgeClassName} rounded-md border border-sky-200/80 bg-sky-700/95 px-1.5 py-0.5 text-[9px] font-black leading-none text-white shadow-[0_1px_6px_rgba(0,0,0,0.65)]`}>
                {battlefieldBadgeLayout.targetBadges.targetLabel}{battlefieldBadgeLayout.targetBadges.showTargetCountSuffix ? ` (${targetCount})` : ''}
              </div>
            )}
            {sourceTargetLabel && (
              <div className="max-w-full truncate rounded-md border border-amber-200/80 bg-amber-700/95 px-1.5 py-0.5 text-[9px] font-black leading-none text-white shadow-[0_1px_6px_rgba(0,0,0,0.65)]">
                {sourceTargetLabel}
              </div>
            )}
          </div>
        )}
      </div>


      <DamageBadge amount={tempDamage} className={battlefieldBadgeLayout?.damageBadge.className} />

      {battlefieldBadgeLayout?.combatBadges.show && (
        <div className={battlefieldBadgeLayout.combatBadges.className}>
          {normalizedCombatBadges.slice(0, 2).map((badge, index) => {
            const toneClass = badge.tone === 'attack'
              ? 'bg-red-950/95 text-red-50 border-red-300/70'
              : badge.tone === 'block'
                ? 'bg-blue-950/95 text-blue-50 border-blue-300/70'
                : 'bg-slate-950/90 text-slate-100 border-slate-300/60';
            return (
              <div key={`${badge.label}-${index}`} className={`max-w-full text-[9px] leading-[1.05] px-1.5 py-0.5 rounded border shadow-md whitespace-normal break-words font-extrabold ${toneClass}`}>
                {badge.label}
              </div>
            );
          })}
        </div>
      )}

      {!isDraggable && (
        <button
          className="absolute top-0 right-0 p-1 bg-black/50 text-white opacity-0 group-hover:opacity-100 rounded-bl-lg z-20 pointer-events-auto"
          onClick={(e) => { e.stopPropagation(); onZoom(card); }}
        >
          <Eye size={12} />
        </button>
      )}
      {isFaceDown && onPeek && !isDraggable && (
        <button
          className="absolute bottom-0 right-0 p-1 bg-blue-900/50 text-white opacity-0 group-hover:opacity-100 rounded-tl-lg z-20 pointer-events-auto"
          onClick={(e) => { e.stopPropagation(); onPeek(card); }}
        >
          <EyeOff size={12} />
        </button>
      )}
      {zone === ZONES.BATTLEFIELD && displayName && (
        <div className={`absolute ${card.isToken ? '-bottom-6' : '-bottom-5'} left-0 right-0 text-center pointer-events-none`}>
          <span className="bg-black/75 text-[9px] text-slate-100 px-1.5 py-0.5 rounded border border-slate-500/40 truncate inline-block max-w-full">
            {displayName}
          </span>
        </div>
      )}
    </div>
  );
};

const formatPerfMs = (value) => (Number.isFinite(value) ? `${Math.round(value)}ms` : '—');
const formatPerfTime = (value) => (value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

const PerfDebugIndicator = () => {
  if (!isPerfActionsEnabled()) return null;

  return (
    <div className="pointer-events-none fixed right-2 top-2 z-[80] rounded-full border border-cyan-300/60 bg-cyan-950/90 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-100 shadow-lg">
      Perf debug on
    </div>
  );
};

const PerformanceDebugPanel = ({ game = null, onRepairGameSize = null, canRepairGameSize = false, repairGameSizeBusy = false } = {}) => {
  const [perfState, setPerfState] = useState(() => getPerfActionsState());
  const [collapsed, setCollapsed] = useState(false);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => subscribePerfActions((nextState) => setPerfState({ ...nextState })), []);

  if (disabled || !isPerfActionsEnabled()) return null;

  const handleDisable = () => {
    disablePerfActions();
    setDisabled(true);
  };

  const lastAction = perfState.actions[0];
  const stackBefore = lastAction?.gameBefore?.stackLength;
  const stackAfter = lastAction?.gameAfter?.stackLength ?? lastAction?.snapshot?.stackLength;
  const latestNormalization = lastAction?.normalization?.[lastAction.normalization.length - 1];
  const undoFields = lastAction?.undo?.previousStateFields || latestNormalization?.previousStateFields || [];
  const firstSnapshot = lastAction?.firstSnapshotAfterWrite || lastAction?.firstSnapshotAfterAction;
  const firstReflectingSnapshot = lastAction?.firstReflectingSnapshot;
  const firstServerReflectingSnapshot = lastAction?.firstServerReflectingSnapshot;
  const listenerEvents = perfState.listenerEvents || [];
  const visibleUpdate = perfState.lastVisibleUpdate || lastAction?.visibleUpdate || null;
  const undoCardDebug = lastAction?.undo?.cardDebug || null;
  const reflectionDebug = lastAction?.snapshot?.reflectionDebug || null;
  const reflectionReason = lastAction?.snapshot?.reflectionReason || null;
  const sizeEstimate = game ? getGameDocumentSizeEstimate(game) : null;
  const formatBytes = (bytes) => (Number.isFinite(bytes) ? `${Math.round(bytes / 1024)} KB` : '—');

  return (
    <div className="fixed bottom-2 left-2 right-2 z-[90] mx-auto max-w-md rounded-xl border border-cyan-400/50 bg-slate-950/95 text-xs text-slate-100 shadow-2xl backdrop-blur sm:left-auto sm:right-3 sm:w-96">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-t-xl bg-cyan-950/80 px-3 py-2 text-left font-black uppercase tracking-wide text-cyan-100"
      >
        <span className="flex items-center gap-2"><Bug size={14} /> Performance Debug</span>
        <span className="text-[10px] text-cyan-200">{collapsed ? 'Show' : 'Hide'}</span>
      </button>
      {!collapsed && (
        <div className="max-h-[45vh] space-y-2 overflow-y-auto p-3">
          <button
            type="button"
            onClick={handleDisable}
            className="w-full rounded-lg border border-cyan-400/40 bg-slate-900 px-3 py-2 text-left text-[11px] font-bold text-cyan-100 transition hover:bg-slate-800"
          >
            Disable perf debug
          </button>
          {sizeEstimate && (
            <div className={`rounded-lg border p-2 text-[11px] ${sizeEstimate.isNearLimit ? 'border-amber-400/60 bg-amber-950/40 text-amber-100' : 'border-slate-700 bg-slate-900 text-slate-200'}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-black uppercase">Firestore document size</span>
                <span className="font-mono font-bold">{formatBytes(sizeEstimate.documentBytes)}</span>
              </div>
              {sizeEstimate.isNearLimit && <div className="mb-1 font-bold text-amber-200">Game document is near Firestore size limit.</div>}
              <div className="grid grid-cols-2 gap-1">
                <div><span className="text-slate-400">Undo:</span> <b>{formatBytes(sizeEstimate.undoStackBytes)}</b> · {sizeEstimate.undoEntryCount} entries</div>
                <div><span className="text-slate-400">Log:</span> <b>{formatBytes(sizeEstimate.logBytes)}</b> · {sizeEstimate.logEntryCount} entries</div>
                <div className="col-span-2"><span className="text-slate-400">Undo entries with previousState.cards:</span> <b className={sizeEstimate.undoEntriesWithCards ? 'text-amber-300' : 'text-emerald-300'}>{sizeEstimate.undoEntriesWithCards}</b></div>
              </div>
              {canRepairGameSize && (
                <button
                  type="button"
                  onClick={onRepairGameSize}
                  disabled={repairGameSizeBusy}
                  className="mt-2 w-full rounded border border-amber-400/50 bg-amber-900/50 px-2 py-1 font-black text-amber-50 transition hover:bg-amber-800/70 disabled:cursor-wait disabled:opacity-60"
                >
                  {repairGameSizeBusy ? 'Repairing…' : 'Repair game size'}
                </button>
              )}
            </div>
          )}
          {!lastAction ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300">Waiting for a tracked action. Try Cast Spell, Play Land, Move Zone, stack actions, Draw, or Pass.</div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="font-bold text-white">Last action: {lastAction.actionType}{lastAction.cardName ? ` — ${lastAction.cardName}` : ''}</div>
                <div className="text-[10px] text-slate-400">Click: {formatPerfTime(lastAction.clickWallNow)} · Handler: {formatPerfTime(lastAction.handlerStartWallNow)}</div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded bg-slate-900 p-2"><div className="text-slate-400">Click → handler</div><div className="font-bold">{formatPerfMs(lastAction.clickToHandlerMs)}</div></div>
                <div className="rounded bg-slate-900 p-2"><div className="text-slate-400">Click → optimistic visible</div><div className="font-bold">{formatPerfMs(lastAction.clickToOptimisticVisibleMs)}</div></div>
                <div className="rounded bg-slate-900 p-2"><div className="text-slate-400">Handler → Firestore done</div><div className="font-bold">{formatPerfMs(lastAction.handlerToFirestoreDoneMs)}</div></div>
                <div className="rounded bg-slate-900 p-2"><div className="text-slate-400">Optimistic → confirmed</div><div className="font-bold">{formatPerfMs(lastAction.optimisticVisibleToFirestoreConfirmedMs)}</div></div>
                <div className="rounded bg-slate-900 p-2"><div className="text-slate-400">Firestore → first snapshot</div><div className="font-bold">{formatPerfMs(lastAction.firestoreDoneToFirstSnapshotMs)}</div></div>
                <div className="rounded bg-slate-900 p-2"><div className="text-slate-400">Firestore → reflects</div><div className="font-bold">{formatPerfMs(lastAction.firestoreDoneToSnapshotMs)}</div></div>
                <div className="rounded bg-slate-900 p-2"><div className="text-slate-400">Snapshot → visible</div><div className="font-bold">{formatPerfMs(lastAction.snapshotToVisibleUpdateMs)}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Total handler:</span> <b>{formatPerfMs(lastAction.handleActionTotalMs)}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Firestore:</span> <b>{lastAction.firestore?.type || '—'} {formatPerfMs(lastAction.firestore?.totalMs || lastAction.firestore?.updateDocMs)}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Undo includes cards:</span> <b className={lastAction.undo?.includesCards ? 'text-amber-300' : 'text-emerald-300'}>{lastAction.undo?.includesCards ? 'yes' : 'no'}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Cards normalized:</span> <b>{latestNormalization?.cardCount ?? 0}</b></div>
                <div className="col-span-2 rounded bg-slate-900 p-2"><span className="text-slate-400">Undo fields:</span> <span className="break-words font-mono">{undoFields.length ? undoFields.join(', ') : '—'}</span></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">updates.cards:</span> <b>{latestNormalization?.updatesIncludeCards ? 'yes' : 'no'}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Undo previousState.cards:</span> <b>{latestNormalization?.undoStackIncludesCards ? 'yes' : 'no'}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Stack before/after:</span> <b>{stackBefore ?? '—'} → {stackAfter ?? '—'}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Snapshot reflects action:</span> <b>{lastAction.snapshotReflectsLastAction == null ? '—' : (lastAction.snapshotReflectsLastAction ? 'yes' : 'no')}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Local snapshot ignored:</span> <b>{lastAction.localSnapshotIgnored ? 'yes' : 'no'}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Optimistic applied:</span> <b className={lastAction.optimisticApplied ? 'text-emerald-300' : 'text-slate-300'}>{lastAction.optimisticApplied == null ? '—' : (lastAction.optimisticApplied ? 'yes' : 'no')}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Optimistic reconciled:</span> <b className={lastAction.optimisticReconciled ? 'text-emerald-300' : 'text-slate-300'}>{lastAction.optimisticReconciled == null ? '—' : (lastAction.optimisticReconciled ? 'yes' : 'no')}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Optimistic reverted:</span> <b className={lastAction.optimisticReverted ? 'text-rose-300' : 'text-slate-300'}>{lastAction.optimisticReverted ? 'yes' : 'no'}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Optimistic status:</span> <b>{lastAction.optimistic?.revertReason || lastAction.optimistic?.skippedReason || (lastAction.optimistic?.confirmed ? 'confirmed' : '—')}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Undo source:</span> <b>{visibleUpdate?.undoSource || lastAction.undo?.source || '—'}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Undo pending sync:</span> <b className={visibleUpdate?.undoPendingSync ? 'text-amber-300' : 'text-emerald-300'}>{visibleUpdate?.undoPendingSync ? 'yes' : 'no'}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Undo optimistic applied:</span> <b className={lastAction.undo?.optimisticApplied ? 'text-emerald-300' : 'text-slate-300'}>{lastAction.undo?.optimisticApplied == null ? '—' : (lastAction.undo.optimisticApplied ? 'yes' : 'no')}</b></div>
                <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Click → undo visible:</span> <b>{formatPerfMs(lastAction.undo?.clickToUndoVisibleMs)}</b></div>
                <div className="col-span-2 rounded bg-slate-900 p-2"><span className="text-slate-400">Undo restored fields:</span> <span className="break-words font-mono">{lastAction.undo?.restoredFields?.length ? lastAction.undo.restoredFields.join(', ') : '—'}</span></div>

                {lastAction.actionType === 'PLAY_LAND' && (reflectionDebug || reflectionReason) && (
                  <>
                    <div className="col-span-2 rounded bg-slate-900 p-2"><span className="text-slate-400">PLAY_LAND reflect reason:</span> <span className="break-words font-mono">{reflectionReason || '—'}</span></div>
                    <div className="col-span-2 rounded bg-slate-900 p-2"><span className="text-slate-400">Played card id:</span> <span className="break-words font-mono">{reflectionDebug?.cardId || lastAction.cardId || '—'}</span></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Expected/actual zone:</span> <b>{reflectionDebug?.expectedZone || '—'} / {reflectionDebug?.actualZone || '—'}</b></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Latest undo:</span> <b>{reflectionDebug?.latestUndoActionType || '—'} · {reflectionDebug?.latestUndoActionLabel || '—'}</b></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Latest undo card:</span> <b>{reflectionDebug?.newestServerUndoCardId || reflectionDebug?.latestUndoCardId || '—'}</b></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Latest undo pending:</span> <b className={reflectionDebug?.latestUndoPendingSync ? 'text-amber-300' : 'text-emerald-300'}>{reflectionDebug?.latestUndoPendingSync ? 'yes' : 'no'}</b></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Undo card matches:</span> <b className={reflectionDebug?.latestUndoCardIdMatches ? 'text-emerald-300' : 'text-rose-300'}>{reflectionDebug?.latestUndoCardIdMatches ? 'yes' : 'no'}</b></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Write undoStack:</span> <b>{lastAction.undo?.writeIncludesUndoStack == null ? '—' : (lastAction.undo.writeIncludesUndoStack ? 'yes' : 'no')}</b></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Undo len before/after:</span> <b>{lastAction.undo?.undoStackLengthBefore ?? '—'} / {lastAction.undo?.undoStackLengthAfter ?? reflectionDebug?.undoStackLength ?? '—'}</b></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Pruned PLAY_LAND:</span> <b className={lastAction.undo?.pruningDroppedNewPlayLand ? 'text-rose-300' : 'text-emerald-300'}>{lastAction.undo?.pruningDroppedNewPlayLand == null ? '—' : (lastAction.undo.pruningDroppedNewPlayLand ? 'yes' : 'no')}</b></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Recent PLAY_LAND undo:</span> <b>{reflectionDebug?.recentMatchingUndoActionType || '—'} · {reflectionDebug?.recentMatchingUndoCardId || '—'}</b></div>
                    <div className="col-span-2 rounded bg-slate-900 p-2"><span className="text-slate-400">Undo order:</span> <span className="break-words font-mono">{lastAction.undo?.undoStackActionOrder || reflectionDebug?.undoStackActionOrder || '—'}</span></div>
                  </>
                )}
                {undoCardDebug && (
                  <>
                    <div className="col-span-2 rounded bg-slate-900 p-2"><span className="text-slate-400">Undo card:</span> <span className="break-words font-mono">{undoCardDebug.cardId || '—'}</span></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Card zone before/after:</span> <b>{undoCardDebug.zoneBeforeAction || '—'} → {undoCardDebug.zoneAfterAction || '—'}</b></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Undo previous zone:</span> <b>{undoCardDebug.undoPreviousStateZone || '—'}</b></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Undo restored zone:</span> <b>{undoCardDebug.undoRestoredZone || '—'}</b></div>
                    <div className="rounded bg-slate-900 p-2"><span className="text-slate-400">Prev hand/battlefield:</span> <b>{undoCardDebug.previousStateCardInHand ? 'hand' : undoCardDebug.previousStateCardInBattlefield ? 'battlefield' : 'no'}</b></div>
                  </>
                )}
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-[11px]">
                <div className="mb-1 font-black uppercase text-slate-300">Snapshot metadata</div>
                <div className="grid grid-cols-2 gap-1">
                  <div><span className="text-slate-400">First after write:</span> <b>{firstSnapshot ? `${firstSnapshot.fromCache ? 'cache' : 'server'} / ${firstSnapshot.hasPendingWrites ? 'pending' : 'settled'}` : '—'}</b></div>
                  <div><span className="text-slate-400">First reflects:</span> <b>{firstReflectingSnapshot ? `${firstReflectingSnapshot.fromCache ? 'cache' : 'server'} / ${firstReflectingSnapshot.hasPendingWrites ? 'pending' : 'settled'}` : '—'}</b></div>
                  <div className="col-span-2"><span className="text-slate-400">Server-confirmed reflects:</span> <b>{firstServerReflectingSnapshot ? `${formatPerfMs(lastAction.firestoreDoneToServerReflectingSnapshotMs)} · ${formatPerfTime(firstServerReflectingSnapshot.wallNow)}` : '—'}</b></div>
                  <div><span className="text-slate-400">Last stack/cards:</span> <b>{lastAction.snapshot?.stackLength ?? '—'} / {lastAction.snapshot?.cardsLength ?? '—'}</b></div>
                  <div><span className="text-slate-400">Last log:</span> <b>{lastAction.snapshot?.lastLogType || '—'}</b></div>
                </div>
                {lastAction.snapshot?.lastLogMessage && <div className="mt-1 truncate text-slate-400">{lastAction.snapshot.lastLogMessage}</div>}
              </div>
              {lastAction.warnings?.length > 0 && (
                <div className="rounded-lg border border-amber-400/40 bg-amber-950/40 p-2 text-amber-100">
                  <div className="mb-1 font-black uppercase">Warnings</div>
                  <ul className="list-disc space-y-0.5 pl-4">{lastAction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                </div>
              )}
              <details className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <summary className="cursor-pointer font-bold text-slate-200">Game listener lifecycle</summary>
                <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-300">
                  {listenerEvents.length === 0 ? <div>No listener events recorded.</div> : listenerEvents.slice(0, 6).map((event, index) => (
                    <div key={`${event.listenerInstanceId}-${event.type}-${event.wallNow}-${index}`} className="border-t border-slate-800 pt-1">{formatPerfTime(event.wallNow)} {event.type} {event.listenerInstanceId} · {event.reason}</div>
                  ))}
                </div>
              </details>
              <details className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <summary className="cursor-pointer font-bold text-slate-200">Recent checkpoints</summary>
                <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-300">
                  {(lastAction.checkpoints || []).slice(-8).map((checkpoint, index) => (
                    <div key={`${checkpoint.phase}-${index}`} className="border-t border-slate-800 pt-1">+{formatPerfMs(checkpoint.sinceHandlerStartMs)} {checkpoint.phase}{checkpoint.readDurationMs ? ` (${checkpoint.readDurationMs}ms read)` : ''}</div>
                  ))}
                </div>
              </details>
            </>
          )}
          {perfState.actions.length > 1 && (
            <div className="space-y-1">
              <div className="font-bold uppercase text-slate-400">Previous actions</div>
              {perfState.actions.slice(1, 4).map((action) => (
                <div key={action.id} className="rounded bg-slate-900 px-2 py-1 text-[11px] text-slate-300">
                  {action.actionType}{action.cardName ? ` ${action.cardName}` : ''} · handler {formatPerfMs(action.handleActionTotalMs)} · fs {formatPerfMs(action.handlerToFirestoreDoneMs)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

class GameBoardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Game board render failed', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-slate-900 p-5 shadow-2xl space-y-4">
          <div className="flex items-center gap-2 text-red-200 font-black text-lg">
            <AlertTriangle size={22} /> Something went wrong
          </div>
          <p className="text-sm text-slate-300">
            The game board hit a display error. Reload the page, or exit back to the lobby and reopen the game.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl bg-red-700 px-4 py-2 font-bold text-white hover:bg-red-600">
              Reload
            </button>
            <button type="button" onClick={this.props.onExit} className="min-h-11 rounded-xl bg-slate-800 px-4 py-2 font-bold text-slate-100 hover:bg-slate-700">
              Exit game
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const TutorialOverlay = ({ game, currentStep, canGoBack, isMinimized, hasOpenPanel, onToggleMinimized, onResume, onNext, onBack, onSkip, onExit, onFocusTarget, onRestart, onExplore, errorMessage = '', debugInfo = null }) => {
  const [dock, setDock] = useState('bottom');
  const forcedCompact = Boolean(hasOpenPanel);
  const safeCurrentStep = normalizeTutorialStep(currentStep, game?.tutorial?.stepId || 'intro');
  const stepUnavailable = !currentStep || Boolean(errorMessage);

  useEffect(() => {
    if (!safeCurrentStep?.anchor || typeof window === 'undefined') {
      return undefined;
    }

    const updateDock = () => {
      const anchor = Array.isArray(safeCurrentStep.anchor) ? safeCurrentStep.anchor[0] : safeCurrentStep.anchor;
      if (!anchor) {
        setDock('bottom');
        return;
      }
      const element = document.querySelector(`[data-tutorial-anchor="${anchor}"]`);
      if (!element) {
        setDock('bottom');
        return;
      }
      const rect = element.getBoundingClientRect();
      const viewportMid = window.innerHeight / 2;
      setDock(rect.top > viewportMid ? 'top' : 'bottom');
    };

    const rafId = window.requestAnimationFrame(updateDock);
    window.addEventListener('resize', updateDock);
    window.addEventListener('scroll', updateDock, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateDock);
      window.removeEventListener('scroll', updateDock, true);
    };
  }, [safeCurrentStep?.anchor]);

  if (!game?.isTutorial || game?.tutorial?.inactive) return null;
  const isFinishedStep = safeCurrentStep.id === 'tutorial_complete';
  const stepNumber = getTutorialStepIndex(safeCurrentStep.id) + 1;
  const isActionStep = ['detect', 'detect-or-manual'].includes(safeCurrentStep.completion);

  const collapsed = isMinimized || forcedCompact;
  const effectiveDock = safeCurrentStep.anchor ? dock : 'bottom';
  const positionClass = effectiveDock === 'top' ? 'top-16 sm:top-4' : 'bottom-20 sm:bottom-4';
  return (
    <div className={`pointer-events-none fixed inset-x-0 ${positionClass} z-[90] px-3 sm:px-4`}>
      <div className={`pointer-events-auto mx-auto overflow-hidden rounded-2xl border border-amber-400/40 bg-slate-950/95 shadow-2xl shadow-black/60 backdrop-blur ${collapsed ? 'max-w-sm' : 'max-w-md'}`}>
        <div className={`flex items-center justify-between gap-3 border-b border-amber-500/20 bg-gradient-to-r from-amber-950/80 to-purple-950/80 ${collapsed ? 'px-3 py-2' : 'px-4 py-3'}`}>
          <button type="button" onClick={collapsed ? onResume : undefined} className="min-w-0 flex-1 text-left" aria-label={collapsed ? 'Resume tutorial' : undefined}>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Tutorial · {stepNumber}/{TUTORIAL_SCRIPT_STEPS.length}</div>
            <div className="truncate text-sm font-extrabold text-white">{collapsed ? `Resume tutorial: ${safeCurrentStep.title}` : safeCurrentStep.chapter}</div>
            {forcedCompact && <div className="mt-0.5 truncate text-[11px] font-bold text-amber-100/80">Card/menu open — tutorial is paused, not closed.</div>}
          </button>
          <div className="flex items-center gap-2">
            {collapsed ? (
              <button type="button" onClick={onResume} className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-black text-slate-950 shadow-lg hover:bg-amber-300" aria-label="Resume tutorial">
                Resume
              </button>
            ) : (
              <button type="button" onClick={onFocusTarget} disabled={!safeCurrentStep.anchor} className="rounded-full border border-amber-300/40 px-3 py-1.5 text-xs font-black text-amber-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Show tutorial target">
                Show me
              </button>
            )}
            <button type="button" onClick={collapsed ? onResume : onToggleMinimized} className="rounded-full p-2 text-amber-100 hover:bg-white/10" aria-label={collapsed ? 'Resume tutorial' : 'Minimize tutorial'}>
              {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button type="button" onClick={onExit} className="rounded-full p-2 text-slate-300 hover:bg-red-950/60 hover:text-red-100" aria-label="Exit tutorial">
              <X size={16} />
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="space-y-3 px-4 py-4">
            <div>
              <h2 className="text-lg font-black leading-tight text-amber-50">{safeCurrentStep.title}</h2>
              {safeCurrentStep.reaction && <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-950/30 p-2 text-xs font-bold text-amber-100">{safeCurrentStep.reaction}</p>}
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{safeCurrentStep.scene}</p>
              <p className="mt-2 rounded-xl border border-purple-500/20 bg-purple-950/30 p-3 text-sm italic leading-relaxed text-purple-100"><span className="font-black not-italic text-purple-200">Bolas:</span> “{safeCurrentStep.dialogue}”</p>
            </div>
            {stepUnavailable && (
              <div className="rounded-xl border border-red-400/40 bg-red-950/30 p-3 text-sm font-bold text-red-100">
                {errorMessage || 'Tutorial step unavailable. Skip or restart tutorial.'}
              </div>
            )}
            <div className="grid gap-2 text-sm">
              <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Objective</div>
                <div className="mt-1 text-slate-100">{safeCurrentStep.objective}</div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-sky-300">Hint</div>
                <div className="mt-1 text-slate-300">{safeCurrentStep.hint}</div>
              </div>
            </div>

            {debugInfo && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-[11px] text-cyan-100">
                <div className="font-black uppercase tracking-widest text-cyan-200">Tutorial timing</div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                  <span>Action</span><span className="text-right font-mono">{debugInfo.lastAction || '—'}</span>
                  <span>Local advance</span><span className="text-right font-mono">{debugInfo.localAdvanceMs == null ? '—' : `${debugInfo.localAdvanceMs}ms`}</span>
                  <span>Firestore write</span><span className="text-right font-mono">{debugInfo.firestoreWriteMs == null ? '—' : `${debugInfo.firestoreWriteMs}ms`}</span>
                  <span>Local step</span><span className="truncate text-right font-mono">{debugInfo.localStep || '—'}</span>
                  <span>Server step</span><span className="truncate text-right font-mono">{debugInfo.serverStep || '—'}</span>
                  <span>Pending sync</span><span className="text-right font-mono">{debugInfo.pendingSync ? 'yes' : 'no'}</span>
                </div>
              </div>
            )}
            {isFinishedStep && game.tutorial?.finished ? (
              <div className="rounded-xl border border-emerald-400/40 bg-emerald-950/30 p-3">
                <div className="text-sm font-black text-emerald-100">Tutorial complete. Nicol Bolas has permitted your temporary survival.</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <button type="button" onClick={onExit} className="min-h-10 rounded-lg bg-slate-800 px-3 text-sm font-bold text-slate-100 hover:bg-slate-700">Return to lobby</button>
                  <button type="button" onClick={onExplore} className="min-h-10 rounded-lg border border-emerald-500/40 px-3 text-sm font-bold text-emerald-100 hover:bg-emerald-950/40">Explore board</button>
                  <button type="button" onClick={onRestart} className="min-h-10 rounded-lg border border-amber-500/40 px-3 text-sm font-black text-amber-100 hover:bg-amber-950/40">Restart</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button type="button" onClick={onBack} disabled={!canGoBack} className="min-h-10 rounded-lg border border-slate-700 px-3 text-sm font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                  Back
                </button>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={onFocusTarget} disabled={!safeCurrentStep.anchor} className="min-h-10 rounded-lg border border-amber-500/40 px-3 text-sm font-black text-amber-100 hover:bg-amber-950/40 disabled:cursor-not-allowed disabled:opacity-40">
                    Show me
                  </button>
                  <button type="button" onClick={onSkip} className="min-h-10 rounded-lg border border-slate-700 px-3 text-sm font-bold text-slate-300 hover:bg-slate-800">
                    Skip step
                  </button>
                  {isActionStep ? (
                    <button type="button" disabled className="min-h-10 rounded-lg bg-slate-700 px-4 text-sm font-black text-slate-300 opacity-70">
                      Waiting…
                    </button>
                  ) : (
                    <button type="button" onClick={onNext} className="min-h-10 rounded-lg bg-amber-500 px-4 text-sm font-black text-slate-950 hover:bg-amber-400">
                      {isFinishedStep ? 'Finish' : 'Next'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const TutorialResumePill = ({ show, currentStep, hasOpenPanel, onResume }) => {
  if (!show) return null;
  const title = currentStep?.title || 'current step';
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 right-3 z-[95] flex justify-center sm:bottom-5 sm:left-auto sm:right-5 sm:justify-end">
      <button
        type="button"
        onClick={onResume}
        className="pointer-events-auto min-h-12 rounded-full border border-amber-200/70 bg-amber-400 px-5 py-2 text-sm font-black text-slate-950 shadow-2xl shadow-black/50 hover:bg-amber-300 focus:outline-none focus:ring-4 focus:ring-amber-200/50"
        aria-label="Resume tutorial"
      >
        Resume tutorial{hasOpenPanel ? ' · panel open' : ''}
        <span className="ml-2 hidden max-w-[12rem] truncate align-bottom text-xs font-bold text-slate-800/80 sm:inline-block">{title}</span>
      </button>
    </div>
  );
};

const GameBoard = ({ gameId, realUserId, displayName, onExit }) => {
  const [firestoreGame, setFirestoreGame] = useState(null);
  const [optimisticGame, setOptimisticGame] = useState(null);
  const [pendingOptimisticActionId, setPendingOptimisticActionId] = useState(null);
  const [pendingOptimisticStartedAt, setPendingOptimisticStartedAt] = useState(null);
  const pendingOptimisticActionRef = useRef(null);
  const completedOptimisticActionIdsRef = useRef(new Set());
  const latestFirestoreGameRef = useRef(null);
  const game = optimisticGame || firestoreGame;
  const [loading, setLoading] = useState(true);
  const gameListenerIdRef = useRef(null);
  const [deckInput, setDeckInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [deletingDeck, setDeletingDeck] = useState(false);
  const [deleteDeckConfirmOpen, setDeleteDeckConfirmOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [zoomedCard, setZoomedCard] = useState(null);
  const closeZoomedCard = useCallback(() => setZoomedCard(null), []);
  const [scryCard, setScryCard] = useState(null);
  const [viewZone, setViewZone] = useState(null);
  const [searchLibraryOwner, setSearchLibraryOwner] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [playerStatsOpen, setPlayerStatsOpen] = useState(false);
  const [emblemFormPlayerId, setEmblemFormPlayerId] = useState(null);
  const [emblemForm, setEmblemForm] = useState({ name: '', sourceName: '', text: '' });
  const [expandedEmblemId, setExpandedEmblemId] = useState(null);
  const [expandedDungeonId, setExpandedDungeonId] = useState(null);
  const [commanderDamageSummaryPlayerId, setCommanderDamageSummaryPlayerId] = useState(null);
  const [peekCard, setPeekCard] = useState(null);
  const [privateHandPeek, setPrivateHandPeek] = useState(null); // local-only: { playerId }
  const [privatePeekInspectCard, setPrivatePeekInspectCard] = useState(null); // local-only card inspection inside private hand peek
  const [diceMenuOpen, setDiceMenuOpen] = useState(false);
  const [customDieSize, setCustomDieSize] = useState('12');
  const [libraryMenuOpen, setLibraryMenuOpen] = useState(false);
  const [libraryBatchOpen, setLibraryBatchOpen] = useState(false);
  const [libraryBatchCount, setLibraryBatchCount] = useState('3');
  const [libraryMenuPos, setLibraryMenuPos] = useState(null);
  const [notification, setNotification] = useState(null);
  const [boardUnlocked, setBoardUnlocked] = useState(false);
  const [viewAsId, setViewAsId] = useState(null);
  const [spectatorLastSeenChatAt, setSpectatorLastSeenChatAt] = useState(0);
  const myBattlefieldRef = useRef(null);
  const opponentBattlefieldRef = useRef(null);
  const libraryButtonRef = useRef(null);
  const bottomToolbarRef = useRef(null);
  const battlefieldScrollRef = useRef(null);
  const opponentSectionRef = useRef(null);
  const [tutorialPulseAnchor, setTutorialPulseAnchor] = useState(null);
  const [draggingCard, setDraggingCard] = useState(null);
  const [optimisticAutoBattlefieldIds, setOptimisticAutoBattlefieldIds] = useState(() => new Set());
  const [myBattlefieldSizePx, setMyBattlefieldSizePx] = useState({
    width: BATTLEFIELD_DEFAULT_WIDTH_PX,
    height: BATTLEFIELD_BASE_MIN_HEIGHT_PX
  });
  const [opponentBattlefieldSizePx, setOpponentBattlefieldSizePx] = useState({
    width: BATTLEFIELD_DEFAULT_WIDTH_PX,
    height: BATTLEFIELD_BASE_MIN_HEIGHT_PX
  });
  const [battlefieldViewport, setBattlefieldViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : BATTLEFIELD_DEFAULT_WIDTH_PX,
    height: typeof window !== 'undefined' ? window.innerHeight : BATTLEFIELD_BASE_MIN_HEIGHT_PX
  }));
  const [autoPassConfig, setAutoPassConfig] = useState(getDefaultAutoPassConfig());
  const [autoPassMenuOpen, setAutoPassMenuOpen] = useState(false);
  const [autoPassMenuPosition, setAutoPassMenuPosition] = useState(null);
  const autoPassInFlightRef = useRef(false);
  const autoPassBtnRef = useRef(null);
  const autoPassMenuRef = useRef(null);
  const topActionScrollRef = useRef(null);
  const lastAutoPassSignatureRef = useRef(null);
  const lastSeenAutoPassLogKeyRef = useRef(null);
  const proxyAutoPassInFlightRef = useRef(false);
  const lastProxyAutoPassTriggerRef = useRef(null);
  const headerTapLoggedRef = useRef(false);

  // New state for multi-targeting
  const [targetingState, setTargetingState] = useState(null); // { source, mode: 'CAST'|'ABILITY'|'MANUAL', selectedIds: [] }
  const [attachmentState, setAttachmentState] = useState(null); // { source }
  const [attachmentPlayerPickerCard, setAttachmentPlayerPickerCard] = useState(null);
  const [opponentSectionHighlighted, setOpponentSectionHighlighted] = useState(false);
  const [attackTargetPickerCard, setAttackTargetPickerCard] = useState(null);
  const [blockPickerCard, setBlockPickerCard] = useState(null);

  const [reorderModal, setReorderModal] = useState(null); // { ownerId, n, orderedIds }
  const [libraryReviewModal, setLibraryReviewModal] = useState(null); // { mode, ownerId, n, allIds, orderedIds, movedIds }
  const [customCounterModal, setCustomCounterModal] = useState(null); // { cardId, label, amount }
  const [damageModal, setDamageModal] = useState(null); // { cardId, amount }
  const [tokenModal, setTokenModal] = useState(null); // Token Tools panel custom form
  const [revealsOpen, setRevealsOpen] = useState(false);
  const [stackDetailOpen, setStackDetailOpen] = useState(false);
  const [selectedStackItemId, setSelectedStackItemId] = useState(null);
  const [timeControlsOpen, setTimeControlsOpen] = useState(false);
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
  const [repairGameSizeBusy, setRepairGameSizeBusy] = useState(false);
  const [tutorialMinimized, setTutorialMinimized] = useState(false);
  const [tutorialExitConfirmOpen, setTutorialExitConfirmOpen] = useState(false);
  const [tutorialOverlayError, setTutorialOverlayError] = useState(null);
  const [optimisticTutorialState, setOptimisticTutorialState] = useState(null);
  const [tutorialSyncPending, setTutorialSyncPending] = useState(false);
  const [tutorialDebugTiming, setTutorialDebugTiming] = useState({ lastAction: null, localAdvanceMs: null, firestoreWriteMs: null });
  const optimisticTutorialRef = useRef(null);
  const tutorialSyncWriteIdRef = useRef(0);

  // Chat State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [recapOpen, setRecapOpen] = useState(false);
  const chatEndRef = useRef(null);

  // Use the viewAsId to determine which player is "Active" on this screen
  const userId = realUserId;
  const players = useMemo(() => (Array.isArray(game?.players) ? game.players : []), [game?.players]);
  const isPlayer = players.some(p => p?.id === userId);
  const isHost = Boolean(game?.hostId && game.hostId === userId);
  const isSpectator = !isPlayer && (Array.isArray(game?.spectatorIds) ? game.spectatorIds : []).includes(userId);

  useEffect(() => {
    if (!game || !isSpectator) return;
    const effectPlayers = Array.isArray(game.players) ? game.players : [];
    if (effectPlayers.length === 0) return;
    if (!viewAsId || !effectPlayers.some(p => p.id === viewAsId)) {
      setViewAsId(effectPlayers[0].id);
    }
  }, [game, isSpectator, viewAsId]);

  useEffect(() => {
    if (isSpectator && boardUnlocked) {
      setBoardUnlocked(false);
    }
  }, [isSpectator, boardUnlocked]);

  const viewAsPlayerId = isSpectator ? viewAsId : userId;
  const viewAsPlayer = players.find(p => p?.id === viewAsPlayerId);
  const opponent = players.find(p => p?.id !== viewAsPlayerId);
  const canAct = !isSpectator;
  const showGameSizeDebug = isDebugActionsEnabled() || isPerfActionsEnabled();
  const gameDocumentSizeEstimate = useMemo(() => (showGameSizeDebug && game ? getGameDocumentSizeEstimate(game) : null), [showGameSizeDebug, game]);
  const undoSource = optimisticGame ? 'optimistic' : 'firestore';
  const undoPendingSync = Boolean(optimisticGame && pendingOptimisticActionId);

  const serverTutorialState = firestoreGame?.tutorial || game?.tutorial || null;
  const displayedTutorialState = optimisticTutorialState || serverTutorialState || null;
  const isTutorialGame = Boolean(game?.isTutorial && !displayedTutorialState?.inactive);
  const currentTutorialStep = isTutorialGame ? getTutorialStepById(displayedTutorialState?.stepId || 'intro') : null;
  const currentTutorialAnchor = currentTutorialStep?.anchor || null;
  const canGoBackTutorial = isTutorialGame && getTutorialStepIndex(currentTutorialStep?.id) > 0;
  const tutorialDebugInfo = (isDebugActionsEnabled() || isPerfActionsEnabled()) && isTutorialGame ? {
    ...tutorialDebugTiming,
    localStep: optimisticTutorialState?.stepId || displayedTutorialState?.stepId || null,
    serverStep: serverTutorialState?.stepId || null,
    pendingSync: tutorialSyncPending
  } : null;

  const focusTutorialTarget = useCallback(() => {
    const anchor = Array.isArray(currentTutorialAnchor) ? currentTutorialAnchor[0] : currentTutorialAnchor;
    if (!anchor || typeof document === 'undefined') return;
    const targetAnchor = anchor === 'battlefields' ? 'own-battlefield' : anchor;
    if (targetAnchor === 'stack-button' || targetAnchor === 'stack-panel') setStackDetailOpen(true);
    if (targetAnchor === 'chat-button') { setChatOpen(true); maybeCompleteTutorialStep('game_log'); maybeCompleteTutorialStep('async_oath'); maybeCompleteTutorialStep('manual_toolbox_note'); }
    if (targetAnchor === 'library-menu-button') setLibraryMenuOpen(true);
    if (targetAnchor === 'token-tools') { setLibraryMenuOpen(false); setTokenModal(getDefaultCustomToken()); }
    if (targetAnchor === 'player-counters-button' || targetAnchor === 'player-counters-panel' || targetAnchor === 'mana-pool-panel' || targetAnchor === 'status-panel') setPlayerStatsOpen(true);
    if (targetAnchor === 'reveal-tools') setRevealsOpen(true);
    const target = document.querySelector(`[data-tutorial-anchor="${targetAnchor}"]`);

    if (targetAnchor === 'library-menu-button' || targetAnchor === 'draw-button') {
      bottomToolbarRef.current?.scrollTo?.({ left: bottomToolbarRef.current.scrollWidth, behavior: 'smooth' });
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
    } else {
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
    }

    if (targetAnchor === 'library-menu-button' && libraryButtonRef.current) {
      setTimeout(() => libraryButtonRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 250);
    }

    setTutorialPulseAnchor(anchor);
    window.setTimeout(() => setTutorialPulseAnchor((current) => current === anchor ? null : current), 2800);
  }, [currentTutorialAnchor]);

  useEffect(() => {
    if (!optimisticTutorialState || !serverTutorialState) return;
    const serverIndex = getTutorialStepIndex(serverTutorialState.stepId || 'intro');
    const localIndex = getTutorialStepIndex(optimisticTutorialState.stepId || 'intro');
    const serverCaughtUp = serverTutorialState.stepId === optimisticTutorialState.stepId
      && Boolean(serverTutorialState.finished) === Boolean(optimisticTutorialState.finished)
      && Boolean(serverTutorialState.inactive) === Boolean(optimisticTutorialState.inactive);
    if (serverCaughtUp || serverIndex > localIndex) {
      optimisticTutorialRef.current = null;
      setOptimisticTutorialState(null);
      setTutorialSyncPending(false);
    }
  }, [optimisticTutorialState, serverTutorialState]);

  const updateTutorialState = (updates = {}, { actionLabel = 'manual' } = {}) => {
    if (!gameId || !game?.isTutorial) return Promise.resolve();
    const localStartedAt = getActionPerfNow();
    const baseTutorial = optimisticTutorialRef.current || displayedTutorialState || game.tutorial || {};
    const nextTutorial = {
      scriptVersion: baseTutorial.scriptVersion || TUTORIAL_SCRIPT_VERSION,
      stepId: updates.stepId ?? baseTutorial.stepId ?? 'intro',
      completedStepIds: capTutorialCompletedStepIds(updates.completedStepIds ?? baseTutorial.completedStepIds ?? []),
      playerId: baseTutorial.playerId || userId,
      opponentName: baseTutorial.opponentName || 'Nicol Bolas',
      opponentIsScripted: baseTutorial.opponentIsScripted !== false,
      finished: Boolean(updates.finished ?? baseTutorial.finished),
      inactive: Boolean(updates.inactive ?? baseTutorial.inactive)
    };
    optimisticTutorialRef.current = nextTutorial;
    setOptimisticTutorialState(nextTutorial);
    setTutorialSyncPending(true);
    setTutorialOverlayError(null);
    setTutorialDebugTiming((current) => ({
      ...current,
      lastAction: actionLabel,
      localAdvanceMs: Math.round((getActionPerfNow() - localStartedAt) * 10) / 10,
      firestoreWriteMs: null
    }));

    const writeId = ++tutorialSyncWriteIdRef.current;
    const writeStartedAt = getActionPerfNow();
    const writePromise = updateDoc(doc(db, 'games_v3', gameId), {
      tutorial: nextTutorial,
      updatedAt: serverTimestamp()
    }).then(() => {
      const writeMs = Math.round((getActionPerfNow() - writeStartedAt) * 10) / 10;
      setTutorialDebugTiming((current) => ({ ...current, firestoreWriteMs: writeMs }));
      setTutorialOverlayError(null);
      if (writeId === tutorialSyncWriteIdRef.current && serverTutorialState?.stepId === nextTutorial.stepId) {
        setTutorialSyncPending(false);
      }
    }).catch((error) => {
      console.error('Tutorial state update failed', error);
      if (writeId === tutorialSyncWriteIdRef.current) setTutorialSyncPending(false);
      setTutorialDebugTiming((current) => ({ ...current, firestoreWriteMs: Math.round((getActionPerfNow() - writeStartedAt) * 10) / 10 }));
      setTutorialOverlayError('Tutorial sync warning: progress is local for now. You can keep playing.');
      setNotification('Tutorial progress sync is delayed; you can keep playing.');
      setTimeout(() => setNotification(null), 3000);
    });
    return writePromise;
  };

  const advanceTutorialStepFrom = (expectedStepId, { markCompleted = true, finish = false, actionLabel = 'advance' } = {}) => {
    if (!isTutorialGame || !expectedStepId) return Promise.resolve(false);
    const liveStepId = (optimisticTutorialRef.current || displayedTutorialState || game?.tutorial || {})?.stepId || 'intro';
    if (liveStepId !== expectedStepId) return Promise.resolve(false);
    const baseCompletedStepIds = capTutorialCompletedStepIds((optimisticTutorialRef.current || displayedTutorialState || game?.tutorial || {})?.completedStepIds || []);
    const completedStepIds = markCompleted
      ? capTutorialCompletedStepIds([...baseCompletedStepIds, expectedStepId])
      : baseCompletedStepIds;
    updateTutorialState({
      stepId: finish ? expectedStepId : getNextTutorialStepId(expectedStepId),
      completedStepIds,
      finished: finish || Boolean((optimisticTutorialRef.current || displayedTutorialState || game?.tutorial || {})?.finished),
      inactive: finish ? false : Boolean((optimisticTutorialRef.current || displayedTutorialState || game?.tutorial || {})?.inactive)
    }, { actionLabel });
    return Promise.resolve(true);
  };

  const advanceTutorialStep = ({ markCompleted = true, finish = false, actionLabel = 'manual next' } = {}) => {
    if (!isTutorialGame || !currentTutorialStep) return Promise.resolve(false);
    return advanceTutorialStepFrom(currentTutorialStep.id, { markCompleted, finish, actionLabel });
  };

  const goBackTutorialStep = () => {
    if (!canGoBackTutorial || !currentTutorialStep) return Promise.resolve(false);
    return updateTutorialState({ stepId: getPreviousTutorialStepId(currentTutorialStep.id) }, { actionLabel: 'manual back' });
  };

  const resumeTutorialOverlay = () => {
    setTutorialMinimized(false);
    setTutorialExitConfirmOpen(false);
  };

  const requestExitTutorial = () => {
    if (game?.isTutorial) {
      setTutorialExitConfirmOpen(true);
      return;
    }
    onExit?.();
  };

  const confirmExitTutorial = () => {
    setTutorialExitConfirmOpen(false);
    if (game?.isTutorial) {
      updateTutorialState({ inactive: true }, { actionLabel: 'exit tutorial' });
    }
    onExit?.();
  };

  const restartTutorial = () => {
    if (!game?.isTutorial) return Promise.resolve(false);
    return updateTutorialState({ stepId: 'intro', completedStepIds: [], finished: false, inactive: false }, { actionLabel: 'restart tutorial' });
  };

  const continueExploringTutorial = () => {
    if (!game?.isTutorial) return Promise.resolve(false);
    return updateTutorialState({ inactive: true, finished: true }, { actionLabel: 'explore tutorial' });
  };

  const maybeCompleteTutorialStep = (stepId) => {
    const liveStepId = (optimisticTutorialRef.current || displayedTutorialState || game?.tutorial || {})?.stepId || 'intro';
    if (!isTutorialGame || liveStepId !== stepId) return Promise.resolve(false);
    return advanceTutorialStepFrom(stepId, { markCompleted: true, actionLabel: `step:${stepId}` });
  };


  const maybeCompleteTutorialAction = (actionType, payload = {}) => {
    const liveStepId = (optimisticTutorialRef.current || displayedTutorialState || game?.tutorial || {})?.stepId || 'intro';
    if (!isTutorialGame || !liveStepId) return Promise.resolve(false);
    const stepId = liveStepId;
    const actionStepMap = {
      DRAW_CARD: ['beginning_phase_draw'],
      PLAY_LAND: ['play_land'],
      UNDO_LAST_ACTION: ['undo_play_land'],
      CAST_SPELL: ['cast_spell_to_stack', 'cast_delver', 'final_spell'],
      COPY_STACK_ITEM: ['copy_stack_item', 'final_in_response'],
      RESOLVE_STACK_TOP: ['resolve_stack_item', 'counter_stack_item', 'cast_delver', 'final_in_response'],
      COUNTER_STACK_TOP: ['counter_stack_item', 'final_in_response'],
      PASS_PRIORITY: ['pass_priority', 'final_trial', 'async_oath'],
      MANUAL_SET_STEP: payload?.phaseId === 'combat_attackers' ? ['set_attackers_phase'] : [],
      SET_COMBAT_DAMAGE_STEP: payload?.combatDamageStep === COMBAT_DAMAGE_STEPS.FIRST_STRIKE ? ['first_strike_step'] : (payload?.combatDamageStep === COMBAT_DAMAGE_STEPS.REGULAR ? ['regular_damage_step'] : []),
      SET_ATTACK_TARGET: ['declare_attacker_player', 'attack_planeswalker_battle_note'],
      TOGGLE_BLOCK_TARGET: ['declare_blocker_note'],
      TAP_TOGGLE: ['tap_card'],
      TEMP_DAMAGE: ['damage_markers'],
      MOD_COUNTER: ['add_counter'],
      ADD_CARD_REMINDER: ['add_reminder'],
      PHASE_TOGGLE: ['phase_card'],
      SWITCH_CARD_FACE: ['transform_card', 'face_down_reveal'],
      TOGGLE_FACE: ['face_down_reveal'],
      REVEAL_CARD: ['reveal_top_delver'],
      BATCH_REVEAL_LIBRARY: ['reveal_top_delver', 'batch_library_actions', 'opponent_library_tools'],
      BATCH_DRAW_LIBRARY: ['batch_library_actions', 'opponent_library_tools'],
      BATCH_MILL_LIBRARY: ['batch_library_actions', 'opponent_library_tools'],
      BATCH_EXILE_LIBRARY: ['batch_library_actions', 'opponent_library_tools'],
      BATCH_SCRY_LIBRARY: ['batch_library_actions', 'opponent_library_tools'],
      BATCH_SURVEIL_LIBRARY: ['batch_library_actions', 'opponent_library_tools'],
      REORDER_TOP_LIBRARY: ['opponent_library_tools'],
      SHUFFLE_LIBRARY: ['opponent_library_tools'],
      CREATE_TOKEN: ['create_token', 'deck_tokens_note', 'custom_token_note'],
      TARGET: ['target_system'],
      ATTACH_CARD: payload?.targetPlayerId ? ['attach_to_player_note'] : ['attach_to_permanent'],
      CLONE_CARD: ['clone_control'],
      CHANGE_CONTROL: ['clone_control'],
      PRIVATE_PEEK_HAND: ['private_hand_peek'],
      REVEAL_ALL_HAND: ['reveal_hand_note'],
      TOGGLE_HAND_REVEAL: ['reveal_hand_note'],
      PLAYER_COUNTER: ['player_counters'],
      MANA_POOL_ADJUST: ['mana_pool'],
      MANA_POOL_CLEAR: ['mana_pool'],
      PLAYER_STATUS_TOGGLE: ['statuses'],
      RING_TEMPTATION: ['statuses'],
      TOGGLE_PLAYER_STATUS: ['statuses'],
      SET_DAY_NIGHT: ['statuses'],
      ADD_PLAYER_EMBLEM: ['emblems'],
      ADD_PLAYER_REMINDER: ['dungeons_note'],
      COMMANDER_TAX: ['commander_note'],
      COMMANDER_DAMAGE: ['commander_note'],
      SET_COMMANDER: ['commander_note']
    };
    if ((actionStepMap[actionType] || []).includes(stepId)) {
      if (stepId === 'final_trial' && actionType === 'PASS_PRIORITY') {
        const baseCompletedStepIds = capTutorialCompletedStepIds((optimisticTutorialRef.current || displayedTutorialState || game?.tutorial || {})?.completedStepIds || []);
        updateTutorialState({
          stepId: 'tutorial_complete',
          completedStepIds: capTutorialCompletedStepIds([...baseCompletedStepIds, stepId]),
          finished: true,
          inactive: false
        }, { actionLabel: actionType });
        return Promise.resolve(true);
      }
      return advanceTutorialStepFrom(stepId, { markCompleted: true, actionLabel: actionType });
    }
    return Promise.resolve(false);
  };




  useEffect(() => {
    if (!isTutorialGame || !selectedCard) return;
    const liveStepId = (optimisticTutorialRef.current || displayedTutorialState || game?.tutorial || {})?.stepId || 'intro';
    if (['hand_area'].includes(liveStepId)) {
      maybeCompleteTutorialStep(liveStepId);
    }
  }, [isTutorialGame, selectedCard?.instanceId]);

  useEffect(() => {
    if (!isTutorialGame) return;
    const liveStepId = (optimisticTutorialRef.current || displayedTutorialState || game?.tutorial || {})?.stepId || 'intro';
    if (stackDetailOpen && ['inspect_stack', 'bolas_negate', 'bolas_removal', 'final_bolas_response'].includes(liveStepId)) maybeCompleteTutorialStep(liveStepId);
    if (chatOpen && ['game_log', 'async_oath', 'manual_toolbox_note'].includes(liveStepId)) maybeCompleteTutorialStep(liveStepId);
    if (libraryMenuOpen && ['open_library_tools', 'opponent_library_tools'].includes(liveStepId)) maybeCompleteTutorialStep(liveStepId);
    if (libraryBatchOpen && liveStepId === 'batch_library_actions') maybeCompleteTutorialStep(liveStepId);
    if (tokenModal && ['deck_tokens_note', 'custom_token_note'].includes(liveStepId)) maybeCompleteTutorialStep(liveStepId);
    if (playerStatsOpen && ['player_panel', 'dungeons_note', 'commander_note'].includes(liveStepId)) maybeCompleteTutorialStep(liveStepId);
    if (revealsOpen && liveStepId === 'reveal_hand_note') maybeCompleteTutorialStep(liveStepId);
  }, [isTutorialGame, stackDetailOpen, chatOpen, libraryMenuOpen, libraryBatchOpen, Boolean(tokenModal), playerStatsOpen, revealsOpen]);

  const buildTutorialCardInstance = useCallback((cardName, ownerId, zone = ZONES.HAND, controllerId = ownerId) => {
    const safeName = String(cardName || 'Tutorial Card');
    const safeOwnerId = ownerId || userId || 'tutorial-player';
    const seed = TUTORIAL_STARTER_CARD_SEED.find((card) => card.name === safeName || card.card_faces?.some((face) => face?.name === safeName)) || { name: safeName, type_line: 'Card', oracle_text: '', layout: 'normal' };
    return sanitizeScryfallCardForGame({ layout: 'normal', ...seed }, {
      id: `tutorial-${safeName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'card'}`,
      instanceId: generateCardId(),
      ownerId: safeOwnerId,
      controllerId: controllerId || safeOwnerId,
      zone,
      tapped: false,
      counters: {},
      tempDamage: 0,
      faceDown: false,
      x: 8,
      y: 8
    });
  }, [userId]);

  const ensureTutorialStepSetup = useCallback(async (stepId) => {
    if (!gameId || !game?.isTutorial || game?.tutorial?.inactive || !userId) return;
    if (!game || typeof game !== 'object') return;
    const needs = {
      play_land: [{ name: 'Mountain', zone: ZONES.HAND, ownerId: userId, controllerId: userId }],
      undo_play_land: [{ name: 'Mountain', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId }],
      cast_spell_to_stack: [{ name: 'Lightning Bolt', zone: ZONES.HAND, ownerId: userId, controllerId: userId }],
      inspect_stack: [{ name: 'Lightning Bolt', zone: 'stack_zone', ownerId: userId, controllerId: userId, stack: true }],
      bolas_negate: [
        { name: 'Lightning Bolt', zone: 'stack_zone', ownerId: userId, controllerId: userId, stack: true },
        { name: 'Negate', zone: 'stack_zone', ownerId: opponent?.id || userId, controllerId: opponent?.id || userId, stack: true, targetName: 'Lightning Bolt' }
      ],
      copy_stack_item: [
        { name: 'Lightning Bolt', zone: 'stack_zone', ownerId: userId, controllerId: userId, stack: true },
        { name: 'Negate', zone: 'stack_zone', ownerId: opponent?.id || userId, controllerId: opponent?.id || userId, stack: true, targetName: 'Lightning Bolt' }
      ],
      resolve_stack_item: [{ name: 'Lightning Bolt', zone: 'stack_zone', ownerId: userId, controllerId: userId, stack: true }],
      counter_stack_item: [{ name: 'Lightning Bolt', zone: 'stack_zone', ownerId: userId, controllerId: userId, stack: true }],
      cast_delver: [{ name: 'Delver of Secrets', zone: ZONES.HAND, ownerId: userId, controllerId: userId }],
      reveal_top_delver: [{ name: 'Lightning Bolt', zone: ZONES.LIBRARY, ownerId: userId, controllerId: userId }],
      transform_card: [{ name: 'Delver of Secrets', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId, activeFaceIndex: 0 }],
      bolas_removal: [
        { name: 'Delver of Secrets', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId, activeFaceIndex: 1 },
        { name: 'Doom Blade', zone: 'stack_zone', ownerId: opponent?.id || userId, controllerId: opponent?.id || userId, stack: true, targetName: 'Insectile Aberration' }
      ],
      phase_card: [{ name: 'Delver of Secrets', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId, activeFaceIndex: 1 }],
      add_counter: [{ name: 'Delver of Secrets', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId, activeFaceIndex: 1 }],
      add_reminder: [{ name: 'Delver of Secrets', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId, activeFaceIndex: 1 }],
      tap_card: [{ name: 'Delver of Secrets', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId, activeFaceIndex: 1 }],
      face_down_reveal: [{ name: 'Delver of Secrets', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId, activeFaceIndex: 1 }],
      set_attackers_phase: [{ name: 'Llanowar Elves', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId }],
      declare_attacker_player: [{ name: 'Llanowar Elves', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId }],
      attack_planeswalker_battle_note: [
        { name: 'Llanowar Elves', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId },
        { name: 'Nicol Bolas, Planeswalker', zone: ZONES.BATTLEFIELD, ownerId: opponent?.id || userId, controllerId: opponent?.id || userId }
      ],
      declare_blocker_note: [{ name: 'Zombie Token', zone: ZONES.BATTLEFIELD, ownerId: opponent?.id || userId, controllerId: opponent?.id || userId }],
      damage_markers: [{ name: 'Llanowar Elves', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId }],
      create_token: [{ name: 'Dragon Fodder', zone: ZONES.HAND, ownerId: userId, controllerId: userId }],
      deck_tokens_note: [{ name: 'Dragon Fodder', zone: ZONES.HAND, ownerId: userId, controllerId: userId }],
      custom_token_note: [],
      target_system: [{ name: 'Giant Growth', zone: 'stack_zone', ownerId: userId, controllerId: userId, stack: true }],
      attach_to_permanent: [
        { name: 'Rancor', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId },
        { name: 'Llanowar Elves', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId }
      ],
      attach_to_player_note: [{ name: 'Curse of the Pierced Heart', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId }],
      clone_control: [
        { name: 'Clone', zone: ZONES.BATTLEFIELD, ownerId: userId, controllerId: userId },
        { name: 'Act of Treason', zone: ZONES.HAND, ownerId: userId, controllerId: userId }
      ],
      private_hand_peek: [{ name: 'Doom Blade', zone: ZONES.HAND, ownerId: opponent?.id || userId, controllerId: opponent?.id || userId }],
      opponent_library_tools: [{ name: 'Portent', zone: ZONES.HAND, ownerId: userId, controllerId: userId }],
      final_spell: [{ name: 'Lightning Bolt', zone: ZONES.HAND, ownerId: userId, controllerId: userId }],
      final_bolas_response: [
        { name: 'Lightning Bolt', zone: 'stack_zone', ownerId: userId, controllerId: userId, stack: true },
        { name: 'Negate', zone: 'stack_zone', ownerId: opponent?.id || userId, controllerId: opponent?.id || userId, stack: true, targetName: 'Lightning Bolt' }
      ],
      final_in_response: [
        { name: 'Reverberate', zone: 'stack_zone', ownerId: userId, controllerId: userId, stack: true, targetName: 'Negate' },
        { name: 'Negate', zone: 'stack_zone', ownerId: opponent?.id || userId, controllerId: opponent?.id || userId, stack: true, targetName: 'Lightning Bolt' }
      ]
    }[stepId];
    if (!needs) return;

    let nextCards = Array.isArray(game.cards) ? [...game.cards] : [];
    let nextStack = Array.isArray(game.stack) ? [...game.stack] : [];
    let changed = false;

    try {
    needs.forEach((need) => {
      const matching = nextCards.find((card) => (card.name === need.name || card.card_faces?.some((face) => face?.name === need.name)) && card.ownerId === need.ownerId) || nextCards.find((card) => card.name === need.name || card.card_faces?.some((face) => face?.name === need.name));
      let card = matching;
      if (!card) {
        card = buildTutorialCardInstance(need.name, need.ownerId || userId, need.zone, need.controllerId || need.ownerId || userId);
        nextCards.push(card);
        changed = true;
      } else {
        const hydratedCard = hydrateTutorialCardPreviewData(card);
        if (JSON.stringify(hydratedCard.card_faces || null) !== JSON.stringify(card.card_faces || null) || hydratedCard.image_uri !== card.image_uri) {
          nextCards = nextCards.map((candidate) => candidate.instanceId === card.instanceId ? hydratedCard : candidate);
          card = hydratedCard;
          changed = true;
        }
      }
      if (card.zone !== need.zone || card.controllerId !== need.controllerId || (Number.isInteger(need.activeFaceIndex) && card.activeFaceIndex !== need.activeFaceIndex) || (need.zone === ZONES.BATTLEFIELD && card.tapped)) {
        nextCards = nextCards.map((candidate) => candidate.instanceId === card.instanceId ? { ...candidate, zone: need.zone, controllerId: need.controllerId, ...(Number.isInteger(need.activeFaceIndex) ? { activeFaceIndex: need.activeFaceIndex } : {}), tapped: false, phasedOut: false } : candidate);
        card = nextCards.find((candidate) => candidate.instanceId === card.instanceId) || card;
        changed = true;
      }
      if (need.stack && !nextStack.some((item) => item.sourceId === card.instanceId || item.name === need.name)) {
        nextStack.push({
          id: `tutorial-stack-${card.instanceId}`,
          sourceId: card.instanceId,
          name: need.name,
          controllerId: need.controllerId,
          ownerId: need.ownerId,
          itemType: 'SPELL',
          type: 'SPELL',
          createdAt: Date.now(),
          ...(need.targetName ? { targets: [{ name: need.targetName, label: need.targetName }] } : {})
        });
        changed = true;
      }
    });

    if (['set_attackers_phase', 'declare_attacker_player', 'first_strike_step', 'regular_damage_step'].includes(stepId) && game.phase !== 'combat_attackers') {
      await updateDoc(doc(db, 'games_v3', gameId), { phase: 'combat_attackers', combat: normalizeCombatState(game.combat), cards: nextCards, stack: nextStack, updatedAt: serverTimestamp() });
      setTutorialOverlayError(null);
      return;
    }

    if (changed) {
      await updateDoc(doc(db, 'games_v3', gameId), { cards: nextCards, stack: nextStack, updatedAt: serverTimestamp() });
    }
    setTutorialOverlayError(null);
    } catch (error) {
      console.error('Tutorial step setup failed', error);
      setTutorialOverlayError('Tutorial step unavailable. Skip or restart tutorial.');
    }
  }, [buildTutorialCardInstance, game, gameId, opponent?.id, userId]);

  useEffect(() => {
    if (!isTutorialGame || !currentTutorialStep?.id) return;
    ensureTutorialStepSetup(currentTutorialStep.id);
  }, [isTutorialGame, currentTutorialStep?.id, ensureTutorialStepSetup]);

  const handleRepairGameSize = async () => {
    if (!gameId || !userId || (!isHost && !isPlayer)) {
      setNotification('Only the host or a current player can repair game size.');
      setTimeout(() => setNotification(null), 2500);
      return;
    }

    setRepairGameSizeBusy(true);
    try {
      const gameRef = doc(db, 'games_v3', gameId);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(gameRef);
        if (!snap.exists()) return;
        const currentGame = snap.data();
        const currentPlayers = currentGame.players || [];
        const currentIsPlayer = currentPlayers.some((player) => player.id === userId);
        const currentIsHost = Boolean(currentGame.hostId && currentGame.hostId === userId);
        if (!currentIsPlayer && !currentIsHost) throw new Error('Only the host or a current player can repair game size.');

        const actorName = currentPlayers.find((player) => player.id === userId)?.name || displayName || 'Unknown';
        const repairLogEntry = buildGameLogEntry({
          currentGame,
          playerId: userId,
          playerName: actorName,
          type: 'GAME_SIZE_REPAIR',
          category: 'system',
          message: `${actorName} compacted old undo/log history to repair game size.`
        });
        transaction.update(gameRef, normalizeGameUpdatesForFirestore({
          undoStack: pruneUndoStackForFirestore(currentGame.undoStack || [], { maxEntries: 1, maxCardSnapshotEntries: 1, budgetBytes: 128 * 1024 }),
          log: pruneLogForFirestore([...(currentGame.log || []), repairLogEntry], EMERGENCY_REPAIR_LOG_ENTRIES),
          updatedAt: serverTimestamp()
        }, 'GAME_SIZE_REPAIR'));
      });
      setNotification('Game size repaired. Old undo/log history was compacted.');
      setTimeout(() => setNotification(null), 3500);
    } catch (error) {
      console.error('Game size repair failed', error);
      setNotification(`Repair failed: ${error?.message || String(error)}`);
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setRepairGameSizeBusy(false);
    }
  };

  const applyOptimisticGamePatch = useCallback(({ actionType, payload = {}, patch = {}, perfActionId = null }) => {
    if (!game || !actionType || !patch || Object.keys(patch).length === 0) {
      recordPerfOptimisticSkipped('No safe local patch available.', perfActionId);
      return false;
    }

    const nextOptimisticGame = {
      ...game,
      ...patch,
      combat: normalizeCombatState(patch.combat || game.combat),
      __optimisticActionId: perfActionId || payload.clientActionId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };
    const actionId = nextOptimisticGame.__optimisticActionId;
    const startedAt = getActionPerfNow();
    const marker = getPerfActionMarker({ actionType, payload, currentGame: game });

    pendingOptimisticActionRef.current = {
      id: actionId,
      actionType,
      payload: compactPerfPayload(payload),
      cardId: getPerfActionCardId(payload),
      marker,
      handlerStartWallNow: getActionPerfWallNow(),
      startedAt
    };
    setOptimisticGame(nextOptimisticGame);
    setPendingOptimisticActionId(actionId);
    setPendingOptimisticStartedAt(startedAt);
    recordPerfOptimisticApplied({ actionType }, perfActionId || actionId);
    return true;
  }, [game]);

  const clearOptimisticGame = useCallback((reason = 'cleared', perfActionId = null) => {
    const pendingId = perfActionId || pendingOptimisticActionRef.current?.id || pendingOptimisticActionId;
    if (pendingOptimisticActionRef.current || optimisticGame) {
      recordPerfOptimisticReverted(reason, pendingId);
    }
    pendingOptimisticActionRef.current = null;
    setOptimisticGame(null);
    setPendingOptimisticActionId(null);
    setPendingOptimisticStartedAt(null);
  }, [optimisticGame, pendingOptimisticActionId]);

  const getPlayerTargetId = (pid) => `player:${pid}`;
  const getNormalizedFromLegacyPosition = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      nx: clampBattlefieldNormalized(x / 100),
      ny: clampBattlefieldNormalized(y / 100)
    };
  };

  const getCardRenderPosition = (card, isOpponentView = false, battlefieldDimensions = null) => {
    let nx = Number.isFinite(card?.nx) ? card.nx : null;
    let ny = Number.isFinite(card?.ny) ? card.ny : null;

    if (nx === null || ny === null) {
      const legacy = getNormalizedFromLegacyPosition(card?.x, card?.y);
      if (legacy) {
        console.log('[BATTLEFIELD_LEGACY_FALLBACK]', {
          name: card?.name || 'Unknown card',
          cardId: card?.instanceId,
          x: card?.x,
          y: card?.y,
          nx: legacy.nx,
          ny: legacy.ny
        });
      }
      nx = legacy?.nx ?? 0.15;
      ny = legacy?.ny ?? 0.2;
    }

    if (!isOpponentView && battlefieldDimensions) {
      const { widthPx, heightPx, cardWidthPx, cardHeightPx } = battlefieldDimensions;
      return {
        nx: clampBattlefieldCenterNormalized(nx, widthPx, cardWidthPx || BATTLEFIELD_CARD_WIDTH_PX, BATTLEFIELD_SIDE_PADDING_PX),
        ny: clampBattlefieldCenterNormalized(ny, heightPx, cardHeightPx || BATTLEFIELD_CARD_HEIGHT_PX)
      };
    }

    return {
      nx: clampBattlefieldNormalized(nx),
      ny: clampBattlefieldNormalized(isOpponentView ? 1 - ny : ny)
    };
  };

  const getMyBattlefieldRenderPosition = (card, liveLayoutPosition, battlefieldDimensions, layout, forceAuto = false) => {
    const positionMode = forceAuto ? BATTLEFIELD_POSITION_MODE_AUTO : getCardPositionMode(card);
    const source = positionMode === BATTLEFIELD_POSITION_MODE_AUTO && liveLayoutPosition
      ? 'live auto layout'
      : 'saved manual nx/ny';
    const dimensions = battlefieldDimensions || {
      widthPx: layout?.battlefieldWidth,
      heightPx: layout?.battlefieldHeightPx,
      cardWidthPx: layout?.cardWidthPx,
      cardHeightPx: layout?.cardHeightPx
    };
    const renderedPosition = source === 'live auto layout'
      ? {
          nx: clampBattlefieldCenterNormalized(
            liveLayoutPosition.nx,
            dimensions.widthPx,
            dimensions.cardWidthPx || BATTLEFIELD_CARD_WIDTH_PX,
            BATTLEFIELD_SIDE_PADDING_PX
          ),
          ny: clampBattlefieldCenterNormalized(
            liveLayoutPosition.ny,
            dimensions.heightPx,
            dimensions.cardHeightPx || BATTLEFIELD_CARD_HEIGHT_PX
          )
        }
      : getCardRenderPosition(card, false, dimensions);

    console.log('[BATTLEFIELD_RENDER_CARD]', {
      name: card?.name || 'Unknown card',
      cardId: card?.instanceId,
      positionMode,
      renderedFrom: source,
      nx: renderedPosition.nx,
      ny: renderedPosition.ny,
      measuredBattlefieldWidth: layout?.battlefieldWidth ?? dimensions.widthPx,
      chosenColumns: layout?.columns,
      columnCentersPx: layout?.columnCentersPx?.map(centerX => Number(centerX.toFixed(1))) || []
    });

    return renderedPosition;
  };


  const getOpponentBattlefieldRenderPosition = (card, liveLayoutPosition, layout) => {
    const positionMode = getCardPositionMode(card);
    const source = positionMode === BATTLEFIELD_POSITION_MODE_AUTO && liveLayoutPosition
      ? 'opponent live auto layout'
      : 'opponent saved manual nx/ny';
    const dimensions = {
      widthPx: layout?.battlefieldWidth,
      heightPx: layout?.battlefieldHeightPx,
      cardWidthPx: layout?.cardWidthPx,
      cardHeightPx: layout?.cardHeightPx
    };
    const renderedPosition = source === 'opponent live auto layout'
      ? {
          nx: clampBattlefieldCenterNormalized(
            liveLayoutPosition.nx,
            dimensions.widthPx,
            dimensions.cardWidthPx || BATTLEFIELD_CARD_WIDTH_PX,
            BATTLEFIELD_SIDE_PADDING_PX
          ),
          ny: clampBattlefieldCenterNormalized(
            liveLayoutPosition.ny,
            dimensions.heightPx,
            dimensions.cardHeightPx || BATTLEFIELD_CARD_HEIGHT_PX
          )
        }
      : getCardRenderPosition(card, false, dimensions);

    console.log('[OPPONENT_BATTLEFIELD_RENDER_CARD]', {
      opponentPanelMeasuredWidth: layout?.battlefieldWidth ?? dimensions.widthPx,
      opponentBattlefieldHeightPx: layout?.battlefieldHeightPx ?? dimensions.heightPx,
      chosenColumns: layout?.columns,
      cardWidthPx: layout?.cardWidthPx ?? dimensions.cardWidthPx,
      columnCentersPx: layout?.columnCentersPx?.map(centerX => Number(centerX.toFixed(1))) || [],
      name: card?.name || 'Unknown card',
      cardName: card?.name || 'Unknown card',
      cardId: card?.instanceId,
      positionMode,
      renderedFrom: source,
      nx: renderedPosition.nx,
      ny: renderedPosition.ny,
      renderedNx: renderedPosition.nx,
      renderedNy: renderedPosition.ny
    });

    return renderedPosition;
  };

  useLayoutEffect(() => {
    if (!libraryMenuOpen) {
      setLibraryMenuPos(null);
      return;
    }

    const updatePosition = () => {
      if (!libraryButtonRef.current) return;
      const rect = libraryButtonRef.current.getBoundingClientRect();
      setLibraryMenuPos({ top: rect.top, right: rect.right });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [libraryMenuOpen]);

  useEffect(() => {
    if (!gameId) return undefined;
    // UPDATED: Path
    const listenerInstanceId = `${gameId}-${++perfActionsStore.listenerInstanceSeq}`;
    gameListenerIdRef.current = listenerInstanceId;
    recordPerfListenerEvent({ type: 'created', gameId, listenerInstanceId, reason: 'GameBoard gameId effect mounted' });
    const unsub = onSnapshot(
      doc(db, 'games_v3', gameId),
      { includeMetadataChanges: true },
      (snapshotDoc) => {
        if (snapshotDoc.exists()) {
          const data = snapshotDoc.data();
          const lastLog = data.log && data.log.length > 0 ? data.log[data.log.length - 1] : null;
          if (isPerfActionsEnabled()) {
            const state = getPerfActionsState();
            const reflectionsByActionId = Object.fromEntries((state.actions || []).map((action) => [action.id, getPerfSnapshotReflection(action, data, lastLog)]));
            const reflectsByActionId = Object.fromEntries(Object.entries(reflectionsByActionId).map(([actionId, reflection]) => [actionId, Boolean(reflection.reflects)]));
            const lastAction = state.actions[0];
            const lastActionReflection = lastAction ? reflectionsByActionId[lastAction.id] : null;
            const updatedAtValue = data.updatedAt?.toMillis?.() ?? (data.updatedAt?.seconds ? data.updatedAt.seconds * 1000 : null);
            recordPerfSnapshot({
              gameId,
              listenerInstanceId,
              fromCache: snapshotDoc.metadata.fromCache,
              hasPendingWrites: snapshotDoc.metadata.hasPendingWrites,
              gameUpdatedAt: updatedAtValue,
              stackLength: data.stack?.length || 0,
              cardsLength: data.cards?.length || 0,
              lastLogType: lastLog?.type || null,
              lastLogMessage: lastLog?.message || lastLog?.desc || null,
              lastLogTimestamp: lastLog?.timestamp || null,
              reflectsByActionId,
              reflectsLastAction: Boolean(lastAction && reflectsByActionId[lastAction.id]),
              reflectionReason: lastActionReflection?.reason || null,
              reflectionDebug: lastActionReflection?.debug || null
            });
          }
          const nextFirestoreGame = { ...data, combat: normalizeCombatState(data.combat) };
          latestFirestoreGameRef.current = nextFirestoreGame;
          setFirestoreGame(nextFirestoreGame);
          const pendingOptimistic = pendingOptimisticActionRef.current;
          if (pendingOptimistic) {
            const pendingReflection = getPerfSnapshotReflection(pendingOptimistic, nextFirestoreGame, lastLog);
            const completedWrite = completedOptimisticActionIdsRef.current.has(pendingOptimistic.id);
            const serverSnapshot = !snapshotDoc.metadata.hasPendingWrites && !snapshotDoc.metadata.fromCache;
            const safeFallbackReflects = completedWrite
              && pendingOptimistic.actionType === 'PLAY_LAND'
              && getPerfCardZone(nextFirestoreGame, pendingOptimistic.cardId) === ZONES.BATTLEFIELD
              && Boolean(getPerfRecentUndoEntries(nextFirestoreGame).some((entry) => entry && !entry.pendingSync && perfEntryMatchesAction(entry, pendingOptimistic)));
            const canReconcileOptimistic = pendingReflection.reflects && (serverSnapshot || completedWrite || safeFallbackReflects);
            if (canReconcileOptimistic || safeFallbackReflects) {
              recordPerfOptimisticConfirmed({
                snapshotFromCache: snapshotDoc.metadata.fromCache,
                hasPendingWrites: snapshotDoc.metadata.hasPendingWrites,
                reflectionReason: pendingReflection.reason,
                safeFallbackReflects
              }, pendingOptimistic.id);
              completedOptimisticActionIdsRef.current.delete(pendingOptimistic.id);
              pendingOptimisticActionRef.current = null;
              setOptimisticGame(null);
              setPendingOptimisticActionId(null);
              setPendingOptimisticStartedAt(null);
            }
          }

          if (lastLog) {
            if ((lastLog.type === 'ROLL_DICE' || lastLog.type === 'FLIP_COIN' || lastLog.type === 'DISCARD_RANDOM') && Date.now() - lastLog.timestamp < 5000) {
              setNotification(lastLog.resultLabel || lastLog.desc);
              setTimeout(() => setNotification(null), 3000);
            }
          }
        }
        setLoading(false);
      },
      (err) => {
        recordPerfListenerEvent({ type: 'error', gameId, listenerInstanceId, reason: err?.message || String(err) });
        console.error(err);
      }
    );
    return () => {
      recordPerfListenerEvent({ type: 'unsubscribed', gameId, listenerInstanceId, reason: 'GameBoard gameId effect cleanup' });
      if (gameListenerIdRef.current === listenerInstanceId) gameListenerIdRef.current = null;
      unsub();
    };
  }, [gameId]);


  useEffect(() => {
    if (!isPerfActionsEnabled() || !game) return;
    const visibleDetails = {
      stackLength: game.stack?.length || 0,
      cardsLength: game.cards?.length || 0,
      handCount: (game.cards || []).filter((card) => card.zone === ZONES.HAND).length,
      battlefieldCount: (game.cards || []).filter((card) => card.zone === ZONES.BATTLEFIELD).length,
      selectedCardZone: selectedCard?.zone || null,
      optimisticPending: Boolean(pendingOptimisticActionId && pendingOptimisticStartedAt),
      undoSource,
      undoPendingSync
    };
    const signature = JSON.stringify(visibleDetails);
    if (perfActionsStore.lastVisibleSignature === signature) return;
    perfActionsStore.lastVisibleSignature = signature;
    recordPerfVisibleUpdate(visibleDetails);
  }, [game, selectedCard?.zone, pendingOptimisticActionId, pendingOptimisticStartedAt, undoSource, undoPendingSync]);


  // Chat Helpers
  const chatMessages = (game?.log || []).filter(e => e.type === 'CHAT');
  const gameLogEntries = (game?.log || [])
    .filter(entry => entry.type !== 'CHAT')
    .map((entry, index) => ({
      ...entry,
      id: entry.id || `${entry.timestamp || 0}-${index}`,
      message: entry.message || entry.desc || entry.text || entry.type || 'Game action',
      phaseLabel: entry.phaseLabel || getPhaseLabel(entry.phase),
      turnNumber: entry.turnNumber ?? '?'
    }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const gameLogByTurn = gameLogEntries.reduce((acc, entry) => {
    const key = entry.turnNumber || '?';
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});
  const gameLogTurnKeys = Object.keys(gameLogByTurn).sort((a, b) => Number(b) - Number(a));
  // FIX: Safety check for players array
  const myPlayer = viewAsPlayer;
  const getSelectedCardDebugSnapshot = useCallback((card = selectedCard, extra = {}) => {
    const liveCard = card?.instanceId ? (game?.cards || []).find((candidate) => candidate.instanceId === card.instanceId) : null;
    const debugCard = liveCard || card || null;
    const faces = getUsableCardFaces(debugCard);
    const activeFaceIndex = getActiveFaceIndex(debugCard);
    const typeLine = getCardTypeLine(debugCard, '');
    const lowerTypeLine = typeLine.toLowerCase();
    const ownerId = debugCard?.ownerId || null;
    const controllerId = debugCard?.controllerId || null;
    const isLand = isLandCard(debugCard);
    const isInstantOrSorcery = lowerTypeLine.includes('instant') || lowerTypeLine.includes('sorcery');
    const isPermanent = Boolean(typeLine && !isInstantOrSorcery);
    const canPlayLandCondition = Boolean(canAct && debugCard?.zone === ZONES.HAND && controllerId === viewAsPlayerId && isLand);
    const canCastCondition = Boolean(canAct && debugCard?.zone === ZONES.HAND && controllerId === viewAsPlayerId && !isLand);
    const transformAvailable = Boolean(isDoubleFacedCard(debugCard) && (!debugCard?.faceDown || controllerId === viewAsPlayerId || ownerId === viewAsPlayerId));
    return {
      buttonName: extra.buttonName || null,
      disabled: Boolean(extra.disabled),
      disabledReason: extra.disabledReason || '',
      actionType: extra.actionType || null,
      payload: extra.payload || null,
      selectedCardInstanceId: card?.instanceId || null,
      selectedCardName: card?.name || null,
      selectedCardZone: card?.zone || null,
      selectedCardOwnerId: card?.ownerId || null,
      selectedCardControllerId: card?.controllerId || null,
      liveCardFound: Boolean(liveCard),
      selectedCardDiffersFromLiveCard: Boolean(card && liveCard && debugObjectsDiffer(card, liveCard)),
      liveCard: liveCard || null,
      zone: debugCard?.zone || null,
      ownerId,
      controllerId,
      activeFaceIndex,
      cardFacesLength: Array.isArray(debugCard?.card_faces) ? debugCard.card_faces.length : 0,
      usableFaceCount: faces.length,
      displayName: getCardDisplayName(debugCard, 'Unknown'),
      typeLine,
      currentUserId: userId,
      currentPlayerId: viewAsPlayerId,
      activePlayerId: game?.turnPlayerId || players?.[game?.activePlayerIndex]?.id || null,
      priorityPlayerId: game?.priorityPlayerId || null,
      canAct,
      isLand,
      isInstantOrSorcery,
      isPermanent,
      canPlayLandCondition,
      canCastCondition,
      transformAvailable,
      ...extra
    };
  }, [selectedCard, game?.cards, game?.turnPlayerId, game?.activePlayerIndex, game?.priorityPlayerId, players, userId, viewAsPlayerId, canAct]);

  const debugCardActionClick = (buttonName, actionType, payload, event, card = selectedCard) => {
    if (!isDebugActionsEnabled()) return;
    const elementAtPoint = typeof document !== 'undefined' && event?.clientX != null && event?.clientY != null
      ? document.elementFromPoint(event.clientX, event.clientY)
      : null;
    debugActionsLog('CLICK FIRED', {
      ...getSelectedCardDebugSnapshot(card, { buttonName, actionType, payload }),
      click: {
        clientX: event?.clientX ?? null,
        clientY: event?.clientY ?? null,
        currentTarget: summarizeDebugElement(event?.currentTarget),
        target: summarizeDebugElement(event?.target),
        elementFromPoint: summarizeDebugElement(elementAtPoint),
        elementFromPointIsButton: Boolean(event?.currentTarget && elementAtPoint === event.currentTarget),
        currentTargetContainsElementFromPoint: Boolean(event?.currentTarget && elementAtPoint && event.currentTarget.contains(elementAtPoint))
      }
    });
  };

  const renderDebuggableCardActionButton = ({ buttonName, actionType, payload, card = selectedCard, disabled = false, disabledReason = '', className, children, onClick, ...buttonProps }) => {
    const debugSnapshot = getSelectedCardDebugSnapshot(card, { buttonName, actionType, payload, disabled, disabledReason });
    debugActionsLog(`render button: ${buttonName}`, debugSnapshot);
    return (
      <button
        {...buttonProps}
        disabled={disabled}
        className={className}
        onClick={(event) => {
          debugCardActionClick(buttonName, actionType, payload, event, card);
          recordPerfActionClick({ actionType, payload, buttonName, cardName: getCardDisplayName(card, card?.name || null), currentGame: game });
          if (disabled) return;
          onClick?.(event);
        }}
      >
        {children}
      </button>
    );
  };

  useEffect(() => {
    if (!isDebugActionsEnabled() || !selectedCard) return undefined;
    const handlePointerProbe = (event) => {
      const elementAtPoint = document.elementFromPoint(event.clientX, event.clientY);
      debugActionsLog('document pointer probe while card action panel open', {
        clientX: event.clientX,
        clientY: event.clientY,
        target: summarizeDebugElement(event.target),
        elementFromPoint: summarizeDebugElement(elementAtPoint),
        selectedCard: getSelectedCardDebugSnapshot(selectedCard)
      });
    };
    document.addEventListener('pointerdown', handlePointerProbe, true);
    return () => document.removeEventListener('pointerdown', handlePointerProbe, true);
  }, [selectedCard, game?.cards, game?.priorityPlayerId, game?.turnPlayerId, viewAsPlayerId, userId, canAct, getSelectedCardDebugSnapshot]);

  const commanderModeEnabled = isCommanderGame(game);
  const getCommanderDamage = (card, targetPlayerId) => Math.max(0, card?.commanderDamage?.[targetPlayerId] || 0);
  const getCommanderDamageRowsForPlayer = (playerId) => (game?.cards || [])
    .filter((card) => card.isCommander && getCommanderDamage(card, playerId) > 0)
    .map((card) => ({ card, amount: getCommanderDamage(card, playerId) }));
  const getTotalCommanderDamageToPlayer = (playerId) => getCommanderDamageRowsForPlayer(playerId).reduce((sum, row) => sum + row.amount, 0);
  const defaultPlayerCounters = commanderModeEnabled
    ? [...BUILT_IN_PLAYER_COUNTERS, ...COMMANDER_PLAYER_COUNTERS]
    : BUILT_IN_PLAYER_COUNTERS;
  const getVisiblePlayerCounters = (player) => Object.entries(player?.counters || {})
    .filter(([key, value]) => (commanderModeEnabled || key !== 'commanderTax') && Number(value) > 0)
    .map(([key, value]) => ({ key, label: PLAYER_COUNTER_BADGE_LABELS[key] || PLAYER_COUNTER_LABELS[key] || key, value }));
  const renderManaPoolBadge = (player, size = 'compact', { always = false } = {}) => {
    if (!player || (!always && !hasFloatingMana(player))) return null;
    return (
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); if (player.id === viewAsPlayerId) setPlayerStatsOpen(true); }}
        className={`${size === 'tiny' ? 'max-w-[10rem] px-1.5 py-0.5 text-[10px]' : 'max-w-[12rem] px-2 py-0.5 text-xs'} truncate rounded border border-blue-500/50 bg-blue-950/60 font-bold text-blue-100`}
        title={`Mana pool: ${getManaPoolSummary(player, { includeZeroes: true })}`}
      >
        Mana: {getManaPoolSummary(player)}
      </button>
    );
  };
  const adjustManaPool = (color, amount) => handleAction('MANA_POOL_ADJUST', { color, amount });
  const handleClearManaPool = () => handleAction('MANA_POOL_CLEAR');
  const getPlayerReminders = (playerId) => getEntityReminders((game?.players || []).find((player) => player.id === playerId));
  const renderPlayerEmblemBadges = (player, size = 'compact') => {
    const label = getPlayerEmblemBadgeLabel(player);
    if (!label) return null;
    return (
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); setPlayerStatsOpen(true); }}
        className={`${size === 'tiny' ? 'max-w-[9rem] px-1.5 py-0.5 text-[10px]' : 'max-w-[11rem] px-2 py-0.5 text-xs'} truncate rounded border border-pink-500/50 bg-pink-950/60 font-bold text-pink-100`}
        title="Open player emblems"
      >
        {label}
      </button>
    );
  };
  const renderPlayerStatusBadges = (player, size = 'compact') => getPlayerStatusBadges(player).map((badge) => (
    <span
      key={badge.key}
      className={`${size === 'tiny' ? 'max-w-[9rem] px-1.5 py-0.5 text-[10px]' : 'max-w-[11rem] px-2 py-0.5 text-xs'} truncate rounded border font-bold ${badge.style}`}
      title={badge.label}
    >
      {badge.label}
    </span>
  ));
  const removePlayerReminder = (playerId, reminderId) => handleAction('REMOVE_PLAYER_REMINDER', { targetPlayerId: playerId, reminderId });
  const removeCardReminder = (cardId, reminderId) => handleAction('REMOVE_CARD_REMINDER', { cardId, reminderId });
  const resetEmblemForm = () => setEmblemForm({ name: '', sourceName: '', text: '' });
  const openEmblemFormForPlayer = (playerId, preset = null) => {
    setEmblemFormPlayerId(playerId);
    setEmblemForm(preset || { name: '', sourceName: '', text: '' });
  };
  const submitEmblemForm = (targetPlayerId) => {
    const name = sanitizeEmblemName(emblemForm.name);
    const text = sanitizeEmblemText(emblemForm.text);
    const sourceName = sanitizeEmblemSourceName(emblemForm.sourceName);
    if (!name || !text) return;
    handleAction('ADD_PLAYER_EMBLEM', { targetPlayerId, name, text, sourceName });
    resetEmblemForm();
    setEmblemFormPlayerId(null);
  };
  const removePlayerEmblem = (playerId, emblem) => {
    if (!emblem?.id) return;
    const confirmed = typeof window === 'undefined' || window.confirm(`Remove emblem "${emblem.name}" from this player?`);
    if (confirmed) handleAction('REMOVE_PLAYER_EMBLEM', { targetPlayerId: playerId, emblemId: emblem.id });
  };
  const lastSeen = isSpectator ? spectatorLastSeenChatAt : (myPlayer?.lastSeenChatAt || 0);
  const unreadCount = chatMessages.filter(m => m.timestamp > lastSeen && m.playerId !== userId).length;
  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatOpen, chatMessages.length]);

  const sendChat = () => {
    if (!chatInput.trim()) return;
    handleAction('SEND_CHAT', { text: chatInput.trim() });
    setChatInput('');
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const openChat = () => {
    setChatOpen(true);
    maybeCompleteTutorialStep('game_log');
    maybeCompleteTutorialStep('async_oath');
    maybeCompleteTutorialStep('manual_toolbox_note');
    if (isSpectator) {
      setSpectatorLastSeenChatAt(Date.now());
    } else {
      handleAction('SET_CHAT_SEEN', { timestamp: Date.now() });
    }
  };

  const openRecap = () => {
    setRecapOpen(true);
  };

  useLayoutEffect(() => {
    const element = myBattlefieldRef.current;
    if (!element) return undefined;

    let rafId = null;
    const updateBattlefieldSize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect?.();
        const width = rect?.width;
        const height = rect?.height;
        if (Number.isFinite(width) && width > 0) {
          setMyBattlefieldSizePx(prev => {
            const next = {
              width: Math.round(width),
              height: Number.isFinite(height) && height > 0 ? Math.round(height) : prev.height
            };
            return prev.width === next.width && prev.height === next.height ? prev : next;
          });
        }
        setBattlefieldViewport({
          width: typeof window !== 'undefined' ? window.innerWidth : BATTLEFIELD_DEFAULT_WIDTH_PX,
          height: typeof window !== 'undefined' ? window.innerHeight : BATTLEFIELD_BASE_MIN_HEIGHT_PX
        });
      });
    };

    updateBattlefieldSize();

    const eventOptions = { passive: true };
    window.addEventListener('resize', updateBattlefieldSize, eventOptions);
    window.addEventListener('orientationchange', updateBattlefieldSize, eventOptions);
    window.visualViewport?.addEventListener('resize', updateBattlefieldSize, eventOptions);

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateBattlefieldSize);
      observer.observe(element);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateBattlefieldSize);
      window.removeEventListener('orientationchange', updateBattlefieldSize);
      window.visualViewport?.removeEventListener('resize', updateBattlefieldSize);
      observer?.disconnect();
    };
  }, [gameId, viewAsPlayerId]);


  const getCurrentBattlefieldDimensionsPx = () => {
    const rect = myBattlefieldRef.current?.getBoundingClientRect?.();
    const width = Number.isFinite(rect?.width) && rect.width > 0 ? rect.width : myBattlefieldSizePx.width;
    const height = Number.isFinite(rect?.height) && rect.height > 0 ? rect.height : myBattlefieldSizePx.height;
    return {
      width: Number.isFinite(width) && width > 0 ? width : BATTLEFIELD_DEFAULT_WIDTH_PX,
      height: Number.isFinite(height) && height > 0 ? height : BATTLEFIELD_BASE_MIN_HEIGHT_PX
    };
  };

  const getCurrentBattlefieldWidthPx = () => getCurrentBattlefieldDimensionsPx().width;

  const handleDragStart = (e, card) => {
    if (isSpectator || !boardUnlocked || targetingState || attachmentState || !myBattlefieldRef.current) return;
    e.stopPropagation();
    setOptimisticAutoBattlefieldIds(prev => {
      if (!prev.has(card.instanceId)) return prev;
      const next = new Set(prev);
      next.delete(card.instanceId);
      return next;
    });
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const cardRect = e.currentTarget?.getBoundingClientRect?.();
    const rect = myBattlefieldRef.current.getBoundingClientRect();
    const normalized = getMyBattlefieldRenderPosition(
      card,
      myBattlefieldLayout?.tidyPositions?.get(card.instanceId),
      {
        widthPx: rect.width,
        heightPx: rect.height,
        cardWidthPx: BATTLEFIELD_CARD_WIDTH_PX,
        cardHeightPx: BATTLEFIELD_CARD_HEIGHT_PX
      },
      myBattlefieldLayout,
      optimisticAutoBattlefieldIds.has(card.instanceId)
    );
    const pointerOffsetToCenterX = cardRect ? (cardRect.left + (cardRect.width / 2)) - clientX : 0;
    const pointerOffsetToCenterY = cardRect ? (cardRect.top + (cardRect.height / 2)) - clientY : 0;
    setDraggingCard({
      card,
      currentClientX: clientX,
      currentClientY: clientY,
      pointerOffsetToCenterX,
      pointerOffsetToCenterY,
      battlefieldRect: rect,
      nx: normalized.nx,
      ny: normalized.ny
    });
  };

  const handleDragMove = (e) => {
    if (!draggingCard) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    setDraggingCard(prev => ({ ...prev, currentClientX: clientX, currentClientY: clientY }));
  };

  const handleDragEnd = async () => {
    if (!draggingCard) return;
    const { card, battlefieldRect, currentClientX, currentClientY, pointerOffsetToCenterX = 0, pointerOffsetToCenterY = 0 } = draggingCard;
    const currentBattlefieldRect = myBattlefieldRef.current?.getBoundingClientRect?.() || battlefieldRect;
    if (currentBattlefieldRect && Number.isFinite(currentClientX) && Number.isFinite(currentClientY)) {
      const cardCenterX = currentClientX + pointerOffsetToCenterX;
      const cardCenterY = currentClientY + pointerOffsetToCenterY;
      const nx = clampBattlefieldCenterNormalized((cardCenterX - currentBattlefieldRect.left) / currentBattlefieldRect.width, currentBattlefieldRect.width, BATTLEFIELD_CARD_WIDTH_PX, BATTLEFIELD_SIDE_PADDING_PX);
      const ny = clampBattlefieldCenterNormalized((cardCenterY - currentBattlefieldRect.top) / currentBattlefieldRect.height, currentBattlefieldRect.height, BATTLEFIELD_CARD_HEIGHT_PX);
      await handleAction('MOVE_CARD_XY', {
        cardId: card.instanceId,
        x: Number((nx * 100).toFixed(1)),
        y: Number((ny * 100).toFixed(1)),
        nx: Number(nx.toFixed(4)),
        ny: Number(ny.toFixed(4)),
        positionBasisWidthPx: currentBattlefieldRect.width,
        positionBasisHeightPx: currentBattlefieldRect.height,
        positionMode: BATTLEFIELD_POSITION_MODE_MANUAL
      });
    }
    setDraggingCard(null);
  };

  const isMyTurn = game?.turnPlayerId === viewAsPlayerId;
  const hasPriority = game?.priorityPlayerId === viewAsPlayerId;

  const privateHandPeekPlayer = privateHandPeek?.playerId ? players.find(p => p?.id === privateHandPeek.playerId) : null;
  const isOppTurn = !!opponent && game?.turnPlayerId === opponent.id;
  const closePrivateHandPeek = () => {
    setPrivatePeekInspectCard(null);
    setPrivateHandPeek(null);
  };

  const openPrivateHandPeek = (targetPlayerId = opponent?.id) => {
    if (!canAct || !targetPlayerId) return;
    setPrivatePeekInspectCard(null);
    setPrivateHandPeek({ playerId: targetPlayerId });
    handleAction('PRIVATE_PEEK_HAND', { targetPlayerId });
  };
  const handRevealed = myPlayer?.handRevealed || false;

  const isAttackersStep = game?.phase === 'combat_attackers';
  const isBlockersStep = game?.phase === 'combat_blockers';
  const opponentPlaneswalkers = (game?.cards || []).filter(c => c.controllerId !== viewAsPlayerId && getAttackableCardKind(c) === 'planeswalker');
  const battlefieldBattles = (game?.cards || []).filter(c => getAttackableCardKind(c) === 'battle');
  const attackTargetOptions = [
    opponent ? { type: 'player', id: opponent.id, targetId: opponent.id, label: `${opponent.name} (Player)`, kind: 'player' } : null,
    ...opponentPlaneswalkers.map(c => ({ type: 'card', id: c.instanceId, targetId: c.instanceId, label: getCardDisplayName(c, 'Planeswalker'), kind: 'planeswalker' })),
    ...battlefieldBattles.map(c => ({ type: 'card', id: c.instanceId, targetId: c.instanceId, label: getCardDisplayName(c, 'Battle'), kind: 'battle' }))
  ].filter(Boolean);

  const waitingForPlayers = players.length < 2;
  const isAutoPassEnabled = autoPassConfig.mode !== AUTO_PASS_MODE.OFF;
  const autoPassControlsDisabled = !isPlayer || !game;

  const disableAutoPass = async (showNote = false, note = 'AutoPass turned off.') => {
    const nextConfig = getDefaultAutoPassConfig();
    setAutoPassConfig(nextConfig);
    setAutoPassMenuOpen(false);
    if (gameId && userId && isPlayer) {
      await updateDoc(doc(db, 'games_v3', gameId), { [`autopass.${userId}`]: nextConfig });
    }
    if (showNote) {
      setNotification(note);
      setTimeout(() => setNotification(null), 2000);
    }
  };

  const enableAutoPass = async (mode, phaseId = null, stopOnOpponentAction = autoPassConfig.stopOnOpponentAction) => {
    const nextConfig = normalizeAutoPassConfig({
      mode,
      phaseId,
      stopOnOpponentAction,
      startTurnNumber: mode === AUTO_PASS_MODE.END_OF_TURN ? game?.turnNumber : null,
      startActivePlayerIndex: mode === AUTO_PASS_MODE.END_OF_TURN ? game?.activePlayerIndex : null
    });
    setAutoPassConfig(nextConfig);
    lastAutoPassSignatureRef.current = null;
    setAutoPassMenuOpen(false);
    if (gameId && userId && isPlayer) {
      await updateDoc(doc(db, 'games_v3', gameId), { [`autopass.${userId}`]: nextConfig });
    }
  };

  const setAutoPassStopOnOpponentAction = async (enabled) => {
    const nextConfig = normalizeAutoPassConfig({ ...autoPassConfig, stopOnOpponentAction: enabled });
    setAutoPassConfig(nextConfig);
    if (gameId && userId && isPlayer) {
      await updateDoc(doc(db, 'games_v3', gameId), { [`autopass.${userId}`]: nextConfig });
    }
  };

  const autoPassLabel = autoPassConfig.mode === AUTO_PASS_MODE.END_OF_TURN
    ? 'AUTO: until End of Turn'
    : autoPassConfig.mode === AUTO_PASS_MODE.PHASE
      ? `AUTO: until ${PHASES.find(p => p.id === autoPassConfig.phaseId)?.label || 'phase'}`
      : null;

  const updateAutoPassMenuPosition = useCallback(() => {
    const btn = autoPassBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const padding = 8;
    const maxLeft = Math.max(padding, window.innerWidth - AUTO_PASS_MENU_WIDTH - padding);
    const left = clamp(rect.right - AUTO_PASS_MENU_WIDTH, padding, maxLeft);
    setAutoPassMenuPosition({ top: rect.bottom + 8, left });
  }, []);

  useEffect(() => {
    if (!autoPassMenuOpen || autoPassControlsDisabled) {
      setAutoPassMenuPosition(null);
      return;
    }

    const handlePositionUpdate = () => updateAutoPassMenuPosition();
    handlePositionUpdate();

    window.addEventListener('resize', handlePositionUpdate);
    window.addEventListener('scroll', handlePositionUpdate, true);
    const topActionScrollEl = topActionScrollRef.current;
    topActionScrollEl?.addEventListener('scroll', handlePositionUpdate, { passive: true });

    return () => {
      window.removeEventListener('resize', handlePositionUpdate);
      window.removeEventListener('scroll', handlePositionUpdate, true);
      topActionScrollEl?.removeEventListener('scroll', handlePositionUpdate);
    };
  }, [autoPassMenuOpen, autoPassControlsDisabled, updateAutoPassMenuPosition]);

  useEffect(() => {
    if (!autoPassMenuOpen) return;

    const handleOutsideClick = (event) => {
      const target = event.target;
      if (autoPassBtnRef.current?.contains(target) || autoPassMenuRef.current?.contains(target)) return;
      setAutoPassMenuOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setAutoPassMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [autoPassMenuOpen]);

  const runCustomDieRoll = () => {
    const trimmedDieSize = customDieSize.trim();
    const dieSize = /^\d+$/.test(trimmedDieSize) ? Number.parseInt(trimmedDieSize, 10) : NaN;
    if (!Number.isInteger(dieSize) || dieSize < 2 || dieSize > 1000) {
      setNotification('Choose a die size from 2 to 1000.');
      setTimeout(() => setNotification(null), 2500);
      return;
    }

    handleAction('ROLL_DICE', { diceType: 'custom', dieSize });
    setDiceMenuOpen(false);
  };

  const getLatestUndoEntry = () => (game?.undoStack || [])[(game?.undoStack || []).length - 1] || null;
  const latestDisplayedUndoEntry = getLatestUndoEntry();
  const canOpenUndoModal = canAct && Boolean(latestDisplayedUndoEntry) && (!undoPendingSync || latestDisplayedUndoEntry.pendingSync);
  const canUndoLatestAction = canOpenUndoModal && !undoPendingSync;

  const closeTransientGameModals = () => {
    setSelectedCard(null);
    setZoomedCard(null);
    setScryCard(null);
    setPeekCard(null);
    setViewZone(null);
    setSearchLibraryOwner(null);
    setTargetingState(null);
    setAttachmentState(null);
    setAttachmentPlayerPickerCard(null);
    setAttackTargetPickerCard(null);
    setBlockPickerCard(null);
    setReorderModal(null);
    setLibraryReviewModal(null);
    setLibraryBatchOpen(false);
    setCustomCounterModal(null);
    setDamageModal(null);
    setTokenModal(null);
    setStackDetailOpen(false);
    setSelectedStackItemId(null);
    setTimeControlsOpen(false);
    setUndoConfirmOpen(false);
  };

  const handleUndoLatestAction = async () => {
    if (!game) return;
    const undoBaseGame = firestoreGame || game;
    if (isSpectator || !isPlayer) {
      setNotification("Spectators can't undo game actions.");
      setTimeout(() => setNotification(null), 2000);
      return;
    }

    if (undoPendingSync) {
      setNotification('Undo will be available after this action syncs.');
      setTimeout(() => setNotification(null), 2500);
      return;
    }

    const expectedUndoEntry = (undoBaseGame?.undoStack || [])[(undoBaseGame?.undoStack || []).length - 1] || null;
    if (!expectedUndoEntry) {
      setNotification('Nothing to undo.');
      setTimeout(() => setNotification(null), 2000);
      setUndoConfirmOpen(false);
      return;
    }

    if (expectedUndoEntry.pendingSync) {
      setNotification('Undo is available after this action syncs.');
      setTimeout(() => setNotification(null), 2500);
      return;
    }

    const restoredFields = getUndoRestoredFields(expectedUndoEntry.previousState || {});
    const undoCardId = expectedUndoEntry.cardId || null;
    const undoPayload = {
      undoEntryId: expectedUndoEntry.id,
      actionLabel: expectedUndoEntry.actionLabel || 'last action',
      restoredFields,
      cardId: undoCardId,
      restoredZone: getPerfCardZoneDetails(expectedUndoEntry.previousState?.cards || [], undoCardId).zone
    };
    const perfActionId = startPerfAction({ actionType: 'UNDO_LAST_ACTION', payload: undoPayload, currentGame: undoBaseGame });
    recordPerfCheckpoint('undo handler start', { undoEntryId: expectedUndoEntry.id }, perfActionId);
    recordPerfUndo({
      phase: 'executeUndo',
      source: undoSource,
      pendingSync: false,
      restoredFields,
      optimisticApplied: false,
      cardDebug: undoCardId ? {
        ...(buildPerfUndoCardDebug({
          cardId: undoCardId,
          currentGame: undoBaseGame,
          previousState: expectedUndoEntry.previousState || {},
          restoredCards: expectedUndoEntry.previousState?.cards
        }) || {}),
        zoneBeforeAction: expectedUndoEntry.cardZoneBefore || undefined,
        zoneAfterAction: expectedUndoEntry.cardZoneAfter || undefined
      } : null
    }, perfActionId);

    const optimisticUndoPatch = buildOptimisticUndoPatch(undoBaseGame, expectedUndoEntry);
    const optimisticUndoActionId = perfActionId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let appliedOptimisticUndo = false;

    if (optimisticUndoPatch) {
      const optimisticUndoGame = {
        ...undoBaseGame,
        ...optimisticUndoPatch,
        combat: optimisticUndoPatch.combat || undoBaseGame.combat || getEmptyCombatState(),
        __optimisticActionId: optimisticUndoActionId
      };
      const marker = getPerfActionMarker({ actionType: 'UNDO_LAST_ACTION', payload: undoPayload, currentGame: undoBaseGame });
      pendingOptimisticActionRef.current = {
        id: optimisticUndoActionId,
        actionType: 'UNDO_LAST_ACTION',
        payload: compactPerfPayload(undoPayload),
        cardId: undoCardId,
        marker,
        handlerStartWallNow: getActionPerfWallNow(),
        startedAt: getActionPerfNow()
      };
      setOptimisticGame(optimisticUndoGame);
      setPendingOptimisticActionId(optimisticUndoActionId);
      setPendingOptimisticStartedAt(pendingOptimisticActionRef.current.startedAt);
      appliedOptimisticUndo = true;
      maybeCompleteTutorialStep('undo_play_land');
      recordPerfOptimisticApplied({ actionType: 'UNDO_LAST_ACTION', restoredFields }, perfActionId || optimisticUndoActionId);
      recordPerfUndo({
        optimisticApplied: true,
        restoredFields,
        cardDebug: undoCardId ? {
          ...(buildPerfUndoCardDebug({
            cardId: undoCardId,
            currentGame: undoBaseGame,
            previousState: expectedUndoEntry.previousState || {},
            restoredCards: optimisticUndoPatch.cards || expectedUndoEntry.previousState?.cards
          }) || {}),
          zoneBeforeAction: expectedUndoEntry.cardZoneBefore || undefined,
          zoneAfterAction: expectedUndoEntry.cardZoneAfter || undefined
        } : null,
        clickToUndoVisibleMs: (() => {
          const action = (getPerfActionsState().actions || []).find((candidate) => candidate.id === perfActionId);
          return action?.clickPerfNow ? roundPerfMs(getActionPerfNow() - action.clickPerfNow) : null;
        })()
      }, perfActionId || optimisticUndoActionId);
    } else {
      recordPerfOptimisticSkipped('Undo entry has no restorable previous state.', perfActionId);
    }

    setUndoConfirmOpen(false);

    let undone = false;
    let stale = false;
    let transactionError = null;
    const gameRef = doc(db, 'games_v3', gameId);
    try {
      const transactionStartedAt = getActionPerfNow();
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(gameRef);
        if (!snap.exists()) return;
        const currentGame = snap.data();
        const currentPlayers = currentGame.players || [];
        const currentPlayer = currentPlayers.find((player) => player.id === userId);
        if (!currentPlayer) return;

        const currentUndoStack = currentGame.undoStack || [];
        const latestUndoEntry = currentUndoStack[currentUndoStack.length - 1];
        if (!latestUndoEntry || latestUndoEntry.id !== expectedUndoEntry.id || latestUndoEntry.pendingSync) {
          stale = true;
          return;
        }

        const actionLabel = latestUndoEntry.actionLabel || 'last action';
        const undoActorName = currentPlayer.name || myPlayer?.name || 'Unknown';
        const undoLogEntry = buildGameLogEntry({
          currentGame,
          playerId: userId,
          playerName: undoActorName,
          type: 'UNDO',
          category: 'undo',
          message: actionLabel && actionLabel !== 'last game action'
            ? `${undoActorName} undid: ${actionLabel}.`
            : `${undoActorName} undid the last action.`,
          undoneActionLabel: actionLabel,
          undoneActionId: latestUndoEntry.id
        });

        transaction.update(gameRef, normalizeGameUpdatesForFirestore({
          ...getUndoRestoreUpdates(latestUndoEntry.previousState || {}),
          undoStack: normalizeUndoStackForFirestore(currentUndoStack.slice(0, -1)),
          log: [...(currentGame.log || []), undoLogEntry],
          updatedAt: serverTimestamp()
        }, 'UNDO'));
        undone = true;
      });
      markPerfFirestoreDone(perfActionId, { type: 'transaction', totalMs: roundPerfMs(getActionPerfNow() - transactionStartedAt) });
    } catch (error) {
      transactionError = error;
      console.error('Undo failed', error);
      failPerfAction(perfActionId, error);
    }

    if (stale) {
      if (appliedOptimisticUndo) clearOptimisticGame('Undo target changed before transaction committed.', perfActionId || optimisticUndoActionId);
      setNotification('Could not undo because the game changed. Try again.');
      setTimeout(() => setNotification(null), 3000);
      finishPerfAction(perfActionId);
      return;
    }

    if (!undone) {
      if (appliedOptimisticUndo) clearOptimisticGame(transactionError ? 'Undo transaction failed.' : 'Undo transaction did not apply.', perfActionId || optimisticUndoActionId);
      setNotification(transactionError?.message ? `Could not undo: ${transactionError.message}` : 'Could not undo that action.');
      setTimeout(() => setNotification(null), 3000);
      finishPerfAction(perfActionId);
      return;
    }

    closeTransientGameModals();
    maybeCompleteTutorialStep('undo_play_land');
    finishPerfAction(perfActionId);
  };

  const handleAction = async (actionType, payload = {}) => {
    const perfActionId = startPerfAction({ actionType, payload, currentGame: game });
    const clientActionId = perfActionId || `ca-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    recordPerfCheckpoint('handleAction start', { actionType }, perfActionId);
    const debugActions = isDebugActionsEnabled();
    if (debugActions) {
      const payloadCardId = payload?.cardId || payload?.sourceId || payload?.targetId || null;
      const payloadCard = payloadCardId ? (game?.cards || []).find((card) => card.instanceId === payloadCardId) : null;
      const liveSelectedCard = selectedCard?.instanceId ? (game?.cards || []).find((card) => card.instanceId === selectedCard.instanceId) : null;
      console.groupCollapsed(`[Debug card actions] handleAction start: ${actionType}`);
      console.log('actionType', actionType);
      console.log('payload', payload);
      console.log('selectedCard', selectedCard || null);
      console.log('selectedCard stale check', {
        selectedCardId: selectedCard?.instanceId || null,
        liveCardFound: Boolean(liveSelectedCard),
        differsFromLiveCard: Boolean(selectedCard && liveSelectedCard && debugObjectsDiffer(selectedCard, liveSelectedCard)),
        liveSelectedCard: liveSelectedCard || null
      });
      console.log('game/player state', {
        gameId,
        currentPlayerId: userId,
        viewAsPlayerId,
        hasGame: Boolean(game),
        hasCards: Array.isArray(game?.cards),
        cardCount: game?.cards?.length || 0,
        hasPlayers: Array.isArray(game?.players),
        playerCount: game?.players?.length || 0,
        activePlayerId: game?.turnPlayerId || players?.[game?.activePlayerIndex]?.id || null,
        priorityPlayerId: game?.priorityPlayerId || null,
        payloadCard: payloadCard || null
      });
      console.groupEnd();
    }

    try {
    if (!game) return;
    if (isSpectator && actionType !== 'SEND_CHAT') {
      setNotification("Spectators can't take game actions.");
      setTimeout(() => setNotification(null), 2000);
      return;
    }
    maybeCompleteTutorialAction(actionType, payload);
    // UPDATED: Path
    const gameRef = doc(db, 'games_v3', gameId);
    const perfRunTransaction = async (label, callback) => {
      if (!isPerfActionsEnabled() || !perfActionId) return runTransaction(db, callback);
      const transactionStartedAt = getActionPerfNow();
      recordPerfCheckpoint('before runTransaction', { label }, perfActionId);
      try {
        const result = await runTransaction(db, async (transaction) => {
          recordPerfCheckpoint('inside transaction start', { label }, perfActionId);
          const perfTransaction = Object.create(transaction);
          perfTransaction.get = async (...args) => {
            const readStartedAt = getActionPerfNow();
            const snap = await transaction.get(...args);
            const readDurationMs = roundPerfMs(getActionPerfNow() - readStartedAt);
            recordPerfCheckpoint('after transaction.get', { label, readDurationMs }, perfActionId);
            recordPerfFirestore({ transactionReadMs: readDurationMs }, perfActionId);
            return snap;
          };
          perfTransaction.update = (...args) => {
            recordPerfCheckpoint('before transaction.update', { label }, perfActionId);
            return transaction.update(...args);
          };
          return callback(perfTransaction);
        });
        const totalMs = roundPerfMs(getActionPerfNow() - transactionStartedAt);
        recordPerfCheckpoint('after runTransaction resolves', { label, totalMs }, perfActionId);
        markPerfFirestoreDone(perfActionId, { type: 'transaction', label, totalMs });
        return result;
      } catch (error) {
        recordPerfFirestore({ type: 'transaction', label, error: error?.message || String(error) }, perfActionId);
        throw error;
      }
    };
    const perfUpdateDoc = async (ref, updatePayload, label = 'updateDoc') => {
      if (!isPerfActionsEnabled() || !perfActionId) return updateDoc(ref, updatePayload);
      const updateStartedAt = getActionPerfNow();
      recordPerfCheckpoint('before updateDoc', { label }, perfActionId);
      try {
        const result = await updateDoc(ref, updatePayload);
        const totalMs = roundPerfMs(getActionPerfNow() - updateStartedAt);
        recordPerfCheckpoint('after updateDoc resolves', { label, totalMs }, perfActionId);
        markPerfFirestoreDone(perfActionId, { type: 'updateDoc', label, updateDocMs: totalMs, totalMs });
        return result;
      } catch (error) {
        recordPerfFirestore({ type: 'updateDoc', label, error: error?.message || String(error) }, perfActionId);
        throw error;
      }
    };

    // FIX: Safety check for name
    const actorName = isSpectator ? (displayName || 'Viewer') : (myPlayer?.name || 'Unknown');
    const actionMessages = [];
    const makeActionLog = (type, message, extra = {}) => {
      actionMessages.push(message);
      return buildGameLogEntry({
      currentGame: game,
      playerId: userId,
      playerName: actorName,
      type,
      category: extra.category || type,
      message,
      clientActionId,
      ...extra
      });
    };
    const getActionTargetDisplayNames = (targetIds = [], targetPlayerIds = []) => [
      ...(targetIds || []).map((targetId) => getPublicTargetDisplayName(targetId, game, allBattlefieldDisplayNames, 'a target')),
      ...(targetPlayerIds || []).map((playerId) => getPlayerNameById(game, playerId, 'Player'))
    ].filter(Boolean);
    const formatActionTargetSuffix = (targetIds = [], targetPlayerIds = []) => {
      const names = getActionTargetDisplayNames(targetIds, targetPlayerIds);
      if (names.length === 0) return '';
      return ` targeting ${names.join(', ')}`;
    };
    const getAttachmentDisplayName = (card) => getSafeCardName(card, 'a card');
    const buildAttachmentCleanup = (cards, leavingCard) => {
      if (!leavingCard || leavingCard.zone !== ZONES.BATTLEFIELD) return { cards, messages: [] };
      const leavingId = leavingCard.instanceId;
      const leavingName = getAttachmentDisplayName(leavingCard);
      const messages = [];
      const nextCards = cards.map((card) => {
        if (card.instanceId === leavingId) {
          return normalizeAttachment(card) ? clearAttachmentFields(card) : card;
        }
        const attachment = normalizeAttachment(card);
        if (attachment?.type === 'card' && attachment.id === leavingId) {
          messages.push(`${getAttachmentDisplayName(card)} became unattached because ${leavingName} left the battlefield.`);
          return clearAttachmentFields(card);
        }
        return card;
      });
      return { cards: nextCards, messages };
    };
    const makeAttachmentLogs = (messages) => messages.map((message) => makeActionLog('ATTACHMENT_CLEANUP', message, { category: 'attachment' }));
    const logEntry = makeActionLog(actionType, payload.desc || actionType);
    actionMessages.length = 0;

    let updates = { log: arrayUnion(logEntry) };
    let optimisticPatch = null;
    const pendingRecapEvents = [];

    if (actionType === 'PASS' || actionType === 'PASS_PRIORITY') {
      const turnStartEvents = [];
      await perfRunTransaction('runTransaction', async (transaction) => {
        const snap = await transaction.get(gameRef);
        if (!snap.exists()) return;
        const currentGame = snap.data();

        const currentPlayers = currentGame.players || [];
        const isCurrentPlayer = currentPlayers.some(p => p.id === userId);
        if (!isCurrentPlayer) return;

        const actorName = currentPlayers.find(p => p.id === userId)?.name || myPlayer?.name || 'Unknown';
        const passLogEntry = buildGameLogEntry({
          currentGame,
          playerId: userId,
          playerName: actorName,
          type: 'PASS_PRIORITY',
          category: 'priority',
          message: `${actorName} passed priority.`
        });

        const layoutOptions = {
          getBattlefieldWidthForController: (controllerId) => controllerId === userId ? getCurrentBattlefieldWidthPx() : undefined
        };
        const passedGame = advancePassPriorityState(currentGame, passLogEntry, (event) => turnStartEvents.push(event), layoutOptions);
        const { game: proxyGame } = runProxyAutoPassAdvances(passedGame, userId, actorName, (event) => turnStartEvents.push(event));

        transaction.update(gameRef, normalizeGameUpdatesForFirestore({
          phase: proxyGame.phase,
          turnNumber: proxyGame.turnNumber,
          activePlayerIndex: proxyGame.activePlayerIndex,
          turnPlayerId: proxyGame.turnPlayerId,
          priorityIndex: proxyGame.priorityIndex,
          priorityPlayerId: proxyGame.priorityPlayerId,
          consecutivePasses: proxyGame.consecutivePasses,
          stack: proxyGame.stack,
          cards: proxyGame.cards,
          combat: proxyGame.combat || getEmptyCombatState(),
          log: proxyGame.log,
          autopass: proxyGame.autopass || {},
          undoStack: appendUndoEntry(currentGame, buildUndoEntry({
            currentGame,
            actorId: userId,
            actorName,
            actionLabel: normalizeUndoActionLabel(passLogEntry.message, actorName)
          })),
          updatedAt: serverTimestamp()
        }, 'PASS_PRIORITY'));
      });
      if (turnStartEvents.length > 0) {
        await Promise.all(turnStartEvents.map((event) => appendEvent(gameId, event)));
      }
      return;
    }

    if (actionType === 'SET_COMBAT_DAMAGE_STEP') {
      const nextDamageStep = normalizeCombatDamageStep(payload.combatDamageStep);
      const currentDamageStep = getCombatDamageStep(game.combat);
      const nextCombatState = withCombatDamageStep(game.combat || getEmptyCombatState(), nextDamageStep);

      if (nextDamageStep !== currentDamageStep) {
        const optimisticMessage = nextDamageStep
          ? `${actorName} set combat damage step to ${nextDamageStep === COMBAT_DAMAGE_STEPS.FIRST_STRIKE ? 'first strike' : 'regular damage'}.`
          : `${actorName} cleared the combat damage step.`;
        const optimisticUndoEntry = {
          ...buildUndoEntry({
            currentGame: game,
            actorId: userId,
            actorName,
            actionLabel: normalizeUndoActionLabel(optimisticMessage, actorName),
            fields: COMBAT_ONLY_UNDO_STATE_FIELDS,
            actionType,
            clientActionId
          }),
          pendingSync: true
        };
        applyOptimisticGamePatch({
          actionType,
          payload: { ...payload, clientActionId },
          perfActionId,
          patch: { combat: nextCombatState, undoStack: appendOptimisticUndoEntry(game, optimisticUndoEntry) }
        });
      }

      await perfRunTransaction('runTransaction', async (transaction) => {
        const snap = await transaction.get(gameRef);
        if (!snap.exists()) return;
        const currentGame = snap.data();
        const currentPlayers = currentGame.players || [];
        const currentPlayer = currentPlayers.find(p => p.id === userId);
        if (!currentPlayer) return;

        const transactionDamageStep = normalizeCombatDamageStep(payload.combatDamageStep);
        if (transactionDamageStep === getCombatDamageStep(currentGame.combat)) return;
        const transactionActorName = currentPlayer.name || actorName;
        const message = transactionDamageStep
          ? `${transactionActorName} set combat damage step to ${transactionDamageStep === COMBAT_DAMAGE_STEPS.FIRST_STRIKE ? 'first strike' : 'regular damage'}.`
          : `${transactionActorName} cleared the combat damage step.`;
        const transactionCombat = withCombatDamageStep(currentGame.combat || getEmptyCombatState(), transactionDamageStep);

        transaction.update(gameRef, normalizeGameUpdatesForFirestore({
          combat: transactionCombat,
          log: arrayUnion(buildGameLogEntry({
            currentGame,
            playerId: userId,
            playerName: transactionActorName,
            type: 'SET_COMBAT_DAMAGE_STEP',
            category: 'combat',
            message,
            combatDamageStep: transactionDamageStep,
            clientActionId
          })),
          undoStack: appendUndoEntry(currentGame, buildUndoEntry({
            currentGame,
            actorId: userId,
            actorName: transactionActorName,
            actionLabel: normalizeUndoActionLabel(message, transactionActorName),
            fields: COMBAT_ONLY_UNDO_STATE_FIELDS,
            actionType,
            clientActionId
          })),
          updatedAt: serverTimestamp()
        }, actionType));
      });
      return;
    }

    if (['MANUAL_SET_STEP', 'START_EXTRA_COMBAT', 'GO_EXTRA_MAIN', 'START_EXTRA_TURN', 'SET_ACTIVE_PLAYER'].includes(actionType)) {
      await perfRunTransaction('runTransaction', async (transaction) => {
        const snap = await transaction.get(gameRef);
        if (!snap.exists()) return;
        const currentGame = snap.data();
        const currentPlayers = currentGame.players || [];
        const currentPlayer = currentPlayers.find(p => p.id === userId);
        if (!currentPlayer) return;

        const currentActiveIndex = Number.isInteger(currentGame.activePlayerIndex) ? currentGame.activePlayerIndex : 0;
        const safeActiveIndex = currentPlayers[currentActiveIndex] ? currentActiveIndex : 0;
        const activePlayerId = currentGame.turnPlayerId || currentPlayers[safeActiveIndex]?.id || currentPlayers[0]?.id || null;
        const activePlayerIndex = currentPlayers.findIndex(p => p.id === activePlayerId);
        const resolvedActiveIndex = activePlayerIndex >= 0 ? activePlayerIndex : safeActiveIndex;
        const resolvedActivePlayerId = currentPlayers[resolvedActiveIndex]?.id || activePlayerId;
        const resetAutoPass = Object.fromEntries(currentPlayers.map((player) => [player.id, getDefaultAutoPassConfig()]));
        const buildManualLog = (type, message, extra = {}) => buildGameLogEntry({
          currentGame,
          playerId: userId,
          playerName: currentPlayer.name || actorName,
          type,
          category: 'phase',
          message,
          ...extra
        });
        const baseManualUpdates = {
          consecutivePasses: 0,
          priorityIndex: resolvedActiveIndex,
          priorityPlayerId: resolvedActivePlayerId || currentGame.priorityPlayerId || null,
          autopass: resetAutoPass
        };

        let manualUpdates = null;

        if (actionType === 'MANUAL_SET_STEP') {
          const targetPhase = PHASES.find((phase) => phase.id === payload.phaseId);
          if (!targetPhase) return;
          const nextCombatState = shouldClearCombatState(currentGame.phase, targetPhase.id)
            ? getEmptyCombatState()
            : (currentGame.combat || getEmptyCombatState());
          manualUpdates = {
            ...baseManualUpdates,
            phase: targetPhase.id,
            combat: nextCombatState,
            log: arrayUnion(buildManualLog('MANUAL_SET_STEP', `${currentPlayer.name || actorName} manually set the step to ${targetPhase.label}.`, { phase: targetPhase.id, phaseLabel: targetPhase.label }))
          };
        }

        if (actionType === 'START_EXTRA_COMBAT') {
          manualUpdates = {
            ...baseManualUpdates,
            phase: 'combat_begin',
            combat: getEmptyCombatState(),
            log: arrayUnion(buildManualLog('START_EXTRA_COMBAT', `${currentPlayer.name || actorName} started an extra combat phase.`, { phase: 'combat_begin', phaseLabel: getPhaseLabel('combat_begin') }))
          };
        }

        if (actionType === 'GO_EXTRA_MAIN') {
          manualUpdates = {
            ...baseManualUpdates,
            phase: 'main2',
            combat: getEmptyCombatState(),
            log: arrayUnion(buildManualLog('GO_EXTRA_MAIN', `${currentPlayer.name || actorName} moved to an extra main phase.`, { phase: 'main2', phaseLabel: getPhaseLabel('main2') }))
          };
        }

        if (actionType === 'START_EXTRA_TURN') {
          const targetPlayer = currentPlayers.find((player) => player.id === payload.playerId);
          if (!targetPlayer) return;
          const targetIndex = currentPlayers.findIndex((player) => player.id === targetPlayer.id);
          manualUpdates = {
            ...baseManualUpdates,
            activePlayerIndex: targetIndex,
            turnPlayerId: targetPlayer.id,
            priorityIndex: targetIndex,
            priorityPlayerId: targetPlayer.id,
            phase: 'untap',
            turnNumber: (Number.isFinite(currentGame.turnNumber) ? currentGame.turnNumber : 0) + 1,
            combat: getEmptyCombatState(),
            log: arrayUnion(buildManualLog('START_EXTRA_TURN', `${currentPlayer.name || actorName} started an extra turn for ${targetPlayer.name || 'Player'}.`, { phase: 'untap', phaseLabel: getPhaseLabel('untap'), turnNumber: (Number.isFinite(currentGame.turnNumber) ? currentGame.turnNumber : 0) + 1, turnPlayerId: targetPlayer.id, targetPlayerId: targetPlayer.id, targetPlayerName: targetPlayer.name || 'Player' }))
          };
        }

        if (actionType === 'SET_ACTIVE_PLAYER') {
          const targetPlayer = currentPlayers.find((player) => player.id === payload.playerId);
          if (!targetPlayer) return;
          const targetIndex = currentPlayers.findIndex((player) => player.id === targetPlayer.id);
          manualUpdates = {
            ...baseManualUpdates,
            activePlayerIndex: targetIndex,
            turnPlayerId: targetPlayer.id,
            priorityIndex: targetIndex,
            priorityPlayerId: targetPlayer.id,
            log: arrayUnion(buildManualLog('SET_ACTIVE_PLAYER', `${currentPlayer.name || actorName} set the active player to ${targetPlayer.name || 'Player'}.`, { turnPlayerId: targetPlayer.id, targetPlayerId: targetPlayer.id, targetPlayerName: targetPlayer.name || 'Player' }))
          };
        }

        if (manualUpdates) {
          const manualActionLabels = {
            MANUAL_SET_STEP: `changed phase to ${PHASES.find((phase) => phase.id === payload.phaseId)?.label || 'another step'}`,
            START_EXTRA_COMBAT: 'started an extra combat phase',
            GO_EXTRA_MAIN: 'moved to an extra main phase',
            START_EXTRA_TURN: 'started an extra turn',
            SET_ACTIVE_PLAYER: 'changed the active player'
          };
          transaction.update(gameRef, normalizeGameUpdatesForFirestore({
            ...manualUpdates,
            undoStack: appendUndoEntry(currentGame, buildUndoEntry({
              currentGame,
              actorId: userId,
              actorName: currentPlayer.name || actorName,
              actionLabel: manualActionLabels[actionType] || 'changed time controls'
            })),
            updatedAt: serverTimestamp()
          }, actionType));
        }
      });
      setAutoPassConfig(getDefaultAutoPassConfig());
      setTimeControlsOpen(false);
      await maybeCompleteTutorialAction(actionType, payload);
      return;
    }

    if (actionType === 'COPY_STACK_ITEM') {
      let copiedStackItemId = null;
      const optimisticSourceStackItem = (game.stack || []).find((item) => item?.id === payload.stackItemId || item?.sourceId === payload.stackItemId);
      if (optimisticSourceStackItem) {
        const optimisticCopiedStackItem = buildCopiedStackItem(optimisticSourceStackItem);
        copiedStackItemId = optimisticCopiedStackItem.id;
        applyOptimisticGamePatch({
          actionType,
          payload,
          perfActionId,
          patch: { stack: [...(game.stack || []), optimisticCopiedStackItem], consecutivePasses: 0 }
        });
        setSelectedStackItemId(optimisticCopiedStackItem.id);
        setStackDetailOpen(true);
      } else {
        recordPerfOptimisticSkipped('Stack item not found locally.', perfActionId);
      }
      const transactionStartedAt = getActionPerfNow();
      await perfRunTransaction('runTransaction', async (transaction) => {
        const snap = await transaction.get(gameRef);
        if (!snap.exists()) return;
        const currentGame = snap.data();
        const currentPlayers = currentGame.players || [];
        const currentPlayer = currentPlayers.find((player) => player.id === userId);
        if (!currentPlayer) return;

        const sourceStackItem = (currentGame.stack || []).find((item) => item?.id === payload.stackItemId || item?.sourceId === payload.stackItemId);
        if (!sourceStackItem) return;

        const copiedStackItem = buildCopiedStackItem(sourceStackItem);
        copiedStackItemId = copiedStackItem.id;
        const transactionActorName = currentPlayer.name || actorName;
        const sourceName = sourceStackItem.name || sourceStackItem.copiedFromName || 'Stack item';
        const stackLogEntry = buildGameLogEntry({
          currentGame,
          playerId: userId,
          playerName: transactionActorName,
          type: 'COPY_STACK_ITEM',
          category: 'stack',
          message: `${transactionActorName} copied ${sourceName} on the stack.`,
          cardId: sourceStackItem.sourceId || null,
          cardName: copiedStackItem.name,
          copiedFromStackItemId: sourceStackItem.id || sourceStackItem.sourceId || null,
          copiedFromName: sourceName,
          copiedStackItemId: copiedStackItem.id
        });

        transaction.update(gameRef, normalizeGameUpdatesForFirestore({
          stack: [...(currentGame.stack || []), copiedStackItem],
          consecutivePasses: 0,
          log: [...(currentGame.log || []), stackLogEntry],
          undoStack: appendUndoEntry(currentGame, buildUndoEntry({
            currentGame,
            actorId: userId,
            actorName: transactionActorName,
            actionLabel: normalizeUndoActionLabel(stackLogEntry.message, transactionActorName),
            fields: STACK_ONLY_UNDO_STATE_FIELDS,
            actionType
          })),
          updatedAt: serverTimestamp()
        }, actionType));
      });
      logActionPerf(actionType, {
        phase: 'firestoreTransaction',
        updatesIncludeCards: false,
        elapsedMs: Math.round((getActionPerfNow() - transactionStartedAt) * 10) / 10
      });
      if (copiedStackItemId) {
        setSelectedStackItemId(copiedStackItemId);
        setStackDetailOpen(true);
      }
      await maybeCompleteTutorialAction(actionType, payload);
      return;
    }

    if (actionType === 'RESOLVE_STACK_TOP' || actionType === 'COUNTER_STACK_TOP') {
      const optimisticStack = [...(game.stack || [])];
      const optimisticTopItem = optimisticStack[optimisticStack.length - 1];
      if (optimisticTopItem && (!payload.stackItemId || optimisticTopItem.id === payload.stackItemId)) {
        optimisticStack.pop();
        let optimisticCards = game.cards || [];
        if (!optimisticTopItem.isCopy) {
          const optimisticCardIndex = optimisticCards.findIndex((card) => card.instanceId === optimisticTopItem.sourceId);
          if (optimisticCardIndex >= 0) {
            optimisticCards = [...optimisticCards];
            const optimisticCard = { ...optimisticCards[optimisticCardIndex] };
            const optimisticIsStackSpell = optimisticCard.zone === 'stack_zone' || (optimisticTopItem.itemType || optimisticTopItem.type || '').toString().toUpperCase().includes('SPELL');
            if (actionType === 'RESOLVE_STACK_TOP' && optimisticIsStackSpell) {
              const optimisticTypeLine = getCardTypeLine(optimisticCard).toLowerCase();
              optimisticCard.zone = (!optimisticTypeLine.includes('instant') && !optimisticTypeLine.includes('sorcery')) ? ZONES.BATTLEFIELD : ZONES.GRAVEYARD;
              optimisticCard.tapped = false;
            } else if (actionType === 'COUNTER_STACK_TOP' && optimisticCard.zone === 'stack_zone') {
              optimisticCard.zone = ZONES.GRAVEYARD;
              optimisticCard.tapped = false;
            }
            optimisticCards[optimisticCardIndex] = optimisticCard;
          }
        }
        applyOptimisticGamePatch({ actionType, payload, perfActionId, patch: { stack: optimisticStack, cards: optimisticCards } });
      } else {
        recordPerfOptimisticSkipped('Top stack item did not match locally.', perfActionId);
      }
      const transactionStartedAt = getActionPerfNow();
      let transactionUpdatesIncludeCards = false;
      await perfRunTransaction('runTransaction', async (transaction) => {
        const snap = await transaction.get(gameRef);
        if (!snap.exists()) return;
        const currentGame = snap.data();
        const currentStack = [...(currentGame.stack || [])];
        if (currentStack.length === 0) return;

        const topItem = currentStack[currentStack.length - 1];
        if (payload.stackItemId && topItem.id !== payload.stackItemId) return;

        currentStack.pop();
        const updatedCards = [...(currentGame.cards || [])];
        const cardIndex = updatedCards.findIndex(c => c.instanceId === topItem.sourceId);
        const cardName = topItem.name || 'Stack item';
        const shouldMovePhysicalCard = !topItem.isCopy;
        let cardsChanged = false;

        if (shouldMovePhysicalCard && cardIndex >= 0) {
          const card = { ...updatedCards[cardIndex] };
          const isStackSpell = card.zone === 'stack_zone' || (topItem.itemType || topItem.type || '').toString().toUpperCase().includes('SPELL');
          if (actionType === 'RESOLVE_STACK_TOP' && isStackSpell) {
            const typeLine = getCardTypeLine(card).toLowerCase();
            const isPermanent = !typeLine.includes('instant') && !typeLine.includes('sorcery');
            card.zone = isPermanent ? ZONES.BATTLEFIELD : ZONES.GRAVEYARD;
            card.tapped = false;

            if (isPermanent) {
              const spawnPosition = getBattlefieldGridPosition({
                card,
                existingBattlefieldCards: currentGame.cards || [],
                controllerId: card.controllerId,
                containerWidth: card.controllerId === userId ? getCurrentBattlefieldWidthPx() : BATTLEFIELD_DEFAULT_WIDTH_PX,
                isMobile: battlefieldViewport.width <= 900
              });
              Object.assign(card, getBattlefieldPositionCoordinates(spawnPosition));
              logBattlefieldEntry(card, 'STACK_RESOLUTION', spawnPosition);
            }
          } else if (actionType === 'COUNTER_STACK_TOP' && card.zone === 'stack_zone') {
            card.zone = ZONES.GRAVEYARD;
            card.tapped = false;
          }
          updatedCards[cardIndex] = card;
          cardsChanged = true;
        }

        const currentPlayers = currentGame.players || [];
        const nextPriorityIndex = Number.isInteger(currentGame.activePlayerIndex) ? currentGame.activePlayerIndex : 0;
        const nextPriorityPlayerId = currentPlayers[nextPriorityIndex]?.id || currentGame.priorityPlayerId || null;
        const logActorName = currentPlayers.find(p => p.id === userId)?.name || actorName;
        const stackLogEntry = buildGameLogEntry({
          currentGame,
          playerId: userId,
          playerName: logActorName,
          type: actionType === 'RESOLVE_STACK_TOP' ? 'RESOLVE_SPELL' : 'COUNTER_STACK_ITEM',
          category: 'stack',
          message: actionType === 'RESOLVE_STACK_TOP' ? `${logActorName} resolved ${cardName}.` : `${logActorName} countered/fizzled ${cardName}.`,
          cardId: topItem.sourceId || null,
          cardName
        });

        const undoFields = cardsChanged ? UNDO_STATE_FIELDS : STACK_ONLY_UNDO_STATE_FIELDS;
        const stackUpdates = {
          stack: currentStack,
          consecutivePasses: 0,
          priorityIndex: nextPriorityIndex,
          priorityPlayerId: nextPriorityPlayerId,
          log: [...(currentGame.log || []), stackLogEntry],
          undoStack: appendUndoEntry(currentGame, buildUndoEntry({
            currentGame,
            actorId: userId,
            actorName: logActorName,
            actionLabel: normalizeUndoActionLabel(stackLogEntry.message, logActorName),
            fields: undoFields,
            actionType
          })),
          updatedAt: serverTimestamp()
        };
        if (cardsChanged) stackUpdates.cards = updatedCards;
        transactionUpdatesIncludeCards = cardsChanged;

        transaction.update(gameRef, normalizeGameUpdatesForFirestore(stackUpdates, actionType));
      });
      logActionPerf(actionType, {
        phase: 'firestoreTransaction',
        updatesIncludeCards: transactionUpdatesIncludeCards,
        elapsedMs: Math.round((getActionPerfNow() - transactionStartedAt) * 10) / 10
      });
      setSelectedStackItemId(null);
      setStackDetailOpen(false);
      await maybeCompleteTutorialAction(actionType, payload);
      return;
    }

    if (actionType === 'DISCARD_RANDOM') {
      let emptyHand = false;
      await perfRunTransaction('runTransaction', async (transaction) => {
        const snap = await transaction.get(gameRef);
        if (!snap.exists()) return;
        const currentGame = snap.data();
        const currentPlayers = currentGame.players || [];
        const transactionActorName = currentPlayers.find(p => p.id === userId)?.name || actorName;
        const handCards = (currentGame.cards || []).filter(c => c.controllerId === userId && c.zone === ZONES.HAND);

        if (handCards.length === 0) {
          emptyHand = true;
          return;
        }

        const randomCard = handCards[Math.floor(Math.random() * handCards.length)];
        const discardedName = getCardDisplayName(randomCard, 'a card');
        const nextCards = (currentGame.cards || []).map(c => (
          c.instanceId === randomCard.instanceId ? { ...c, zone: ZONES.GRAVEYARD, faceDown: false } : c
        ));
        const discardLogEntry = buildGameLogEntry({
          currentGame,
          playerId: userId,
          playerName: transactionActorName,
          type: 'DISCARD_RANDOM',
          category: 'random',
          message: `${transactionActorName} randomly discarded ${discardedName}.`,
          cardId: randomCard.instanceId,
          cardName: discardedName,
          resultLabel: `Random discard → ${discardedName}`
        });

        transaction.update(gameRef, normalizeGameUpdatesForFirestore({
          cards: nextCards,
          log: [...(currentGame.log || []), discardLogEntry],
          undoStack: appendUndoEntry(currentGame, buildUndoEntry({
            currentGame,
            actorId: userId,
            actorName: transactionActorName,
            actionLabel: normalizeUndoActionLabel(discardLogEntry.message, transactionActorName)
          })),
          updatedAt: serverTimestamp()
        }, 'DISCARD_RANDOM'));
      });

      if (emptyHand) {
        setNotification('Random discard → no cards in hand');
        setTimeout(() => setNotification(null), 2500);
      }
      return;
    }

    if (actionType === 'ROLL_DICE') {
      const { diceType } = payload;

      if (diceType === 'coin') {
        const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
        updates.log = arrayUnion(makeActionLog('FLIP_COIN', `${actorName} flipped a coin: ${result}.`, {
          category: 'random',
          resultLabel: `Coin → ${result}`
        }));
      } else {
        const dieSize = Number.isInteger(payload.dieSize) ? payload.dieSize : (diceType === 'd6' ? 6 : diceType === 'd20' ? 20 : null);
        if (!Number.isInteger(dieSize) || dieSize < 2 || dieSize > 1000) {
          setNotification('Choose a die size from 2 to 1000.');
          setTimeout(() => setNotification(null), 2500);
          return;
        }

        const result = Math.floor(Math.random() * dieSize) + 1;
        updates.log = arrayUnion(makeActionLog('ROLL_DICE', `${actorName} rolled a d${dieSize}: ${result}.`, {
          category: 'random',
          dieSize,
          result,
          resultLabel: `d${dieSize} → ${result}`
        }));
      }
    } else if (actionType === 'SEND_CHAT') {
      const chatEntry = {
        timestamp: Date.now(),
        playerId: userId,
        playerName: logEntry.playerName,
        type: 'CHAT',
        text: payload.text,
        desc: 'CHAT'
      };
      updates.log = arrayUnion(chatEntry);
    } else if (actionType === 'SET_CHAT_SEEN') {
      const pIndex = game.players.findIndex(p => p.id === userId);
      if (pIndex >= 0) {
        const newPlayers = [...game.players];
        newPlayers[pIndex] = { ...newPlayers[pIndex], lastSeenChatAt: payload.timestamp };
        updates.players = newPlayers;
        delete updates.log; // No log entry for this
      }
    } else if (actionType === 'MOVE_CARD_XY') {
      const payloadWidthPx = Number.isFinite(payload.positionBasisWidthPx) ? payload.positionBasisWidthPx : null;
      const payloadHeightPx = Number.isFinite(payload.positionBasisHeightPx) ? payload.positionBasisHeightPx : null;
      const rawPayloadNx = Number.isFinite(payload.nx)
        ? payload.nx
        : (Number.isFinite(payload.x) ? payload.x / 100 : null);
      const rawPayloadNy = Number.isFinite(payload.ny)
        ? payload.ny
        : (Number.isFinite(payload.y) ? payload.y / 100 : null);
      const payloadNx = Number.isFinite(rawPayloadNx)
        ? (payloadWidthPx
            ? clampBattlefieldCenterNormalized(rawPayloadNx, payloadWidthPx, BATTLEFIELD_CARD_WIDTH_PX, BATTLEFIELD_SIDE_PADDING_PX)
            : clampBattlefieldNormalized(rawPayloadNx))
        : null;
      const payloadNy = Number.isFinite(rawPayloadNy)
        ? (payloadHeightPx
            ? clampBattlefieldCenterNormalized(rawPayloadNy, payloadHeightPx, BATTLEFIELD_CARD_HEIGHT_PX)
            : clampBattlefieldNormalized(rawPayloadNy))
        : null;
      const newCards = game.cards.map(c => c.instanceId === payload.cardId
        ? {
            ...c,
            x: Number.isFinite(payloadNx) ? Number((payloadNx * 100).toFixed(1)) : payload.x,
            y: Number.isFinite(payloadNy) ? Number((payloadNy * 100).toFixed(1)) : payload.y,
            nx: Number.isFinite(payloadNx) ? Number(payloadNx.toFixed(4)) : c.nx,
            ny: Number.isFinite(payloadNy) ? Number(payloadNy.toFixed(4)) : c.ny,
            positionBasisWidthPx: Number.isFinite(payload.positionBasisWidthPx) ? Math.round(payload.positionBasisWidthPx) : c.positionBasisWidthPx,
            positionBasisHeightPx: Number.isFinite(payload.positionBasisHeightPx) ? Math.round(payload.positionBasisHeightPx) : c.positionBasisHeightPx,
            positionMode: payload.positionMode === BATTLEFIELD_POSITION_MODE_AUTO ? BATTLEFIELD_POSITION_MODE_AUTO : BATTLEFIELD_POSITION_MODE_MANUAL
          }
        : c);
      updates.cards = newCards;
      delete updates.log;
    } else if (actionType === 'TIDY_BOARD') {
      const myBattlefield = game.cards.filter(c => c.controllerId === userId && c.zone === ZONES.BATTLEFIELD);
      setOptimisticAutoBattlefieldIds(new Set(myBattlefield.map(c => c.instanceId)));
      const layout = computeAutoBattlefieldLayout({
        cards: myBattlefield.map(card => ({ ...card, positionMode: BATTLEFIELD_POSITION_MODE_AUTO })),
        controllerId: userId,
        containerWidth: getCurrentBattlefieldWidthPx(),
        isMobile: battlefieldViewport.width <= 900,
        debugLabel: 'TIDY_BOARD_AUTO_LAYOUT',
        battlefieldType: 'own-tidy',
        treatManualAsAuto: true
      });

      const updatesById = new Map();
      layout.tidyPositions.forEach((position, cardId) => {
        const card = myBattlefield.find(candidate => candidate.instanceId === cardId);
        if (!card) return;
        updatesById.set(cardId, {
          ...card,
          ...getBattlefieldPositionCoordinates(position)
        });
      });

      const newCards = game.cards.map(c => updatesById.get(c.instanceId) || c);

      const tidyPreview = myBattlefield.map((before) => {
        const after = updatesById.get(before.instanceId);
        const position = layout.tidyPositions.get(before.instanceId);
        return {
          name: before.name || 'Unknown card',
          cardId: before.instanceId,
          lane: position?.lane || (isLandCard(before) ? 'land' : 'nonland'),
          slotIndex: position?.slotIndex,
          row: position?.row,
          col: position?.col,
          pixelX: position?.pixelX,
          pixelY: position?.pixelY,
          battlefieldWidth: layout.battlefieldWidth,
          battlefieldHeightPx: layout.battlefieldHeightPx,
          before: { nx: before.nx, ny: before.ny },
          after: after ? { nx: after.nx, ny: after.ny } : null
        };
      });
      console.log('[TIDY_BOARD]', tidyPreview);

      updates.cards = newCards;
      delete updates.log;
    } else if (actionType === 'SHUFFLE_LIBRARY') {
      const ownerId = payload.targetOwnerId || userId;
      const libCards = game.cards.filter(c => c.ownerId === ownerId && c.zone === ZONES.LIBRARY);
      const otherCards = game.cards.filter(c => !(c.ownerId === ownerId && c.zone === ZONES.LIBRARY));
      updates.cards = [...otherCards, ...shuffleArray([...libCards])];
      updates.log = arrayUnion(makeActionLog('SHUFFLE_LIBRARY', `${actorName} shuffled ${ownerId === userId ? 'their' : "opponent's"} library.`, { category: 'library' }));
    } else if (actionType === 'MULLIGAN') {
      const handCards = game.cards.filter(c => c.controllerId === userId && c.zone === ZONES.HAND);
      const movedToLibrary = new Set(handCards.map(c => c.instanceId));

      const movedCards = game.cards.map(c => {
        if (movedToLibrary.has(c.instanceId)) {
          return { ...c, zone: ZONES.LIBRARY, tapped: false, faceDown: false };
        }
        return c;
      });

      const myLib = movedCards.filter(c => c.ownerId === userId && c.zone === ZONES.LIBRARY);
      const otherCards = movedCards.filter(c => !(c.ownerId === userId && c.zone === ZONES.LIBRARY));
      const shuffledLib = shuffleArray([...myLib]);

      const drawCount = Math.min(7, shuffledLib.length);
      const toHandIds = new Set(shuffledLib.slice(0, drawCount).map(c => c.instanceId));

      const finalLib = shuffledLib.map(c => toHandIds.has(c.instanceId) ? { ...c, zone: ZONES.HAND } : c );

      updates.cards = [...otherCards, ...finalLib];
      updates.log = arrayUnion(makeActionLog('MULLIGAN', `${actorName} took a mulligan and drew ${drawCount} cards.`, { category: 'library' }));

    } else if (actionType === 'PLAYER_COUNTER') {
      const pIndex = game.players.findIndex(p => p.id === userId);
      const player = game.players[pIndex];
      const currentVal = player.counters?.[payload.counterType] || 0;
      const newVal = Math.max(0, currentVal + payload.amount);
      const newPlayers = [...game.players];
      newPlayers[pIndex] = { ...player, counters: { ...player.counters, [payload.counterType]: newVal } };
      updates.players = newPlayers;
      const counterLabel = PLAYER_COUNTER_LABELS[payload.counterType] || payload.counterType;
      let counterMessage = `${actorName} ${payload.amount > 0 ? 'added' : 'removed'} a ${counterLabel} counter.`;
      if (payload.counterType === 'commanderTax') {
        counterMessage = `${actorName} set Commander Tax to ${newVal}.`;
      } else if (payload.counterType === 'commanderDamage') {
        const changeAmount = Math.abs(newVal - currentVal);
        counterMessage = `${actorName} ${payload.amount > 0 ? 'added' : 'removed'} ${changeAmount} Commander Damage.`;
      }
      updates.log = arrayUnion(makeActionLog('PLAYER_COUNTER', counterMessage, { category: 'counter' }));

    } else if (actionType === 'PLAYER_STATUS_TOGGLE') {
      const targetPlayerId = payload.targetPlayerId || userId;
      const statusType = payload.statusType;
      const targetPlayer = game.players.find(p => p.id === targetPlayerId);
      if (!targetPlayer || !['monarch', 'initiative', 'citysBlessing'].includes(statusType)) return;
      const targetStatuses = getPlayerStatuses(targetPlayer);
      const willEnable = !targetStatuses[statusType];
      const nextPlayers = game.players.map((player) => {
        const statuses = getPlayerStatuses(player);
        if ((statusType === 'monarch' || statusType === 'initiative') && player.id !== targetPlayerId) {
          return { ...player, statuses: { ...statuses, [statusType]: false } };
        }
        if (player.id === targetPlayerId) {
          return { ...player, statuses: { ...statuses, [statusType]: willEnable } };
        }
        return player;
      });
      updates.players = nextPlayers;
      optimisticPatch = { players: nextPlayers };
      const targetName = targetPlayer.name || 'Player';
      let message = `${targetName} ${willEnable ? 'gained' : 'lost'} ${PLAYER_STATUS_LABELS[statusType]}.`;
      if (statusType === 'monarch') message = willEnable ? `${targetName} became the monarch.` : `${targetName} stopped being the monarch.`;
      if (statusType === 'initiative') message = willEnable ? `${targetName} took the initiative.` : `${targetName} lost the initiative.`;
      updates.log = arrayUnion(makeActionLog('PLAYER_STATUS_TOGGLE', message, { category: 'status', targetPlayerId, targetPlayerName: targetName, statusType, enabled: willEnable }));

    } else if (actionType === 'RING_TEMPTATION') {
      const targetPlayerId = payload.targetPlayerId || userId;
      const targetPlayer = game.players.find(p => p.id === targetPlayerId);
      if (!targetPlayer) return;
      const statuses = getPlayerStatuses(targetPlayer);
      const nextLevel = clampRingTemptationLevel(payload.setLevel !== undefined ? payload.setLevel : statuses.ringBearerLevel + (payload.amount || 0));
      if (nextLevel === statuses.ringBearerLevel) return;
      const nextPlayers = game.players.map((player) => player.id === targetPlayerId ? { ...player, statuses: { ...getPlayerStatuses(player), ringBearerLevel: nextLevel } } : player);
      updates.players = nextPlayers;
      optimisticPatch = { players: nextPlayers };
      const targetName = targetPlayer.name || 'Player';
      const message = nextLevel > statuses.ringBearerLevel
        ? `${targetName} advanced Ring temptation to ${nextLevel}.`
        : `${targetName} reduced Ring temptation to ${nextLevel}.`;
      updates.log = arrayUnion(makeActionLog('RING_TEMPTATION', message, { category: 'status', targetPlayerId, targetPlayerName: targetName, ringBearerLevel: nextLevel }));

    } else if (actionType === 'PLAYER_STATUS_ADD_CUSTOM') {
      const targetPlayerId = payload.targetPlayerId || userId;
      const targetPlayer = game.players.find(p => p.id === targetPlayerId);
      const text = sanitizeCustomPlayerStatusText(payload.text);
      if (!targetPlayer || !text) return;
      const statuses = getPlayerStatuses(targetPlayer);
      if (statuses.custom.includes(text) || statuses.custom.length >= MAX_CUSTOM_PLAYER_STATUSES) return;
      const nextCustom = [...statuses.custom, text];
      const nextPlayers = game.players.map((player) => player.id === targetPlayerId ? { ...player, statuses: { ...getPlayerStatuses(player), custom: nextCustom } } : player);
      updates.players = nextPlayers;
      optimisticPatch = { players: nextPlayers };
      const targetName = targetPlayer.name || 'Player';
      updates.log = arrayUnion(makeActionLog('PLAYER_STATUS_ADD_CUSTOM', `${targetName} added status: ${text}.`, { category: 'status', targetPlayerId, targetPlayerName: targetName, statusText: text }));

    } else if (actionType === 'PLAYER_STATUS_REMOVE_CUSTOM') {
      const targetPlayerId = payload.targetPlayerId || userId;
      const targetPlayer = game.players.find(p => p.id === targetPlayerId);
      if (!targetPlayer) return;
      const statuses = getPlayerStatuses(targetPlayer);
      const removeIndex = Number.isInteger(payload.index) ? payload.index : statuses.custom.findIndex((text) => text === payload.text);
      const removedText = statuses.custom[removeIndex];
      if (!removedText) return;
      const nextCustom = statuses.custom.filter((_, index) => index !== removeIndex);
      const nextPlayers = game.players.map((player) => player.id === targetPlayerId ? { ...player, statuses: { ...getPlayerStatuses(player), custom: nextCustom } } : player);
      updates.players = nextPlayers;
      optimisticPatch = { players: nextPlayers };
      const targetName = targetPlayer.name || 'Player';
      updates.log = arrayUnion(makeActionLog('PLAYER_STATUS_REMOVE_CUSTOM', `${targetName} removed status: ${removedText}.`, { category: 'status', targetPlayerId, targetPlayerName: targetName, statusText: removedText }));

    } else if (actionType === 'ADD_PLAYER_EMBLEM') {
      const targetPlayerId = payload.targetPlayerId || userId;
      const targetPlayer = game.players.find(p => p.id === targetPlayerId);
      if (!targetPlayer) return;
      const emblem = buildPlayerEmblem({ name: payload.name, text: payload.text, sourceName: payload.sourceName, createdBy: userId });
      if (!emblem.name || !emblem.text) return;
      const emblems = getPlayerEmblems(targetPlayer);
      if (emblems.length >= MAX_PLAYER_EMBLEMS) return;
      const nextPlayers = game.players.map((player) => player.id === targetPlayerId ? { ...player, emblems: [...getPlayerEmblems(player), emblem] } : player);
      updates.players = nextPlayers;
      optimisticPatch = { players: nextPlayers };
      const targetName = targetPlayer.name || 'Player';
      updates.log = arrayUnion(makeActionLog('ADD_PLAYER_EMBLEM', `${actorName} created an emblem: ${emblem.name}.`, { category: 'emblem', targetPlayerId, targetPlayerName: targetName, emblemId: emblem.id, emblemName: emblem.name }));

    } else if (actionType === 'REMOVE_PLAYER_EMBLEM') {
      const targetPlayerId = payload.targetPlayerId || userId;
      const targetPlayer = game.players.find(p => p.id === targetPlayerId);
      if (!targetPlayer) return;
      const emblems = getPlayerEmblems(targetPlayer);
      const removedEmblem = emblems.find((emblem) => emblem.id === payload.emblemId);
      if (!removedEmblem) return;
      const nextPlayers = game.players.map((player) => player.id === targetPlayerId ? { ...player, emblems: getPlayerEmblems(player).filter((emblem) => emblem.id !== payload.emblemId) } : player);
      updates.players = nextPlayers;
      optimisticPatch = { players: nextPlayers };
      const targetName = targetPlayer.name || 'Player';
      updates.log = arrayUnion(makeActionLog('REMOVE_PLAYER_EMBLEM', `${actorName} removed an emblem: ${removedEmblem.name}.`, { category: 'emblem', targetPlayerId, targetPlayerName: targetName, emblemId: removedEmblem.id, emblemName: removedEmblem.name }));

    } else if (actionType === 'MANA_POOL_ADJUST') {
      const color = MANA_COLORS.includes(payload.color) ? payload.color : null;
      const amount = Number.parseInt(payload.amount, 10) || 0;
      if (!color || amount === 0) return;
      const targetPlayerId = userId;
      const targetPlayer = game.players.find(p => p.id === targetPlayerId);
      if (!targetPlayer) return;
      const currentPool = getPlayerManaPool(targetPlayer);
      const nextAmount = Math.max(0, currentPool[color] + amount);
      if (nextAmount === currentPool[color]) return;
      const nextPool = { ...currentPool, [color]: nextAmount };
      const nextPlayers = game.players.map((player) => player.id === targetPlayerId ? { ...player, manaPool: nextPool } : player);
      updates.players = nextPlayers;
      optimisticPatch = { players: nextPlayers };
      const verb = amount > 0 ? 'added' : 'removed';
      updates.log = arrayUnion(makeActionLog('MANA_POOL_ADJUST', `${actorName} ${verb} {${color}}.`, { category: 'mana', color, amount: amount > 0 ? 1 : -1, targetPlayerId }));

    } else if (actionType === 'MANA_POOL_CLEAR') {
      const targetPlayerId = userId;
      const targetPlayer = game.players.find(p => p.id === targetPlayerId);
      if (!targetPlayer) return;
      const currentPool = getPlayerManaPool(targetPlayer);
      if (!Object.values(currentPool).some((amount) => amount > 0)) return;
      const nextPlayers = game.players.map((player) => player.id === targetPlayerId ? { ...player, manaPool: clearManaPool() } : player);
      updates.players = nextPlayers;
      optimisticPatch = { players: nextPlayers };
      updates.log = arrayUnion(makeActionLog('MANA_POOL_CLEAR', `${actorName} cleared their mana pool.`, { category: 'mana', targetPlayerId }));

    } else if (actionType === 'SET_DAY_NIGHT') {
      const nextDayNight = payload.value === 'day' || payload.value === 'night' ? payload.value : null;
      const currentDayNight = getDayNightValue(game);
      if (nextDayNight === currentDayNight) return;
      updates.dayNight = nextDayNight;
      optimisticPatch = { dayNight: nextDayNight };
      const message = nextDayNight ? `The game became ${DAY_NIGHT_LABELS[nextDayNight]}.` : 'Day/Night was unset.';
      updates.log = arrayUnion(makeActionLog('SET_DAY_NIGHT', message, { category: 'status', dayNight: nextDayNight }));

    } else if (actionType === 'ADD_CARD_REMINDER') {
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      const reminder = buildReminder({ text: payload.text, expires: payload.expires, createdBy: userId });
      if (!card || !reminder.text) return;
      updates.cards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, reminders: [...getEntityReminders(c), reminder] } : c);
      optimisticPatch = { cards: updates.cards };
      updates.log = arrayUnion(makeActionLog('ADD_CARD_REMINDER', `${actorName} added reminder to ${getSafeCardName(card)}: ${reminder.text}.`, { category: 'reminder', cardId: card.instanceId, cardName: getSafeCardName(card), reminderId: reminder.id, reminderText: reminder.text, expires: reminder.expires }));

    } else if (actionType === 'REMOVE_CARD_REMINDER') {
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      const reminder = getEntityReminders(card).find(item => item.id === payload.reminderId);
      if (!card || !reminder) return;
      updates.cards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, reminders: getEntityReminders(c).filter(item => item.id !== payload.reminderId) } : c);
      optimisticPatch = { cards: updates.cards };
      updates.log = arrayUnion(makeActionLog('REMOVE_CARD_REMINDER', `${actorName} removed reminder from ${getSafeCardName(card)}: ${reminder.text}.`, { category: 'reminder', cardId: card.instanceId, cardName: getSafeCardName(card), reminderId: reminder.id, reminderText: reminder.text }));

    } else if (actionType === 'ADD_PLAYER_REMINDER') {
      const targetPlayerId = payload.targetPlayerId || userId;
      const targetPlayer = game.players.find(p => p.id === targetPlayerId);
      const reminder = buildReminder({ text: payload.text, expires: payload.expires, createdBy: userId });
      if (!targetPlayer || !reminder.text) return;
      updates.players = game.players.map(p => p.id === targetPlayerId ? { ...p, reminders: [...getEntityReminders(p), reminder] } : p);
      updates.log = arrayUnion(makeActionLog('ADD_PLAYER_REMINDER', `${actorName} added reminder to ${targetPlayer.name || 'Player'}: ${reminder.text}.`, { category: 'reminder', targetPlayerId, targetPlayerName: targetPlayer.name || 'Player', reminderId: reminder.id, reminderText: reminder.text, expires: reminder.expires }));

    } else if (actionType === 'REMOVE_PLAYER_REMINDER') {
      const targetPlayerId = payload.targetPlayerId || userId;
      const targetPlayer = game.players.find(p => p.id === targetPlayerId);
      const reminder = getEntityReminders(targetPlayer).find(item => item.id === payload.reminderId);
      if (!targetPlayer || !reminder) return;
      updates.players = game.players.map(p => p.id === targetPlayerId ? { ...p, reminders: getEntityReminders(p).filter(item => item.id !== payload.reminderId) } : p);
      updates.log = arrayUnion(makeActionLog('REMOVE_PLAYER_REMINDER', `${actorName} removed reminder from ${targetPlayer.name || 'Player'}: ${reminder.text}.`, { category: 'reminder', targetPlayerId, targetPlayerName: targetPlayer.name || 'Player', reminderId: reminder.id, reminderText: reminder.text }));

    } else if (actionType === 'CLEAR_CLEANUP_REMINDERS') {
      const nextCards = (game.cards || []).map(c => ({ ...c, reminders: getEntityReminders(c).filter(reminder => reminder.expires !== REMINDER_EXPIRATION.CLEANUP) }));
      const nextPlayers = (game.players || []).map(p => ({ ...p, reminders: getEntityReminders(p).filter(reminder => reminder.expires !== REMINDER_EXPIRATION.CLEANUP) }));
      const removedCount = (game.cards || []).reduce((count, c) => count + getEntityReminders(c).filter(reminder => reminder.expires === REMINDER_EXPIRATION.CLEANUP).length, 0)
        + (game.players || []).reduce((count, p) => count + getEntityReminders(p).filter(reminder => reminder.expires === REMINDER_EXPIRATION.CLEANUP).length, 0);
      if (removedCount === 0) {
        setNotification('No cleanup reminders to clear.');
        setTimeout(() => setNotification(null), 2200);
        return;
      }
      updates.cards = nextCards;
      updates.players = nextPlayers;
      updates.log = arrayUnion(makeActionLog('CLEAR_CLEANUP_REMINDERS', `${actorName} cleared cleanup reminders.`, { category: 'reminder', removedCount }));

    } else if (actionType === 'SET_COMMANDER') {
      if (!isCommanderGame(game)) return;
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      if (!card || card.isToken) return;
      updates.cards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, isCommander: true, commanderTax: Math.max(0, c.commanderTax || 0), commanderDamage: c.commanderDamage || {} } : c);
      updates.log = arrayUnion(makeActionLog('SET_COMMANDER', `${actorName} set ${getSafeCardName(card)} as their commander.`, { category: 'commander', cardId: card.instanceId, cardName: getSafeCardName(card) }));

    } else if (actionType === 'UNSET_COMMANDER') {
      if (!isCommanderGame(game)) return;
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      if (!card) return;
      updates.cards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, isCommander: false } : c);
      updates.log = arrayUnion(makeActionLog('UNSET_COMMANDER', `${actorName} unset ${getSafeCardName(card)} as commander.`, { category: 'commander', cardId: card.instanceId, cardName: getSafeCardName(card) }));

    } else if (actionType === 'COMMANDER_TAX') {
      if (!isCommanderGame(game)) return;
      const card = game.cards.find(c => c.instanceId === payload.cardId && c.isCommander);
      if (!card) return;
      const currentTax = Math.max(0, card.commanderTax || 0);
      const nextTax = payload.reset ? 0 : Math.max(0, currentTax + (payload.amount || 0));
      updates.cards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, commanderTax: nextTax } : c);
      updates.log = arrayUnion(makeActionLog('COMMANDER_TAX', payload.reset ? `${actorName} reset ${getSafeCardName(card)} commander tax.` : `${actorName} ${payload.amount > 0 ? 'increased' : 'decreased'} ${getSafeCardName(card)} commander tax to +${nextTax}.`, { category: 'commander', cardId: card.instanceId, cardName: getSafeCardName(card), commanderTax: nextTax }));

    } else if (actionType === 'COMMANDER_DAMAGE') {
      if (!isCommanderGame(game)) return;
      const card = game.cards.find(c => c.instanceId === payload.cardId && c.isCommander);
      const targetPlayer = game.players.find(p => p.id === payload.targetPlayerId);
      if (!card || !targetPlayer) return;
      const damageMap = { ...(card.commanderDamage || {}) };
      const currentDamage = Math.max(0, damageMap[payload.targetPlayerId] || 0);
      const nextDamage = payload.clear ? 0 : Math.max(0, currentDamage + (payload.amount || 0));
      damageMap[payload.targetPlayerId] = nextDamage;
      updates.cards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, commanderDamage: damageMap } : c);
      updates.log = arrayUnion(makeActionLog('COMMANDER_DAMAGE', payload.clear ? `${actorName} cleared commander damage from ${getSafeCardName(card)} to ${targetPlayer.name || 'Player'}.` : `${actorName} marked ${payload.amount || 0} commander damage from ${getSafeCardName(card)} to ${targetPlayer.name || 'Player'}.`, { category: 'commander', cardId: card.instanceId, cardName: getSafeCardName(card), targetPlayerId: targetPlayer.id, damage: nextDamage }));

    } else if (actionType === 'CREATE_TOKEN') {
      const quantity = clamp(Number.parseInt(payload.quantity, 10) || 1, 1, 99);
      const name = String(payload.name || 'Token').trim() || 'Token';
      const typeLine = String(payload.typeLine || payload.type_line || (payload.power || payload.toughness ? 'Token Creature' : 'Token')).trim() || 'Token';
      const isCreatureToken = isCreatureTypeLine(typeLine);
      const colorIdentity = normalizeTokenColorIdentity(payload.colorIdentity, payload.color);
      const color = getTokenColorLabel(colorIdentity, payload.color);
      const createdTokens = [];
      let existingCardsForLayout = [...game.cards];

      for (let i = 0; i < quantity; i += 1) {
        const tokenBase = {
          instanceId: generateCardId(),
          name,
          power: isCreatureToken ? String(payload.power ?? '1') : '',
          toughness: isCreatureToken ? String(payload.toughness ?? '1') : '',
          type_line: typeLine,
          color,
          colorIdentity,
          rulesText: payload.rulesText || '',
          ...(payload.imageUrl || payload.image_uri ? { image_uri: String(payload.imageUrl || payload.image_uri).slice(0, 300) } : {}),
          ownerId: userId,
          controllerId: userId,
          zone: ZONES.BATTLEFIELD,
          tapped: Boolean(payload.tapped),
          counters: {},
          tempDamage: 0,
          isToken: true
        };
        const spawnPosition = getBattlefieldGridPosition({
          card: tokenBase,
          existingBattlefieldCards: existingCardsForLayout,
          controllerId: userId,
          containerWidth: getCurrentBattlefieldWidthPx(),
          isMobile: battlefieldViewport.width <= 900
        });
        const newToken = {
          ...tokenBase,
          ...getBattlefieldPositionCoordinates(spawnPosition)
        };
        logBattlefieldEntry(newToken, 'CREATE_TOKEN', spawnPosition);
        createdTokens.push(newToken);
        existingCardsForLayout = [...existingCardsForLayout, newToken];
      }

      const firstToken = createdTokens[0];
      const singlePrefix = isCreatureToken && firstToken?.power && firstToken?.toughness ? `${firstToken.power}/${firstToken.toughness} ` : '';
      const tokenLabel = quantity === 1 ? `${singlePrefix}${name} token` : `${name} tokens`;
      updates.cards = [...game.cards, ...createdTokens];
      updates.log = arrayUnion(makeActionLog('CREATE_TOKEN', `${actorName} created ${quantity === 1 ? 'a' : quantity} ${tokenLabel}.`, { category: 'token', cardId: firstToken?.instanceId, cardName: name, quantity }));

    } else if (actionType === 'CLONE_CARD') {
      const original = game.cards.find(c => c.instanceId === payload.cardId);
      if (original) {
        const cloneBase = { ...clearAttachmentFields(original), instanceId: generateCardId(), zone: ZONES.BATTLEFIELD };
        const spawnPosition = getBattlefieldGridPosition({
          card: cloneBase,
          existingBattlefieldCards: game.cards,
          controllerId: cloneBase.controllerId,
          containerWidth: cloneBase.controllerId === userId ? getCurrentBattlefieldWidthPx() : BATTLEFIELD_DEFAULT_WIDTH_PX,
          isMobile: battlefieldViewport.width <= 900
        });
        const clone = {
          ...cloneBase,
          // Keep owner/controller, copy other fields by spread
          ...getBattlefieldPositionCoordinates(spawnPosition)
        };
        logBattlefieldEntry(clone, 'CLONE_CARD', spawnPosition);
        updates.cards = [...game.cards, clone];
        updates.log = arrayUnion(makeActionLog('CLONE_CARD', `${actorName} cloned ${getSafeCardName(original)}.`, { category: 'card', cardId: original.instanceId, cardName: getSafeCardName(original) }));
      }
    } else if (actionType === 'SCRY_TOP') {
      const targetId = payload.targetOwnerId || userId;
      const lib = game.cards.filter(c => c.ownerId === targetId && c.zone === ZONES.LIBRARY);
      if (lib.length > 0) {
        setScryCard({ ...lib[0], ownerId: targetId });
        if (targetId !== userId) {
          updates.log = arrayUnion(makeActionLog('SCRY_TOP', `${actorName} looked at the top card of opponent's library.`, { category: 'library' }));
        } else {
          return;
        }
      } else {
        return;
      }
    } else if (actionType === 'SCRY_BOTTOM') {
      const cardToMove = game.cards.find(c => c.instanceId === payload.cardId);
      const otherCards = game.cards.filter(c => c.instanceId !== payload.cardId);
      updates.cards = [...otherCards, cardToMove];
      delete updates.log;
      setScryCard(null);

    } else if (actionType === 'SCRY_KEEP_TOP') {
      delete updates.log;
      setScryCard(null);

    } else if (actionType === 'MOD_COUNTER') {
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      const currentCounters = card.counters || {};
      const label = payload.label || 'default';
      const newVal = Math.max(0, (currentCounters[label] || 0) + payload.amount);
      const newCounters = { ...currentCounters, [label]: newVal };
      if (newVal === 0) delete newCounters[label];
      const newCards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, counters: newCounters } : c);
      updates.cards = newCards;
      updates.log = arrayUnion(makeActionLog('MOD_COUNTER', `${actorName} ${payload.amount > 0 ? 'added' : 'removed'} ${Math.abs(payload.amount || 1)} ${label} counter${Math.abs(payload.amount || 1) === 1 ? '' : 's'} ${payload.amount > 0 ? 'to' : 'from'} ${getSafeCardName(card)}.`, { category: 'counter', cardId: card?.instanceId, cardName: getSafeCardName(card), counter: label, counterValue: newVal }));

    } else if (actionType === 'TOGGLE_FACE') {
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      const nextFaceDown = !card?.faceDown;
      const newCards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, faceDown: nextFaceDown } : c);
      updates.cards = newCards;
      updates.log = arrayUnion(makeActionLog('TOGGLE_FACE', nextFaceDown ? `${actorName} turned ${getSafeCardName(card)} face down.` : `${actorName} turned ${getSafeCardName(card, 'a face-down card')} face up${card?.name ? ` as ${card.name}` : ''}.`, { category: 'visibility', cardId: card?.instanceId, cardName: nextFaceDown ? null : card?.name || null }));

    } else if (actionType === 'SWITCH_CARD_FACE') {
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      const faces = getUsableCardFaces(card);
      if (!card || faces.length < 2) return;
      const fromIndex = getActiveFaceIndex(card);
      const toIndex = Number.isInteger(payload.faceIndex) ? Math.min(Math.max(payload.faceIndex, 0), faces.length - 1) : ((fromIndex + 1) % faces.length);
      if (toIndex === fromIndex) return;
      const fromName = faces[fromIndex]?.name || card.name || 'one face';
      const toName = faces[toIndex]?.name || card.name || 'another face';
      updates.cards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, activeFaceIndex: toIndex } : c);
      optimisticPatch = { cards: updates.cards };
      updates.log = arrayUnion(makeActionLog('SWITCH_CARD_FACE', `${actorName} transformed ${fromName} into ${toName}.`, { category: 'card', cardId: card.instanceId, cardName: toName, fromFaceIndex: fromIndex, toFaceIndex: toIndex, fromFaceName: fromName, toFaceName: toName }));

    } else if (actionType === 'CHANGE_CONTROL') {
      const changedCard = game.cards.find(c => c.instanceId === payload.cardId);
      const nextControllerId = changedCard?.controllerId === userId ? (opponent?.id || userId) : userId;
      const spawnPosition = getBattlefieldGridPosition({
        card: { ...changedCard, controllerId: nextControllerId, zone: ZONES.BATTLEFIELD },
        existingBattlefieldCards: game.cards,
        controllerId: nextControllerId,
        containerWidth: nextControllerId === userId ? getCurrentBattlefieldWidthPx() : BATTLEFIELD_DEFAULT_WIDTH_PX,
        isMobile: battlefieldViewport.width <= 900
      });
      const newCards = game.cards.map(c =>
        c.instanceId === payload.cardId
          ? {
              ...c,
              controllerId: nextControllerId,
              zone: ZONES.BATTLEFIELD,
              ...getBattlefieldPositionCoordinates(spawnPosition)
            }
          : c
      );
      logBattlefieldEntry(changedCard, 'CHANGE_CONTROL', spawnPosition);
      updates.cards = newCards;
      updates.combat = clearCombatAssignmentsForCard(game.combat || getEmptyCombatState(), payload.cardId);
      updates.log = arrayUnion(makeActionLog('CHANGE_CONTROL', `${actorName} gave control of ${getSafeCardName(changedCard, payload.cardName || 'a card')} to ${getPlayerNameById(game, nextControllerId, 'another player')}.`, { category: 'control', cardId: payload.cardId, cardName: getSafeCardName(changedCard, payload.cardName || 'a card') }));

    } else if (actionType === 'SET_ATTACK_TARGET') {
      if (game.phase !== 'combat_attackers') return;
      const attackingCard = game.cards.find(c => c.instanceId === payload.cardId);
      const attackTarget = normalizeAttackTarget(payload.attackTarget || { type: 'player', id: opponent?.id || null, targetId: opponent?.id || null }, game, attackingCard);
      if (!attackTarget) return;
      const nextAttackers = { ...(game.combat?.attackers || {}) };
      nextAttackers[payload.cardId] = attackTarget;
      updates.combat = {
        ...normalizeCombatState(game.combat || getEmptyCombatState()),
        attackers: nextAttackers,
        blockers: game.combat?.blockers || {}
      };
      updates.log = arrayUnion(makeActionLog('SET_ATTACK_TARGET', `${actorName} attacks ${getCombatAttackTargetName(attackTarget, game, null, attackingCard) || 'a target'} with ${getSafeCardName(attackingCard, payload.cardName || 'a creature')}.`, { category: 'combat', cardId: payload.cardId, targetId: attackTarget.id, targetType: attackTarget.type, targetKind: attackTarget.kind }));

    } else if (actionType === 'TOGGLE_BLOCK_TARGET') {
      if (game.phase !== 'combat_blockers') return;
      const nextBlockers = { ...(game.combat?.blockers || {}) };
      const existing = nextBlockers[payload.cardId] || [];
      const isBlocking = existing.includes(payload.attackerId);
      const nextBlocking = isBlocking ? existing.filter(id => id !== payload.attackerId) : [...existing, payload.attackerId];
      if (nextBlocking.length === 0) delete nextBlockers[payload.cardId];
      else nextBlockers[payload.cardId] = nextBlocking;
      updates.combat = {
        ...normalizeCombatState(game.combat || getEmptyCombatState()),
        attackers: game.combat?.attackers || {},
        blockers: nextBlockers
      };
      updates.log = arrayUnion(makeActionLog('TOGGLE_BLOCK_TARGET', isBlocking ? `${actorName} stopped blocking ${getSafeCardName(game.cards.find(c => c.instanceId === payload.attackerId), 'an attacker')} with ${getSafeCardName(game.cards.find(c => c.instanceId === payload.cardId), 'a blocker')}.` : `${actorName} blocked ${getSafeCardName(game.cards.find(c => c.instanceId === payload.attackerId), 'an attacker')} with ${getSafeCardName(game.cards.find(c => c.instanceId === payload.cardId), 'a blocker')}.`, { category: 'combat', cardId: payload.cardId, targetCardId: payload.attackerId }));

    } else if (actionType === 'DISCARD_RANDOM') {
      const myHand = game.cards.filter(c => c.controllerId === userId && c.zone === ZONES.HAND);
      if (myHand.length > 0) {
        const randomCard = myHand[Math.floor(Math.random() * myHand.length)];
        const newCards = game.cards.map(c => c.instanceId === randomCard.instanceId ? { ...c, zone: ZONES.GRAVEYARD } : c);
        updates.cards = newCards;
        updates.log = arrayUnion(makeActionLog('DISCARD_RANDOM', `${actorName} discarded ${getSafeCardName(randomCard)} at random.`, { category: 'zone', cardId: randomCard.instanceId, cardName: getSafeCardName(randomCard) }));
      }

    } else if (actionType === 'PASS_PRIORITY') {
      // Priority Logic: If < 2 players, solo play (always pass). Else, strict turn order.
      // FIX: Safety check for players length
      if ((game.players || []).length < 2) {
        // Solo Play / Testing: Auto-Advance
        // ... (Existing logic for Phase Advance) ...
        const currentPhaseIdx = PHASES.findIndex(p => p.id === game.phase);
        const nextPhaseIdx = (currentPhaseIdx + 1) % PHASES.length;
        const nextPhase = PHASES[nextPhaseIdx];

        let nextTurnNum = game.turnNumber;
        if (nextPhase.id === 'untap') {
          nextTurnNum++;
          // In solo, active player never changes index (always 0)
        }

        const nextCombatState = getNextCombatState(game, nextPhase.id, nextPhase.id === 'untap');
        updates = { ...updates, phase: nextPhase.id, turnNumber: nextTurnNum, combat: nextCombatState, log: arrayUnion(makeActionLog('PHASE_ADVANCE', `${actorName} moved to ${nextPhase.label}.`, { category: 'phase' })) };

        if (shouldResetTemporaryDamageForPhase(nextPhase.id)) {
          updates.cards = resetTemporaryDamage(game.cards);
        }

        // Untap logic
        if (nextPhase.id === 'untap') {
          const phaseCards = updates.cards || game.cards;
          const newCards = phaseCards.map(c => {
            if (c.controllerId === userId && c.zone === ZONES.BATTLEFIELD) {
              return { ...c, tapped: false };
            }
            return c;
          });
          updates.cards = newCards;
        }

      } else {
        // Multiplayer Logic
        const nextPriorityIdx = (game.priorityIndex + 1) % game.players.length;
        const allPassed = (game.consecutivePasses + 1) >= game.players.length;

        if (allPassed) {
          if (game.stack && game.stack.length > 0) {
            const item = game.stack[game.stack.length - 1];
            const newStack = [...game.stack];
            newStack.pop();

            const cardIndex = game.cards.findIndex(c => c.instanceId === item.sourceId);
            const updatedCards = [...game.cards];
            if (cardIndex >= 0) {
              const card = updatedCards[cardIndex];
              const typeLine = getCardTypeLine(card).toLowerCase();
              const isPerm = !typeLine.includes('instant') && !typeLine.includes('sorcery');
              card.zone = isPerm ? ZONES.BATTLEFIELD : ZONES.GRAVEYARD;
              card.tapped = false;
              if (isPerm) {
                const spawnPosition = getBattlefieldGridPosition({
                  card,
                  existingBattlefieldCards: game.cards,
                  controllerId: card.controllerId,
                  containerWidth: card.controllerId === userId ? getCurrentBattlefieldWidthPx() : BATTLEFIELD_DEFAULT_WIDTH_PX,
                  isMobile: battlefieldViewport.width <= 900
                });
                Object.assign(card, getBattlefieldPositionCoordinates(spawnPosition));
                logBattlefieldEntry(card, 'STACK_RESOLUTION', spawnPosition);
              }
            }

            // Active player gets priority after resolution
            updates = {
              ...updates,
              stack: newStack,
              consecutivePasses: 0,
              priorityIndex: game.activePlayerIndex,
              priorityPlayerId: game.players[game.activePlayerIndex].id,
              cards: updatedCards,
              log: arrayUnion(makeActionLog('RESOLVE_SPELL', `${item.name} resolved.`, { category: 'stack', cardId: item.sourceId, cardName: item.name }))
            };

          } else {
            // Change Phase
            const currentPhaseIdx = PHASES.findIndex(p => p.id === game.phase);
            const nextPhaseIdx = (currentPhaseIdx + 1) % PHASES.length;
            const nextPhase = PHASES[nextPhaseIdx];

            let nextTurnNum = game.turnNumber;
            let nextActivePlayerIdx = game.activePlayerIndex;
            let nextTurnPlayerId = game.turnPlayerId;

            if (nextPhase.id === 'untap') {
              nextTurnNum++;
              nextActivePlayerIdx = (game.activePlayerIndex + 1) % game.players.length;
              nextTurnPlayerId = game.players[nextActivePlayerIdx].id;
            }

            // Active player gets priority in new phase
            const nextCombatState = getNextCombatState(game, nextPhase.id, nextPhase.id === 'untap');
            updates = {
              ...updates,
              phase: nextPhase.id,
              consecutivePasses: 0,
              priorityIndex: nextActivePlayerIdx,
              priorityPlayerId: game.players[nextActivePlayerIdx].id,
              activePlayerIndex: nextActivePlayerIdx,
              turnPlayerId: nextTurnPlayerId,
              turnNumber: nextTurnNum,
              combat: nextCombatState,
              log: arrayUnion(makeActionLog('PHASE_ADVANCE', `${actorName} moved to ${nextPhase.label}.`, { category: 'phase' }))
            };

            if (shouldResetTemporaryDamageForPhase(nextPhase.id)) {
              updates.cards = resetTemporaryDamage(game.cards);
            }

            if (nextPhase.id === 'untap') {
              const phaseCards = updates.cards || game.cards;
              const newCards = phaseCards.map(c => {
                if (c.controllerId === nextTurnPlayerId && c.zone === ZONES.BATTLEFIELD) {
                  return { ...c, tapped: false };
                }
                return c;
              });
              updates.cards = newCards;
            }
          }
        } else {
          // Just pass priority
          const nextPlayerId = game.players[nextPriorityIdx].id;
          updates = {
            ...updates,
            consecutivePasses: game.consecutivePasses + 1,
            priorityIndex: nextPriorityIdx,
            priorityPlayerId: nextPlayerId
          };
        }
      }

    } else if (actionType === 'PLAY_LAND') {
      const playedCard = game.cards.find(c => c.instanceId === payload.cardId);
      if (!playedCard || playedCard.zone !== ZONES.HAND) return;
      const battlefieldCard = { ...playedCard, zone: ZONES.BATTLEFIELD };
      const spawnPosition = getBattlefieldGridPosition({
        card: battlefieldCard,
        existingBattlefieldCards: game.cards,
        controllerId: userId,
        containerWidth: getCurrentBattlefieldWidthPx(),
        isMobile: battlefieldViewport.width <= 900
      });
      const newCards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, zone: ZONES.BATTLEFIELD, ...getBattlefieldPositionCoordinates(spawnPosition) } : c);
      logBattlefieldEntry(battlefieldCard, 'PLAY_LAND', spawnPosition);
      updates.cards = newCards;
      optimisticPatch = { cards: newCards };
      updates.log = arrayUnion(makeActionLog('PLAY_LAND', `${actorName} played ${getSafeCardName(playedCard, payload.cardName || 'a land')}.`, { category: 'card', cardId: playedCard?.instanceId || payload.cardId, cardName: getSafeCardName(playedCard, payload.cardName || 'a land') }));
      pendingRecapEvents.push({
        type: 'PLAY_LAND',
        turnNumber: game.turnNumber,
        phase: game.phase,
        actorId: userId,
        actorName: myPlayer?.name || 'Unknown',
        cardId: playedCard?.instanceId || payload.cardId,
        cardName: getCardDisplayName(playedCard, payload.cardName || 'Unknown card'),
        text: `${myPlayer?.name || 'Unknown'} played land: ${getCardDisplayName(playedCard, payload.cardName || 'Unknown card')}`
      });

    } else if (actionType === 'CAST_SPELL') {
      // Priority Guard
      if (game.players.length >= 2 && game.priorityPlayerId !== userId) {
        setNotification("No priority — wait or press Pass");
        setTimeout(() => setNotification(null), 2000);
        return;
      }

      const card = game.cards.find(c => c.instanceId === payload.cardId);
      pendingRecapEvents.push({
        type: 'CAST',
        turnNumber: game.turnNumber,
        phase: game.phase,
        actorId: userId,
        actorName: myPlayer?.name || 'Unknown',
        cardId: card?.instanceId || payload.cardId,
        cardName: getCardDisplayName(card, payload.cardName || 'Unknown card'),
        text: `${myPlayer?.name || 'Unknown'} cast ${getCardDisplayName(card, payload.cardName || 'Unknown card')}`
      });
      const stackItem = {
        id: generateCardId(),
        sourceId: card.instanceId,
        name: getCardDisplayName(card),
        controllerId: userId,
        timestamp: Date.now(),
        targetIds: payload.targetIds || [], // Store array of targets on stack item
        targetPlayerIds: payload.targetPlayerIds || [], // Store array of player targets
        cardImage: getCardImageUri(card), // Added cardImage
        typeLine: getCardTypeLine(card) || null,
        itemType: 'SPELL'
      };

      const newCards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, zone: 'stack_zone' } : c);
      const userIndex = game.players.findIndex(p => p.id === userId);

      updates = {
        ...updates,
        cards: newCards,
        stack: arrayUnion(stackItem),
        consecutivePasses: 0,
        priorityPlayerId: userId,
        priorityIndex: userIndex !== -1 ? userIndex : game.priorityIndex,
        log: arrayUnion(makeActionLog('CAST_SPELL', `${actorName} cast ${getSafeCardName(card, payload.cardName || 'a spell')}${formatActionTargetSuffix(payload.targetIds, payload.targetPlayerIds)}.`, { category: 'stack', cardId: card?.instanceId || payload.cardId, cardName: getSafeCardName(card, payload.cardName || 'a spell'), targetNames: getActionTargetDisplayNames(payload.targetIds, payload.targetPlayerIds) }))
      };
      optimisticPatch = {
        cards: newCards,
        stack: [...(game.stack || []), stackItem],
        consecutivePasses: 0,
        priorityPlayerId: userId,
        priorityIndex: userIndex !== -1 ? userIndex : game.priorityIndex
      };

    } else if (actionType === 'ACTIVATE_ABILITY') {
      // Priority Guard
      if (game.players.length >= 2 && game.priorityPlayerId !== userId) {
        setNotification("No priority — wait or press Pass");
        setTimeout(() => setNotification(null), 2000);
        return;
      }
      const sourceCard = game.cards.find(c => c.instanceId === payload.sourceId);
      pendingRecapEvents.push({
        type: 'ACTIVATE',
        turnNumber: game.turnNumber,
        phase: game.phase,
        actorId: userId,
        actorName: myPlayer?.name || 'Unknown',
        cardId: sourceCard?.instanceId || payload.sourceId,
        cardName: sourceCard ? getCardDisplayName(sourceCard) : null,
        text: sourceCard
          ? `${myPlayer?.name || 'Unknown'} activated ${getCardDisplayName(sourceCard)}`
          : `${myPlayer?.name || 'Unknown'} activated an ability`
      });
      const stackItem = {
        id: generateCardId(),
        sourceId: payload.sourceId,
        name: `${getCardDisplayName(sourceCard)} (Ability)`,
        controllerId: userId,
        timestamp: Date.now(),
        targetIds: payload.targetIds || [],
        targetPlayerIds: payload.targetPlayerIds || [], // Store array of player targets
        type: 'ABILITY',
        cardImage: getCardImageUri(sourceCard), // Added cardImage
        typeLine: getCardTypeLine(sourceCard) || null,
        itemType: 'ABILITY'
      };
      const userIndex = game.players.findIndex(p => p.id === userId);
      updates.stack = arrayUnion(stackItem);
      updates.consecutivePasses = 0;
      updates.log = arrayUnion(makeActionLog('ACTIVATE_ABILITY', `${actorName} activated ${getSafeCardName(sourceCard, 'an ability')}${formatActionTargetSuffix(payload.targetIds, payload.targetPlayerIds)}.`, { category: 'stack', cardId: sourceCard?.instanceId, cardName: getSafeCardName(sourceCard, 'an ability'), targetNames: getActionTargetDisplayNames(payload.targetIds, payload.targetPlayerIds) }));
      updates.priorityPlayerId = userId;
      updates.priorityIndex = userIndex !== -1 ? userIndex : game.priorityIndex;

    } else if (actionType === 'ATTACH_CARD') {
      const sourceCard = game.cards.find(c => c.instanceId === payload.cardId);
      if (!sourceCard || sourceCard.zone !== ZONES.BATTLEFIELD) return;
      if (payload.targetType === 'card') {
        const targetCard = game.cards.find(c => c.instanceId === payload.targetId);
        if (!targetCard || targetCard.zone !== ZONES.BATTLEFIELD || targetCard.instanceId === sourceCard.instanceId) return;
        updates.cards = game.cards.map(c => c.instanceId === sourceCard.instanceId ? setCardAttachment(c, 'card', targetCard.instanceId) : c);
        updates.log = arrayUnion(makeActionLog('ATTACH_CARD', `${actorName} attached ${getAttachmentDisplayName(sourceCard)} to ${getAttachmentDisplayName(targetCard)}.`, { category: 'attachment', cardId: sourceCard.instanceId, cardName: getAttachmentDisplayName(sourceCard), targetCardId: targetCard.instanceId, targetCardName: getAttachmentDisplayName(targetCard) }));
      } else if (payload.targetType === 'player') {
        const targetPlayer = (game.players || []).find(player => player.id === payload.targetId);
        if (!targetPlayer) return;
        const targetPlayerName = targetPlayer.name || 'Player';
        updates.cards = game.cards.map(c => c.instanceId === sourceCard.instanceId ? setCardAttachment(c, 'player', targetPlayer.id) : c);
        updates.log = arrayUnion(makeActionLog('ATTACH_CARD', `${actorName} attached ${getAttachmentDisplayName(sourceCard)} to ${targetPlayerName}.`, { category: 'attachment', cardId: sourceCard.instanceId, cardName: getAttachmentDisplayName(sourceCard), targetPlayerId: targetPlayer.id, targetPlayerName }));
      }

    } else if (actionType === 'DETACH_CARD') {
      const sourceCard = game.cards.find(c => c.instanceId === payload.cardId);
      if (!sourceCard || !normalizeAttachment(sourceCard)) return;
      updates.cards = game.cards.map(c => c.instanceId === sourceCard.instanceId ? clearAttachmentFields(c) : c);
      updates.log = arrayUnion(makeActionLog('DETACH_CARD', `${actorName} detached ${getAttachmentDisplayName(sourceCard)}.`, { category: 'attachment', cardId: sourceCard.instanceId, cardName: getAttachmentDisplayName(sourceCard) }));

    } else if (actionType === 'TAP_TOGGLE') {
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      const nextTapped = !card?.tapped;
      const newCards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, tapped: nextTapped } : c);
      updates.cards = newCards;
      optimisticPatch = { cards: newCards };
      updates.log = arrayUnion(makeActionLog('TAP_TOGGLE', `${actorName} ${nextTapped ? 'tapped' : 'untapped'} ${getSafeCardName(card)}.`, { category: 'tap', cardId: card?.instanceId, cardName: getSafeCardName(card), tapped: nextTapped }));

    } else if (actionType === 'PHASE_TOGGLE') {
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      if (!card || card.zone !== ZONES.BATTLEFIELD) return;
      const nextPhasedOut = !card.phasedOut;
      const newCards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, phasedOut: nextPhasedOut } : c);
      updates.cards = newCards;
      optimisticPatch = { cards: newCards };
      updates.log = arrayUnion(makeActionLog('PHASE_TOGGLE', `${actorName} phased ${nextPhasedOut ? 'out' : 'in'} ${getSafeCardName(card)}.`, { category: 'phase', cardId: card.instanceId, cardName: getSafeCardName(card), phasedOut: nextPhasedOut }));

    } else if (actionType === 'TEMP_DAMAGE') {
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      if (!card) return;
      const current = Math.max(0, card.tempDamage || 0);
      const nextDamage = payload.clear ? 0 : Math.max(0, current + (payload.amount || 0));
      updates.cards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, tempDamage: nextDamage } : c);
      updates.log = arrayUnion(makeActionLog('TEMP_DAMAGE', payload.clear ? `${actorName} cleared damage from ${getSafeCardName(card)}.` : `${actorName} marked ${payload.amount || 0} damage on ${getSafeCardName(card)}.`, { category: 'damage', cardId: card.instanceId, cardName: getSafeCardName(card), damage: nextDamage }));

    } else if (actionType === 'DRAW_CARD') {
      const libCards = game.cards.filter(c => c.ownerId === userId && c.zone === ZONES.LIBRARY);
      if (libCards.length === 0) {
        setNotification('No cards left in library to draw.');
        setTimeout(() => setNotification(null), 2000);
        return;
      }
      const cardToDraw = libCards[0];
      const newCards = game.cards.map(c => c.instanceId === cardToDraw.instanceId ? { ...c, zone: ZONES.HAND } : c);
      updates.cards = newCards;
      optimisticPatch = { cards: newCards };
      updates.log = arrayUnion(makeActionLog('DRAW_CARD', `${actorName} drew a card.`, { category: 'draw' }));

    } else if (actionType === 'BATCH_DRAW_LIBRARY' || actionType === 'BATCH_MILL_LIBRARY' || actionType === 'BATCH_EXILE_LIBRARY') {
      const requested = clamp(Number.parseInt(payload.n, 10) || 1, 1, 99);
      const targetZone = actionType === 'BATCH_DRAW_LIBRARY' ? ZONES.HAND : actionType === 'BATCH_MILL_LIBRARY' ? ZONES.GRAVEYARD : ZONES.EXILE;
      const libCards = game.cards.filter(c => c.ownerId === userId && c.zone === ZONES.LIBRARY);
      const movedCards = libCards.slice(0, Math.min(requested, libCards.length));
      if (movedCards.length === 0) {
        setNotification('No cards left in library.');
        setTimeout(() => setNotification(null), 2000);
        return;
      }
      const movedIds = new Set(movedCards.map(c => c.instanceId));
      const newCards = game.cards.map(c => movedIds.has(c.instanceId) ? { ...c, zone: targetZone, tapped: false, faceDown: false } : c);
      updates.cards = newCards;
      optimisticPatch = { cards: newCards };
      const count = movedCards.length;
      const plural = count === 1 ? 'card' : 'cards';
      if (actionType === 'BATCH_DRAW_LIBRARY') {
        updates.log = arrayUnion(makeActionLog('BATCH_DRAW_LIBRARY', `${actorName} drew ${count} ${plural}.`, { category: 'draw', count }));
      } else if (actionType === 'BATCH_MILL_LIBRARY') {
        updates.log = arrayUnion(makeActionLog('BATCH_MILL_LIBRARY', `${actorName} milled ${count} ${plural}.`, { category: 'library', count }));
      } else {
        updates.log = arrayUnion(makeActionLog('BATCH_EXILE_LIBRARY', `${actorName} exiled the top ${count} ${plural} of their library.`, { category: 'library', count }));
      }

    } else if (actionType === 'BATCH_REVEAL_LIBRARY') {
      const requested = clamp(Number.parseInt(payload.n, 10) || 1, 1, 99);
      const libCards = game.cards.filter(c => c.ownerId === userId && c.zone === ZONES.LIBRARY);
      const revealedCards = libCards.slice(0, Math.min(requested, libCards.length));
      if (revealedCards.length === 0) {
        setNotification('No cards left in library to reveal.');
        setTimeout(() => setNotification(null), 2000);
        return;
      }
      const now = Date.now();
      const revealEntries = revealedCards.map((card, index) => ({
        id: generateCardId(),
        cardId: card.instanceId,
        cardName: getCardDisplayName(card),
        cardImage: getCardImageUri(card),
        revealerId: userId,
        revealerName: myPlayer?.name || 'Unknown',
        timestamp: now + index
      }));
      const count = revealedCards.length;
      updates.reveals = arrayUnion(...revealEntries);
      updates.log = arrayUnion(makeActionLog('BATCH_REVEAL_LIBRARY', `${actorName} revealed the top ${count} ${count === 1 ? 'card' : 'cards'} of their library.`, { category: 'reveal', count }));

    } else if (actionType === 'BATCH_SCRY_LIBRARY' || actionType === 'BATCH_SURVEIL_LIBRARY') {
      const ownerId = payload.ownerId || userId;
      if (ownerId !== userId) return;
      const requested = clamp(Number.parseInt(payload.n, 10) || 1, 1, 99);
      const currentLib = game.cards.filter(c => c.ownerId === ownerId && c.zone === ZONES.LIBRARY);
      const reviewed = currentLib.slice(0, Math.min(requested, currentLib.length));
      if (reviewed.length === 0) return;
      const reviewedMap = new Map(reviewed.map(c => [c.instanceId, c]));
      const reviewedIds = new Set(reviewed.map(c => c.instanceId));
      const movedIds = (payload.movedIds || []).filter(id => reviewedMap.has(id));
      const movedSet = new Set(movedIds);
      const keptTop = (payload.keptTopIds || []).filter(id => reviewedMap.has(id) && !movedSet.has(id)).map(id => reviewedMap.get(id));
      const remainingReviewedKept = reviewed.filter(c => !movedSet.has(c.instanceId) && !keptTop.some(top => top.instanceId === c.instanceId));
      const keptCards = [...keptTop, ...remainingReviewedKept];
      const restLibrary = currentLib.filter(c => !reviewedIds.has(c.instanceId));

      if (actionType === 'BATCH_SCRY_LIBRARY') {
        const bottomCards = movedIds.map(id => reviewedMap.get(id)).filter(Boolean);
        const nextLibraryQueue = [...keptCards, ...restLibrary, ...bottomCards];
        updates.cards = game.cards.map(c => (c.ownerId === ownerId && c.zone === ZONES.LIBRARY) ? (nextLibraryQueue.shift() || c) : c);
        optimisticPatch = { cards: updates.cards };
        updates.log = arrayUnion(makeActionLog('BATCH_SCRY_LIBRARY', `${actorName} scryed ${reviewed.length}.`, { category: 'library', count: reviewed.length }));
      } else {
        const graveyardCards = movedIds.map(id => reviewedMap.get(id)).filter(Boolean);
        const nextLibraryQueue = [...keptCards, ...restLibrary];
        updates.cards = game.cards.map(c => {
          if (movedSet.has(c.instanceId)) return { ...c, zone: ZONES.GRAVEYARD, tapped: false, faceDown: false };
          if (c.ownerId === ownerId && c.zone === ZONES.LIBRARY) return nextLibraryQueue.shift() || c;
          return c;
        });
        optimisticPatch = { cards: updates.cards };
        updates.log = arrayUnion(makeActionLog('BATCH_SURVEIL_LIBRARY', `${actorName} surveilled ${reviewed.length}.`, { category: 'library', count: reviewed.length, graveyardCount: graveyardCards.length }));
      }

    } else if (actionType === 'MOVE_ZONE') {
      const movingCard = game.cards.find(c => c.instanceId === payload.cardId);
      const tokenLeavesBattlefield = Boolean(movingCard?.isToken && movingCard.zone === ZONES.BATTLEFIELD && payload.targetZone !== ZONES.BATTLEFIELD);
      const battlefieldMovingCard = movingCard ? { ...movingCard, zone: ZONES.BATTLEFIELD, controllerId: movingCard.ownerId } : null;
      const spawnPosition = payload.targetZone === ZONES.BATTLEFIELD
        ? getBattlefieldGridPosition({
            card: battlefieldMovingCard,
            existingBattlefieldCards: game.cards,
            controllerId: battlefieldMovingCard?.controllerId,
            containerWidth: battlefieldMovingCard?.controllerId === userId ? getCurrentBattlefieldWidthPx() : BATTLEFIELD_DEFAULT_WIDTH_PX,
            isMobile: battlefieldViewport.width <= 900
          })
        : null;
      const movedCards = tokenLeavesBattlefield
        ? game.cards.filter(c => c.instanceId !== payload.cardId)
        : game.cards.map(c =>
            c.instanceId === payload.cardId
              ? {
                  ...clearAttachmentFields(c),
                  zone: payload.targetZone,
                  tapped: false,
                  tempDamage: 0,
                  controllerId: c.ownerId,
                  ...(spawnPosition ? getBattlefieldPositionCoordinates(spawnPosition) : { x: 10, y: 10, positionMode: BATTLEFIELD_POSITION_MODE_AUTO })
                }
              : c
          );
      const { cards: newCards, messages: attachmentCleanupMessages } = payload.targetZone !== ZONES.BATTLEFIELD
        ? buildAttachmentCleanup(movedCards, movingCard)
        : { cards: movedCards, messages: [] };
      if (spawnPosition) logBattlefieldEntry(battlefieldMovingCard, 'MOVE_ZONE', spawnPosition);
      updates.cards = newCards;
      updates.combat = clearCombatAssignmentsForCard(game.combat || getEmptyCombatState(), payload.cardId);
      const movedCardName = movingCard?.isToken ? `${movingCard.name || 'Token'} token` : getSafeMoveCardName(movingCard, movingCard?.zone, payload.targetZone);
      const moveMessage = payload.targetZone === ZONES.COMMAND && movingCard?.isCommander
        ? `${actorName} moved ${movedCardName} to the command zone.`
        : `${actorName} moved ${movedCardName} to ${getZoneLabel(payload.targetZone)}.`;
      optimisticPatch = { cards: newCards, combat: updates.combat };
      updates.log = arrayUnion(
        makeActionLog('MOVE_ZONE', moveMessage, { category: payload.targetZone === ZONES.COMMAND ? 'commander' : 'zone', cardId: payload.cardId, cardName: movedCardName, fromZone: movingCard?.zone, toZone: payload.targetZone, tokenRemoved: tokenLeavesBattlefield }),
        ...makeAttachmentLogs(attachmentCleanupMessages)
      );

    } else if (actionType === 'MOVE_TO_LIBRARY') {
      const cardToMove = game.cards.find(c => c.instanceId === payload.cardId);
      const otherCards = game.cards.filter(c => c.instanceId !== payload.cardId);
      const tokenLeavesBattlefield = Boolean(cardToMove?.isToken && cardToMove.zone === ZONES.BATTLEFIELD);

      let movedCards;
      if (tokenLeavesBattlefield) {
        movedCards = otherCards;
      } else {
        const updatedCard = { ...clearAttachmentFields(cardToMove), zone: ZONES.LIBRARY, tapped: false, tempDamage: 0, faceDown: false, counters: {}, x: 5, y: 5 };
        movedCards = payload.position === 'TOP' ? [updatedCard, ...otherCards] : [...otherCards, updatedCard];
      }
      const { cards: cleanedCards, messages: attachmentCleanupMessages } = buildAttachmentCleanup(movedCards, cardToMove);
      updates.cards = cleanedCards;
      updates.combat = clearCombatAssignmentsForCard(game.combat || getEmptyCombatState(), payload.cardId);
      const movedCardName = cardToMove?.isToken ? `${cardToMove.name || 'Token'} token` : getSafeCardName(cardToMove);
      updates.log = arrayUnion(
        makeActionLog('MOVE_TO_LIBRARY', `${actorName} moved ${movedCardName} to the ${payload.position === 'TOP' ? 'top' : 'bottom'} of library.`, { category: 'zone', cardId: payload.cardId, cardName: movedCardName, fromZone: cardToMove?.zone, toZone: ZONES.LIBRARY, tokenRemoved: tokenLeavesBattlefield }),
        ...makeAttachmentLogs(attachmentCleanupMessages)
      );

    } else if (actionType === 'REORDER_TOP_LIBRARY') {
      const ownerId = payload.ownerId;
      const orderedIds = payload.orderedTopIds; // array of instanceIds

      // 1. Get all cards in current library order
      const currentLib = game.cards.filter(c => c.ownerId === ownerId && c.zone === ZONES.LIBRARY);

      // 2. Identify the cards involved in the reorder
      const topCardsMap = new Map();
      currentLib.forEach(c => {
        if (orderedIds.includes(c.instanceId)) {
          topCardsMap.set(c.instanceId, c);
        }
      });

      // 3. Construct new top array based on orderedIds
      const newTop = orderedIds.map(id => topCardsMap.get(id)).filter(Boolean);

      // 4. Identify remaining library cards (those not in the top N being reordered)
      const remaining = currentLib.filter(c => !orderedIds.includes(c.instanceId));

      // 5. Combine
      const newLibQueue = [...newTop, ...remaining];

      // 6. Map over game.cards to replace in place
      updates.cards = game.cards.map(c => {
        if (c.ownerId === ownerId && c.zone === ZONES.LIBRARY) {
          return newLibQueue.shift() || c; // shift from the new order
        }
        return c;
      });
      updates.log = arrayUnion(makeActionLog('REORDER_TOP_LIBRARY', `${actorName} reordered the top ${orderedIds.length} cards of ${ownerId === userId ? 'their' : "opponent's"} library.`, { category: 'library' }));

    } else if (actionType === 'LIFE_CHANGE') {
      const targetPlayer = game.players.find(p => p.id === payload.targetPlayerId);
      const oldLife = targetPlayer?.life ?? 0;
      const newLife = oldLife + payload.amount;
      const newPlayers = game.players.map(p =>
        p.id === payload.targetPlayerId ? { ...p, life: newLife } : p
      );
      updates.players = newPlayers;
      updates.log = arrayUnion(makeActionLog('LIFE_CHANGE', `${targetPlayer?.name || 'Unknown'} life changed from ${oldLife} to ${newLife}.`, { category: 'life', targetPlayerId: payload.targetPlayerId, oldLife, newLife }));
      pendingRecapEvents.push({
        type: 'LIFE_CHANGE',
        turnNumber: game.turnNumber,
        phase: game.phase,
        actorId: userId,
        actorName: myPlayer?.name || 'Unknown',
        text: `${targetPlayer?.name || 'Unknown'} life: ${oldLife} → ${newLife}`
      });

    } else if (actionType === 'REVEAL_CARD') {
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      const revealEntry = {
        id: generateCardId(),
        cardId: card.instanceId,
        cardName: getCardDisplayName(card),
        cardImage: getCardImageUri(card),
        revealerId: userId,
        revealerName: myPlayer?.name || 'Unknown',
        timestamp: Date.now()
      };
      updates.reveals = arrayUnion(revealEntry);
      updates.log = arrayUnion(makeActionLog('REVEAL_CARD', `${actorName} revealed ${getCardDisplayName(card)}.`, { category: 'reveal', cardId: card.instanceId, cardName: getCardDisplayName(card), cardImage: getCardImageUri(card) }));

    } else if (actionType === 'REVEAL_ALL_HAND') {
      const handCards = game.cards.filter(c => c.controllerId === userId && c.zone === ZONES.HAND);
      if (handCards.length === 0) return;

      const newRevealEntries = [];
      const newLogEntries = [];

      handCards.forEach((card, index) => {
        const revealEntry = {
          id: generateCardId(),
          cardId: card.instanceId,
          cardName: getCardDisplayName(card),
          cardImage: getCardImageUri(card),
          revealerId: userId,
          revealerName: myPlayer?.name || 'Unknown',
          timestamp: Date.now() + index // Offset slightly to preserve order
        };
        newRevealEntries.push(revealEntry);
        newLogEntries.push(makeActionLog('REVEAL_CARD', `${actorName} revealed ${getCardDisplayName(card)}.`, { category: 'reveal', timestamp: Date.now() + index, cardId: card.instanceId, cardName: getCardDisplayName(card), cardImage: getCardImageUri(card) }));
      });

      if (newRevealEntries.length > 0) {
        updates.reveals = arrayUnion(...newRevealEntries);
        updates.log = arrayUnion(...newLogEntries);
      }

    } else if (actionType === 'CLEAR_REVEALS') {
      updates.reveals = [];
      updates.log = arrayUnion(makeActionLog('CLEAR_REVEALS', `${actorName} cleared revealed cards.`, { category: 'reveal' }));

    } else if (actionType === 'PRIVATE_PEEK_HAND') {
      const targetPlayer = (game.players || []).find(p => p.id === payload.targetPlayerId && p.id !== userId);
      if (!targetPlayer) return;
      updates.log = arrayUnion(makeActionLog('PRIVATE_PEEK_HAND', `${actorName} privately looked at ${targetPlayer.name || 'opponent'}'s hand.`, { category: 'reveal', targetPlayerId: targetPlayer.id }));

    } else if (actionType === 'TOGGLE_HAND_REVEAL') {
      const newPlayers = game.players.map(p => p.id === userId ? { ...p, handRevealed: !p.handRevealed } : p);
      updates.players = newPlayers;
      updates.log = arrayUnion(makeActionLog('TOGGLE_HAND_REVEAL', !handRevealed ? `${actorName} revealed their hand.` : `${actorName} hid their hand.`, { category: 'reveal' }));
    }

    if (optimisticPatch) {
      if (UNDOABLE_ACTION_TYPES.has(actionType) && actionUpdatesRestorableState(updates)) {
        const optimisticActionLabel = normalizeUndoActionLabel(actionMessages[0] || payload.desc || actionType, actorName);
        const optimisticUndoEntry = {
          ...buildUndoEntry({
            currentGame: game,
            actorId: userId,
            actorName,
            actionLabel: optimisticActionLabel,
            fields: getUndoFieldsForAction(actionType, { updates }),
            actionType,
            clientActionId,
            cardId: getPerfActionCardId(payload),
            postActionCards: updates.cards
          }),
          pendingSync: true
        };
        optimisticPatch = {
          ...optimisticPatch,
          undoStack: appendOptimisticUndoEntry(game, optimisticUndoEntry)
        };
      }
      applyOptimisticGamePatch({ actionType, payload: { ...payload, clientActionId }, patch: optimisticPatch, perfActionId });
    } else if (['DRAW_CARD', 'BATCH_DRAW_LIBRARY', 'BATCH_MILL_LIBRARY', 'BATCH_EXILE_LIBRARY', 'BATCH_SCRY_LIBRARY', 'BATCH_SURVEIL_LIBRARY', 'PLAY_LAND', 'CAST_SPELL', 'MOVE_ZONE', 'SWITCH_CARD_FACE', 'TAP_TOGGLE', 'PHASE_TOGGLE', 'ADD_CARD_REMINDER', 'REMOVE_CARD_REMINDER'].includes(actionType)) {
      recordPerfOptimisticSkipped('No conservative local patch was produced.', perfActionId);
    }

    let firestoreWriteCommitted = false;
    if (UNDOABLE_ACTION_TYPES.has(actionType) && actionUpdatesRestorableState(updates)) {
      const actionLabel = normalizeUndoActionLabel(actionMessages[0] || payload.desc || actionType, actorName);
      await perfRunTransaction('runTransaction', async (transaction) => {
        const snap = await transaction.get(gameRef);
        if (!snap.exists()) return;
        const currentGame = snap.data();
        const currentPlayers = currentGame.players || [];
        if (!currentPlayers.some((player) => player.id === userId)) return;
        const transactionActorName = currentPlayers.find((player) => player.id === userId)?.name || actorName;
        let transactionUpdates = updates;
        let undoBaseGame = currentGame;
        let transactionActionLabel = actionLabel;
        if (actionType === 'PLAY_LAND') {
          const currentCards = currentGame.cards || [];
          const currentPlayedCard = currentCards.find((card) => card.instanceId === payload.cardId);
          const localPlayedCardBeforeAction = (game.cards || []).find((card) => card.instanceId === payload.cardId);
          const canRepairAlreadyMovedLand = currentPlayedCard?.zone === ZONES.BATTLEFIELD && localPlayedCardBeforeAction?.zone === ZONES.HAND;
          if (!currentPlayedCard || (currentPlayedCard.zone !== ZONES.HAND && !canRepairAlreadyMovedLand)) return;
          const playedCardForLog = currentPlayedCard || localPlayedCardBeforeAction;
          const transactionBattlefieldCard = { ...playedCardForLog, zone: ZONES.BATTLEFIELD };
          const transactionSpawnPosition = getBattlefieldGridPosition({
            card: transactionBattlefieldCard,
            existingBattlefieldCards: currentCards,
            controllerId: userId,
            containerWidth: getCurrentBattlefieldWidthPx(),
            isMobile: battlefieldViewport.width <= 900
          });
          const transactionCards = currentCards.map((card) => (
            card.instanceId === payload.cardId
              ? { ...card, zone: ZONES.BATTLEFIELD, ...getBattlefieldPositionCoordinates(transactionSpawnPosition) }
              : card
          ));
          const playLandMessage = `${transactionActorName} played ${getSafeCardName(playedCardForLog, payload.cardName || 'a land')}.`;
          transactionActionLabel = normalizeUndoActionLabel(playLandMessage, transactionActorName);
          if (canRepairAlreadyMovedLand) {
            undoBaseGame = {
              ...currentGame,
              cards: currentCards.map((card) => (
                card.instanceId === payload.cardId
                  ? { ...card, ...localPlayedCardBeforeAction, zone: ZONES.HAND }
                  : card
              ))
            };
          }
          transactionUpdates = {
            ...updates,
            cards: transactionCards,
            log: arrayUnion(makeActionLog('PLAY_LAND', playLandMessage, {
              category: 'card',
              cardId: playedCardForLog.instanceId || payload.cardId,
              cardName: getSafeCardName(playedCardForLog, payload.cardName || 'a land')
            }))
          };
          recordPerfCheckpoint('PLAY_LAND transaction prepared', {
            updatesIncludeCards: Array.isArray(transactionUpdates.cards),
            currentCardZone: currentPlayedCard?.zone || null,
            repairedAlreadyMovedLand: canRepairAlreadyMovedLand,
            undoStackLengthBefore: Array.isArray(currentGame.undoStack) ? currentGame.undoStack.length : 0,
            previousNewestUndoActionType: getPerfLatestUndoEntry(currentGame)?.actionType || null,
            previousNewestUndoCardId: getPerfLatestUndoEntry(currentGame)?.cardId || null
          }, perfActionId);
        }
        if (actionType === 'MANA_POOL_ADJUST') {
          const color = MANA_COLORS.includes(payload.color) ? payload.color : null;
          const amount = Number.parseInt(payload.amount, 10) || 0;
          const currentTargetPlayer = currentPlayers.find((player) => player.id === userId);
          if (!color || amount === 0 || !currentTargetPlayer) return;
          const currentPool = getPlayerManaPool(currentTargetPlayer);
          const nextAmount = Math.max(0, currentPool[color] + amount);
          if (nextAmount === currentPool[color]) return;
          const nextPool = { ...currentPool, [color]: nextAmount };
          const nextPlayers = currentPlayers.map((player) => player.id === userId ? { ...player, manaPool: nextPool } : player);
          transactionActionLabel = normalizeUndoActionLabel(`${transactionActorName} ${amount > 0 ? 'added' : 'removed'} {${color}}.`, transactionActorName);
          transactionUpdates = {
            ...updates,
            players: nextPlayers,
            log: arrayUnion(makeActionLog('MANA_POOL_ADJUST', `${transactionActorName} ${amount > 0 ? 'added' : 'removed'} {${color}}.`, { category: 'mana', color, amount: amount > 0 ? 1 : -1, targetPlayerId: userId }))
          };
        }
        if (actionType === 'MANA_POOL_CLEAR') {
          const currentTargetPlayer = currentPlayers.find((player) => player.id === userId);
          if (!currentTargetPlayer) return;
          const currentPool = getPlayerManaPool(currentTargetPlayer);
          if (!Object.values(currentPool).some((amount) => amount > 0)) return;
          const nextPlayers = currentPlayers.map((player) => player.id === userId ? { ...player, manaPool: clearManaPool() } : player);
          transactionActionLabel = normalizeUndoActionLabel(`${transactionActorName} cleared their mana pool.`, transactionActorName);
          transactionUpdates = {
            ...updates,
            players: nextPlayers,
            log: arrayUnion(makeActionLog('MANA_POOL_CLEAR', `${transactionActorName} cleared their mana pool.`, { category: 'mana', targetPlayerId: userId }))
          };
        }
        const undoEntry = buildUndoEntry({
          currentGame: undoBaseGame,
          actorId: userId,
          actorName: transactionActorName,
          actionLabel: transactionActionLabel,
          fields: getUndoFieldsForAction(actionType, { updates: transactionUpdates }),
          actionType,
          clientActionId,
          cardId: getPerfActionCardId(payload),
          postActionCards: transactionUpdates.cards
        });
        const nextUndoStack = appendUndoEntry(currentGame, undoEntry);
        const newestUndoAfterAppend = nextUndoStack[nextUndoStack.length - 1] || null;
        if (actionType === 'PLAY_LAND') {
          recordPerfUndo({
            writeIncludesUndoStack: true,
            undoStackLengthBefore: Array.isArray(currentGame.undoStack) ? currentGame.undoStack.length : 0,
            undoStackLengthAfter: nextUndoStack.length,
            newestServerUndoActionType: newestUndoAfterAppend?.actionType || null,
            newestServerUndoCardId: newestUndoAfterAppend?.cardId || null,
            pruningDroppedNewPlayLand: newestUndoAfterAppend?.id !== undoEntry.id,
            undoStackActionOrder: nextUndoStack.map((entry) => entry?.actionType || 'UNKNOWN').join(' > ')
          }, perfActionId);
        }
        firestoreWriteCommitted = true;
        transaction.update(gameRef, normalizeGameUpdatesForFirestore({
          ...transactionUpdates,
          undoStack: nextUndoStack,
          updatedAt: serverTimestamp()
        }, actionType));
      });
    } else {
      await perfUpdateDoc(gameRef, normalizeGameUpdatesForFirestore(updates, actionType));
      firestoreWriteCommitted = true;
    }
    if (firestoreWriteCommitted && (pendingOptimisticActionRef.current?.id || perfActionId)) {
      const completedActionId = pendingOptimisticActionRef.current?.id || perfActionId;
      completedOptimisticActionIdsRef.current.add(completedActionId);
      const latestFirestore = latestFirestoreGameRef.current;
      const latestLog = latestFirestore?.log && latestFirestore.log.length > 0 ? latestFirestore.log[latestFirestore.log.length - 1] : null;
      const pendingOptimistic = pendingOptimisticActionRef.current;
      if (pendingOptimistic && latestFirestore) {
        const reflection = getPerfSnapshotReflection(pendingOptimistic, latestFirestore, latestLog);
        const fallbackReflects = pendingOptimistic.actionType === 'PLAY_LAND'
          && getPerfCardZone(latestFirestore, pendingOptimistic.cardId) === ZONES.BATTLEFIELD
          && Boolean(getPerfRecentUndoEntries(latestFirestore).some((entry) => entry && !entry.pendingSync && perfEntryMatchesAction(entry, pendingOptimistic)));
        if (reflection.reflects || fallbackReflects) {
          recordPerfOptimisticConfirmed({ reflectionReason: reflection.reason, safeFallbackReflects: fallbackReflects, transactionResolvedFallback: true }, pendingOptimistic.id);
          completedOptimisticActionIdsRef.current.delete(pendingOptimistic.id);
          pendingOptimisticActionRef.current = null;
          setOptimisticGame(null);
          setPendingOptimisticActionId(null);
          setPendingOptimisticStartedAt(null);
        }
      }
    }
    await maybeCompleteTutorialAction(actionType, payload);
    if (pendingRecapEvents.length > 0) {
      await Promise.all(pendingRecapEvents.map((event) => appendEvent(gameId, event)));
    }
    } catch (error) {
      clearOptimisticGame(error?.message || 'Firestore action failed', perfActionId);
      setNotification(`Action failed: ${error?.message || String(error)}`);
      setTimeout(() => setNotification(null), 3500);
      failPerfAction(perfActionId, error);
      debugActionsError(`handleAction threw: ${actionType}`, {
        actionType,
        payload,
        message: error?.message || String(error),
        stack: error?.stack || null,
        selectedCard: selectedCard || null,
        relevantCard: payload?.cardId ? (game?.cards || []).find((card) => card.instanceId === payload.cardId) || null : null
      });
      throw error;
    } finally {
      finishPerfAction(perfActionId);
    }
  };

  useEffect(() => {
    if (!game || !userId || !isPlayer) return;
    const remoteConfig = getPlayerAutoPassConfig(game, userId);
    setAutoPassConfig((prev) => {
      if (
        prev.mode === remoteConfig.mode &&
        prev.phaseId === remoteConfig.phaseId &&
        prev.stopOnOpponentAction === remoteConfig.stopOnOpponentAction
      ) return prev;
      return remoteConfig;
    });
  }, [game, userId, isPlayer]);


  useEffect(() => {
    if (!isAutoPassEnabled || !game) return;
    if (hasReachedAutoPassTarget(game, autoPassConfig)) {
      disableAutoPass(true, 'AutoPass reached stop target.');
    }
  }, [isAutoPassEnabled, game, autoPassConfig, userId]);


  useEffect(() => {
    if (!game) return;

    const latestLogIndex = (game.log?.length || 0) - 1;
    const latestLogEntry = latestLogIndex >= 0 ? game.log[latestLogIndex] : null;
    if (!latestLogEntry) return;

    const latestLogKey = getAutoPassLogKey(latestLogEntry, latestLogIndex);

    if (!isAutoPassEnabled) {
      lastSeenAutoPassLogKeyRef.current = latestLogKey;
      return;
    }

    if (lastSeenAutoPassLogKeyRef.current === latestLogKey) return;
    lastSeenAutoPassLogKeyRef.current = latestLogKey;

    console.debug('[AutoPass] processed latest log entry', { key: latestLogKey, type: latestLogEntry.type });

    if (autoPassConfig.stopOnOpponentAction && isMeaningfulOpponentAction(latestLogEntry, userId)) {
      const actionLabel = latestLogEntry.type || 'UNKNOWN';
      disableAutoPass(true, `AutoPass stopped: opponent acted (${actionLabel}).`);
    }
  }, [game?.log, isAutoPassEnabled, userId, autoPassConfig.stopOnOpponentAction]);

  useEffect(() => {
    if (!game || !gameId || !userId || waitingForPlayers || proxyAutoPassInFlightRef.current) return;

    const priorityPlayerId = game.priorityPlayerId;
    if (!priorityPlayerId) return;

    const priorityConfig = getPlayerAutoPassConfig(game, priorityPlayerId);
    if (priorityConfig.mode === AUTO_PASS_MODE.OFF) return;

    const latestLogIndex = (game.log?.length || 0) - 1;
    const latestLogEntry = latestLogIndex >= 0 ? game.log[latestLogIndex] : null;
    const triggerSignature = `${priorityPlayerId}:${game.phase}:${game.turnNumber}:${latestLogIndex}:${latestLogEntry?.playerId || 'na'}:${latestLogEntry?.type || 'na'}`;
    if (lastProxyAutoPassTriggerRef.current === triggerSignature) return;

    const turnStartEvents = [];
    proxyAutoPassInFlightRef.current = true;
    lastProxyAutoPassTriggerRef.current = triggerSignature;

    const gameRef = doc(db, 'games_v3', gameId);
    runTransaction(db, async (transaction) => {
      const snap = await transaction.get(gameRef);
      if (!snap.exists()) return;
      const currentGame = snap.data();

      const currentPriorityPlayerId = currentGame.priorityPlayerId;
      if (!currentPriorityPlayerId) return;

      const currentConfig = getPlayerAutoPassConfig(currentGame, currentPriorityPlayerId);
      if (currentConfig.mode === AUTO_PASS_MODE.OFF) return;

      const actorName = currentGame.players?.find(p => p.id === userId)?.name || displayName || 'Proxy';
      const { game: proxyGame, advances } = runProxyAutoPassAdvances(currentGame, userId, actorName, (event) => turnStartEvents.push(event));
      if (advances === 0) return;

      transaction.update(gameRef, normalizeGameUpdatesForFirestore({
        phase: proxyGame.phase,
        turnNumber: proxyGame.turnNumber,
        activePlayerIndex: proxyGame.activePlayerIndex,
        turnPlayerId: proxyGame.turnPlayerId,
        priorityIndex: proxyGame.priorityIndex,
        priorityPlayerId: proxyGame.priorityPlayerId,
        consecutivePasses: proxyGame.consecutivePasses,
        stack: proxyGame.stack,
        cards: proxyGame.cards,
        combat: proxyGame.combat || getEmptyCombatState(),
        log: proxyGame.log,
        autopass: proxyGame.autopass || {}
      }, 'AUTO_PASS'));
    }).then(async () => {
      if (turnStartEvents.length > 0) {
        await Promise.all(turnStartEvents.map((event) => appendEvent(gameId, event)));
      }
    }).finally(() => {
      proxyAutoPassInFlightRef.current = false;
    });
  }, [game, gameId, userId, waitingForPlayers, displayName]);

  useEffect(() => {
    if (!isAutoPassEnabled || !game || autoPassInFlightRef.current) return;
    if (!canAct || waitingForPlayers || !hasPriority) return;
    if ((game.stack || []).length > 0 || hasReachedAutoPassTarget(game, autoPassConfig)) return;

    const latestLogIndex = (game.log?.length || 0) - 1;
    const latestLogEntry = latestLogIndex >= 0 ? game.log[latestLogIndex] : null;
    const prioritySignature = `${game.phase}:${game.priorityPlayerId}:${(game.stack || []).length}:${latestLogIndex}:${latestLogEntry?.playerId || 'na'}:${latestLogEntry?.type || 'na'}`;
    if (lastAutoPassSignatureRef.current === prioritySignature) return;

    autoPassInFlightRef.current = true;
    lastAutoPassSignatureRef.current = prioritySignature;
    handleAction('PASS_PRIORITY').finally(() => {
      autoPassInFlightRef.current = false;
    });
  }, [isAutoPassEnabled, game, canAct, waitingForPlayers, hasPriority, autoPassConfig, userId]);

  const getImportDeckEntries = () => {
    const entries = [];
    let currentSection = 'deck';
    const rawLines = deckInput.split('\n');
    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      const withoutCommentSlashes = trimmed.replace(/^\/\/\s*/, '').trim();
      const headerKey = withoutCommentSlashes.replace(/:$/, '').trim().toLowerCase();
      if (COMMANDER_SECTION_HEADERS.has(headerKey)) {
        currentSection = 'commander';
        continue;
      }
      if (DECK_SECTION_HEADERS.has(headerKey)) {
        currentSection = 'deck';
        continue;
      }
      if (trimmed.startsWith('//')) continue;

      let count = 1;
      let name = trimmed;
      const match = trimmed.match(/^(\d+)\s+(.+)/);
      if (match) {
        count = parseInt(match[1], 10);
        name = match[2].trim();
      }
      if (name) entries.push({ count, name, isCommander: commanderModeEnabled && currentSection === 'commander' });
    }
    return entries;
  };

  const importDeck = async () => {
    if (isSpectator) {
      setNotification("Spectators can't import decks.");
      setTimeout(() => setNotification(null), 2000);
      return;
    }

    setImporting(true);
    const entries = getImportDeckEntries();
    const importedCards = [];
    const failedImports = [];
    let xOffset = 5, yOffset = 5;
    let importedCount = 0;
    let importedCommanderCount = 0;
    const deckExtraCandidates = [];

    try {
      for (const entry of entries) {
        try {
          const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(entry.name)}`);
          const data = await res.json();
          if (!res.ok || !data?.name) {
            throw new Error(data?.details || `Scryfall could not find ${entry.name}.`);
          }

          deckExtraCandidates.push(...collectDeckExtraCandidatesFromCard(data, data.name || entry.name));

          const hasCardFaces = Array.isArray(data.card_faces);
          const imageUri = getCardImageUri(hasCardFaces ? { ...data, activeFaceIndex: 0 } : data);
          for (let i = 0; i < entry.count; i++) {
            const importedCard = sanitizeScryfallCardForGame(data, {
              instanceId: generateCardId(),
              scryfallId: data.id,
              ...(imageUri ? { image_uri: imageUri } : {}),
              ...(hasCardFaces ? { activeFaceIndex: 0 } : {}),
              ownerId: userId,
              controllerId: userId,
              zone: entry.isCommander ? ZONES.COMMAND : ZONES.LIBRARY,
              tapped: false,
              counters: {},
              tempDamage: 0,
              faceDown: false,
              x: xOffset,
              y: yOffset,
              ...(entry.isCommander ? { isCommander: true, commanderTax: 0, commanderDamage: {} } : {})
            });
            importedCards.push(importedCard);
            importedCount += 1;
            if (entry.isCommander) importedCommanderCount += 1;
            xOffset = (xOffset + 5) % 80;
          }
        } catch (error) {
          console.error("Failed to fetch or parse Scryfall card", entry.name, error);
          failedImports.push(`${entry.name}: ${error?.message || 'unknown error'}`);
        }
        await new Promise(r => setTimeout(r, 50));
      }

      if (importedCards.length > 0) {
        // UPDATED: Path
        const importActorName = myPlayer?.name || displayName || 'Unknown';
        const importedDeckExtras = await resolveDeckExtraTemplates(deckExtraCandidates);
        const importMessage = importedCommanderCount > 0
          ? `${importActorName} imported ${importedCount} cards and moved ${importedCommanderCount} commander card${importedCommanderCount === 1 ? '' : 's'} to the command zone.`
          : `${importActorName} imported ${importedCount} cards into their library.`;
        const extrasMessage = (importedDeckExtras.tokens.length || importedDeckExtras.emblems.length || importedDeckExtras.dungeons.length)
          ? `${importActorName} imported deck extras: ${importedDeckExtras.tokens.length} token${importedDeckExtras.tokens.length === 1 ? '' : 's'}, ${importedDeckExtras.emblems.length} emblem${importedDeckExtras.emblems.length === 1 ? '' : 's'}, ${importedDeckExtras.dungeons.length} dungeon${importedDeckExtras.dungeons.length === 1 ? '' : 's'}.`
          : '';
        await runTransaction(db, async (transaction) => {
          const gameRef = doc(db, 'games_v3', gameId);
          const snap = await transaction.get(gameRef);
          if (!snap.exists()) return;
          const currentGame = snap.data();
          const currentPlayers = currentGame.players || [];
          const currentPlayer = currentPlayers.find((player) => player.id === userId);
          if (!currentPlayer) return;
          const nextPlayers = currentPlayers.map((player) => player.id === userId
            ? { ...player, deckExtras: mergePlayerDeckExtras(getPlayerDeckExtras(player), importedDeckExtras) }
            : player);
          const nextLog = [...(currentGame.log || []), buildGameLogEntry({
            currentGame,
            playerId: userId,
            playerName: importActorName,
            type: 'IMPORT',
            category: 'setup',
            message: importMessage
          })];
          if (extrasMessage) {
            nextLog.push(buildGameLogEntry({
              currentGame,
              playerId: userId,
              playerName: importActorName,
              type: 'IMPORT_EXTRAS',
              category: 'setup',
              message: extrasMessage
            }));
          }
          transaction.update(gameRef, normalizeGameUpdatesForFirestore({
            cards: [...(currentGame.cards || []), ...importedCards],
            players: nextPlayers,
            log: pruneLogForFirestore(nextLog),
            undoStack: appendUndoEntry(currentGame, buildUndoEntry({
              currentGame,
              actorId: userId,
              actorName: importActorName,
              actionLabel: normalizeUndoActionLabel(importMessage, importActorName)
            })),
            updatedAt: serverTimestamp()
          }, 'IMPORT'));
        });
      }

      if (failedImports.length > 0) {
        setNotification(`Some cards could not be imported: ${failedImports.slice(0, 3).join('; ')}${failedImports.length > 3 ? '…' : ''}`);
        setTimeout(() => setNotification(null), 5000);
      }
      if (importedCards.length > 0) setDeckInput('');
    } catch (error) {
      console.error('Deck import failed', error);
      setNotification(`Import failed: ${error?.message || 'unknown error'}`);
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setImporting(false);
    }
  };

  const deleteDeck = async () => {
    if (!game || !userId || isSpectator) return;

    setDeletingDeck(true);
    try {
      const deckZonesToClear = new Set([
        ZONES.LIBRARY,
        ZONES.HAND,
        ZONES.BATTLEFIELD,
        ZONES.GRAVEYARD,
        ZONES.EXILE
      ]);
      const gameRef = doc(db, 'games_v3', gameId);

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(gameRef);
        if (!snap.exists()) return;
        const currentGame = snap.data();
        const currentPlayers = currentGame.players || [];
        const currentPlayer = currentPlayers.find((player) => player.id === userId);
        if (!currentPlayer) return;

        const deckDeleteActorName = currentPlayer.name || myPlayer?.name || displayName || 'Unknown';
        const deckDeleteMessage = `${deckDeleteActorName} deleted their deck.`;
        const playerDeckCards = (currentGame.cards || []).filter(card => card.ownerId === userId && deckZonesToClear.has(card.zone));
        const deckCardIds = new Set(playerDeckCards.map(card => card.instanceId));
        const nextCards = (currentGame.cards || []).filter(card => !deckCardIds.has(card.instanceId));
        const nextReveals = (currentGame.reveals || []).filter(entry => entry.revealerId !== userId && !deckCardIds.has(entry.cardId));

        transaction.update(gameRef, normalizeGameUpdatesForFirestore({
          cards: nextCards,
          reveals: nextReveals,
          log: pruneLogForFirestore([...(currentGame.log || []), buildGameLogEntry({
            currentGame,
            playerId: userId,
            playerName: deckDeleteActorName,
            type: 'DECK_DELETE',
            category: 'setup',
            message: deckDeleteMessage
          })]),
          undoStack: appendUndoEntry(currentGame, buildUndoEntry({
            currentGame,
            actorId: userId,
            actorName: deckDeleteActorName,
            actionLabel: normalizeUndoActionLabel(deckDeleteMessage, deckDeleteActorName)
          })),
          updatedAt: serverTimestamp()
        }, 'DECK_DELETE'));
      });

      setDeleteDeckConfirmOpen(false);
      setDeckInput('');
      setNotification('Deck deleted.');
      setTimeout(() => setNotification(null), 2000);
    } finally {
      setDeletingDeck(false);
    }
  };

  const createToken = () => {
    if (isSpectator) {
      setNotification("Spectators can't create tokens.");
      setTimeout(() => setNotification(null), 2000);
      return;
    }
    setLibraryMenuOpen(false);
    setTokenModal(getDefaultCustomToken());
    maybeCompleteTutorialStep('custom_token_note');
  };

  const submitTokenPreset = async (preset) => {
    if (!preset) return;
    await handleAction('CREATE_TOKEN', preset);
    setTokenModal(null);
  };

  const submitDeckTokenTemplate = async (template) => {
    const tokenTemplate = sanitizeDeckExtraTemplate(template, 'tokens');
    if (!tokenTemplate) return;
    await handleAction('CREATE_TOKEN', {
      name: tokenTemplate.name,
      colorIdentity: tokenTemplate.colorIdentity,
      color: getTokenColorLabel(tokenTemplate.colorIdentity),
      typeLine: tokenTemplate.typeLine,
      power: tokenTemplate.power || '',
      toughness: tokenTemplate.toughness || '',
      rulesText: tokenTemplate.oracleText || '',
      imageUrl: tokenTemplate.imageUrl,
      quantity: 1,
      tapped: false
    });
    setTokenModal(null);
  };

  const addEmblemFromDeckTemplate = (targetPlayerId, template) => {
    const emblemTemplate = sanitizeDeckExtraTemplate(template, 'emblems');
    if (!emblemTemplate || !targetPlayerId) return;
    handleAction('ADD_PLAYER_EMBLEM', {
      targetPlayerId,
      name: emblemTemplate.name,
      text: emblemTemplate.oracleText || 'Deck-derived emblem reference.',
      sourceName: (emblemTemplate.sourceCards || []).join(', ')
    });
  };

  const submitCustomToken = async () => {
    if (!tokenModal) return;
    const quantity = clamp(Number.parseInt(tokenModal.quantity, 10) || 1, 1, 99);
    const typeLine = tokenModal.typeLine?.trim() || 'Token';
    const isCreature = isCreatureTypeLine(typeLine);
    await handleAction('CREATE_TOKEN', {
      name: tokenModal.name?.trim() || 'Token',
      colorIdentity: normalizeTokenColorIdentity(tokenModal.colorIdentity, tokenModal.color),
      color: getTokenColorLabel(tokenModal.colorIdentity, tokenModal.color),
      typeLine,
      power: isCreature ? (tokenModal.power?.toString() || '1') : '',
      toughness: isCreature ? (tokenModal.toughness?.toString() || '1') : '',
      rulesText: tokenModal.rulesText || '',
      quantity,
      tapped: Boolean(tokenModal.tapped)
    });
    setTokenModal(null);
  };

  const addCustomCounter = () => {
    if (isSpectator) {
      setNotification("Spectators can't modify counters.");
      setTimeout(() => setNotification(null), 2000);
      return;
    }
    if(!selectedCard) return;
    setCustomCounterModal({ cardId: selectedCard.instanceId, label: 'default', amount: 1 });
    setSelectedCard(null);
  };

  const toggleTarget = (card) => {
    if (isSpectator || !targetingState) return;
    const newSelected = [...targetingState.selectedIds];
    const idx = newSelected.indexOf(card.instanceId);
    if (idx >= 0) newSelected.splice(idx, 1);
    else newSelected.push(card.instanceId);
    setTargetingState({ ...targetingState, selectedIds: newSelected });
  };

  const toggleTargetPlayer = (pid) => {
    if (isSpectator || !targetingState) return;
    const pidStr = getPlayerTargetId(pid);
    const newSelected = [...targetingState.selectedIds];
    const idx = newSelected.indexOf(pidStr);
    if (idx >= 0) newSelected.splice(idx, 1);
    else newSelected.push(pidStr);
    setTargetingState({ ...targetingState, selectedIds: newSelected });
  };

  const selectAttachmentTarget = async (targetCard) => {
    if (!canAct || !attachmentState?.source || !targetCard) return;
    if (targetCard.instanceId === attachmentState.source.instanceId) {
      setNotification("A card can't be attached to itself.");
      setTimeout(() => setNotification(null), 2000);
      return;
    }
    await handleAction('ATTACH_CARD', { cardId: attachmentState.source.instanceId, targetType: 'card', targetId: targetCard.instanceId });
    setAttachmentState(null);
  };

  const handleBattlefieldCardTap = (card, fallback) => {
    if (attachmentState) {
      selectAttachmentTarget(card);
      return;
    }
    if (targetingState) {
      toggleTarget(card);
      return;
    }
    fallback(card);
  };

  const attachToPlayer = async (playerId) => {
    if (!attachmentPlayerPickerCard || !canAct) return;
    await handleAction('ATTACH_CARD', { cardId: attachmentPlayerPickerCard.instanceId, targetType: 'player', targetId: playerId });
    setAttachmentPlayerPickerCard(null);
  };

  const setAttackTarget = async (cardId, attackTarget) => {
    if (!canAct || !game || game.phase !== 'combat_attackers') return;
    await handleAction('SET_ATTACK_TARGET', { cardId, attackTarget });
  };

  const toggleBlockTarget = async (cardId, attackerId) => {
    if (!canAct || !game || game.phase !== 'combat_blockers') return;
    await handleAction('TOGGLE_BLOCK_TARGET', { cardId, attackerId });
  };

  const finishTargeting = async () => {
    if (isSpectator || !targetingState || !game) return;
    const { source, mode, selectedIds } = targetingState;

    const cardTargets = selectedIds.filter(id => !id.startsWith('player:'));
    const playerTargets = selectedIds.filter(id => id.startsWith('player:')).map(id => id.replace('player:', ''));

    if (mode === 'CAST') {
      await handleAction('CAST_SPELL', { cardId: source.instanceId, targetIds: cardTargets, targetPlayerIds: playerTargets });
    } else if (mode === 'ABILITY') {
      await handleAction('ACTIVATE_ABILITY', { sourceId: source.instanceId, targetIds: cardTargets, targetPlayerIds: playerTargets });
    } else if (mode === 'MANUAL') {
      const newEntries = selectedIds.map(tid => ({
        id: generateCardId(),
        sourceId: source.instanceId,
        targetId: tid,
        controllerId: userId,
        timestamp: Date.now()
      }));

      if (newEntries.length > 0) {
        // UPDATED: Path
        const gameRef = doc(db, 'games_v3', gameId);
        await updateDoc(gameRef, {
          targets: arrayUnion(...newEntries),
          log: arrayUnion(buildGameLogEntry({
            currentGame: game,
            playerId: userId,
            playerName: myPlayer?.name || 'Unknown',
            type: 'TARGET',
            category: 'target',
            message: `${myPlayer?.name || 'Unknown'} chose ${selectedIds.map((targetId) => getPublicTargetDisplayName(targetId, game, allBattlefieldDisplayNames, 'a target')).join(', ')} as target${selectedIds.length === 1 ? '' : 's'} for ${getSafeCardName(source)}.`,
            cardId: source.instanceId,
            cardName: getSafeCardName(source),
            targetNames: selectedIds.map((targetId) => getPublicTargetDisplayName(targetId, game, allBattlefieldDisplayNames, 'a target')),
            targetCount: selectedIds.length
          }))
        });
      }
    }
    setTargetingState(null);
  };

  const clearTargets = async (card) => {
    if (isSpectator) {
      setNotification("Spectators can't modify targets.");
      setTimeout(() => setNotification(null), 2000);
      return;
    }
    if (!game.targets) return;
    const newTargets = game.targets.filter(t => !((t.sourceId === card.instanceId || t.targetId === card.instanceId) && t.controllerId === userId));

    if (newTargets.length !== game.targets.length) {
      // UPDATED: Path
      await updateDoc(doc(db, 'games_v3', gameId), {
        targets: newTargets,
        log: arrayUnion(buildGameLogEntry({
          currentGame: game,
          playerId: userId,
          playerName: myPlayer?.name || 'Unknown',
          type: 'CLEAR_TARGETS',
          category: 'target',
          message: `${myPlayer?.name || 'Unknown'} cleared targets from ${getSafeCardName(card)}.`,
          cardId: card.instanceId,
          cardName: getSafeCardName(card)
        }))
      });
    }
    setSelectedCard(null);
  };

  // Reorder Logic
  const startReorderTop = (targetId = userId) => {
    if (isSpectator) {
      setNotification("Spectators can't reorder libraries.");
      setTimeout(() => setNotification(null), 2000);
      return;
    }
    setLibraryMenuOpen(false);
    if (!game) return;
    const lib = game.cards.filter(c => c.ownerId === targetId && c.zone === ZONES.LIBRARY);
    if (lib.length < 2) {
      setNotification("Not enough cards in library to reorder.");
      setTimeout(() => setNotification(null), 2000);
      return;
    }
    const defaultN = Math.min(2, lib.length);
    const topCards = lib.slice(0, defaultN);
    setReorderModal({ ownerId: targetId, n: defaultN, orderedIds: topCards.map(c => c.instanceId) });
    setNotification(`Reorder opened (${defaultN})`);
    setTimeout(() => setNotification(null), 2000);
  };

  const changeReorderCount = (delta) => {
    if (!reorderModal || !game) return;
    const lib = game.cards.filter(c => c.ownerId === reorderModal.ownerId && c.zone === ZONES.LIBRARY);
    const newN = Math.max(2, Math.min(10, reorderModal.n + delta, lib.length));

    if (newN === reorderModal.n) return;
    const topCards = lib.slice(0, newN);
    setReorderModal({ ...reorderModal, n: newN, orderedIds: topCards.map(c => c.instanceId) });
  };

  const moveReorderItem = (index, direction) => {
    if (!reorderModal) return;
    const newIds = [...reorderModal.orderedIds];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newIds.length) return;
    [newIds[index], newIds[newIndex]] = [newIds[newIndex], newIds[index]];
    setReorderModal({ ...reorderModal, orderedIds: newIds });
  };

  const submitReorder = async () => {
    if (!reorderModal) return;
    await handleAction('REORDER_TOP_LIBRARY', { ownerId: reorderModal.ownerId, orderedTopIds: reorderModal.orderedIds });
    setReorderModal(null);
  };


  const getLibraryBatchAmount = () => clamp(Number.parseInt(libraryBatchCount, 10) || 1, 1, 99);

  const runLibraryBatchAction = (actionType) => {
    const n = getLibraryBatchAmount();
    if (actionType === 'BATCH_SCRY_LIBRARY' || actionType === 'BATCH_SURVEIL_LIBRARY') {
      const lib = (game?.cards || []).filter(c => c.ownerId === userId && c.zone === ZONES.LIBRARY);
      const topCards = lib.slice(0, Math.min(n, lib.length));
      if (topCards.length === 0) {
        setNotification('No cards left in library.');
        setTimeout(() => setNotification(null), 2000);
        return;
      }
      setLibraryReviewModal({
        mode: actionType === 'BATCH_SURVEIL_LIBRARY' ? 'surveil' : 'scry',
        ownerId: userId,
        n: topCards.length,
        allIds: topCards.map(c => c.instanceId),
        orderedIds: topCards.map(c => c.instanceId),
        movedIds: []
      });
      setLibraryBatchOpen(false);
      setLibraryMenuOpen(false);
      return;
    }
    recordPerfActionClick({ actionType, buttonName: 'Library Batch', currentGame: game });
    handleAction(actionType, { n });
    setLibraryBatchOpen(false);
    setLibraryMenuOpen(false);
  };

  const toggleLibraryReviewDestination = (cardId) => {
    if (!libraryReviewModal) return;
    const moved = new Set(libraryReviewModal.movedIds || []);
    const currentlyMoved = moved.has(cardId);
    if (currentlyMoved) moved.delete(cardId);
    else moved.add(cardId);
    const movedIds = (libraryReviewModal.allIds || []).filter(id => moved.has(id));
    const currentOrdered = libraryReviewModal.orderedIds.filter(id => !moved.has(id));
    const orderedIds = currentlyMoved && !currentOrdered.includes(cardId) ? [...currentOrdered, cardId] : currentOrdered;
    setLibraryReviewModal({
      ...libraryReviewModal,
      movedIds,
      orderedIds
    });
  };

  const moveLibraryReviewItem = (index, direction) => {
    if (!libraryReviewModal) return;
    const newIds = [...libraryReviewModal.orderedIds];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newIds.length) return;
    [newIds[index], newIds[newIndex]] = [newIds[newIndex], newIds[index]];
    setLibraryReviewModal({ ...libraryReviewModal, orderedIds: newIds });
  };

  const submitLibraryReview = async () => {
    if (!libraryReviewModal) return;
    const actionType = libraryReviewModal.mode === 'surveil' ? 'BATCH_SURVEIL_LIBRARY' : 'BATCH_SCRY_LIBRARY';
    await handleAction(actionType, {
      n: libraryReviewModal.n,
      ownerId: libraryReviewModal.ownerId,
      keptTopIds: libraryReviewModal.orderedIds,
      movedIds: libraryReviewModal.movedIds || []
    });
    setLibraryReviewModal(null);
  };

  useEffect(() => {
    if (!zoomedCard) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeZoomedCard();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeZoomedCard, zoomedCard]);

  const openStackItemDetail = (item) => {
    if (!item) return;
    setSelectedStackItemId(item.id || item.sourceId || null);
    setStackDetailOpen(true);
  };

  const closeStackDetail = () => {
    setStackDetailOpen(false);
    setSelectedStackItemId(null);
  };

  const viewStackItemCard = (item) => {
    const card = game.cards.find(c => c.instanceId === item.sourceId);
    if (card && getCardImageUri(card)) {
      setZoomedCard(card);
    } else if (item.cardImage) {
      setZoomedCard({ name: item.name, image_uri: item.cardImage });
    } else {
      setNotification("No image available for this stack item.");
      setTimeout(() => setNotification(null), 2000);
    }
  };

  const gameCards = game?.cards || [];
  // FIX: Add defaults (|| []) to prevent crashes on initial sync
  const myHand = gameCards.filter(c => c.controllerId === viewAsPlayerId && c.zone === ZONES.HAND);
  const myBattlefield = gameCards.filter(c => c.controllerId === viewAsPlayerId && c.zone === ZONES.BATTLEFIELD);
  const oppBattlefield = gameCards.filter(c => c.controllerId !== viewAsPlayerId && c.zone === ZONES.BATTLEFIELD);
  const oppHand = gameCards.filter(c => c.controllerId !== viewAsPlayerId && c.zone === ZONES.HAND);
  const privatePeekHandCards = privateHandPeek?.playerId
    ? gameCards.filter(c => c.controllerId === privateHandPeek.playerId && c.zone === ZONES.HAND)
    : [];

  useEffect(() => {
    if (!privateHandPeek) return;
    if (!canAct || !game?.players?.some(p => p.id === privateHandPeek.playerId && p.id !== userId)) {
      setPrivatePeekInspectCard(null);
      setPrivateHandPeek(null);
    }
  }, [privateHandPeek, canAct, game?.players, userId]);


  useLayoutEffect(() => {
    const element = opponentBattlefieldRef.current;
    if (!element) return undefined;

    let rafId = null;
    const updateOpponentBattlefieldSize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect?.();
        const width = rect?.width;
        const height = rect?.height;
        if (Number.isFinite(width) && width > 0) {
          setOpponentBattlefieldSizePx(prev => {
            const next = {
              width: Math.round(width),
              height: Number.isFinite(height) && height > 0 ? Math.round(height) : prev.height
            };
            return prev.width === next.width && prev.height === next.height ? prev : next;
          });
        }
      });
    };

    updateOpponentBattlefieldSize();

    const eventOptions = { passive: true };
    window.addEventListener('resize', updateOpponentBattlefieldSize, eventOptions);
    window.addEventListener('orientationchange', updateOpponentBattlefieldSize, eventOptions);
    window.visualViewport?.addEventListener('resize', updateOpponentBattlefieldSize, eventOptions);

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateOpponentBattlefieldSize);
      observer.observe(element);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateOpponentBattlefieldSize);
      window.removeEventListener('orientationchange', updateOpponentBattlefieldSize);
      window.visualViewport?.removeEventListener('resize', updateOpponentBattlefieldSize);
      observer?.disconnect();
    };
  }, [gameId, viewAsPlayerId, oppBattlefield.length]);

  const myBattlefieldLandCount = myBattlefield.filter(isLandCard).length;
  const myBattlefieldNonlandCount = myBattlefield.length - myBattlefieldLandCount;
  const oppBattlefieldLandCount = oppBattlefield.filter(isLandCard).length;
  const oppBattlefieldNonlandCount = oppBattlefield.length - oppBattlefieldLandCount;
  const myBattlefieldLayout = useMemo(() => computeAutoBattlefieldLayout({
    cards: myBattlefield,
    controllerId: viewAsPlayerId,
    containerWidth: myBattlefieldSizePx.width,
    isMobile: battlefieldViewport.width <= 900,
    debugLabel: 'MY_BATTLEFIELD_AUTO_LAYOUT',
    battlefieldType: 'own'
  }), [myBattlefield, viewAsPlayerId, myBattlefieldSizePx.width, battlefieldViewport.width]);
  const opponentBattlefieldLayout = useMemo(() => computeAutoBattlefieldLayout({
    cards: oppBattlefield,
    controllerId: opponent?.id || null,
    containerWidth: opponentBattlefieldSizePx.width,
    isMobile: battlefieldViewport.width <= 900,
    debugLabel: 'OPPONENT_BATTLEFIELD_AUTO_LAYOUT',
    battlefieldType: 'opponent'
  }), [oppBattlefield, opponent?.id, opponentBattlefieldSizePx.width, battlefieldViewport.width]);
  const myBattlefieldMinHeightPx = myBattlefieldLayout.battlefieldHeightPx;
  const opponentBattlefieldMinHeightPx = opponentBattlefieldLayout.battlefieldHeightPx;

  useEffect(() => {
    console.log('[BATTLEFIELD_PANEL_SIZE]', {
      battlefieldWidthPx: myBattlefieldLayout.battlefieldWidth,
      battlefieldWidth: myBattlefieldLayout.battlefieldWidth,
      battlefieldHeightPx: myBattlefieldLayout.battlefieldHeightPx,
      landCount: myBattlefieldLandCount,
      nonlandCount: myBattlefieldNonlandCount,
      landRows: myBattlefieldLayout.landRows,
      nonlandRows: myBattlefieldLayout.nonlandRows,
      columns: myBattlefieldLayout.columns,
      orientation: battlefieldViewport.width <= battlefieldViewport.height ? 'portrait' : 'landscape',
      windowWidth: battlefieldViewport.width,
      measuredPanelWidth: myBattlefieldSizePx.width,
      measuredBattlefieldPositioningLayerWidth: myBattlefieldSizePx.width,
      actualCardWidthPx: myBattlefieldLayout.cardWidthPx,
      cardWidthPx: myBattlefieldLayout.cardWidthPx,
      gapPx: myBattlefieldLayout.gapPx,
      sidePaddingPx: myBattlefieldLayout.sidePaddingPx,
      availableWidth: Number(myBattlefieldLayout.availableWidth?.toFixed?.(1) ?? 0),
      calculatedMaxColumns: myBattlefieldLayout.calculatedMaxColumns,
      chosenColumnCount: myBattlefieldLayout.columns,
      rowWidth: Number(myBattlefieldLayout.rowWidth?.toFixed?.(1) ?? 0),
      startX: Number(myBattlefieldLayout.startX?.toFixed?.(1) ?? 0),
      usableLeftPx: Number(myBattlefieldLayout.usableLeftPx?.toFixed?.(1) ?? 0),
      usableRightPx: Number(myBattlefieldLayout.usableRightPx?.toFixed?.(1) ?? 0),
      columnCentersPx: myBattlefieldLayout.columnCentersPx.map(centerX => Number(centerX.toFixed(1)))
    });
  }, [myBattlefieldLandCount, myBattlefieldNonlandCount, myBattlefieldLayout, battlefieldViewport, myBattlefieldSizePx]);


  useEffect(() => {
    console.log('[OPPONENT_BATTLEFIELD_PANEL_SIZE]', {
      opponentPanelMeasuredWidth: opponentBattlefieldLayout.battlefieldWidth,
      measuredOpponentBattlefieldPositioningLayerWidth: opponentBattlefieldSizePx.width,
      opponentBattlefieldHeightPx: opponentBattlefieldLayout.battlefieldHeightPx,
      landCount: oppBattlefieldLandCount,
      nonlandCount: oppBattlefieldNonlandCount,
      landRows: opponentBattlefieldLayout.landRows,
      nonlandRows: opponentBattlefieldLayout.nonlandRows,
      chosenColumns: opponentBattlefieldLayout.columns,
      cardWidthPx: opponentBattlefieldLayout.cardWidthPx,
      columnCentersPx: opponentBattlefieldLayout.columnCentersPx.map(centerX => Number(centerX.toFixed(1))),
      orientation: battlefieldViewport.width <= battlefieldViewport.height ? 'portrait' : 'landscape',
      windowWidthFallback: battlefieldViewport.width,
      gapPx: opponentBattlefieldLayout.gapPx,
      sidePaddingPx: opponentBattlefieldLayout.sidePaddingPx,
      availableWidth: Number(opponentBattlefieldLayout.availableWidth?.toFixed?.(1) ?? 0),
      calculatedMaxColumns: opponentBattlefieldLayout.calculatedMaxColumns,
      rowWidth: Number(opponentBattlefieldLayout.rowWidth?.toFixed?.(1) ?? 0),
      startX: Number(opponentBattlefieldLayout.startX?.toFixed?.(1) ?? 0)
    });
  }, [oppBattlefieldLandCount, oppBattlefieldNonlandCount, opponentBattlefieldLayout, battlefieldViewport, opponentBattlefieldSizePx]);

  useEffect(() => {
    if (!gameId || !game?.cards?.length) return;

    let changed = false;
    const nextCards = game.cards.map((card) => {
      if (card.zone !== ZONES.BATTLEFIELD || card.controllerId !== viewAsPlayerId) return card;
      if (Number.isFinite(card.nx) && Number.isFinite(card.ny)) return card;
      if (!Number.isFinite(card.x) || !Number.isFinite(card.y)) return card;

      const normalized = getNormalizedFromLegacyPosition(card.x, card.y);
      if (!normalized) return card;
      changed = true;
      return { ...card, nx: Number(normalized.nx.toFixed(4)), ny: Number(normalized.ny.toFixed(4)) };
    });

    if (!changed) return;
    updateDoc(doc(db, 'games_v3', gameId), normalizeGameUpdatesForFirestore({ cards: nextCards }, 'NORMALIZE_LEGACY_POSITION'));
  }, [gameId, game?.cards, viewAsPlayerId]);

  useEffect(() => {
    if (!gameId || !game?.cards?.length || draggingCard) return;

    const autoBattlefieldIds = new Set(
      myBattlefield
        .filter(card => getCardPositionMode(card) === BATTLEFIELD_POSITION_MODE_AUTO)
        .map(card => card.instanceId)
    );
    if (autoBattlefieldIds.size === 0) return;

    let changed = false;
    const nextCards = game.cards.map((card) => {
      if (!autoBattlefieldIds.has(card.instanceId)) return card;
      const position = myBattlefieldLayout.tidyPositions.get(card.instanceId);
      if (!position) return card;
      const nextPosition = getBattlefieldPositionCoordinates(position, BATTLEFIELD_POSITION_MODE_AUTO);
      const nextCard = { ...card, ...nextPosition };
      const positionChanged = card.positionMode !== BATTLEFIELD_POSITION_MODE_AUTO
        || card.nx !== nextCard.nx
        || card.ny !== nextCard.ny
        || card.x !== nextCard.x
        || card.y !== nextCard.y
        || card.positionBasisWidthPx !== nextCard.positionBasisWidthPx
        || card.positionBasisHeightPx !== nextCard.positionBasisHeightPx;
      if (positionChanged) changed = true;
      return positionChanged ? nextCard : card;
    });

    if (!changed) return;
    console.log('[BATTLEFIELD_AUTO_LAYOUT_RESIZE_APPLY]', {
      orientation: battlefieldViewport.width <= battlefieldViewport.height ? 'portrait' : 'landscape',
      windowWidth: battlefieldViewport.width,
      measuredBattlefieldWidth: myBattlefieldLayout.battlefieldWidth,
      battlefieldWidthPx: myBattlefieldLayout.battlefieldWidth,
      actualCardWidthPx: myBattlefieldLayout.cardWidthPx,
      cardWidthPx: myBattlefieldLayout.cardWidthPx,
      gapPx: myBattlefieldLayout.gapPx,
      sidePaddingPx: myBattlefieldLayout.sidePaddingPx,
      availableWidth: Number(myBattlefieldLayout.availableWidth?.toFixed?.(1) ?? 0),
      calculatedMaxColumns: myBattlefieldLayout.calculatedMaxColumns,
      chosenColumnCount: myBattlefieldLayout.columns,
      rowWidth: Number(myBattlefieldLayout.rowWidth?.toFixed?.(1) ?? 0),
      startX: Number(myBattlefieldLayout.startX?.toFixed?.(1) ?? 0),
      autoCardCount: autoBattlefieldIds.size
    });
    updateDoc(doc(db, 'games_v3', gameId), normalizeGameUpdatesForFirestore({ cards: nextCards }, 'AUTO_LAYOUT_RESIZE'));
  }, [gameId, game?.cards, myBattlefield, myBattlefieldLayout, battlefieldViewport.width, battlefieldViewport.height, draggingCard]);

  const buildSectionDisplayNameMap = (cards) => buildDuplicateDisplayNameMap(cards);

  const myBattlefieldDisplayNames = useMemo(() => buildSectionDisplayNameMap(myBattlefield), [myBattlefield]);
  const oppBattlefieldDisplayNames = useMemo(() => buildSectionDisplayNameMap(oppBattlefield), [oppBattlefield]);
  const allBattlefieldDisplayNames = useMemo(() => new Map([
    ...oppBattlefieldDisplayNames.entries(),
    ...myBattlefieldDisplayNames.entries()
  ]), [oppBattlefieldDisplayNames, myBattlefieldDisplayNames]);

  const getDisplayCardName = (cardOrId) => {
    const card = typeof cardOrId === 'string' ? cardsMap.get(cardOrId) : cardOrId;
    if (!card) return 'Unknown';
    return allBattlefieldDisplayNames.get(card.instanceId) || getCardDisplayName(card, 'Unknown');
  };

  const getTargetInfoFor = (cardOrStackItem) => getCardTargetInfo(cardOrStackItem, game, allBattlefieldDisplayNames);
  const getTargetInfoRows = (targetInfo) => {
    const rows = [];
    if (targetInfo?.targetDisplayNames?.length) {
      rows.push({ label: targetInfo.targetDisplayNames.length === 1 ? 'Targeting' : 'Targeting', values: targetInfo.targetDisplayNames });
    }
    if (targetInfo?.targetedByDisplayNames?.length) {
      rows.push({ label: 'Targeted by', values: targetInfo.targetedByDisplayNames });
    }
    return rows;
  };

  if (loading) return <div className="text-white p-10 flex justify-center"><RotateCw className="animate-spin"/></div>;
  if (!game) return <div className="text-white p-10">Game not found</div>;

  const opponentIsRevealing = players.find(p => p?.id !== viewAsPlayerId)?.handRevealed;

  const getZoneCount = (pid, zone) => (game.cards || []).filter(c => c.ownerId === pid && c.zone === zone).length;
  const myGYCount = getZoneCount(viewAsPlayerId, ZONES.GRAVEYARD);
  const myExileCount = getZoneCount(viewAsPlayerId, ZONES.EXILE);
  const myCommandCount = getZoneCount(viewAsPlayerId, ZONES.COMMAND);
  const myLibraryCount = isPlayer ? getZoneCount(userId, ZONES.LIBRARY) : 0;
  const canDrawFromLibrary = canAct && myLibraryCount > 0;
  const tutorialHasOpenPanel = Boolean(libraryMenuOpen || diceMenuOpen || libraryBatchOpen || selectedCard || zoomedCard || viewZone || searchLibraryOwner || deckInput || deleteDeckConfirmOpen || scryCard || peekCard || privateHandPeek || privatePeekInspectCard || tokenModal || playerStatsOpen || commanderDamageSummaryPlayerId || stackDetailOpen || timeControlsOpen || undoConfirmOpen || repairGameSizeBusy || customCounterModal || damageModal || revealsOpen);
  const latestUndoEntry = latestDisplayedUndoEntry;
  const undoButtonDisabled = !canOpenUndoModal;
  const undoConfirmDisabled = !canUndoLatestAction;
  const undoPendingLabel = 'Undo available after sync…';
  const handleDrawCard = async () => { recordPerfActionClick({ actionType: 'DRAW_CARD', buttonName: 'Draw', currentGame: game }); await handleAction('DRAW_CARD'); await maybeCompleteTutorialStep('draw_card'); };
  const addCardReminder = (cardId, reminder) => handleAction('ADD_CARD_REMINDER', { cardId, ...reminder });
  const addPlayerReminder = (playerId, reminder) => handleAction('ADD_PLAYER_REMINDER', { targetPlayerId: playerId, ...reminder });
  const clearCleanupReminders = () => handleAction('CLEAR_CLEANUP_REMINDERS');
  const hasDeckLoaded = [
    ZONES.LIBRARY,
    ZONES.HAND,
    ZONES.BATTLEFIELD,
    ZONES.GRAVEYARD,
    ZONES.EXILE,
    ZONES.COMMAND
  ].some(zone => getZoneCount(viewAsPlayerId, zone) > 0);
  const noDeckLoaded = !hasDeckLoaded;
  const stackCards = game.stack || [];
  const cardsMap = new Map((game.cards || []).map(c => [c.instanceId, c]));
  const getAttachmentInfo = (cardOrId) => {
    const card = typeof cardOrId === 'string' ? cardsMap.get(cardOrId) : cardOrId;
    const liveCard = card?.instanceId ? (cardsMap.get(card.instanceId) || card) : card;
    const attachment = normalizeAttachment(liveCard);
    const attachedCards = getCardsAttachedTo(game.cards || [], liveCard?.instanceId);
    let attachedToLabel = null;
    let attachedToType = attachment?.type || null;
    if (attachment?.type === 'card') attachedToLabel = getDisplayCardName(attachment.id);
    if (attachment?.type === 'player') attachedToLabel = getPlayerNameById(game, attachment.id, 'Player');
    return { attachment, attachedToType, attachedToLabel, attachedCards };
  };
  const getAttachmentBadgeLabel = (card) => {
    const info = getAttachmentInfo(card);
    if (info.attachedToType === 'player') return `On ${info.attachedToLabel}`;
    if (info.attachedToType === 'card') return 'Attached';
    return null;
  };
  const getAttachedCount = (card) => getAttachmentInfo(card).attachedCards.length;
  const getPlayerAttachmentCount = (playerId) => getCardsAttachedToPlayer(game.cards || [], playerId).length;
  const getSafePublicCardName = (card, fallback = 'a card') => {
    if (!card) return fallback;
    if (card.faceDown) return 'a face-down card';
    if (!isPublicZone(card.zone)) return fallback;
    return getCardDisplayName(card, fallback);
  };
  const getStackItemSourceCard = (item) => cardsMap.get(item?.sourceId) || null;
  const getStackItemName = (item) => {
    const trimmedName = (item?.name || '').trim();
    if (trimmedName) return trimmedName;
    return getSafePublicCardName(getStackItemSourceCard(item), 'Unknown stack item');
  };
  const getStackItemTypeLabel = (item) => {
    const rawType = (item?.itemType || item?.type || '').toString().toUpperCase();
    if (rawType.includes('ABILITY')) return 'Ability';
    if (rawType.includes('SPELL')) return 'Spell';
    const sourceCard = getStackItemSourceCard(item);
    const sourceTypeLine = item?.typeLine || (isPublicZone(sourceCard?.zone) ? getCardTypeLine(sourceCard) : '') || '';
    if (sourceTypeLine) return sourceTypeLine.toLowerCase().includes('ability') ? 'Ability' : 'Spell';
    return null;
  };
  const getStackItemTypeLine = (item) => {
    const sourceCard = getStackItemSourceCard(item);
    const typeLine = (item?.typeLine || (isPublicZone(sourceCard?.zone) ? getCardTypeLine(sourceCard) : '') || '').trim();
    return typeLine || null;
  };
  const getStackTargetDisplayNames = (item) => getCardTargetInfo(item, game, allBattlefieldDisplayNames).targetDisplayNames;
  const priorityHolderName = getPlayerNameById(game, game.priorityPlayerId, 'Unknown');
  const priorityPassCount = Math.max(0, Math.min(game.consecutivePasses || 0, (game.players || []).length));
  const passedPriorityPlayers = (game.players || []).length > 1 && priorityPassCount > 0
    ? Array.from({ length: priorityPassCount }, (_, offset) => {
        const index = (((game.priorityIndex || 0) - offset - 1) % players.length + players.length) % players.length;
        return players[index];
      }).filter(Boolean)
    : [];
  const waitingPriorityPlayers = game.priorityPlayerId
    ? (game.players || []).filter((player) => player.id === game.priorityPlayerId)
    : [];
  const stackDetailItems = [...stackCards].reverse().map((item, index) => ({
    item,
    name: getStackItemName(item),
    casterName: getPlayerNameById(game, item?.controllerId, 'Unknown'),
    typeLabel: getStackItemTypeLabel(item),
    typeLine: getStackItemTypeLine(item),
    targets: getStackTargetDisplayNames(item),
    isCopy: Boolean(item?.isCopy),
    isTop: index === 0,
    stackPosition: stackCards.length - index
  }));
  const selectedStackDetailItem = selectedStackItemId
    ? stackDetailItems.find(({ item }) => item?.id === selectedStackItemId || item?.sourceId === selectedStackItemId)
    : null;
  const waitingPriorityText = waitingPriorityPlayers.length > 0
    ? waitingPriorityPlayers.map((player) => player.name || 'Player').join(', ')
    : priorityHolderName;
  const activeTurnPlayer = (game.players || []).find((player) => player.id === game.turnPlayerId) || game.players?.[game.activePlayerIndex] || null;
  const currentPhase = PHASES.find((phase) => phase.id === game.phase) || { id: game.phase, label: getPhaseLabel(game.phase) };
  const combat = normalizeCombatState(game.combat);
  const currentCombatDamageStep = getCombatDamageStep(combat);
  const currentCombatDamageStepLabel = getCombatDamageStepLabel(currentCombatDamageStep);
  const confirmTimeControl = (message) => (typeof window === 'undefined' ? true : window.confirm(message));
  const handleSetManualStep = (phaseId) => {
    const targetPhase = PHASES.find((phase) => phase.id === phaseId);
    if (!targetPhase) return;
    const currentIndex = PHASES.findIndex((phase) => phase.id === game.phase);
    const targetIndex = PHASES.findIndex((phase) => phase.id === phaseId);
    const isFarJump = currentIndex >= 0 && targetIndex >= 0 && Math.abs(targetIndex - currentIndex) > 1;
    if (isFarJump && !confirmTimeControl(`Set step to ${targetPhase.label}?`)) return;
    handleAction('MANUAL_SET_STEP', { phaseId });
  };
  const handleSetCombatDamageStep = (combatDamageStep) => handleAction('SET_COMBAT_DAMAGE_STEP', { combatDamageStep });
  const handleStartExtraCombat = () => handleAction('START_EXTRA_COMBAT');
  const handleGoExtraMain = () => handleAction('GO_EXTRA_MAIN');
  const handleStartExtraTurn = (playerId) => {
    const targetPlayer = (game.players || []).find((player) => player.id === playerId);
    if (!targetPlayer) return;
    if (!confirmTimeControl(`Start extra turn for ${targetPlayer.name || 'Player'}?`)) return;
    handleAction('START_EXTRA_TURN', { playerId });
  };
  const handleSetActivePlayer = (playerId) => {
    const targetPlayer = (game.players || []).find((player) => player.id === playerId);
    if (!targetPlayer) return;
    if (targetPlayer.id !== game.turnPlayerId && !confirmTimeControl(`Set active player to ${targetPlayer.name || 'Player'}?`)) return;
    handleAction('SET_ACTIVE_PLAYER', { playerId });
  };
  const getLiveCard = (cardOrId) => {
    const card = typeof cardOrId === 'string' ? cardsMap.get(cardOrId) : cardOrId;
    return card?.instanceId ? (cardsMap.get(card.instanceId) || card) : card;
  };
  const getCardMarkedDamage = (cardOrId) => Math.max(0, getLiveCard(cardOrId)?.tempDamage || 0);
  const combatAttackers = combat.attackers || {};
  const combatBlockers = combat.blockers || {};
  const attackingCards = Object.keys(combatAttackers)
    .map((id) => cardsMap.get(id))
    .filter((c) => c && c.zone === ZONES.BATTLEFIELD);
  const validBlockerCandidates = myBattlefield.filter((c) => getCardTypeLine(c).toLowerCase().includes('creature'));
  const validBlockTargetAttackers = attackingCards.filter((c) => c.controllerId !== viewAsPlayerId);
  const activeAttackers = validBlockTargetAttackers;
  const getCombatDisplayCardName = (cardOrId) => getCombatDisplayName(cardOrId, game, allBattlefieldDisplayNames);
  const getAttackTargetLabel = (attackTarget, attackerCard = null) => getCombatAttackTargetName(attackTarget, game, allBattlefieldDisplayNames, attackerCard);
  const getCardAttackTargetLabel = (cardId) => {
    if (!Object.prototype.hasOwnProperty.call(combatAttackers, cardId)) return null;
    return getAttackTargetLabel(combatAttackers[cardId], cardsMap.get(cardId));
  };
  const getRenderedCardCombatInfo = (card, renderContext) => {
    const combatInfo = getCardCombatInfo(card, game, allBattlefieldDisplayNames);
    logRenderedCombatInfo(combatInfo, renderContext);
    return combatInfo;
  };
  const getCombatNameList = (names, maxNameLength = 22) => names.map((name) => shortenCombatName(name, maxNameLength)).join(', ');
  const getCardCombatBadges = (cardOrId, renderContext = 'battlefield') => {
    const card = getLiveCard(cardOrId);
    const combatInfo = getRenderedCardCombatInfo(card, renderContext);
    const badges = [];
    if (combatInfo.isAttacking) {
      badges.push({ label: `ATK → ${shortenCombatName(combatInfo.attackingTargetName || 'Defender', 16)}`, tone: 'attack' });
    }
    if (combatInfo.isBlocked) {
      badges.push({ label: 'Blocked', tone: 'neutral' });
    }
    if (combatInfo.isBlocking) {
      badges.push({ label: `BLK → ${getCombatNameList(combatInfo.blockingDisplayNames, 14)}`, tone: 'block' });
    }
    return badges;
  };
  const getCardCombatRows = (cardOrId, renderContext = 'action modal') => {
    const card = getLiveCard(cardOrId);
    const combatInfo = getRenderedCardCombatInfo(card, renderContext);
    const rows = [];
    if (combatInfo.isAttacking) {
      rows.push({ label: 'Attacking', value: combatInfo.attackingTargetName || 'Defender', tone: 'attack', compact: `ATK → ${combatInfo.attackingTargetName || 'Defender'}` });
    }
    if (combatInfo.isBlocked) {
      rows.push({ label: 'Blocked by', value: combatInfo.blockedByDisplayNames.join(', ') || 'Blocker', tone: 'neutral', compact: `Blocked by ${combatInfo.blockedByDisplayNames.join(', ') || 'Blocker'}` });
    }
    if (combatInfo.isBlocking) {
      rows.push({ label: 'Blocking', value: combatInfo.blockingDisplayNames.join(', ') || 'Attacker', tone: 'block', compact: `Blocking ${combatInfo.blockingDisplayNames.join(', ') || 'Attacker'}` });
    }
    return rows;
  };

  const attackSummaryGroups = attackingCards.reduce((groups, attacker) => {
    const label = getCardAttackTargetLabel(attacker.instanceId) || 'Defender';
    const existingGroup = groups.find((group) => group.label === label);
    if (existingGroup) existingGroup.attackers.push(attacker);
    else groups.push({ label, attackers: [attacker] });
    return groups;
  }, []);

  console.log('[COMBAT_DEBUG]', {
    phase: game.phase,
    currentPlayerId: viewAsPlayerId,
    attackersMap: combatAttackers,
    blockersMap: combatBlockers,
    validBlockerCandidates: validBlockerCandidates.map((card) => ({ id: card.instanceId, name: getCombatDisplayCardName(card), controllerId: card.controllerId })),
    validAttackerTargetsDuringBlockSelection: validBlockTargetAttackers.map((card) => ({ id: card.instanceId, name: getCombatDisplayCardName(card), controllerId: card.controllerId, attackTarget: getCardAttackTargetLabel(card.instanceId) })),
    selectedBlockerId: blockPickerCard?.instanceId || null,
    selectedAttackerId: null
  });
  const playerOne = (game.players || [])[0];
  const playerTwo = (game.players || [])[1];

  // Collect player targets from stack
  const stackPlayerTargets = new Set();
  (game.stack || []).forEach(item => {
    if (item.targetPlayerIds) {
      item.targetPlayerIds.forEach(pid => stackPlayerTargets.add(pid));
    }
  });

  const isSelfTargeted = targetingState?.selectedIds.includes(getPlayerTargetId(viewAsPlayerId)) || stackPlayerTargets.has(viewAsPlayerId);

  const scrollToOpponentBattlefield = () => {
    const container = battlefieldScrollRef.current;
    const target = opponentSectionRef.current;
    if (!container || !target) return;

    const targetTop = Math.max(0, target.offsetTop - 8);
    container.scrollTo({ top: targetTop, behavior: 'smooth' });
    setOpponentSectionHighlighted(true);
    window.setTimeout(() => setOpponentSectionHighlighted(false), 1200);
  };

  const applyTempDamageChange = async (cardId, amount, clear = false) => {
    const current = getCardMarkedDamage(cardId);
    const nextAmount = clear ? 0 : Math.max(0, current + amount);
    setDamageModal(prev => (prev?.cardId === cardId ? { ...prev, amount: nextAmount } : prev));
    await handleAction('TEMP_DAMAGE', { cardId, amount, clear });
  };

  return (
    <div
      className="flex flex-col h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans"
      onMouseMove={handleDragMove}
      onTouchMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onTouchEnd={handleDragEnd}
    >
      <PerfDebugIndicator />
      <PerformanceDebugPanel game={game} onRepairGameSize={handleRepairGameSize} canRepairGameSize={isPlayer || isHost} repairGameSizeBusy={repairGameSizeBusy} />
      <TutorialOverlay
        game={{ ...game, tutorial: displayedTutorialState || game?.tutorial }}
        currentStep={currentTutorialStep}
        canGoBack={canGoBackTutorial}
        isMinimized={tutorialMinimized}
        hasOpenPanel={tutorialHasOpenPanel}
        onToggleMinimized={() => setTutorialMinimized((value) => !value)}
        onResume={resumeTutorialOverlay}
        onNext={() => advanceTutorialStep({ markCompleted: true, finish: currentTutorialStep?.id === 'tutorial_complete', actionLabel: 'manual next' })}
        onBack={goBackTutorialStep}
        onSkip={() => advanceTutorialStep({ markCompleted: false, finish: currentTutorialStep?.id === 'tutorial_complete', actionLabel: 'manual skip' })}
        onExit={requestExitTutorial}
        onFocusTarget={focusTutorialTarget}
        onRestart={restartTutorial}
        onExplore={continueExploringTutorial}
        errorMessage={tutorialOverlayError || ''}
        debugInfo={tutorialDebugInfo}
      />
      <TutorialResumePill
        show={isTutorialGame && (tutorialMinimized || tutorialHasOpenPanel)}
        currentStep={currentTutorialStep}
        hasOpenPanel={tutorialHasOpenPanel}
        onResume={resumeTutorialOverlay}
      />
      {tutorialExitConfirmOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" onClick={() => setTutorialExitConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-amber-400/50 bg-slate-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-black text-amber-100">Exit tutorial?</h2>
            <p className="mt-2 text-sm text-slate-300">Your current tutorial step is saved. Cancel to keep the overlay open, or exit to leave tutorial guidance.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setTutorialExitConfirmOpen(false)} className="min-h-11 rounded-xl border border-slate-600 px-4 py-2 font-bold text-slate-100 hover:bg-slate-800">Cancel</button>
              <button type="button" onClick={confirmExitTutorial} className="min-h-11 rounded-xl bg-red-600 px-4 py-2 font-black text-white hover:bg-red-500">Exit tutorial</button>
            </div>
          </div>
        </div>
      )}
      {/* 1. Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-2 shrink-0 shadow-md top-action-scroll-wrap">
        <div
          ref={topActionScrollRef}
          className="top-action-scroll-row hide-scrollbar sm:w-full sm:justify-between"
          onClick={() => {
            if (!headerTapLoggedRef.current) {
              console.log('Header container tapped');
              headerTapLoggedRef.current = true;
            }
          }}
          onTouchStart={() => {
            if (!headerTapLoggedRef.current) {
              console.log('Header container tapped');
              headerTapLoggedRef.current = true;
            }
          }}
        >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setTimeControlsOpen(true); maybeCompleteTutorialStep('open_time_controls'); }}
          disabled={!canAct}
          data-tutorial-anchor="phase-indicator"
          className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${canAct ? 'border-slate-700 hover:border-purple-500/60 hover:bg-slate-900' : 'border-transparent cursor-default'}${getTutorialAnchorClass(currentTutorialAnchor, 'phase-indicator', tutorialPulseAnchor)}`}
          title={canAct ? 'Open Time Controls' : 'Phase'}
          aria-label="Open Time Controls"
        >
          <div className={`w-3 h-3 rounded-full ${isMyTurn ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-slate-600'}`}></div>
          <div className="flex flex-col leading-none">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1"><Clock size={11} /> Phase</span>
            <span className="font-bold text-sm text-purple-300">
              {PHASES.find(p => p.id === game.phase)?.label}
            </span>
            {getDayNightValue(game) && (
              <span className={`mt-1 w-fit rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${getDayNightValue(game) === 'day' ? 'border-amber-300/50 bg-amber-900/50 text-amber-100' : 'border-indigo-300/50 bg-indigo-950/70 text-indigo-100'}`}>
                {DAY_NIGHT_LABELS[getDayNightValue(game)]}
              </span>
            )}
            {currentCombatDamageStepLabel && (
              <span className="mt-1 w-fit rounded-full border border-red-400/50 bg-red-950/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-100">
                {currentCombatDamageStepLabel}
              </span>
            )}
          </div>
        </button>

        <div
          data-tutorial-anchor="room-code"
          className={`flex flex-col items-center justify-center bg-slate-900 px-3 py-1 rounded border border-slate-700 cursor-pointer hover:bg-slate-800${getTutorialAnchorClass(currentTutorialAnchor, 'room-code', tutorialPulseAnchor)}`}
          onClick={() => { copyToClipboard(gameId); maybeCompleteTutorialStep('intro'); maybeCompleteTutorialStep('room_code'); maybeCompleteTutorialStep('watch_cleanup_note'); }}
          title="Click to Copy Game ID"
        >
          <span className="text-[9px] text-slate-500 uppercase tracking-widest hidden sm:block">Room Code</span>
          <span className="text-xs font-mono font-bold text-white tracking-widest">{gameId}</span>
        </div>

        {gameDocumentSizeEstimate && (
          <div className={`flex items-center gap-2 rounded border px-2 py-1 text-[10px] font-bold ${gameDocumentSizeEstimate.isNearLimit ? 'border-amber-400/60 bg-amber-950/60 text-amber-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>
            {gameDocumentSizeEstimate.isNearLimit && <AlertTriangle size={13} className="text-amber-300" />}
            <span title="Approximate Firestore game document size">Doc {Math.round((gameDocumentSizeEstimate.documentBytes || 0) / 1024)} KB · Undo {gameDocumentSizeEstimate.undoEntryCount}</span>
            {(isPlayer || isHost) && (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); handleRepairGameSize(); }}
                disabled={repairGameSizeBusy}
                className="rounded bg-amber-700/70 px-1.5 py-0.5 text-amber-50 hover:bg-amber-600 disabled:cursor-wait disabled:opacity-60"
                title="Prune old undo/log history without changing board state"
              >
                {repairGameSizeBusy ? 'Repairing…' : 'Repair size'}
              </button>
            )}
          </div>
        )}

        {isSpectator && (
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded px-3 py-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300 bg-blue-900/40 border border-blue-500/40 px-2 py-0.5 rounded-full">
              VIEWER
            </span>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>View as:</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => playerOne && setViewAsId(playerOne.id)}
                  disabled={!playerOne}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${viewAsPlayerId === playerOne?.id ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'} disabled:opacity-40`}
                  title={playerOne?.name || 'Player 1'}
                >
                  Player 1
                </button>
                <button
                  onClick={() => playerTwo && setViewAsId(playerTwo.id)}
                  disabled={!playerTwo}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${viewAsPlayerId === playerTwo?.id ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'} disabled:opacity-40`}
                  title={playerTwo?.name || 'Player 2'}
                >
                  Player 2
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSelectedStackItemId(null); setStackDetailOpen(true); maybeCompleteTutorialStep('inspect_stack'); }}
            data-tutorial-anchor="stack-button"
            className={`relative z-20 pointer-events-auto flex flex-col items-center px-3 py-1 rounded border transition-colors ${stackCards.length > 0 ? 'border-yellow-600/60 bg-yellow-950/40 hover:bg-yellow-900/50' : 'border-slate-700 bg-slate-900 hover:bg-slate-800'}${getTutorialAnchorClass(currentTutorialAnchor, 'stack-button', tutorialPulseAnchor)}`}
            title="Inspect stack and priority"
            aria-label={`Inspect stack, ${stackCards.length} item${stackCards.length === 1 ? '' : 's'}`}
          >
            <span className="text-[10px] text-slate-400 flex items-center gap-1"><Layers size={12}/> STACK</span>
            <span className={`font-mono font-bold ${stackCards.length > 0 ? 'text-yellow-400' : 'text-slate-600'}`}>
              {stackCards.length}
            </span>
          </button>
          <button
            onClick={openChat}
            data-tutorial-anchor="chat-button"
            className={`relative z-20 pointer-events-auto p-2 rounded hover:bg-slate-700 text-slate-400 hover:text-white${getTutorialAnchorClass(currentTutorialAnchor, 'chat-button', tutorialPulseAnchor)}`}
          >
            <MessageSquare size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={openRecap}
            className="relative z-20 pointer-events-auto p-2 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
            title="Recap"
          >
            <BookOpen size={20} />
          </button>
          <button
            onClick={() => { setRevealsOpen(true); maybeCompleteTutorialStep('reveal_hand_note'); }}
            data-tutorial-anchor="reveal-tools"
            className={`relative z-20 pointer-events-auto flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-slate-700${getTutorialAnchorClass(currentTutorialAnchor, 'reveal-tools', tutorialPulseAnchor)}`}
            title="View reveals and reveal tools"
          >
            <span className="text-[10px] text-slate-400">REVEALS</span>
            <Eye size={16} className="text-blue-400"/>
            {(game.reveals?.length || 0) > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full px-1 font-bold">
                {game.reveals.length}
              </span>
            )}
          </button>
          <div className="h-8 w-[1px] bg-slate-700 mx-1"></div>
          {/* Priority Button */}
          {isSpectator ? (
            <div className="text-xs text-blue-300 font-bold flex items-center gap-1"><Eye size={12} /> Viewing</div>
          ) : (
            <div className="flex items-center gap-2">
              {hasPriority ? (
                <button
                  onClick={() => { recordPerfActionClick({ actionType: 'PASS_PRIORITY', buttonName: 'Pass', currentGame: game }); handleAction('PASS_PRIORITY'); }}
                  data-tutorial-anchor="pass-button"
                  className={`relative z-20 pointer-events-auto bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg transform active:scale-95 transition-all flex items-center gap-2${getTutorialAnchorClass(currentTutorialAnchor, 'pass-button', tutorialPulseAnchor)}`}
                >
                  <ArrowRight size={14} /> Pass
                </button>
              ) : (
                <div className="relative z-10 flex items-center gap-2 text-slate-500 px-3 py-1 bg-slate-900/50 rounded-full border border-slate-800">
                  {waitingForPlayers ? <Users size={14} /> : <Clock size={14} />} <span className="text-xs font-medium italic">{waitingForPlayers ? 'Waiting for players...' : 'Waiting...'}</span>
                </div>
              )}
              <div className="relative">
                <button
                  ref={autoPassBtnRef}
                  data-tutorial-anchor="autopass-button"
                  onClick={() => {
                    console.log('AutoPass tapped');
                    setAutoPassMenuOpen(prev => !prev);
                  }}
                  disabled={autoPassControlsDisabled}
                  className={`relative z-20 pointer-events-auto px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1 ${isAutoPassEnabled ? 'bg-purple-700/60 border-purple-400 text-purple-100' : 'bg-slate-800 border-slate-600 text-slate-300 hover:text-white'} ${autoPassControlsDisabled ? 'opacity-50 cursor-not-allowed' : ''}${getTutorialAnchorClass(currentTutorialAnchor, 'autopass-button', tutorialPulseAnchor)}`}
                >
                  AutoPass <ChevronDown size={12} />
                </button>
                {autoPassMenuOpen && !autoPassControlsDisabled && autoPassMenuPosition && createPortal(
                  <div
                    ref={autoPassMenuRef}
                    className="bg-slate-900 border border-slate-700 text-slate-100 rounded-lg shadow-xl z-[99999] p-2 space-y-1"
                    style={{
                      position: 'fixed',
                      top: autoPassMenuPosition.top,
                      left: autoPassMenuPosition.left,
                      width: AUTO_PASS_MENU_WIDTH
                    }}
                  >
                    <button onClick={() => disableAutoPass()} className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800 focus:outline-none text-sm disabled:text-slate-600">Off</button>
                    <button onClick={() => enableAutoPass(AUTO_PASS_MODE.END_OF_TURN)} className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800 focus:outline-none text-sm disabled:text-slate-600">Until End of Turn</button>
                    <div className="border-t border-slate-700 my-1"></div>
                    <label className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-slate-800 focus:outline-none text-sm cursor-pointer">
                      <span className="text-slate-200">Stop when opponent acts</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setAutoPassStopOnOpponentAction(!autoPassConfig.stopOnOpponentAction);
                        }}
                        className={`relative w-9 h-5 rounded-full transition-colors ${autoPassConfig.stopOnOpponentAction ? 'bg-purple-600' : 'bg-slate-600'}`}
                        aria-pressed={autoPassConfig.stopOnOpponentAction}
                        aria-label="Stop when opponent acts"
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${autoPassConfig.stopOnOpponentAction ? 'translate-x-4' : 'translate-x-0.5'}`}></span>
                      </button>
                    </label>
                    <div className="border-t border-slate-700 my-1"></div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 px-2">Until phase/step…</div>
                    <div className="max-h-48 overflow-auto">
                      {PHASES.map((phase) => (
                        <button
                          key={phase.id}
                          onClick={() => enableAutoPass(AUTO_PASS_MODE.PHASE, phase.id)}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800 focus:outline-none text-sm disabled:text-slate-600"
                        >
                          {phase.label}
                        </button>
                        ))}
                    </div>
                  </div>,
                  document.body
                )}
              </div>
            </div>
          )}

          {isAutoPassEnabled && (
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide bg-purple-900/40 border border-purple-500/40 text-purple-200 px-2 py-1 rounded-md">
              <span>{autoPassLabel}</span>
              <button onClick={() => disableAutoPass()} className="text-purple-100 hover:text-white underline text-[10px]">Off</button>
            </div>
          )}

          <div className="h-8 w-[1px] bg-slate-700 mx-1 pointer-events-none"></div>
          {opponent && (
            <button
              onClick={scrollToOpponentBattlefield}
              className="relative z-20 pointer-events-auto px-3 py-1 rounded-full bg-slate-700/70 hover:bg-slate-600 text-xs font-semibold text-slate-100 border border-slate-600"
              title="Scroll to Opponent Battlefield"
            >
              View
            </button>
          )}
          <button
            onClick={onExit}
            className="relative z-20 pointer-events-auto p-1 text-slate-400 hover:text-white"
            title="Leave Game"
          >
            <X size={16} />
          </button>
        </div>
        </div>
      </div>

      {/* 2. Board */}
      <div className="flex-1 overflow-hidden relative bg-slate-900/95" style={{ backgroundImage: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)' }}>
        <div ref={battlefieldScrollRef} className="h-full overflow-y-auto overflow-x-hidden px-3 pb-4 pt-2 sm:px-4">
          <section
            ref={opponentSectionRef}
            data-tutorial-anchor="opponent-battlefield"
            className={`rounded-xl border p-3 mb-3 min-h-[280px] transition-all duration-300 ${opponentSectionHighlighted ? 'border-blue-400 bg-blue-900/20 ring-2 ring-blue-400/60' : 'border-slate-700 bg-slate-800/30'}${getTutorialAnchorClass(currentTutorialAnchor, 'opponent-battlefield', tutorialPulseAnchor)}`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-red-400"/>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Opponent Battlefield</div>
                  <div className="font-bold text-slate-100">{opponent?.name || 'Waiting...'}</div>
                </div>
                {isOppTurn && (
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-600/30 text-amber-200 border border-amber-500/40">
                    TURN
                  </span>
                )}
                {opponent && getPlayerAttachmentCount(opponent.id) > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-500/40 bg-fuchsia-900/40 px-2 py-0.5 text-[10px] font-bold text-fuchsia-100" title={getCardsAttachedToPlayer(game.cards || [], opponent.id).map(c => getDisplayCardName(c)).join(', ')}>
                    <Paperclip size={10} /> {getPlayerAttachmentCount(opponent.id)}
                  </span>
                )}
              </div>
              {opponent && (
                <div className="flex max-w-[55%] flex-wrap justify-end gap-1 text-xs">
                  <span className="bg-slate-700 px-2 py-0.5 rounded h-fit">Life: {opponent?.life}</span>
                  {getVisiblePlayerCounters(opponent).map((counter) => (
                    <span key={counter.key} className="rounded bg-slate-700 px-2 py-0.5 text-slate-100" title={counter.label}>{counter.label}: {counter.value}</span>
                  ))}
                  {renderManaPoolBadge(opponent)}
                  {renderPlayerStatusBadges(opponent)}
                  {renderPlayerEmblemBadges(opponent)}
                  {commanderModeEnabled && getTotalCommanderDamageToPlayer(opponent.id) > 0 && (
                    <button onClick={() => setCommanderDamageSummaryPlayerId(opponent.id)} className="rounded border border-amber-500/50 bg-amber-900/50 px-2 py-0.5 font-bold text-amber-100">Cmd: {getTotalCommanderDamageToPlayer(opponent.id)}</button>
                  )}
                  {commanderModeEnabled && getZoneCount(opponent.id, ZONES.COMMAND) > 0 && (
                    <button onClick={() => setViewZone({ zone: ZONES.COMMAND, ownerId: opponent.id })} className="rounded border border-amber-500/50 bg-slate-700 px-2 py-0.5 font-bold text-amber-100">CZ: {getZoneCount(opponent.id, ZONES.COMMAND)}</button>
                  )}
                  {getPlayerReminders(opponent.id).map((reminder) => (
                    <button
                      key={reminder.id}
                      type="button"
                      onClick={(event) => { event.stopPropagation(); if (canAct) removePlayerReminder(opponent.id, reminder.id); }}
                      className="max-w-[9rem] truncate rounded border border-violet-500/50 bg-violet-950/60 px-2 py-0.5 text-left font-bold text-violet-100"
                      title={`${getReminderTitle(reminder)}${canAct ? ' · Tap to remove' : ''}`}
                    >
                      🔔 {reminder.text}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {opponent && canAct && (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => openPrivateHandPeek(opponent.id)}
                  data-tutorial-anchor="private-hand-peek-button"
                  className={`min-h-9 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-xs font-bold text-cyan-100 hover:bg-cyan-900/60 flex items-center gap-1.5${getTutorialAnchorClass(currentTutorialAnchor, 'private-hand-peek-button', tutorialPulseAnchor)}`}
                  title="Open a private local view of the opponent's hand"
                >
                  <Eye size={14} /> Private hand peek
                </button>
              </div>
            )}

            {opponentIsRevealing && (
              <div className="mb-2 p-2 bg-purple-900/20 rounded border border-purple-500/30 flex gap-2 overflow-x-auto">
                <span className="text-[10px] text-purple-300 uppercase vertical-text">Revealed</span>
                {oppHand.map(c => (
                  <div key={c.instanceId} className="w-12 h-16 shrink-0 relative">
                    <img src={getCardImageUri(c)} className="w-full h-full rounded object-cover opacity-80" alt={getCardDisplayName(c)} />
                  </div>
                ))}
              </div>
            )}

            <div
              ref={opponentBattlefieldRef}
              className="border-t border-slate-700/70 pt-2 w-full relative"
              style={{ minHeight: `${opponentBattlefieldMinHeightPx}px`, height: `${opponentBattlefieldMinHeightPx}px` }}
            >
              {oppBattlefield.map(card => {
                const liveLayoutPosition = opponentBattlefieldLayout.tidyPositions.get(card.instanceId);
                const normalized = getOpponentBattlefieldRenderPosition(card, liveLayoutPosition, opponentBattlefieldLayout);
                return (
                  <div
                    key={card.instanceId}
                    className="absolute"
                    style={{
                      left: `${normalized.nx * 100}%`,
                      top: `${normalized.ny * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 10
                    }}
                  >
                    <Card
                      card={card}
                      zone={ZONES.BATTLEFIELD}
                      targets={game.targets || []}
                      stack={stackCards}
                      isSelected={false}
                      onMove={() => handleBattlefieldCardTap(card, setZoomedCard)}
                      onZoom={setZoomedCard}
                      displayName={getDisplayCardName(card)}
                      markedDamage={getCardMarkedDamage(card)}
                      combatBadges={getCardCombatBadges(card, 'opponent battlefield')}
                      targetInfo={getTargetInfoFor(card)}
                      attachmentLabel={getAttachmentBadgeLabel(card)}
                      attachedCount={getAttachedCount(card)}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-3 mb-3">
            {stackCards.length > 0 ? (
              <div className="p-3 bg-yellow-900/80 border border-yellow-700/50 rounded-lg flex flex-col gap-2 backdrop-blur">
                <div className="text-xs text-yellow-500 font-bold uppercase tracking-wider flex items-center gap-2">
                  <Layers size={12} /> The Stack
                </div>
                <div className="space-y-1">
                  {[...stackCards].reverse().map((item) => {
                    const itemTargetInfo = getTargetInfoFor(item);
                    return (
                      <div
                        key={item.id}
                        onClick={() => openStackItemDetail(item)}
                        className="bg-black/60 p-2 rounded border-l-2 border-yellow-500 flex justify-between items-start gap-4 cursor-pointer hover:bg-black/80 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-yellow-100 break-words">
                            <span>{item.name}</span>
                            {item.isCopy && (
                              <span className="rounded-full border border-cyan-400/40 bg-cyan-950/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-100">Copy</span>
                            )}
                          </div>
                          {itemTargetInfo.targetDisplayNames.length > 0 && (
                            <div className="mt-0.5 text-[11px] text-yellow-200 break-words">
                              Targeting: {formatTargetListInline(itemTargetInfo.targetDisplayNames, 2)}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {players.find(p => p?.id === item.controllerId)?.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : <div />}

            <div data-tutorial-anchor="combat-summary" onClick={() => { maybeCompleteTutorialStep('combat_summary_note'); maybeCompleteTutorialStep('declare_blocker_note'); }} className={`bg-slate-900/90 border border-slate-700 rounded-lg p-3 text-xs space-y-2${getTutorialAnchorClass(currentTutorialAnchor, 'combat-summary', tutorialPulseAnchor)}`}>
              <div className="font-bold text-slate-200 uppercase tracking-wider">Combat Summary</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-300">Damage step:</span>
                {currentCombatDamageStepLabel ? (
                  <span className="rounded-full border border-red-400/50 bg-red-950/50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-100">{currentCombatDamageStepLabel}</span>
                ) : (
                  <span className="text-slate-400">None</span>
                )}
              </div>
              <div>
                <div className="text-red-300 font-semibold">Attackers</div>
                {attackSummaryGroups.length === 0 ? <div className="text-slate-400">None</div> : attackSummaryGroups.map((group) => (
                  <div key={group.label} className="text-slate-200">
                    <span className="font-semibold">Attacking {group.label}:</span> {group.attackers.map((attacker) => getCombatDisplayCardName(attacker)).join(', ')}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-blue-300 font-semibold">Blockers</div>
                {Object.keys(combatBlockers).length === 0 ? <div className="text-slate-400">None</div> : Object.keys(combatBlockers).map((blockerId) => (
                  <div key={blockerId} className="text-slate-200">
                    {(getCombatDisplayCardName(blockerId) || 'Blocker')} blocks {getCardCombatInfo(cardsMap.get(blockerId), game, allBattlefieldDisplayNames).blockingDisplayNames.join(', ') || 'Attacker'}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <section data-tutorial-anchor="own-battlefield" onClick={() => maybeCompleteTutorialStep('battlefields')} className={`rounded-xl border border-slate-700 bg-slate-900/30 p-3${getTutorialAnchorClass(currentTutorialAnchor, 'own-battlefield', tutorialPulseAnchor)}`}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2">
                <User size={16} className="text-green-400"/>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Your Battlefield</div>
                  <div className="font-bold text-slate-100">{myPlayer?.name || 'You'}</div>
                </div>
                {myPlayer && getPlayerAttachmentCount(myPlayer.id) > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-500/40 bg-fuchsia-900/40 px-2 py-0.5 text-[10px] font-bold text-fuchsia-100" title={getCardsAttachedToPlayer(game.cards || [], myPlayer.id).map(c => getDisplayCardName(c)).join(', ')}>
                    <Paperclip size={10} /> {getPlayerAttachmentCount(myPlayer.id)}
                  </span>
                )}
              </div>
              <div className="sticky top-0 z-30 flex justify-end gap-2 pointer-events-none">
                <button
                  onClick={canAct ? () => handleAction('TIDY_BOARD') : undefined}
                  className={`pointer-events-auto p-2 rounded-full shadow-xl bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-600 ${canAct ? '' : 'opacity-40 cursor-not-allowed'}`}
                  title="Tidy Board (Reset to Grid)"
                >
                  <LayoutGrid size={20} />
                </button>
                <button
                  onClick={canAct ? () => setBoardUnlocked(!boardUnlocked) : undefined}
                  className={`pointer-events-auto p-2 rounded-full shadow-xl transition-all ${boardUnlocked ? 'bg-orange-500 text-white animate-pulse' : 'bg-slate-700/50 text-slate-400'} ${canAct ? '' : 'opacity-40 cursor-not-allowed'}`}
                  title={boardUnlocked ? "Lock Board (Disable Drag)" : "Unlock Board (Enable Drag)"}
                >
                  {boardUnlocked ? <Unlock size={20} /> : <Lock size={20} />}
                </button>
              </div>
            </div>

            <div
              ref={myBattlefieldRef}
              className="w-full relative pt-2"
              style={{ minHeight: `${myBattlefieldMinHeightPx}px`, height: `${myBattlefieldMinHeightPx}px` }}
            >
              {myBattlefield.map(card => {
                const isDragging = draggingCard?.card.instanceId === card.instanceId;
                const liveLayoutPosition = myBattlefieldLayout.tidyPositions.get(card.instanceId);
                const normalized = getMyBattlefieldRenderPosition(card, liveLayoutPosition, {
                  widthPx: myBattlefieldLayout.battlefieldWidth,
                  heightPx: myBattlefieldLayout.battlefieldHeightPx,
                  cardWidthPx: myBattlefieldLayout.cardWidthPx,
                  cardHeightPx: myBattlefieldLayout.cardHeightPx
                }, myBattlefieldLayout, optimisticAutoBattlefieldIds.has(card.instanceId));
                const currentDragRect = myBattlefieldRef.current?.getBoundingClientRect?.() || draggingCard?.battlefieldRect;
                const dragLeftPx = isDragging && currentDragRect
                  ? clamp(
                      (draggingCard.currentClientX + (draggingCard.pointerOffsetToCenterX || 0) - currentDragRect.left) - (myBattlefieldLayout.cardWidthPx / 2),
                      0,
                      Math.max(0, currentDragRect.width - myBattlefieldLayout.cardWidthPx)
                    )
                  : null;
                const dragTopPx = isDragging && currentDragRect
                  ? clamp(
                      (draggingCard.currentClientY + (draggingCard.pointerOffsetToCenterY || 0) - currentDragRect.top) - (myBattlefieldLayout.cardHeightPx / 2),
                      0,
                      Math.max(0, currentDragRect.height - myBattlefieldLayout.cardHeightPx)
                    )
                  : null;
                return (
                  <div
                    key={card.instanceId}
                    className="absolute"
                    style={isDragging
                      ? { left: `${dragLeftPx}px`, top: `${dragTopPx}px`, zIndex: 50 }
                      : { left: `${normalized.nx * 100}%`, top: `${normalized.ny * 100}%`, transform: 'translate(-50%, -50%)', zIndex: 10 }}
                  >
                    <Card
                      card={card}
                      zone={ZONES.BATTLEFIELD}
                      isDraggable={boardUnlocked && !targetingState && !attachmentState}
                      targets={game.targets || []}
                      stack={stackCards}
                      isSelected={targetingState?.selectedIds.includes(card.instanceId)}
                      style={{ left: `0%`, top: `0%`, zIndex: isDragging ? 50 : 10 }}
                      onMouseDown={(e) => handleDragStart(e, card)}
                      onTouchStart={(e) => handleDragStart(e, card)}
                      onMove={() => handleBattlefieldCardTap(card, setSelectedCard)}
                      onZoom={setZoomedCard}
                      onPeek={(c) => setPeekCard(c)}
                      displayName={getDisplayCardName(card)}
                      markedDamage={getCardMarkedDamage(card)}
                      combatBadges={getCardCombatBadges(card, 'own battlefield')}
                      targetInfo={getTargetInfoFor(card)}
                      attachmentLabel={getAttachmentBadgeLabel(card)}
                      attachedCount={getAttachedCount(card)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* 3. Footer */}
      <div className="bg-slate-800 border-t border-slate-700 shadow-[0_-5px_15px_rgba(0,0,0,0.5)] z-30">
        <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-700/50">
          {isTutorialGame && currentTutorialAnchor === 'library-menu-button' && (
            <div className="mb-2 rounded-lg border border-amber-400/40 bg-amber-950/40 px-3 py-2 text-xs font-bold text-amber-100 sm:hidden">
              Swipe this lower toolbar sideways → until the book/library icon appears.
            </div>
          )}
          <div ref={bottomToolbarRef} data-tutorial-anchor="bottom-toolbar" className={`overflow-x-auto sm:overflow-visible hide-scrollbar snap-x snap-proximity scroll-smooth${getTutorialAnchorClass(currentTutorialAnchor, 'bottom-toolbar', tutorialPulseAnchor)}`}>
            <div className="flex items-center gap-6 flex-nowrap min-w-max whitespace-nowrap sm:min-w-0 sm:justify-between sm:w-full">
            <div className="flex items-center gap-4 snap-start">
            {/* IDENTITY BADGE */}
            <div
              className={`flex items-center gap-2 border-r border-slate-700 pr-3 mr-1 rounded p-1 transition-all ${isSelfTargeted ? 'ring-2 ring-blue-500 bg-blue-900/40' : ''} ${targetingState ? 'cursor-crosshair hover:bg-slate-800' : ''}`}
              onClick={() => targetingState ? toggleTargetPlayer(viewAsPlayerId) : null}
            >
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{isSpectator ? 'Viewing' : 'You'}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white max-w-[80px] truncate">{viewAsPlayer?.name || (isSpectator ? 'Player' : '')}</span>
                  {isMyTurn && (
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-600/30 text-green-200 border border-green-500/40">
                      TURN
                    </span>
                  )}
                  {isSelfTargeted && (
                    <div className="text-xs bg-blue-600 text-white rounded-full px-2 py-0.5 font-bold shadow animate-in zoom-in">🎯</div>
                  )}
                  {getPlayerAttachmentCount(viewAsPlayerId) > 0 && (
                    <div className="inline-flex items-center gap-1 rounded-full border border-fuchsia-500/40 bg-fuchsia-900/50 px-2 py-0.5 text-[10px] font-bold text-fuchsia-100" title={getCardsAttachedToPlayer(game.cards || [], viewAsPlayerId).map(c => getDisplayCardName(c)).join(', ')}>
                      <Paperclip size={10} /> {getPlayerAttachmentCount(viewAsPlayerId)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div data-tutorial-anchor="player-counters-button" className={`flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-800${getTutorialAnchorClass(currentTutorialAnchor, 'player-counters-button', tutorialPulseAnchor)}`} onClick={(e) => {
              if(targetingState) { e.stopPropagation(); toggleTargetPlayer(viewAsPlayerId); }
              else { setPlayerStatsOpen(true); maybeCompleteTutorialStep('player_panel'); }
            }}>
              <span className="text-red-400 font-bold text-xl">{myPlayer?.life}</span>
              <div className="flex flex-col">
                <button onClick={(e) => { e.stopPropagation(); handleAction('LIFE_CHANGE', { targetPlayerId: viewAsPlayerId, amount: 1 }); }} className="text-slate-500 hover:text-green-400"><ChevronUp size={12}/></button>
                <button onClick={(e) => { e.stopPropagation(); handleAction('LIFE_CHANGE', { targetPlayerId: viewAsPlayerId, amount: -1 }); }} className="text-slate-500 hover:text-red-400"><ChevronDown size={12}/></button>
              </div>
              <div className="ml-1 flex max-w-[11rem] flex-wrap gap-1">
                {getVisiblePlayerCounters(myPlayer).map((counter) => (
                  <span key={counter.key} className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-100" title={counter.label}>{counter.label}: {counter.value}</span>
                ))}
                {renderManaPoolBadge(myPlayer, 'tiny', { always: true })}
                {renderPlayerStatusBadges(myPlayer, 'tiny')}
                {renderPlayerEmblemBadges(myPlayer, 'tiny')}
                {commanderModeEnabled && getTotalCommanderDamageToPlayer(viewAsPlayerId) > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); setCommanderDamageSummaryPlayerId(viewAsPlayerId); }} className="rounded border border-amber-500/50 bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-bold text-amber-100">Cmd: {getTotalCommanderDamageToPlayer(viewAsPlayerId)}</button>
                )}
                {getPlayerReminders(viewAsPlayerId).map((reminder) => (
                  <button
                    key={reminder.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (canAct) removePlayerReminder(viewAsPlayerId, reminder.id); }}
                    className="max-w-[9rem] truncate rounded border border-violet-500/50 bg-violet-950/60 px-1.5 py-0.5 text-left text-[10px] font-bold text-violet-100"
                    title={`${getReminderTitle(reminder)}${canAct ? ' · Tap to remove' : ''}`}
                  >
                    🔔 {reminder.text}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-6 w-[1px] bg-slate-700"></div>

            {!isSpectator && (
              <button
                type="button"
                onClick={handleDrawCard}
                disabled={!canDrawFromLibrary}
                data-tutorial-anchor="draw-button"
                className={`min-h-9 px-3 py-1.5 rounded-full text-xs font-extrabold transition-all flex items-center gap-1.5 active:scale-95 ${canDrawFromLibrary ? 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/60 shadow-md shadow-blue-950/30' : 'bg-slate-700/50 text-slate-400 border border-slate-600 cursor-not-allowed opacity-60'}${getTutorialAnchorClass(canDrawFromLibrary ? currentTutorialAnchor : null, 'draw-button', tutorialPulseAnchor)}`}
                title={canDrawFromLibrary ? 'Draw one card' : 'No cards left in library'}
                aria-label="Draw one card from bottom panel"
              >
                <Plus size={14} /> Draw
              </button>
            )}

            <div className="flex gap-2 text-xs text-slate-400">
              <div className="flex items-center gap-1 cursor-pointer hover:text-white" onClick={() => { setViewZone({ zone: ZONES.GRAVEYARD, ownerId: viewAsPlayerId }); }}>
                <Skull size={14} /> GY: {myGYCount}
              </div>
              <div className="flex items-center gap-1 cursor-pointer hover:text-white" onClick={() => { setViewZone({ zone: ZONES.EXILE, ownerId: viewAsPlayerId }); }}>
                <RotateCw size={14} /> Ex: {myExileCount}
              </div>
              {commanderModeEnabled && (
                <div className="flex items-center gap-1 cursor-pointer hover:text-amber-200" onClick={() => { setViewZone({ zone: ZONES.COMMAND, ownerId: viewAsPlayerId }); }}>
                  <Crown size={14} /> Cmd: {myCommandCount}
                </div>
              )}
            </div>
            </div>

            <div className="flex items-center gap-2 snap-start">
            {/* Dice/Coin Menu */}
            <div className="relative">
              <button
                onClick={canAct ? () => setDiceMenuOpen(!diceMenuOpen) : undefined}
                className={`p-2 rounded-full ${diceMenuOpen ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'} ${canAct ? '' : 'opacity-40 cursor-not-allowed'}`}
              >
                <Dices size={18} />
              </button>
            </div>

            {/* Library Menu */}
            <div className="relative">
              <button
                ref={libraryButtonRef}
                onClick={canAct ? () => { const willOpen = !libraryMenuOpen; setLibraryMenuOpen(willOpen); if (willOpen) maybeCompleteTutorialStep('open_library_tools'); } : undefined}
                data-tutorial-anchor="library-menu-button"
                className={`p-2 rounded-full hover:bg-slate-700 ${libraryMenuOpen ? 'text-white bg-slate-700' : 'text-slate-400'} ${canAct ? '' : 'opacity-40 cursor-not-allowed'}${getTutorialAnchorClass(currentTutorialAnchor, 'library-menu-button', tutorialPulseAnchor)}`}
              >
                <BookOpen size={18} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (undoButtonDisabled) {
                  if (canAct) {
                    setNotification('Nothing to undo.');
                    setTimeout(() => setNotification(null), 2000);
                  }
                  return;
                }
                setUndoConfirmOpen(true);
              }}
              disabled={undoButtonDisabled}
              data-tutorial-anchor="undo-button"
              className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-extrabold transition-all flex items-center gap-1.5 ${undoButtonDisabled ? 'border-slate-700 bg-slate-800/50 text-slate-500 cursor-not-allowed opacity-60' : 'border-amber-500/60 bg-amber-900/40 text-amber-100 hover:bg-amber-800/60 active:scale-95'}${getTutorialAnchorClass(currentTutorialAnchor, 'undo-button', tutorialPulseAnchor)}`}
              title={latestUndoEntry ? (undoPendingSync ? undoPendingLabel : `Undo ${latestUndoEntry.actionLabel || 'last action'}`) : 'Nothing to undo'}
              aria-label="Undo last game action"
            >
              <Undo2 size={14} /> <span className="hidden xs:inline sm:inline">{undoPendingSync ? 'Syncing undo…' : 'Undo'}</span>
            </button>
            </div>
          </div>
        </div>
      </div>
        {undoConfirmOpen && createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-3 sm:items-center" onMouseDown={() => setUndoConfirmOpen(false)}>
            <div
              className="w-full max-w-sm rounded-2xl border border-slate-600 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden"
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="undo-confirm-title"
            >
              <div className="border-b border-slate-700 bg-slate-800/90 px-4 py-3">
                <h3 id="undo-confirm-title" className="text-base font-extrabold text-white">Undo last action?</h3>
                <p className="mt-1 text-sm text-slate-300">
                  Last action: {latestUndoEntry?.actorName || 'A player'} {latestUndoEntry?.actionLabel || 'last game action'}.
                </p>
                {undoPendingSync && (
                  <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs font-bold text-amber-100">
                    Undo is available after sync. This prevents undoing the wrong server entry while the action is still pending.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 p-4">
                <button
                  type="button"
                  onClick={() => setUndoConfirmOpen(false)}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    recordPerfActionClick({
                      actionType: 'UNDO_LAST_ACTION',
                      buttonName: 'Undo confirm',
                      payload: { undoEntryId: latestUndoEntry?.id || null },
                      currentGame: firestoreGame || game
                    });
                    handleUndoLatestAction();
                  }}
                  disabled={undoConfirmDisabled}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {undoPendingSync ? 'Waiting for sync…' : 'Undo'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
        {diceMenuOpen && createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-3 sm:items-center" onMouseDown={() => setDiceMenuOpen(false)}>
            <div
              className="w-full max-w-sm rounded-2xl border border-slate-600 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/90 px-4 py-3">
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-widest text-white">Random Tools</h3>
                  <p className="text-xs text-slate-400">Results are public in the game log.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDiceMenuOpen(false)}
                  className="rounded-full p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
                  aria-label="Close random tools"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 p-4">
                <button onClick={() => { handleAction('ROLL_DICE', { diceType: 'd6' }); setDiceMenuOpen(false); }} className="min-h-12 rounded-xl bg-slate-800 px-3 py-3 text-left text-sm font-bold hover:bg-slate-700 active:scale-[0.98]"><Hexagon size={16} className="mb-1 text-purple-300"/> Roll d6</button>
                <button onClick={() => { handleAction('ROLL_DICE', { diceType: 'd20' }); setDiceMenuOpen(false); }} className="min-h-12 rounded-xl bg-slate-800 px-3 py-3 text-left text-sm font-bold hover:bg-slate-700 active:scale-[0.98]"><Dices size={16} className="mb-1 text-blue-300"/> Roll d20</button>
                <button onClick={() => { handleAction('ROLL_DICE', { diceType: 'coin' }); setDiceMenuOpen(false); }} className="min-h-12 rounded-xl bg-slate-800 px-3 py-3 text-left text-sm font-bold hover:bg-slate-700 active:scale-[0.98]"><Coins size={16} className="mb-1 text-yellow-300"/> Flip coin</button>
                <button onClick={() => { handleAction('DISCARD_RANDOM'); setDiceMenuOpen(false); }} className="min-h-12 rounded-xl bg-red-950/60 px-3 py-3 text-left text-sm font-bold text-red-100 hover:bg-red-900/70 active:scale-[0.98]"><Shuffle size={16} className="mb-1 text-red-300"/> Random discard</button>
              </div>

              <div className="border-t border-slate-700 p-4 pt-3">
                <label htmlFor="custom-die-size" className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">Custom die size</label>
                <div className="flex gap-2">
                  <input
                    id="custom-die-size"
                    inputMode="numeric"
                    min="2"
                    max="1000"
                    value={customDieSize}
                    onChange={(event) => setCustomDieSize(event.target.value)}
                    placeholder="12"
                    className="min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-base text-white outline-none focus:border-purple-400"
                  />
                  <button
                    type="button"
                    onClick={runCustomDieRoll}
                    className="min-h-11 rounded-xl bg-purple-600 px-4 text-sm font-extrabold text-white hover:bg-purple-500 active:scale-[0.98]"
                  >
                    Roll
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[4, 8, 10, 12, 100].map(size => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setCustomDieSize(String(size))}
                      className="rounded-full border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-purple-400 hover:text-white"
                    >
                      d{size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
        {libraryMenuOpen && libraryMenuPos && createPortal(
          <div
            className="fixed z-[100] w-40 bg-slate-800 rounded shadow-xl border border-slate-600 overflow-y-auto"
            style={{
              top: libraryMenuPos.top - 8,
              left: libraryMenuPos.right,
              maxHeight: `max(7rem, calc(${libraryMenuPos.top}px - 1rem))`,
              transform: 'translate(-100%, -100%)'
            }}
          >
            <button data-tutorial-anchor="draw-button" onClick={async () => { recordPerfActionClick({ actionType: 'DRAW_CARD', buttonName: 'Draw', currentGame: game }); await handleAction('DRAW_CARD'); setLibraryMenuOpen(false); await maybeCompleteTutorialStep('draw_card'); }} disabled={!canDrawFromLibrary} className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${canDrawFromLibrary ? 'hover:bg-slate-700 text-blue-300' : 'text-slate-500 cursor-not-allowed'}${getTutorialAnchorClass(canDrawFromLibrary ? currentTutorialAnchor : null, 'draw-button', tutorialPulseAnchor)}`}>
              <Plus size={12} /> Draw
            </button>
            <button onClick={() => { handleAction('MULLIGAN'); setLibraryMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-amber-300" >
              <RefreshCw size={12} /> Mulligan (7)
            </button>
            <button onClick={() => handleAction('SCRY_TOP')} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-purple-300">
              <Eye size={12} /> Scry 1
            </button>
            <button onClick={() => setSearchLibraryOwner(userId)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-green-300">
              <Search size={12} /> Search Lib
            </button>
            <button onClick={() => startReorderTop()} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-indigo-300">
              <Layers size={12} /> Reorder Top...
            </button>
            <button onClick={() => { setLibraryBatchOpen(true); setLibraryMenuOpen(false); maybeCompleteTutorialStep('batch_library_actions'); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-cyan-300">
              <LayoutGrid size={12} /> Batch Actions
            </button>
            <button onClick={() => handleAction('SHUFFLE_LIBRARY')} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-yellow-300">
              <Shuffle size={12} /> Shuffle
            </button>

            {opponent && (
              <>
                <div className="border-t border-slate-600 my-1 pt-1 px-2 text-[10px] text-slate-500 uppercase tracking-widest font-bold">Opponent Library</div>
                <div className="px-2 text-[9px] text-slate-500 mb-1 italic">Use only when allowed</div>
                <button onClick={() => { setSearchLibraryOwner(opponent.id); setLibraryMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-green-300">
                  <Search size={12} /> Search Opp Lib
                </button>
                <button onClick={() => { handleAction('SCRY_TOP', { targetOwnerId: opponent.id }); setLibraryMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-purple-300">
                  <Eye size={12} /> Peek Opp Top
                </button>
                <button onClick={() => startReorderTop(opponent.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-indigo-300">
                  <Layers size={12} /> Reorder Opp Top...
                </button>
                <button onClick={() => { handleAction('SHUFFLE_LIBRARY', { targetOwnerId: opponent.id }); setLibraryMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-yellow-300">
                  <Shuffle size={12} /> Shuffle Opp Lib
                </button>
              </>
            )}

            <div className="border-t border-slate-600 my-1"></div>
            <button onClick={createToken} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-slate-300">
              <UserCheck size={12} /> Create Token
            </button>
          </div>,
          document.body
        )}

        <div data-tutorial-anchor="hand-area" className={`p-2 overflow-x-auto whitespace-nowrap hide-scrollbar flex gap-2 min-h-[140px] items-center px-4${getTutorialAnchorClass(currentTutorialAnchor, 'hand-area', tutorialPulseAnchor)}`}>
          {canAct && (noDeckLoaded || currentTutorialStep?.id === 'import_deck') && (
            <button
              data-tutorial-anchor="import-deck-button"
              onClick={() => {
                setDeckInput(commanderModeEnabled ? "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n1 Command Tower" : '20 Mountain\n20 Lightning Bolt\n20 Llanowar Elves');
                maybeCompleteTutorialStep('import_deck');
              }}
              className={`mx-auto text-sm text-slate-500 border border-slate-600 border-dashed rounded px-4 py-2 hover:text-white hover:border-slate-400${getTutorialAnchorClass(currentTutorialAnchor, 'import-deck-button', tutorialPulseAnchor)}`}
            >
              Import Deck
            </button>
          )}
          {canAct && hasDeckLoaded && (
            <button
              onClick={() => setDeleteDeckConfirmOpen(true)}
              className="mx-auto text-sm text-red-300 border border-red-700 rounded px-4 py-2 hover:text-white hover:border-red-500"
            >
              Delete Deck
            </button>
          )}
          {myHand.map(card => (
            <Card
              key={card.instanceId}
              card={card}
              zone={ZONES.HAND}
              targets={game.targets || []}
              stack={stackCards}
              isSelected={targetingState?.selectedIds.includes(card.instanceId)}
              onMove={() => setSelectedCard(card)}
              onZoom={setZoomedCard}
              targetInfo={getTargetInfoFor(card)}
            />
          ))}
          <button onClick={canAct ? () => setDiceMenuOpen(true) : undefined} className={`ml-4 px-3 py-8 border-l border-slate-700 text-slate-500 hover:text-purple-300 flex flex-col items-center justify-center text-[10px] font-bold ${canAct ? '' : 'opacity-40 cursor-not-allowed'}`}>
            <Shuffle size={14} className="mb-1"/> Random<br/>Tools
          </button>
        </div>
      </div>

      {/* --- Overlays --- */}

      {/* NOTIFICATION TOAST */}
      {notification && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 pointer-events-none">
          <div className="bg-purple-600 text-white px-6 py-4 rounded-xl shadow-2xl border-2 border-purple-400 flex flex-col items-center">
            <div className="font-bold text-lg text-center">{notification}</div>
          </div>
        </div>
      )}

      {/* PRIVATE HAND PEEK MODAL */}
      {privateHandPeek && privateHandPeekPlayer && canAct && (
        <div className="fixed inset-0 z-[155] bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={closePrivateHandPeek}>
          <div className="w-full sm:max-w-3xl max-h-[92vh] bg-slate-900 border border-cyan-500/40 shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-cyan-500/30 bg-cyan-950/30 p-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-200 font-black flex items-center gap-1.5"><Lock size={12} /> Private view</div>
                <h2 className="text-xl font-black text-white">Private view of opponent hand</h2>
                <p className="text-sm text-slate-300">Only you can see {privateHandPeekPlayer.name || 'this player'}'s hand here. This does not publicly reveal it.</p>
              </div>
              <button onClick={closePrivateHandPeek} className="min-h-11 min-w-11 rounded-full bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center" aria-label="Close private hand peek">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-3">
              {privatePeekInspectCard ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setPrivatePeekInspectCard(null)}
                    className="min-h-11 w-full rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-4 py-2 text-sm font-black text-cyan-50 hover:bg-cyan-900/50 sm:w-auto"
                  >
                    Back to private hand
                  </button>
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-sm text-cyan-100">
                    Private inspection only. This card is not publicly revealed and is not written to the public log.
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,320px)_1fr]">
                    <div className="flex justify-center">
                      {getCardImageUri(privatePeekInspectCard) ? (
                        <img src={getCardImageUri(privatePeekInspectCard)} alt={getCardDisplayName(privatePeekInspectCard)} className="max-h-[65vh] w-full max-w-sm rounded-xl object-contain shadow-2xl" />
                      ) : (
                        <div className="flex aspect-[63/88] w-full max-w-sm items-center justify-center rounded-xl bg-slate-950 p-4 text-center text-lg font-black text-slate-100 shadow-2xl">{getCardDisplayName(privatePeekInspectCard)}</div>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-slate-100">
                      <h3 className="text-2xl font-black">{getCardDisplayName(privatePeekInspectCard)}</h3>
                      {getCardTypeLine(privatePeekInspectCard) && <div className="mt-2 text-sm font-bold text-cyan-100">{getCardTypeLine(privatePeekInspectCard)}</div>}
                      {getCardOracleText(privatePeekInspectCard) && <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-200">{getCardOracleText(privatePeekInspectCard)}</div>}
                      {!getCardTypeLine(privatePeekInspectCard) && !getCardOracleText(privatePeekInspectCard) && (
                        <div className="mt-4 text-sm text-slate-400">No additional card text is available.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-sm text-cyan-100">
                    Inspecting {privatePeekHandCards.length} card{privatePeekHandCards.length === 1 ? '' : 's'} from {privateHandPeekPlayer.name || 'opponent'}'s hand. Card names are not written to the public log.
                  </div>
                  {privatePeekHandCards.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 pb-2">
                      {privatePeekHandCards.map(card => (
                        <button
                          key={card.instanceId}
                          type="button"
                          onClick={() => setPrivatePeekInspectCard(card)}
                          className="rounded-xl border border-slate-700 bg-slate-800/80 p-2 text-left shadow-lg hover:border-cyan-400 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                        >
                          <div className="aspect-[63/88] overflow-hidden rounded-lg bg-slate-950">
                            {getCardImageUri(card) ? (
                              <img src={getCardImageUri(card)} alt={getCardDisplayName(card)} className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center p-2 text-center text-xs font-bold text-slate-200">{getCardDisplayName(card)}</div>
                            )}
                          </div>
                          <div className="mt-2 truncate text-xs font-bold text-slate-100">{getCardDisplayName(card)}</div>
                          <div className="text-[10px] text-cyan-200">Tap to inspect</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">That hand is currently empty.</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TIME CONTROLS PANEL */}
      {timeControlsOpen && (
        <div className="fixed inset-0 z-[149] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setTimeControlsOpen(false)}>
          <div data-tutorial-anchor="phase-controls" className={`w-full sm:max-w-lg max-h-[90vh] bg-slate-900 border border-slate-700 shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col${getTutorialAnchorClass(currentTutorialAnchor, 'phase-controls', tutorialPulseAnchor)}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-700 bg-slate-800/90 p-4">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2"><Clock size={20} className="text-purple-300" /> Time Controls</h2>
                <p className="text-sm text-slate-400">Manual phase and turn tools</p>
              </div>
              <button onClick={() => setTimeControlsOpen(false)} className="min-h-11 min-w-11 rounded-full bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center" aria-label="Close Time Controls">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-5">
              <section className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-purple-200 font-bold mb-2">Current</div>
                <div className="space-y-1 text-sm">
                  <div className="text-slate-100 font-bold">Turn {Number.isFinite(game.turnNumber) ? game.turnNumber : '?'} — {activeTurnPlayer?.name || 'Unknown'}</div>
                  <div className="text-purple-200 text-lg font-black">{currentPhase.label}</div>
                  {currentCombatDamageStepLabel && (
                    <div className="inline-flex w-fit rounded-full border border-red-400/50 bg-red-950/50 px-2 py-1 text-xs font-black uppercase tracking-wider text-red-100">
                      {currentCombatDamageStepLabel}
                    </div>
                  )}
                  <div className="text-slate-300">Priority: <span className="font-bold text-white">{priorityHolderName}</span></div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 mb-2">Set current step</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PHASES.map((phase) => {
                    const isCurrent = phase.id === game.phase;
                    return (
                      <button
                        key={phase.id}
                        onClick={() => handleSetManualStep(phase.id)}
                        className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-bold ${isCurrent ? 'bg-purple-700 border-purple-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 hover:border-slate-500'}`}
                        aria-pressed={isCurrent}
                      >
                        {phase.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-red-200 mb-2">Combat damage step</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetCombatDamageStep(COMBAT_DAMAGE_STEPS.FIRST_STRIKE)}
                    className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-bold ${currentCombatDamageStep === COMBAT_DAMAGE_STEPS.FIRST_STRIKE ? 'border-red-300 bg-red-700 text-white' : 'border-red-500/40 bg-red-950/40 text-red-100 hover:bg-red-900/50'}`}
                    aria-pressed={currentCombatDamageStep === COMBAT_DAMAGE_STEPS.FIRST_STRIKE}
                  >
                    First-strike damage
                    <div className="text-xs font-normal opacity-80">Manual shortcut</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetCombatDamageStep(COMBAT_DAMAGE_STEPS.REGULAR)}
                    className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-bold ${currentCombatDamageStep === COMBAT_DAMAGE_STEPS.REGULAR ? 'border-red-300 bg-red-700 text-white' : 'border-red-500/40 bg-red-950/40 text-red-100 hover:bg-red-900/50'}`}
                    aria-pressed={currentCombatDamageStep === COMBAT_DAMAGE_STEPS.REGULAR}
                  >
                    Regular damage
                    <div className="text-xs font-normal opacity-80">Manual shortcut</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetCombatDamageStep(null)}
                    className="min-h-12 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-left text-sm font-bold text-slate-100 hover:bg-slate-700"
                    disabled={!currentCombatDamageStep}
                  >
                    Clear damage step
                    <div className="text-xs font-normal opacity-80">No damage step</div>
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-violet-200 mb-2">Reminder cleanup</h3>
                <button
                  type="button"
                  onClick={clearCleanupReminders}
                  className="min-h-12 w-full rounded-xl border border-violet-500/50 bg-violet-900/40 px-4 py-3 text-left font-bold text-violet-50 hover:bg-violet-800/50"
                >
                  Clear cleanup reminders
                  <div className="text-xs font-normal text-violet-200/80">Removes only reminders set to “Clear at cleanup”; manual reminders stay.</div>
                </button>
              </section>

              <section className="grid grid-cols-1 gap-2">
                <button onClick={handleStartExtraCombat} className="min-h-12 rounded-xl border border-orange-500/50 bg-orange-950/40 px-4 py-3 text-left text-orange-100 hover:bg-orange-900/50 font-bold">
                  Start extra combat
                  <div className="text-xs font-normal text-orange-200/80">Sets Begin Combat and clears old combat assignments.</div>
                </button>
                <button onClick={handleGoExtraMain} className="min-h-12 rounded-xl border border-blue-500/50 bg-blue-950/40 px-4 py-3 text-left text-blue-100 hover:bg-blue-900/50 font-bold">
                  Go to extra main phase
                  <div className="text-xs font-normal text-blue-200/80">Moves to Main 2 without untapping or drawing.</div>
                </button>
              </section>

              <section>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 mb-2">Start extra turn</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(game.players || []).map((player) => (
                    <button key={player.id} onClick={() => handleStartExtraTurn(player.id)} className="min-h-12 rounded-xl border border-green-500/50 bg-green-950/40 px-4 py-3 text-left text-green-100 hover:bg-green-900/50 font-bold">
                      {player.name || 'Player'}
                      <div className="text-xs font-normal text-green-200/80">Start at Untap</div>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 mb-2">Set active player</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(game.players || []).map((player) => {
                    const isActive = player.id === game.turnPlayerId;
                    return (
                      <button key={player.id} onClick={() => handleSetActivePlayer(player.id)} className={`min-h-12 rounded-xl border px-4 py-3 text-left font-bold ${isActive ? 'border-purple-400 bg-purple-700 text-white' : 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'}`}>
                        {player.name || 'Player'}
                        <div className="text-xs font-normal opacity-80">{isActive ? 'Current active player' : 'Make active player'}</div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* TARGETING BANNER */}
      {targetingState && (
        <div className="fixed bottom-40 left-0 right-0 z-[90] flex justify-center pointer-events-none px-4">
          <div data-tutorial-anchor="target-tools" className={`bg-blue-600 text-white p-3 rounded-lg shadow-xl text-center font-bold animate-in fade-in slide-in-from-bottom-4 border-2 border-blue-400 flex flex-col gap-2 pointer-events-auto max-w-md w-full${getTutorialAnchorClass(currentTutorialAnchor, 'target-tools', tutorialPulseAnchor)}`}>
            <div className="flex justify-center items-center gap-2">
              <span>Select targets for: {getCardDisplayName(targetingState.source)}</span>
              <span className="bg-white text-blue-600 px-2 rounded-full text-xs">{targetingState.selectedIds.length}</span>
            </div>
            <div className="flex justify-center gap-4 text-xs mt-1">
              <button onClick={finishTargeting} className="bg-white text-blue-600 px-4 py-1.5 rounded-full font-bold shadow hover:bg-blue-50 flex items-center gap-1"><Check size={14}/> Done</button>
              <button onClick={() => setTargetingState(null)} className="text-blue-200 underline hover:text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}


      {/* ATTACHMENT BANNER */}
      {attachmentState && (
        <div className="fixed bottom-40 left-0 right-0 z-[91] flex justify-center pointer-events-none px-4">
          <div className="bg-fuchsia-700 text-white p-3 rounded-lg shadow-xl text-center font-bold animate-in fade-in slide-in-from-bottom-4 border-2 border-fuchsia-300 flex flex-col gap-2 pointer-events-auto max-w-md w-full">
            <div className="flex justify-center items-center gap-2">
              <Paperclip size={16} />
              <span>Attach {getCardDisplayName(attachmentState.source, 'card')} to a permanent</span>
            </div>
            <div className="text-xs text-fuchsia-100">Tap another battlefield permanent. Self-attach is ignored.</div>
            <button onClick={() => setAttachmentState(null)} className="text-fuchsia-100 underline hover:text-white text-xs">Cancel</button>
          </div>
        </div>
      )}

      {attachmentPlayerPickerCard && (
        <div className="fixed inset-0 bg-black/70 z-[72] flex items-center justify-center p-4" onClick={() => setAttachmentPlayerPickerCard(null)}>
          <div className="bg-slate-800 w-full max-w-sm rounded-xl p-4 border border-slate-600 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-white">Attach to player</h3>
                <p className="text-xs text-slate-400">{getCardDisplayName(attachmentPlayerPickerCard)}</p>
              </div>
              <button onClick={() => setAttachmentPlayerPickerCard(null)}><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="space-y-2">
              {(game.players || []).map((player) => (
                <button
                  key={player.id}
                  onClick={() => attachToPlayer(player.id)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-3 text-left text-sm font-bold text-slate-100 hover:bg-slate-600"
                >
                  {player.name || 'Player'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STACK DETAIL MODAL */}
      {stackDetailOpen && (
        <div className="fixed inset-0 z-[148] pointer-events-none flex items-end sm:items-center justify-center p-3 sm:p-4">
          <div data-tutorial-anchor="stack-panel" className={`pointer-events-auto w-full sm:max-w-lg max-h-[82vh] bg-slate-900 border border-slate-700 shadow-2xl flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden${getTutorialAnchorClass(currentTutorialAnchor, 'stack-panel', tutorialPulseAnchor)}`}>
            <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-700 bg-slate-800">
              <div className="min-w-0">
                <h3 className="font-bold text-white text-lg flex items-center gap-2"><Layers size={18} className="text-yellow-400"/> Stack</h3>
                <div className="text-[11px] text-slate-400">Top resolves first</div>
              </div>
              <button
                type="button"
                onClick={closeStackDetail}
                className="shrink-0 p-2 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
                aria-label="Close stack details"
              >
                <X size={20}/>
              </button>
            </div>

            <div className="border-b border-slate-700 bg-slate-950/80 p-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400">Priority:</span>
                <span className="font-bold text-purple-200">{priorityHolderName}</span>
              </div>
              {passedPriorityPlayers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {passedPriorityPlayers.map((player) => (
                    <span key={player.id} className="rounded-full border border-emerald-500/30 bg-emerald-950/50 px-2 py-0.5 text-xs text-emerald-200">
                      {player.name || 'Player'} passed
                    </span>
                  ))}
                </div>
              )}
              {waitingPriorityPlayers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {waitingPriorityPlayers.map((player) => (
                    <span key={player.id} className="rounded-full border border-yellow-500/40 bg-yellow-950/50 px-2 py-0.5 text-xs text-yellow-100">
                      Waiting for {player.name || 'Player'}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3 bg-slate-900/95">
              {stackDetailItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/40 p-6 text-center text-slate-300">
                  Stack is empty.
                </div>
              ) : selectedStackDetailItem ? (() => {
                const { item, name, casterName, typeLabel, typeLine, targets, isCopy, isTop, stackPosition } = selectedStackDetailItem;
                return (
                  <div className={`rounded-xl border p-3 shadow-lg ${isTop ? 'border-yellow-500/60 bg-yellow-950/30' : 'border-slate-700 bg-slate-800/70'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 font-bold text-slate-50 text-lg break-words">
                          <span>{name}</span>
                          {isCopy && (
                            <span className="rounded-full border border-cyan-400/40 bg-cyan-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-100">Copy</span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-300">{typeLabel === 'Ability' ? 'Controller' : 'Caster'}: {casterName}</div>
                      </div>
                      {typeLabel && (
                        <span className="shrink-0 rounded-full border border-slate-600 bg-slate-950/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                          {typeLabel}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Type line</div>
                        <div className="mt-1 text-slate-100 break-words">{typeLine || 'Unknown'}</div>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Stack position</div>
                        <div className="mt-1 text-slate-100">{stackPosition} of {stackCards.length} · {isTop ? 'Top item' : 'Below top item'}</div>
                      </div>
                      <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-purple-200">Priority</div>
                        <div className="mt-1 text-purple-50">Priority: {priorityHolderName}</div>
                        <div className="mt-0.5 text-xs text-purple-200">Waiting for: {waitingPriorityText}</div>
                      </div>
                      <div className="rounded-lg border border-yellow-500/30 bg-yellow-950/20 p-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-yellow-200">Targets</div>
                        {targets.length > 0 ? (
                          <ul className="mt-1 list-disc pl-4 text-sm text-yellow-50 space-y-0.5">
                            {targets.map((targetName, targetIndex) => (
                              <li key={`${item.id || item.sourceId}-detail-target-${targetIndex}`} className="break-words">{targetName}</li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mt-1 text-sm text-yellow-50">No targets</div>
                        )}
                      </div>
                    </div>

                    {!isTop && (
                      <div className="mt-3 rounded-lg border border-slate-600 bg-slate-800/80 p-2 text-sm text-slate-300">
                        Only the top stack item can resolve first.
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {isTop && (
                        <>
                          <button
                            type="button"
                            onClick={() => { recordPerfActionClick({ actionType: 'RESOLVE_STACK_TOP', payload: { stackItemId: item.id }, buttonName: 'Resolve Stack Top', cardName: item.name, currentGame: game }); handleAction('RESOLVE_STACK_TOP', { stackItemId: item.id }); }}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm font-bold text-white shadow"
                          >
                            Resolve top item
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Counter/fizzle ${name}?`)) {
                                recordPerfActionClick({ actionType: 'COUNTER_STACK_TOP', payload: { stackItemId: item.id }, buttonName: 'Counter Stack Top', cardName: item.name, currentGame: game });
                                handleAction('COUNTER_STACK_TOP', { stackItemId: item.id });
                              }
                            }}
                            className="rounded-lg bg-red-700 hover:bg-red-600 px-3 py-2 text-sm font-bold text-white shadow"
                          >
                            Counter / Fizzle
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => { recordPerfActionClick({ actionType: 'COPY_STACK_ITEM', payload: { stackItemId: item.id || item.sourceId }, buttonName: 'Copy Stack Item', cardName: item.name, currentGame: game }); handleAction('COPY_STACK_ITEM', { stackItemId: item.id || item.sourceId }); }}
                        className="rounded-lg border border-cyan-500/50 bg-cyan-950/60 hover:bg-cyan-900/70 px-3 py-2 text-sm font-bold text-cyan-100 shadow"
                      >
                        Copy stack item
                      </button>
                      <button
                        type="button"
                        onClick={() => viewStackItemCard(item)}
                        className="rounded-lg border border-sky-500/50 bg-sky-950/60 hover:bg-sky-900/70 px-3 py-2 text-sm font-bold text-sky-100 shadow"
                      >
                        View card
                      </button>
                      <button
                        type="button"
                        onClick={closeStackDetail}
                        className="rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-sm font-bold text-slate-100 shadow"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                );
              })() : stackDetailItems.map(({ item, name, casterName, typeLabel, typeLine, targets, isCopy, isTop, stackPosition }) => (
                <button
                  type="button"
                  key={item.id || `${item.sourceId}-${item.timestamp}`}
                  onClick={() => openStackItemDetail(item)}
                  className={`block w-full text-left rounded-xl border p-3 shadow-lg transition-colors ${isTop ? 'border-yellow-500/60 bg-yellow-950/30 hover:bg-yellow-900/40' : 'border-slate-700 bg-slate-800/70 hover:bg-slate-800'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 font-bold text-slate-50 break-words">
                        <span>{name}</span>
                        {isCopy && (
                          <span className="rounded-full border border-cyan-400/40 bg-cyan-950/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-100">Copy</span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-300">{typeLabel === 'Ability' ? 'Controller' : 'Caster'}: {casterName}</div>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-600 bg-slate-950/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                      {isTop ? 'Top item' : `#${stackPosition}`}
                    </span>
                  </div>
                  {typeLine && <div className="mt-2 text-xs italic text-slate-400 break-words">{typeLine}</div>}
                  <div className="mt-2 text-xs text-yellow-100 break-words">
                    Targets: {targets.length > 0 ? formatTargetListInline(targets, 2) : 'No targets'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GAME LOG MODAL */}
      {recapOpen && (
        <div className="fixed inset-0 z-[149] pointer-events-none flex justify-end items-end sm:items-start sm:top-16 sm:right-4">
          <div className="pointer-events-auto w-full sm:w-[28rem] h-[82vh] sm:h-[640px] bg-slate-900 border border-slate-700 shadow-2xl flex flex-col rounded-t-xl sm:rounded-xl">
            <div className="flex justify-between items-center p-3 border-b border-slate-700 bg-slate-800 rounded-t-xl">
              <div>
                <h3 className="font-bold text-white flex items-center gap-2"><BookOpen size={16}/> Game Log</h3>
                <div className="text-[11px] text-slate-400">Newest actions first. Private draws stay anonymous.</div>
              </div>
              <button onClick={() => setRecapOpen(false)} className="text-slate-400 hover:text-white"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3 bg-slate-900/95">
              {gameLogTurnKeys.length === 0 && (
                <div className="text-sm text-slate-400">No game log entries yet.</div>
              )}
              {gameLogTurnKeys.map((turnKey) => {
                const turnOwnerName = getPlayerNameById(game, gameLogByTurn[turnKey]?.[0]?.turnPlayerId, null);
                return (
                  <div key={turnKey} className="bg-slate-800/70 border border-slate-700 rounded-lg overflow-hidden">
                    <div className="sticky top-0 z-10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-purple-200 bg-slate-800 border-b border-slate-700">
                      Turn {turnKey}{turnOwnerName ? ` — ${turnOwnerName}` : ''}
                    </div>
                    <div className="divide-y divide-slate-700/70">
                      {gameLogByTurn[turnKey].map((entry) => (
                        <div key={entry.id} className="px-3 py-2">
                          <div className="flex items-start gap-2">
                            <span className="mt-1 h-2 w-2 rounded-full bg-purple-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-slate-100 break-words leading-snug">{entry.message}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                                {entry.timestamp && <span>{new Date(entry.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                                {entry.phaseLabel && <span>{entry.phaseLabel}</span>}
                                {entry.category && <span className="uppercase tracking-wide">{entry.category}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CHAT MODAL */}
      {chatOpen && (
        <div className="fixed inset-0 z-[150] pointer-events-none flex justify-end items-end sm:items-start sm:top-16 sm:right-4">
          <div className="pointer-events-auto w-full sm:w-96 h-[80vh] sm:h-[600px] bg-slate-900 border border-slate-700 shadow-2xl flex flex-col rounded-t-xl sm:rounded-xl">
            <div className="flex justify-between items-center p-3 border-b border-slate-700 bg-slate-800 rounded-t-xl">
              <h3 className="font-bold text-white flex items-center gap-2"><MessageSquare size={16}/> Room Chat</h3>
              <button onClick={() => setChatOpen(false)} className="text-slate-400 hover:text-white"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-900/95">
              {chatMessages.map(msg => {
                const isMe = msg.playerId === userId;
                return (
                  <div key={msg.timestamp} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] rounded-lg p-2 text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}`}>
                      {!isMe && <div className="text-[10px] font-bold text-slate-400 mb-0.5">{msg.playerName}</div>}
                      {msg.text}
                    </div>
                    <span className="text-[9px] text-slate-600 mt-0.5">
                      {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-slate-700 bg-slate-800 rounded-b-xl">
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <button
                  onClick={sendChat}
                  disabled={!chatInput.trim()}
                  className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded disabled:opacity-50"
                >
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zone Browser (GY/Exile) */}
      {viewZone && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white capitalize">{viewZone.zone} ({players.find(p => p?.id === viewZone.ownerId)?.name})</h2>
            <button onClick={() => setViewZone(null)}><X className="text-white"/></button>
          </div>
          <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-2 content-start">
            {game.cards.filter(c => c.ownerId === viewZone.ownerId && c.zone === viewZone.zone).map(c => (
              <div key={c.instanceId} className="relative" onClick={() => { setSelectedCard(c); setViewZone(null); }}>
                <img src={getCardImageUri(c)} alt={getCardDisplayName(c)} className="w-full rounded opacity-70 hover:opacity-100" />
                {c.isCommander && <div className="absolute left-1 top-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-950">Commander</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Library Batch Actions Modal */}
      {libraryBatchOpen && (
        <div className="fixed inset-0 bg-black/70 z-[190] flex items-end sm:items-center justify-center p-3" onClick={() => setLibraryBatchOpen(false)}>
          <div className="bg-slate-800 w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-slate-600 p-4 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-white font-extrabold text-lg">Library Batch</h3>
                <p className="text-xs text-slate-400">Own-library shortcuts. Card names stay private unless revealed or moved to public zones.</p>
              </div>
              <button onClick={() => setLibraryBatchOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-700 hover:text-white" aria-label="Close library batch actions"><X size={18} /></button>
            </div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Number of cards
              <input
                type="number"
                min="1"
                max="99"
                value={libraryBatchCount}
                onChange={(event) => setLibraryBatchCount(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-base font-bold text-white outline-none focus:border-cyan-400"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => runLibraryBatchAction('BATCH_DRAW_LIBRARY')} className="rounded-lg bg-blue-700 px-3 py-3 text-sm font-extrabold text-white hover:bg-blue-600 active:scale-95">Draw N</button>
              <button onClick={() => runLibraryBatchAction('BATCH_MILL_LIBRARY')} className="rounded-lg bg-slate-700 px-3 py-3 text-sm font-extrabold text-white hover:bg-slate-600 active:scale-95">Mill N</button>
              <button onClick={() => runLibraryBatchAction('BATCH_REVEAL_LIBRARY')} className="rounded-lg bg-purple-700 px-3 py-3 text-sm font-extrabold text-white hover:bg-purple-600 active:scale-95">Reveal top N</button>
              <button onClick={() => runLibraryBatchAction('BATCH_EXILE_LIBRARY')} className="rounded-lg bg-amber-700 px-3 py-3 text-sm font-extrabold text-white hover:bg-amber-600 active:scale-95">Exile top N</button>
              <button onClick={() => runLibraryBatchAction('BATCH_SCRY_LIBRARY')} className="rounded-lg bg-indigo-700 px-3 py-3 text-sm font-extrabold text-white hover:bg-indigo-600 active:scale-95">Scry N</button>
              <button onClick={() => runLibraryBatchAction('BATCH_SURVEIL_LIBRARY')} className="rounded-lg bg-emerald-700 px-3 py-3 text-sm font-extrabold text-white hover:bg-emerald-600 active:scale-95">Surveil N</button>
            </div>
          </div>
        </div>
      )}

      {/* Reorder Library Modal */}
      {reorderModal && (
        <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 pointer-events-auto">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-600 max-w-sm w-full space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center">
              <h3 className="text-white font-bold text-lg">Reorder Top Cards</h3>
              <button onClick={() => setReorderModal(null)}><X className="text-slate-400"/></button>
            </div>
            {/* N Control */}
            <div className="flex justify-center items-center gap-4 bg-slate-900 p-2 rounded">
              <button onClick={() => changeReorderCount(-1)} className="text-slate-400 hover:text-white px-2 font-bold">-</button>
              <span className="text-white font-mono font-bold">Cards: {reorderModal.n}</span>
              <button onClick={() => changeReorderCount(1)} className="text-slate-400 hover:text-white px-2 font-bold">+</button>
            </div>
            <p className="text-xs text-slate-400 text-center">Top card is first in list</p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {reorderModal.orderedIds.map((id, i) => {
                const c = cardsMap.get(id);
                if (!c) return null;
                return (
                  <div key={c.instanceId} className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-700">
                    <img src={getCardImageUri(c)} alt={getCardDisplayName(c)} className="w-10 h-14 rounded object-cover" />
                    <span className="flex-1 text-sm text-white truncate">{getCardDisplayName(c)}</span>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveReorderItem(i, -1)}
                        disabled={i === 0}
                        className="p-1 bg-slate-700 rounded hover:bg-slate-600 disabled:opacity-30"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        onClick={() => moveReorderItem(i, 1)}
                        disabled={i === reorderModal.orderedIds.length - 1}
                        className="p-1 bg-slate-700 rounded hover:bg-slate-600 disabled:opacity-30"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={submitReorder} className="w-full bg-green-600 py-3 rounded-lg font-bold text-white hover:bg-green-500">Done</button>
          </div>
        </div>
      )}

      {/* Scry / Surveil Batch Review Modal */}
      {libraryReviewModal && (
        <div className="fixed inset-0 bg-black/90 z-[205] flex items-center justify-center p-4 pointer-events-auto">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-600 max-w-sm w-full space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="text-white font-bold text-lg">{libraryReviewModal.mode === 'surveil' ? 'Surveil' : 'Scry'} {libraryReviewModal.n}</h3>
                <p className="text-xs text-slate-400">Top kept card is first. This view is private until you submit.</p>
              </div>
              <button onClick={() => setLibraryReviewModal(null)}><X className="text-slate-400"/></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {[...libraryReviewModal.orderedIds, ...((libraryReviewModal.allIds || []).filter(id => (libraryReviewModal.movedIds || []).includes(id)))].map((id) => cardsMap.get(id)).filter(Boolean).map((c) => {
                const moved = (libraryReviewModal.movedIds || []).includes(c.instanceId);
                const keptIndex = libraryReviewModal.orderedIds.indexOf(c.instanceId);
                return (
                  <div key={c.instanceId} className={`flex items-center gap-2 rounded border p-2 ${moved ? 'border-emerald-700 bg-emerald-950/30' : 'border-slate-700 bg-slate-900'}`}>
                    <img src={getCardImageUri(c)} alt={getCardDisplayName(c)} className="w-10 h-14 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-white">{getCardDisplayName(c)}</div>
                      <button onClick={() => toggleLibraryReviewDestination(c.instanceId)} className={`mt-1 rounded px-2 py-1 text-[11px] font-bold ${moved ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-100 hover:bg-slate-600'}`}>
                        {moved ? (libraryReviewModal.mode === 'surveil' ? 'To graveyard' : 'To bottom') : 'Keep on top'}
                      </button>
                    </div>
                    {!moved && (
                      <div className="flex flex-col gap-1">
                        <button onClick={() => moveLibraryReviewItem(keptIndex, -1)} disabled={keptIndex === 0} className="p-1 bg-slate-700 rounded hover:bg-slate-600 disabled:opacity-30"><ArrowUp size={12} /></button>
                        <button onClick={() => moveLibraryReviewItem(keptIndex, 1)} disabled={keptIndex === libraryReviewModal.orderedIds.length - 1} className="p-1 bg-slate-700 rounded hover:bg-slate-600 disabled:opacity-30"><ArrowDown size={12} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button onClick={submitLibraryReview} className="w-full bg-green-600 py-3 rounded-lg font-bold text-white hover:bg-green-500">Done</button>
          </div>
        </div>
      )}

      {damageModal && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setDamageModal(null)}>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-600 max-w-xs w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-bold text-white">Temporary Damage</h3>
              <div className="text-sm text-slate-300 truncate">{getDisplayCardName(damageModal.cardId)}</div>
            </div>
            <div className="rounded-lg border border-red-500/50 bg-red-950/30 px-3 py-2 text-sm text-red-50">
              Current damage: <span className="font-black">{getCardMarkedDamage(damageModal.cardId)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => applyTempDamageChange(damageModal.cardId, 1)} className="bg-red-700 hover:bg-red-600 rounded py-2 text-white font-bold">+1 damage</button>
              <button onClick={() => applyTempDamageChange(damageModal.cardId, 2)} className="bg-red-700 hover:bg-red-600 rounded py-2 text-white font-bold">+2 damage</button>
              <button onClick={() => applyTempDamageChange(damageModal.cardId, 3)} className="bg-red-700 hover:bg-red-600 rounded py-2 text-white font-bold">+3 damage</button>
              <button onClick={() => applyTempDamageChange(damageModal.cardId, -1)} className="bg-slate-700 hover:bg-slate-600 rounded py-2 text-white font-bold">-1 damage</button>
              <button onClick={() => applyTempDamageChange(damageModal.cardId, 0, true)} className="col-span-2 bg-red-900/40 hover:bg-red-800/40 rounded py-2 text-red-100 border border-red-700 font-bold">Clear damage</button>
            </div>
            <button onClick={() => { setSelectedCard(null); setDamageModal(null); }} className="w-full bg-slate-700 py-2 rounded text-white hover:bg-slate-600">Done</button>
          </div>
        </div>
      )}

      {/* Custom Counter Modal */}
      {customCounterModal && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setCustomCounterModal(null)}>
          <div className="bg-slate-800 p-6 rounded-xl w-full max-w-sm border border-slate-600 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white">Add Counter</h3>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Type (default for +1/+1)</label>
              <input type="text" value={customCounterModal.label} onChange={e => setCustomCounterModal({...customCounterModal, label: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" placeholder="e.g. Loyalty" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Amount</label>
              <div className="flex items-center gap-4 justify-center bg-slate-900 p-2 rounded">
                <button onClick={() => setCustomCounterModal(prev => ({...prev, amount: prev.amount - 1}))} className="w-8 h-8 bg-slate-700 rounded text-white hover:bg-slate-600 font-bold">-</button>
                <span className="font-mono font-bold text-white text-lg">{customCounterModal.amount}</span>
                <button onClick={() => setCustomCounterModal(prev => ({...prev, amount: prev.amount + 1}))} className="w-8 h-8 bg-slate-700 rounded text-white hover:bg-slate-600 font-bold">+</button>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setCustomCounterModal(null)} className="flex-1 bg-slate-700 py-2 rounded text-white hover:bg-slate-600">Cancel</button>
              <button onClick={() => {
                handleAction('MOD_COUNTER', { cardId: customCounterModal.cardId, amount: customCounterModal.amount, label: customCounterModal.label.trim() || 'default' });
                setCustomCounterModal(null);
              }} className="flex-1 bg-green-600 py-2 rounded text-white hover:bg-green-500 font-bold">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Token Tools Panel */}
      {tokenModal && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-end justify-center p-2 sm:items-center sm:p-4" onClick={() => setTokenModal(null)}>
          <div data-tutorial-anchor="token-tools" className={`max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-slate-600 bg-slate-800 shadow-2xl sm:rounded-2xl${getTutorialAnchorClass(currentTutorialAnchor, 'token-tools', tutorialPulseAnchor)}`} onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-700 bg-slate-800/95 px-4 py-3 backdrop-blur">
              <div>
                <h3 className="text-lg font-extrabold text-white">Token Tools</h3>
                <p className="text-xs text-slate-400">Quick presets first, custom token below.</p>
              </div>
              <button
                onClick={() => setTokenModal(null)}
                className="rounded-full bg-slate-700 p-2 text-slate-200 hover:bg-slate-600"
                aria-label="Close token tools"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div>
                <div className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-400">Presets</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TOKEN_PRESETS.map((preset) => {
                    const accent = getTokenColorAccent(preset.color, preset.colorIdentity);
                    return (
                      <button
                        key={preset.id}
                        onClick={() => submitTokenPreset(preset)}
                        className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-bold shadow-sm bg-gradient-to-br ${accent.frame} active:scale-[0.98]`}
                      >
                        <div className="leading-tight">{preset.label}</div>
                        <div className="mt-0.5 text-[10px] font-semibold opacity-75">Tap to create</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {getPlayerDeckExtras(myPlayer).tokens.length > 0 && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-3">
                  <div className="mb-2 text-[11px] font-black uppercase tracking-widest text-emerald-200">From your deck</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {getPlayerDeckExtras(myPlayer).tokens.map((template) => {
                      const accent = getTokenColorAccent(getTokenColorLabel(template.colorIdentity), template.colorIdentity);
                      const pt = isCreatureTypeLine(template.typeLine) && template.power && template.toughness ? `${template.power}/${template.toughness} ` : '';
                      return (
                        <button
                          key={getDeckExtraDedupKey(template)}
                          type="button"
                          onClick={() => submitDeckTokenTemplate(template)}
                          className={`min-h-14 rounded-xl border px-3 py-2 text-left text-sm font-bold shadow-sm bg-gradient-to-br ${accent.frame} active:scale-[0.98]`}
                        >
                          <div className="truncate leading-tight">{pt}{template.name}</div>
                          <div className="mt-0.5 truncate text-[10px] font-semibold opacity-75">{template.typeLine}</div>
                          {template.sourceCards?.length > 0 && <div className="mt-0.5 truncate text-[10px] opacity-70">From {template.sourceCards.join(', ')}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-700 bg-slate-900/55 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">Custom token</div>
                    <div className="text-[11px] text-slate-500">Choose quantity and tapped state before creating.</div>
                  </div>
                  <button
                    onClick={() => setTokenModal(getDefaultCustomToken())}
                    className="rounded-lg bg-slate-700 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-600"
                  >
                    Reset
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-300">Name</label>
                    <input type="text" value={tokenModal.name} onChange={e => setTokenModal({...tokenModal, name: e.target.value})} className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" placeholder="Saproling" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">Colors</label>
                    <div className="rounded-lg border border-slate-700 bg-slate-950 p-2">
                      <div className="flex flex-wrap gap-1.5">
                        {TOKEN_COLOR_SYMBOLS.map(({ symbol, name, chip }) => {
                          const selectedColors = normalizeTokenColorIdentity(tokenModal.colorIdentity, tokenModal.color);
                          const isSelected = selectedColors.includes(symbol);
                          const nextColors = isSelected ? selectedColors.filter((colorSymbol) => colorSymbol !== symbol) : [...selectedColors, symbol];
                          return (
                            <button
                              key={symbol}
                              type="button"
                              title={name}
                              onClick={() => setTokenModal({ ...tokenModal, colorIdentity: nextColors, color: getTokenColorLabel(nextColors) })}
                              className={`h-9 w-9 rounded-full border text-sm font-black transition ${isSelected ? `${chip} shadow ring-2 ring-white/40` : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                            >
                              {symbol}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 text-xs font-bold text-slate-300">
                        {getTokenColorLabel(tokenModal.colorIdentity, tokenModal.color)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">Quantity</label>
                    <input type="number" min="1" max="99" value={tokenModal.quantity} onChange={e => setTokenModal({...tokenModal, quantity: e.target.value})} className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-300">Type line</label>
                    <input type="text" value={tokenModal.typeLine} onChange={e => setTokenModal({...tokenModal, typeLine: e.target.value})} className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" placeholder="Token Creature — Saproling" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-300">Abilities / rules text</label>
                    <textarea value={tokenModal.rulesText || ''} onChange={e => setTokenModal({...tokenModal, rulesText: e.target.value})} className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" placeholder="Flying" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">Power</label>
                    <input type="text" inputMode="numeric" value={tokenModal.power} onChange={e => setTokenModal({...tokenModal, power: e.target.value})} className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" placeholder="1" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">Toughness</label>
                    <input type="text" inputMode="numeric" value={tokenModal.toughness} onChange={e => setTokenModal({...tokenModal, toughness: e.target.value})} className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" placeholder="1" />
                  </div>
                  <label className="sm:col-span-2 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-200">
                    <span>Create tapped</span>
                    <input type="checkbox" checked={Boolean(tokenModal.tapped)} onChange={e => setTokenModal({...tokenModal, tapped: e.target.checked})} className="h-5 w-5 accent-green-500" />
                  </label>
                </div>

                <button onClick={submitCustomToken} className="mt-4 min-h-12 w-full rounded-xl bg-green-600 py-2 text-base font-black text-white hover:bg-green-500">
                  Create Custom Token{Number.parseInt(tokenModal.quantity, 10) > 1 ? `s (${clamp(Number.parseInt(tokenModal.quantity, 10) || 1, 1, 99)})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Library Search Modal */}
      {searchLibraryOwner && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex flex-col p-4 animate-in fade-in">
          <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <h2 className="text-lg font-bold text-white">Searching {searchLibraryOwner === userId ? 'Your' : "Opponent's"} Library</h2>
            <button onClick={() => setSearchLibraryOwner(null)}><X className="text-white"/></button>
          </div>
          <input type="text" placeholder="Filter cards..." className="bg-slate-800 text-white p-2 rounded mb-4 border border-slate-700" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-2 content-start">
            {game.cards
              .filter(c => c.ownerId === searchLibraryOwner && c.zone === ZONES.LIBRARY)
              .filter(c => getCardDisplayName(c).toLowerCase().includes(searchQuery.toLowerCase()))
              .map(c => (
                <div key={c.instanceId} className="relative group" onClick={() => setSelectedCard(c)}>
                  <img src={getCardImageUri(c)} alt={getCardDisplayName(c)} className="w-full rounded" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2">
                    <span className="text-xs font-bold text-white mb-1">{getCardDisplayName(c)}</span>
                    <button onClick={(e) => {e.stopPropagation(); handleAction('MOVE_ZONE', { cardId: c.instanceId, targetZone: ZONES.HAND }); setSearchLibraryOwner(null);}} className="bg-blue-600 text-xs px-2 py-1 rounded">To Hand</button>
                    <button onClick={(e) => {e.stopPropagation(); handleAction('MOVE_ZONE', { cardId: c.instanceId, targetZone: ZONES.BATTLEFIELD }); setSearchLibraryOwner(null);}} className="bg-green-600 text-xs px-2 py-1 rounded">To Play</button>
                    <button onClick={(e) => {e.stopPropagation(); handleAction('MOVE_ZONE', { cardId: c.instanceId, targetZone: ZONES.GRAVEYARD }); setSearchLibraryOwner(null);}} className="bg-red-600 text-xs px-2 py-1 rounded">To GY</button>
                    <button onClick={(e) => {e.stopPropagation(); handleAction('SCRY_BOTTOM', { cardId: c.instanceId }); setSearchLibraryOwner(null);}} className="bg-slate-600 text-xs px-2 py-1 rounded">To Bottom</button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Player Stats Modal */}
      {playerStatsOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPlayerStatsOpen(false)}>
          <div data-tutorial-anchor="player-counters-panel" className={`max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-xl border border-slate-600 bg-slate-800 p-5${getTutorialAnchorClass(currentTutorialAnchor, 'player-counters-panel', tutorialPulseAnchor)}`} onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 text-white">Player Counters & Statuses</h3>
            <div className="space-y-4">
              <div data-tutorial-anchor="mana-pool-panel" className={`rounded-lg border border-blue-500/30 bg-blue-950/20 p-3${getTutorialAnchorClass(currentTutorialAnchor, 'mana-pool-panel', tutorialPulseAnchor)}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-200">Mana Pool</div>
                    <div className="text-[11px] text-slate-400">Manual floating mana tracker. No payment automation.</div>
                  </div>
                  <span className="rounded-full border border-blue-500/40 bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-100">{getManaPoolSummary(myPlayer)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {MANA_COLORS.map((color) => {
                    const amount = getPlayerManaPool(myPlayer)[color];
                    return (
                      <div key={color} className="flex items-center justify-between rounded bg-slate-900/80 p-2">
                        <div>
                          <div className="text-sm font-black text-white">{color} <span className="text-blue-200">{amount}</span></div>
                          <div className="text-[10px] text-slate-500">{MANA_COLOR_LABELS[color]}</div>
                        </div>
                        <div className="flex gap-1.5">
                          <button type="button" disabled={!canAct || amount <= 0} onClick={() => adjustManaPool(color, -1)} className="h-8 w-8 rounded bg-slate-800 text-lg font-black text-red-300 disabled:opacity-40">-</button>
                          <button type="button" disabled={!canAct} onClick={() => adjustManaPool(color, 1)} className="h-8 w-8 rounded bg-slate-800 text-lg font-black text-green-300 disabled:opacity-40">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={!canAct || !hasFloatingMana(myPlayer)}
                  onClick={handleClearManaPool}
                  className="mt-3 w-full rounded-lg border border-blue-500/40 bg-blue-900/40 px-3 py-2 text-sm font-bold text-blue-100 disabled:opacity-40"
                >
                  Clear mana pool
                </button>
              </div>
              {[...defaultPlayerCounters, ...Object.keys(myPlayer?.counters || {}).filter(type => !defaultPlayerCounters.includes(type) && (commanderModeEnabled || type !== 'commanderTax'))].map(type => (
                <div key={type} className="flex justify-between items-center bg-slate-700 p-3 rounded">
                  <span className="capitalize text-slate-300 font-medium">{PLAYER_COUNTER_LABELS[type] || type}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleAction('PLAYER_COUNTER', { counterType: type, amount: -1 })} className="w-8 h-8 rounded bg-slate-900 text-red-400 font-bold">-</button>
                    <span className="w-6 text-center font-bold text-white">{myPlayer?.counters?.[type] || 0}</span>
                    <button onClick={() => handleAction('PLAYER_COUNTER', { counterType: type, amount: 1 })} className="w-8 h-8 rounded bg-slate-900 text-green-400 font-bold">+</button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => {
                  const label = window.prompt('Custom player counter name');
                  const counterType = label?.trim();
                  if (counterType) handleAction('PLAYER_COUNTER', { counterType, amount: 1 });
                }}
                className="w-full rounded-lg border border-dashed border-slate-500 bg-slate-900/50 px-3 py-2 text-sm font-bold text-blue-200 hover:border-blue-400 hover:text-white"
              >
                Add Custom Player Counter
              </button>
              <div className="rounded-lg border border-violet-500/30 bg-violet-950/10 p-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-violet-200">Player reminders</div>
                {getPlayerReminders(viewAsPlayerId).length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {getPlayerReminders(viewAsPlayerId).map((reminder) => (
                      <button
                        key={reminder.id}
                        type="button"
                        onClick={() => removePlayerReminder(viewAsPlayerId, reminder.id)}
                        className="max-w-full truncate rounded border border-violet-500/50 bg-violet-950/70 px-2 py-1 text-xs font-bold text-violet-50"
                        title={`${getReminderTitle(reminder)} · Tap to remove`}
                      >
                        🔔 {reminder.text} <span className="text-violet-300">×</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mb-3 text-xs text-slate-400">No player reminders.</div>
                )}
                <ReminderTool label="Add Player Reminder" onAdd={(reminder) => addPlayerReminder(viewAsPlayerId, reminder)} disabled={!canAct} />
              </div>

              <div data-tutorial-anchor="status-panel" className={`rounded-lg border border-amber-500/30 bg-slate-900/60 p-3${getTutorialAnchorClass(currentTutorialAnchor, 'status-panel', tutorialPulseAnchor)}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Player Status Badges</div>
                    <div className="text-[11px] text-slate-400">Manual only. No rules automation.</div>
                  </div>
                  <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] font-bold text-slate-300">Status</span>
                </div>
                <div className="mb-3 rounded-lg border border-slate-700 bg-slate-950/70 p-2">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Day / Night</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { value: 'day', label: 'Day' },
                      { value: 'night', label: 'Night' },
                      { value: null, label: 'Unset' }
                    ].map((option) => {
                      const active = getDayNightValue(game) === option.value;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => handleAction('SET_DAY_NIGHT', { value: option.value })}
                          disabled={!canAct}
                          className={`min-h-9 rounded border px-2 py-1 text-xs font-black ${active ? 'border-purple-400 bg-purple-700 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'} disabled:opacity-50`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-3">
                  {(game.players || []).map((player) => {
                    const statuses = getPlayerStatuses(player);
                    return (
                      <div key={player.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-white">{player.name || 'Player'}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {renderPlayerStatusBadges(player, 'tiny')}
                              {renderPlayerEmblemBadges(player, 'tiny')}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 rounded border border-orange-500/30 bg-orange-950/30 px-2 py-1 text-xs font-black text-orange-100">
                            Ring {statuses.ringBearerLevel}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button type="button" disabled={!canAct} onClick={() => handleAction('PLAYER_STATUS_TOGGLE', { targetPlayerId: player.id, statusType: 'monarch' })} className={`min-h-9 rounded px-2 py-1 text-[11px] font-black ${statuses.monarch ? 'bg-amber-600 text-slate-950' : 'bg-slate-800 text-slate-200'} disabled:opacity-50`}>Monarch</button>
                          <button type="button" disabled={!canAct} onClick={() => handleAction('PLAYER_STATUS_TOGGLE', { targetPlayerId: player.id, statusType: 'initiative' })} className={`min-h-9 rounded px-2 py-1 text-[11px] font-black ${statuses.initiative ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200'} disabled:opacity-50`}>Initiative</button>
                          <button type="button" disabled={!canAct} onClick={() => handleAction('PLAYER_STATUS_TOGGLE', { targetPlayerId: player.id, statusType: 'citysBlessing' })} className={`min-h-9 rounded px-2 py-1 text-[11px] font-black ${statuses.citysBlessing ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'} disabled:opacity-50`}>City</button>
                        </div>
                        <div className="mt-2 grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-1.5">
                          <button type="button" disabled={!canAct || statuses.ringBearerLevel <= 0} onClick={() => handleAction('RING_TEMPTATION', { targetPlayerId: player.id, amount: -1 })} className="min-h-9 rounded bg-slate-800 text-lg font-black text-red-300 disabled:opacity-40">-</button>
                          <div className="rounded bg-slate-900 px-2 py-2 text-center text-xs font-bold text-orange-100">Ring temptation {statuses.ringBearerLevel} / 4</div>
                          <button type="button" disabled={!canAct || statuses.ringBearerLevel >= 4} onClick={() => handleAction('RING_TEMPTATION', { targetPlayerId: player.id, amount: 1 })} className="min-h-9 rounded bg-slate-800 text-lg font-black text-green-300 disabled:opacity-40">+</button>
                        </div>
                        {statuses.custom.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {statuses.custom.map((text, index) => (
                              <button key={`${text}-${index}`} type="button" disabled={!canAct} onClick={() => handleAction('PLAYER_STATUS_REMOVE_CUSTOM', { targetPlayerId: player.id, index })} className="max-w-full truncate rounded border border-violet-500/50 bg-violet-950/70 px-2 py-1 text-xs font-bold text-violet-50 disabled:opacity-50" title="Tap to remove custom status">
                                {text} <span className="text-violet-300">×</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={!canAct || statuses.custom.length >= MAX_CUSTOM_PLAYER_STATUSES}
                          onClick={() => {
                            const text = window.prompt(`Add custom status for ${player.name || 'Player'}`);
                            if (text) handleAction('PLAYER_STATUS_ADD_CUSTOM', { targetPlayerId: player.id, text });
                          }}
                          className="mt-2 w-full rounded border border-dashed border-violet-500/50 bg-violet-950/20 px-2 py-1.5 text-xs font-bold text-violet-100 hover:bg-violet-900/40 disabled:opacity-50"
                        >
                          Add Custom Status
                        </button>

                        {getPlayerDeckExtras(player).dungeons.length > 0 && (
                          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/10 p-2">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Dungeon references</div>
                                <div className="text-[11px] text-slate-400">From venture / initiative cards in deck.</div>
                              </div>
                              <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-100">{getPlayerDeckExtras(player).dungeons.length}</span>
                            </div>
                            <div className="space-y-2">
                              {getPlayerDeckExtras(player).dungeons.map((dungeon) => {
                                const dungeonKey = `${player.id}:${getDeckExtraDedupKey(dungeon)}`;
                                const expanded = expandedDungeonId === dungeonKey;
                                return (
                                  <div key={dungeonKey} className="rounded border border-slate-700 bg-slate-950/70 p-2">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedDungeonId(expanded ? null : dungeonKey)}
                                      className="w-full text-left"
                                    >
                                      <div className="truncate text-xs font-black text-emerald-100">{dungeon.name}</div>
                                      <div className="truncate text-[10px] text-slate-400">{dungeon.typeLine}</div>
                                    </button>
                                    {expanded && (
                                      <div className="mt-2 space-y-2">
                                        {dungeon.imageUrl && <img src={dungeon.imageUrl} alt={dungeon.name} className="max-h-64 w-full rounded border border-slate-700 object-contain" loading="lazy" />}
                                        <div className="whitespace-pre-wrap rounded bg-slate-900 p-2 text-xs leading-relaxed text-slate-200">
                                          {dungeon.oracleText || 'No dungeon text available.'}
                                        </div>
                                        {dungeon.sourceCards?.length > 0 && <div className="text-[10px] text-slate-400">Sources: {dungeon.sourceCards.join(', ')}</div>}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="mt-3 rounded-lg border border-pink-500/30 bg-pink-950/10 p-2">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-pink-200">Emblems</div>
                              <div className="text-[11px] text-slate-400">Manual player-level effects.</div>
                            </div>
                            <span className="rounded-full border border-pink-500/30 px-2 py-0.5 text-[10px] font-bold text-pink-100">{getPlayerEmblems(player).length}</span>
                          </div>
                          {getPlayerEmblems(player).length > 0 ? (
                            <div className="space-y-2">
                              {getPlayerEmblems(player).map((emblem) => {
                                const expanded = expandedEmblemId === emblem.id;
                                return (
                                  <div key={emblem.id} className="rounded border border-slate-700 bg-slate-950/70 p-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedEmblemId(expanded ? null : emblem.id)}
                                        className="min-w-0 flex-1 text-left"
                                      >
                                        <div className="truncate text-xs font-black text-pink-100">{emblem.name}</div>
                                        {emblem.sourceName && <div className="truncate text-[10px] text-slate-400">Source: {emblem.sourceName}</div>}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canAct}
                                        onClick={() => removePlayerEmblem(player.id, emblem)}
                                        className="rounded bg-red-950/70 px-2 py-1 text-[10px] font-bold text-red-100 disabled:opacity-50"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                    {expanded && (
                                      <div className="mt-2 whitespace-pre-wrap rounded bg-slate-900 p-2 text-xs leading-relaxed text-slate-200">
                                        {emblem.text || 'No emblem text.'}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded bg-slate-950/60 p-2 text-xs text-slate-400">No emblems.</div>
                          )}

                          {emblemFormPlayerId === player.id ? (
                            <div className="mt-2 space-y-2 rounded border border-pink-500/30 bg-slate-950/80 p-2">
                              <input
                                type="text"
                                value={emblemForm.name}
                                onChange={(event) => setEmblemForm((prev) => ({ ...prev, name: event.target.value }))}
                                placeholder="Emblem name"
                                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white outline-none focus:border-pink-400"
                              />
                              <input
                                type="text"
                                value={emblemForm.sourceName}
                                onChange={(event) => setEmblemForm((prev) => ({ ...prev, sourceName: event.target.value }))}
                                placeholder="Source name (optional)"
                                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white outline-none focus:border-pink-400"
                              />
                              <textarea
                                value={emblemForm.text}
                                onChange={(event) => setEmblemForm((prev) => ({ ...prev, text: event.target.value }))}
                                placeholder="Emblem text / rules"
                                rows={3}
                                className="w-full resize-none rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white outline-none focus:border-pink-400"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => { resetEmblemForm(); setEmblemFormPlayerId(null); }}
                                  className="rounded bg-slate-700 px-2 py-2 text-xs font-bold text-slate-100"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={!canAct || !sanitizeEmblemName(emblemForm.name) || !sanitizeEmblemText(emblemForm.text)}
                                  onClick={() => submitEmblemForm(player.id)}
                                  className="rounded bg-pink-700 px-2 py-2 text-xs font-black text-white disabled:opacity-50"
                                >
                                  Create Emblem
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {getPlayerDeckExtras(player).emblems.length > 0 && (
                                <div className="rounded border border-pink-500/25 bg-pink-950/20 p-2">
                                  <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-pink-200">From your deck</div>
                                  <div className="grid grid-cols-1 gap-1.5">
                                    {getPlayerDeckExtras(player).emblems.map((template) => (
                                      <button
                                        key={getDeckExtraDedupKey(template)}
                                        type="button"
                                        disabled={!canAct || getPlayerEmblems(player).length >= MAX_PLAYER_EMBLEMS}
                                        onClick={() => addEmblemFromDeckTemplate(player.id, template)}
                                        className="rounded border border-pink-400/30 bg-pink-900/30 px-2 py-1.5 text-left text-[11px] font-bold text-pink-50 disabled:opacity-50"
                                      >
                                        <div className="truncate">{template.name}</div>
                                        {template.sourceCards?.length > 0 && <div className="truncate text-[10px] font-medium text-pink-100/70">From {template.sourceCards.join(', ')}</div>}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-1.5">
                                {PLAYER_EMBLEM_PRESETS.map((preset) => (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    disabled={!canAct || getPlayerEmblems(player).length >= MAX_PLAYER_EMBLEMS}
                                    onClick={() => openEmblemFormForPlayer(player.id, preset)}
                                    className="rounded border border-pink-500/30 bg-pink-950/30 px-2 py-1.5 text-[11px] font-bold text-pink-100 disabled:opacity-50"
                                  >
                                    {preset.label}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  disabled={!canAct || getPlayerEmblems(player).length >= MAX_PLAYER_EMBLEMS}
                                  onClick={() => openEmblemFormForPlayer(player.id)}
                                  className="rounded border border-dashed border-pink-500/50 bg-pink-950/20 px-2 py-1.5 text-[11px] font-bold text-pink-100 disabled:opacity-50"
                                >
                                  Custom…
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Commander Damage Summary */}
      {commanderDamageSummaryPlayerId && (() => {
        const targetPlayer = (game.players || []).find((player) => player.id === commanderDamageSummaryPlayerId);
        const rows = getCommanderDamageRowsForPlayer(commanderDamageSummaryPlayerId);
        return (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setCommanderDamageSummaryPlayerId(null)}>
            <div className="w-full max-w-sm rounded-xl border border-amber-500/40 bg-slate-800 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white"><Crown size={18} className="text-amber-300"/> Commander Damage</h3>
                <button onClick={() => setCommanderDamageSummaryPlayerId(null)}><X className="text-slate-400" /></button>
              </div>
              <div className="mb-3 text-sm text-slate-300">Commander damage to <span className="font-bold text-white">{targetPlayer?.name || 'Player'}</span>:</div>
              <div className="space-y-2">
                {rows.length === 0 ? (
                  <div className="rounded bg-slate-900/60 p-3 text-sm text-slate-400">No commander damage marked.</div>
                ) : rows.map(({ card, amount }) => (
                  <div key={card.instanceId} className="flex items-center justify-between rounded bg-slate-900/70 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-100">{getCardDisplayName(card, 'Commander')}</span>
                    <span className="font-black text-amber-200">{amount} / 21</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Peek Modal */}
      {peekCard && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex flex-col items-center justify-center p-4" onClick={() => setPeekCard(null)}>
          <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2"><EyeOff /> Peeking at Face-Down Card</h3>
          <img src={getCardImageUri(peekCard)} alt={getCardDisplayName(peekCard)} className="max-w-full max-h-[70vh] rounded-xl shadow-2xl border-4 border-blue-500" />
          <p className="text-slate-400 mt-4 text-sm">Only you can see this.</p>
        </div>
      )}

      {/* Revealed Cards Modal */}
      {revealsOpen && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Revealed Cards</h2>
              <p className="text-xs text-slate-400">View reveals and manage reveal tools.</p>
            </div>
            <button onClick={() => setRevealsOpen(false)}><X className="text-white"/></button>
          </div>
          {canAct && (
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-slate-700 bg-slate-900/70 p-3">
              <button
                onClick={() => handleAction('TOGGLE_HAND_REVEAL')}
                className={`min-h-11 rounded-lg px-4 py-2 text-sm font-bold flex items-center justify-center gap-2 border ${handRevealed ? 'bg-purple-900/50 text-purple-100 border-purple-500/50 hover:bg-purple-800/60' : 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700'}`}
              >
                {handRevealed ? <Unlock size={16} /> : <Lock size={16} />}
                {handRevealed ? 'Hide hand' : 'Reveal hand'}
              </button>
              <button
                onClick={() => handleAction('REVEAL_ALL_HAND')}
                disabled={myHand.length === 0}
                className={`min-h-11 rounded-lg px-4 py-2 text-sm font-bold flex items-center justify-center gap-2 border ${myHand.length > 0 ? 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700' : 'bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed'}`}
                title={myHand.length > 0 ? 'Reveal each card in your hand to the public reveals list' : 'No cards in hand to reveal'}
              >
                <Eye size={16} /> Reveal all hand cards
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-4 p-2 content-start">
            {[...(game.reveals || [])].reverse().map(r => (
              <div key={r.id} className="bg-slate-800 p-2 rounded border border-slate-700 flex flex-col gap-2">
                <img src={r.cardImage} className="w-full rounded cursor-pointer hover:opacity-80" onClick={() => setZoomedCard({ name: r.cardName, image_uri: r.cardImage })} />
                <div className="text-xs text-center">
                  <div className="font-bold text-white truncate">{r.cardName}</div>
                  <div className="text-slate-400">by {r.revealerName}</div>
                </div>
              </div>
            ))}
            {(game.reveals || []).length === 0 && (
              <div className="col-span-full text-center text-slate-500 py-10">No cards currently revealed.</div>
            )}
          </div>
          <button
            onClick={() => { handleAction('CLEAR_REVEALS'); setRevealsOpen(false); }}
            className="w-full mt-4 bg-red-900/50 hover:bg-red-800 text-red-200 py-3 rounded-lg font-bold border border-red-800"
          >
            Clear All Reveals
          </button>
        </div>
      )}

      {scryCard && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-600 max-w-sm w-full text-center space-y-4">
            <h3 className="text-white font-bold text-lg">
              {scryCard.ownerId === userId ? 'Scry 1: Top of Library' : 'Peek: Top of Opponent Library'}
            </h3>
            <div className="flex justify-center">
              <img src={getCardImageUri(scryCard)} alt={getCardDisplayName(scryCard)} className="h-64 rounded-lg shadow-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleAction('SCRY_KEEP_TOP')} className="bg-slate-600 hover:bg-slate-500 py-3 rounded-lg font-bold">Keep on Top</button>
              <button onClick={() => handleAction('SCRY_BOTTOM', { cardId: scryCard.instanceId })} className="bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold">Bottom</button>
            </div>
          </div>
        </div>
      )}

      {selectedCard && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200" onClick={() => setSelectedCard(null)}>
          <div data-tutorial-anchor="card-detail" className={`bg-slate-800 w-full max-w-sm rounded-xl p-4 shadow-2xl border border-slate-600 max-h-[85vh] overflow-y-auto${getTutorialAnchorClass(currentTutorialAnchor, 'card-detail', tutorialPulseAnchor)}`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-700 pb-2 mb-3">
              <span className="font-bold text-lg text-white truncate pr-2">{getDisplayCardName(selectedCard)}</span>
              <button onClick={() => setSelectedCard(null)}><X className="text-slate-400" /></button>
            </div>

            <div className="space-y-3">
              {selectedCard.zone === ZONES.BATTLEFIELD && (() => {
                const attachmentInfo = getAttachmentInfo(selectedCard);
                const hasAttachmentDetails = attachmentInfo.attachedToLabel || attachmentInfo.attachedCards.length > 0;
                return hasAttachmentDetails ? (
                  <section className="space-y-2 rounded-lg border border-fuchsia-500/40 bg-fuchsia-950/20 p-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-200">Attachment details</h3>
                    {attachmentInfo.attachedToType === 'card' && <div className="text-sm text-slate-100">Attached to: <span className="font-bold">{attachmentInfo.attachedToLabel}</span></div>}
                    {attachmentInfo.attachedToType === 'player' && <div className="text-sm text-slate-100">Attached to player: <span className="font-bold">{attachmentInfo.attachedToLabel}</span></div>}
                    {attachmentInfo.attachedCards.length > 0 && (
                      <div className="text-sm text-slate-100">
                        <div className="font-bold">Has attached:</div>
                        <ul className="mt-1 list-disc pl-4 space-y-0.5">
                          {attachmentInfo.attachedCards.map((attachedCard) => <li key={attachedCard.instanceId}>{getDisplayCardName(attachedCard)}</li>)}
                        </ul>
                      </div>
                    )}
                  </section>
                ) : null;
              })()}

              {selectedCard.zone === ZONES.BATTLEFIELD && (() => {
                const liveSelectedCard = cardsMap.get(selectedCard.instanceId) || selectedCard;
                const reminders = getEntityReminders(liveSelectedCard);
                return (
                  <section className="space-y-2 rounded-lg border border-violet-500/40 bg-violet-950/20 p-3">
                    <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-200"><Bell size={12} /> Reminders</h3>
                    {reminders.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {reminders.map((reminder) => (
                          <button
                            key={reminder.id}
                            type="button"
                            onClick={() => removeCardReminder(selectedCard.instanceId, reminder.id)}
                            className="max-w-full truncate rounded border border-violet-500/50 bg-violet-950/80 px-2 py-1 text-left text-xs font-bold text-violet-50"
                            title={`${getReminderTitle(reminder)} · Tap to remove`}
                          >
                            🔔 {reminder.text} <span className="text-violet-300">×</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">No reminders on this card.</div>
                    )}
                    {canAct && <ReminderTool label="Add Reminder" onAdd={(reminder) => addCardReminder(selectedCard.instanceId, reminder)} />}
                  </section>
                );
              })()}

              {(() => {
                const liveSelectedCard = cardsMap.get(selectedCard.instanceId) || selectedCard;
                const faces = getUsableCardFaces(liveSelectedCard);
                const canSeeFaceTools = isDoubleFacedCard(liveSelectedCard) && (!liveSelectedCard.faceDown || liveSelectedCard.controllerId === viewAsPlayerId || liveSelectedCard.ownerId === viewAsPlayerId);
                if (!canSeeFaceTools) return null;
                const activeIndex = getActiveFaceIndex(liveSelectedCard);
                const activeFace = faces[activeIndex];
                const otherIndex = (activeIndex + 1) % faces.length;
                const otherFace = getCardFaceAt(liveSelectedCard, otherIndex);
                const otherImage = getBestImageUriFromImageUris(otherFace?.image_uris) || otherFace?.image_uri || null;
                return (
                  <section className="space-y-2 rounded-lg border border-cyan-500/40 bg-cyan-950/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-200"><Repeat size={12} /> Double-faced card</h3>
                      <span className="rounded-full border border-cyan-400/40 bg-cyan-900/40 px-2 py-0.5 text-[10px] font-bold text-cyan-100">Face {activeIndex + 1}/{faces.length}</span>
                    </div>
                    <div className="text-sm text-slate-100">Current face: <span className="font-bold">{activeFace?.name || getCardDisplayName(liveSelectedCard)}</span></div>
                    <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2" aria-label="Other face preview only; use the Transform button to switch faces">
                      <div className="flex gap-2">
                        {otherImage && <img src={otherImage} alt={otherFace?.name || 'Other face'} className="h-24 w-16 rounded object-cover border border-slate-700" />}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">View other face</div>
                          <div className="font-bold text-slate-100 leading-tight">{otherFace?.name || 'Other face'}</div>
                          <div className="text-xs font-semibold text-cyan-100/90">{otherFace?.type_line || '—'}</div>
                          <div className="max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-slate-300">{getCardOracleText({ ...liveSelectedCard, activeFaceIndex: otherIndex }, 'No rules text.')}</div>
                        </div>
                      </div>
                    </div>
                    {canAct && liveSelectedCard.controllerId === viewAsPlayerId && renderDebuggableCardActionButton({
                      buttonName: 'Transform / Switch Face',
                      actionType: 'SWITCH_CARD_FACE',
                      payload: { cardId: liveSelectedCard.instanceId, faceIndex: otherIndex },
                      card: liveSelectedCard,
                      className: "min-h-10 w-full rounded-lg border border-cyan-500/50 bg-cyan-900/50 p-2 text-sm font-bold text-cyan-50 hover:bg-cyan-800/70 flex items-center justify-center gap-2",
                      onClick: () => { handleAction('SWITCH_CARD_FACE', { cardId: liveSelectedCard.instanceId, faceIndex: otherIndex }); setSelectedCard(null); },
                      children: <><Repeat size={14} /> Transform / Switch to {otherFace?.name || 'other face'}</>
                    })}
                  </section>
                );
              })()}

              {isDebugActionsEnabled() && selectedCard && (() => {
                const snapshot = getSelectedCardDebugSnapshot(selectedCard);
                return (
                  <section className="space-y-2 rounded-lg border border-yellow-400/50 bg-yellow-950/20 p-3 text-xs">
                    <h3 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-yellow-200"><Bug size={12} /> Debug card actions</h3>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-200">
                      <div className="text-slate-400">Selected id</div><div className="truncate font-mono">{snapshot.selectedCardInstanceId || '—'}</div>
                      <div className="text-slate-400">Live card found?</div><div className={snapshot.liveCardFound ? 'text-green-300' : 'text-red-300'}>{snapshot.liveCardFound ? 'yes' : 'no'}</div>
                      <div className="text-slate-400">Stale/different?</div><div className={snapshot.selectedCardDiffersFromLiveCard ? 'text-amber-300' : 'text-slate-200'}>{snapshot.selectedCardDiffersFromLiveCard ? 'yes' : 'no'}</div>
                      <div className="text-slate-400">Zone</div><div>{snapshot.zone || '—'}</div>
                      <div className="text-slate-400">Owner/controller</div><div className="truncate font-mono">{snapshot.ownerId || '—'} / {snapshot.controllerId || '—'}</div>
                      <div className="text-slate-400">Active face</div><div>{snapshot.activeFaceIndex}</div>
                      <div className="text-slate-400">Face count</div><div>{snapshot.cardFacesLength} raw / {snapshot.usableFaceCount} usable</div>
                      <div className="text-slate-400">Display name</div><div className="truncate">{snapshot.displayName || '—'}</div>
                      <div className="text-slate-400">Type line</div><div className="truncate">{snapshot.typeLine || '—'}</div>
                      <div className="text-slate-400">Land?</div><div>{snapshot.isLand ? 'yes' : 'no'}</div>
                      <div className="text-slate-400">Spell kind</div><div>{snapshot.isInstantOrSorcery ? 'instant/sorcery' : snapshot.isPermanent ? 'permanent' : 'unknown'}</div>
                      <div className="text-slate-400">canPlayLand</div><div>{snapshot.canPlayLandCondition ? 'yes' : 'no'}</div>
                      <div className="text-slate-400">canCast</div><div>{snapshot.canCastCondition ? 'yes' : 'no'}</div>
                      <div className="text-slate-400">Transform available?</div><div>{snapshot.transformAvailable ? 'yes' : 'no'}</div>
                      <div className="text-slate-400">User / priority</div><div className="truncate font-mono">{snapshot.currentUserId || '—'} / {snapshot.priorityPlayerId || '—'}</div>
                    </div>
                  </section>
                );
              })()}

              {selectedCard.isToken && (
                <section className="space-y-2 rounded-lg border border-amber-400/30 bg-slate-900/40 p-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Token details</h3>
                  <div className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-sm">
                    <div className="text-slate-400">Color</div>
                    <div className="font-semibold text-slate-100">{getTokenColorLabel(selectedCard.colorIdentity, selectedCard.color)}</div>
                    <div className="text-slate-400">Type</div>
                    <div className="font-semibold text-slate-100">{selectedCard.type_line || 'Token'}</div>
                    {isCreatureTypeLine(selectedCard.type_line) && (
                      <>
                        <div className="text-slate-400">P/T</div>
                        <div className="font-black text-slate-100">{selectedCard.power || '0'}/{selectedCard.toughness || '0'}</div>
                      </>
                    )}
                    <div className="text-slate-400">Abilities</div>
                    <div className="whitespace-pre-wrap font-semibold text-slate-100">{selectedCard.rulesText || '—'}</div>
                  </div>
                </section>
              )}

              {canAct && selectedCard.controllerId === viewAsPlayerId && (
                <section className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Status</h3>
                  {selectedCard.zone === ZONES.BATTLEFIELD && Boolean((cardsMap.get(selectedCard.instanceId) || selectedCard).phasedOut) && (
                    <div className="inline-flex w-fit items-center rounded-full border border-cyan-300/50 bg-cyan-950/70 px-2 py-1 text-xs font-black uppercase tracking-wide text-cyan-100">
                      Phased out
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { handleAction('REVEAL_CARD', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="min-h-10 bg-slate-700 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2"><Eye size={14}/> Reveal</button>
                    {selectedCard.zone === ZONES.HAND && (
                      <button onClick={() => { handleAction('REVEAL_ALL_HAND'); setSelectedCard(null); }} className="min-h-10 bg-slate-700 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2"><Eye size={14}/> Reveal Hand</button>
                    )}
                    {selectedCard.zone === ZONES.BATTLEFIELD && (
                      <>
                        <button onClick={() => { handleAction('TAP_TOGGLE', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="min-h-10 bg-slate-700 text-white p-2 rounded-lg text-sm font-medium">{selectedCard.tapped ? 'Untap' : 'Tap'}</button>
                        <button onClick={() => { handleAction('PHASE_TOGGLE', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="min-h-10 bg-cyan-900/70 text-cyan-50 p-2 rounded-lg text-sm font-bold border border-cyan-700/70">{(cardsMap.get(selectedCard.instanceId) || selectedCard).phasedOut ? 'Phase in' : 'Phase out'}</button>
                        <button onClick={() => { handleAction('TOGGLE_FACE', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="min-h-10 bg-slate-700 text-white p-2 rounded-lg text-sm font-medium">{selectedCard.faceDown ? 'Turn Face Up' : 'Turn Face Down'}</button>
                      </>
                    )}
                  </div>
                </section>
              )}

              {selectedCard.zone === ZONES.HAND && canAct && selectedCard.controllerId === viewAsPlayerId && (
                <section className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Targets / Abilities</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {renderDebuggableCardActionButton({
                      buttonName: 'Play Land',
                      actionType: 'PLAY_LAND',
                      payload: { cardId: selectedCard.instanceId },
                      className: "min-h-10 bg-amber-900/50 hover:bg-amber-800 text-amber-100 p-2 rounded-lg text-sm font-medium border border-amber-800",
                      onClick: () => { handleAction('PLAY_LAND', { cardId: selectedCard.instanceId }); setSelectedCard(null); },
                      children: 'Play Land'
                    })}
                    {renderDebuggableCardActionButton({
                      buttonName: 'Cast Spell',
                      actionType: 'CAST_SPELL',
                      payload: { cardId: selectedCard.instanceId },
                      className: "min-h-10 bg-purple-900/50 hover:bg-purple-800 text-purple-100 p-2 rounded-lg text-sm font-medium border border-purple-800",
                      onClick: () => { handleAction('CAST_SPELL', { cardId: selectedCard.instanceId }); setSelectedCard(null); },
                      children: 'Cast Spell'
                    })}
                    {renderDebuggableCardActionButton({
                      buttonName: 'Cast + Target',
                      actionType: 'SET_TARGETING_STATE_CAST',
                      payload: { sourceId: selectedCard.instanceId, mode: 'CAST', selectedIds: [] },
                      className: "col-span-2 min-h-10 bg-purple-900/50 hover:bg-purple-800 text-purple-100 p-2 rounded-lg text-sm font-medium border border-purple-800 flex items-center justify-center gap-2",
                      onClick: () => { if (!canAct) return; setTargetingState({ source: selectedCard, mode: 'CAST', selectedIds: [] }); setSelectedCard(null); },
                      children: 'Cast + Target 🎯'
                    })}
                    <button onClick={() => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.BATTLEFIELD }); handleAction('TOGGLE_FACE', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="col-span-2 min-h-10 bg-slate-700 text-slate-300 p-2 rounded-lg text-sm">Play Face Down (Morph)</button>
                  </div>
                </section>
              )}

              {selectedCard.zone === ZONES.BATTLEFIELD && (
                <section className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Combat / Damage</h3>
                    <div className="rounded border border-red-500/40 bg-red-950/30 px-2 py-1 text-xs text-red-100 whitespace-nowrap">
                      Current damage <span className="font-black">{getCardMarkedDamage(selectedCard)}</span>
                    </div>
                  </div>

                  {(() => {
                    const combatRows = getCardCombatRows(selectedCard, selectedCard.controllerId === viewAsPlayerId ? 'action modal' : 'opponent action modal');
                    if (combatRows.length === 0) return null;
                    return (
                      <div className="space-y-1">
                        {combatRows.map((row) => {
                          const toneClass = row.tone === 'attack'
                            ? 'bg-red-900/30 border-red-700/40 text-red-100'
                            : row.tone === 'block'
                              ? 'bg-blue-900/30 border-blue-700/40 text-blue-100'
                              : 'bg-slate-900/40 border-slate-600/60 text-slate-100';
                          return (
                            <div key={`${row.label}-${row.value}`} className={`text-xs px-2 py-1 rounded border ${toneClass}`}>
                              <span className="font-semibold">{row.label}:</span> {row.value}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {canAct && selectedCard.controllerId === viewAsPlayerId && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {isAttackersStep && getCardTypeLine(selectedCard).toLowerCase().includes('creature') && (
                          <button onClick={() => setAttackTargetPickerCard(selectedCard)} className="min-h-10 bg-red-900/50 hover:bg-red-800 text-red-100 p-2 rounded-lg text-sm border border-red-700">Attack...</button>
                        )}
                        {isBlockersStep && getCardTypeLine(selectedCard).toLowerCase().includes('creature') && (
                          <button onClick={() => setBlockPickerCard(selectedCard)} className="min-h-10 bg-blue-900/50 hover:bg-blue-800 text-blue-100 p-2 rounded-lg text-sm border border-blue-700">Block...</button>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        <button onClick={() => applyTempDamageChange(selectedCard.instanceId, 1)} className="min-h-9 bg-red-700 hover:bg-red-600 rounded text-white font-bold text-sm">+1</button>
                        <button onClick={() => applyTempDamageChange(selectedCard.instanceId, 2)} className="min-h-9 bg-red-700 hover:bg-red-600 rounded text-white font-bold text-sm">+2</button>
                        <button onClick={() => applyTempDamageChange(selectedCard.instanceId, 3)} className="min-h-9 bg-red-700 hover:bg-red-600 rounded text-white font-bold text-sm">+3</button>
                        <button onClick={() => applyTempDamageChange(selectedCard.instanceId, -1)} className="min-h-9 bg-slate-700 hover:bg-slate-600 rounded text-white font-bold text-sm">-1</button>
                        <button onClick={() => applyTempDamageChange(selectedCard.instanceId, 0, true)} className="min-h-9 bg-red-900/40 hover:bg-red-800/40 rounded text-red-100 border border-red-700 font-bold text-xs">Clear</button>
                      </div>
                    </>
                  )}
                </section>
              )}

              {commanderModeEnabled && selectedCard.controllerId === viewAsPlayerId && (
                <section className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-950/20 p-3">
                  <h3 className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-200"><Crown size={12}/> Commander</h3>
                  {selectedCard.isCommander && <div className="inline-flex rounded-full border border-amber-300/50 bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-amber-100">Commander</div>}
                  {selectedCard.isToken && <p className="text-xs text-amber-100/80">Tokens cannot be commanders.</p>}
                  {canAct && !selectedCard.isToken && (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedCard.isCommander ? (
                        <button onClick={() => { handleAction('UNSET_COMMANDER', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="min-h-10 rounded-lg bg-slate-700 p-2 text-sm font-bold text-slate-100 hover:bg-slate-600">Unset Commander</button>
                      ) : (
                        <button onClick={() => { handleAction('SET_COMMANDER', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="min-h-10 rounded-lg bg-amber-600 p-2 text-sm font-bold text-slate-950 hover:bg-amber-500">Set as Commander</button>
                      )}
                      {selectedCard.isCommander && selectedCard.zone !== ZONES.COMMAND && (
                        <button onClick={() => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.COMMAND }); setSelectedCard(null); }} className="min-h-10 rounded-lg bg-amber-900/70 p-2 text-sm font-bold text-amber-100 hover:bg-amber-800">Move to Command Zone</button>
                      )}
                    </div>
                  )}
                  {selectedCard.isCommander && (
                    <>
                      <div className="flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 text-sm">
                        <span className="text-slate-300">Commander Tax</span>
                        <span className="font-black text-amber-200">+{Math.max(0, getLiveCard(selectedCard)?.commanderTax || selectedCard.commanderTax || 0)}</span>
                      </div>
                      {canAct && (
                        <div className="grid grid-cols-3 gap-2">
                          <button onClick={() => handleAction('COMMANDER_TAX', { cardId: selectedCard.instanceId, amount: 2 })} className="min-h-9 rounded bg-amber-700 text-sm font-bold text-white">+2</button>
                          <button onClick={() => handleAction('COMMANDER_TAX', { cardId: selectedCard.instanceId, amount: -2 })} className="min-h-9 rounded bg-slate-700 text-sm font-bold text-white">-2</button>
                          <button onClick={() => handleAction('COMMANDER_TAX', { cardId: selectedCard.instanceId, reset: true })} className="min-h-9 rounded bg-slate-700 text-xs font-bold text-white">Reset</button>
                        </div>
                      )}
                      <div className="space-y-2 border-t border-amber-500/20 pt-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Commander Damage</div>
                        {(game.players || []).map((player) => {
                          const damage = getCommanderDamage(getLiveCard(selectedCard), player.id);
                          return (
                            <div key={player.id} className="space-y-1 rounded-lg bg-slate-900/50 p-2">
                              <div className="flex justify-between text-xs text-slate-200"><span>Damage to {player.name || 'Player'}</span><span className="font-black">{damage} / 21</span></div>
                              {canAct && (
                                <div className="grid grid-cols-5 gap-1">
                                  <button onClick={() => handleAction('COMMANDER_DAMAGE', { cardId: selectedCard.instanceId, targetPlayerId: player.id, amount: 1 })} className="min-h-8 rounded bg-red-700 text-xs font-bold text-white">+1</button>
                                  <button onClick={() => handleAction('COMMANDER_DAMAGE', { cardId: selectedCard.instanceId, targetPlayerId: player.id, amount: 2 })} className="min-h-8 rounded bg-red-700 text-xs font-bold text-white">+2</button>
                                  <button onClick={() => handleAction('COMMANDER_DAMAGE', { cardId: selectedCard.instanceId, targetPlayerId: player.id, amount: 3 })} className="min-h-8 rounded bg-red-700 text-xs font-bold text-white">+3</button>
                                  <button onClick={() => handleAction('COMMANDER_DAMAGE', { cardId: selectedCard.instanceId, targetPlayerId: player.id, amount: -1 })} className="min-h-8 rounded bg-slate-700 text-xs font-bold text-white">-1</button>
                                  <button onClick={() => handleAction('COMMANDER_DAMAGE', { cardId: selectedCard.instanceId, targetPlayerId: player.id, clear: true })} className="min-h-8 rounded bg-slate-700 text-[10px] font-bold text-white">Clear</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </section>
              )}

              {selectedCard.zone === ZONES.BATTLEFIELD && canAct && selectedCard.controllerId === viewAsPlayerId && (
                <section className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Counters</h3>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-700/80 px-2 py-2">
                    <span className="text-sm text-slate-300">+1/+1 counters</span>
                    <div className="flex gap-2">
                      <button onClick={() => handleAction('MOD_COUNTER', { cardId: selectedCard.instanceId, amount: -1 })} className="min-h-9 min-w-9 bg-black/40 rounded text-red-400 font-bold text-sm">-</button>
                      <button onClick={() => handleAction('MOD_COUNTER', { cardId: selectedCard.instanceId, amount: 1 })} className="min-h-9 min-w-9 bg-black/40 rounded text-green-400 font-bold text-sm">+</button>
                    </div>
                  </div>
                  <button onClick={addCustomCounter} className="min-h-9 w-full rounded-lg bg-slate-700/70 px-2 text-xs text-blue-300 hover:text-white flex items-center justify-center gap-1"><Hexagon size={12}/> Add Custom Counter...</button>
                </section>
              )}

              {selectedCard.zone === ZONES.BATTLEFIELD && canAct && selectedCard.controllerId === viewAsPlayerId && (
                <section className="space-y-2 rounded-lg border border-fuchsia-500/40 bg-fuchsia-950/20 p-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-200">Attach / Link</h3>
                  <div className="grid grid-cols-1 gap-2">
                    <button onClick={() => { setAttachmentState({ source: selectedCard }); setSelectedCard(null); }} className="min-h-10 rounded-lg border border-fuchsia-500/40 bg-fuchsia-900/40 p-2 text-sm font-bold text-fuchsia-100 hover:bg-fuchsia-800/60 flex items-center justify-center gap-2"><Paperclip size={14}/> Attach to permanent...</button>
                    <button onClick={() => { setAttachmentPlayerPickerCard(selectedCard); setSelectedCard(null); }} className="min-h-10 rounded-lg border border-fuchsia-500/40 bg-slate-700 p-2 text-sm font-bold text-slate-100 hover:bg-slate-600 flex items-center justify-center gap-2"><User size={14}/> Attach to player...</button>
                    {normalizeAttachment(getLiveCard(selectedCard)) && (
                      <button onClick={() => { handleAction('DETACH_CARD', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="min-h-10 rounded-lg border border-slate-600 bg-slate-700 p-2 text-sm font-bold text-slate-100 hover:bg-slate-600">Detach</button>
                    )}
                  </div>
                </section>
              )}

              {selectedCard.zone === ZONES.BATTLEFIELD && (
                <section className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Targets / Abilities</h3>
                  {(() => {
                    const selectedTargetInfo = getTargetInfoFor(selectedCard);
                    const clearableTargets = (game.targets || []).filter(t => ((t.sourceId === selectedCard.instanceId || t.targetId === selectedCard.instanceId) && t.controllerId === userId));
                    return (
                      <>
                        <div className="space-y-2 rounded-lg border border-slate-700/70 bg-slate-950/40 p-2 text-sm">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Current targets</div>
                            {selectedTargetInfo.targetDisplayNames.length > 0 ? (
                              <ul className="mt-1 list-disc pl-4 text-slate-100 space-y-0.5">
                                {selectedTargetInfo.targetDisplayNames.map((name, index) => <li key={`current-target-${index}`}>{name}</li>)}
                              </ul>
                            ) : <div className="mt-1 text-slate-500">None</div>}
                          </div>
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Targeted by</div>
                            {selectedTargetInfo.targetedByDisplayNames.length > 0 ? (
                              <ul className="mt-1 list-disc pl-4 text-sky-100 space-y-0.5">
                                {selectedTargetInfo.targetedByCards.map((source, index) => (
                                  <li key={`targeted-by-${source.sourceId || index}`}>{source.displayName}{source.controllerName ? ` (${source.controllerName})` : ''}</li>
                                ))}
                              </ul>
                            ) : <div className="mt-1 text-slate-500">None</div>}
                          </div>
                        </div>
                        {canAct && selectedCard.controllerId === viewAsPlayerId && (
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => { if (!canAct) return; setTargetingState({ source: selectedCard, mode: 'ABILITY', selectedIds: [] }); setSelectedCard(null); }} className="min-h-10 bg-blue-900/50 hover:bg-blue-800 text-blue-100 p-2 rounded-lg text-sm flex items-center justify-center gap-2 border border-blue-800">Ability 🎯</button>
                            <button onClick={() => { if (!canAct) return; setTargetingState({ source: selectedCard, mode: 'MANUAL', selectedIds: [] }); setSelectedCard(null); }} className="min-h-10 bg-slate-700 hover:bg-slate-600 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2 border border-slate-600">Target... 🎯</button>
                            <button disabled={clearableTargets.length === 0} onClick={() => clearTargets(selectedCard)} className={`col-span-2 min-h-10 p-2 rounded-lg text-sm flex items-center justify-center gap-2 ${clearableTargets.length === 0 ? 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>✖ Clear Targets</button>
                            <button onClick={() => { handleAction('CLONE_CARD', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="min-h-10 bg-slate-700 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2"><Copy size={12}/> Clone</button>
                            <button onClick={() => { handleAction('CHANGE_CONTROL', { cardId: selectedCard.instanceId, cardName: getCardDisplayName(selectedCard) }); setSelectedCard(null); }} className="min-h-10 bg-slate-700 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2"><UserCheck size={12}/> Give Control</button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </section>
              )}

              {canAct && selectedCard.controllerId === viewAsPlayerId && (
                <section className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Move Card</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {renderDebuggableCardActionButton({
                      buttonName: 'Move to Graveyard',
                      actionType: 'MOVE_ZONE',
                      payload: { cardId: selectedCard.instanceId, targetZone: ZONES.GRAVEYARD },
                      className: "min-h-10 bg-slate-700 hover:bg-red-900/50 text-white p-2 rounded-lg text-sm font-medium",
                      onClick: () => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.GRAVEYARD }); setSelectedCard(null); },
                      children: 'To Graveyard'
                    })}
                    {renderDebuggableCardActionButton({
                      buttonName: 'Move to Exile',
                      actionType: 'MOVE_ZONE',
                      payload: { cardId: selectedCard.instanceId, targetZone: ZONES.EXILE },
                      className: "min-h-10 bg-slate-700 text-slate-300 p-2 rounded-lg text-sm font-medium",
                      onClick: () => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.EXILE }); setSelectedCard(null); },
                      children: 'To Exile'
                    })}
                    <button onClick={() => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.HAND }); setSelectedCard(null); }} className="min-h-10 bg-slate-700 text-slate-300 p-2 rounded-lg text-sm font-medium">To Hand</button>
                    {selectedCard.zone !== ZONES.BATTLEFIELD && selectedCard.zone !== ZONES.HAND && (
                      <button onClick={() => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.BATTLEFIELD }); setSelectedCard(null); }} className="min-h-10 bg-purple-900/50 text-white p-2 rounded-lg text-sm font-medium">Return to Battlefield</button>
                    )}
                    <button onClick={() => { handleAction('MOVE_TO_LIBRARY', { cardId: selectedCard.instanceId, position: 'TOP' }); setSelectedCard(null); }} className="min-h-10 bg-slate-700 text-slate-300 p-2 rounded-lg text-sm font-medium">To Top Lib</button>
                    <button onClick={() => { handleAction('MOVE_TO_LIBRARY', { cardId: selectedCard.instanceId, position: 'BOTTOM' }); setSelectedCard(null); }} className="min-h-10 bg-slate-700 text-slate-300 p-2 rounded-lg text-sm font-medium">To Bot Lib</button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {attackTargetPickerCard && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4" onClick={() => setAttackTargetPickerCard(null)}>
          <div className="bg-slate-800 w-full max-w-sm rounded-xl p-4 border border-slate-600" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white">Choose attack target</h3>
              <button onClick={() => setAttackTargetPickerCard(null)}><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="space-y-2">
              {attackTargetOptions.map((option) => (
                <button
                  key={`${option.kind || option.type}-${option.id || option.targetId}`}
                  onClick={async () => {
                    await setAttackTarget(attackTargetPickerCard.instanceId, option);
                    setAttackTargetPickerCard(null);
                    setSelectedCard(null);
                  }}
                  className="w-full text-left px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm text-slate-100"
                >
                  <div className="font-medium">{option.label}</div>
                  <div className="text-[11px] text-slate-400">{getAttackTargetLabelPrefix(option.kind)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {blockPickerCard && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4" onClick={() => setBlockPickerCard(null)}>
          <div className="bg-slate-800 w-full max-w-sm rounded-xl p-4 border border-slate-600" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white">Assign blockers</h3>
              <button onClick={() => setBlockPickerCard(null)}><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {activeAttackers.length === 0 && <div className="text-sm text-slate-400">No attackers available.</div>}
              {activeAttackers.map((attacker) => {
                const liveBlockerId = blockPickerCard.instanceId;
                const active = (combatBlockers[liveBlockerId] || []).includes(attacker.instanceId);
                return (
                  <button
                    key={attacker.instanceId}
                    onClick={() => {
                      console.log('[COMBAT_BLOCK_SELECTION]', {
                        phase: game.phase,
                        currentPlayerId: viewAsPlayerId,
                        attackersMap: combatAttackers,
                        blockersMap: combatBlockers,
                        validBlockerCandidates: validBlockerCandidates.map((card) => ({ id: card.instanceId, name: getCombatDisplayCardName(card), controllerId: card.controllerId })),
                        validAttackerTargetsDuringBlockSelection: validBlockTargetAttackers.map((card) => ({ id: card.instanceId, name: getCombatDisplayCardName(card), controllerId: card.controllerId, attackTarget: getCardAttackTargetLabel(card.instanceId) })),
                        selectedBlockerId: blockPickerCard.instanceId,
                        selectedAttackerId: attacker.instanceId
                      });
                      if (canAct) toggleBlockTarget(blockPickerCard.instanceId, attacker.instanceId);
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-sm border ${active ? 'bg-blue-900/50 border-blue-500 text-blue-100' : 'bg-slate-700 border-slate-600 text-slate-100'}`}
                  >
                    <div className="font-medium">{getCombatDisplayCardName(attacker)}</div>
                    <div className="text-[11px] text-slate-300">ATK → {getCardAttackTargetLabel(attacker.instanceId) || 'Defender'}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setBlockPickerCard(null); setSelectedCard(null); }} className="w-full mt-3 bg-slate-700 hover:bg-slate-600 rounded py-2 text-sm">Done</button>
          </div>
        </div>
      )}

      {deckInput !== '' && !importing && (noDeckLoaded || game?.isTutorial) && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 w-full max-w-md rounded-xl p-6 shadow-2xl border border-slate-600">
            <h3 className="text-xl font-bold mb-2">Import Deck</h3>
            {commanderModeEnabled && (
              <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-100">
                <div className="font-bold">Commander import tips</div>
                <p>Normal decklists work. After importing, tap a card and choose <span className="font-bold">Set as Commander</span>.</p>
                <p className="mt-1">Section headers like <span className="font-mono">Commander</span> / <span className="font-mono">Deck</span> or <span className="font-mono">// Commander</span> / <span className="font-mono">// Deck</span> will mark commander cards and put them in the command zone.</p>
              </div>
            )}
            <textarea
              value={deckInput}
              onChange={e => setDeckInput(e.target.value)}
              className="w-full h-40 bg-slate-900 text-slate-300 p-3 rounded border border-slate-700 font-mono text-sm"
              placeholder={commanderModeEnabled ? "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n1 Command Tower" : "4 Lightning Bolt\n20 Mountain"}
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setDeckInput('')} className="flex-1 bg-slate-700 py-2 rounded">Cancel</button>
              <button onClick={game?.isTutorial && !noDeckLoaded ? () => { setDeckInput(''); setNotification('Tutorial import preview closed. Your scripted duel deck is unchanged.'); setTimeout(() => setNotification(null), 2500); } : importDeck} className="flex-1 bg-green-600 py-2 rounded font-bold text-white">{game?.isTutorial && !noDeckLoaded ? 'Keep Tutorial Deck' : 'Import Cards'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteDeckConfirmOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 w-full max-w-md rounded-xl p-6 shadow-2xl border border-slate-600">
            <h3 className="text-xl font-bold mb-2">Delete your deck?</h3>
            <p className="text-sm text-slate-300">
              This will remove your current deck state (library/hand/etc). You can import again after.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setDeleteDeckConfirmOpen(false)}
                className="flex-1 bg-slate-700 py-2 rounded"
                disabled={deletingDeck}
              >
                Cancel
              </button>
              <button
                onClick={deleteDeck}
                className="flex-1 bg-red-600 py-2 rounded font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                disabled={deletingDeck}
              >
                {deletingDeck ? <RotateCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {importing && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="text-center"><RotateCw className="animate-spin text-purple-500 w-12 h-12 mb-4 mx-auto" /><p>Fetching from Scryfall...</p></div>
        </div>
      )}

      {zoomedCard && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4"
          onPointerDown={(e) => { if (e.target === e.currentTarget) closeZoomedCard(); }}
          onClick={(e) => { if (e.target === e.currentTarget) closeZoomedCard(); }}
        >
          <button
            type="button"
            aria-label="Close card preview"
            className="fixed top-4 right-4 z-[61] flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-slate-950/90 text-white shadow-2xl transition hover:bg-slate-800 active:scale-95 sm:top-6 sm:right-6"
            onPointerDown={(e) => { e.stopPropagation(); closeZoomedCard(); }}
            onClick={(e) => { e.stopPropagation(); closeZoomedCard(); }}
          >
            <X size={28} aria-hidden="true" />
          </button>
          <div
            className="flex max-h-[calc(100vh-2rem)] max-w-full flex-col items-center gap-4 overflow-y-auto overscroll-contain px-1 py-14 lg:flex-row lg:py-4"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="text-sm font-semibold text-slate-100">{getDisplayCardName(zoomedCard)}</div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {zoomedCard.isCommander && <div className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-500/20 px-2 py-1 text-xs font-black uppercase text-amber-100"><Crown size={12}/> Commander</div>}
                {Boolean(zoomedCard.phasedOut) && <div className="inline-flex items-center gap-1 rounded-full border border-cyan-300/60 bg-cyan-950/70 px-2 py-1 text-xs font-black uppercase text-cyan-100">Phased out</div>}
              </div>
              {zoomedCard.isToken ? (
                <TokenCardPreview token={zoomedCard} size="large" />
              ) : (
                <img src={getCardImageUri(zoomedCard)} alt={getCardDisplayName(zoomedCard)} className="max-w-full max-h-[80vh] rounded-xl shadow-2xl" />
              )}
            </div>
            {(() => {
              const zoomAttachmentInfo = getAttachmentInfo(zoomedCard);
              return (Boolean(zoomedCard.phasedOut) || hasAnyCombatInfo(getCardCombatInfo(zoomedCard, game, allBattlefieldDisplayNames)) || getCardMarkedDamage(zoomedCard) > 0 || getTargetInfoRows(getTargetInfoFor(zoomedCard)).length > 0 || zoomAttachmentInfo.attachedToLabel || zoomAttachmentInfo.attachedCards.length > 0) && (
              <div className="w-full max-w-xs lg:w-64 bg-slate-900/90 border border-slate-600 rounded-xl p-3 shadow-xl text-sm space-y-3">
                {Boolean(zoomedCard.phasedOut) && (
                  <div className="rounded-lg border border-cyan-400/50 bg-cyan-950/40 p-2 text-cyan-50">
                    <div className="font-bold uppercase tracking-wide text-xs text-cyan-100">Phased out</div>
                    <div className="mt-1 text-xs text-cyan-100/80">Manual status; card remains on the battlefield.</div>
                  </div>
                )}
                {(zoomAttachmentInfo.attachedToLabel || zoomAttachmentInfo.attachedCards.length > 0) && (
                  <div className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-950/30 p-2">
                    <div className="font-bold text-fuchsia-100 uppercase tracking-wide text-xs mb-2">Attachments</div>
                    {zoomAttachmentInfo.attachedToType === 'card' && <div className="text-fuchsia-50">Attached to: <span className="font-bold">{zoomAttachmentInfo.attachedToLabel}</span></div>}
                    {zoomAttachmentInfo.attachedToType === 'player' && <div className="text-fuchsia-50">Attached to player: <span className="font-bold">{zoomAttachmentInfo.attachedToLabel}</span></div>}
                    {zoomAttachmentInfo.attachedCards.length > 0 && (
                      <div className="mt-2 text-fuchsia-50">
                        <div className="font-bold">Attached cards:</div>
                        <ul className="mt-1 list-disc pl-4">
                          {zoomAttachmentInfo.attachedCards.map((attachedCard) => <li key={attachedCard.instanceId}>{getDisplayCardName(attachedCard)}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {getTargetInfoRows(getTargetInfoFor(zoomedCard)).length > 0 && (
                  <div className="rounded-lg border border-sky-500/40 bg-sky-950/30 p-2">
                    <div className="font-bold text-sky-100 uppercase tracking-wide text-xs mb-2">Targets</div>
                    <div className="space-y-2">
                      {getTargetInfoRows(getTargetInfoFor(zoomedCard)).map((row) => (
                        <div key={`${row.label}-${row.values.join('|')}`} className="text-sky-50">
                          <div className="text-[11px] uppercase tracking-wide text-sky-300">{row.label}</div>
                          <div className="font-medium leading-snug">{row.values.join(', ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {hasAnyCombatInfo(getCardCombatInfo(zoomedCard, game, allBattlefieldDisplayNames)) && (
                  <div>
                    <div className="font-bold text-slate-100 uppercase tracking-wide text-xs mb-2">Combat</div>
                    <div className="space-y-2">
                      {getCardCombatRows(zoomedCard, 'zoom preview').map((row) => (
                        <div key={`${row.label}-${row.value}`} className="text-slate-200">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400">{row.label}</div>
                          <div className="font-medium leading-snug">{row.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {getCardMarkedDamage(zoomedCard) > 0 && (
                  <div className="rounded-lg border border-red-500/50 bg-red-950/30 p-2">
                    <div className="font-bold text-red-100 uppercase tracking-wide text-xs mb-1">Damage</div>
                    <div className="text-red-50">Marked damage: <span className="font-black">{getCardMarkedDamage(zoomedCard)}</span></div>
                  </div>
                )}
              </div>
            );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeGameId, setActiveGameId] = useState(null);
  const [initError, setInitError] = useState(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isAuthStartupLoading, setIsAuthStartupLoading] = useState(true);
  const [playerName, setPlayerName] = useState('');
  const [myGames, setMyGames] = useState([]);
  const [cleanupGames, setCleanupGames] = useState([]);
  const [isCleanupLoading, setIsCleanupLoading] = useState(false);
  const [isCleanupDeleting, setIsCleanupDeleting] = useState(false);
  const [cleanupError, setCleanupError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [pendingUrlEntry, setPendingUrlEntry] = useState(null);
  const isExitingRef = useRef(false);
  const suggestedName = myGames.find((g) => (g.myName || '').trim())?.myName || '';

  const clearPersistedJoinState = () => {
    const keysToClear = [
      'lastGameId',
      'lastRoomCode',
      'lastOpenedGame',
      'gameId',
      'roomCode',
      'room'
    ];

    keysToClear.forEach((key) => {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    });
  };

  const clearGameUrlParams = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.delete('mode');
    url.searchParams.delete('gameId');
    url.searchParams.delete('game');
    url.searchParams.delete('roomCode');

    if (/^\/game\/[A-Za-z0-9]{4,12}$/.test(url.pathname)) {
      url.pathname = '/';
    }

    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const handleExitGame = () => {
    isExitingRef.current = true;
    setActiveGameId(null);
    setPendingUrlEntry(null);
    clearPersistedJoinState();
    clearGameUrlParams();
  };

  const upsertUserGameMembership = async (uid, roomCode, role, extraFields = {}) => {
    const trimmedName = (extraFields.myName || '').trim();
    const trimmedTitle = (extraFields.title || '').trim();
    const membershipRef = doc(db, 'users', uid, 'games', roomCode);
    await setDoc(membershipRef, {
      roomCode,
      role,
      gameId: roomCode,
      ...(trimmedName ? { myName: trimmedName } : {}),
      ...(trimmedTitle ? { title: trimmedTitle } : {}),
      ...(extraFields.isTutorial ? { isTutorial: true } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  };

  const getPreferredNameForGame = async (uid, roomCode, fallbackName) => {
    const defaultName = (fallbackName || '').trim() || 'Guest';
    try {
      const membershipRef = doc(db, 'users', uid, 'games', roomCode);
      const membershipSnap = await getDoc(membershipRef);
      const storedName = (membershipSnap.data()?.myName || '').trim();
      if (storedName) return storedName;

      const gameSnap = await getDoc(doc(db, 'games_v3', roomCode));
      if (gameSnap.exists()) {
        const players = gameSnap.data()?.players || [];
        const playerNameFromGame = (players.find((p) => p.id === uid)?.name || '').trim();
        if (playerNameFromGame) return playerNameFromGame;
      }
    } catch (e) {
      console.warn('Could not resolve preferred name for game', roomCode, e);
    }
    return defaultName;
  };

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    const finishStartup = () => {
      if (cancelled) return;
      setIsAuthStartupLoading(false);
      setIsActionLoading(false);
    };

    const runAuthStartup = async () => {
      console.log('auth startup begin');
      setIsAuthStartupLoading(true);
      setIsActionLoading(true);
      const redirectStarted = sessionStorage.getItem('googleRedirectStarted') === '1';
      if (redirectStarted) {
        console.log('googleRedirectStarted flag detected');
      }

      unsubscribe = onAuthStateChanged(auth, (u) => {
        if (cancelled) return;
        console.log('auth state user', u?.uid, u?.isAnonymous);
        setUser(u);
      });

      let redirectResult = null;
      try {
        redirectResult = await getRedirectResult(auth);
      } catch (e) {
        console.error('Google redirect result error', e);
        if (!cancelled) {
          setInitError(`Google sign-in failed: ${e?.code || 'unknown'} — ${e?.message || 'no message'}`);
        }
      } finally {
        console.log('redirect result processed');
      }

      console.log('redirect result user', redirectResult?.user?.uid, redirectResult?.user?.isAnonymous);
      if (redirectResult?.user) {
        console.log('redirect user found');
        if (!cancelled) {
          setUser(redirectResult.user);
          setInitError(null);
        }
        sessionStorage.removeItem('googleRedirectStarted');
        finishStartup();
        return;
      }

      if (redirectStarted) {
        console.log('waiting extra tick for auth state after redirect');
        const postRedirectUser = await new Promise((resolve) => {
          let settled = false;
          let tickUnsubscribe = () => {};

          const settle = (value) => {
            if (settled) return;
            settled = true;
            tickUnsubscribe();
            resolve(value);
          };

          tickUnsubscribe = onAuthStateChanged(auth, (u) => {
            if (u) {
              settle(u);
            }
          });

          window.setTimeout(() => settle(auth.currentUser || null), 1000);
        });

        const recoveredUser = postRedirectUser || auth.currentUser;
        if (recoveredUser && !cancelled) {
          setUser(recoveredUser);
          if (!recoveredUser.isAnonymous) {
            setInitError(null);
          } else {
            console.warn('redirect failed or empty; recovering guest session');
            setInitError('Google sign-in did not complete; recovered guest session. You can continue as Guest or try Google again.');
          }
        } else {
          console.warn('redirect failed or empty; recovering guest session');
          if (!cancelled) {
            setInitError('Google sign-in did not complete; recovered guest session. You can continue as Guest or try Google again.');
          }
          try {
            console.log('guest recovery anonymous sign-in');
            const anonResult = await signInAnonymously(auth);
            if (!cancelled) {
              setUser(anonResult.user);
            }
          } catch (e) {
            console.error('Guest recovery anonymous sign-in failed', e);
            if (!cancelled) {
              setInitError(`Google sign-in did not complete and guest recovery failed: ${e?.code || 'unknown'} — ${e?.message || 'no message'}`);
            }
          }
        }

        sessionStorage.removeItem('googleRedirectStarted');
        finishStartup();
        return;
      }

      console.log('auth currentUser after redirect', auth.currentUser ? { uid: auth.currentUser.uid, isAnonymous: auth.currentUser.isAnonymous } : null);

      if (auth.currentUser) {
        console.log('using existing auth.currentUser');
        if (!cancelled) {
          setUser(auth.currentUser);
          setInitError(null);
        }
      } else {
        console.log('falling back to anonymous');
        try {
          await signInAnonymously(auth);
        } catch (e) {
          if (!cancelled) {
            setInitError(e.message);
          }
        }
      }

      finishStartup();
    };

    runAuthStartup();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isExitingRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const roomFromQuery = (params.get('room') || '').trim().toUpperCase();
    const mode = (params.get('mode') || '').toLowerCase();

    const pathMatch = window.location.pathname.match(/^\/game\/([A-Za-z0-9]{4,12})$/);
    const roomFromPath = pathMatch ? pathMatch[1].toUpperCase() : '';
    const roomCode = roomFromQuery || roomFromPath;

    if (roomCode) {
      setPendingUrlEntry({ roomCode, mode: mode === 'viewer' ? 'viewer' : 'player' });
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setMyGames([]);
      return;
    }

    const q = query(collection(db, 'users', user.uid, 'games'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setMyGames(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (e) => setInitError(e.message));

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    console.log('currentUser uid', user.uid);
    console.log('currentUser isAnonymous', user.isAnonymous);
    console.log('currentUser providerData', user.providerData);
  }, [user]);

  const createGame = async (playerNameInput, gameTitleInput, selectedGameMode = GAME_MODES.REGULAR) => {
    if (!user) return;
    setIsActionLoading(true);
    setInitError(null);
    const safeName = (playerNameInput || '').trim();
    const safeTitle = (gameTitleInput || '').trim();
    const safeGameMode = selectedGameMode === GAME_MODES.COMMANDER ? GAME_MODES.COMMANDER : GAME_MODES.REGULAR;
    const startingLife = getStartingLifeForMode(safeGameMode);
    setPlayerName(safeName);
    try {
      const initialData = {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        hostId: user.uid,
        gameMode: safeGameMode,
        ...(safeTitle ? { title: safeTitle } : {}),
        allowSpectators: true,
        spectatorIds: [],
        players: [{
          id: user.uid,
          name: safeName,
          life: startingLife,
          turnOrder: 0,
          counters: { poison: 0, energy: 0, experience: 0 },
          manaPool: clearManaPool(),
          statuses: { monarch: false, initiative: false, citysBlessing: false, ringBearerLevel: 0, custom: [] },
          emblems: [],
          deckExtras: getEmptyDeckExtras(),
          handRevealed: false,
          lastSeenChatAt: Date.now()
        }],
        phase: 'main1',
        dayNight: null,
        activePlayerIndex: 0,
        priorityIndex: 0,
        priorityPlayerId: user.uid,
        turnPlayerId: user.uid,
        turnNumber: 1,
        consecutivePasses: 0,
        stack: [],
        cards: [],
        targets: [],
        reveals: [],
        autopass: {},
        undoStack: [],
        combat: getEmptyCombatState(),
        log: [buildGameLogEntry({
          currentGame: { turnNumber: 1, turnPlayerId: user.uid, phase: 'main1' },
          playerId: user.uid,
          playerName: safeName || 'Unknown',
          type: 'GAME_CREATE',
          category: 'setup',
          message: `${safeName || 'Unknown'} created the ${safeGameMode === GAME_MODES.COMMANDER ? 'Commander' : 'Regular'} game.`
        })]
      };

      const shortCode = generateGameId();
      await setDoc(doc(db, 'games_v3', shortCode), { ...initialData, id: shortCode });
      await upsertUserGameMembership(user.uid, shortCode, 'player', { myName: safeName, title: safeTitle });
      setActiveGameId(shortCode);
    } catch (e) {
      console.error(e);
      setInitError(e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const startTutorialGame = async (playerNameInput) => {
    if (!user) return;
    setIsActionLoading(true);
    setInitError(null);
    const safeName = (playerNameInput || '').trim() || suggestedName || 'Planeswalker';
    setPlayerName(safeName);
    try {
      const existingTutorialRefs = await getDocs(query(collection(db, 'users', user.uid, 'games'), where('isTutorial', '==', true), limit(1)));
      for (const membershipDoc of existingTutorialRefs.docs) {
        const candidateId = membershipDoc.data()?.roomCode || membershipDoc.id;
        if (!candidateId) continue;
        const candidateSnap = await getDoc(doc(db, 'games_v3', candidateId));
        if (candidateSnap.exists() && candidateSnap.data()?.isTutorial) {
          const candidateData = candidateSnap.data() || {};
          const shouldSeedExistingTutorial = shouldSeedTutorialCardsForPlayer(candidateData.cards || [], user.uid);
          await updateDoc(doc(db, 'games_v3', candidateId), {
            tutorial: {
              scriptVersion: candidateData.tutorial?.scriptVersion || TUTORIAL_SCRIPT_VERSION,
              stepId: candidateData.tutorial?.finished ? 'intro' : (candidateData.tutorial?.stepId || 'intro'),
              completedStepIds: candidateData.tutorial?.finished ? [] : capTutorialCompletedStepIds(candidateData.tutorial?.completedStepIds || []),
              playerId: candidateData.tutorial?.playerId || user.uid,
              opponentName: 'Nicol Bolas',
              opponentIsScripted: true,
              finished: false,
              inactive: false
            },
            ...(shouldSeedExistingTutorial ? { cards: buildTutorialStarterCards(user.uid) } : {}),
            updatedAt: serverTimestamp()
          });
          setActiveGameId(candidateId);
          return;
        }
      }

      const shortCode = generateGameId();
      const bolasId = `tutorial-bolas-${shortCode}`;
      const startingLife = getStartingLifeForMode(GAME_MODES.REGULAR);
      const initialData = {
        id: shortCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        hostId: user.uid,
        gameMode: GAME_MODES.REGULAR,
        title: 'Tutorial Battle: Nicol Bolas',
        allowSpectators: false,
        spectatorIds: [],
        isTutorial: true,
        tutorial: {
          scriptVersion: TUTORIAL_SCRIPT_VERSION,
          stepId: 'intro',
          completedStepIds: [],
          playerId: user.uid,
          opponentName: 'Nicol Bolas',
          opponentIsScripted: true,
          finished: false,
          inactive: false
        },
        players: [
          {
            id: user.uid,
            name: safeName,
            life: startingLife,
            turnOrder: 0,
            counters: { poison: 0, energy: 0, experience: 0 },
            manaPool: clearManaPool(),
            statuses: { monarch: false, initiative: false, citysBlessing: false, ringBearerLevel: 0, custom: [] },
            emblems: [],
            deckExtras: getEmptyDeckExtras(),
            handRevealed: false,
            lastSeenChatAt: Date.now()
          },
          {
            id: bolasId,
            name: 'Nicol Bolas',
            life: startingLife,
            turnOrder: 1,
            isScriptedOpponent: true,
            counters: { poison: 0, energy: 0, experience: 0 },
            manaPool: clearManaPool(),
            statuses: { monarch: false, initiative: false, citysBlessing: false, ringBearerLevel: 0, custom: [] },
            emblems: [],
            deckExtras: getEmptyDeckExtras(),
            handRevealed: false,
            lastSeenChatAt: Date.now()
          }
        ],
        phase: 'main1',
        dayNight: null,
        activePlayerIndex: 0,
        priorityIndex: 0,
        priorityPlayerId: user.uid,
        turnPlayerId: user.uid,
        turnNumber: 1,
        consecutivePasses: 0,
        stack: [],
        cards: buildTutorialStarterCards(user.uid),
        targets: [],
        reveals: [],
        autopass: {},
        undoStack: [],
        combat: getEmptyCombatState(),
        log: [buildGameLogEntry({
          currentGame: { turnNumber: 1, turnPlayerId: user.uid, phase: 'main1' },
          playerId: user.uid,
          playerName: safeName || 'Unknown',
          type: 'TUTORIAL_CREATE',
          category: 'setup',
          message: `${safeName || 'Unknown'} began the tutorial battle against Nicol Bolas.`
        })]
      };

      await setDoc(doc(db, 'games_v3', shortCode), initialData);
      await upsertUserGameMembership(user.uid, shortCode, 'player', { myName: safeName, title: initialData.title, isTutorial: true });
      setActiveGameId(shortCode);
    } catch (e) {
      console.error(e);
      setInitError(e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const joinGame = async (playerNameInput, code) => {
    if (!user) return;
    setIsActionLoading(true);
    setInitError(null);
    const safeName = (playerNameInput || '').trim();
    setPlayerName(safeName);
    try {
      const safeCode = (code || '').trim().toUpperCase();
      const gameRef = doc(db, 'games_v3', safeCode);
      let gameTitle = '';

      await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found! Check the code.');

        const gameData = gameDoc.data();
        gameTitle = (gameData.title || '').trim();
        const players = gameData.players || [];
        const existingPlayerIndex = players.findIndex((p) => p.id === user.uid);

        if (existingPlayerIndex >= 0) {
          const newPlayers = [...players];
          newPlayers[existingPlayerIndex] = { ...newPlayers[existingPlayerIndex], name: safeName, lastSeenChatAt: Date.now() };
          transaction.update(gameRef, normalizeGameUpdatesForFirestore({
            players: newPlayers,
            undoStack: gameData.undoStack || [],
            updatedAt: serverTimestamp(),
            log: pruneLogForFirestore([...(gameData.log || []), buildGameLogEntry({ currentGame: gameData, playerId: user.uid, playerName: safeName || 'Unknown', type: 'PLAYER_REJOIN', category: 'setup', message: `${safeName || 'Unknown'} rejoined the game.` })])
          }, 'PLAYER_REJOIN'));
        } else if (players.length < 2) {
          const newPlayer = {
            id: user.uid,
            name: safeName,
            life: getStartingLifeForMode(getGameMode(gameData)),
            turnOrder: players.length,
            counters: { poison: 0, energy: 0, experience: 0 },
            manaPool: clearManaPool(),
            statuses: { monarch: false, initiative: false, citysBlessing: false, ringBearerLevel: 0, custom: [] },
            emblems: [],
            deckExtras: getEmptyDeckExtras(),
            handRevealed: false,
            lastSeenChatAt: Date.now()
          };
          transaction.update(gameRef, normalizeGameUpdatesForFirestore({
            players: [...players, newPlayer],
            undoStack: gameData.undoStack || [],
            updatedAt: serverTimestamp(),
            log: pruneLogForFirestore([...(gameData.log || []), buildGameLogEntry({ currentGame: gameData, playerId: user.uid, playerName: safeName || 'Unknown', type: 'PLAYER_JOIN', category: 'setup', message: `${safeName || 'Unknown'} joined the game.` })])
          }, 'PLAYER_JOIN'));
        } else {
          throw new Error('Game is full.');
        }
      });

      await upsertUserGameMembership(user.uid, safeCode, 'player', { myName: safeName, title: gameTitle });
      setActiveGameId(safeCode);
    } catch (e) {
      console.error(e);
      setInitError(e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const watchGame = async (playerNameInput, code) => {
    if (!user) return;
    setIsActionLoading(true);
    setInitError(null);
    const safeName = (playerNameInput || '').trim();
    setPlayerName(safeName);
    try {
      const safeCode = (code || '').trim().toUpperCase();
      const gameRef = doc(db, 'games_v3', safeCode);
      let gameTitle = '';

      await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found! Check the code.');

        const gameData = gameDoc.data();
        gameTitle = (gameData.title || '').trim();
        if (gameData.allowSpectators === false) throw new Error('Spectators are not allowed in this game.');

        const players = gameData.players || [];
        const isPlayer = players.some((p) => p.id === user.uid);
        const spectatorIds = gameData.spectatorIds || [];
        const isSpectator = spectatorIds.includes(user.uid);

        if (!isPlayer && !isSpectator) transaction.update(gameRef, { spectatorIds: [...spectatorIds, user.uid] });
      });

      await upsertUserGameMembership(user.uid, safeCode, 'spectator', { myName: safeName, title: gameTitle });
      setActiveGameId(safeCode);
    } catch (e) {
      console.error(e);
      setInitError(e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  useEffect(() => {
    if (isExitingRef.current || !pendingUrlEntry || !user || isActionLoading || isAuthStartupLoading || activeGameId) return;
    let cancelled = false;

    const startFromUrl = async () => {
      const defaultName = user.displayName || 'Guest';
      const preferredName = await getPreferredNameForGame(user.uid, pendingUrlEntry.roomCode, defaultName);
      if (cancelled) return;
      if (isExitingRef.current) return;
      setPlayerName(preferredName);

      if (isExitingRef.current) return;
      if (pendingUrlEntry.mode === 'viewer') {
        await watchGame(preferredName, pendingUrlEntry.roomCode);
      } else {
        await joinGame(preferredName, pendingUrlEntry.roomCode);
      }

      if (!cancelled) setPendingUrlEntry(null);
    };

    startFromUrl();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUrlEntry, user, isActionLoading, isAuthStartupLoading, activeGameId]);

  useEffect(() => {
    if (activeGameId || !isExitingRef.current) return;

    const timeoutId = window.setTimeout(() => {
      isExitingRef.current = false;
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeGameId]);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const loadCleanupGames = async () => {
    if (!user) return;
    setIsCleanupLoading(true);
    setCleanupError('');

    try {
      const cleanupQuery = query(collection(db, 'games_v3'), where('hostId', '==', user.uid));
      const snapshot = await getDocs(cleanupQuery);
      const games = snapshot.docs.map((gameDoc) => {
        const gameData = gameDoc.data() || {};
        const players = Array.isArray(gameData.players) ? gameData.players : [];
        const cards = Array.isArray(gameData.cards) ? gameData.cards : [];
        const logEntries = Array.isArray(gameData.log) ? gameData.log : [];
        const lastLog = logEntries.length > 0 ? logEntries[logEntries.length - 1] : null;

        return {
          id: gameDoc.id,
          title: gameData.title || '',
          createdAt: gameData.createdAt || null,
          updatedAt: gameData.updatedAt || null,
          hostId: gameData.hostId || '',
          playerCount: players.length,
          cardCount: cards.length,
          lastLogMessage: typeof lastLog?.message === 'string' ? lastLog.message : ''
        };
      });

      games.sort((a, b) => {
        const aTime = (toDateValue(a.updatedAt) || toDateValue(a.createdAt))?.getTime() || 0;
        const bTime = (toDateValue(b.updatedAt) || toDateValue(b.createdAt))?.getTime() || 0;
        return aTime - bTime;
      });

      setCleanupGames(games);
    } catch (e) {
      console.error('Failed to load old game cleanup candidates', e);
      setCleanupError(e?.message || 'Failed to load cleanup candidates.');
    } finally {
      setIsCleanupLoading(false);
    }
  };

  const deleteCleanupGames = async (gamesToDelete) => {
    if (!user) {
      const failed = gamesToDelete.map((game) => ({
        id: game.id,
        step: CLEANUP_DELETE_STEPS.VERIFY_AUTH,
        message: `Failed to delete ${game.id} during ${CLEANUP_DELETE_STEPS.VERIFY_AUTH}: unauthenticated — Authentication is required.`
      }));
      setCleanupError(`Deleted 0 games. Failed ${failed.length} games.\n${failed.map((item) => item.message).join('\n')}`);
      return { failed };
    }

    setIsCleanupDeleting(true);
    setCleanupError('');
    const failed = [];
    const deletedIds = [];

    for (const game of gamesToDelete) {
      if (!game?.id) continue;
      if (game.hostId !== user.uid) {
        const message = `Skipped ${game.id}: you are not the host.`;
        failed.push({ id: game.id, step: CLEANUP_DELETE_STEPS.VERIFY_HOST, message });
        continue;
      }

      try {
        await hardDeleteGamePermanently({ user, gameId: game.id, removeCurrentUserMembership: true });
        deletedIds.push(game.id);
      } catch (e) {
        const step = getErrorStep(e, 'client-side hard delete');
        logCleanupDeleteError(game.id, step, e);
        failed.push({ id: game.id, step, message: formatCleanupDeleteError(game.id, e, step) });
      }
    }

    if (deletedIds.length > 0) {
      setCleanupGames((existing) => existing.filter((game) => !deletedIds.includes(game.id)));
      setMyGames((existing) => existing.filter((game) => !deletedIds.includes(game.id)));
      await loadCleanupGames();
      showToast(`Deleted ${deletedIds.length} old game${deletedIds.length === 1 ? '' : 's'}.`);
    }

    const successMessages = deletedIds.map((id) => `Deleted ${id}.`);
    const statusMessages = [...successMessages, ...failed.map((item) => item.message)];
    setCleanupError(`Deleted ${deletedIds.length} games. Failed ${failed.length} games.${statusMessages.length > 0 ? `\n${statusMessages.join('\n')}` : ''}`);

    setIsCleanupDeleting(false);
    return { failed, deletedIds };
  };

  const removeGameFromList = async (game) => {
    if (!user || !game?.id) return;
    await deleteDoc(doc(db, 'users', user.uid, 'games', game.id));
    setMyGames((existing) => existing.filter((g) => g.id !== game.id));
    showToast('Removed from your list.');
  };

  const deleteGamePermanently = async (gameId) => {
    await hardDeleteGamePermanently({ user, gameId, removeCurrentUserMembership: true });
    setMyGames((existing) => existing.filter((g) => g.id !== gameId));
    showToast('Game permanently deleted.');
  };

  const deleteLobbyGame = async (game) => {
    if (!user || !game?.id) return;
    setInitError(null);

    try {
      const gameRef = doc(db, 'games_v3', game.id);
      const gameSnap = await getDoc(gameRef);
      if (!gameSnap.exists()) throw new Error('Game not found in Firebase.');

      const gameData = gameSnap.data() || {};
      if (gameData.hostId === user.uid) {
        await deleteGamePermanently(game.id);
      } else {
        await removeGameFromList(game);
      }
    } catch (e) {
      console.error(e);
      setInitError(e?.message || 'Failed to delete game. Please try again.');
    }
  };

  const continueWithGoogle = async () => {
    if (!user) return;
    setInitError(null);
    setIsActionLoading(true);
    const isMobileDevice = isMobileOrTouchDevice();
    try {
      const provider = new GoogleAuthProvider();
      if (isMobileDevice) {
        console.log('mobile google redirect starting');
        sessionStorage.setItem('googleRedirectStarted', '1');
        try {
          await signInWithRedirect(auth, provider);
          console.warn('mobile redirect returned without navigation');
          sessionStorage.removeItem('googleRedirectStarted');
          setInitError('Google sign-in redirect returned without navigating. You can continue as Guest or try Google again.');
          setIsActionLoading(false);
        } catch (e) {
          console.error('mobile redirect failed to start', e);
          sessionStorage.removeItem('googleRedirectStarted');
          setInitError(`Google sign-in failed to start: ${e?.code || 'unknown'} — ${e?.message || 'no message'}`);
          setIsActionLoading(false);
        }
        return;
      }

      console.log('Google auth path selected: desktop popup');
      if (user.isAnonymous) {
        try {
          await linkWithPopup(user, provider);
        } catch (e) {
          if (e?.code === 'auth/credential-already-in-use') {
            await signInWithPopup(auth, provider);
          } else {
            throw e;
          }
        }
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (e) {
      console.error('Google auth failed', e);
      console.error('Google auth error code:', e?.code);
      console.error('Google auth error message:', e?.message);
      setInitError(`Google sign-in failed: ${e?.code || 'unknown'} — ${e?.message || 'no message'}`);
    } finally {
      if (!isMobileDevice) {
        setIsActionLoading(false);
      }
    }
  };

  const handleSignOut = async () => {
    setInitError(null);
    setIsActionLoading(true);
    try {
      await signOut(auth);
      await signInAnonymously(auth);
    } catch (e) {
      console.error('Sign out failed', e);
      setInitError(`Sign out failed: ${e?.code || 'unknown'} — ${e?.message || 'no message'}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  if (activeGameId && user) {
    return (
      <GameBoardErrorBoundary key={activeGameId} onExit={handleExitGame}>
        <GameBoard gameId={activeGameId} realUserId={user.uid} displayName={playerName} onExit={handleExitGame} />
      </GameBoardErrorBoundary>
    );
  }

  return (
    <Lobby
      onCreate={createGame}
      onJoin={joinGame}
      onWatch={watchGame}
      onStartTutorial={startTutorialGame}
      onDeleteGame={deleteLobbyGame}
      onLoadCleanupGames={loadCleanupGames}
      onDeleteCleanupGames={deleteCleanupGames}
      cleanupGames={cleanupGames}
      isCleanupLoading={isCleanupLoading}
      isCleanupDeleting={isCleanupDeleting}
      cleanupError={cleanupError}
      activeGameId={activeGameId}
      onContinueWithGoogle={continueWithGoogle}
      onSignOut={handleSignOut}
      myGames={myGames}
      toastMessage={toastMessage}
      suggestedName={suggestedName}
      isError={!!initError}
      errorMsg={initError}
      currentUser={user}
      isActionLoading={isActionLoading}
    />
  );
}
