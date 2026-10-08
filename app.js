const lobby = document.querySelector('#lobby');
const playArea = document.querySelector('#playArea');
const nicknameInput = document.querySelector('#nickname');
const roomCodeInput = document.querySelector('#roomCode');
const connectionNote = document.querySelector('#connectionNote');
const statusText = document.querySelector('#status');
const roomStatus = document.querySelector('#roomStatus');
const connectionDot = document.querySelector('#connectionDot');
const squares = document.querySelectorAll('.square');
const xNameText = document.querySelector('#xName');
const oNameText = document.querySelector('#oName');
const newGameButton = document.querySelector('#newGame');

const winningLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6]              // diagonals
];

let peer = null;
let connection = null;
let isHost = false;
let myMark = '';
let myName = '';
let hostName = '';
let guestName = '';
let board = Array(9).fill('');let currentPlayer = 'X';
let gameIsOver = false;
let scores = { X: 0, O: 0, draws: 0 };

// If a friend sent a room link, put its room code in the join box for them.
const invitedRoom = new URLSearchParams(window.location.search).get('room');
if (invitedRoom) {
  roomCodeInput.value = invitedRoom;
  connectionNote.textContent = 'Your friend invited you. Add your nickname and join.';
}

function showError(message) {
  connectionNote.textContent = message;
  connectionNote.classList.add('error');
}

function beginGameScreen() {
  lobby.classList.add('hidden');
  playArea.classList.remove('hidden');
  xNameText.textContent = hostName || 'Game master';
  oNameText.textContent = guestName || 'Waiting…';
  drawBoard();
}function updateTurnText() {
  updateScoreboard();
  document.querySelector('#xPlayer').classList.toggle('active-player', !gameIsOver && currentPlayer === 'X');
  document.querySelector('#oPlayer').classList.toggle('active-player', !gameIsOver && currentPlayer === 'O');
  squares.forEach(function (square, index) {
    square.disabled = gameIsOver || Boolean(board[index]) || !connection || !connection.open || currentPlayer !== myMark;
  });

  if (gameIsOver) {
    const winner = board.find(function (mark, index) {
      return mark && winningLines.some(function (line) {
        return line.includes(index) && line.every(function (spot) { return board[spot] === mark; });
      });
    });
    statusText.textContent = winner ? (winner === 'X' ? hostName : guestName) + ' wins!' : "It's a draw!";
    newGameButton.disabled = false;
  } else {
    statusText.textContent = currentPlayer === myMark ? 'Your turn — make a move!' : (currentPlayer === 'X' ? hostName : guestName) + ' is thinking…';
    newGameButton.disabled = true;
  }
}function updateScoreboard() {
  document.querySelector('#xScore').textContent = scores.X;
  document.querySelector('#oScore').textContent = scores.O;
  document.querySelector('#drawScore').textContent = scores.draws;
  document.querySelector('#xScoreName').textContent = hostName || 'Game master';
  document.querySelector('#oScoreName').textContent = guestName || 'Friend';
}

function drawBoard() {
  squares.forEach(function (square, index) {
    square.textContent = board[index];
    square.classList.toggle('o-square', board[index] === 'O');
  });
  updateTurnText();
}

function makeStateMessage() {
  return {
    type: 'state',
    board: board,
    currentPlayer: currentPlayer,
    gameIsOver: gameIsOver,
    hostName: hostName,
    guestName: guestName
  };
}

function sendState() {
  if (connection && connection.open) connection.send(makeStateMessage());
}

function receiveConnection(newConnection) {
  // This small game is for two people, so only accept one guest.
  if (connection && connection.open) {
    newConnection.close();
    return;
  }
  connection = newConnection;
  roomStatus.textContent = 'Friend is joining…';

  connection.on('open', function () {
    connectionDot.classList.add('connected');
    roomStatus.textContent = 'Connected';
    drawBoard();
  });

  connection.on('data', function (message) {
    if (!message || typeof message !== 'object') return;

    if (isHost && message.type === 'hello') {
      guestName = cleanName(message.name, 'Friend');
      oNameText.textContent = guestName;
      sendState();
    } else if (isHost && message.type === 'move') {
      makeMove(message.index, 'O');
    } else if (isHost && message.type === 'play-again' && gameIsOver) {
      resetBoard();
    } else if (!isHost && message.type === 'state') {
      board = message.board;
      currentPlayer = message.currentPlayer;
      gameIsOver = message.gameIsOver;
      hostName = message.hostName;
      guestName = message.guestName;
      xNameText.textContent = hostName;
      oNameText.textContent = guestName;
      drawBoard();
    }
  });

  connection.on('close', function () {
    roomStatus.textContent = 'Friend disconnected';
    connectionDot.classList.remove('connected');
    statusText.textContent = 'Your friend left the game.';
    squares.forEach(function (square) { square.disabled = true; });
  });

  connection.on('error', function () {
    roomStatus.textContent = 'Connection issue';
  });
}

function cleanName(name, fallback) {
  const cleaned = String(name || '').trim().slice(0, 18);
  return cleaned || fallback;
}

function makeInviteLink(peerId) {
  const invite = new URL(window.location.href);
  invite.search = '';
  invite.searchParams.set('room', peerId);
  invite.hash = '';
  return invite.toString();
}

document.querySelector('#createRoom').addEventListener('click', function () {
  myName = cleanName(nicknameInput.value, 'Player X');
  hostName = myName;
  isHost = true;
  myMark = 'X';
  connectionNote.classList.remove('error');
  connectionNote.textContent = 'Making your room…';

  if (typeof Peer === 'undefined') {
    showError('Could not load the online connection tool. Check your internet and reload this page.');
    return;
  }

  peer = new Peer(undefined, { config: { iceServers: [ { urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }, { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }, { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' } ] } });
  peer.on('open', function (id) {
    beginGameScreen();
    roomStatus.textContent = 'Room is ready — invite your friend';
    document.querySelector('#copyInvite').dataset.link = makeInviteLink(id);
    peer.on('connection', receiveConnection);
  });
  peer.on('error', function () {
    showError('Could not make a room. Check your internet and try again.');
  });
});

document.querySelector('#joinRoom').addEventListener('click', function () {
  myName = cleanName(nicknameInput.value, 'Player O');
  const roomId = roomCodeInput.value.trim();
  if (!roomId) {
    showError('Paste the room code or invite link from your friend first.');
    return;
  }
  const roomMatch = roomId.match(/[?&]room=([^&]+)/);
  const peerId = decodeURIComponent(roomMatch ? roomMatch[1] : roomId);
  isHost = false;
  myMark = 'O';
  connectionNote.classList.remove('error');
  connectionNote.textContent = 'Joining your friend…';

  if (typeof Peer === 'undefined') {
    showError('Could not load the online connection tool. Check your internet and reload this page.');
    return;
  }

  peer = new Peer(undefined, { config: { iceServers: [ { urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }, { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }, { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' } ] } });
  peer.on('open', function () {
    connection = peer.connect(peerId, { reliable: true });
    beginGameScreen();
    hostName = 'Game master';
    guestName = myName;
    roomStatus.textContent = 'Connecting to your friend…';
    connection.on('open', function () {
      connection.send({ type: 'hello', name: myName });
      connectionDot.classList.add('connected');
      roomStatus.textContent = 'Connected';
    });
    connection.on('data', function (message) {
      if (!message || message.type !== 'state') return;
      board = message.board;
      currentPlayer = message.currentPlayer;
      gameIsOver = message.gameIsOver;
      hostName = message.hostName;
      guestName = message.guestName;
      xNameText.textContent = hostName;
      oNameText.textContent = guestName;
      drawBoard();
    });
    connection.on('close', function () {
      roomStatus.textContent = 'Friend disconnected';
      connectionDot.classList.remove('connected');
      statusText.textContent = 'Your friend left the game.';
      squares.forEach(function (square) { square.disabled = true; });
    });
    connection.on('error', function () {
      roomStatus.textContent = 'Could not connect';
      statusText.textContent = 'Check the room code and try again.';
    });
  });
  peer.on('error', function () {
    showError('Could not find that room. Ask your friend to create a new one.');
  });
});

function makeMove(index, mark) {
  if (gameIsOver || currentPlayer !== mark || board[index]) return;
  board[index] = mark;
  const won = winningLines.some(function (line) {
    return line.every(function (spot) { return board[spot] === mark; });
  });
  gameIsOver = won || board.every(function (square) { return square !== ''; });
  currentPlayer = mark === 'X' ? 'O' : 'X';
  drawBoard();
  sendState();
}

function resetBoard() {
  board = Array(9).fill('');
  currentPlayer = 'X';
  gameIsOver = false;
  drawBoard();
  sendState();
}

squares.forEach(function (square, index) {
  square.addEventListener('click', function () {
    if (isHost) makeMove(index, 'X');
    else if (connection && connection.open && currentPlayer === 'O' && !gameIsOver && !board[index]) {
      connection.send({ type: 'move', index: index });
    }
  });
});

newGameButton.addEventListener('click', function () {
  if (!gameIsOver) return;
  if (isHost) resetBoard();
  else if (connection && connection.open) connection.send({ type: 'play-again' });
});

document.querySelector('#copyInvite').addEventListener('click', async function (event) {
  const button = event.currentTarget;
  const inviteLink = button.dataset.link;
  if (!inviteLink) return;
  try {
    await navigator.clipboard.writeText(inviteLink);
    button.textContent = 'Copied!';
    setTimeout(function () { button.textContent = 'Copy invite link'; }, 1800);
  } catch {
    window.prompt('Copy this invite link and send it to your friend:', inviteLink);
  }
});

document.querySelector('#leaveGame').addEventListener('click', function () {
  if (peer) peer.destroy();
  window.location.assign(window.location.pathname);
});


// The home screen can grow into a collection of games. Tic-Tac-Toe is the first one.
const gameHub = document.querySelector('#gameHub');
const gameScreen = document.querySelector('#gameScreen');
const nicknameDialog = document.querySelector('#nicknameDialog');
const inviteNicknameInput = document.querySelector('#inviteNickname');

document.querySelector('#playTicTacToe').addEventListener('click', function () {
  gameHub.classList.add('hidden');
  gameScreen.classList.remove('hidden');
});

document.querySelector('#backToGames').addEventListener('click', function () {
  if (peer) peer.destroy();
  window.location.assign(window.location.pathname);
});

document.querySelector('#confirmJoin').addEventListener('click', function () {
  const chosenName = inviteNicknameInput.value.trim();
  if (!chosenName) {
    inviteNicknameInput.focus();
    return;
  }
  nicknameInput.value = chosenName;
  nicknameDialog.close();
  document.querySelector('#joinRoom').click();
});

document.querySelector('#cancelInvite').addEventListener('click', function () {
  nicknameDialog.close();
  window.location.assign(window.location.pathname);
});

if (invitedRoom) {
  gameHub.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  nicknameDialog.showModal();
  inviteNicknameInput.focus();
}


// Keep room scores on the host and share them with the guest.
const originalMakeStateMessage = makeStateMessage;
makeStateMessage = function () {
  const message = originalMakeStateMessage();
  message.scores = scores;
  return message;
};

const originalMakeMove = makeMove;
makeMove = function (index, mark) {
  const wasOver = gameIsOver;
  originalMakeMove(index, mark);
  if (!wasOver && gameIsOver) {
    const line = winningLines.find(function (spots) {
      return board[spots[0]] && spots.every(function (spot) { return board[spot] === board[spots[0]]; });
    });
    if (line) scores[board[line[0]]] += 1;
    else scores.draws += 1;
    updateScoreboard();
    sendState();
  }
};

function receiveRoomScores(message) {
  if (!message || message.type !== 'state' || !message.scores) return;
  scores = message.scores;
  hostName = message.hostName || hostName;
  guestName = message.guestName || guestName;
  updateScoreboard();
}

const originalReceiveConnection = receiveConnection;
receiveConnection = function (newConnection) {
  originalReceiveConnection(newConnection);
  newConnection.on('data', receiveRoomScores);
};

const originalPeerConnect = Peer.prototype.connect;
Peer.prototype.connect = function () {
  const newConnection = originalPeerConnect.apply(this, arguments);
  newConnection.on('data', receiveRoomScores);
  return newConnection;
};
