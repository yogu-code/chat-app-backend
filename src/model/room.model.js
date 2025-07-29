// models/Room.js
import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  roomName: {
    type: String,
    required: true,
    trim: true
  },
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company', // Adjust this if you have a Company model
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Room = mongoose.model('Room', roomSchema);

export default Room;
