import express, { Request, Response } from "express";
import multer, { Multer } from "multer";
import { google } from "googleapis";
import fs from "fs";
import path from "path";

// Interface cho file đã upload
interface UploadedFile {
  fileId: string | null | undefined;
  fileName: string | null | undefined;
  webViewLink: string | null | undefined;
  webContentLink: string | null | undefined;
}

// Cấu hình Multer: Lưu file tạm vào thư mục "uploads/"
const upload: Multer = multer({ dest: "uploads/" });

// Load thông tin Google Drive từ môi trường
const CLIENT_EMAIL = process.env.CLIENT_EMAIL;
const PRIVATE_KEY = process.env.PRIVATE_KEY?.replace(/\\n/g, "\n");
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

if (!CLIENT_EMAIL || !PRIVATE_KEY || !DRIVE_FOLDER_ID) {
  throw new Error(
    "Missing Google Drive configuration (CLIENT_EMAIL, PRIVATE_KEY, DRIVE_FOLDER_ID)."
  );
}

// Tạo Google Auth
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: CLIENT_EMAIL,
    private_key: PRIVATE_KEY,
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

// Tạo đối tượng Drive API
const drive = google.drive({ version: "v3", auth });

export const uploadFiles = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ success: false, message: "No files uploaded." });
      return;
    }

    // Mảng chứa thông tin của tất cả các file đã upload
    const uploadedFiles: UploadedFile[] = [];

    for (const file of files) {
      const fileMetadata = {
        name: file.originalname,
        parents: [DRIVE_FOLDER_ID],
      };

      const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path), // Sử dụng stream để upload
      };

      // Upload file lên Google Drive
      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: "id, name, webViewLink, webContentLink",
      });

      // Thêm thông tin file vào mảng
      uploadedFiles.push({
        fileId: response.data.id,
        fileName: response.data.name,
        webViewLink: response.data.webViewLink,
        webContentLink: response.data.webContentLink,
      });

      // Xóa file tạm sau khi upload
      fs.unlinkSync(file.path);
    }

    // Trả về thông tin của tất cả các file đã upload
    res.status(200).json({
      success: true,
      files: uploadedFiles,
    });
  } catch (error: any) {
    console.error("Error uploading files:", error.message || error);
    res
      .status(500)
      .json({ success: false, message: "File upload failed.", error });
  }
};

export const getFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      res.status(400).json({ success: false, message: "File ID is required." });
      return;
    }

    // Lấy thông tin file từ Google Drive
    const file = await drive.files.get({
      fileId: fileId,
      fields: "id, name, mimeType, webViewLink, webContentLink",
    });

    if (!file.data) {
      res.status(404).json({ success: false, message: "File not found." });
      return;
    }

    // Trả về thông tin file
    res.status(200).json({
      success: true,
      file: {
        fileId: file.data.id,
        fileName: file.data.name,
        mimeType: file.data.mimeType,
        webViewLink: file.data.webViewLink,
        webContentLink: file.data.webContentLink,
      },
    });
  } catch (error: any) {
    console.error("Error getting file:", error.message || error);
    res
      .status(500)
      .json({ success: false, message: "Failed to get file.", error });
  }
};
