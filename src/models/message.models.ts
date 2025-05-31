import mongoose, { Schema, Document } from "mongoose";

export interface IMessage extends Document {
  conversation: mongoose.Types.ObjectId; // ID cuộc trò chuyện
  sender: mongoose.Types.ObjectId; // ID người gửi
  type:
    | "text"
    | "image"
    | "video"
    | "file"
    | "audio"
    | "voice"
    | "location"
    | "contact"
    | "sticker"
    | "gif"
    | "poll"
    | "system"
    | "forwarded"
    | "reply"
    | "story"
    | "live"
    | "call"; // Loại tin nhắn
  content: {
    // Nội dung tin nhắn
    text?: string; // Văn bản
    media?: {
      // Media (ảnh, video, file)
      url: string; // URL media
      thumbnail?: string; // Ảnh thu nhỏ
      duration?: number; // Thời lượng (cho video/audio)
      size?: number; // Kích thước file
      mimeType?: string; // Loại file
      width?: number; // Chiều rộng (cho ảnh/video)
      height?: number; // Chiều cao (cho ảnh/video)
      caption?: string; // Chú thích
      alt?: string; // Mô tả thay thế
    };
    poll?: {
      // Khảo sát
      question: string; // Câu hỏi
      options: Array<{
        // Các lựa chọn
        text: string; // Nội dung lựa chọn
        votes: Array<{
          // Danh sách bình chọn
          user: mongoose.Types.ObjectId; // ID người bình chọn
          votedAt: Date; // Thời gian bình chọn
        }>;
      }>;
      isMultipleChoice: boolean; // Cho phép chọn nhiều
      endTime?: Date; // Thời gian kết thúc
      isAnonymous: boolean; // Bình chọn ẩn danh
    };
    location?: {
      // Vị trí
      type: string; // Loại vị trí
      coordinates: number[]; // Tọa độ
      name?: string; // Tên địa điểm
      address?: string; // Địa chỉ
    };
    contact?: {
      // Thông tin liên hệ
      name: string; // Tên
      phone?: string; // Số điện thoại
      email?: string; // Email
      avatar?: string; // Ảnh đại diện
    };
    call?: {
      // Thông tin cuộc gọi
      type: "voice" | "video"; // Loại cuộc gọi
      status: "missed" | "answered" | "rejected" | "busy"; // Trạng thái
      duration?: number; // Thời lượng
      startTime: Date; // Thời gian bắt đầu
      endTime?: Date; // Thời gian kết thúc
    };
  };
  replyTo?: mongoose.Types.ObjectId; // ID tin nhắn được trả lời
  forwardedFrom?: {
    // Thông tin chuyển tiếp
    message: mongoose.Types.ObjectId; // ID tin nhắn gốc
    conversation: mongoose.Types.ObjectId; // ID cuộc trò chuyện gốc
    forwardedAt: Date; // Thời gian chuyển tiếp
  };
  readBy: Array<{
    // Danh sách người đã đọc
    user: mongoose.Types.ObjectId; // ID người dùng
    readAt: Date; // Thời gian đọc
  }>;
  reactions: Array<{
    // Phản ứng với tin nhắn
    user: mongoose.Types.ObjectId; // ID người dùng
    emoji: string; // Emoji
    createdAt: Date; // Thời gian phản ứng
  }>;
  isEdited: boolean; // Đã chỉnh sửa
  editHistory: Array<{
    // Lịch sử chỉnh sửa
    content: any; // Nội dung trước khi sửa
    editedAt: Date; // Thời gian sửa
    editedBy: mongoose.Types.ObjectId; // Người sửa
  }>;
  isDeleted: boolean; // Đã xóa
  deletedAt?: Date; // Thời gian xóa
  deletedBy?: mongoose.Types.ObjectId; // Người xóa
  metadata: {
    // Thông tin bổ sung
    mentions: Array<{
      // Người được nhắc đến
      user: mongoose.Types.ObjectId; // ID người dùng
      indices: number[]; // Vị trí trong tin nhắn
    }>;
    hashtags: Array<{
      // Hashtags
      tag: string; // Nội dung hashtag
      indices: number[]; // Vị trí trong tin nhắn
    }>;
    links: Array<{
      // Liên kết
      url: string; // URL
      title?: string; // Tiêu đề
      description?: string; // Mô tả
      thumbnail?: string; // Ảnh thu nhỏ
      indices: number[]; // Vị trí trong tin nhắn
    }>;
    language?: string; // Ngôn ngữ
    sentiment?: "positive" | "negative" | "neutral"; // Cảm xúc
    spamScore?: number; // Điểm spam
    encryption: {
      // Mã hóa
      isEncrypted: boolean; // Đã mã hóa
      algorithm?: string; // Thuật toán
      keyId?: string; // ID khóa
    };
  };
  status: "sending" | "sent" | "delivered" | "read" | "failed"; // Trạng thái tin nhắn
  scheduledFor?: Date; // Thời gian gửi theo lịch
  expiresAt?: Date; // Thời gian hết hạn
  isPinned: boolean; // Đã ghim
  pinnedAt?: Date; // Thời gian ghim
  pinnedBy?: mongoose.Types.ObjectId; // Người ghim
}

const MessageSchema: Schema<IMessage> = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "text",
        "image",
        "video",
        "file",
        "audio",
        "voice",
        "location",
        "contact",
        "sticker",
        "gif",
        "poll",
        "system",
        "forwarded",
        "reply",
        "story",
        "live",
        "call",
      ],
      default: "text",
    },
    content: {
      text: {
        type: String,
        trim: true,
      },
      media: {
        url: String,
        thumbnail: String,
        duration: Number,
        size: Number,
        mimeType: String,
        width: Number,
        height: Number,
        caption: String,
        alt: String,
      },
      poll: {
        question: String,
        options: [
          {
            text: String,
            votes: [
              {
                user: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "User",
                },
                votedAt: {
                  type: Date,
                  default: Date.now,
                },
              },
            ],
          },
        ],
        isMultipleChoice: {
          type: Boolean,
          default: false,
        },
        endTime: Date,
        isAnonymous: {
          type: Boolean,
          default: false,
        },
      },
      location: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number],
          required: function () {
            return this.type === "location";
          },
        },
        name: String,
        address: String,
      },
      contact: {
        name: String,
        phone: String,
        email: String,
        avatar: String,
      },
      call: {
        type: {
          type: String,
          enum: ["voice", "video"],
          required: function () {
            return this.type === "call";
          },
        },
        status: {
          type: String,
          enum: ["missed", "answered", "rejected", "busy"],
          required: function () {
            return this.type === "call";
          },
        },
        duration: Number,
        startTime: Date,
        endTime: Date,
      },
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    forwardedFrom: {
      message: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
      conversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
      },
      forwardedAt: {
        type: Date,
        default: Date.now,
      },
    },
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    reactions: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        emoji: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editHistory: [
      {
        content: mongoose.Schema.Types.Mixed,
        editedAt: {
          type: Date,
          default: Date.now,
        },
        editedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    metadata: {
      mentions: [
        {
          user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          indices: [Number],
        },
      ],
      hashtags: [
        {
          tag: String,
          indices: [Number],
        },
      ],
      links: [
        {
          url: String,
          title: String,
          description: String,
          thumbnail: String,
          indices: [Number],
        },
      ],
      language: String,
      sentiment: {
        type: String,
        enum: ["positive", "negative", "neutral"],
      },
      spamScore: Number,
      encryption: {
        isEncrypted: {
          type: Boolean,
          default: false,
        },
        algorithm: String,
        keyId: String,
      },
    },
    status: {
      type: String,
      enum: ["sending", "sent", "delivered", "read", "failed"],
      default: "sending",
    },
    scheduledFor: Date,
    expiresAt: Date,
    isPinned: {
      type: Boolean,
      default: false,
    },
    pinnedAt: Date,
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
MessageSchema.index({ conversation: 1, createdAt: -1 });
MessageSchema.index({ sender: 1, createdAt: -1 });
MessageSchema.index({ "metadata.location": "2dsphere" });
MessageSchema.index({ "content.poll.endTime": 1 });
MessageSchema.index({ scheduledFor: 1 });
MessageSchema.index({ expiresAt: 1 });
MessageSchema.index({ "readBy.user": 1 }, { unique: true, sparse: true });

export const Message = mongoose.model<IMessage>("Message", MessageSchema);
