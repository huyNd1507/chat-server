import express from "express";
import { verifyToken } from "../middleware/verifyToken";
import { MessageController } from "../controllers/message.controller";

const router = express.Router();
const messageController = new MessageController();

/**
 * @swagger
 * /api/messages/conversation/{conversationId}:
 *   get:
 *     tags:
 *       - Messages
 *     summary: Get messages from a conversation
 *     description: Retrieve a paginated list of messages from a specific conversation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the conversation
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of messages per page
 *     responses:
 *       200:
 *         description: List of messages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       conversation:
 *                         type: string
 *                       sender:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           username:
 *                             type: string
 *                           avatar:
 *                             type: string
 *                       type:
 *                         type: string
 *                         enum: [text, image, file]
 *                       content:
 *                         type: string
 *                       readBy:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             user:
 *                               type: string
 *                             readAt:
 *                               type: string
 *                               format: date-time
 *                       reactions:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             user:
 *                               type: string
 *                             emoji:
 *                               type: string
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *                       isEdited:
 *                         type: boolean
 *                       isDeleted:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
router.get(
  "/conversation/:conversationId",
  verifyToken,
  messageController.getMessages
);

/**
 * @swagger
 * /api/messages:
 *   post:
 *     tags:
 *       - Messages
 *     summary: Send a new message
 *     description: Create and send a new message in a conversation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - conversationId
 *               - content
 *             properties:
 *               conversationId:
 *                 type: string
 *                 description: ID of the conversation
 *               content:
 *                 type: string
 *                 description: Message content
 *               type:
 *                 type: string
 *                 enum: [text, image, file]
 *                 default: text
 *                 description: Type of message
 *     responses:
 *       201:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 conversation:
 *                   type: string
 *                 sender:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     avatar:
 *                       type: string
 *                 type:
 *                   type: string
 *                 content:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
router.post("/", verifyToken, messageController.sendMessage);

/**
 * @swagger
 * /api/messages/{messageId}/read:
 *   put:
 *     tags:
 *       - Messages
 *     summary: Mark message as read
 *     description: Mark a specific message as read by the current user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the message
 *     responses:
 *       200:
 *         description: Message marked as read successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Message marked as read
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Message not found
 *       500:
 *         description: Server error
 */
router.put("/:messageId/read", verifyToken, messageController.markAsRead);

/**
 * @swagger
 * /api/messages/{messageId}:
 *   delete:
 *     tags:
 *       - Messages
 *     summary: Delete a message
 *     description: Soft delete a message (only the sender can delete)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the message
 *     responses:
 *       200:
 *         description: Message deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Message deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to delete this message
 *       404:
 *         description: Message not found
 *       500:
 *         description: Server error
 */
router.delete("/:messageId", verifyToken, messageController.deleteMessage);

/**
 * @swagger
 * /api/messages/{messageId}:
 *   put:
 *     tags:
 *       - Messages
 *     summary: Edit a message
 *     description: Edit the content of a message (only the sender can edit)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the message
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: New message content
 *     responses:
 *       200:
 *         description: Message edited successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 content:
 *                   type: string
 *                 isEdited:
 *                   type: boolean
 *                 editHistory:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       content:
 *                         type: string
 *                       editedAt:
 *                         type: string
 *                         format: date-time
 *                       editedBy:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to edit this message
 *       404:
 *         description: Message not found
 *       500:
 *         description: Server error
 */
router.put("/:messageId", verifyToken, messageController.editMessage);

/**
 * @swagger
 * /api/messages/{messageId}/reactions:
 *   post:
 *     tags:
 *       - Messages
 *     summary: Add reaction to message
 *     description: Add or update a reaction to a message
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the message
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - emoji
 *             properties:
 *               emoji:
 *                 type: string
 *                 description: Emoji reaction
 *     responses:
 *       200:
 *         description: Reaction added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 reactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user:
 *                         type: string
 *                       emoji:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Message not found
 *       500:
 *         description: Server error
 */
router.post(
  "/:messageId/reactions",
  verifyToken,
  messageController.addReaction
);

/**
 * @swagger
 * /api/messages/{messageId}/reactions/{reactionId}:
 *   delete:
 *     tags:
 *       - Messages
 *     summary: Remove reaction from message
 *     description: Remove a reaction from a message
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the message
 *       - in: path
 *         name: reactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the reaction
 *     responses:
 *       200:
 *         description: Reaction removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 reactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user:
 *                         type: string
 *                       emoji:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Message or reaction not found
 *       500:
 *         description: Server error
 */
router.delete(
  "/:messageId/reactions/:reactionId",
  verifyToken,
  messageController.removeReaction
);

/**
 * @swagger
 * /api/messages/mark-multiple-read:
 *   post:
 *     tags:
 *       - Messages
 *     summary: Mark multiple messages as read
 *     description: Mark multiple messages as read by the current user in a single operation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageIds
 *               - conversationId
 *             properties:
 *               messageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of message IDs to mark as read
 *               conversationId:
 *                 type: string
 *                 description: ID of the conversation containing the messages
 *     responses:
 *       200:
 *         description: Messages marked as read successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Messages marked as read
 *                 count:
 *                   type: integer
 *                   description: Number of messages marked as read
 *                 messageIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: IDs of messages that were marked as read
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation not found or user not a participant
 *       500:
 *         description: Server error
 */
router.post(
  "/mark-multiple-read",
  verifyToken,
  messageController.markMultipleAsRead
);

export default router;
