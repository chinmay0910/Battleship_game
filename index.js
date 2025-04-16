const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

let rooms = {}; // Store game rooms, players, names, and ships

app.use(cors());
app.get("/", (req, res) => res.send("Battleships Server Running!"));

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("createRoom", ({ roomCode, playerName }) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                players: [],
                names: {},
                readyStatus: {},
                ships: {},
                turn: null
            };
        }
        rooms[roomCode].players.push(socket.id);
        rooms[roomCode].names[socket.id] = playerName; // Store name
        rooms[roomCode].readyStatus[socket.id] = false;
        socket.join(roomCode);
        io.to(roomCode).emit("roomUpdated", rooms[roomCode]);
    });

    socket.on("joinRoom", ({ roomCode, playerName }) => {
        if (rooms[roomCode] && rooms[roomCode].players.length < 2) {
            rooms[roomCode].players.push(socket.id);
            rooms[roomCode].names[socket.id] = playerName; // Store name
            rooms[roomCode].readyStatus[socket.id] = false;
            socket.join(roomCode);
            io.to(roomCode).emit("roomUpdated", rooms[roomCode]);
        } else {
            socket.emit("error", "Room full or doesn't exist");
        }
    });

    socket.on("placeShips", ({ roomCode, ships }) => {
        if (rooms[roomCode]) {
            rooms[roomCode].ships[socket.id] = ships;
            io.to(roomCode).emit("shipsPlaced", { playerId: socket.id });
        }
    });

    socket.on("markReady", ({ roomCode }) => {
        if (rooms[roomCode]) {
            rooms[roomCode].readyStatus[socket.id] = true;
            io.to(roomCode).emit("playerReady", { playerId: rooms[roomCode].names[socket.id] });

            const players = rooms[roomCode].players;
            if (players.length === 2 && rooms[roomCode].readyStatus[players[0]] && rooms[roomCode].readyStatus[players[1]]) {
                rooms[roomCode].turn = players[0];
                io.to(roomCode).emit("gameStart", { firstTurn: players[0], firstPlayerName: rooms[roomCode].names[players[0]] });
            }
            
        }
    });

    socket.on("attack", ({ roomCode, cell }) => {
        if (rooms[roomCode] && rooms[roomCode].turn === socket.id) {
            const players = rooms[roomCode].players;
            const opponentId = players.find(p => p !== socket.id);

            if (opponentId && rooms[roomCode].ships[opponentId]) {
                const hit = rooms[roomCode].ships[opponentId].includes(cell);

                io.to(roomCode).emit("attackMade", { attacker: socket.id, cell, hit });

                if (hit) {
                    rooms[roomCode].ships[opponentId] = rooms[roomCode].ships[opponentId].filter(c => c !== cell);

                    if (rooms[roomCode].ships[opponentId].length === 0) {
                        io.to(roomCode).emit("gameOver", { winner: rooms[roomCode].names[socket.id] });
                        delete rooms[roomCode];
                        return;
                    }
                } else {
                    rooms[roomCode].turn = opponentId;
                    io.to(roomCode).emit("turnChanged", { nextTurn: opponentId });
                }
            }
        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
        for (const room in rooms) {
            if (rooms[room].players.includes(socket.id)) {
                delete rooms[room];
                io.emit("roomUpdated", rooms);
            }
        }
    });
});

server.listen(3000, () => console.log("Server running on port 3000"));
