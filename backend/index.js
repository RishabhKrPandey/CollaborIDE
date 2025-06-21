// main server file
const express = require('express')
const app = express();
require('dotenv').config();
const connectDB = require('./config/db')
const path = require('path')
const Code = require('./models/Code')

// set up database for chat and code storage feature
connectDB();

const http = require('http');
const server = http.createServer(app);
app.use(express.json());

const { Server } = require('socket.io');


const io = new Server(server,{
    cors : {
        origin :"*",
    },
});

// create a room  to handle users in room
const rooms = new Map()

io.on('connection', (socket)=>{
    console.log('User Connected', socket.id);

    let currentRoom = null;
    let currentUser = null;

    // we will track users and room
    // now if user joins a room , check if he is curretly joined in any room leave that room
    // gneerate 2 this room_id and username for the user
    socket.on('join', ({roomID, username}) =>{
        if(currentRoom){
            socket.leave(currentRoom);
            rooms.get(currentRoom)?.users.delete(currentUser);
            // if users not available it will create one {room1 : {users:{1,2,3}}} , data will be something like this

            // make user join the newromm
            io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom).users));
            

        }
        // if room is yet not created, then create it
        currentRoom = roomID;
        currentUser = username;
        // check if room exist or create a new one
        socket.join(roomID);

        if (!rooms.has(roomID)) {
        rooms.set(roomID, { users: new Set(), code: "// start code here" });
        }

        rooms.get(roomID).users.add(username);

        // now user has joined or created a room 
        // need to start traking changes
        // when user join he shoild be able to see the code already present
        socket.emit('codeUpdate', rooms.get(roomID).code);
        // update all users about the new joined
        io.to(roomID).emit("userJoined", Array.from(rooms.get(roomID).users))


    });
    // now for all users present in room 
    socket.on('codeChange', ({roomID, code}) =>{
        if(rooms.get(roomID)){
            rooms.get(roomID).code = code;
        }
        
        // send updated code to each member
        socket.to(roomID).emit('codeUpdate', code);
    });
    // whenver user types , tell other users
     socket.on("typing", ({ roomID, username }) => {
     socket.to(roomID).emit("userTyping", username);
    });

    // if user changes programming language do it for all
    socket.on('languageChange', ({roomID, language})=>{
        // change for all users
        io.to(roomID).emit('languageUpdate', language);
    });

    //we will use piston api for compiling our code
    socket.on('compileCode', async({roomID, code, language, version, input})=>{
        // use axios for api request
        // handle this task asynchronously
        if(rooms.has(roomID)){
            const response = await axios.post("https://emkc.org/api/v2/piston/execute", {
                language,
                version,
                files : [{content : code}],
                stdin : input,
            });
            // send response to all the users
            io.to(roomID).emit('codeResponse', response.data);

        }
    });

    // for chat message
    socket.on('chatMessage', ({roomID, username, message})=>{
        // emit this message to everyone
        io.to(roomID).emit('newChatMessage', {username, message});
    })

    //handle if user leaves the room - set current details to null and deletefrom room
    // if disconnect - just delete the user from room , dont remove the details
    socket.on('disconnect', ()=>{
        if(currentRoom && currentUser){
            rooms.get(currentRoom).users.delete(currentUser);
            // update the list
            io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom).users));
            

        }
        console.log("User disconnected");
    });
    socket.on('leaveRoom', ()=>{
        if(currentRoom && currentUser){
            rooms.get(currentRoom).users.delete(currentUser);
            // update the list
            io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom).users));
            socket.leave(currentRoom);
            currentRoom = null;
            currentUser = null;
            

        }

    });




});

// we aslo need to save the code
// generate id and send it as response which will be used to load the code again
app.post("/api/save", async (req, res) => {
  const { code, language } = req.body;
  const newCode = new Code({ code, language });
  const saved = await newCode.save();
  res.json({ id: saved._id });
});

// for loading
app.get("/api/load/:id", async (req, res) => {
  try {
    const snippet = await Code.findById(req.params.id);
    if (!snippet) return res.status(404).json({ error: "Not found" });
    res.json(snippet);
  } catch (err) {
    res.status(500).json({ error: "Invalid ID" });
  }
});


