import { io, Socket } from 'socket.io-client';

/**
 * WebSocket Test Client
 * This script demonstrates how to use the WebSocket API for chat functionality
 */

interface TestUser {
  id: string;
  name: string;
  token: string;
  socket: Socket;
}

class WebSocketTester {
  private users: TestUser[] = [];
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Create a test user and connect to WebSocket
   */
  async createUser(id: string, name: string, token: string): Promise<TestUser> {
    const socket = io(`${this.baseUrl}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    const user: TestUser = {
      id,
      name,
      token,
      socket
    };

    // Set up event listeners
    this.setupUserListeners(user);

    // Wait for connection
    await new Promise((resolve) => {
      socket.on('connected', (data) => {
        console.log(`✅ ${name} connected:`, data);
        resolve(data);
      });
    });

    this.users.push(user);
    return user;
  }

  /**
   * Set up event listeners for a user
   */
  private setupUserListeners(user: TestUser) {
    const { socket, name } = user;

    // Connection events
    socket.on('connected', (data) => {
      console.log(`🔗 ${name} connected to chat gateway`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ ${name} disconnected`);
    });

    // Chat room events
    socket.on('joinedChatRoom', (data) => {
      console.log(`📝 ${name} joined room:`, data.chatRoomId);
    });

    socket.on('leftChatRoom', (data) => {
      console.log(`👋 ${name} left room:`, data.chatRoomId);
    });

    socket.on('chatRoomCreated', (data) => {
      console.log(`🏠 ${name} created room:`, data.id, data.name);
    });

    socket.on('chatRoomUpdated', (data) => {
      console.log(`✏️ ${name} updated room:`, data.chatRoomId);
    });

    socket.on('participantsAdded', (data) => {
      console.log(`➕ ${name} added participants to room:`, data.chatRoomId);
    });

    socket.on('participantRemoved', (data) => {
      console.log(`➖ ${name} removed participant from room:`, data.chatRoomId);
    });

    // Message events
    socket.on('newMessage', (data) => {
      console.log(`💬 ${name} received message in room ${data.chatRoomId}:`, data.message.content);
    });

    socket.on('messageSent', (data) => {
      console.log(`📤 ${name} sent message:`, data.messageId);
    });

    socket.on('messageRead', (data) => {
      console.log(`👁️ ${name} read message:`, data.messageId);
    });

    // Typing events
    socket.on('userTyping', (data) => {
      const status = data.isTyping ? 'typing' : 'stopped typing';
      console.log(`⌨️ User ${data.userId} ${status} in room ${data.chatRoomId}`);
    });

    // User presence events
    socket.on('userJoined', (data) => {
      console.log(`👤 User ${data.userId} joined room ${data.chatRoomId}`);
    });

    socket.on('userLeft', (data) => {
      console.log(`👤 User ${data.userId} left room ${data.chatRoomId}`);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error(`❌ ${name} error:`, error.message);
    });
  }

  /**
   * Test creating a chat room
   */
  async testCreateChatRoom(creator: TestUser, roomName: string, participantIds: string[]) {
    console.log(`\n🏠 Testing chat room creation by ${creator.name}...`);
    
    creator.socket.emit('createChatRoom', {
      name: roomName,
      type: 'GROUP',
      participantIds
    });

    // Wait a bit for the event to be processed
    await this.sleep(1000);
  }

  /**
   * Test joining a chat room
   */
  async testJoinChatRoom(user: TestUser, chatRoomId: string) {
    console.log(`\n📝 Testing join chat room by ${user.name}...`);
    
    user.socket.emit('joinChatRoom', {
      chatRoomId
    });

    await this.sleep(500);
  }

  /**
   * Test sending a message
   */
  async testSendMessage(user: TestUser, chatRoomId: string, content: string) {
    console.log(`\n💬 Testing send message by ${user.name}...`);
    
    user.socket.emit('sendMessage', {
      chatRoomId,
      content
    });

    await this.sleep(500);
  }

  /**
   * Test typing indicators
   */
  async testTypingIndicators(user: TestUser, chatRoomId: string) {
    console.log(`\n⌨️ Testing typing indicators by ${user.name}...`);
    
    // Start typing
    user.socket.emit('typing', {
      chatRoomId,
      isTyping: true
    });

    await this.sleep(2000);

    // Stop typing
    user.socket.emit('typing', {
      chatRoomId,
      isTyping: false
    });

    await this.sleep(500);
  }

  /**
   * Test adding participants
   */
  async testAddParticipants(user: TestUser, chatRoomId: string, participantIds: string[]) {
    console.log(`\n➕ Testing add participants by ${user.name}...`);
    
    user.socket.emit('addParticipants', {
      chatRoomId,
      participantIds
    });

    await this.sleep(1000);
  }

  /**
   * Test removing a participant
   */
  async testRemoveParticipant(user: TestUser, chatRoomId: string, participantId: string) {
    console.log(`\n➖ Testing remove participant by ${user.name}...`);
    
    user.socket.emit('removeParticipant', {
      chatRoomId,
      participantId
    });

    await this.sleep(1000);
  }

  /**
   * Run a comprehensive test scenario
   */
  async runTestScenario() {
    console.log('🚀 Starting WebSocket Chat Test Scenario...\n');

    try {
      // Create test users (you'll need to provide real JWT tokens)
      const user1 = await this.createUser('user1', 'John Driver', 'your-jwt-token-1');
      const user2 = await this.createUser('user2', 'Jane Dispatcher', 'your-jwt-token-2');
      const user3 = await this.createUser('user3', 'Bob Manager', 'your-jwt-token-3');

      // Test 1: Create a chat room
      await this.testCreateChatRoom(user1, 'Test Load Discussion', [user2.id, user3.id]);
      const chatRoomId = 'test-room-123'; // You'll get this from the response

      // Test 2: Join chat room
      await this.testJoinChatRoom(user1, chatRoomId);
      await this.testJoinChatRoom(user2, chatRoomId);
      await this.testJoinChatRoom(user3, chatRoomId);

      // Test 3: Send messages
      await this.testSendMessage(user1, chatRoomId, 'Hello team! How is the delivery going?');
      await this.testSendMessage(user2, chatRoomId, 'Everything looks good on our end!');
      await this.testSendMessage(user3, chatRoomId, 'Great! Keep me updated.');

      // Test 4: Typing indicators
      await this.testTypingIndicators(user1, chatRoomId);

      // Test 5: Add participants
      const user4 = await this.createUser('user4', 'Alice Support', 'your-jwt-token-4');
      await this.testAddParticipants(user1, chatRoomId, [user4.id]);

      // Test 6: Send more messages
      await this.testSendMessage(user4, chatRoomId, 'Hi everyone! I\'m here to help.');

      // Test 7: Remove participant
      await this.testRemoveParticipant(user1, chatRoomId, user4.id);

      // Test 8: Leave chat room
      user1.socket.emit('leaveChatRoom', { chatRoomId });
      user2.socket.emit('leaveChatRoom', { chatRoomId });
      user3.socket.emit('leaveChatRoom', { chatRoomId });

      console.log('\n✅ Test scenario completed successfully!');

    } catch (error) {
      console.error('❌ Test scenario failed:', error);
    } finally {
      // Clean up connections
      this.users.forEach(user => {
        user.socket.disconnect();
      });
    }
  }

  /**
   * Test individual functionality
   */
  async testIndividualFeatures() {
    console.log('🧪 Testing individual WebSocket features...\n');

    const user1 = await this.createUser('user1', 'Test User', 'your-jwt-token');

    // Test message delivery confirmation
    user1.socket.emit('messageDelivered', {
      messageId: 'test-message-123',
      chatRoomId: 'test-room-123'
    });

    // Test message read confirmation
    user1.socket.emit('messageRead', {
      messageId: 'test-message-123',
      chatRoomId: 'test-room-123'
    });

    await this.sleep(1000);
    user1.socket.disconnect();
  }

  /**
   * Utility method to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get online users count
   */
  getOnlineUsersCount(): number {
    return this.users.length;
  }

  /**
   * Disconnect all users
   */
  disconnectAll() {
    this.users.forEach(user => {
      user.socket.disconnect();
    });
    this.users = [];
  }
}

// Example usage
async function main() {
  const tester = new WebSocketTester('http://localhost:3000');

  // Run the test scenario
  await tester.runTestScenario();

  // Or test individual features
  // await tester.testIndividualFeatures();

  console.log(`\n📊 Total online users: ${tester.getOnlineUsersCount()}`);
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { WebSocketTester };
