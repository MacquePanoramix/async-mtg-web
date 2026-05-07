import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, linkWithPopup, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, updateDoc, arrayUnion, serverTimestamp, runTransaction, query, orderBy, deleteDoc, getDoc, addDoc, limit } from 'firebase/firestore';
import { X, ArrowRight, Clock, Shield, Skull, Layers, Eye, ChevronDown, ChevronUp, BookOpen, Shuffle, Plus, Copy, UserCheck, EyeOff, RotateCw, Search, Hexagon, Unlock, Lock, Move, Dices, Coins, LayoutGrid, LogOut, Users, User, Bug, Loader2, RefreshCw, AlertTriangle, Repeat, Check, ArrowUp, ArrowDown, MessageSquare, Trash2 } from 'lucide-react';

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
    } catch (_err) {
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

const isLandCard = (card) => (card?.type_line || '').toLowerCase().includes('land');

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

const getEmptyCombatState = () => ({ attackers: {}, blockers: {} });

const isCombatPhase = (phase) => typeof phase === 'string' && phase.startsWith('combat_');
const shouldClearCombatState = (fromPhase, toPhase) => fromPhase?.startsWith('combat_') && !toPhase?.startsWith('combat_');
const resetTemporaryDamage = (cards = []) => cards.map((card) => (card.tempDamage ? { ...card, tempDamage: 0 } : card));
const clearCombatAssignmentsForCard = (combatState = getEmptyCombatState(), instanceId) => {
  if (!instanceId) return combatState;

  const nextAttackers = { ...(combatState.attackers || {}) };
  const nextBlockers = {};

  delete nextAttackers[instanceId];

  Object.entries(combatState.blockers || {}).forEach(([blockerId, attackerIds]) => {
    if (blockerId === instanceId) return;
    const filteredAttackers = (attackerIds || []).filter((attackerId) => attackerId !== instanceId);
    if (filteredAttackers.length > 0) {
      nextBlockers[blockerId] = filteredAttackers;
    }
  });

  return { attackers: nextAttackers, blockers: nextBlockers };
};

const getNextCombatState = (currentGame, nextPhase, turnChanged = false) => {
  if (!isCombatPhase(nextPhase) || turnChanged || shouldClearCombatState(currentGame.phase, nextPhase)) {
    return getEmptyCombatState();
  }
  return currentGame.combat || getEmptyCombatState();
};

const advancePassPriorityState = (currentGame, logEntry, onTurnStart, layoutOptions = {}) => {
  const players = currentGame.players || [];
  const updatedGame = {
    ...currentGame,
    cards: [...(currentGame.cards || [])],
    stack: [...(currentGame.stack || [])],
    log: [...(currentGame.log || [])]
  };

  if (players.length < 2) {
    const currentPhaseIdx = PHASES.findIndex(p => p.id === currentGame.phase);
    const nextPhaseIdx = (currentPhaseIdx + 1) % PHASES.length;
    const nextPhase = PHASES[nextPhaseIdx];

    let nextTurnNum = currentGame.turnNumber;
    if (nextPhase.id === 'untap') nextTurnNum++;

    updatedGame.combat = getNextCombatState(currentGame, nextPhase.id, nextPhase.id === 'untap');

    updatedGame.phase = nextPhase.id;
    updatedGame.turnNumber = nextTurnNum;
    updatedGame.log.push({ ...logEntry, type: 'PHASE_ADVANCE', desc: `${logEntry.actorId ? 'AutoPass (proxy): ' : ''}Phase: ${nextPhase.label}` });

    if (nextPhase.id === 'untap') {
      if (onTurnStart) onTurnStart(buildTurnStartEvent(updatedGame));
      updatedGame.cards = resetTemporaryDamage(updatedGame.cards).map(c => {
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
        const typeLine = card.type_line || '';
        const isPerm = !typeLine.includes('Instant') && !typeLine.includes('Sorcery');
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
      updatedGame.log.push({ ...logEntry, type: 'PASS_PRIORITY', desc: `${logEntry.actorId ? 'AutoPass (proxy): ' : ''}Resolved: ${item.name}` });
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
    updatedGame.log.push({ ...logEntry, type: 'PHASE_ADVANCE', desc: `${logEntry.actorId ? 'AutoPass (proxy): ' : ''}Phase: ${nextPhase.label}` });

    if (nextPhase.id === 'untap') {
      if (onTurnStart) onTurnStart(buildTurnStartEvent(updatedGame));
      updatedGame.cards = resetTemporaryDamage(updatedGame.cards).map(c => {
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
  updatedGame.log.push({ ...logEntry, type: 'PASS_PRIORITY', desc: logEntry.actorId ? 'AutoPass (proxy): PASS_PRIORITY' : (logEntry.desc || 'PASS_PRIORITY') });
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

    const proxyLogEntry = {
      timestamp: Date.now() + advances + 1,
      playerId: autoPassPlayerId,
      actorId,
      playerName: autoPassPlayer.name || 'Unknown',
      actorName: actorName || 'Proxy',
      type: 'PASS_PRIORITY',
      desc: 'AutoPass (proxy)'
    };

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
  onRemoveFromList,
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
  const [code, setCode] = useState('');
  const [mode, setMode] = useState('menu');
  const [pendingDeleteGame, setPendingDeleteGame] = useState(null);
  const isInitLoading = !currentUser;
  const isGoogleConnected = currentUser?.isAnonymous === false;
  const effectiveName = name || suggestedName || '';

  const openGameFromHistory = (game) => {
    const params = new URLSearchParams({ room: game.roomCode });
    if (game.role === 'spectator') params.set('mode', 'viewer');
    window.open(`/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };
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
              type="text"
              value={effectiveName}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
              placeholder="Planeswalker Name"
            />
          </div>

          {mode === 'menu' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => onCreate(effectiveName, gameTitle)}
                  disabled={!effectiveName.trim() || isInitLoading || isActionLoading}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-wait text-white p-3 rounded-lg font-bold transition-colors flex justify-center items-center gap-2"
                >
                  {isActionLoading ? <Loader2 className="animate-spin" size={18}/> : 'Create Game'}
                </button>
                <button
                  onClick={() => setMode('join')}
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
                  onChange={(e) => setGameTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="e.g. 'Mono-Red vs Elves'"
                  maxLength={80}
                />
              </div>
              <button
                onClick={() => setMode('watch')}
                disabled={!effectiveName.trim() || isInitLoading || isActionLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait text-white p-3 rounded-lg font-bold transition-colors flex justify-center items-center gap-2"
              >
                {isInitLoading ? <Loader2 className="animate-spin" size={18}/> : 'Watch Game'}
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

          <div className="border border-slate-700 rounded-lg p-3 space-y-2">
            <div className="text-sm font-semibold text-slate-300">My Games</div>
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
            <div className="text-base font-semibold text-white">Remove this game from your list?</div>
            <div className="text-sm text-slate-300">
              This only removes it from YOUR list. The game still exists for the other player.
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
                  await onRemoveFromList(pendingDeleteGame);
                  setPendingDeleteGame(null);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white p-2 rounded"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Card = ({ card, zone, onMove, onZoom, onPeek, style = {}, onMouseDown, isDraggable, targets = [], stack = [], isSelected = false, combatBadgeLabel = null, combatBadges = null, displayName = null }) => {
  const isTapped = card.tapped;
  const isFaceDown = card.faceDown;
  const counters = card.counters || {};
  const tempDamage = Math.max(0, card.tempDamage || 0);

  // Calculate Target/Source status from BOTH persistent targets AND stack items
  const persistentSource = targets.some(t => t.sourceId === card.instanceId);
  const persistentTarget = targets.some(t => t.targetId === card.instanceId);
  const stackSource = stack.some(s => s.sourceId === card.instanceId);
  const stackTarget = stack.some(s => s.targetIds && s.targetIds.includes(card.instanceId));

  const isSource = persistentSource || stackSource;
  const isTarget = persistentTarget || stackTarget;

  // Count how many times this card is targeted
  const targetCount = targets.filter(t => t.targetId === card.instanceId).length + stack.filter(s => s.targetIds && s.targetIds.includes(card.instanceId)).length;
  const normalizedCombatBadges = Array.isArray(combatBadges)
    ? combatBadges.filter((badge) => badge && typeof badge.label === 'string' && badge.label.length > 0)
    : (typeof combatBadgeLabel === 'string' && combatBadgeLabel.length > 0 ? [{ label: combatBadgeLabel, tone: 'neutral' }] : []);
  const hasCombatBadge = normalizedCombatBadges.length > 0;

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

        {tempDamage > 0 && (
          <div className="absolute top-1 right-1 z-20 pointer-events-none bg-red-800/90 text-red-100 text-[9px] px-1.5 py-0.5 rounded border border-red-300/60 shadow-sm whitespace-nowrap font-bold">
            DMG: {tempDamage}
          </div>
        )}

        {hasCombatBadge && (
          <div className="absolute inset-x-1 bottom-1 z-20 pointer-events-none flex flex-col items-start gap-0.5">
            {normalizedCombatBadges.map((badge, index) => {
              const toneClass = badge.tone === 'attack'
                ? 'bg-red-950/95 text-red-50 border-red-300/70'
                : badge.tone === 'block'
                  ? 'bg-blue-950/95 text-blue-50 border-blue-300/70'
                  : 'bg-slate-950/90 text-slate-100 border-slate-300/60';
              return (
                <div key={`${badge.label}-${index}`} className={`max-w-full truncate text-[9px] leading-tight px-1.5 py-0.5 rounded border shadow-md whitespace-nowrap font-extrabold ${toneClass}`}>
                  {badge.label}
                </div>
              );
            })}
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
      {zone === ZONES.BATTLEFIELD && displayName && (
        <div className="absolute -bottom-5 left-0 right-0 text-center pointer-events-none">
          <span className="bg-black/75 text-[9px] text-slate-100 px-1.5 py-0.5 rounded border border-slate-500/40 truncate inline-block max-w-full">
            {displayName}
          </span>
        </div>
      )}
    </div>
  );
};
const GameBoard = ({ gameId, realUserId, displayName, onExit }) => {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deckInput, setDeckInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [deletingDeck, setDeletingDeck] = useState(false);
  const [deleteDeckConfirmOpen, setDeleteDeckConfirmOpen] = useState(false);
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
  const [diceMenuPos, setDiceMenuPos] = useState(null);
  const [libraryMenuPos, setLibraryMenuPos] = useState(null);
  const [notification, setNotification] = useState(null);
  const [boardUnlocked, setBoardUnlocked] = useState(false);
  const [viewAsId, setViewAsId] = useState(null);
  const [spectatorLastSeenChatAt, setSpectatorLastSeenChatAt] = useState(0);
  const myBattlefieldRef = useRef(null);
  const opponentBattlefieldRef = useRef(null);
  const diceButtonRef = useRef(null);
  const libraryButtonRef = useRef(null);
  const battlefieldScrollRef = useRef(null);
  const opponentSectionRef = useRef(null);
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
  const [opponentSectionHighlighted, setOpponentSectionHighlighted] = useState(false);
  const [attackTargetPickerCard, setAttackTargetPickerCard] = useState(null);
  const [blockPickerCard, setBlockPickerCard] = useState(null);

  const [reorderModal, setReorderModal] = useState(null); // { ownerId, n, orderedIds }
  const [customCounterModal, setCustomCounterModal] = useState(null); // { cardId, label, amount }
  const [damageModal, setDamageModal] = useState(null); // { cardId, amount }
  const [tokenModal, setTokenModal] = useState(null); // { name, power, toughness }
  const [revealsOpen, setRevealsOpen] = useState(false);

  // Chat State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapEvents, setRecapEvents] = useState([]);
  const chatEndRef = useRef(null);

  // Use the viewAsId to determine which player is "Active" on this screen
  const userId = realUserId;
  const isPlayer = (game?.players || []).some(p => p.id === userId);
  const isSpectator = !isPlayer && (game?.spectatorIds || []).includes(userId);

  useEffect(() => {
    if (!game || !isSpectator) return;
    const players = game.players || [];
    if (players.length === 0) return;
    if (!viewAsId || !players.some(p => p.id === viewAsId)) {
      setViewAsId(players[0].id);
    }
  }, [game, isSpectator, viewAsId]);

  useEffect(() => {
    if (isSpectator && boardUnlocked) {
      setBoardUnlocked(false);
    }
  }, [isSpectator, boardUnlocked]);

  const viewAsPlayerId = isSpectator ? viewAsId : userId;
  const viewAsPlayer = (game?.players || []).find(p => p.id === viewAsPlayerId);
  const canAct = !isSpectator;

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
    if (!diceMenuOpen) {
      setDiceMenuPos(null);
      return;
    }

    const updatePosition = () => {
      if (!diceButtonRef.current) return;
      const rect = diceButtonRef.current.getBoundingClientRect();
      setDiceMenuPos({ top: rect.top, right: rect.right });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [diceMenuOpen]);

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
    if (!gameId) return;
    // UPDATED: Path
    const unsub = onSnapshot(
      doc(db, 'games_v3', gameId),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setGame({ ...data, combat: data.combat || getEmptyCombatState() });

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


  useEffect(() => {
    if (!gameId) return;
    const eventsQuery = query(
      collection(db, 'games_v3', gameId, 'events'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(eventsQuery, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRecapEvents(items);
    }, (err) => console.error(err));

    return () => unsub();
  }, [gameId]);

  // Chat Helpers
  const chatMessages = (game?.log || []).filter(e => e.type === 'CHAT');
  // FIX: Safety check for players array
  const myPlayer = viewAsPlayer;
  const lastSeen = isSpectator ? spectatorLastSeenChatAt : (myPlayer?.lastSeenChatAt || 0);
  const unreadCount = chatMessages.filter(m => m.timestamp > lastSeen && m.playerId !== userId).length;
  const recapByTurn = recapEvents.reduce((acc, event) => {
    const key = event.turnNumber || '?';
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {});
  const recapTurnKeys = Object.keys(recapByTurn).sort((a, b) => Number(b) - Number(a));

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
    if (isSpectator || !boardUnlocked || targetingState || !myBattlefieldRef.current) return;
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

  const opponent = game?.players.find(p => p.id !== viewAsPlayerId);
  const isOppTurn = !!opponent && game?.turnPlayerId === opponent.id;
  const handRevealed = myPlayer?.handRevealed || false;

  const isAttackersStep = game?.phase === 'combat_attackers';
  const isBlockersStep = game?.phase === 'combat_blockers';
  const opponentPlaneswalkers = (game?.cards || []).filter(c => c.controllerId !== viewAsPlayerId && c.zone === ZONES.BATTLEFIELD && (c.type_line || '').toLowerCase().includes('planeswalker'));
  const attackTargetOptions = [
    opponent ? { type: 'player', targetId: opponent.id, label: `${opponent.name} (Player)` } : null,
    ...opponentPlaneswalkers.map(c => ({ type: 'planeswalker', targetId: c.instanceId, label: c.name }))
  ].filter(Boolean);

  const waitingForPlayers = game?.players.length < 2;
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

  const handleAction = async (actionType, payload = {}) => {
    if (!game) return;
    if (isSpectator && actionType !== 'SEND_CHAT') {
      setNotification("Spectators can't take game actions.");
      setTimeout(() => setNotification(null), 2000);
      return;
    }
    // UPDATED: Path
    const gameRef = doc(db, 'games_v3', gameId);

    // FIX: Safety check for name
    const logEntry = {
      timestamp: Date.now(),
      playerId: userId,
      playerName: isSpectator ? (displayName || 'Viewer') : (myPlayer?.name || 'Unknown'),
      type: actionType,
      desc: payload.desc || actionType
    };

    let updates = { log: arrayUnion(logEntry) };
    const pendingRecapEvents = [];

    if (actionType === 'PASS' || actionType === 'PASS_PRIORITY') {
      const turnStartEvents = [];
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(gameRef);
        if (!snap.exists()) return;
        const currentGame = snap.data();

        const currentPlayers = currentGame.players || [];
        const isCurrentPlayer = currentPlayers.some(p => p.id === userId);
        if (!isCurrentPlayer) return;

        const actorName = currentPlayers.find(p => p.id === userId)?.name || myPlayer?.name || 'Unknown';
        const passLogEntry = {
          timestamp: Date.now(),
          playerId: userId,
          playerName: actorName,
          type: 'PASS_PRIORITY',
          desc: payload.desc || 'PASS_PRIORITY'
        };

        const layoutOptions = {
          getBattlefieldWidthForController: (controllerId) => controllerId === userId ? getCurrentBattlefieldWidthPx() : undefined
        };
        const passedGame = advancePassPriorityState(currentGame, passLogEntry, (event) => turnStartEvents.push(event), layoutOptions);
        const { game: proxyGame } = runProxyAutoPassAdvances(passedGame, userId, actorName, (event) => turnStartEvents.push(event));

        transaction.update(gameRef, {
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
        });
      });
      if (turnStartEvents.length > 0) {
        await Promise.all(turnStartEvents.map((event) => appendEvent(gameId, event)));
      }
      return;
    }

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
      const tokenBase = {
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
        tempDamage: 0,
        isToken: true
      };
      const spawnPosition = getBattlefieldGridPosition({
        card: tokenBase,
        existingBattlefieldCards: game.cards,
        controllerId: userId,
        containerWidth: getCurrentBattlefieldWidthPx(),
        isMobile: battlefieldViewport.width <= 900
      });
      const newToken = {
        ...tokenBase,
        ...getBattlefieldPositionCoordinates(spawnPosition)
      };
      logBattlefieldEntry(newToken, 'CREATE_TOKEN', spawnPosition);
      updates.cards = [...game.cards, newToken];
      updates.log = arrayUnion({...logEntry, desc: `Created ${newToken.power}/${newToken.toughness} ${newToken.name} Token`});

    } else if (actionType === 'CLONE_CARD') {
      const original = game.cards.find(c => c.instanceId === payload.cardId);
      if (original) {
        const cloneBase = { ...original, instanceId: generateCardId(), zone: ZONES.BATTLEFIELD };
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
      updates.log = arrayUnion({...logEntry, desc: `Changed control of ${payload.cardName}`});

    } else if (actionType === 'SET_ATTACK_TARGET') {
      if (game.phase !== 'combat_attackers') return;
      const attackTarget = payload.attackTarget || { type: 'player', targetId: opponent?.id || null };
      const nextAttackers = { ...(game.combat?.attackers || {}) };
      nextAttackers[payload.cardId] = attackTarget;
      updates.combat = {
        attackers: nextAttackers,
        blockers: game.combat?.blockers || {}
      };
      updates.log = arrayUnion({ ...logEntry, desc: `${myPlayer?.name || 'Player'} set ${payload.cardName || 'a creature'} attack target` });

    } else if (actionType === 'TOGGLE_BLOCK_TARGET') {
      if (game.phase !== 'combat_blockers') return;
      const nextBlockers = { ...(game.combat?.blockers || {}) };
      const existing = nextBlockers[payload.cardId] || [];
      const isBlocking = existing.includes(payload.attackerId);
      const nextBlocking = isBlocking ? existing.filter(id => id !== payload.attackerId) : [...existing, payload.attackerId];
      if (nextBlocking.length === 0) delete nextBlockers[payload.cardId];
      else nextBlockers[payload.cardId] = nextBlocking;
      updates.combat = {
        attackers: game.combat?.attackers || {},
        blockers: nextBlockers
      };
      updates.log = arrayUnion({ ...logEntry, desc: `${myPlayer?.name || 'Player'} updated blocks` });

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

        const nextCombatState = getNextCombatState(game, nextPhase.id, nextPhase.id === 'untap');
        updates = { ...updates, phase: nextPhase.id, turnNumber: nextTurnNum, combat: nextCombatState, log: arrayUnion({ ...logEntry, desc: `Phase: ${nextPhase.label}` }) };

        // Untap logic
        if (nextPhase.id === 'untap') {
          const newCards = resetTemporaryDamage(game.cards).map(c => {
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
              log: arrayUnion({ ...logEntry, desc: `Phase: ${nextPhase.label}` })
            };

            if (nextPhase.id === 'untap') {
              const newCards = resetTemporaryDamage(game.cards).map(c => {
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
      pendingRecapEvents.push({
        type: 'PLAY_LAND',
        turnNumber: game.turnNumber,
        phase: game.phase,
        actorId: userId,
        actorName: myPlayer?.name || 'Unknown',
        cardId: playedCard?.instanceId || payload.cardId,
        cardName: playedCard?.name || payload.cardName || 'Unknown card',
        text: `${myPlayer?.name || 'Unknown'} played land: ${playedCard?.name || payload.cardName || 'Unknown card'}`
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
        cardName: card?.name || payload.cardName || 'Unknown card',
        text: `${myPlayer?.name || 'Unknown'} cast ${card?.name || payload.cardName || 'Unknown card'}`
      });
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
      pendingRecapEvents.push({
        type: 'ACTIVATE',
        turnNumber: game.turnNumber,
        phase: game.phase,
        actorId: userId,
        actorName: myPlayer?.name || 'Unknown',
        cardId: sourceCard?.instanceId || payload.sourceId,
        cardName: sourceCard?.name || null,
        text: sourceCard?.name
          ? `${myPlayer?.name || 'Unknown'} activated ${sourceCard.name}`
          : `${myPlayer?.name || 'Unknown'} activated an ability`
      });
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

    } else if (actionType === 'TEMP_DAMAGE') {
      const card = game.cards.find(c => c.instanceId === payload.cardId);
      if (!card) return;
      const current = Math.max(0, card.tempDamage || 0);
      const nextDamage = payload.clear ? 0 : Math.max(0, current + (payload.amount || 0));
      updates.cards = game.cards.map(c => c.instanceId === payload.cardId ? { ...c, tempDamage: nextDamage } : c);
      updates.log = arrayUnion({ ...logEntry, desc: `${card.name}: temporary damage ${nextDamage}` });

    } else if (actionType === 'DRAW_CARD') {
      const libCards = game.cards.filter(c => c.ownerId === userId && c.zone === ZONES.LIBRARY);
      if (libCards.length > 0) {
        const cardToDraw = libCards[0];
        const newCards = game.cards.map(c => c.instanceId === cardToDraw.instanceId ? { ...c, zone: ZONES.HAND } : c);
        updates.cards = newCards;
      }

    } else if (actionType === 'MOVE_ZONE') {
      const movingCard = game.cards.find(c => c.instanceId === payload.cardId);
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
      const newCards = game.cards.map(c =>
        c.instanceId === payload.cardId
          ? {
              ...c,
              zone: payload.targetZone,
              tapped: false,
              tempDamage: 0,
              controllerId: c.ownerId,
              ...(spawnPosition ? getBattlefieldPositionCoordinates(spawnPosition) : { x: 10, y: 10, positionMode: BATTLEFIELD_POSITION_MODE_AUTO })
            }
          : c
      );
      if (spawnPosition) logBattlefieldEntry(battlefieldMovingCard, 'MOVE_ZONE', spawnPosition);
      updates.cards = newCards;
      updates.combat = clearCombatAssignmentsForCard(game.combat || getEmptyCombatState(), payload.cardId);

    } else if (actionType === 'MOVE_TO_LIBRARY') {
      const cardToMove = game.cards.find(c => c.instanceId === payload.cardId);
      const otherCards = game.cards.filter(c => c.instanceId !== payload.cardId);
      const updatedCard = { ...cardToMove, zone: ZONES.LIBRARY, tapped: false, tempDamage: 0, faceDown: false, counters: {}, x: 5, y: 5 };

      if (payload.position === 'TOP') {
        updates.cards = [updatedCard, ...otherCards];
      } else {
        updates.cards = [...otherCards, updatedCard];
      }
      updates.combat = clearCombatAssignmentsForCard(game.combat || getEmptyCombatState(), payload.cardId);
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
      const targetPlayer = game.players.find(p => p.id === payload.targetPlayerId);
      const oldLife = targetPlayer?.life ?? 0;
      const newLife = oldLife + payload.amount;
      const newPlayers = game.players.map(p =>
        p.id === payload.targetPlayerId ? { ...p, life: newLife } : p
      );
      updates.players = newPlayers;
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
    if (pendingRecapEvents.length > 0) {
      await Promise.all(pendingRecapEvents.map((event) => appendEvent(gameId, event)));
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

      transaction.update(gameRef, {
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
      });
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

  const importDeck = async () => {
    if (isSpectator) {
      setNotification("Spectators can't import decks.");
      setTimeout(() => setNotification(null), 2000);
      return;
    }
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
              tempDamage: 0,
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
        playerName: myPlayer?.name || displayName || 'Unknown',
        type: 'IMPORT',
        desc: `Imported ${lines.length} cards`
      })
    });

    setImporting(false);
    setDeckInput('');
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

      const playerDeckCards = (game.cards || []).filter(card => card.ownerId === userId && deckZonesToClear.has(card.zone));
      const deckCardIds = new Set(playerDeckCards.map(card => card.instanceId));
      const nextCards = (game.cards || []).filter(card => !deckCardIds.has(card.instanceId));
      const nextReveals = (game.reveals || []).filter(entry => entry.revealerId !== userId && !deckCardIds.has(entry.cardId));

      await updateDoc(doc(db, 'games_v3', gameId), {
        cards: nextCards,
        reveals: nextReveals,
        log: arrayUnion({
          timestamp: Date.now(),
          playerId: userId,
          playerName: myPlayer?.name || displayName || 'Unknown',
          type: 'DECK_DELETE',
          desc: 'Deleted their deck.'
        })
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
    setTokenModal({ name: "Token", power: "1", toughness: "1" });
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

  const gameCards = game?.cards || [];
  // FIX: Add defaults (|| []) to prevent crashes on initial sync
  const myHand = gameCards.filter(c => c.controllerId === viewAsPlayerId && c.zone === ZONES.HAND);
  const myBattlefield = gameCards.filter(c => c.controllerId === viewAsPlayerId && c.zone === ZONES.BATTLEFIELD);
  const oppBattlefield = gameCards.filter(c => c.controllerId !== viewAsPlayerId && c.zone === ZONES.BATTLEFIELD);
  const oppHand = gameCards.filter(c => c.controllerId !== viewAsPlayerId && c.zone === ZONES.HAND);


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
    updateDoc(doc(db, 'games_v3', gameId), { cards: nextCards });
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
    updateDoc(doc(db, 'games_v3', gameId), { cards: nextCards });
  }, [gameId, game?.cards, myBattlefield, myBattlefieldLayout, battlefieldViewport.width, battlefieldViewport.height, draggingCard]);

  const buildSectionDisplayNameMap = (cards) => {
    const grouped = new Map();
    cards.forEach((card) => {
      const key = (card.name || '').trim() || 'Unknown';
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

  const myBattlefieldDisplayNames = useMemo(() => buildSectionDisplayNameMap(myBattlefield), [myBattlefield]);
  const oppBattlefieldDisplayNames = useMemo(() => buildSectionDisplayNameMap(oppBattlefield), [oppBattlefield]);
  const allBattlefieldDisplayNames = useMemo(() => new Map([
    ...oppBattlefieldDisplayNames.entries(),
    ...myBattlefieldDisplayNames.entries()
  ]), [oppBattlefieldDisplayNames, myBattlefieldDisplayNames]);

  const getDisplayCardName = (cardOrId) => {
    const card = typeof cardOrId === 'string' ? cardsMap.get(cardOrId) : cardOrId;
    if (!card) return 'Unknown';
    return allBattlefieldDisplayNames.get(card.instanceId) || card.name || 'Unknown';
  };

  if (loading) return <div className="text-white p-10 flex justify-center"><RotateCw className="animate-spin"/></div>;
  if (!game) return <div className="text-white p-10">Game not found</div>;

  const opponentIsRevealing = (game.players || []).find(p => p.id !== viewAsPlayerId)?.handRevealed;

  const getZoneCount = (pid, zone) => (game.cards || []).filter(c => c.ownerId === pid && c.zone === zone).length;
  const myGYCount = getZoneCount(viewAsPlayerId, ZONES.GRAVEYARD);
  const myExileCount = getZoneCount(viewAsPlayerId, ZONES.EXILE);
  const hasDeckLoaded = [
    ZONES.LIBRARY,
    ZONES.HAND,
    ZONES.BATTLEFIELD,
    ZONES.GRAVEYARD,
    ZONES.EXILE
  ].some(zone => getZoneCount(viewAsPlayerId, zone) > 0);
  const noDeckLoaded = !hasDeckLoaded;
  // Opponent Counts
  const oppGYCount = opponent ? getZoneCount(opponent.id, ZONES.GRAVEYARD) : 0;
  const oppExileCount = opponent ? getZoneCount(opponent.id, ZONES.EXILE) : 0;

  const stackCards = game.stack || [];
  const cardsMap = new Map((game.cards || []).map(c => [c.instanceId, c]));
  const combat = game.combat || getEmptyCombatState();
  const combatAttackers = combat.attackers || {};
  const combatBlockers = combat.blockers || {};
  const attackingCards = Object.keys(combatAttackers)
    .map((id) => cardsMap.get(id))
    .filter((c) => c && c.zone === ZONES.BATTLEFIELD);
  const validBlockerCandidates = myBattlefield.filter((c) => (c.type_line || '').toLowerCase().includes('creature'));
  const validBlockTargetAttackers = attackingCards.filter((c) => c.controllerId !== viewAsPlayerId);
  const activeAttackers = validBlockTargetAttackers;
  const combatParticipantIds = new Set([
    ...Object.keys(combatAttackers),
    ...Object.keys(combatBlockers),
    ...Object.values(combatBlockers).flatMap((ids) => Array.isArray(ids) ? ids : [])
  ]);
  const combatDisplayNameMap = buildSectionDisplayNameMap(
    [...combatParticipantIds].map((id) => cardsMap.get(id)).filter(Boolean)
  );
  const getCombatDisplayCardName = (cardOrId) => {
    const card = typeof cardOrId === 'string' ? cardsMap.get(cardOrId) : cardOrId;
    if (!card) return 'Unknown';
    return combatDisplayNameMap.get(card.instanceId) || getDisplayCardName(card);
  };
  const getCombatDisplayCardNameOrNull = (cardOrId) => {
    const card = typeof cardOrId === 'string' ? cardsMap.get(cardOrId) : cardOrId;
    if (!card) return null;
    return getCombatDisplayCardName(card);
  };
  const getAttackTargetLabel = (attackTarget) => {
    if (!attackTarget || typeof attackTarget !== 'object') return null;
    if (attackTarget.type === 'player') {
      const playerName = (game.players || []).find((p) => p.id === attackTarget.targetId)?.name || 'Player';
      return playerName;
    }
    if (attackTarget.type === 'planeswalker') return `PW: ${getCombatDisplayCardName(attackTarget.targetId)}`;
    if (attackTarget.name) return attackTarget.name;
    return null;
  };
  const getCardAttackTargetLabel = (cardId) => {
    if (!Object.prototype.hasOwnProperty.call(combatAttackers, cardId)) return null;
    return getAttackTargetLabel(combatAttackers[cardId]);
  };
  const getBlockingAssignmentsForAttacker = (attackerId) => Object.entries(combatBlockers)
    .filter(([, blockedIds]) => Array.isArray(blockedIds) && blockedIds.includes(attackerId))
    .map(([blockerId]) => blockerId);
  const getCardCombatBadges = (cardId) => {
    const badges = [];
    const attackTargetLabel = getCardAttackTargetLabel(cardId);
    if (attackTargetLabel) {
      badges.push({ label: `ATK → ${attackTargetLabel}`, tone: 'attack' });
      if (getBlockingAssignmentsForAttacker(cardId).length > 0) {
        badges.push({ label: 'Blocked', tone: 'neutral' });
      }
    }

    const blockedIds = Array.isArray(combatBlockers[cardId]) ? combatBlockers[cardId] : [];
    if (blockedIds.length > 0) {
      const blockedNames = blockedIds.map((id) => getCombatDisplayCardNameOrNull(id)).filter(Boolean);
      const blockedLabel = blockedNames.length > 0 ? blockedNames.join(', ') : `${blockedIds.length} attacker${blockedIds.length === 1 ? '' : 's'}`;
      badges.push({ label: `BLK → ${blockedLabel}`, tone: 'block' });
    }

    return badges;
  };
  const getBlockedAttackersForBlocker = (blockerId) => (combatBlockers[blockerId] || [])
    .map((id) => cardsMap.get(id))
    .filter(Boolean);

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

  const isOpponentTargeted = (opponent && targetingState?.selectedIds.includes(getPlayerTargetId(opponent.id))) || (opponent && stackPlayerTargets.has(opponent.id));
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

  return (
    <div
      className="flex flex-col h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans"
      onMouseMove={handleDragMove}
      onTouchMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onTouchEnd={handleDragEnd}
    >
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
          className="flex flex-col items-center justify-center bg-slate-900 px-3 py-1 rounded border border-slate-700 cursor-pointer hover:bg-slate-800"
          onClick={() => copyToClipboard(gameId)}
          title="Click to Copy Game ID"
        >
          <span className="text-[9px] text-slate-500 uppercase tracking-widest hidden sm:block">Room Code</span>
          <span className="text-xs font-mono font-bold text-white tracking-widest">{gameId}</span>
        </div>

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

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-400">STACK</span>
            <span className={`font-mono font-bold ${stackCards.length > 0 ? 'text-yellow-400' : 'text-slate-600'}`}>
              {stackCards.length}
            </span>
          </div>
          <button
            onClick={openChat}
            className="relative z-20 pointer-events-auto p-2 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
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
            onClick={() => setRevealsOpen(true)}
            className="relative z-20 pointer-events-auto flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-slate-700"
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
                  onClick={() => handleAction('PASS_PRIORITY')}
                  className="relative z-20 pointer-events-auto bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg transform active:scale-95 transition-all flex items-center gap-2"
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
                  onClick={() => {
                    console.log('AutoPass tapped');
                    setAutoPassMenuOpen(prev => !prev);
                  }}
                  disabled={autoPassControlsDisabled}
                  className={`relative z-20 pointer-events-auto px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1 ${isAutoPassEnabled ? 'bg-purple-700/60 border-purple-400 text-purple-100' : 'bg-slate-800 border-slate-600 text-slate-300 hover:text-white'} ${autoPassControlsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
            className={`rounded-xl border p-3 mb-3 min-h-[280px] transition-all duration-300 ${opponentSectionHighlighted ? 'border-blue-400 bg-blue-900/20 ring-2 ring-blue-400/60' : 'border-slate-700 bg-slate-800/30'}`}
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
              </div>
              {opponent && (
                <span className="bg-slate-700 px-2 py-0.5 rounded text-xs flex gap-2 h-fit">
                  <span>Life: {opponent?.life}</span>
                  {opponent?.counters?.poison > 0 && <span className="text-green-400">P:{opponent.counters.poison}</span>}
                </span>
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
                      onMove={() => targetingState ? toggleTarget(card) : setZoomedCard(card)}
                      onZoom={setZoomedCard}
                      displayName={getDisplayCardName(card)}
                      combatBadges={getCardCombatBadges(card.instanceId)}
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
                  {[...stackCards].reverse().map((item) => (
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
            ) : <div />}

            <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-3 text-xs space-y-2">
              <div className="font-bold text-slate-200 uppercase tracking-wider">Combat Summary</div>
              <div>
                <div className="text-red-300 font-semibold">Attackers</div>
                {attackingCards.length === 0 ? <div className="text-slate-400">None</div> : attackingCards.map((attacker) => (
                  <div key={attacker.instanceId} className="text-slate-200">{getCombatDisplayCardName(attacker)} → {getCardAttackTargetLabel(attacker.instanceId) || 'Defender'}</div>
                ))}
              </div>
              <div>
                <div className="text-blue-300 font-semibold">Blockers</div>
                {Object.keys(combatBlockers).length === 0 ? <div className="text-slate-400">None</div> : Object.entries(combatBlockers).map(([blockerId, blockedIds]) => (
                  <div key={blockerId} className="text-slate-200">
                    {(getCombatDisplayCardName(blockerId) || 'Blocker')} blocks {(blockedIds || []).map((id) => getCombatDisplayCardName(id) || 'Attacker').join(', ')}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <section className="rounded-xl border border-slate-700 bg-slate-900/30 p-3">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2">
                <User size={16} className="text-green-400"/>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Your Battlefield</div>
                  <div className="font-bold text-slate-100">{myPlayer?.name || 'You'}</div>
                </div>
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
                      isDraggable={boardUnlocked && !targetingState}
                      targets={game.targets || []}
                      stack={stackCards}
                      isSelected={targetingState?.selectedIds.includes(card.instanceId)}
                      style={{ left: `0%`, top: `0%`, zIndex: isDragging ? 50 : 10 }}
                      onMouseDown={(e) => handleDragStart(e, card)}
                      onTouchStart={(e) => handleDragStart(e, card)}
                      onMove={() => targetingState ? toggleTarget(card) : setSelectedCard(card)}
                      onZoom={setZoomedCard}
                      onPeek={(c) => setPeekCard(c)}
                      displayName={getDisplayCardName(card)}
                      combatBadges={getCardCombatBadges(card.instanceId)}
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
          <div className="overflow-x-auto sm:overflow-visible hide-scrollbar snap-x snap-proximity scroll-smooth">
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
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-800" onClick={(e) => {
              if(targetingState) { e.stopPropagation(); toggleTargetPlayer(viewAsPlayerId); }
              else { setPlayerStatsOpen(true); }
            }}>
              <span className="text-red-400 font-bold text-xl">{myPlayer?.life}</span>
              <div className="flex flex-col">
                <button onClick={(e) => { e.stopPropagation(); handleAction('LIFE_CHANGE', { targetPlayerId: viewAsPlayerId, amount: 1 }); }} className="text-slate-500 hover:text-green-400"><ChevronUp size={12}/></button>
                <button onClick={(e) => { e.stopPropagation(); handleAction('LIFE_CHANGE', { targetPlayerId: viewAsPlayerId, amount: -1 }); }} className="text-slate-500 hover:text-red-400"><ChevronDown size={12}/></button>
              </div>
              {myPlayer?.counters?.poison > 0 && (
                <div className="ml-2 bg-green-900 text-green-200 text-xs px-1 rounded flex items-center" title="Poison">
                  <Skull size={10} className="mr-1"/> {myPlayer.counters.poison}
                </div>
              )}
            </div>

            <div className="h-6 w-[1px] bg-slate-700"></div>

            <div className="flex gap-2 text-xs text-slate-400">
              <div className="flex items-center gap-1 cursor-pointer hover:text-white" onClick={() => { setViewZone({ zone: ZONES.GRAVEYARD, ownerId: viewAsPlayerId }); }}>
                <Skull size={14} /> GY: {myGYCount}
              </div>
              <div className="flex items-center gap-1 cursor-pointer hover:text-white" onClick={() => { setViewZone({ zone: ZONES.EXILE, ownerId: viewAsPlayerId }); }}>
                <RotateCw size={14} /> Ex: {myExileCount}
              </div>
            </div>
            </div>

            <div className="flex items-center gap-2 snap-start">
            {/* Dice/Coin Menu */}
            <div className="relative">
              <button
                ref={diceButtonRef}
                onClick={canAct ? () => setDiceMenuOpen(!diceMenuOpen) : undefined}
                className={`p-2 rounded-full ${diceMenuOpen ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'} ${canAct ? '' : 'opacity-40 cursor-not-allowed'}`}
              >
                <Dices size={18} />
              </button>
            </div>

            {myHand.length > 0 && (
              <button
                onClick={canAct ? () => handleAction('REVEAL_ALL_HAND') : undefined}
                className={`p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 ${canAct ? '' : 'opacity-40 cursor-not-allowed'}`}
                title="Reveal All Hand Cards"
              >
                <Eye size={18} />
              </button>
            )}

            <button
              onClick={canAct ? () => handleAction('TOGGLE_HAND_REVEAL') : undefined}
              className={`p-2 rounded-full ${handRevealed ? 'text-purple-400 bg-purple-900/30' : 'text-slate-500 hover:text-slate-300'} ${canAct ? '' : 'opacity-40 cursor-not-allowed'}`}
            >
              {handRevealed ? <Unlock size={18} /> : <Lock size={18} />}
            </button>

            {/* Library Menu */}
            <div className="relative">
              <button
                ref={libraryButtonRef}
                onClick={canAct ? () => setLibraryMenuOpen(!libraryMenuOpen) : undefined}
                className={`p-2 rounded-full hover:bg-slate-700 ${libraryMenuOpen ? 'text-white bg-slate-700' : 'text-slate-400'} ${canAct ? '' : 'opacity-40 cursor-not-allowed'}`}
              >
                <BookOpen size={18} />
              </button>
            </div>
            </div>
          </div>
        </div>
      </div>
        {diceMenuOpen && diceMenuPos && createPortal(
          <div
            className="fixed z-[100] bg-slate-800 border border-slate-600 rounded shadow-xl p-1 flex flex-col gap-1 w-32"
            style={{ top: diceMenuPos.top - 8, left: diceMenuPos.right, transform: 'translate(-100%, -100%)' }}
          >
            <button onClick={() => {handleAction('ROLL_DICE', {diceType: 'coin'}); setDiceMenuOpen(false);}} className="text-left px-3 py-2 hover:bg-slate-700 rounded text-sm flex items-center gap-2"><Coins size={12}/> Flip Coin</button>
            <button onClick={() => {handleAction('ROLL_DICE', {diceType: 'd6'}); setDiceMenuOpen(false);}} className="text-left px-3 py-2 hover:bg-slate-700 rounded text-sm flex items-center gap-2"><Hexagon size={12}/> Roll D6</button>
            <button onClick={() => {handleAction('ROLL_DICE', {diceType: 'd20'}); setDiceMenuOpen(false);}} className="text-left px-3 py-2 hover:bg-slate-700 rounded text-sm flex items-center gap-2"><Dices size={12}/> Roll D20</button>
          </div>,
          document.body
        )}
        {libraryMenuOpen && libraryMenuPos && createPortal(
          <div
            className="fixed z-[100] w-40 bg-slate-800 rounded shadow-xl border border-slate-600 overflow-hidden"
            style={{ top: libraryMenuPos.top - 8, left: libraryMenuPos.right, transform: 'translate(-100%, -100%)' }}
          >
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
          </div>,
          document.body
        )}

        <div className="p-2 overflow-x-auto whitespace-nowrap hide-scrollbar flex gap-2 min-h-[140px] items-center px-4">
          {canAct && noDeckLoaded && (
            <button
              onClick={() => setDeckInput('20 Mountain\n20 Lightning Bolt\n20 Llanowar Elves')}
              className="mx-auto text-sm text-slate-500 border border-slate-600 border-dashed rounded px-4 py-2 hover:text-white hover:border-slate-400"
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
            />
          ))}
          {myHand.length > 0 && (
            <button onClick={canAct ? () => handleAction('DISCARD_RANDOM') : undefined} className={`ml-4 px-2 py-8 border-l border-slate-700 text-slate-600 hover:text-red-400 flex flex-col items-center justify-center text-[10px] ${canAct ? '' : 'opacity-40 cursor-not-allowed'}`}>
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


      {/* RECAP MODAL */}
      {recapOpen && (
        <div className="fixed inset-0 z-[149] pointer-events-none flex justify-end items-end sm:items-start sm:top-16 sm:right-4">
          <div className="pointer-events-auto w-full sm:w-96 h-[80vh] sm:h-[600px] bg-slate-900 border border-slate-700 shadow-2xl flex flex-col rounded-t-xl sm:rounded-xl">
            <div className="flex justify-between items-center p-3 border-b border-slate-700 bg-slate-800 rounded-t-xl">
              <h3 className="font-bold text-white flex items-center gap-2"><BookOpen size={16}/> Action Recap</h3>
              <button onClick={() => setRecapOpen(false)} className="text-slate-400 hover:text-white"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-900/95">
              {recapTurnKeys.length === 0 && (
                <div className="text-sm text-slate-400">No recap events yet.</div>
              )}
              {recapTurnKeys.map((turnKey) => (
                <div key={turnKey} className="bg-slate-800/70 border border-slate-700 rounded-lg">
                  <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-purple-300 border-b border-slate-700">
                    Turn {turnKey}
                  </div>
                  <div className="px-3 py-2 space-y-1">
                    {recapByTurn[turnKey].map((event) => (
                      <div key={event.id} className="text-sm text-slate-200 break-words">
                        • {event.text}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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

      {damageModal && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setDamageModal(null)}>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-600 max-w-xs w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">Temporary Damage</h3>
            <div className="text-sm text-slate-300">{getDisplayCardName(damageModal.cardId)}</div>
            <div className="text-xs text-slate-400">Current: {damageModal.amount}</div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setDamageModal(prev => ({ ...prev, amount: Math.max(0, prev.amount - 1) }))} className="bg-slate-700 hover:bg-slate-600 rounded py-2 text-white">-1</button>
              <button onClick={() => setDamageModal(prev => ({ ...prev, amount: prev.amount + 1 }))} className="bg-slate-700 hover:bg-slate-600 rounded py-2 text-white">+1</button>
              <button onClick={() => setDamageModal(prev => ({ ...prev, amount: 0 }))} className="bg-red-900/40 hover:bg-red-800/40 rounded py-2 text-red-100 border border-red-700">Clear</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDamageModal(null)} className="flex-1 bg-slate-700 py-2 rounded text-white hover:bg-slate-600">Cancel</button>
              <button
                onClick={async () => {
                  const currentCard = game.cards.find(c => c.instanceId === damageModal.cardId);
                  const current = Math.max(0, currentCard?.tempDamage || 0);
                  const delta = damageModal.amount - current;
                  if (delta !== 0 || current !== 0) {
                    await handleAction('TEMP_DAMAGE', { cardId: damageModal.cardId, amount: delta, clear: damageModal.amount === 0 });
                  }
                  setSelectedCard(null);
                  setDamageModal(null);
                }}
                className="flex-1 bg-red-600 py-2 rounded text-white hover:bg-red-500"
              >
                Apply
              </button>
            </div>
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
                    <span className="w-6 text-center font-bold text-white">{myPlayer?.counters?.[type] || 0}</span>
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
              <span className="font-bold text-lg text-white truncate pr-2">{getDisplayCardName(selectedCard)}</span>
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
                  <button onClick={() => { if (!canAct) return; setTargetingState({ source: selectedCard, mode: 'CAST', selectedIds: [] }); setSelectedCard(null); }} className="col-span-2 bg-purple-900/50 hover:bg-purple-800 text-purple-100 p-3 rounded-lg font-medium border border-purple-800 flex items-center justify-center gap-2">Cast + Target 🎯</button>
                  <button onClick={() => { handleAction('MOVE_ZONE', { cardId: selectedCard.instanceId, targetZone: ZONES.BATTLEFIELD }); handleAction('TOGGLE_FACE', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="col-span-2 bg-slate-700 text-slate-300 p-2 rounded-lg text-sm">Play Face Down (Morph)</button>
                </>
              )}

              {selectedCard.zone === ZONES.BATTLEFIELD && (
                <>
                  <button onClick={() => { handleAction('TAP_TOGGLE', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="bg-slate-700 text-white p-3 rounded-lg font-medium">{selectedCard.tapped ? 'Untap' : 'Tap'}</button>
                  <button onClick={() => { handleAction('TOGGLE_FACE', { cardId: selectedCard.instanceId }); setSelectedCard(null); }} className="bg-slate-700 text-white p-3 rounded-lg font-medium">{selectedCard.faceDown ? 'Turn Face Up' : 'Turn Face Down'}</button>
                  {canAct && <button onClick={() => setDamageModal({ cardId: selectedCard.instanceId, amount: Math.max(0, selectedCard.tempDamage || 0) })} className="col-span-2 bg-red-900/40 hover:bg-red-800/50 text-red-100 p-2 rounded-lg text-sm border border-red-700">Damage...</button>}
                  {canAct && isAttackersStep && selectedCard.controllerId === viewAsPlayerId && (selectedCard.type_line || '').toLowerCase().includes('creature') && (
                    <button onClick={() => setAttackTargetPickerCard(selectedCard)} className="col-span-2 bg-red-900/50 hover:bg-red-800 text-red-100 p-2 rounded-lg text-sm border border-red-700">Attack...</button>
                  )}
                  {canAct && isBlockersStep && selectedCard.controllerId === viewAsPlayerId && (selectedCard.type_line || '').toLowerCase().includes('creature') && (
                    <button onClick={() => setBlockPickerCard(selectedCard)} className="col-span-2 bg-blue-900/50 hover:bg-blue-800 text-blue-100 p-2 rounded-lg text-sm border border-blue-700">Block...</button>
                  )}
                  {combatAttackers[selectedCard.instanceId] && (
                    <div className="col-span-2 text-xs px-2 py-1 rounded bg-red-900/30 border border-red-700/40 text-red-100">ATK → {getCardAttackTargetLabel(selectedCard.instanceId) || 'Defender'}</div>
                  )}
                  {(combatBlockers[selectedCard.instanceId] || []).length > 0 && (
                    <div className="col-span-2 text-xs px-2 py-1 rounded bg-blue-900/30 border border-blue-700/40 text-blue-100">Blocking: {getBlockedAttackersForBlocker(selectedCard.instanceId).map(c => getCombatDisplayCardName(c)).join(', ')}</div>
                  )}
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
                  <button onClick={() => { if (!canAct) return; setTargetingState({ source: selectedCard, mode: 'ABILITY', selectedIds: [] }); setSelectedCard(null); }} className="bg-blue-900/50 hover:bg-blue-800 text-blue-100 p-2 rounded-lg text-sm flex items-center justify-center gap-2 border border-blue-800">Ability 🎯</button>
                  <button onClick={() => { if (!canAct) return; setTargetingState({ source: selectedCard, mode: 'MANUAL', selectedIds: [] }); setSelectedCard(null); }} className="bg-slate-700 hover:bg-slate-600 text-slate-300 p-2 rounded-lg text-sm flex items-center justify-center gap-2 border border-slate-600">Target... 🎯</button>
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
                  key={`${option.type}-${option.targetId}`}
                  onClick={async () => {
                    await setAttackTarget(attackTargetPickerCard.instanceId, { type: option.type, targetId: option.targetId });
                    setAttackTargetPickerCard(null);
                    setSelectedCard(null);
                  }}
                  className="w-full text-left px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm text-slate-100"
                >
                  {option.type === 'planeswalker' ? `PW: ${getDisplayCardName(option.targetId)}` : option.label}
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

      {deckInput !== '' && !importing && noDeckLoaded && (
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
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setZoomedCard(null)}>
          <div className="flex flex-col items-center gap-3">
          <div className="text-sm font-semibold text-slate-100">{getDisplayCardName(zoomedCard)}</div>
          <img src={zoomedCard.image_uri} alt={zoomedCard.name} className="max-w-full max-h-[80vh] rounded-xl shadow-2xl" />
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

  const createGame = async (playerNameInput, gameTitleInput) => {
    if (!user) return;
    setIsActionLoading(true);
    setInitError(null);
    const safeName = (playerNameInput || '').trim();
    const safeTitle = (gameTitleInput || '').trim();
    setPlayerName(safeName);
    try {
      const initialData = {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        hostId: user.uid,
        ...(safeTitle ? { title: safeTitle } : {}),
        allowSpectators: true,
        spectatorIds: [],
        players: [{
          id: user.uid,
          name: safeName,
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
        autopass: {},
        combat: getEmptyCombatState(),
        log: []
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
          transaction.update(gameRef, { players: newPlayers, updatedAt: serverTimestamp() });
        } else if (players.length < 2) {
          const newPlayer = {
            id: user.uid,
            name: safeName,
            life: 20,
            turnOrder: players.length,
            counters: { poison: 0, energy: 0, commanderTax: 0, experience: 0 },
            handRevealed: false,
            lastSeenChatAt: Date.now()
          };
          transaction.update(gameRef, { players: [...players, newPlayer], updatedAt: serverTimestamp() });
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

  const removeGameFromList = async (game) => {
    if (!user || !game?.id) return;
    const prevGames = myGames;
    setMyGames((existing) => existing.filter((g) => g.id !== game.id));
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'games', game.id));
      setToastMessage('Removed from your list.');
      setTimeout(() => setToastMessage(''), 2500);
    } catch (e) {
      console.error(e);
      setInitError(e.message);
      setMyGames(prevGames);
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
    return <GameBoard gameId={activeGameId} realUserId={user.uid} displayName={playerName} onExit={handleExitGame} />;
  }

  return (
    <Lobby
      onCreate={createGame}
      onJoin={joinGame}
      onWatch={watchGame}
      onRemoveFromList={removeGameFromList}
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
