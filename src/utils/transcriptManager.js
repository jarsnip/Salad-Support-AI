import fs from 'fs';
import path from 'path';

class TranscriptManager {
  constructor() {
    this.transcriptsDir = path.join(process.cwd(), 'data', 'transcripts');
    this.ensureDirectoryExists();
  }

  ensureDirectoryExists() {
    if (!fs.existsSync(this.transcriptsDir)) {
      fs.mkdirSync(this.transcriptsDir, { recursive: true });
      console.log(`Created transcripts directory: ${this.transcriptsDir}`);
    }
  }

  /**
   * Save a conversation transcript to disk
   * @param {Object} conversation - Conversation object from ConversationManager
   */
  async saveTranscript(conversation) {
    try {
      const transcriptData = {
        threadId: conversation.threadId || 'unknown',
        originalPosterId: conversation.originalPosterId,
        originalPosterUsername: conversation.originalPosterUsername,
        createdAt: conversation.createdAt,
        endedAt: Date.now(),
        messageCount: conversation.messages.length,
        initialMessage: conversation.initialMessage || null, // First user question
        feedback: conversation.feedback || null, // Include feedback data
        messages: conversation.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        }))
      };

      const filename = `${transcriptData.threadId}.json`;
      const filepath = path.join(this.transcriptsDir, filename);

      await fs.promises.writeFile(filepath, JSON.stringify(transcriptData, null, 2));
      console.log(`📝 Saved transcript: ${filename}`);

      return true;
    } catch (error) {
      console.error('Error saving transcript:', error);
      return false;
    }
  }

  /**
   * Get a specific transcript
   * @param {string} threadId - Thread ID
   * @returns {Object|null} Transcript data or null if not found
   */
  getTranscript(threadId) {
    try {
      const filepath = path.join(this.transcriptsDir, `${threadId}.json`);

      if (!fs.existsSync(filepath)) {
        return null;
      }

      const data = fs.readFileSync(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error reading transcript ${threadId}:`, error);
      return null;
    }
  }

  /**
   * List all transcripts with pagination
   * @param {number} limit - Number of transcripts to return
   * @param {number} offset - Offset for pagination
   * @returns {Array} Array of transcript summaries
   */
  listTranscripts(limit = 20, offset = 0) {
    try {
      const files = fs.readdirSync(this.transcriptsDir)
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const filepath = path.join(this.transcriptsDir, file);
          const stats = fs.statSync(filepath);
          const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));

          return {
            threadId: data.threadId,
            username: data.originalPosterUsername || 'Unknown',
            userId: data.originalPosterId,
            messageCount: data.messageCount,
            createdAt: data.createdAt,
            endedAt: data.endedAt,
            fileSize: stats.size,
            modifiedAt: stats.mtime.getTime()
          };
        })
        .sort((a, b) => b.endedAt - a.endedAt); // Sort by end time, newest first

      const total = files.length;
      const transcripts = files.slice(offset, offset + limit);

      return {
        transcripts,
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      };
    } catch (error) {
      console.error('Error listing transcripts:', error);
      return {
        transcripts: [],
        total: 0,
        limit,
        offset,
        hasMore: false
      };
    }
  }

  /**
   * Delete a transcript
   * @param {string} threadId - Thread ID
   * @returns {boolean} Success status
   */
  deleteTranscript(threadId) {
    try {
      const filepath = path.join(this.transcriptsDir, `${threadId}.json`);

      if (!fs.existsSync(filepath)) {
        return false;
      }

      fs.unlinkSync(filepath);
      console.log(`🗑️  Deleted transcript: ${threadId}`);
      return true;
    } catch (error) {
      console.error(`Error deleting transcript ${threadId}:`, error);
      return false;
    }
  }

  /**
   * Search transcripts by username or content
   * @param {string} query - Search query
   * @param {number} limit - Results limit
   * @returns {Array} Matching transcripts
   */
  searchTranscripts(query, limit = 20) {
    try {
      const files = fs.readdirSync(this.transcriptsDir)
        .filter(file => file.endsWith('.json'));

      const matches = [];

      for (const file of files) {
        if (matches.length >= limit) break;

        const filepath = path.join(this.transcriptsDir, file);
        const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));

        // Search in username, userId, or message content
        const searchText = `${data.originalPosterUsername} ${data.originalPosterId} ${data.messages.map(m => m.content).join(' ')}`.toLowerCase();

        if (searchText.includes(query.toLowerCase())) {
          matches.push({
            threadId: data.threadId,
            username: data.originalPosterUsername || 'Unknown',
            userId: data.originalPosterId,
            messageCount: data.messageCount,
            createdAt: data.createdAt,
            endedAt: data.endedAt
          });
        }
      }

      return matches.sort((a, b) => b.endedAt - a.endedAt);
    } catch (error) {
      console.error('Error searching transcripts:', error);
      return [];
    }
  }

  /**
   * Get statistics about transcripts
   * @returns {Object} Stats object
   */
  getStats() {
    try {
      const files = fs.readdirSync(this.transcriptsDir)
        .filter(file => file.endsWith('.json'));

      let totalMessages = 0;
      let totalSize = 0;

      files.forEach(file => {
        const filepath = path.join(this.transcriptsDir, file);
        const stats = fs.statSync(filepath);
        const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));

        totalMessages += data.messageCount;
        totalSize += stats.size;
      });

      return {
        totalTranscripts: files.length,
        totalMessages,
        totalSize,
        avgMessagesPerTranscript: files.length > 0 ? Math.round(totalMessages / files.length) : 0
      };
    } catch (error) {
      console.error('Error getting transcript stats:', error);
      return {
        totalTranscripts: 0,
        totalMessages: 0,
        totalSize: 0,
        avgMessagesPerTranscript: 0
      };
    }
  }
}

export default TranscriptManager;
