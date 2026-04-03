import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

const DEFAULT_USER_ID = 'JDtFR7FZmGNpmCTkhugfNftpNQl2';

export const memoryTools: Tool[] = [
  {
    name: 'get_coach_memories',
    description: '讀取所有教練記憶（傷病、偏好、目標、觀察紀錄等）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        category: {
          type: 'string',
          description: '篩選類別（可選）: medical|preference|goal|observation',
        },
      },
      required: [],
    },
  },
  {
    name: 'write_coach_memory',
    description: '寫入一條新的教練記憶（key-value 式，永久保存在 Firebase）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        key: {
          type: 'string',
          description: '記憶的唯一識別 key（例如 "injury_shoulder", "preference_cardio"）',
        },
        value: {
          type: 'string',
          description: '記憶內容（詳細描述）',
        },
        category: {
          type: 'string',
          description: '類別: medical|preference|goal|observation',
        },
      },
      required: ['key', 'value', 'category'],
    },
  },
  {
    name: 'delete_coach_memory',
    description: '刪除一條教練記憶（by key 或 document ID）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        memoryId: {
          type: 'string',
          description: '記憶的 document ID（從 get_coach_memories 取得）',
        },
      },
      required: ['memoryId'],
    },
  },
];

export async function handleMemoryTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const userId = (args.userId as string) || DEFAULT_USER_ID;

  switch (name) {
    case 'get_coach_memories':
      return handleGetCoachMemories(userId, args);

    case 'write_coach_memory':
      return handleWriteCoachMemory(userId, args);

    case 'delete_coach_memory':
      return handleDeleteCoachMemory(userId, args);

    default:
      throw new Error(`Unknown memory tool: ${name}`);
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleGetCoachMemories(
  userId: string,
  args: Record<string, unknown>
): Promise<string> {
  const category = args.category as string | undefined;

  const collectionRef = db.collection('users').doc(userId).collection('coachMemories');
  let query: FirebaseFirestore.Query = collectionRef.orderBy('updatedAt', 'desc');

  if (category) {
    query = collectionRef.where('category', '==', category).orderBy('updatedAt', 'desc');
  }

  const snapshot = await query.get();

  const memories = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return JSON.stringify({
    total: memories.length,
    category: category ?? 'all',
    memories,
  });
}

async function handleWriteCoachMemory(
  userId: string,
  args: Record<string, unknown>
): Promise<string> {
  const key = args.key as string;
  const value = args.value as string;
  const category = args.category as string;

  const collectionRef = db.collection('users').doc(userId).collection('coachMemories');

  // Check if a memory with the same key already exists
  const existing = await collectionRef.where('key', '==', key).limit(1).get();

  const now = Date.now();
  const memoryData = {
    key,
    value,
    category,
    updatedAt: now,
  };

  let docId: string;
  let action: string;

  if (!existing.empty) {
    // Update existing
    docId = existing.docs[0].id;
    await collectionRef.doc(docId).update({
      ...memoryData,
      updatedAt: FieldValue.serverTimestamp(),
    });
    action = 'updated';
  } else {
    // Create new
    const docRef = await collectionRef.add({
      ...memoryData,
      createdAt: now,
      updatedAt: now,
    });
    docId = docRef.id;
    action = 'created';
  }

  return JSON.stringify({
    success: true,
    action,
    memoryId: docId,
    key,
    category,
    value,
    message: `記憶已${action === 'created' ? '建立' : '更新'}：[${category}] ${key}`,
  });
}

async function handleDeleteCoachMemory(
  userId: string,
  args: Record<string, unknown>
): Promise<string> {
  const memoryId = args.memoryId as string;

  const docRef = db.collection('users').doc(userId).collection('coachMemories').doc(memoryId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return JSON.stringify({ success: false, message: `找不到記憶 ID：${memoryId}` });
  }

  const data = doc.data();
  await docRef.delete();

  return JSON.stringify({
    success: true,
    message: `已刪除記憶：${data?.key ?? memoryId}`,
    deleted: { id: memoryId, key: data?.key, category: data?.category },
  });
}
