const mongoose = require('mongoose')

const codeSchema = new mongoose.Schema({
    code:String,
    language:String,


},{ timestamps: true });

module.exports = mongoose.model("Code", codeSchema);

