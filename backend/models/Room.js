const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomID: { type: String, required: true, unique: true },
  code: { type: String, default: "// start code here" },
  language: { type: String, default: "javascript" },
  version: { type: String, default: "*" },
  users: { type: [String], default: [] },
  password: { type: String, required: true }  // 🔒 Add password field
});

module.exports = mongoose.model("Room", roomSchema);
