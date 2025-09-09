import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';

@Injectable()
export class ChatRoomsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new chat room and add participants
   * This method handles both direct chats between two users and group chats
   */
  async createChatRoom(createChatRoomDto: CreateChatRoomDto, creatorId: string) {
    const { name, type, loadId, participantIds } = createChatRoomDto;

    // Validate that creator is included in participants
    if (!participantIds.includes(creatorId)) {
      participantIds.push(creatorId);
    }

    // For direct chats, ensure only 2 participants
    if (type === 'DIRECT' && participantIds.length !== 2) {
      throw new BadRequestException('Direct chats must have exactly 2 participants');
    }

    // Check if direct chat already exists between these users
    if (type === 'DIRECT') {
      const existingDirectChat = await this.findDirectChat(participantIds[0], participantIds[1]);
      if (existingDirectChat) {
        return existingDirectChat;
      }
    }

          // Create chat room and participants in a transaction
      return await this.prisma.$transaction(async (prisma) => {
        const defaultName = name || await this.generateDefaultName(type, participantIds);
        const chatRoom = await prisma.chatRoom.create({
          data: {
            name: defaultName,
            type,
            loadId,
          },
        });

      // Add all participants
      const participants = await Promise.all(
        participantIds.map((userId) =>
          prisma.chatRoomParticipant.create({
            data: {
              chatRoomId: chatRoom.id,
              userId,
            },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                  profilePhoto: true,
                },
              },
            },
          })
        )
      );

      return {
        ...chatRoom,
        participants,
      };
    });
  }

  /**
   * Find a direct chat between two specific users
   * Used to prevent creating duplicate direct chats
   */
  private async findDirectChat(userId1: string, userId2: string) {
    const chatRoom = await this.prisma.chatRoom.findFirst({
      where: {
        type: 'DIRECT',
        participants: {
          every: {
            userId: {
              in: [userId1, userId2],
            },
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                profilePhoto: true,
              },
            },
          },
        },
      },
    });

    return chatRoom;
  }

  /**
   * Generate default name for chat rooms based on type and participants
   */
  private async generateDefaultName(type: string, participantIds: string[]): Promise<string> {
    if (type === 'DIRECT') {
      const users = await this.prisma.user.findMany({
        where: { id: { in: participantIds } },
        select: { firstName: true, lastName: true },
      });
      return `${users[0].firstName} ${users[0].lastName} & ${users[1].firstName} ${users[1].lastName}`;
    }
    return `Chat Room ${new Date().toLocaleDateString()}`;
  }

  /**
   * Get all chat rooms for a specific user
   * Returns chat rooms with last message and unread count
   */
  async getUserChatRooms(userId: string) {
    const chatRooms = await this.prisma.chatRoom.findMany({
      where: {
        participants: {
          some: {
            userId,
          },
        },
        isArchived: false,
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                profilePhoto: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        _count: {
          select: {
            messages: {
              where: {
                AND: [
                  { receiverId: userId },
                  { isRead: false },
                ],
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return chatRooms.map((room) => ({
      ...room,
      lastMessage: room.messages[0] || null,
      unreadCount: room._count.messages,
    }));
  }

  /**
   * Get a specific chat room with its messages and participants
   */
  async getChatRoom(chatRoomId: string, userId: string) {
    // Verify user is participant
    const participant = await this.prisma.chatRoomParticipant.findUnique({
      where: {
        chatRoomId_userId: {
          chatRoomId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Chat room not found or access denied');
    }

    const chatRoom = await this.prisma.chatRoom.findUnique({
      where: { id: chatRoomId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                profilePhoto: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profilePhoto: true,
              },
            },
          },
        },
      },
    });

    if (!chatRoom) {
      throw new NotFoundException('Chat room not found');
    }

    return chatRoom;
  }

  /**
   * Archive a chat room (soft delete)
   */
  async archiveChatRoom(chatRoomId: string, userId: string) {
    // Verify user is participant
    const participant = await this.prisma.chatRoomParticipant.findUnique({
      where: {
        chatRoomId_userId: {
          chatRoomId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Chat room not found or access denied');
    }

    return await this.prisma.chatRoom.update({
      where: { id: chatRoomId },
      data: { isArchived: true },
    });
  }

  /**
   * Add new participants to an existing chat room
   */
  async addParticipants(chatRoomId: string, participantIds: string[], userId: string) {
    // Verify user is participant and can add others
    const participant = await this.prisma.chatRoomParticipant.findUnique({
      where: {
        chatRoomId_userId: {
          chatRoomId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Chat room not found or access denied');
    }

    // Add new participants
    const newParticipants = await Promise.all(
      participantIds.map((participantId) =>
        this.prisma.chatRoomParticipant.create({
          data: {
            chatRoomId,
            userId: participantId,
          },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                profilePhoto: true,
              },
            },
          },
        })
      )
    );

    return newParticipants;
  }

  /**
   * Update chat room information
   * Allows updating name and archive status
   */
  async updateChatRoom(chatRoomId: string, updates: { name?: string; isArchived?: boolean }, userId: string) {
    // Verify user is participant
    const participant = await this.prisma.chatRoomParticipant.findUnique({
      where: {
        chatRoomId_userId: {
          chatRoomId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Chat room not found or access denied');
    }

    // Update chat room
    const updatedChatRoom = await this.prisma.chatRoom.update({
      where: { id: chatRoomId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                profilePhoto: true,
              },
            },
          },
        },
      },
    });

    return updatedChatRoom;
  }

  /**
   * Remove participant from chat room
   */
  async removeParticipant(chatRoomId: string, participantId: string, userId: string) {
    // Verify user is participant and can remove others
    const participant = await this.prisma.chatRoomParticipant.findUnique({
      where: {
        chatRoomId_userId: {
          chatRoomId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Chat room not found or access denied');
    }

    // Remove participant
    await this.prisma.chatRoomParticipant.delete({
      where: {
        chatRoomId_userId: {
          chatRoomId,
          userId: participantId,
        },
      },
    });

    return { success: true, removedUserId: participantId };
  }

  /**
   * Get chat room participants
   */
  async getChatRoomParticipants(chatRoomId: string, userId: string) {
    // Verify user is participant
    const participant = await this.prisma.chatRoomParticipant.findUnique({
      where: {
        chatRoomId_userId: {
          chatRoomId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Chat room not found or access denied');
    }

    // Get all participants
    const participants = await this.prisma.chatRoomParticipant.findMany({
      where: { chatRoomId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            profilePhoto: true,
          },
        },
      },
    });

    return participants;
  }
}
