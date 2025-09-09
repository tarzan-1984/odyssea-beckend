const { io } = require('socket.io-client');

/**
 * Test script to verify WebSocket room isolation
 * This script tests that messages are properly isolated to specific chat rooms
 */

class RoomIsolationTester {
  constructor() {
    this.sockets = [];
    this.baseUrl = 'http://localhost:3000';
  }

  async createSocket(userId, token) {
    const socket = io(`${this.baseUrl}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    return new Promise((resolve, reject) => {
      socket.on('connect', () => {
        console.log(`✅ User ${userId} connected`);
        resolve(socket);
      });

      socket.on('connected', (data) => {
        console.log(`🔐 User ${userId} authenticated as ${data.userId}`);
      });

      socket.on('error', (error) => {
        console.error(`❌ User ${userId} error:`, error.message);
        reject(error);
      });

      // Set timeout for connection
      setTimeout(() => {
        reject(new Error(`Connection timeout for user ${userId}`));
      }, 5000);
    });
  }

  async testRoomIsolation() {
    console.log('🧪 Testing WebSocket Room Isolation...\n');

    try {
      // Create test tokens (you'll need to replace these with real JWT tokens)
      const tokens = [
        'your-jwt-token-1', // User 1
        'your-jwt-token-2', // User 2
        'your-jwt-token-3', // User 3
      ];

      // Create sockets for 3 users
      const user1 = await this.createSocket('user1', tokens[0]);
      const user2 = await this.createSocket('user2', tokens[1]);
      const user3 = await this.createSocket('user3', tokens[2]);

      this.sockets = [user1, user2, user3];

      // Set up message listeners for each user
      this.setupMessageListeners(user1, 'User1');
      this.setupMessageListeners(user2, 'User2');
      this.setupMessageListeners(user3, 'User3');

      // Test 1: Create two separate chat rooms
      console.log('\n📝 Test 1: Creating two separate chat rooms...');
      
      const room1Id = 'test-room-1';
      const room2Id = 'test-room-2';

      // User1 creates room1 with User2
      user1.emit('createChatRoom', {
        name: 'Room 1 - User1 & User2',
        type: 'GROUP',
        participantIds: ['user2']
      });

      await this.sleep(1000);

      // User1 creates room2 with User3
      user1.emit('createChatRoom', {
        name: 'Room 2 - User1 & User3',
        type: 'GROUP',
        participantIds: ['user3']
      });

      await this.sleep(1000);

      // Test 2: Join users to their respective rooms
      console.log('\n🚪 Test 2: Joining users to rooms...');
      
      // User1 joins both rooms
      user1.emit('joinChatRoom', { chatRoomId: room1Id });
      user1.emit('joinChatRoom', { chatRoomId: room2Id });
      
      // User2 joins room1
      user2.emit('joinChatRoom', { chatRoomId: room1Id });
      
      // User3 joins room2
      user3.emit('joinChatRoom', { chatRoomId: room2Id });

      await this.sleep(1000);

      // Test 3: Send messages and verify isolation
      console.log('\n💬 Test 3: Testing message isolation...');
      
      // User1 sends message to room1 (should be received by User1 and User2)
      console.log('📤 User1 sending message to Room1...');
      user1.emit('sendMessage', {
        chatRoomId: room1Id,
        content: 'Hello from User1 to Room1!'
      });

      await this.sleep(1000);

      // User1 sends message to room2 (should be received by User1 and User3)
      console.log('📤 User1 sending message to Room2...');
      user1.emit('sendMessage', {
        chatRoomId: room2Id,
        content: 'Hello from User1 to Room2!'
      });

      await this.sleep(1000);

      // User2 sends message to room1 (should be received by User1 and User2)
      console.log('📤 User2 sending message to Room1...');
      user2.emit('sendMessage', {
        chatRoomId: room1Id,
        content: 'Hello from User2 to Room1!'
      });

      await this.sleep(1000);

      // User3 sends message to room2 (should be received by User1 and User3)
      console.log('📤 User3 sending message to Room2...');
      user3.emit('sendMessage', {
        chatRoomId: room2Id,
        content: 'Hello from User3 to Room2!'
      });

      await this.sleep(1000);

      // Test 4: Test typing indicators isolation
      console.log('\n⌨️ Test 4: Testing typing indicators isolation...');
      
      // User1 types in room1 (should be visible to User2, not User3)
      console.log('⌨️ User1 typing in Room1...');
      user1.emit('typing', {
        chatRoomId: room1Id,
        isTyping: true
      });

      await this.sleep(2000);

      // User1 types in room2 (should be visible to User3, not User2)
      console.log('⌨️ User1 typing in Room2...');
      user1.emit('typing', {
        chatRoomId: room2Id,
        isTyping: true
      });

      await this.sleep(2000);

      // Test 5: Test user presence isolation
      console.log('\n👥 Test 5: Testing user presence isolation...');
      
      // User2 leaves room1
      console.log('👋 User2 leaving Room1...');
      user2.emit('leaveChatRoom', { chatRoomId: room1Id });

      await this.sleep(1000);

      // User1 sends message to room1 (should only be received by User1 now)
      console.log('📤 User1 sending message to Room1 after User2 left...');
      user1.emit('sendMessage', {
        chatRoomId: room1Id,
        content: 'User2 left, only User1 should see this!'
      });

      await this.sleep(1000);

      console.log('\n✅ Room isolation test completed!');
      console.log('\n📊 Expected Results:');
      console.log('- Messages in Room1 should only be visible to User1 and User2');
      console.log('- Messages in Room2 should only be visible to User1 and User3');
      console.log('- Typing indicators should be isolated to their respective rooms');
      console.log('- User presence events should be isolated to their respective rooms');

    } catch (error) {
      console.error('❌ Test failed:', error.message);
    } finally {
      // Clean up
      this.sockets.forEach(socket => {
        socket.disconnect();
      });
      console.log('\n🧹 Cleaned up connections');
    }
  }

  setupMessageListeners(socket, userName) {
    socket.on('newMessage', (data) => {
      console.log(`📨 ${userName} received message in room ${data.chatRoomId}: "${data.message.content}"`);
    });

    socket.on('userTyping', (data) => {
      const status = data.isTyping ? 'is typing' : 'stopped typing';
      console.log(`⌨️ ${userName} sees user ${data.userId} ${status} in room ${data.chatRoomId}`);
    });

    socket.on('userJoined', (data) => {
      console.log(`👤 ${userName} sees user ${data.userId} joined room ${data.chatRoomId}`);
    });

    socket.on('userLeft', (data) => {
      console.log(`👋 ${userName} sees user ${data.userId} left room ${data.chatRoomId}`);
    });

    socket.on('joinedChatRoom', (data) => {
      console.log(`🚪 ${userName} joined room ${data.chatRoomId}`);
    });

    socket.on('leftChatRoom', (data) => {
      console.log(`🚪 ${userName} left room ${data.chatRoomId}`);
    });

    socket.on('error', (error) => {
      console.error(`❌ ${userName} error:`, error.message);
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the test
const tester = new RoomIsolationTester();
tester.testRoomIsolation().catch(console.error);
