import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import dotenv from "dotenv";
import {
  handleSendMessage,
  handleDeleteMessage,
  handleEditMessage,
  handleLeaveRoom,
} from "../controller/message.controller.js";
import { ObjectId } from "mongodb";
import Room from "../model/room.model.js";
import mongoose from "mongoose";

dotenv.config();

// In-memory store for one-on-one chats
const rooms = new Map(); // Map<roomId, { users: string[], creator: string }>

export const initializeSocket = (server, allowedOrigins) => {
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    },
  });

  // Socket.IO authentication middleware
  io.use((socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      if (!cookieHeader) {
        console.error("No cookies sent");
        return next(new Error("No cookies sent"));
      }

      const cookies = cookie.parse(cookieHeader);
      const token = cookies.token;
      if (!token) {
        console.error("Token missing");
        return next(new Error("Token missing"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded) {
        console.error("Invalid token");
        return next(new Error("Invalid token"));
      }

      const allowedRoles = ["User", "Admin"];
      if (!allowedRoles.includes(decoded.position)) {
        console.error("Insufficient position permissions");
        return next(
          new Error("Authorization error: Insufficient position permissions")
        );
      }

      socket.user = decoded;
      console.log("Authenticated user:", socket.user);
      next();
    } catch (error) {
      console.error("Socket authentication error:", error.message);
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`✅ [Socket Connected] User ID: ${socket.user.userId}`);

    // Fetch existing one-on-one chats for the user
    Room
      .find({ users: socket.user.userId, isOneOnOne: true })
      .toArray()
      .then((userRooms) => {
        userRooms.forEach((room) => {
          rooms.set(room.roomId, {
            users: room.users,
            creator: room.creator,
          });
          socket.emit("chatCreated", {
            roomId: room.roomId,
            otherUserId: room.users.find(id => id !== socket.user.userId),
            users: room.users,
            creator: room.creator,
          });
          console.log(
            `📤 [Chat Emitted on Connect] roomId=${room.roomId}, userId=${socket.user.userId}`
          );
        });
      })
      .catch((error) => {
        console.error("❌ [Fetch Chats Error]:", error.message);
        socket.emit(
          "errorMessage",
          "Failed to load chats. Please try again later."
        );
      });

    socket.on("sendMessage", async (message) => {
      console.log(
        `📥 [Message Received] From ${socket.user.userId}: "${message}"`
      );
      try {
        const targetRoom = Array.from(socket.rooms).find((room) => room.startsWith("room_"));

        if (!targetRoom) {
          console.error("No chat room selected");
          return socket.emit(
            "errorMessage",
            "No chat room selected for sending message."
          );
        }

        if (!rooms.get(targetRoom)?.users.includes(socket.user.userId)) {
          console.error(
            `User ${socket.user.userId} not authorized to send message to chat ${targetRoom}`
          );
          return socket.emit(
            "errorMessage",
            "You are not authorized to send messages to this chat."
          );
        }

        await handleSendMessage(socket, message, targetRoom);
      } catch (error) {
        console.error("❌ [sendMessage Error]:", error.message);
        socket.emit(
          "errorMessage",
          "An unexpected error occurred while sending message."
        );
      }
    });

    socket.on("editMessage", async ({ messageId, newMessage }) => {
      console.log(
        `📥 [Edit Request] From ${socket.user.userId}: messageId=${messageId}, newMessage="${newMessage}"`
      );
      try {
        const targetRoom = Array.from(socket.rooms).find((room) => room.startsWith("room_"));

        if (!targetRoom) {
          console.error("No chat room selected");
          return socket.emit(
            "errorMessage",
            "No chat room selected for editing message."
          );
        }

        if (!rooms.get(targetRoom)?.users.includes(socket.user.userId)) {
          console.error(
            `User ${socket.user.userId} not authorized to edit message in chat ${targetRoom}`
          );
          return socket.emit(
            "errorMessage",
            "You are not authorized to edit messages in this chat."
          );
        }

        await handleEditMessage(socket, { messageId, newMessage }, targetRoom);
      } catch (error) {
        console.error("❌ [Edit Message Error]:", error.message);
        socket.emit(
          "errorMessage",
          "An unexpected error occurred while editing message."
        );
      }
    });

    socket.on("deleteMessage", async (messageId) => {
      console.log(
        `📥 [Delete Request] From ${socket.user.userId}: "${messageId}"`
      );
      try {
        const targetRoom = Array.from(socket.rooms).find((room) => room.startsWith("room_"));

        if (!targetRoom) {
          console.error("No chat room selected");
          return socket.emit(
            "errorMessage",
            "No chat room selected for deleting message."
          );
        }

        if (!rooms.get(targetRoom)?.users.includes(socket.user.userId)) {
          console.error(
            `User ${socket.user.userId} not authorized to delete message in chat ${targetRoom}`
          );
          return socket.emit(
            "errorMessage",
            "You are not authorized to delete messages in this chat."
          );
        }

        await handleDeleteMessage(socket, messageId, targetRoom);
      } catch (error) {
        console.error("❌ [Delete Message Error]:", error.message);
        socket.emit(
          "errorMessage",
          "An unexpected error occurred while deleting message."
        );
      }
    });

    socket.on("typing", () => {
      const targetRoom = Array.from(socket.rooms).find((room) => room.startsWith("room_"));
      if (!targetRoom) return;

      console.log(
        `✍️ [Typing] ${socket.user.userId} is typing in ${targetRoom}`
      );
      if (!rooms.get(targetRoom)?.users.includes(socket.user.userId)) {
        console.error(
          `User ${socket.user.userId} not authorized to send typing event to chat ${targetRoom}`
        );
        return socket.emit(
          "errorMessage",
          "You are not authorized to send typing events to this chat."
        );
      }
      socket.to(targetRoom).emit("userTyping", {
        userId: socket.user.userId,
        username: socket.user.firstName || "Anonymous",
        roomId: targetRoom,
      });
    });

    socket.on("stopTyping", () => {
      const targetRoom = Array.from(socket.rooms).find((room) => room.startsWith("room_"));
      if (!targetRoom) return;

      console.log(`✋ [Stopped Typing] ${socket.user.userId} in ${targetRoom}`);
      if (!rooms.get(targetRoom)?.users.includes(socket.user.userId)) {
        console.error(
          `User ${socket.user.userId} not authorized to send stopTyping event to chat ${targetRoom}`
        );
        return socket.emit(
          "errorMessage",
          "You are not authorized to send stopTyping events to this chat."
        );
      }
      socket.to(targetRoom).emit("userStoppedTyping", {
        userId: socket.user.userId,
        roomId: targetRoom,
      });
    });

    socket.on("startChat", async (otherUserId) => {
      console.log(
        `📥 [Start Chat Request] From ${socket.user.userId}: otherUserId=${otherUserId}`
      );
      try {
        // Validate input
        if (!otherUserId || typeof otherUserId !== "string" || !otherUserId.trim()) {
          console.error("Invalid user ID");
          return socket.emit(
            "errorMessage",
            "Valid user ID is required to start a chat."
          );
        }

        if (otherUserId === socket.user.userId) {
          console.error("Cannot start chat with self");
          return socket.emit(
            "errorMessage",
            "Cannot start a chat with yourself."
          );
        }

        // Validate that the other user exists and has valid role
        const userCollection = mongoose.connection.collection('users');
        const adminCollection = mongoose.connection.collection('admins');
        const validUser = await userCollection.findOne({
          _id: new ObjectId(otherUserId),
          position: "User"
        }) || await adminCollection.findOne({
          _id: new ObjectId(otherUserId),
          position: "Admin"
        });

        if (!validUser) {
          console.error("User not found or invalid role");
          return socket.emit(
            "errorMessage",
            "User not found or has invalid role."
          );
        }

        // Create a unique room ID for the one-on-one chat
        const userIds = [socket.user.userId, otherUserId].sort();
        const roomId = `room_${userIds[0]}_${userIds[1]}`;

        // Check if chat already exists
        const existingRoom = await Room.findOne({ roomId, isOneOnOne: true });
        if (existingRoom) {
          socket.join(roomId);
          rooms.set(roomId, {
            users: existingRoom.users,
            creator: existingRoom.creator,
          });
          socket.emit("chatCreated", {
            roomId,
            otherUserId,
            users: existingRoom.users,
            creator: existingRoom.creator,
          });
          io.to(otherUserId).emit("chatCreated", {
            roomId,
            otherUserId: socket.user.userId,
            users: existingRoom.users,
            creator: existingRoom.creator,
          });
          console.log(
            `✅ [Existing Chat Loaded] roomId=${roomId}, users=${userIds}`
          );
          return;
        }

        // Create new one-on-one chat
        await Room.insertOne({
          roomId,
          users: userIds,
          creator: socket.user.userId,
          isOneOnOne: true,
          createdAt: new Date(),
        });

        // Store room details in-memory
        rooms.set(roomId, {
          users: userIds,
          creator: socket.user.userId,
        });

        // Join the creator to the room
        socket.join(roomId);
        console.log(
          `✅ [Chat Created] roomId=${roomId}, users=${userIds}`
        );

        // Notify both users about the chat creation
        [socket.user.userId, otherUserId].forEach((userId) => {
          io.to(userId).emit("chatCreated", {
            roomId,
            otherUserId: userId === socket.user.userId ? otherUserId : socket.user.userId,
            users: userIds,
            creator: socket.user.userId,
          });
          console.log(
            `📤 [chatCreated Emitted] to userId=${userId}, roomId=${roomId}`
          );
        });

        // Join the other user if online
        io.sockets.sockets.forEach((client) => {
          if (client.user?.userId === otherUserId) {
            client.join(roomId);
            console.log(
              `✅ [User Joined Chat] userId=${client.user.userId}, roomId=${roomId}`
            );
          }
        });

        // Send a system message to the chat
        const systemMessage = {
          _id: new ObjectId().toString(),
          message: `Private chat started between ${socket.user.firstName || "Anonymous"} and ${validUser.firstName || "Anonymous"}`,
          userId: "system",
          username: "System",
          roomId,
          timestamp: new Date().toISOString(),
        };

        // Save the system message to the database
        const messageCollection = mongoose.connection.collection('messages');
        await messageCollection.insertOne({
          _id: new ObjectId(systemMessage._id),
          message: systemMessage.message,
          userId: systemMessage.userId,
          username: systemMessage.username,
          roomId: systemMessage.roomId,
          timestamp: new Date(systemMessage.timestamp),
        });

        // Broadcast the system message to the chat
        io.to(roomId).emit("newMessage", systemMessage);
        console.log(
          `📤 [System Message Sent] roomId=${roomId}, message="${systemMessage.message}"`
        );
      } catch (error) {
        console.error("❌ [Start Chat Error]:", error.message);
        socket.emit(
          "errorMessage",
          "An unexpected error occurred while starting chat."
        );
      }
    });

    socket.on("joinChat", (roomId) => {
      console.log(
        `📥 [Join Chat Request] From ${socket.user.userId}: roomId=${roomId}`
      );
      try {
        const room = rooms.get(roomId);
        if (!room) {
          console.error(`Chat not found: ${roomId}`);
          return socket.emit("errorMessage", "Chat not found.");
        }
        if (!room.users.includes(socket.user.userId)) {
          console.error(
            `User ${socket.user.userId} not authorized to join chat ${roomId}`
          );
          return socket.emit(
            "errorMessage",
            "You are not authorized to join this chat."
          );
        }
        socket.join(roomId);
        console.log(
          `✅ [User Joined Chat] userId=${socket.user.userId}, roomId=${roomId}`
        );
        const onlineUsers = [];
        io.sockets.sockets.forEach((client) => {
          if (client.rooms.has(roomId) && client.user) {
            onlineUsers.push({
              userId: client.user.userId,
              username: client.user.firstName || "Anonymous",
            });
          }
        });
        socket.emit("joinConfirmation", {
          room: roomId,
          users: onlineUsers,
        });
        socket.to(roomId).emit("userJoined", {
          userId: socket.user.userId,
          username: socket.user.firstName || "Anonymous",
          roomId,
        });
      } catch (error) {
        console.error("❌ [Join Chat Error]:", error.message);
        socket.emit(
          "errorMessage",
          "An unexpected error occurred while joining chat."
        );
      }
    });

    socket.on("leaveChat", async (roomId) => {
      console.log(
        `📥 [Leave Chat Request] From ${socket.user.userId}: roomId=${roomId}`
      );
      try {
        await handleLeaveRoom(socket, roomId);
        const room = await Room.findOne({ roomId });
        if (room) {
          rooms.set(roomId, {
            users: room.users,
            creator: room.creator,
          });
        } else {
          rooms.delete(roomId);
        }
      } catch (error) {
        console.error("❌ [Leave Chat Error]:", error.message);
        socket.emit(
          "errorMessage",
          "An unexpected error occurred while leaving chat."
        );
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ [Socket Disconnected] User ID: ${socket.user.userId}`);
      socket.rooms.forEach((roomId) => {
        if (roomId !== socket.id && roomId.startsWith("room_")) {
          socket.to(roomId).emit("userLeft", {
            userId: socket.user.userId,
            username: socket.user.firstName || "Anonymous",
            roomId,
          });
        }
      });
    });
  });

  return io;
};