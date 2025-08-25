# Chat Module Documentation

## Overview

The Chat Module provides real-time messaging functionality for communication between drivers and managers in the Odyssea system. It supports both direct chats between two users and group chats, with file attachment capabilities.

## Features

### Core Functionality
- **Real-time messaging** via WebSocket connections
- **Direct chats** between two users (e.g., driver ↔ manager)
- **Group chats** for multiple participants
- **File attachments** with support for multiple cloud storage providers
- **Message search** within chat rooms
- **Read receipts** and delivery confirmations
- **Typing indicators** to show when users are composing messages
- **Unread message counts** across all chat rooms

### User Management
- **Role-based access** (DRIVER, FLEET_MANAGER, etc.)
- **User search** to find chat participants
- **Online/offline status** tracking
- **Chat room archiving** (soft delete)

### File Management
- **Multiple storage providers**: Google Drive, AWS S3, Azure Blob, Local
- **File validation** (type, size, format)
- **Secure file uploads** with authentication
- **File metadata** tracking (name, size, MIME type)

## Architecture

### Components

1. **ChatRoomsService** - Manages chat room creation, participants, and access control
2. **MessagesService** - Handles message CRUD operations and business logic
3. **ChatGateway** - WebSocket gateway for real-time communication
4. **FileUploadService** - Manages file uploads to various storage providers
5. **Controllers** - REST API endpoints for chat operations

### Database Models

- **ChatRoom** - Chat room information and metadata
- **ChatRoomParticipant** - Users participating in chat rooms
- **Message** - Individual messages with file attachments
- **User** - User information and roles

## API Endpoints

### Chat Rooms

#### Create Chat Room
```
POST /chat-rooms
```
Creates a new chat room and adds participants.

**Request Body:**
```json
{
  "name": "Optional chat room name",
  "type": "DIRECT|GROUP|LOAD",
  "loadId": "Optional load ID for load-related chats",
  "participantIds": ["user1", "user2"]
}
```

#### Get User Chat Rooms
```
GET /chat-rooms
```
Retrieves all chat rooms for the authenticated user with last message and unread count.

#### Get Specific Chat Room
```
GET /chat-rooms/:id
```
Retrieves a specific chat room with all messages and participants.

#### Archive Chat Room
```
PUT /chat-rooms/:id/archive
```
Archives (soft deletes) a chat room.

#### Add Participants
```
POST /chat-rooms/:id/participants
```
Adds new participants to an existing chat room.

#### Search Users
```
GET /chat-rooms/search/users?query=john&role=DRIVER
```
Searches for users to start a chat with.

### Messages

#### Send Message
```
POST /messages
```
Sends a text message to a chat room.

**Request Body:**
```json
{
  "chatRoomId": "chat_room_123",
  "content": "Hello! How is the delivery going?",
  "fileUrl": "https://drive.google.com/file/123",
  "fileName": "delivery_photo.jpg",
  "fileSize": 1024000
}
```

#### Upload File
```
POST /messages/upload
```
Uploads a file that can be attached to a message.

**Form Data:**
- `file`: The file to upload

#### Get Chat Room Messages
```
GET /messages/chat-room/:chatRoomId?page=1&limit=50
```
Retrieves messages for a specific chat room with pagination.

#### Search Messages
```
GET /messages/search/:chatRoomId?query=delivery&page=1&limit=20
```
Searches for specific text in chat room messages.

#### Get Message Statistics
```
GET /messages/stats/:chatRoomId
```
Retrieves statistics about messages in a chat room.

#### Get Unread Count
```
GET /messages/unread/count
```
Gets total count of unread messages for the authenticated user.

#### Mark Message as Read
```
PUT /messages/:id/read
```
Marks a specific message as read.

#### Delete Message
```
DELETE /messages/:id
```
Deletes a message (only by sender).

## WebSocket Events

### Client to Server

#### Join Chat Room
```javascript
socket.emit('joinChatRoom', { chatRoomId: 'chat_room_123' });
```

#### Leave Chat Room
```javascript
socket.emit('leaveChatRoom', { chatRoomId: 'chat_room_123' });
```

#### Typing Indicator
```javascript
socket.emit('typing', { chatRoomId: 'chat_room_123', isTyping: true });
```

#### Message Delivery Confirmation
```javascript
socket.emit('messageDelivered', { messageId: 'message_123', chatRoomId: 'chat_room_123' });
```

#### Message Read Confirmation
```javascript
socket.emit('messageRead', { messageId: 'message_123', chatRoomId: 'chat_room_123' });
```

### Server to Client

#### Connection Confirmation
```javascript
socket.on('connected', (data) => {
  console.log('Connected:', data);
  // data: { userId, userRole, chatRooms }
});
```

#### New Message
```javascript
socket.on('newMessage', (data) => {
  console.log('New message:', data);
  // data: { chatRoomId, message }
});
```

#### User Typing
```javascript
socket.on('userTyping', (data) => {
  console.log('User typing:', data);
  // data: { userId, chatRoomId, isTyping }
});
```

#### Chat Updated
```javascript
socket.on('chatUpdated', (data) => {
  console.log('Chat updated:', data);
  // data: { chatRoomId }
});
```

## Configuration

### Environment Variables

```bash
# File Upload Configuration
FILE_UPLOAD_PROVIDER=google-drive|aws-s3|azure-blob|local
MAX_FILE_SIZE=10485760  # 10MB in bytes
ALLOWED_FILE_TYPES=image/*,application/pdf,text/*

# Google Drive (if using)
GOOGLE_DRIVE_API_KEY=your_api_key
GOOGLE_DRIVE_FOLDER_ID=your_folder_id

# AWS S3 (if using)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your_bucket_name

# Azure Blob Storage (if using)
AZURE_STORAGE_CONNECTION_STRING=your_connection_string
AZURE_STORAGE_CONTAINER_NAME=your_container_name

# Local Storage (if using)
UPLOAD_PATH=./uploads
BASE_URL=http://localhost:3000

# Frontend URL for CORS
FRONTEND_URL=http://localhost:3000
```

## Usage Examples

### Frontend Integration

#### Connect to WebSocket
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/chat', {
  auth: {
    token: 'your_jwt_token'
  }
});

socket.on('connect', () => {
  console.log('Connected to chat server');
});
```

#### Send Message
```javascript
// First upload file if needed
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const uploadResponse = await fetch('/messages/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const fileData = await uploadResponse.json();

// Then send message with file
const messageResponse = await fetch('/messages', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    chatRoomId: 'chat_room_123',
    content: 'Check out this delivery photo!',
    fileUrl: fileData.url,
    fileName: fileData.fileName,
    fileSize: fileData.fileSize
  })
});
```

#### Create Chat Room
```javascript
const chatRoomResponse = await fetch('/chat-rooms', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'DIRECT',
    participantIds: ['user_123', 'user_456']
  })
});
```

## Security

### Authentication
- All API endpoints require JWT authentication
- WebSocket connections are authenticated using JWT tokens
- Users can only access chat rooms they participate in

### File Upload Security
- File type validation prevents malicious uploads
- File size limits prevent abuse
- Secure file storage with access controls

### Rate Limiting
- API endpoints are protected by rate limiting
- WebSocket connections have connection limits

## Performance Considerations

### Database Optimization
- Messages are paginated to prevent large data transfers
- Indexes on frequently queried fields (chatRoomId, senderId, createdAt)
- Soft deletes for chat rooms to preserve data

### WebSocket Optimization
- Users are automatically joined to their chat rooms on connection
- Messages are broadcast only to relevant participants
- Connection pooling and cleanup on disconnect

### File Storage
- Files are stored in cloud storage for scalability
- CDN integration for fast file delivery
- Automatic cleanup of orphaned files

## Monitoring and Analytics

### Message Statistics
- Total message counts per chat room
- Daily and weekly message activity
- File attachment usage statistics

### User Activity
- Online user counts
- Chat room participation metrics
- Message read rates

### System Health
- WebSocket connection counts
- File upload success rates
- API response times

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Check JWT token validity
   - Verify CORS configuration
   - Check network connectivity

2. **File Upload Failed**
   - Verify file size and type
   - Check storage provider configuration
   - Ensure proper authentication

3. **Messages Not Delivered**
   - Check WebSocket connection status
   - Verify user is participant in chat room
   - Check message validation

### Debug Mode
Enable debug logging by setting environment variable:
```bash
DEBUG=chat:*
```

## Future Enhancements

### Planned Features
- **Message encryption** for sensitive communications
- **Voice messages** and video calls
- **Message reactions** and emojis
- **Advanced search** with filters and date ranges
- **Message templates** for common responses
- **Automated notifications** for important messages
- **Chat bot integration** for automated responses
- **Message translation** for multi-language support

### Scalability Improvements
- **Redis clustering** for WebSocket session management
- **Message queuing** for high-volume scenarios
- **Database sharding** for large message volumes
- **CDN integration** for global file delivery
