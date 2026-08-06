const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  short: { type: String, required: true },
  ch: String,
  en: String,
  enable: { type: Number, default: 1 }
}, { 
  collection: 'FACUST' // Explicitly link to your existing collection
});

module.exports = mongoose.model('Customer', customerSchema);