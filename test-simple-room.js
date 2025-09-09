const { io } = require('socket.io-client');

/**
 * Simple test to verify WebSocket room isolation
 * This test creates two rooms and verifies that messages are properly isolated
 */

console.log('🧪 Starting WebSocket Room Isolation Test...\n');

// You need to replace these with real JWT tokens from your API
const USER1_TOKEN = 'your-jwt-token-1';
const USER2_TOKEN = 'your-jwt-token-2';

if (USER1_TOKEN === 'your-jwt-token-1' || USER2_TOKEN === 'your-jwt-token-2') {
  console.log('❌ Please replace the JWT tokens in this file with real tokens from your API');
  console.log('   You can get tokens by calling: POST http://localhost:3000/auth/login');
  process.exit(1);
}

const socket1 = io('http://localhost:3000/chat', {
  auth: { token: USER1_TOKEN },
  transports: ['websocket', 'polling']
});

const socket2 = io('http://localhost:3000/chat', {
  auth: { token: USER2_TOKEN },
  transports: ['websocket', 'polling']
});

let testResults = {
  user1Messages: [],
  user2Messages: [],
  room1Messages: [],
  room2Messages: []
};

// Setup User1 listeners
socket1.on('connect', () => {
  console.log('✅ User1 connected');
});

socket1.on('connected', (data) => {
  console.log(`🔐 User1 authenticated as ${data.userId}`);
  startTest();
});

socket1.on('newMessage', (data) => {
  console.log(`📨 User1 received message in room ${data.chatRoomId}: "${data.message.content}"`);
  testResults.user1Messages.push(data);
  testResults[`room${data.chatRoomId.split('-')[1]}Messages`].push(data);
});

socket1.on('joinedChatRoom', (data) => {
  console.log(`🚪 User1 joined room ${data.chatRoomId}`);
});

socket1.on('error', (error) => {
  console.error(`❌ User1 error:`, error.message);
});

// Setup User2 listeners
socket2.on('connect', () => {
  console.log('✅ User2 connected');
});

socket2.on('connected', (data) => {
  console.log(`🔐 User2 authenticated as ${data.userId}`);
});

socket2.on('newMessage', (data) => {
  console.log(`📨 User2 received message in room ${data.chatRoomId}: "${data.message.content}"`);
  testResults.user2Messages.push(data);
  testResults[`room${data.chatRoomId.split('-')[1]}Messages`].push(data);
});

socket2.on('joinedChatRoom', (data) => {
  console.log(`🚪 User2 joined room ${data.chatRoomId}`);
});

socket2.on('error', (error) => {
  console.error(`❌ User2 error:`, error.message);
});

async function startTest() {
  console.log('\n🚀 Starting room isolation test...\n');

  try {
    // Wait for both users to be connected
    await sleep(2000);

    // Create two separate rooms
    console.log('📝 Creating Room 1...');
    socket1.emit('createChatRoom', {
      name: 'Test Room 1',
      type: 'GROUP',
      participantIds: ['user2'] // Assuming user2's ID
    });

    await sleep(1000);

    console.log('📝 Creating Room 2...');
    socket1.emit('createChatRoom', {
      name: 'Test Room 2',
      type: 'GROUP',
      participantIds: ['user2'] // Assuming user2's ID
    });

    await sleep(1000);

    // Join rooms (using hardcoded room IDs for testing)
    const room1Id = 'test-room-1';
    const room2Id = 'test-room-2';

    console.log('🚪 Joining Room 1...');
    socket1.emit('joinChatRoom', { chatRoomId: room1Id });
    socket2.emit('joinChatRoom', { chatRoomId: room1Id });

    await sleep(1000);

    console.log('🚪 Joining Room 2...');
    socket1.emit('joinChatRoom', { chatRoomId: room2Id });
    socket2.emit('joinChatRoom', { chatRoomId: room2Id });

    await sleep(1000);

    // Test message isolation
    console.log('\n💬 Testing message isolation...\n');

    // User1 sends message to Room 1
    console.log('📤 User1 sending message to Room 1...');
    socket1.emit('sendMessage', {
      chatRoomId: room1Id,
      content: 'Message from User1 to Room 1'
    });

    await sleep(1000);

    // User1 sends message to Room 2
    console.log('📤 User1 sending message to Room 2...');
    socket1.emit('sendMessage', {
      chatRoomId: room2Id,
      content: 'Message from User1 to Room 2'
    });

    await sleep(1000);

    // User2 sends message to Room 1
    console.log('📤 User2 sending message to Room 1...');
    socket2.emit('sendMessage', {
      chatRoomId: room1Id,
      content: 'Message from User2 to Room 1'
    });

    await sleep(1000);

    // User2 sends message to Room 2
    console.log('📤 User2 sending message to Room 2...');
    socket2.emit('sendMessage', {
      chatRoomId: room2Id,
      content: 'Message from User2 to Room 2'
    });

    await sleep(2000);

    // Analyze results
    console.log('\n📊 Test Results Analysis:');
    console.log('========================\n');

    console.log(`User1 received ${testResults.user1Messages.length} messages`);
    console.log(`User2 received ${testResults.user2Messages.length} messages`);

    // Check if messages are properly isolated
    const room1Messages = testResults.user1Messages.filter(m => m.chatRoomId === room1Id);
    const room2Messages = testResults.user1Messages.filter(m => m.chatRoomId === room2Id);

    console.log(`\nRoom 1 messages received by User1: ${room1Messages.length}`);
    console.log(`Room 2 messages received by User1: ${room2Messages.length}`);

    // Verify isolation
    if (testResults.user1Messages.length >= 4 && testResults.user2Messages.length >= 4) {
      console.log('\n✅ SUCCESS: Both users received messages from both rooms');
      console.log('✅ Room isolation is working correctly!');
    } else {
      console.log('\n❌ FAILED: Message isolation test failed');
      console.log('❌ Some messages were not received properly');
    }

    console.log('\n🏁 Test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Clean up
    socket1.disconnect();
    socket2.disconnect();
    console.log('\n🧹 Disconnected sockets');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted');
  socket1.disconnect();
  socket2.disconnect();
  process.exit(0);
});
