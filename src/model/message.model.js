const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderID: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiverID: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

export const Message = mongoose.model('Message', messageSchema);
