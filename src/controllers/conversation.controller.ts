import { Request, Response } from "express";
import { Conversation } from "../models/conversation.models";
import { UserModel } from "../models/users.models";
import mongoose from "mongoose";
import { IUser } from "../models/users.models";

// Extend Express Request type to include user
interface AuthenticatedRequest extends Request {
  user?: IUser & { _id: mongoose.Types.ObjectId };
}

export class ConversationController {
  // Tạo cuộc trò chuyện mới
  async createConversation(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { type, participants, name, description, avatar } = req.body;
      const creatorId = req.user._id;

      // Kiểm tra loại cuộc trò chuyện
      if (!["direct", "group", "channel", "broadcast"].includes(type)) {
        res.status(400).json({ message: "Invalid conversation type" });
        return;
      }

      // Kiểm tra tên cho group/channel/broadcast
      if (type !== "direct" && !name) {
        res
          .status(400)
          .json({ message: "Name is required for group/channel/broadcast" });
        return;
      }

      // Kiểm tra số lượng người tham gia
      if (type === "direct" && participants.length !== 1) {
        res.status(400).json({
          message: "Direct conversation must have exactly 2 participants",
        });
        return;
      }

      // Kiểm tra người tham gia có tồn tại không
      const participantIds = participants.map(
        (p: string) => new mongoose.Types.ObjectId(p)
      );
      const existingUsers = await UserModel.find({
        _id: { $in: participantIds },
      });

      if (existingUsers.length !== participantIds.length) {
        res
          .status(400)
          .json({ message: "One or more participants do not exist" });
        return;
      }

      // Tạo mảng người tham gia với vai trò
      const participantsWithRoles = [
        {
          user: creatorId,
          role: "owner",
          joinedAt: new Date(),
        },
        ...participantIds.map((userId: any) => ({
          user: userId,
          role: type === "direct" ? "member" : "member",
          joinedAt: new Date(),
        })),
      ];

      // Tạo cuộc trò chuyện mới
      const conversation = new Conversation({
        type,
        name,
        description,
        avatar,
        participants: participantsWithRoles,
        admins:
          type !== "direct"
            ? [{ user: creatorId, role: "owner", assignedAt: new Date() }]
            : [],
        settings: {
          allowInvites: type !== "direct",
          onlyAdminsCanPost: false,
          slowMode: {
            enabled: false,
            interval: 0,
          },
          messageRetention: 0,
          joinMode: "open",
          messageApproval: false,
          antiSpam: {
            enabled: true,
            maxMessagesPerMinute: 20,
          },
        },
        metadata: {
          memberCount: participantsWithRoles.length,
          onlineCount: 0,
        },
      });

      await conversation.save();

      await conversation.populate(
        "participants.user",
        "username avatar status"
      );

      res.status(201).json(conversation);
    } catch (error) {
      res.status(500).json({ message: "Error creating conversation", error });
    }
  }

  // Lấy danh sách cuộc trò chuyện của người dùng
  async getConversations(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { page = 1, limit = 20, type } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      // Build query object
      const query: any = {
        "participants.user": req.user._id,
        isDeleted: false,
      };

      // Add type filter if provided
      if (
        type &&
        ["direct", "group", "channel", "broadcast"].includes(type as string)
      ) {
        query.type = type;
      }

      const conversations = await Conversation.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("participants.user", "username avatar status")
        .populate("lastMessage");

      const total = await Conversation.countDocuments(query);

      res.json({
        conversations,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      });
    } catch (error) {
      res.status(500).json({ message: "Error getting conversations", error });
    }
  }

  // Lấy thông tin chi tiết cuộc trò chuyện
  async getConversation(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { conversationId } = req.params;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        "participants.user": req.user._id,
        isDeleted: false,
      })
        .populate("participants.user", "username avatar status")
        .populate("lastMessage");

      if (!conversation) {
        res.status(404).json({ message: "Conversation not found" });
        return;
      }

      res.json(conversation);
    } catch (error) {
      res.status(500).json({ message: "Error getting conversation", error });
    }
  }

  // Cập nhật thông tin cuộc trò chuyện
  async updateConversation(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { conversationId } = req.params;
      const { name, description, avatar, settings } = req.body;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        "participants.user": req.user._id,
        isDeleted: false,
      });

      if (!conversation) {
        res.status(404).json({ message: "Conversation not found" });
        return;
      }

      // Kiểm tra quyền chỉnh sửa
      const participant = conversation.participants.find(
        (p) => p.user.toString() === req.user!._id.toString()
      );

      if (
        !participant ||
        !["admin", "moderator", "owner"].includes(participant.role)
      ) {
        res
          .status(403)
          .json({ message: "Not authorized to update conversation" });
        return;
      }

      // Cập nhật thông tin
      if (name) conversation.name = name;
      if (description) conversation.description = description;
      if (avatar) conversation.avatar = avatar;
      if (settings)
        conversation.settings = { ...conversation.settings, ...settings };

      await conversation.save();

      res.json(conversation);
    } catch (error) {
      res.status(500).json({ message: "Error updating conversation", error });
    }
  }

  // Xóa cuộc trò chuyện
  async deleteConversation(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { conversationId } = req.params;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        "participants.user": req.user._id,
        isDeleted: false,
      });

      if (!conversation) {
        res.status(404).json({ message: "Conversation not found" });
        return;
      }

      // Kiểm tra quyền xóa
      const participant = conversation.participants.find(
        (p) => p.user.toString() === req.user!._id.toString()
      );

      if (!participant || !["admin", "owner"].includes(participant.role)) {
        res
          .status(403)
          .json({ message: "Not authorized to delete conversation" });
        return;
      }

      // Đánh dấu là đã xóa
      conversation.isDeleted = true;
      conversation.deletedAt = new Date();
      await conversation.save();

      res.json({ message: "Conversation deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting conversation", error });
    }
  }

  // Thêm người dùng vào cuộc trò chuyện nhóm
  async addParticipants(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { conversationId } = req.params;
      const { participants } = req.body;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        "participants.user": req.user._id,
        isDeleted: false,
      });

      if (!conversation) {
        res.status(404).json({ message: "Conversation not found" });
        return;
      }

      // Kiểm tra xem có phải là cuộc trò chuyện nhóm không
      if (conversation.type === "direct") {
        res
          .status(400)
          .json({ message: "Cannot add participants to direct conversation" });
        return;
      }

      // Kiểm tra quyền thêm người dùng
      const currentParticipant = conversation.participants.find(
        (p) => p.user.toString() === req.user!._id.toString()
      );

      if (
        !currentParticipant ||
        !["admin", "owner"].includes(currentParticipant.role)
      ) {
        res.status(403).json({ message: "Not authorized to add participants" });
        return;
      }

      // Kiểm tra người dùng có tồn tại không
      const participantIds = participants.map(
        (p: string) => new mongoose.Types.ObjectId(p)
      );
      const existingUsers = await UserModel.find({
        _id: { $in: participantIds },
      });

      if (existingUsers.length !== participantIds.length) {
        res
          .status(400)
          .json({ message: "One or more participants do not exist" });
        return;
      }

      // Kiểm tra người dùng đã tham gia chưa
      const existingParticipants = conversation.participants.filter((p) =>
        participantIds.some((id) => id.toString() === p.user.toString())
      );

      if (existingParticipants.length > 0) {
        res.status(400).json({
          message: "One or more participants already in conversation",
        });
        return;
      }

      // Thêm người dùng mới
      const newParticipants = participantIds.map((userId) => ({
        user: userId,
        role: "member",
        joinedAt: new Date(),
      }));

      conversation.participants.push(...newParticipants);
      conversation.metadata.memberCount = conversation.participants.length;

      await conversation.save();
      await conversation.populate(
        "participants.user",
        "username avatar status"
      );

      res.json(conversation);
    } catch (error) {
      res.status(500).json({ message: "Error adding participants", error });
    }
  }

  // Xóa người dùng khỏi cuộc trò chuyện nhóm
  async removeParticipants(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { conversationId } = req.params;
      const { participants } = req.body;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        "participants.user": req.user._id,
        isDeleted: false,
      });

      if (!conversation) {
        res.status(404).json({ message: "Conversation not found" });
        return;
      }

      // Kiểm tra xem có phải là cuộc trò chuyện nhóm không
      if (conversation.type === "direct") {
        res.status(400).json({
          message: "Cannot remove participants from direct conversation",
        });
        return;
      }

      // Kiểm tra quyền xóa người dùng
      const currentParticipant = conversation.participants.find(
        (p) => p.user.toString() === req.user!._id.toString()
      );

      if (
        !currentParticipant ||
        !["admin", "owner"].includes(currentParticipant.role)
      ) {
        res
          .status(403)
          .json({ message: "Not authorized to remove participants" });
        return;
      }

      // Chuyển đổi ID người dùng thành ObjectId
      const participantIds = participants.map(
        (p: string) => new mongoose.Types.ObjectId(p)
      );

      // Kiểm tra xem có cố gắng xóa chủ sở hữu không
      const owner = conversation.participants.find(
        (p) =>
          p.role === "owner" &&
          participantIds.some((id) => id.toString() === p.user.toString())
      );

      if (owner) {
        res
          .status(400)
          .json({ message: "Cannot remove the owner from conversation" });
        return;
      }

      // Xóa người dùng
      conversation.participants = conversation.participants.filter(
        (p) => !participantIds.some((id) => id.toString() === p.user.toString())
      );

      // Cập nhật số lượng thành viên
      conversation.metadata.memberCount = conversation.participants.length;

      // Xóa khỏi danh sách admin nếu có
      conversation.admins = conversation.admins.filter(
        (a) => !participantIds.some((id) => id.toString() === a.user.toString())
      );

      await conversation.save();
      await conversation.populate(
        "participants.user",
        "username avatar status"
      );

      res.json(conversation);
    } catch (error) {
      res.status(500).json({ message: "Error removing participants", error });
    }
  }

  // Rời khỏi cuộc trò chuyện
  async leaveConversation(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { conversationId } = req.params;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        "participants.user": req.user._id,
        isDeleted: false,
      });

      if (!conversation) {
        res.status(404).json({ message: "Conversation not found" });
        return;
      }

      // Kiểm tra xem có phải là cuộc trò chuyện nhóm không
      if (conversation.type === "direct") {
        res.status(400).json({
          message: "Cannot leave direct conversation",
        });
        return;
      }

      // Kiểm tra xem có phải là chủ sở hữu không
      const participant = conversation.participants.find(
        (p) => p.user.toString() === req.user!._id.toString()
      );

      if (participant?.role === "owner") {
        res.status(400).json({
          message:
            "Owner cannot leave the conversation. Please transfer ownership or delete the conversation instead.",
        });
        return;
      }

      // Xóa người dùng khỏi danh sách tham gia
      conversation.participants = conversation.participants.filter(
        (p) => p.user.toString() !== req.user!._id.toString()
      );

      // Cập nhật số lượng thành viên
      conversation.metadata.memberCount = conversation.participants.length;

      // Xóa khỏi danh sách admin nếu có
      conversation.admins = conversation.admins.filter(
        (a) => a.user.toString() !== req.user!._id.toString()
      );

      await conversation.save();

      res.json({ message: "Successfully left the conversation" });
    } catch (error) {
      res.status(500).json({ message: "Error leaving conversation", error });
    }
  }
}
