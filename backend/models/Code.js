const mongoose = require('mongoose')

const codeSchema = new mongoose.Schema({
    code:String,
    language:String,
    version : String,
    


},{ timestamps: true });

module.exports = mongoose.model("Code", codeSchema);

