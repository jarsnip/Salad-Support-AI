class MessageQueue {
  constructor(processingFunction, concurrentLimit = 3) {
    this.queue = [];
    this.processing = new Set();
    this.processingFunction = processingFunction;
    this.concurrentLimit = concurrentLimit;
  }

  async add(item) {
    const existingIndex = this.queue.findIndex(q => q.threadId === item.threadId);

    if (existingIndex !== -1) {
      console.log(`Thread ${item.threadId} already in queue, skipping duplicate`);
      return;
    }

    if (Array.from(this.processing).some(p => p.threadId === item.threadId)) {
      console.log(`Thread ${item.threadId} currently processing, skipping duplicate`);
      return;
    }

    this.queue.push({
      ...item,
      addedAt: Date.now()
    });

    console.log(`Added to queue: Thread ${item.threadId} (Queue size: ${this.queue.length})`);

    this.processQueue();
  }

  async processQueue() {
    while (this.queue.length > 0 && this.processing.size < this.concurrentLimit) {
      const item = this.queue.shift();

      this.processing.add(item);

      this.processItem(item).finally(() => {
        this.processing.delete(item);
        this.processQueue();
      });
    }
  }

  async processItem(item) {
    try {
      const waitTime = Date.now() - item.addedAt;
      if (waitTime > 1000) {
        console.log(`Processing item after ${waitTime}ms wait: Thread ${item.threadId}`);
      }

      await this.processingFunction(item);
    } catch (error) {
      console.error('Error processing queue item:', error);
    }
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      processing: this.processing.size,
      capacity: this.concurrentLimit
    };
  }

  clear() {
    this.queue = [];
  }
}

export default MessageQueue;
