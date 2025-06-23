const express = require("express");
const app = express();
require("dotenv").config();
const connectDB = require("./config/db");
const path = require("path");
const Code = require("./models/Code");
const Room = require("./models/Room");
const axios = require("axios");
const cors = require("cors");
const bcrypt = require("bcrypt");

connectDB();
app.use(express.json());
app.use(cors());

const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User Connected", socket.id);

  let currentRoom = null;
  let currentUser = null;

  socket.on("join", async ({ roomID, username, password }, callback) => {
    try {
      // Leave previous room if already joined
      if (currentRoom) {
        socket.leave(currentRoom);
        const prevRoom = await Room.findOne({ roomID: currentRoom });
        if (prevRoom) {
          prevRoom.users = prevRoom.users.filter((u) => u !== currentUser);
          await prevRoom.save();
          io.to(currentRoom).emit("userJoined", prevRoom.users);
        }
      }

      let room = await Room.findOne({ roomID });

      // Room creation
      if (!room) {
        const hashedPassword = await bcrypt.hash(password, 10);
        room = new Room({
          roomID,
          password: hashedPassword,
          code: "// start code here",
          language: "javascript",
          version: "*",
          users: [],
        });
        await room.save();
        console.log(`✅ Room created: ${roomID}`);
      } else {
        // Password verification
        const isMatch = await bcrypt.compare(password, room.password);
        if (!isMatch) {
          if (callback) callback({ success: false, error: "Incorrect password" });
          return;
        }
      }

      currentRoom = roomID;
      currentUser = username;
      socket.join(roomID);

      if (!room.users.includes(username)) {
        room.users.push(username);
        await room.save();
      }

      rooms.set(roomID, {
        users: new Set(room.users),
        code: room.code,
        language: room.language,
        version: room.version,
      });

      socket.emit("codeUpdate", room.code);
      io.to(roomID).emit("userJoined", room.users);

      if (callback) callback({ success: true });

    } catch (error) {
      console.error("Join error:", error);
      if (callback) callback({ success: false, error: "Server error while joining" });
    }
  });

  socket.on("codeChange", async ({ roomID, code }) => {
    if (rooms.has(roomID)) {
      rooms.get(roomID).code = code;
      const room = await Room.findOne({ roomID });
      if (room) {
        room.code = code;
        await room.save();
      }
    }
    socket.to(roomID).emit("codeUpdate", code);
  });

  socket.on("typing", ({ roomID, username }) => {
    socket.to(roomID).emit("userTyping", username);
  });

  socket.on("languageChange", async ({ roomID, language, version }) => {
    if (rooms.has(roomID)) {
      rooms.get(roomID).language = language;
      rooms.get(roomID).version = version;
    }
    const room = await Room.findOne({ roomID });
    if (room) {
      room.language = language;
      room.version = version;
      await room.save();
    }
    io.to(roomID).emit("languageUpdate", language);
  });

  socket.on("compileCode", async ({ roomID, code, language, version, input }) => {
    try {
      if (rooms.has(roomID)) {
        const response = await axios.post("https://emkc.org/api/v2/piston/execute", {
          language,
          version,
          files: [{ content: code }],
          stdin: input,
        });
        io.to(roomID).emit("codeResponse", response.data);
      }
    } catch (err) {
      console.error("Code compilation error:", err);
      io.to(roomID).emit("codeResponse", { run: { output: "Error compiling code." } });
    }
  });

  socket.on("chatMessage", ({ roomID, username, message }) => {
    io.to(roomID).emit("newChatMessage", { username, message });
  });

  socket.on("leaveRoom", async () => {
    if (currentRoom && currentUser) {
      const room = await Room.findOne({ roomID: currentRoom });
      if (room) {
        room.users = room.users.filter((u) => u !== currentUser);
        if (room.users.length === 0) {
          await Room.deleteOne({ roomID: currentRoom });
          rooms.delete(currentRoom);
        } else {
          await room.save();
        }
        io.to(currentRoom).emit("userJoined", room.users);
      }
      socket.leave(currentRoom);
      currentRoom = null;
      currentUser = null;
    }
  });

  socket.on("disconnect", async () => {
    if (currentRoom && currentUser) {
      const room = await Room.findOne({ roomID: currentRoom });
      if (room) {
        room.users = room.users.filter((u) => u !== currentUser);
        if (room.users.length === 0) {
          await Room.deleteOne({ roomID: currentRoom });
          rooms.delete(currentRoom);
        } else {
          await room.save();
        }
        io.to(currentRoom).emit("userJoined", room.users);
      }
      console.log("User disconnected:", currentUser);
    }
  });
});

// Save and load code snippets
app.post("/api/save", async (req, res) => {
  const { code, language, version } = req.body;
  const newCode = new Code({ code, language, version });
  const saved = await newCode.save();
  res.json({ id: saved._id });
});

app.get("/api/load/:id", async (req, res) => {
  try {
    const snippet = await Code.findById(req.params.id);
    if (!snippet) return res.status(404).json({ error: "Not found" });
    res.json(snippet);
  } catch (err) {
    res.status(500).json({ error: "Invalid ID" });
  }
});
app.use(express.static(path.join(__dirname, "build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
