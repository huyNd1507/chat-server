import express, { Request, Response, NextFunction } from "express";
import { IUser, UserModel } from "../models/users.models";
import * as argon2 from "argon2";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import passport from "passport";
import rateLimit from "express-rate-limit";

declare global {
  namespace Express {
    interface User extends IUser {}
  }
}

const JWT_SECRET = env.PASSJWT;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
});

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { username, email, fullname, password } = req.body;

    if (!username || !email || !password || !fullname) {
      res.status(400).json({
        success: false,
        message: "Missing required parameters!",
      });
      return;
    }

    // Kiểm tra username và email đã tồn tại
    const existingUser = await UserModel.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      res.status(400).json({
        success: false,
        message:
          existingUser.email === email
            ? "Email đã tồn tại"
            : "Username đã tồn tại",
      });
      return;
    }

    // Validate username
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      res.status(400).json({
        success: false,
        message:
          "Username phải từ 3-20 ký tự, chỉ bao gồm chữ cái, số và dấu gạch dưới",
      });
      return;
    }

    // Validate password
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      res.status(400).json({
        success: false,
        message:
          "Password phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt",
      });
      return;
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        message: "Email không hợp lệ",
      });
      return;
    }

    const hashPassword = await argon2.hash(password);

    const newUser = new UserModel({
      username,
      fullname,
      email,
      password: hashPassword,
      avatar:
        "https://res.cloudinary.com/dkbothcn5/image/upload/v1727074201/images.jpg",
      status: "offline",
      lastSeen: new Date(),
      privacy: {
        lastSeen: "everyone",
        profilePhoto: "everyone",
        status: "everyone",
      },
      settings: {
        notifications: {
          messages: true,
          groups: true,
          calls: true,
          mentions: true,
        },
        theme: "system",
        language: "en",
        fontSize: 16,
        messagePreview: true,
        enterToSend: true,
        mediaAutoDownload: true,
      },
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: "Đăng ký thành công!",
      data: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        fullname: newUser.fullname,
        avatar: newUser.avatar,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password }: { email?: string; password?: string } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Missing parameters!",
      });
      return;
    }

    const findUser = await UserModel.findOne({ email });
    if (!findUser) {
      res.status(400).json({
        success: false,
        message: "Người dùng không tồn tại",
      });
      return;
    }

    if (!findUser.password) {
      res.status(400).json({
        success: false,
        message: "Password not set for this user!",
      });
      return;
    }

    const checkPass = await argon2.verify(findUser.password, password);
    if (!checkPass) {
      res.status(400).json({
        success: false,
        message: "Mật khẩu không đúng!",
      });
      return;
    }

    // Cập nhật trạng thái người dùng
    findUser.status = "online";
    findUser.lastSeen = new Date();
    await findUser.save();

    const token = jwt.sign(
      {
        userId: findUser._id,
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    const refreshToken = jwt.sign({ userId: findUser._id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 12 * 60 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userInfo = {
      id: findUser._id,
      username: findUser.username,
      email: findUser.email,
      fullname: findUser.fullname,
      avatar: findUser.avatar,
      status: findUser.status,
      lastSeen: findUser.lastSeen,
      settings: findUser.settings,
      privacy: findUser.privacy,
    };

    res.status(200).json({
      success: true,
      message: "Login success!",
      data: userInfo,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Internal server error!",
    });
  }
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies.token;

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập!",
      });
      return;
    }

    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const userId = decoded.userId;
      const isAdmin = decoded.role === "admin";

      if (!isAdmin && userId) {
        // Cập nhật trạng thái người dùng khi logout (chỉ cho user thường)
        await UserModel.findByIdAndUpdate(userId, {
          status: "offline",
          lastSeen: new Date(),
        });
      }

      // Xóa cookies với các options bảo mật
      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "strict" as const,
        path: "/",
        domain: env.COOKIE_DOMAIN || undefined,
      };

      // Xóa token và refreshToken
      res.clearCookie("token", cookieOptions);
      res.clearCookie("refreshToken", cookieOptions);

      // Nếu là admin, thêm thông tin vào response
      if (isAdmin) {
        res.status(200).json({
          success: true,
          message: "Đăng xuất admin thành công!",
          data: {
            role: "admin",
            logoutTime: new Date().toISOString(),
          },
        });
      } else {
        res.status(200).json({
          success: true,
          message: "Đăng xuất thành công!",
          data: {
            logoutTime: new Date().toISOString(),
          },
        });
      }
    } catch (jwtError) {
      // Token không hợp lệ hoặc hết hạn, vẫn cho phép logout
      console.log("Token invalid or expired during logout");

      // Xóa cookies ngay cả khi token không hợp lệ
      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "strict" as const,
        path: "/",
        domain: env.COOKIE_DOMAIN || undefined,
      };

      res.clearCookie("token", cookieOptions);
      res.clearCookie("refreshToken", cookieOptions);

      res.status(200).json({
        success: true,
        message: "Đăng xuất thành công!",
        data: {
          logoutTime: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ!",
    });
  }
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies.token;

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
      return;
    }

    const decoded: any = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const user = await UserModel.findById(userId).select("-password");

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found.",
      });
      return;
    }

    const userInfo = {
      id: user._id,
      username: user.username,
      email: user.email,
      fullname: user.fullname,
      avatar: user.avatar,
      coverPhoto: user.coverPhoto,
      status: user.status,
      lastSeen: user.lastSeen,
      bio: user.bio,
      phoneNumber: user.phoneNumber,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      contacts: user.contacts,
      privacy: user.privacy,
      settings: user.settings,
      socialLinks: user.socialLinks,
      badges: user.badges,
    };

    res.status(200).json({
      success: true,
      message: "Successfully!",
      data: userInfo,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Internal server error!",
    });
  }
};

export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.params.id;
    const updateData = req.body;

    // Không cho phép cập nhật một số trường nhạy cảm
    delete updateData.password;
    delete updateData.email;
    delete updateData.username;
    delete updateData.googleId;
    delete updateData.isDeleted;
    delete updateData.deletedAt;

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        message: "User không tồn tại!",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Cập nhật thành công!",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ!",
    });
  }
};

export const googleAuth = passport.authenticate("google", {
  scope: ["profile", "email"],
});

export const googleAuthCallback = [
  (req: Request, res: Response, next: NextFunction) => {
    console.log("Callback hit!");
    next();
  },
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req: Request, res: Response) => {
    const user = req.user as IUser;

    const token = jwt.sign({ userId: user._id }, env.PASSJWT as string, {
      expiresIn: "12h",
    });
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 12 * 60 * 60 * 1000,
    });
    const redirectUrl = env.FRONT_END_URL as string;
    res.redirect(redirectUrl);
  },
];

export const adminLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { username, password }: { username?: string; password?: string } =
      req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ thông tin đăng nhập!",
      });
      return;
    }

    // Kiểm tra thông tin đăng nhập admin cố định
    const ADMIN_USERNAME = env.ADMIN_USERNAME || "admin";
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "12345678";

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      res.status(401).json({
        success: false,
        message: "Thông tin đăng nhập không chính xác!",
      });
      return;
    }

    // Tạo token cho admin với thời gian ngắn hơn
    const token = jwt.sign(
      {
        userId: "admin",
        role: "admin",
        loginTime: new Date().toISOString(),
      },
      JWT_SECRET,
      { expiresIn: "4h" } // Giảm thời gian token xuống 4 giờ
    );

    const refreshToken = jwt.sign(
      {
        userId: "admin",
        role: "admin",
        loginTime: new Date().toISOString(),
      },
      JWT_SECRET,
      { expiresIn: "1d" } // Giảm thời gian refresh token xuống 1 ngày
    );

    // Set cookies với các options bảo mật cao hơn
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict", // Thay đổi từ 'none' sang 'strict' để tăng bảo mật
      maxAge: 4 * 60 * 60 * 1000, // 4 giờ
      path: "/",
      domain: env.COOKIE_DOMAIN || undefined,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 ngày
      path: "/",
      domain: env.COOKIE_DOMAIN || undefined,
    });

    // Trả về thông tin admin
    res.status(200).json({
      success: true,
      message: "Đăng nhập admin thành công!",
      data: {
        id: "admin",
        username: ADMIN_USERNAME,
        role: "admin",
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ!",
    });
  }
};
