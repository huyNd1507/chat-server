import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import { IMessage } from "../models/message.models";
import { IConversation } from "../models/conversation.models";
import { Message } from "../models/message.models";
import { Conversation } from "../models/conversation.models";
import { verifySocketToken } from "../middleware/verifyToken";
import { env } from "../config/env";
import { UserModel } from "../models/users.models";

interface ConnectedUser {
  userId: string;
  socketId: string;
}

class ChatSocket {
  private io: SocketIOServer;
  private connectedUsers: Map<string, ConnectedUser> = new Map();

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: env.CLIENT_URL,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "Accept",
        ],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });

    console.log("Socket.IO server initialized with CORS:", {
      origin: env.CLIENT_URL,
      credentials: true,
    });

    this.setupSocketHandlers();
  }

  private async getOnlineUsersFromDB() {
    try {
      const onlineUsers = await UserModel.find(
        { status: "online" },
        { _id: 1 }
      ).lean();
      return onlineUsers.map((user) => ({
        userId: user._id.toString(),
        status: "online",
      }));
    } catch (error) {
      console.error("Error getting online users from DB:", error);
      return [];
    }
  }

  private setupSocketHandlers() {
    this.io.use(async (socket, next) => {
      try {
        // Get token from cookies
        const cookies = socket.handshake.headers.cookie;
        if (!cookies) {
          console.log("Socket connection failed: No cookies found");
          return next(new Error("Authentication error"));
        }

        // Parse cookies to get token
        const token = cookies
          .split(";")
          .find((c) => c.trim().startsWith("token="))
          ?.split("=")[1];

        if (!token) {
          console.log("Socket connection failed: No token in cookies");
          return next(new Error("Authentication error"));
        }

        const decoded = await verifySocketToken(token);
        socket.data.userId = decoded.userId;
        console.log(
          "Socket authentication successful for user:",
          decoded.userId
        );
        next();
      } catch (error) {
        console.log("Socket authentication failed:", error);
        next(new Error("Authentication error"));
      }
    });

    this.io.on("connection", (socket) => {
      console.log("New socket connection established. Socket ID:", socket.id);
      console.log("Connected user ID:", socket.data.userId);
      this.handleConnection(socket);

      // Test event
      socket.on("test:ping", () => {
        console.log("Received test:ping from socket:", socket.id);
        socket.emit("test:pong", {
          message: "Server is working!",
          timestamp: new Date(),
        });
      });

      // Xử lý các sự kiện
      socket.on("join:conversation", (conversationId: string) => {
        this.handleJoinConversation(socket, conversationId);
      });

      socket.on("leave:conversation", (conversationId: string) => {
        this.handleLeaveConversation(socket, conversationId);
      });

      socket.on(
        "message:send",
        async (data: {
          conversationId: string;
          content: any;
          type: string;
        }) => {
          await this.handleSendMessage(socket, data);
        }
      );

      socket.on(
        "message:read",
        async (data: { conversationId: string; messageId: string }) => {
          await this.handleMessageRead(socket, data);
        }
      );

      socket.on("typing:start", (data: { conversationId: string }) => {
        this.handleTypingStart(socket, data);
      });

      socket.on("typing:stop", (data: { conversationId: string }) => {
        this.handleTypingStop(socket, data);
      });

      socket.on("disconnect", () => {
        this.handleDisconnect(socket);
      });
    });
  }

  private async handleConnection(socket: any) {
    const userId = socket.data.userId;

    // Cập nhật trạng thái online trong database
    await UserModel.findByIdAndUpdate(userId, {
      status: "online",
      lastSeen: new Date(),
    });

    // Thêm user vào danh sách connected
    this.connectedUsers.set(userId, { userId, socketId: socket.id });

    // Lấy danh sách người dùng online từ database
    const onlineUsers = await this.getOnlineUsersFromDB();

    // Gửi danh sách người dùng online cho client mới
    socket.emit("users:online", onlineUsers);

    // Thông báo cho tất cả client khác về người dùng mới online
    socket.broadcast.emit("user:status", {
      userId,
      status: "online",
    });
  }

  private async handleDisconnect(socket: any) {
    const userId = socket.data.userId;

    // Cập nhật trạng thái offline trong database
    await UserModel.findByIdAndUpdate(userId, {
      status: "offline",
      lastSeen: new Date(),
    });

    // Xóa user khỏi danh sách connected
    this.connectedUsers.delete(userId);

    // Thông báo cho tất cả client về người dùng offline
    this.io.emit("user:status", {
      userId,
      status: "offline",
    });
  }

  private handleJoinConversation(socket: any, conversationId: string) {
    socket.join(`conversation:${conversationId}`);
  }

  private handleLeaveConversation(socket: any, conversationId: string) {
    socket.leave(`conversation:${conversationId}`);
  }

  private async handleSendMessage(
    socket: any,
    data: {
      conversationId: string;
      content: any;
      type: string;
    }
  ) {
    try {
      const { conversationId, content, type } = data;
      const userId = socket.data.userId;

      let formattedContent: any = {};

      if (type === "text") {
        formattedContent.text = content;
      } else if (type === "file" || type === "image" || type === "video") {
        formattedContent.media = content.media;
      } else if (type === "location") {
        formattedContent.location = content;
      } else if (type === "poll") {
        formattedContent.poll = content;
      } else if (type === "contact") {
        formattedContent.contact = content;
      } else if (type === "call") {
        formattedContent.call = content;
      }

      const message = new Message({
        conversation: conversationId,
        sender: userId,
        type,
        content: formattedContent,
        status: "sent",
        readBy: [],
      });

      console.log("Sending message ====", message);

      await message.save();

      // Thêm người gửi vào danh sách readBy
      await Message.findByIdAndUpdate(message._id, {
        $addToSet: {
          readBy: {
            user: userId,
            readAt: new Date(),
          },
        },
      });

      // Populate sender information
      await message.populate("sender", "username avatar");

      // Cập nhật lastMessage trong conversation
      const conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        {
          lastMessage: message._id,
          $inc: {
            "unreadCount.$[elem].count": 1,
          },
        },
        {
          arrayFilters: [{ "elem.user": { $ne: userId } }],
          new: true,
        }
      )
        .populate("lastMessage")
        .populate("participants.user", "username avatar status");

      // Gửi tin nhắn đến tất cả người dùng trong cuộc trò chuyện
      if (conversation) {
        conversation.participants.forEach((participant: any) => {
          const participantId = participant.user._id.toString();
          if (participantId !== userId) {
            const participantSocket = this.connectedUsers.get(participantId);
            if (participantSocket) {
              // Gửi tin nhắn trực tiếp đến socket của người nhận
              this.io.to(participantSocket.socketId).emit("message:new", {
                message,
                conversationId,
              });

              // Gửi sự kiện cập nhật conversation
              this.io
                .to(participantSocket.socketId)
                .emit("conversation:updated", {
                  conversation,
                });
            }
          }
        });
      }

      // Gửi tin nhắn cho người gửi
      socket.emit("message:new", {
        message,
        conversationId,
      });

      // Gửi sự kiện cập nhật conversation cho người gửi
      socket.emit("conversation:updated", {
        conversation,
      });
    } catch (error) {
      console.error("Error handling message send:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  }

  private async handleMessageRead(
    socket: any,
    data: {
      conversationId: string;
      messageId: string;
    }
  ) {
    try {
      const { conversationId, messageId } = data;
      const userId = socket.data.userId;

      // Kiểm tra xem tin nhắn có tồn tại không và người dùng đã đọc chưa
      const existingMessage = await Message.findById(messageId);

      if (!existingMessage) {
        return socket.emit("error", { message: "Message not found" });
      }

      // Kiểm tra xem người dùng đã đọc tin nhắn này chưa
      const alreadyRead = existingMessage.readBy.some(
        (readInfo: any) => readInfo.user.toString() === userId
      );

      // Nếu đã đọc rồi thì không cần cập nhật nữa
      if (alreadyRead) {
        return;
      }

      // Cập nhật trạng thái đã đọc
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: {
          readBy: {
            user: userId,
            readAt: new Date(),
          },
        },
      });

      // Cập nhật unreadCount trong conversation
      await Conversation.findByIdAndUpdate(
        conversationId,
        {
          $set: {
            "unreadCount.$[elem].count": 0,
          },
        },
        {
          arrayFilters: [{ "elem.user": userId }],
        }
      );

      // Thông báo cho người gửi
      this.io.to(`conversation:${conversationId}`).emit("message:read", {
        messageId,
        userId,
        conversationId,
      });
    } catch (error) {
      console.error("Error marking message as read:", error);
      socket.emit("error", { message: "Failed to mark message as read" });
    }
  }

  private handleTypingStart(socket: any, data: { conversationId: string }) {
    const userId = socket.data.userId;
    // Gửi sự kiện typing cho tất cả người dùng, không chỉ trong cùng cuộc trò chuyện
    this.io.emit("typing:start", {
      userId,
      conversationId: data.conversationId,
    });
  }

  private handleTypingStop(socket: any, data: { conversationId: string }) {
    const userId = socket.data.userId;
    // Gửi sự kiện typing cho tất cả người dùng, không chỉ trong cùng cuộc trò chuyện
    this.io.emit("typing:stop", {
      userId,
      conversationId: data.conversationId,
    });
  }
}

export default ChatSocket;
