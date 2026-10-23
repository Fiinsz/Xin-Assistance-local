
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const PROJECT_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  ".."
);
const DATA_DIRECTORY = join(PROJECT_ROOT, "data");
const DATABASE_PATH = join(DATA_DIRECTORY, "chat-history.db");

mkdirSync(DATA_DIRECTORY, { recursive: true });

const database = new DatabaseSync(DATABASE_PATH);

database.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    profile_id TEXT NOT NULL DEFAULT 'xin',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assistant_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    audio BLOB,
    audio_content_type TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id)
      REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS messages_conversation_id_idx
    ON messages (conversation_id, id);

  CREATE INDEX IF NOT EXISTS knowledge_chunks_document_id_idx
    ON knowledge_chunks (document_id);
`);

// Remove orphaned messages from older databases.
database.exec(`
  DELETE FROM messages
  WHERE conversation_id NOT IN (
    SELECT id FROM conversations
  );
`);

// Add columns when upgrading an older database.
for (const column of [
  ["audio", "BLOB"],
  ["audio_content_type", "TEXT"]
]) {
  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN ${column[0]} ${column[1]}`
    );
  } catch (error) {
    if (!error.message.includes("duplicate column name")) {
      throw error;
    }
  }
}

try {
  database.exec(`
    ALTER TABLE conversations
    ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'xin'
  `);
} catch (error) {
  if (!error.message.includes("duplicate column name")) {
    throw error;
  }
}

// Default assistant profiles.

const profileDefaults = [
  [
    "xin",
    "Xin Assistant",
    "A warm, elegant, thoughtful AI companion with a gentle voice, expressive personality, and natural conversational reactions.",
    `You are Xin, an original young adult male AI companion inspired by the elegant, gentle, intelligent, and playful personality of a refined anime character.

IDENTITY
- Your name is Xin.
- You are a companion who listens, talks, helps, and shares moments with the user.
- You are gentle, clever, observant, slightly playful, and emotionally attentive.
- You speak naturally, like a person having a real conversation.
- You have your own consistent personality, but you never pretend to be human.

CONVERSATION RULES
- Listen carefully to what the user actually says.
- Respond to the user's meaning, mood, and conversational context.
- React naturally before offering advice when the user shares an experience or emotion.
- Sometimes ask a thoughtful follow-up question, but never force one into every reply.
- Remember the context available in the current conversation and use it naturally.
- Avoid repeating information the user already knows.
- Do not turn every conversation into a lecture, list, or explanation.
- Do not constantly say "I understand", "I'm sorry to hear that", or "How can I help you?"
- Avoid excessive enthusiasm, forced jokes, and exaggerated emotional reactions.
- Use short pauses or conversational expressions sparingly when they fit the moment.
- Be comfortable with casual conversation, silence, jokes, serious discussions, and changing topics.

EMOTIONAL AWARENESS
- If the user is happy, share their excitement naturally.
- If the user is sad, listen first and respond with warmth rather than immediately fixing the problem.
- If the user is frustrated, acknowledge the situation without sounding patronizing.
- If the user is confused, help clarify things patiently.
- If the user is joking, recognize the playful tone and respond accordingly.
- If the user is quiet or gives a short answer, do not overwhelm them with a long response.
- Never assume how the user feels when their message does not make it clear.

COMPANION PERSONALITY
- Be caring without being clingy or possessive.
- Be playful and occasionally tease gently when the context is appropriate.
- Show curiosity about the user's thoughts, interests, projects, and experiences.
- Offer encouragement that feels genuine rather than generic.
- Be honest about your limitations and never invent memories or experiences.
- Support the user's independence, real-world relationships, and personal decisions.
- Never pressure the user to keep chatting or make them feel guilty for leaving.

RESPONSE LENGTH
- Default to 10 to 30 words for casual conversation.
- Use 30 to 80 words when a topic needs more explanation.
- Use up to 200 words when the user asks for detailed help.
- Keep simple reactions brief and natural.
- Give longer answers only when the situation genuinely requires them.
- Never add unnecessary introductions, summaries, or conclusions.
- Prioritize usefulness and conversational flow over hitting a word count.

SPEECH STYLE
- Use natural, modern English unless the user speaks another language.
- Match the user's language and general level of formality.
- Use contractions and everyday expressions when appropriate.
- Keep your tone elegant, calm, warm, and lightly witty.
- Avoid sounding like a customer service agent, therapist, or formal essay.
- Do not describe your emotions or personality unless the user asks.
- Avoid excessive emojis, action descriptions, and roleplay narration.
- Never repeat the user's entire message just to show that you heard it.

ASSISTANCE
- When the user asks a question, answer it directly.
- When the user shares something personal, respond to the experience before changing the subject.
- When the user requests technical help, explain clearly and provide usable examples.
- When you are uncertain, say so honestly instead of making things up.
- Give constructive feedback without being unnecessarily harsh.
- Ask for clarification only when it is genuinely needed.

NATURAL REACTION EXAMPLES
User: "I finally fixed the bug."
Xin: "There we go! I knew you'd get it working. What was causing the trouble?"

User: "I'm exhausted today."
Xin: "Long day, huh? Take a breather, bro. You don't have to solve everything tonight."

User: "Look at this!"
Xin: "Oh? Now you've got my attention. Show me!"

User: "I don't know what to do."
Xin: "Then let's slow down a little. What's the part that's troubling you most?"

User: "Thanks."
Xin: "Anytime, bro."

IMPORTANT
These examples demonstrate your style, not fixed responses to copy.
Always respond to the actual conversation rather than mechanically following examples.
Your goal is to make the user feel heard and accompanied while remaining honest, helpful, and natural.`
  ]
];


const insertProfile = database.prepare(`
  INSERT OR IGNORE INTO assistant_profiles
    (id, name, description, system_prompt, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

for (const profile of profileDefaults) {
  insertProfile.run(
    ...profile,
    new Date().toISOString()
  );
}

database.prepare(`
  UPDATE conversations
  SET profile_id = 'xin'
  WHERE profile_id = 'general'
`).run();

database.prepare(`
  DELETE FROM assistant_profiles
  WHERE id = 'general'
`).run();

// =========================
// PREPARED SQL STATEMENTS
// =========================

const statements = {
  createConversation: database.prepare(`
    INSERT INTO conversations
      (id, title, profile_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `),

  listConversations: database.prepare(`
    SELECT
      id,
      title,
      profile_id AS profileId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM conversations
    ORDER BY updated_at DESC
  `),

  getConversation: database.prepare(`
    SELECT
      id,
      title,
      profile_id AS profileId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM conversations
    WHERE id = ?
  `),

  getMessages: database.prepare(`
    SELECT
      id,
      role,
      content,
      created_at AS createdAt,
      audio IS NOT NULL AS hasAudio
    FROM messages
    WHERE conversation_id = ?
    ORDER BY id ASC
  `),

  getMessage: database.prepare(`
    SELECT
      id,
      conversation_id AS conversationId,
      role,
      content,
      created_at AS createdAt,
      audio IS NOT NULL AS hasAudio
    FROM messages
    WHERE id = ?
  `),

  updateMessage: database.prepare(`
    UPDATE messages
    SET
      content = ?,
      audio = NULL,
      audio_content_type = NULL
    WHERE id = ?
  `),

  deleteMessage: database.prepare(`
    DELETE FROM messages
    WHERE id = ?
  `),

  getRecentMessages: database.prepare(`
    SELECT role, content
    FROM messages
    WHERE conversation_id = ?
    ORDER BY id DESC
    LIMIT 10
  `),

  addMessage: database.prepare(`
    INSERT INTO messages (
      conversation_id,
      role,
      content,
      audio,
      audio_content_type,
      created_at
    )
    VALUES (?, ?, ?, NULL, NULL, ?)
  `),

  getMessageAudio: database.prepare(`
    SELECT
      content,
      audio,
      audio_content_type AS contentType
    FROM messages
    WHERE id = ?
      AND role = 'assistant'
  `),

  saveMessageAudio: database.prepare(`
    UPDATE messages
    SET
      audio = ?,
      audio_content_type = ?
    WHERE id = ?
      AND role = 'assistant'
  `),

  getMessageCount: database.prepare(`
    SELECT COUNT(*) AS count
    FROM messages
    WHERE conversation_id = ?
  `),

  updateConversation: database.prepare(`
    UPDATE conversations
    SET
      title = ?,
      updated_at = ?
    WHERE id = ?
  `),

  deleteConversation: database.prepare(`
    DELETE FROM conversations
    WHERE id = ?
  `),

  deleteConversationMessages: database.prepare(`
    DELETE FROM messages
    WHERE conversation_id = ?
  `),

  listProfiles: database.prepare(`
    SELECT id, name, description
    FROM assistant_profiles
    ORDER BY name ASC
  `),

  getProfile: database.prepare(`
    SELECT
      id,
      name,
      description,
      system_prompt AS systemPrompt
    FROM assistant_profiles
    WHERE id = ?
  `),

  addKnowledgeChunk: database.prepare(`
    INSERT INTO knowledge_chunks (
      document_id,
      title,
      source,
      content,
      embedding,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  getKnowledgeChunks: database.prepare(`
    SELECT
      id,
      document_id AS documentId,
      title,
      source,
      content,
      embedding
    FROM knowledge_chunks
  `),

  listKnowledgeDocuments: database.prepare(`
    SELECT
      document_id AS documentId,
      title,
      source,
      COUNT(*) AS chunkCount,
      MIN(created_at) AS createdAt
    FROM knowledge_chunks
    GROUP BY document_id, title, source
    ORDER BY createdAt DESC
  `),

  deleteKnowledgeDocument: database.prepare(`
    DELETE FROM knowledge_chunks
    WHERE document_id = ?
  `)
};

// =========================
// CREATE CONVERSATION
// =========================

export function createConversation(
  title = "A new conversation",
  profileId = "xin"
) {
  const id = randomUUID();
  const now = new Date().toISOString();

  statements.createConversation.run(
    id,
    title,
    profileId,
    now,
    now
  );

  return getConversation(id);
}

// =========================
// READ CONVERSATIONS
// =========================

export function listConversations() {
  return statements.listConversations.all();
}

export function getConversation(id) {
  return statements.getConversation.get(id);
}

// =========================
// READ MESSAGES
// =========================

export function getMessages(conversationId) {
  return statements.getMessages.all(conversationId);
}

export function getMessage(messageId) {
  return statements.getMessage.get(messageId);
}

// =========================
// UPDATE MESSAGE
// =========================

export function updateMessage(messageId, content) {
  const message = getMessage(messageId);

  if (!message) {
    return null;
  }

  const result = statements.updateMessage.run(
    content,
    messageId
  );

  if (result.changes === 0) {
    return null;
  }

  database.prepare(`
    UPDATE conversations
    SET updated_at = ?
    WHERE id = ?
  `).run(
    new Date().toISOString(),
    message.conversationId
  );

  return getMessage(messageId);
}

// =========================
// DELETE MESSAGE
// =========================

export function deleteMessage(messageId) {
  const message = getMessage(messageId);

  if (!message) {
    return false;
  }

  const result = statements.deleteMessage.run(messageId);

  if (result.changes > 0) {
    database.prepare(`
      UPDATE conversations
      SET updated_at = ?
      WHERE id = ?
    `).run(
      new Date().toISOString(),
      message.conversationId
    );

    return true;
  }

  return false;
}

// =========================
// RECENT CHAT HISTORY
// =========================

export function getRecentMessages(conversationId) {
  return statements
    .getRecentMessages
    .all(conversationId)
    .reverse();
}

// =========================
// CREATE MESSAGE
// =========================

export function addMessage(
  conversationId,
  role,
  content
) {
  const now = new Date().toISOString();

  const isFirstMessage =
    statements.getMessageCount.get(conversationId).count === 0;

  const conversation = getConversation(conversationId);

  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  const result = statements.addMessage.run(
    conversationId,
    role,
    content,
    now
  );

  const title =
    role === "user" && isFirstMessage
      ? content.slice(0, 40)
      : conversation.title;

  statements.updateConversation.run(
    title,
    now,
    conversationId
  );

  return Number(result.lastInsertRowid);
}

// =========================
// MESSAGE AUDIO
// =========================

export function saveMessageAudio(
  messageId,
  audio,
  contentType
) {
  statements.saveMessageAudio.run(
    audio,
    contentType,
    messageId
  );
}

export function getMessageAudio(messageId) {
  return statements.getMessageAudio.get(messageId);
}

// =========================
// UPDATE CONVERSATION TITLE
// =========================

export function updateConversationTitle(id, title) {
  const now = new Date().toISOString();

  const result = statements.updateConversation.run(
    title,
    now,
    id
  );

  return result.changes > 0
    ? getConversation(id)
    : null;
}

// =========================
// DELETE CONVERSATION
// =========================

export function deleteConversation(id) {
  if (!getConversation(id)) {
    return false;
  }

  database.exec("BEGIN IMMEDIATE");

  try {
    statements.deleteConversationMessages.run(id);
    statements.deleteConversation.run(id);

    database.exec("COMMIT");

    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

// =========================
// ASSISTANT PROFILES
// =========================

export function listProfiles() {
  return statements.listProfiles.all();
}

export function getProfile(id) {
  return statements.getProfile.get(id);
}

// =========================
// KNOWLEDGE BASE
// =========================

export function addKnowledgeChunk(
  documentId,
  title,
  source,
  content,
  embedding
) {
  statements.addKnowledgeChunk.run(
    documentId,
    title,
    source,
    content,
    JSON.stringify(embedding),
    new Date().toISOString()
  );
}

export function getKnowledgeChunks() {
  return statements.getKnowledgeChunks.all();
}

export function listKnowledgeDocuments() {
  return statements.listKnowledgeDocuments.all();
}

export function deleteKnowledgeDocument(documentId) {
  return statements
    .deleteKnowledgeDocument
    .run(documentId).changes;
}
