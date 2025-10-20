# Load Chat Creation API

## Overview

Special endpoint for creating LOAD chats with external participants from TMS system.

## Endpoint

```
POST /v1/create_load_chat
```

**Note:** This endpoint does NOT require JWT authentication (designed for server-to-server communication).

## Request Body

```json
{
  "load_id": "string",
  "title": "string",
  "participants": [
    {
      "id": "string",
      "role": "string"
    }
  ]
}
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `load_id` | string | Yes | External load ID from TMS system |
| `title` | string | Yes | Chat title (e.g., "Load #12345 Discussion") |
| `participants` | array | Yes | Array of participants with their external IDs and roles |
| `participants[].id` | string | Yes | External ID of the participant (matches `externalId` in users table) |
| `participants[].role` | string | Yes | Role of the participant (case-insensitive, must include at least one DRIVER) |

### Example Request

```json
{
  "load_id": "load_12345",
  "title": "Load #12345 Discussion",
  "participants": [
    {
      "id": "ext_driver_001",
      "role": "DRIVER"
    },
    {
      "id": "ext_dispatcher_042",
      "role": "DISPATCHER"
    },
    {
      "id": "ext_manager_015",
      "role": "MANAGER"
    }
  ]
}
```

## Processing Logic

### Step 1: Driver Verification

1. **Find driver participant**: Looks for participant with `role === 'DRIVER'`
2. **Verify driver exists**: Queries database for user with matching `externalId`
3. **Check driver status**: Ensures driver has `status === 'ACTIVE'`

**Failure conditions:**
- No driver in participants list → `400 Bad Request`
- Driver not found in database → `400 Bad Request`
- Driver status is not ACTIVE → `400 Bad Request`

### Step 2: Participant Validation

For each participant (except driver):
1. Query database by `externalId`
2. If user exists → add to chat
3. If user doesn't exist → skip (no error)

### Step 3: Auto-add Admin Users

Automatically adds all users with roles:
- `ADMINISTRATOR`
- `BILLING`

**Special handling:**
- These users are added with `isHidden: true` in `chat_room_participants` table
- They can see and access the chat, but it doesn't appear in their default chat list

### Step 4: Chat Creation

Creates chat room with:
- `type`: `'LOAD'`
- `name`: Value from `title` parameter
- `loadId`: Value from `load_id` parameter
- `avatar`: `null`
- `adminId`: `null` (no admin for LOAD chats)

### Step 5: WebSocket Notification

Emits `chatRoomCreated` event to all participants via WebSocket:
- Event name: `chatRoomCreated`
- Room: `user:{userId}` for each participant
- Payload: Complete chat room object with participants

## Response

### Success (201 Created)

```json
{
  "id": "chat_room_xyz",
  "name": "Load #12345 Discussion",
  "type": "LOAD",
  "loadId": "load_12345",
  "avatar": null,
  "isArchived": false,
  "adminId": null,
  "createdAt": "2025-10-19T18:00:00.000Z",
  "updatedAt": "2025-10-19T18:00:00.000Z",
  "participants": [
    {
      "id": "participant_1",
      "userId": "driver_user_id",
      "chatRoomId": "chat_room_xyz",
      "joinedAt": "2025-10-19T18:00:00.000Z",
      "isHidden": false,
      "user": {
        "id": "driver_user_id",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com",
        "role": "DRIVER",
        "profilePhoto": null
      }
    },
    {
      "id": "participant_2",
      "userId": "dispatcher_user_id",
      "chatRoomId": "chat_room_xyz",
      "joinedAt": "2025-10-19T18:00:00.000Z",
      "isHidden": false,
      "user": {
        "id": "dispatcher_user_id",
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane@example.com",
        "role": "DISPATCHER",
        "profilePhoto": null
      }
    },
    {
      "id": "participant_3",
      "userId": "admin_user_id",
      "chatRoomId": "chat_room_xyz",
      "joinedAt": "2025-10-19T18:00:00.000Z",
      "isHidden": true,
      "user": {
        "id": "admin_user_id",
        "firstName": "Admin",
        "lastName": "User",
        "email": "admin@example.com",
        "role": "ADMINISTRATOR",
        "profilePhoto": null
      }
    }
  ]
}
```

### Error Responses

#### 400 Bad Request - Missing Driver

```json
{
  "statusCode": 400,
  "message": "Driver participant is required",
  "error": "Bad Request"
}
```

#### 400 Bad Request - Driver Not Found

```json
{
  "statusCode": 400,
  "message": "Driver with external ID ext_driver_001 not found",
  "error": "Bad Request"
}
```

#### 400 Bad Request - Driver Inactive

```json
{
  "statusCode": 400,
  "message": "Driver with external ID ext_driver_001 is not active",
  "error": "Bad Request"
}
```

## Integration Example

### From TMS System

```typescript
async function createLoadChat(loadData: LoadData) {
    const response = await fetch('https://api.example.com/v1/create_load_chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            load_id: loadData.id,
            title: `Load #${loadData.number}`,
            participants: [
                { id: loadData.driverId, role: 'DRIVER' },
                { id: loadData.dispatcherId, role: 'DISPATCHER' },
                ...loadData.additionalParticipants
            ]
        })
    });

    if (!response.ok) {
        throw new Error('Failed to create load chat');
    }

    const chatRoom = await response.json();
    return chatRoom;
}
```

## Database Schema

### Tables Affected

#### `chat_rooms`
```sql
INSERT INTO chat_rooms (id, name, type, loadId, avatar, adminId, isArchived, createdAt, updatedAt)
VALUES (
    'generated_id',
    'Load #12345 Discussion',
    'LOAD',
    'load_12345',
    NULL,
    NULL,
    FALSE,
    NOW(),
    NOW()
);
```

#### `chat_room_participants`
```sql
-- Regular participant
INSERT INTO chat_room_participants (id, chatRoomId, userId, joinedAt, isHidden)
VALUES ('generated_id', 'chat_room_id', 'user_id', NOW(), FALSE);

-- Hidden participant (ADMINISTRATOR/BILLING)
INSERT INTO chat_room_participants (id, chatRoomId, userId, joinedAt, isHidden)
VALUES ('generated_id', 'chat_room_id', 'admin_user_id', NOW(), TRUE);
```

## Frontend Integration

### WebSocket Listener

```typescript
socket.on('chatRoomCreated', (chatRoom) => {
    console.log('New chat room created:', chatRoom);
    
    // Add to chat list
    if (!chatRoom.participants.find(p => p.isHidden && p.userId === currentUserId)) {
        addChatToList(chatRoom);
    }
});
```

### Query Load Chats

```typescript
async function getLoadChats(loadId: string) {
    const response = await fetch(`/api/chat-rooms?loadId=${loadId}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    const chatRooms = await response.json();
    return chatRooms;
}
```

## Notes

1. **Hidden Participants**: ADMINISTRATOR and BILLING users are added automatically but hidden from default chat lists
2. **No Admin**: LOAD chats don't have an admin (unlike GROUP chats)
3. **External IDs**: All participant IDs in the request should be external IDs from TMS system
4. **Status Validation**: Only checks driver status, other participants are added regardless of status
5. **WebSocket**: Real-time updates ensure all participants see the new chat immediately
6. **No Authentication**: This endpoint is designed for server-to-server communication

## Testing

```bash
curl -X POST http://localhost:3001/v1/create_load_chat \
  -H "Content-Type: application/json" \
  -d '{
    "load_id": "test_load_123",
    "title": "Test Load Chat",
    "participants": [
      {"id": "ext_driver_1", "role": "DRIVER"},
      {"id": "ext_dispatcher_1", "role": "DISPATCHER"}
    ]
  }'
```
