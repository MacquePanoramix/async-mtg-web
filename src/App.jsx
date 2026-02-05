import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, onSnapshot, updateDoc, arrayUnion, serverTimestamp, runTransaction } from 'firebase/firestore';
import { X, ArrowRight, Clock, Shield, Skull, Layers, Eye, ChevronDown, ChevronUp, BookOpen, Shuffle, Plus, Copy, UserCheck, EyeOff, RotateCw, Search, Hexagon, Unlock, Lock, Move, Dices, Coins, LayoutGrid, LogOut, Users, User, Bug, Loader2, RefreshCw, AlertTriangle, Repeat, Check, ArrowUp, ArrowDown, MessageSquare } from 'lucide-react';

// --- Firebase Configuration ---
// UPDATED: Using standard Vite env vars
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
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

const ZONES = {
  LIBRARY: 'library',
  HAND: 'hand',
  BATTLEFIELD: 'battlefield',
  GRAVEYARD: 'graveyard',
  EXILE: 'exile',
  COMMAND: 'command'
};

// --- Helper Functions ---
const generateGameId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
    } catch (err) {
      prompt("Copy this code:", text);
    }
    document.body.removeChild(textArea);
  }
};

// --- Components ---
const Lobby = ({ onCreate, onJoin, isError, errorMsg, currentUserId, isActionLoading }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState('menu');
  const isInitLoading = !currentUserId;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
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
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
              placeholder="Planeswalker Name"
            />
          </div>

          {mode === 'menu' && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onCreate(name)}
                disabled={!name || isInitLoading || isActionLoading}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-wait text-white p-3 rounded-lg font-bold transition-colors flex justify-center items-center gap-2"
              >
                {isActionLoading ? <Loader2 className="animate-spin" size={18}/> : 'Create Game'}
              </button>
              <button
                onClick={() => setMode('join')}
                disabled={!name || isInitLoading || isActionLoading}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-wait text-white p-3 rounded-lg font-bold transition-colors flex justify-center items-center gap-2"
              >
                {isInitLoading ? <Loader2 className="animate-spin" size={18}/> : 'Join Game'}
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
                  onClick={() => onJoin(name, code)}
                  disabled={!code || isInitLoading || isActionLoading}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white p-3 rounded-lg font-bold flex justify-center items-center gap-2"
                >
                  {isActionLoading ? <Loader2 className="animate-spin" size={18}/> : 'Enter'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="absolute -bottom-24 left-0 right-0 flex flex-col items-center gap-2">
          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
            Current ID: {currentUserId ? (
              <span className="text-slate-300">{currentUserId.slice(0, 8) + '...'}</span>
            ) : (
              <span className="text-yellow-500 flex items-center gap-1"><Loader2 className="animate-spin" size={10}/> Initializing...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Card = ({ card, zone, onMove, onZoom, onPeek, style = {}, onMouseDown, isDraggable, targets = [], stack = [], isSelected = false }) => {
  const isTapped = card.tapped;
  const isFaceDown = card.faceDown;
  const counters = card.counters || {};

  // Calculate Target/Source status from BOTH persistent targets AND stack items
  const persistentSource = targets.some(t => t.sourceId === card.instanceId);
  const persistentTarget = targets.some(t => t.targetId === card.instanceId);
  const stackSource = stack.some(s => s.sourceId === card.instanceId);
  const stackTarget = stack.some(s => s.targetIds && s.targetIds.includes(card.instanceId));

  const isSource = persistentSource || stackSource;
  const isTarget = persistentTarget || stackTarget;

  // Count how many times this card is targeted
  const targetCount = targets.filter(t => t.targetId === card.instanceId).length + stack.filter(s => s.targetIds && s.targetIds.includes(card.instanceId)).length;

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
  }

  return (
    <div
      className={`group cursor-pointer select-none transition-transform duration-200 ${zone === ZONES.HAND ? 'w-24 h-34 hover:-translate-y-4 flex-shrink-0 relative' : `w-20 h-28 ${positionClass}`} ${rotateClass} `}
      style={{
        ...style,
        zIndex: isSelected ? 100 : (isDraggable ? ((style?.zIndex || 10)) : ((style?.zIndex || 5))),
        touchAction: isDraggable ? 'none' : 'auto'
      }}
      onClick={!isDraggable ? () => onMove(card) : undefined}
      onMouseDown={isDraggable ? onMouseDown : undefined}
      onTouchStart={isDraggable ? onMouseDown : undefined}
    >
      <div className={`w-full h-full rounded-lg overflow-hidden border-2 shadow-md relative bg-slate-800 pointer-events-none ${borderStyle} ${zone === ZONES.BATTLEFIELD ? 'shadow-lg' : ''}`}>
        
        {/* FIX 1: Bigger, bolder badges */}
        {isSource && (
          <div className="absolute -top-3 -right-3 z-40 text-lg bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center border-2 border-white shadow-xl font-bold animate-in zoom-in">
            🎯
          </div>
        )}
        {isTarget && (
          <div className="absolute -top-3 -left-3 z-40 text-lg bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center border-2 border-white shadow-xl font-bold animate-in zoom-in">
            🎯
            {targetCount > 1 && <span className="absolute -bottom-1 -right-1 text-[10px] bg-black text-white px-1 rounded-full border border-white leading-tight">{targetCount}</span>}
          </div>
        )}

        {isFaceDown ? (
          <div className="w-full h-full bg-slate-700 flex flex-col items-center justify-center p-1 border-4 border-slate-600">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center mb-1">
              <EyeOff size={14} className="text-slate-500"/>
            </div>
            <span className="text-[10px] font-bold text-slate-400">2 / 2</span>
          </div>
        ) : card.image_uri ? (
          <img src={card.image_uri} alt={card.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full p-1 flex flex-col items-center justify-center text-center text-xs bg-slate-800">
            <span className="font-bold text-white leading-tight">{card.name}</span>
            <span className="text-slate-400 text-[9px] mt-1">{card.mana_cost}</span>
            {card.power && <span className="absolute bottom-1 right-1 bg-black/50 px-1 rounded text-[9px]">{card.power}/{card.toughness}</span>}
          </div>
        )}

        <div className="absolute top-1 left-1 flex flex-col gap-1 pointer-events-none">
          {Object.entries(counters).map(([label, count]) => (
            count > 0 && (
              <div key={label} className="bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded border border-white/30 shadow-sm whitespace-nowrap z-10">
                {label === 'default' ? `+${count}/+${count}` : `${label}: ${count}`}
              </div>
            )
          ))}
        </div>
      </div>

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
    </div>
  );
};

const GameBoard = ({ gameId, realUserId, onExit }) => {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deckInput, setDeckInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [zoomedCard, setZoomedCard] = useState(null);
  const [scryCard, setScryCard] = useState(null);
  const [viewZone, setViewZone] = useState(null);
  const [searchLibraryOwner, setSearchLibraryOwner] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [playerStatsOpen, setPlayerStatsOpen] = useState(false);
  const [peekCard, setPeekCard] = useState(null);
  const [diceMenuOpen, setDiceMenuOpen] = useState(false);
  const [libraryMenuOpen, setLibraryMenuOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const [boardUnlocked, setBoardUnlocked] = useState(false);
  const boardRef = useRef(null);
  const [draggingCard, setDraggingCard] = useState(null);
  const [oppBoardOpen, setOppBoardOpen] = useState(false);

  // New state for multi-targeting
  const [targetingState, setTargetingState] = useState(null); // { source, mode: 'CAST'|'ABILITY'|'MANUAL', selectedIds: [] }

  const [reorderModal, setReorderModal] = useState(null); // { ownerId, n, orderedIds }
  const [customCounterModal, setCustomCounterModal] = useState(null); // { cardId, label, amount }
  const [tokenModal, setTokenModal] = useState(null); // { name, power, toughness }
  const [revealsOpen, setRevealsOpen] = useState(false);

  // Chat State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  // Use the viewAsId to determine which player is "Active" on this screen
  const userId = realUserId;

  const getFallbackPos = (i) => ({ x: (i % 5) * 18 + 5, y: 10 + Math.floor(i / 5) * 22 });
  const getPlayerTargetId = (pid) => `player:${pid}`;

  useEffect(() => {
    if (!gameId) return;
    // UPDATED: Path
    const unsub = onSnapshot(
      doc(db, 'games_v3', gameId),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setGame(data);

          if (data.log && data.log.length > 0) {
            const lastLog = data.log[data.log.length - 1];
            if ((lastLog.type === 'ROLL_DICE' || lastLog.type === 'FLIP_COIN') && Date.now() - lastLog.timestamp < 5000) {
              setNotification(lastLog.desc);
              setTimeout(() => setNotification(null), 3000);
            }
          }
        }
        setLoading(false);
      },
      (err) => console.error(err)
    );
    return () => unsub();
  }, [gameId]);

  // Chat Helpers
  const chatMessages = (game?.log || []).filter(e => e.type === 'CHAT');
  // FIX: Safety check for players array
  const myPlayer = (game?.players || []).find(p => p.id === userId);
  const lastSeen = myPlayer?.lastSeenChatAt || 0;
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
    handleAction('SET_CHAT_SEEN', { timestamp: Date.now() });
  };

  const handleDragStart = (e, card) => {
    if (!boardUnlocked || targetingState) return;
    e.stopPropagation();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDraggingCard({
      card,
      startX: clientX,
      startY: clientY,
      originalX: card.x ?? 10,
      originalY: card.y ?? 10
    });
  };

  const handleDragMove = (e) => {
    if (!draggingCard || !boardRef.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - draggingCard.startX;
    const deltaY = clientY - draggingCard.startY;

    const rect = boardRef.current.getBoundingClientRect();
    const deltaXPercent = (deltaX / rect.width) * 100;
    const deltaYPercent = (deltaY / rect.height) * 100;

    const newX = Math.max(0, Math.min(90, draggingCard.originalX + deltaXPercent));
    const newY = Math.max(0, Math.min(90, draggingCard.originalY + deltaYPercent));

    setDraggingCard(prev => ({ ...prev, currentX: newX, currentY: newY }));
  };

  const handleDragEnd = async () => {
    if (!draggingCard) return;
    const { currentX, currentY, card } = draggingCard;
    if (currentX !== undefined && currentY !== undefined) {
      await handleAction('MOVE_CARD_XY', { cardId: card.instanceId, x: Number(currentX.toFixed(1)), y: Number(currentY.toFixed(1)) });
    }
    setDraggingCard(null);
  };

  const isMyTurn = game?.turnPlayerId === userId;
  const hasPriority = game?.priorityPlayerId === userId;

  const opponent = game?.players.find(p => p.id !== userId);
  const isOppTurn = !!opponent && game?.turnPlayerId === opponent.id;
  const handRevealed = myPlayer?.handRevealed || false;

  const waitingForPlayers = game?.players.length < 2;

  const handleAction = async (actionType, payload = {}) => {
    if (!game) return;
    // UPDATED: Path
    const gameRef = doc(db, 'games_v3', gameId);

    // FIX: Safety check for name
    const logEntry = {
      timestamp: Date.now(),
      playerId: userId,
      playerName: myPlayer?.name || 'Unknown',
      type: actionType,
      desc: payload.desc || actionType
    };

    let updates = { log: arrayUnion(logEntry) };

    if (actionType === 'ROLL_DICE') {
      const { diceType } = payload;
      let result = 0, msg = '';
      if (diceType === 'coin') {
        result = Math.random() > 0.5 ? 1 : 0;
        msg = result === 1 ? 'HEADS' : 'TAILS';
        updates.log = arrayUnion({...logEntry, type: 'FLIP_COIN', desc: `Coin Flip: ${msg}`});
      } else if (diceType === 'd6') {
        result = Math.ceil(Math.random() * 6);
        updates.log = arrayUnion({...logEntry, desc: `Rolled D6: ${result}`});
      } else if (diceType === 'd20') {
        result = Math.ceil(Math.random() * 20);
        updates.log = arrayUnion({...logEntry, desc: `Rolled D20: ${result}`});
      }
    } else if (actionType === 'SEND_CHAT') {
      const chatEntry = {
        timestamp: Date.now(),
        playerId: userId,
        playerName: myPlayer?.name || 'Unknown',
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
      const newCards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, x: payload.x, y: payload.y } : c);
      updates.cards = newCards;
      delete updates.log;
    } else if (actionType === 'TIDY_BOARD') {
      const myBattlefield = game.cards.filter(c => c.controllerId === userId && c.zone === ZONES.BATTLEFIELD);
      const lands = myBattlefield.filter(c => c.type_line && c.type_line.toLowerCase().includes('land'));
      const nonLands = myBattlefield.filter(c => !c.type_line || !c.type_line.toLowerCase().includes('land'));

      const updatesArr = [];
      nonLands.forEach((c, i) => updatesArr.push({ ...c, x: (i % 5) * 18 + 5, y: 10 + Math.floor(i / 5) * 20 }));
      lands.forEach((c, i) => updatesArr.push({ ...c, x: (i % 6) * 15 + 5, y: 60 + Math.floor(i / 6) * 15 }));

      const newCards = game.cards.map(c => {
        const updated = updatesArr.find(u => u.instanceId === c.instanceId);
        return updated || c;
      });
      updates.cards = newCards;
      updates.log = arrayUnion({...logEntry, desc: 'Tidied the board'});
    } else if (actionType === 'SHUFFLE_LIBRARY') {
      const ownerId = payload.targetOwnerId || userId;
      const libCards = game.cards.filter(c => c.ownerId === ownerId && c.zone === ZONES.LIBRARY);
      const otherCards = game.cards.filter(c => !(c.ownerId === ownerId && c.zone === ZONES.LIBRARY));
      updates.cards = [...otherCards, ...shuffleArray([...libCards])];
      updates.log = arrayUnion({...logEntry, desc: `${myPlayer.name} shuffled ${ownerId === userId ? 'their' : "opponent's"} library`});
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
      updates.log = arrayUnion({ ...logEntry, desc: `${myPlayer?.name || 'Player'} took a mulligan (drew ${drawCount})` });

    } else if (actionType === 'PLAYER_COUNTER') {
      const pIndex = game.players.findIndex(p => p.id === userId);
      const player = game.players[pIndex];
      const currentVal = player.counters?.[payload.counterType] || 0;
      const newVal = Math.max(0, currentVal + payload.amount);
      const newPlayers = [...game.players];
      newPlayers[pIndex] = { ...player, counters: { ...player.counters, [payload.counterType]: newVal } };
      updates.players = newPlayers;
      updates.log = arrayUnion({...logEntry, desc: `${payload.amount > 0 ? 'Added' : 'Removed'} ${payload.counterType} counter`});

    } else if (actionType === 'CREATE_TOKEN') {
      const newToken = {
        instanceId: generateCardId(),
        name: payload.name || "Token",
        power: payload.power || "1",
        toughness: payload.toughness || "1",
        type_line: "Token Creature",
        ownerId: userId,
        controllerId: userId,
        zone: ZONES.BATTLEFIELD,
        tapped: false,
        counters: {},
        isToken: true,
        x: 10 + (Math.random() * 10 - 5),
        y: 10 + (Math.random() * 10 - 5)
      };
      updates.cards = [...game.cards, newToken];
      updates.log = arrayUnion({...logEntry, desc: `Created ${newToken.power}/${newToken.toughness} ${newToken.name} Token`});

    } else if (actionType === 'CLONE_CARD') {
      const original = game.cards.find(c => c.instanceId === payload.cardId);
      if (original) {
        const newX = Math.max(0, Math.min(90, (original.x || 10) + 3));
        const newY = Math.max(0, Math.min(90, (original.y || 10) + 3));
        const clone = {
          ...original,
          instanceId: generateCardId(),
          x: newX,
          y: newY,
          zone: ZONES.BATTLEFIELD, // Keep owner/controller, copy other fields by spread
        };
        updates.cards = [...game.cards, clone];
        updates.log = arrayUnion({...logEntry, desc: `Cloned ${original.name}`});
      }
    } else if (actionType === 'SCRY_TOP') {
      const targetId = payload.targetOwnerId || userId;
      const lib = game.cards.filter(c => c.ownerId === targetId && c.zone === ZONES.LIBRARY);
      if (lib.length > 0) {
        setScryCard({ ...lib[0], ownerId: targetId });
        if (targetId !== userId) {
          updates.log = arrayUnion({ ...logEntry, desc: `${myPlayer.name} looked at top of opponent's library` });
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
      setScryCard(null);

    } else if (actionType === 'SCRY_KEEP_TOP') {
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

    } else if (actionType === 'TOGGLE_FACE') {
      const newCards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, faceDown: !c.faceDown } : c);
      updates.cards = newCards;

    } else if (actionType === 'CHANGE_CONTROL') {
      const newCards = game.cards.map(c =>
        c.instanceId === payload.cardId ? { ...c, controllerId: c.controllerId === userId ? (opponent?.id || userId) : userId, zone: ZONES.BATTLEFIELD, x: 10, y: 10 } : c
      );
      updates.cards = newCards;
      updates.log = arrayUnion({...logEntry, desc: `Changed control of ${payload.cardName}`});

    } else if (actionType === 'DISCARD_RANDOM') {
      const myHand = game.cards.filter(c => c.controllerId === userId && c.zone === ZONES.HAND);
      if (myHand.length > 0) {
        const randomCard = myHand[Math.floor(Math.random() * myHand.length)];
        const newCards = game.cards.map(c => c.instanceId === randomCard.instanceId ? { ...c, zone: ZONES.GRAVEYARD } : c);
        updates.cards = newCards;
        updates.log = arrayUnion({...logEntry, desc: `Discarded ${randomCard.name} at random`});
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
        let nextActivePlayerIdx = game.activePlayerIndex;
        let nextTurnPlayerId = game.turnPlayerId;

        if (nextPhase.id === 'untap') {
          nextTurnNum++;
          // In solo, active player never changes index (always 0)
        }

        updates = { ...updates, phase: nextPhase.id, turnNumber: nextTurnNum, log: arrayUnion({ ...logEntry, desc: `Phase: ${nextPhase.label}` }) };

        // Untap logic
        if (nextPhase.id === 'untap') {
          const newCards = game.cards.map(c => {
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
              const isPerm = !card.type_line.includes('Instant') && !card.type_line.includes('Sorcery');
              card.zone = isPerm ? ZONES.BATTLEFIELD : ZONES.GRAVEYARD;
              card.tapped = false;
              if (isPerm) {
                const isLand = (card.type_line || '').toLowerCase().includes('land');
                const existingBf = updatedCards.filter(c => c.controllerId === card.controllerId && c.zone === ZONES.BATTLEFIELD && c.instanceId !== card.instanceId );
                const existingLands = existingBf.filter(c => (c.type_line || '').toLowerCase().includes('land'));
                const existingNonLands = existingBf.filter(c => !(c.type_line || '').toLowerCase().includes('land'));

                if (isLand) {
                  const i = existingLands.length;
                  card.x = (i % 6) * 15 + 5;
                  card.y = 60 + Math.floor(i / 6) * 15;
                } else {
                  const i = existingNonLands.length;
                  card.x = (i % 5) * 18 + 5;
                  card.y = 10 + Math.floor(i / 5) * 20;
                }
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
              log: arrayUnion({ ...logEntry, desc: `Resolved: ${item.name}` })
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
            updates = {
              ...updates,
              phase: nextPhase.id,
              consecutivePasses: 0,
              priorityIndex: nextActivePlayerIdx,
              priorityPlayerId: game.players[nextActivePlayerIdx].id,
              activePlayerIndex: nextActivePlayerIdx,
              turnPlayerId: nextTurnPlayerId,
              turnNumber: nextTurnNum,
              log: arrayUnion({ ...logEntry, desc: `Phase: ${nextPhase.label}` })
            };

            if (nextPhase.id === 'untap') {
              const newCards = game.cards.map(c => {
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
      const newCards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, zone: ZONES.BATTLEFIELD, x: 10, y: 70 } : c);
      updates.cards = newCards;

    } else if (actionType === 'CAST_SPELL') {
      // Priority Guard
      if (game.players.length >= 2 && game.priorityPlayerId !== userId) {
        setNotification("No priority — wait or press Pass");
        setTimeout(() => setNotification(null), 2000);
        return;
      }

      const card = game.cards.find(c => c.instanceId === payload.cardId);
      const stackItem = {
        id: generateCardId(),
        sourceId: card.instanceId,
        name: card.name,
        controllerId: userId,
        timestamp: Date.now(),
        targetIds: payload.targetIds || [], // Store array of targets on stack item
        targetPlayerIds: payload.targetPlayerIds || [], // Store array of player targets
        cardImage: card.image_uri || null // Added cardImage
      };

      const newCards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, zone: 'stack_zone' } : c);
      const userIndex = game.players.findIndex(p => p.id === userId);

      updates = {
        ...updates,
        cards: newCards,
        stack: arrayUnion(stackItem),
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
      const stackItem = {
        id: generateCardId(),
        sourceId: payload.sourceId,
        name: `${sourceCard.name} (Ability)`,
        controllerId: userId,
        timestamp: Date.now(),
        targetIds: payload.targetIds || [],
        targetPlayerIds: payload.targetPlayerIds || [], // Store array of player targets
        type: 'ABILITY',
        cardImage: sourceCard.image_uri || null // Added cardImage
      };
      const userIndex = game.players.findIndex(p => p.id === userId);
      updates.stack = arrayUnion(stackItem);
      updates.consecutivePasses = 0;
      updates.log = arrayUnion({ ...logEntry, desc: `Activated ability of ${sourceCard.name}` });
      updates.priorityPlayerId = userId;
      updates.priorityIndex = userIndex !== -1 ? userIndex : game.priorityIndex;

    } else if (actionType === 'TAP_TOGGLE') {
      const newCards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, tapped: !c.tapped } : c);
      updates.cards = newCards;

    } else if (actionType === 'DRAW_CARD') {
      const libCards = game.cards.filter(c => c.ownerId === userId && c.zone === ZONES.LIBRARY);
      if (libCards.length > 0) {
        const cardToDraw = libCards[0];
        const newCards = game.cards.map(c => c.instanceId === cardToDraw.instanceId ? { ...c, zone: ZONES.HAND } : c);
        updates.cards = newCards;
      }

    } else if (actionType === 'MOVE_ZONE') {
      const newCards = game.cards.map(c =>
        c.instanceId === payload.cardId ? { ...c, zone: payload.targetZone, tapped: false, controllerId: c.ownerId, x: 10, y: 10 } : c
      );
      updates.cards = newCards;

    } else if (actionType === 'MOVE_TO_LIBRARY') {
      const cardToMove = game.cards.find(c => c.instanceId === payload.cardId);
      const otherCards = game.cards.filter(c => c.instanceId !== payload.cardId);
      const updatedCard = { ...cardToMove, zone: ZONES.LIBRARY, tapped: false, faceDown: false, counters: {}, x: 5, y: 5 };

      if (payload.position === 'TOP') {
        updates.cards = [updatedCard, ...otherCards];
      } else {
        updates.cards = [...otherCards, updatedCard];
      }
      updates.log = arrayUnion({ ...logEntry, desc: `Moved ${updatedCard.name} to ${payload.position === 'TOP' ? 'top' : 'bottom'} of library` });

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
      updates.log = arrayUnion({ ...logEntry, desc: `Reordered top ${orderedIds.length} cards of ${ownerId === userId ? 'their' : "opponent's"} library` });

    } else if (actionType === 'LIFE_CHANGE') {
      const newPlayers = game.players.map(p =>
        p.id === payload.targetPlayerId ? { ...p, life: p.life + payload.amount } : p
      );
      updates.players = newPlayers;

    } else if (actionType === 'REVEAL_CARD') {
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      const revealEntry = {
        id: generateCardId(),
        cardId: card.instanceId,
        cardName: card.name,
        cardImage: card.image_uri,
        revealerId: userId,
        revealerName: myPlayer?.name || 'Unknown',
        timestamp: Date.now()
      };
      updates.reveals = arrayUnion(revealEntry);
      updates.log = arrayUnion({...logEntry, desc: `Revealed: ${card.name}`, cardImage: card.image_uri});

    } else if (actionType === 'REVEAL_ALL_HAND') {
      const handCards = game.cards.filter(c => c.controllerId === userId && c.zone === ZONES.HAND);
      if (handCards.length === 0) return;

      const newRevealEntries = [];
      const newLogEntries = [];

      handCards.forEach((card, index) => {
        const revealEntry = {
          id: generateCardId(),
          cardId: card.instanceId,
          cardName: card.name,
          cardImage: card.image_uri,
          revealerId: userId,
          revealerName: myPlayer?.name || 'Unknown',
          timestamp: Date.now() + index // Offset slightly to preserve order
        };
        newRevealEntries.push(revealEntry);
        newLogEntries.push({
          timestamp: Date.now() + index,
          playerId: userId,
          playerName: myPlayer?.name || 'Unknown',
          type: 'REVEAL_CARD',
          desc: `Revealed: ${card.name}`,
          cardImage: card.image_uri
        });
      });

      if (newRevealEntries.length > 0) {
        updates.reveals = arrayUnion(...newRevealEntries);
        updates.log = arrayUnion(...newLogEntries);
      }

    } else if (actionType === 'CLEAR_REVEALS') {
      updates.reveals = [];
      updates.log = arrayUnion({ ...logEntry, desc: 'Cleared revealed cards' });

    } else if (actionType === 'TOGGLE_HAND_REVEAL') {
      const newPlayers = game.players.map(p => p.id === userId ? { ...p, handRevealed: !p.handRevealed } : p);
      updates.players = newPlayers;
      updates.log = arrayUnion({...logEntry, desc: !handRevealed ? 'Revealed their hand' : 'Hid their hand'});
    }

    await updateDoc(gameRef, updates);
  };

  const importDeck = async () => {
    setImporting(true);
    const lines = deckInput.split('\n').filter(l => l.trim());
    const newCards = [...(game.cards || [])];
    let xOffset = 5, yOffset = 5;

    for (const line of lines) {
      let count = 1, name = line.trim();
      const match = line.match(/^(\d+)\s+(.+)/);
      if (match) {
        count = parseInt(match[1]);
        name = match[2];
      }

      try {
        const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
        const data = await res.json();
        if (data && data.name) {
          for (let i = 0; i < count; i++) {
            newCards.push({
              instanceId: generateCardId(),
              scryfallId: data.id,
              name: data.name,
              mana_cost: data.mana_cost,
              type_line: data.type_line,
              image_uri: data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal,
              ownerId: userId,
              controllerId: userId,
              zone: ZONES.LIBRARY,
              tapped: false,
              counters: {},
              faceDown: false,
              x: xOffset,
              y: yOffset
            });
            xOffset = (xOffset + 5) % 80;
          }
        }
      } catch (e) {
        console.error("Failed to fetch", name);
      }
      await new Promise(r => setTimeout(r, 50));
    }
    // UPDATED: Path
    await updateDoc(doc(db, 'games_v3', gameId), {
      cards: newCards,
      log: arrayUnion({
        timestamp: Date.now(),
        playerId: userId,
        playerName: myPlayer?.name || 'Unknown',
        type: 'IMPORT',
        desc: `Imported ${lines.length} cards`
      })
    });

    setImporting(false);
    setDeckInput('');
  };

  const createToken = () => {
    setLibraryMenuOpen(false);
    setTokenModal({ name: "Token", power: "1", toughness: "1" });
  };

  const addCustomCounter = () => {
    if(!selectedCard) return;
    setCustomCounterModal({ cardId: selectedCard.instanceId, label: 'default', amount: 1 });
    setSelectedCard(null);
  };

  const toggleTarget = (card) => {
    if (!targetingState) return;
    const newSelected = [...targetingState.selectedIds];
    const idx = newSelected.indexOf(card.instanceId);
    if (idx >= 0) newSelected.splice(idx, 1);
    else newSelected.push(card.instanceId);
    setTargetingState({ ...targetingState, selectedIds: newSelected });
  };

  const toggleTargetPlayer = (pid) => {
    if (!targetingState) return;
    const pidStr = getPlayerTargetId(pid);
    const newSelected = [...targetingState.selectedIds];
    const idx = newSelected.indexOf(pidStr);
    if (idx >= 0) newSelected.splice(idx, 1);
    else newSelected.push(pidStr);
    setTargetingState({ ...targetingState, selectedIds: newSelected });
  };

  const finishTargeting = async () => {
    if (!targetingState || !game) return;
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
          log: arrayUnion({
            timestamp: Date.now(),
            playerId: userId,
            playerName: myPlayer?.name || 'Unknown',
            type: 'TARGET',
            desc: `Targeted ${selectedIds.length} cards/players with ${source.name}`
          })
        });
      }
    }
    setTargetingState(null);
  };

  const clearTargets = async (card) => {
    if (!game.targets) return;
    const newTargets = game.targets.filter(t => !((t.sourceId === card.instanceId || t.targetId === card.instanceId) && t.controllerId === userId));

    if (newTargets.length !== game.targets.length) {
      // UPDATED: Path
      await updateDoc(doc(db, 'games_v3', gameId), {
        targets: newTargets,
        log: arrayUnion({
          timestamp: Date.now(),
          playerId: userId,
          playerName: myPlayer?.name || 'Unknown',
          type: 'CLEAR_TARGETS',
          desc: `Cleared targets for ${card.name}`
        })
      });
    }
    setSelectedCard(null);
  };

  // Reorder Logic
  const startReorderTop = (targetId = userId) => {
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

  const openStackItem = (item) => {
    const card = game.cards.find(c => c.instanceId === item.sourceId);
    if (card && card.image_uri) {
      setZoomedCard(card);
    } else if (item.cardImage) {
      setZoomedCard({ name: item.name, image_uri: item.cardImage });
    } else {
      setNotification("No image available for this stack item.");
      setTimeout(() => setNotification(null), 2000);
    }
  };

  if (loading) return <div className="text-white p-10 flex justify-center"><RotateCw className="animate-spin"/></div>;
  if (!game) return <div className="text-white p-10">Game not found</div>;

  // FIX: Add defaults (|| []) to prevent crashes on initial sync
  const myHand = (game.cards || []).filter(c => c.controllerId === userId && c.zone === ZONES.HAND);
  const myBattlefield = (game.cards || []).filter(c => c.controllerId === userId && c.zone === ZONES.BATTLEFIELD);
  const oppBattlefield = (game.cards || []).filter(c => c.controllerId !== userId && c.zone === ZONES.BATTLEFIELD);
  const oppHand = (game.cards || []).filter(c => c.controllerId !== userId && c.zone === ZONES.HAND);
  const opponentIsRevealing = (game.players || []).find(p => p.id !== userId)?.handRevealed;

  const getZoneCount = (pid, zone) => (game.cards || []).filter(c => c.ownerId === pid && c.zone === zone).length;
  const myGYCount = getZoneCount(userId, ZONES.GRAVEYARD);
  const myExileCount = getZoneCount(userId, ZONES.EXILE);
  // Opponent Counts
  const oppGYCount = opponent ? getZoneCount(opponent.id, ZONES.GRAVEYARD) : 0;
  const oppExileCount = opponent ? getZoneCount(opponent.id, ZONES.EXILE) : 0;

  const stackCards = game.stack || [];
  const cardsMap = new Map((game.cards || []).map(c => [c.instanceId, c]));

  // Collect player targets from stack
  const stackPlayerTargets = new Set();
  (game.stack || []).forEach(item => {
    if (item.targetPlayerIds) {
      item.targetPlayerIds.forEach(pid => stackPlayerTargets.add(pid));
    }
  });

  const isOpponentTargeted = (opponent && targetingState?.selectedIds.includes(getPlayerTargetId(opponent.id))) || (opponent && stackPlayerTargets.has(opponent.id));
  const isSelfTargeted = targetingState?.selectedIds.includes(getPlayerTargetId(userId)) || stackPlayerTargets.has(userId);

  return (
    <div
      className="flex flex-col h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans"
      onMouseMove={handleDragMove}
      onTouchMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onTouchEnd={handleDragEnd}
    >
      {/* 1. Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-2 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-md z-20">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isMyTurn ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-slate-600'}`}></div>
          <div className="flex flex-col leading-none">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Phase</span>
            <span className="font-bold text-sm text-purple-300">
              {PHASES.find(p => p.id === game.phase)?.label}
            </span>
          </div>
        </div>

        <div
          className="flex flex-col items-center justify-center bg-slate-900 px-3 py-1 rounded border border-slate-700 cursor-pointer hover:bg-slate-800 w-full sm:w-auto order-3 sm:order-none"
          onClick={() => copyToClipboard(gameId)}
          title="Click to Copy Game ID"
        >
          <span className="text-[9px] text-slate-500 uppercase tracking-widest hidden sm:block">Room Code</span>
          <span className="text-xs font-mono font-bold text-white tracking-widest">{gameId}</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-400">STACK</span>
            <span className={`font-mono font-bold ${stackCards.length > 0 ? 'text-yellow-400' : 'text-slate-600'}`}>
              {stackCards.length}
            </span>
          </div>
          <button
            onClick={openChat}
            className="relative p-2 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <MessageSquare size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setRevealsOpen(true)}
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-slate-700 relative"
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
          {waitingForPlayers ? (
            <div className="text-xs text-yellow-500 font-bold flex items-center gap-1"><Users size={12} /> Waiting</div>
          ) : hasPriority ? (
            <button
              onClick={() => handleAction('PASS_PRIORITY')}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg transform active:scale-95 transition-all flex items-center gap-2"
            >
              <ArrowRight size={14} /> Pass
            </button>
          ) : (
            <div className="flex items-center gap-2 text-slate-500 px-3 py-1 bg-slate-900/50 rounded-full border border-slate-800">
              <Clock size={14} /> <span className="text-xs font-medium italic">Waiting...</span>
            </div>
          )}

          <div className="h-8 w-[1px] bg-slate-700 mx-1"></div>
          <button
            onClick={onExit}
            className="p-1 text-slate-400 hover:text-white"
            title="Leave Game"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 2. Board */}
      <div className="flex-1 overflow-hidden relative bg-slate-900/95" style={{ backgroundImage: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)' }}>
        {/* Opponent Area */}
        <div className="absolute top-0 left-0 right-0 h-[25%] border-b border-slate-700/50 bg-slate-800/30 overflow-y-auto z-0 p-4">
          <div
            className={`flex justify-between items-start mb-2 opacity-70 sticky top-0 bg-slate-900/50 p-1 rounded z-10 backdrop-blur-sm transition-all ${isOpponentTargeted ? 'ring-2 ring-blue-500 bg-blue-900/40 opacity-100' : ''} ${targetingState ? 'cursor-crosshair hover:bg-slate-800' : ''}`}
            onClick={() => targetingState && opponent ? toggleTargetPlayer(opponent.id) : null}
          >
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-red-400"/>
              <div className="flex items-center gap-2">
                <span className="font-bold">{opponent?.name || 'Waiting...'}</span>
                {isOppTurn && (
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-600/30 text-amber-200 border border-amber-500/40">
                    TURN
                  </span>
                )}
                {isOpponentTargeted && (
                  <div className="text-xs bg-blue-600 text-white rounded-full px-2 py-0.5 font-bold shadow animate-in zoom-in">🎯 Target</div>
                )}
              </div>
              <span className="bg-slate-700 px-2 py-0.5 rounded text-xs flex gap-2">
                <span>Life: {opponent?.life}</span>
                {opponent?.counters?.poison > 0 && <span className="text-green-400">P:{opponent.counters.poison}</span>}
              </span>
              {opponent && (
                <div className="flex gap-2 text-xs text-slate-300 ml-2 border-l border-slate-600 pl-2">
                  <span className="font-mono" title="Cards in Hand">H:{oppHand.length}</span>
                  <button className="flex items-center gap-1 hover:text-white" onClick={(e) => { e.stopPropagation(); setViewZone({ zone: ZONES.GRAVEYARD, ownerId: opponent.id }); }} title="Opponent Graveyard">
                    <Skull size={12} /> {oppGYCount}
                  </button>
                  <button className="flex items-center gap-1 hover:text-white" onClick={(e) => { e.stopPropagation(); setViewZone({ zone: ZONES.EXILE, ownerId: opponent.id }); }} title="Opponent Exile">
                    <RotateCw size={12} /> {oppExileCount}
                  </button>
                </div>
              )}
            </div>
            {opponent && (
              <button
                onClick={(e) => { e.stopPropagation(); setOppBoardOpen(true); }}
                className="text-xs px-3 py-1 rounded-full bg-slate-700/60 hover:bg-slate-600 text-slate-200 border border-slate-600"
                title="View Opponent Battlefield"
              >
                View
              </button>
            )}
          </div>

          {opponentIsRevealing && (
            <div className="mb-2 p-2 bg-purple-900/20 rounded border border-purple-500/30 flex gap-2 overflow-x-auto">
              <span className="text-[10px] text-purple-300 uppercase vertical-text">Revealed</span>
              {oppHand.map(c => (
                <div key={c.instanceId} className="w-12 h-16 shrink-0 relative">
                  <img src={c.image_uri} className="w-full h-full rounded object-cover opacity-80" />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-center opacity-80 rotate-180">
            {oppBattlefield.map(card => (
              <Card
                key={card.instanceId}
                card={card}
                zone={ZONES.BATTLEFIELD}
                targets={game.targets || []}
                stack={stackCards}
                isSelected={targetingState?.selectedIds.includes(card.instanceId)}
                onMove={() => targetingState ? toggleTarget(card) : setSelectedCard(card)}
                onZoom={setZoomedCard}
              />
            ))}
          </div>
        </div>

        {/* Stack Overlay */}
        {stackCards.length > 0 && (
          <div className="absolute top-[25%] left-0 right-0 z-20 flex justify-center pointer-events-none">
            <div className="my-2 mx-4 p-3 bg-yellow-900/80 border border-yellow-700/50 rounded-lg flex flex-col gap-2 pointer-events-auto backdrop-blur">
              <div className="text-xs text-yellow-500 font-bold uppercase tracking-wider flex items-center gap-2">
                <Layers size={12} /> The Stack
              </div>
              <div className="space-y-1">
                {[...stackCards].reverse().map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => openStackItem(item)}
                    className="bg-black/60 p-2 rounded border-l-2 border-yellow-500 flex justify-between items-center gap-4 cursor-pointer hover:bg-black/80 transition-colors"
                  >
                    <span className="text-sm font-medium text-yellow-100">{item.name}</span>
                    <span className="text-[10px] text-slate-400">
                      {game.players.find(p => p.id === item.controllerId)?.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* My Battlefield (Draggable Canvas) */}
        <div
          ref={boardRef}
          className="absolute top-[25%] bottom-0 left-0 right-0 overflow-y-auto overflow-x-hidden p-4"
        >
          {/* Unlock Controls */}
          <div className="sticky top-0 z-30 flex justify-end gap-2 pointer-events-none">
            <button
              onClick={() => handleAction('TIDY_BOARD')}
              className={`pointer-events-auto p-2 rounded-full shadow-xl bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-600`}
              title="Tidy Board (Reset to Grid)"
            >
              <LayoutGrid size={20} />
            </button>
            <button
              onClick={() => setBoardUnlocked(!boardUnlocked)}
              className={`pointer-events-auto p-2 rounded-full shadow-xl transition-all ${boardUnlocked ? 'bg-orange-500 text-white animate-pulse' : 'bg-slate-700/50 text-slate-400'}`}
              title={boardUnlocked ? "Lock Board (Disable Drag)" : "Unlock Board (Enable Drag)"}
            >
              {boardUnlocked ? <Unlock size={20} /> : <Lock size={20} />}
            </button>
          </div>

          {/* Board Content */}
          <div className={`w-full min-h-[600px] relative`}>
            {myBattlefield.map(card => {
              const isDragging = draggingCard?.card.instanceId === card.instanceId;
              const x = isDragging ? draggingCard.currentX : (card.x !== undefined ? card.x : 10);
              const y = isDragging ? draggingCard.currentY : (card.y !== undefined ? card.y : 10);
              return (
                <Card
                  key={card.instanceId}
                  card={card}
                  zone={ZONES.BATTLEFIELD}
                  isDraggable={boardUnlocked && !targetingState}
                  targets={game.targets || []}
                  stack={stackCards}
                  isSelected={targetingState?.selectedIds.includes(card.instanceId)}
                  style={{ left: `${x}%`, top: `${y}%`, zIndex: isDragging ? 50 : 10 }}
                  onMouseDown={(e) => handleDragStart(e, card)}
                  onMove={() => targetingState ? toggleTarget(card) : setSelectedCard(card)}
                  onZoom={setZoomedCard}
                  onPeek={(c) => setPeekCard(c)}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Footer */}
      <div className="bg-slate-800 border-t border-slate-700 shadow-[0_-5px_15px_rgba(0,0,0,0.5)] z-30">
        <div className="flex justify-between items-center px-4 py-2 bg-slate-900/80 border-b border-slate-700/50">
          <div className="flex items-center gap-4">
            {/* IDENTITY BADGE */}
            <div
              className={`flex items-center gap-2 border-r border-slate-700 pr-3 mr-1 rounded p-1 transition-all ${isSelfTargeted ? 'ring-2 ring-blue-500 bg-blue-900/40' : ''} ${targetingState ? 'cursor-crosshair hover:bg-slate-800' : ''}`}
              onClick={() => targetingState ? toggleTargetPlayer(userId) : null}
            >
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">You</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white max-w-[80px] truncate">{myPlayer?.name}</span>
                  {isMyTurn && (
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-600/30 text-green-200 border border-green-500/40">
                      TURN
                    </span>
                  )}
                  {isSelfTargeted && (
                    <div className="text-xs bg-blue-600 text-white rounded-full px-2 py-0.5 font-bold shadow animate-in zoom-in">🎯</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-800" onClick={(e) => {
              if(targetingState) { e.stopPropagation(); toggleTargetPlayer(userId); }
              else { setPlayerStatsOpen(true); }
            }}>
              <span className="text-red-400 font-bold text-xl">{myPlayer?.life}</span>
              <div className="flex flex-col">
                <button onClick={(e) => { e.stopPropagation(); handleAction('LIFE_CHANGE', { targetPlayerId: userId, amount: 1 }); }} className="text-slate-500 hover:text-green-400"><ChevronUp size={12}/></button>
                <button onClick={(e) => { e.stopPropagation(); handleAction('LIFE_CHANGE', { targetPlayerId: userId, amount: -1 }); }} className="text-slate-500 hover:text-red-400"><ChevronDown size={12}/></button>
              </div>
              {myPlayer?.counters?.poison > 0 && (
                <div className="ml-2 bg-green-900 text-green-200 text-xs px-1 rounded flex items-center" title="Poison">
                  <Skull size={10} className="mr-1"/> {myPlayer.counters.poison}
                </div>
              )}
            </div>

            <div className="h-6 w-[1px] bg-slate-700"></div>

            <div className="flex gap-2 text-xs text-slate-400">
              <div className="flex items-center gap-1 cursor-pointer hover:text-white" onClick={() => { setViewZone({ zone: ZONES.GRAVEYARD, ownerId: userId }); }}>
                <Skull size={14} /> GY: {myGYCount}
              </div>
              <div className="flex items-center gap-1 cursor-pointer hover:text-white" onClick={() => { setViewZone({ zone: ZONES.EXILE, ownerId: userId }); }}>
                <RotateCw size={14} /> Ex: {myExileCount}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Dice/Coin Menu */}
            <div className="relative">
              <button onClick={() => setDiceMenuOpen(!diceMenuOpen)} className={`p-2 rounded-full ${diceMenuOpen ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                <Dices size={18} />
              </button>
              {diceMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 bg-slate-800 border border-slate-600 rounded shadow-xl p-1 flex flex-col gap-1 w-32 z-50">
                  <button onClick={() => {handleAction('ROLL_DICE', {diceType: 'coin'}); setDiceMenuOpen(false);}} className="text-left px-3 py-2 hover:bg-slate-700 rounded text-sm flex items-center gap-2"><Coins size={12}/> Flip Coin</button>
                  <button onClick={() => {handleAction('ROLL_DICE', {diceType: 'd6'}); setDiceMenuOpen(false);}} className="text-left px-3 py-2 hover:bg-slate-700 rounded text-sm flex items-center gap-2"><Hexagon size={12}/> Roll D6</button>
                  <button onClick={() => {handleAction('ROLL_DICE', {diceType: 'd20'}); setDiceMenuOpen(false);}} className="text-left px-3 py-2 hover:bg-slate-700 rounded text-sm flex items-center gap-2"><Dices size={12}/> Roll D20</button>
                </div>
              )}
            </div>

            {myHand.length > 0 && (
              <button
                onClick={() => handleAction('REVEAL_ALL_HAND')}
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-700"
                title="Reveal All Hand Cards"
              >
                <Eye size={18} />
              </button>
            )}

            <button
              onClick={() => handleAction('TOGGLE_HAND_REVEAL')}
              className={`p-2 rounded-full ${handRevealed ? 'text-purple-400 bg-purple-900/30' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {handRevealed ? <Unlock size={18} /> : <Lock size={18} />}
            </button>

            {/* Library Menu */}
            <div className="relative">
              <button
                onClick={() => setLibraryMenuOpen(!libraryMenuOpen)}
                className={`p-2 rounded-full hover:bg-slate-700 ${libraryMenuOpen ? 'text-white bg-slate-700' : 'text-slate-400'}`}
              >
                <BookOpen size={18} />
              </button>
              {libraryMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-40 bg-slate-800 rounded shadow-xl border border-slate-600 overflow-hidden z-50">
                  <button onClick={() => handleAction('DRAW_CARD')} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 text-blue-300">
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
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-2 overflow-x-auto whitespace-nowrap hide-scrollbar flex gap-2 min-h-[140px] items-center px-4">
          {myHand.length === 0 && (
            <button
              onClick={() => setDeckInput('20 Mountain\n20 Lightning Bolt\n20 Llanowar Elves')}
              className="mx-auto text-sm text-slate-500 border border-slate-600 border-dashed rounded px-4 py-2 hover:text-white hover:border-slate-400"
            >
              Import Deck
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
            />
          ))}
          {myHand.length > 0 && (
            <button onClick={() => handleAction('DISCARD_RANDOM')} className="ml-4 px-2 py-8 border-l border-slate-700 text-slate-600 hover:text-red-400 flex flex-col items-center justify-center text-[10px]">
              <Shuffle size={14} className="mb-1"/> Discard<br/>Random
            </button>
          )}
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

      {/* TARGETING BANNER */}
      {targetingState && (
        <div className="fixed bottom-40 left-0 right-0 z-[90] flex justify-center pointer-events-none px-4">
          <div className="bg-blue-600 text-white p-3 rounded-lg shadow-xl text-center font-bold animate-in fade-in slide-in-from-bottom-4 border-2 border-blue-400 flex flex-col gap-2 pointer-events-auto max-w-md w-full">
            <div className="flex justify-center items-center gap-2">
              <span>Select targets for: {targetingState.source.name}</span>
              <span className="bg-white text-blue-600 px-2 rounded-full text-xs">{targetingState.selectedIds.length}</span>
            </div>
            <div className="flex justify-center gap-4 text-xs mt-1">
              <button onClick={finishTargeting} className="bg-white text-blue-600 px-4 py-1.5 rounded-full font-bold shadow hover:bg-blue-50 flex items-center gap-1"><Check size={14}/> Done</button>
              <button onClick={() => setTargetingState(null)} className="text-blue-200 underline hover:text-white">Cancel</button>
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
            <h2 className="text-xl font-bold text-white capitalize">{viewZone.zone} ({game.players.find(p => p.id === viewZone.ownerId)?.name})</h2>
            <button onClick={() => setViewZone(null)}><X className="text-white"/></button>
          </div>
          <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-2 content-start">
            {game.cards.filter(c => c.ownerId === viewZone.ownerId && c.zone === viewZone.zone).map(c => (
              <div key={c.instanceId} className="relative" onClick={() => { setSelectedCard(c); setViewZone(null); }}>
                <img src={c.image_uri} className="w-full rounded opacity-70 hover:opacity-100" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opponent Battlefield Modal */}
      {oppBoardOpen && opponent && (
        <div className="fixed inset-0 bg-black/90 z-[80] flex flex-col p-4" onClick={() => setOppBoardOpen(false)}>
          <div className="flex justify-between items-center mb-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-white">
              <div className="text-sm text-slate-400">Opponent Battlefield</div>
              <div className="text-lg font-bold">{opponent.name}</div>
            </div>
            <button className="text-white" onClick={() => setOppBoardOpen(false)}>
              <X />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="relative w-full h-[70vh] bg-slate-950/30 border border-slate-700 rounded-xl overflow-hidden">
              {oppBattlefield.map((c, i) => {
                const pos = (c.x !== undefined && c.y !== undefined) ? { x: c.x, y: c.y } : getFallbackPos(i);
                return (
                  <Card
                    key={c.instanceId}
                    card={c}
                    zone={ZONES.BATTLEFIELD}
                    isDraggable={false}
                    targets={game.targets || []}
                    stack={stackCards}
                    isSelected={targetingState?.selectedIds.includes(c.instanceId)}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%`, zIndex: 10 + i }}
                    onMove={() => {
                      if (targetingState) {
                        toggleTarget(c);
                      } else {
                        setOppBoardOpen(false);
                        setZoomedCard(c);
                      }
                    }}
                    onZoom={setZoomedCard}
                  />
                );
              })}
            </div>
            <div className="text-xs text-slate-500 mt-3 text-center">
              Tap a card to zoom (or target)
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
                    <img src={c.image_uri} className="w-10 h-14 rounded object-cover" />
                    <span className="flex-1 text-sm text-white truncate">{c.name}</span>
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

      {/* Token Modal */}
      {tokenModal && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setTokenModal(null)}>
          <div className="bg-slate-800 p-6 rounded-xl w-full max-w-sm border border-slate-600 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white">Create Token</h3>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Name</label>
              <input type="text" value={tokenModal.name} onChange={e => setTokenModal({...tokenModal, name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" placeholder="e.g. Goblin" />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Power</label>
                <input type="number" value={tokenModal.power} onChange={e => setTokenModal({...tokenModal, power: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Toughness</label>
                <input type="number" value={tokenModal.toughness} onChange={e => setTokenModal({...tokenModal, toughness: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setTokenModal(null)} className="flex-1 bg-slate-700 py-2 rounded text-white hover:bg-slate-600">Cancel</button>
              <button onClick={() => {
                handleAction('CREATE_TOKEN', { name: tokenModal.name.trim() || "Token", power: tokenModal.power.toString() || "1", toughness: tokenModal.toughness.toString() || "1" });
                setTokenModal(null);
              }} className="flex-1 bg-green-600 py-2 rounded text-white hover:bg-green-500 font-bold">Create</button>
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
              .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(c => (
                <div key={c.instanceId} className="relative group" onClick={() => setSelectedCard(c)}>
                  <img src={c.image_uri} className="w-full rounded" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2">
                    <span className="text-xs font-bold text-white mb-1">{c.name}</span>
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
          <div className="bg-slate-800 p-6 rounded-xl w-full max-w-sm border border-slate-600" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 text-white">Player Counters</h3>
            <div className="space-y-4">
              {['poison', 'energy', 'experience', 'commanderTax'].map(type => (
                <div key={type} className="flex justify-between items-center bg-slate-700 p-3 rounded">
                  <span className="capitalize text-slate-300 font-medium">{type}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleAction('PLAYER_COUNTER', { counterType: type, amount: -1 })} className="w-8 h-8 rounded bg-slate-900 text-red-400 font-bold">-</button>
                    <span className="w-6 text-center font-bold text-white">{myPlayer.counters?.[type] || 0}</span>
                    <button onClick={() => handleAction('PLAYER_COUNTER', { counterType: type, amount: 1 })} className="w-8 h-8 rounded bg-slate-900 text-green-400 font-bold">+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Peek Modal */}
      {peekCard && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex flex-col items-center justify-center p-4" onClick={() => setPeekCard(null)}>
          <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2"><EyeOff /> Peeking at Face-Down Card</h3>
          <img src={peekCard.image_uri} alt={peekCard.name} className="max-w-full max-h-[70vh] rounded-xl shadow-2xl border-4 border-blue-500" />
          <p className="text-slate-400 mt-4 text-sm">Only you can see this.</p>
        </div>
      )}

      {/* Revealed Cards Modal */}
      {revealsOpen && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Revealed Cards</h2>
            <button onClick={() => setRevealsOpen(false)}><X className="text-white"/></button>
          </div>
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
              <img src={scryCard.image_uri} alt={scryCard.name} className="h-64 rounded-lg shadow-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleAction('SCRY_KEEP_TOP')} className="bg-slate-600 hover:bg-slate-500 py-3 rounded-lg font-bold">Keep on Top</button>
              <button onClick={() => handleAction('SCRY_BOTTOM', { cardId: scryCard.instanceId })} className="bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold">Bottom</button>
            </div>
          </div>
        </div>
      )}

      {selectedCard && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedCard(null)}>
          <div className="bg-slate-800 w-full max-w-sm rounded-xl p-4 shadow-2xl border border-slate-600 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-700 pb-2 mb-2">
              <span className="font-bold text-lg text-white truncate pr-2">{selectedCard.name}</span>
              <button onClick={() => setSelectedCard(null)}><X className="text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { handleAction('REVEAL_CARD', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="bg-slate-700 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2"><Eye size={14}/> Reveal</button>
              {selectedCard.zone === ZONES.HAND && (
                <button onClick={() => { handleAction('REVEAL_ALL_HAND'); setSelectedCard(null); }} className="bg-slate-700 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2"><Eye size={14}/> Reveal Hand</button>
              )}

              {selectedCard.zone === ZONES.HAND && (
                <>
                  <button onClick={() => { handleAction('PLAY_LAND', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="bg-amber-900/50 hover:bg-amber-800 text-amber-100 p-3 rounded-lg font-medium border border-amber-800">Play Land</button>
                  <button onClick={() => { handleAction('CAST_SPELL', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="bg-purple-900/50 hover:bg-purple-800 text-purple-100 p-3 rounded-lg font-medium border border-purple-800">Cast Spell</button>
                  <button onClick={() => { setTargetingState({ source: selectedCard, mode: 'CAST', selectedIds: [] }); setSelectedCard(null); }} className="col-span-2 bg-purple-900/50 hover:bg-purple-800 text-purple-100 p-3 rounded-lg font-medium border border-purple-800 flex items-center justify-center gap-2">Cast + Target 🎯</button>
                  <button onClick={() => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.BATTLEFIELD }); handleAction('TOGGLE_FACE', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="col-span-2 bg-slate-700 text-slate-300 p-2 rounded-lg text-sm">Play Face Down (Morph)</button>
                </>
              )}

              {selectedCard.zone === ZONES.BATTLEFIELD && (
                <>
                  <button onClick={() => { handleAction('TAP_TOGGLE', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="bg-slate-700 text-white p-3 rounded-lg font-medium">{selectedCard.tapped ? 'Untap' : 'Tap'}</button>
                  <button onClick={() => { handleAction('TOGGLE_FACE', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="bg-slate-700 text-white p-3 rounded-lg font-medium">{selectedCard.faceDown ? 'Turn Face Up' : 'Turn Face Down'}</button>
                  <div className="col-span-2 flex flex-col bg-slate-700 rounded-lg p-2 gap-2">
                    <div className="flex justify-between items-center border-b border-slate-600 pb-1">
                      <span className="text-sm text-slate-300 pl-1">+1/+1</span>
                      <div className="flex gap-2">
                        <button onClick={() => handleAction('MOD_COUNTER', { cardId: selectedCard.instanceId, amount: -1 })} className="w-6 h-6 bg-black/40 rounded text-red-400 font-bold text-xs">-</button>
                        <button onClick={() => handleAction('MOD_COUNTER', { cardId: selectedCard.instanceId, amount: 1 })} className="w-6 h-6 bg-black/40 rounded text-green-400 font-bold text-xs">+</button>
                      </div>
                    </div>
                    <button onClick={addCustomCounter} className="text-xs text-blue-300 hover:text-white text-left pl-1 flex items-center gap-1"><Hexagon size={10}/> Add Custom Counter...</button>
                  </div>
                  <button onClick={() => { setTargetingState({ source: selectedCard, mode: 'ABILITY', selectedIds: [] }); setSelectedCard(null); }} className="bg-blue-900/50 hover:bg-blue-800 text-blue-100 p-2 rounded-lg text-sm flex items-center justify-center gap-2 border border-blue-800">Ability 🎯</button>
                  <button onClick={() => { setTargetingState({ source: selectedCard, mode: 'MANUAL', selectedIds: [] }); setSelectedCard(null); }} className="bg-slate-700 hover:bg-slate-600 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2 border border-slate-600">Target... 🎯</button>
                  <button onClick={() => clearTargets(selectedCard)} className="col-span-2 bg-slate-700 hover:bg-slate-600 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2">✖ Clear Targets</button>
                  <button onClick={() => { handleAction('CLONE_CARD', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="bg-slate-700 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2"><Copy size={12}/> Clone</button>
                  <button onClick={() => { handleAction('CHANGE_CONTROL', { cardId: selectedCard.instanceId, cardName: selectedCard.name }); setSelectedCard(null); }} className="bg-slate-700 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2"><UserCheck size={12}/> Give Control</button>
                </>
              )}

              <button onClick={() => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.GRAVEYARD }); setSelectedCard(null); }} className="bg-slate-700 hover:bg-red-900/50 text-white p-3 rounded-lg font-medium">To Graveyard</button>
              <button onClick={() => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.EXILE }); setSelectedCard(null); }} className="bg-slate-700 text-slate-300 p-3 rounded-lg font-medium">To Exile</button>
              <button onClick={() => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.HAND }); setSelectedCard(null); }} className="bg-slate-700 text-slate-300 p-3 rounded-lg font-medium">To Hand</button>

              {selectedCard.zone !== ZONES.BATTLEFIELD && selectedCard.zone !== ZONES.HAND && (
                <button onClick={() => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.BATTLEFIELD }); setSelectedCard(null); }} className="col-span-2 bg-purple-900/50 text-white p-3 rounded-lg font-medium">Return to Battlefield</button>
              )}

              <button onClick={() => { handleAction('MOVE_TO_LIBRARY', { cardId: selectedCard.instanceId, position: 'TOP' }); setSelectedCard(null); }} className="bg-slate-700 text-slate-300 p-2 rounded-lg text-sm font-medium">To Top Lib</button>
              <button onClick={() => { handleAction('MOVE_TO_LIBRARY', { cardId: selectedCard.instanceId, position: 'BOTTOM' }); setSelectedCard(null); }} className="bg-slate-700 text-slate-300 p-2 rounded-lg text-sm font-medium">To Bot Lib</button>
            </div>
          </div>
        </div>
      )}

      {deckInput !== '' && !importing && myHand.length === 0 && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 w-full max-w-md rounded-xl p-6 shadow-2xl border border-slate-600">
            <h3 className="text-xl font-bold mb-4">Import Deck</h3>
            <textarea
              value={deckInput}
              onChange={e => setDeckInput(e.target.value)}
              className="w-full h-40 bg-slate-900 text-slate-300 p-3 rounded border border-slate-700 font-mono text-sm"
              placeholder="4 Lightning Bolt
20 Mountain"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setDeckInput('')} className="flex-1 bg-slate-700 py-2 rounded">Cancel</button>
              <button onClick={importDeck} className="flex-1 bg-green-600 py-2 rounded font-bold text-white">Import Cards</button>
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
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setZoomedCard(null)}>
          <img src={zoomedCard.image_uri} alt={zoomedCard.name} className="max-w-full max-h-[80vh] rounded-xl shadow-2xl" />
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

  useEffect(() => {
    const initAuth = async () => {
      try {
        // UPDATED: Simple anonymous auth
        await signInAnonymously(auth);
      } catch (e) {
        setInitError(e.message);
      }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const createGame = async (playerName) => {
    if (!user) return;
    setIsActionLoading(true);
    setInitError(null);
    try {
      const initialData = {
        createdAt: serverTimestamp(),
        hostId: user.uid,
        players: [{
          id: user.uid,
          name: playerName,
          life: 20,
          turnOrder: 0,
          counters: { poison: 0, energy: 0, commanderTax: 0, experience: 0 },
          handRevealed: false,
          lastSeenChatAt: Date.now()
        }],
        phase: 'main1',
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
        log: []
      };

      const shortCode = generateGameId();
      // UPDATED: Path
      await setDoc(doc(db, 'games_v3', shortCode), { ...initialData, id: shortCode });
      setActiveGameId(shortCode);
    } catch (e) {
      console.error(e);
      setInitError(e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const joinGame = async (playerName, code) => {
    setIsActionLoading(true);
    setInitError(null);
    try {
      // UPDATED: Safe code
      const safeCode = (code || '').trim().toUpperCase();
      // UPDATED: Path
      const gameRef = doc(db, 'games_v3', safeCode);

      // TRANSACTION: Prevents race conditions when joining
      await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) {
          throw new Error("Game not found! Check the code.");
        }
        const gameData = gameDoc.data();
        const players = gameData.players || [];
        const existingPlayerIndex = players.findIndex(p => p.id === user.uid);

        if (existingPlayerIndex >= 0) {
          // RECONNECT: Update name and timestamp, don't add new player
          const newPlayers = [...players];
          newPlayers[existingPlayerIndex] = { ...newPlayers[existingPlayerIndex], name: playerName, lastSeenChatAt: Date.now() };
          transaction.update(gameRef, { players: newPlayers });
        } else if (players.length < 2) {
          // JOIN: Add as Player 2
          const newPlayer = {
            id: user.uid,
            name: playerName,
            life: 20,
            turnOrder: players.length, // 0 or 1
            counters: { poison: 0, energy: 0, commanderTax: 0, experience: 0 },
            handRevealed: false,
            lastSeenChatAt: Date.now()
          };
          transaction.update(gameRef, { players: [...players, newPlayer] });
        } else {
          throw new Error("Game is full.");
        }
      });

      // If transaction succeeds, enter game
      // UPDATED: Safe code
      setActiveGameId(safeCode);
    } catch (e) {
      console.error(e);
      setInitError(e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  if (activeGameId && user) return <GameBoard gameId={activeGameId} realUserId={user.uid} onExit={() => setActiveGameId(null)} />;

  return <Lobby onCreate={createGame} onJoin={joinGame} isError={!!initError} errorMsg={initError} currentUserId={user?.uid} isActionLoading={isActionLoading} />;
}