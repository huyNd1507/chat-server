import { Request, Response } from "express";
import { Message, IMessage } from "../models/message.models";
import { Conversation } from "../models/conversation.models";
import mongoose from "mongoose";

export class MessageController {
  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const messages = await Message.find({
        conversation: conversationId,
        isDeleted: false,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("sender", "username avatar fullname")
        .populate("replyTo")
        .populate({
          path: "readBy.user",
          select: "username avatar fullname",
        });

      const total = await Message.countDocuments({
        conversation: conversationId,
        isDeleted: false,
      });

      res.json({
        messages,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      });
    } catch (error) {
      res.status(500).json({ message: "Error getting messages", error });
    }
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { conversationId, content, type = "text" } = req.body;
      const senderId = req.user._id;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        "participants.user": senderId,
      });

      if (!conversation) {
        res.status(404).json({ message: "Conversation not found" });
        return;
      }

      let formattedContent: any = {};
      if (type === "text") {
        formattedContent = { text: content };
      } else if (type === "image" || type === "video" || type === "file") {
        formattedContent = { media: content };
      } else if (type === "location") {
        formattedContent = { location: content };
      } else if (type === "contact") {
        formattedContent = { contact: content };
      } else if (type === "call") {
        formattedContent = { call: content };
      } else if (type === "poll") {
        formattedContent = { poll: content };
      }

      const message = new Message({
        conversation: conversationId,
        sender: senderId,
        type,
        content: formattedContent,
      });

      await message.save();

      conversation.lastMessage = message._id as mongoose.Types.ObjectId;
      await conversation.save();
      await message.populate("sender", "username avatar");

      try {
        const io = req.app.get("io");
        if (io) {
          io.to(conversationId).emit("new_message", message);
        } else {
          console.log("Socket.IO not initialized");
        }
      } catch (socketError) {
        console.error("Socket error:", socketError);
      }

      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({
        message: "Error sending message",
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  async markAsRead(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { messageId } = req.params;
      const userId = req.user._id;

      const message = await Message.findById(messageId);
      if (!message) {
        res.status(404).json({ message: "Message not found" });
        return;
      }

      const alreadyRead = message.readBy.some(
        (read) => read.user.toString() === userId.toString()
      );

      if (alreadyRead) {
        res.status(400).json({ message: "You have already read this message" });
        return;
      }

      await Message.updateOne(
        { _id: messageId },
        {
          $addToSet: {
            readBy: {
              user: userId,
              readAt: new Date(),
            },
          },
        }
      );

      req.app
        .get("io")
        .to(message.conversation.toString())
        .emit("message_read", {
          messageId,
          userId,
        });

      res.json({ message: "Message marked as read" });
    } catch (error) {
      res.status(500).json({ message: "Error marking message as read", error });
    }
  }

  async deleteMessage(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { messageId } = req.params;
      const userId = req.user._id;

      const message = await Message.findById(messageId);
      if (!message) {
        res.status(404).json({ message: "Message not found" });
        return;
      }

      if (message.sender.toString() !== userId.toString()) {
        res.status(403).json({ message: "Not authorized" });
        return;
      }

      message.isDeleted = true;
      message.deletedAt = new Date();
      message.deletedBy = userId;
      await message.save();

      const conversation = await Conversation.findById(message.conversation);
      if (conversation && conversation.lastMessage?.toString() === messageId) {
        const lastMessage = (await Message.findOne({
          conversation: message.conversation,
          isDeleted: false,
        })
          .sort({ createdAt: -1 })
          .lean()) as (IMessage & { _id: mongoose.Types.ObjectId }) | null;

        conversation.lastMessage = lastMessage ? lastMessage._id : undefined;
        await conversation.save();
      }

      try {
        const io = req.app.get("io");
        if (io) {
          io.to(message.conversation.toString()).emit("message_deleted", {
            messageId,
            userId,
          });
        }
      } catch (socketError) {
        console.error("Socket error:", socketError);
      }

      res.json({ message: "Message deleted" });
    } catch (error) {
      console.error("Error deleting message:", error);
      res.status(500).json({
        message: "Error deleting message",
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  async editMessage(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { messageId } = req.params;
      const { content } = req.body;
      const userId = req.user._id;

      const message = await Message.findById(messageId);
      if (!message) {
        res.status(404).json({ message: "Message not found" });
        return;
      }

      if (message.sender.toString() !== userId.toString()) {
        res.status(403).json({ message: "Not authorized" });
        return;
      }

      message.editHistory.push({
        content: message.content,
        editedAt: new Date(),
        editedBy: userId,
      });

      message.content = content;
      message.isEdited = true;
      await message.save();

      req.app
        .get("io")
        .to(message.conversation.toString())
        .emit("message_edited", {
          messageId,
          content,
          userId,
        });

      res.json(message);
    } catch (error) {
      res.status(500).json({ message: "Error editing message", error });
    }
  }

  async addReaction(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { messageId } = req.params;
      const { emoji } = req.body;
      const userId = req.user._id;

      const message = await Message.findById(messageId);
      if (!message) {
        res.status(404).json({ message: "Message not found" });
        return;
      }

      const existingReaction = message.reactions.find(
        (reaction) => reaction.user.toString() === userId.toString()
      );

      if (existingReaction) {
        existingReaction.emoji = emoji;
      } else {
        message.reactions.push({
          user: userId,
          emoji,
          createdAt: new Date(),
        });
      }

      await message.save();

      req.app
        .get("io")
        .to(message.conversation.toString())
        .emit("message_reaction", {
          messageId,
          reaction: {
            user: userId,
            emoji,
          },
        });

      res.json(message);
    } catch (error) {
      res.status(500).json({ message: "Error adding reaction", error });
    }
  }

  async removeReaction(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { messageId, reactionId } = req.params;
      const userId = req.user._id;

      const message = await Message.findById(messageId);
      if (!message) {
        res.status(404).json({ message: "Message not found" });
        return;
      }
      message.reactions = message.reactions.filter(
        (reaction) => reaction.user.toString() !== userId.toString()
      );

      await message.save();

      req.app
        .get("io")
        .to(message.conversation.toString())
        .emit("message_reaction_removed", {
          messageId,
          userId,
        });

      res.json(message);
    } catch (error) {
      res.status(500).json({ message: "Error removing reaction", error });
    }
  }

  async markMultipleAsRead(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { messageIds, conversationId } = req.body;
      const userId = req.user._id;

      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        res
          .status(400)
          .json({ message: "Invalid messageIds. Must be a non-empty array." });
        return;
      }

      if (!conversationId) {
        res.status(400).json({ message: "conversationId is required" });
        return;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        "participants.user": userId,
      });

      if (!conversation) {
        res.status(404).json({
          message: "Conversation not found or you are not a participant",
        });
        return;
      }

      const messages = await Message.find({
        _id: { $in: messageIds },
        conversation: conversationId,
        "readBy.user": { $ne: userId },
      });

      if (messages.length === 0) {
        res.status(200).json({
          message: "No new messages to mark as read",
          updatedMessageIds: [],
        });
        return;
      }

      const updatedMessageIds = messages.map((message) => message._id);

      const updateOperations = messages.map((message) => ({
        updateOne: {
          filter: { _id: message._id },
          update: {
            $addToSet: {
              readBy: {
                user: userId,
                readAt: new Date(),
              },
            },
          },
        },
      }));

      const result = await Message.bulkWrite(updateOperations);

      const messageIdList = messages.map((msg) => msg._id);
      const latestMessage = await Message.findOne({
        _id: { $in: messageIdList },
      }).sort({ createdAt: -1 });

      if (latestMessage) {
        await Conversation.updateOne(
          {
            _id: conversationId,
            "participants.user": userId,
          },
          {
            $set: { "participants.$.lastReadMessage": latestMessage._id },
          }
        );
      }

      await Conversation.updateOne(
        {
          _id: conversationId,
          "unreadCount.user": userId,
        },
        {
          $set: { "unreadCount.$.count": 0 },
        }
      );

      try {
        const io = req.app.get("io");
        if (io) {
          io.to(`conversation:${conversationId}`).emit("messages_read", {
            messageIds: updatedMessageIds,
            userId,
            conversationId,
          });
        } else {
          console.log("Socket.IO not initialized");
        }
      } catch (socketError) {
        console.error("Socket error:", socketError);
      }

      res.status(200).json({
        message: "Messages marked as read successfully",
        updatedCount: result.modifiedCount,
        updatedMessageIds,
      });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res
        .status(500)
        .json({ message: "Error marking messages as read", error });
    }
  }
}
