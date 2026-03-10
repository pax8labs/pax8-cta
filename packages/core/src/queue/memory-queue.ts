/**
 * Copyright 2024 Pax8 Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * In-memory job queue for simple single-process deployments
 *
 * This provides a Redis-free alternative for:
 * - Local development
 * - Single-instance deployments
 * - Serverless environments (Vercel, Netlify)
 *
 * Limitations:
 * - Jobs are lost on restart
 * - No persistence
 * - No multi-process scaling
 * - For production with multiple instances, use Redis
 */

import { coreLogger } from "../services/logger.js";

const logger = coreLogger;

export type JobStatus = "pending" | "active" | "completed" | "failed";

export interface MemoryJob<T = unknown, R = unknown> {
  id: string;
  name: string;
  data: T;
  status: JobStatus;
  progress: number;
  result?: R;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  attempts: number;
  maxAttempts: number;
}

export type JobProcessor<T, R> = (job: MemoryJob<T, R>) => Promise<R>;

export interface MemoryQueueOptions {
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export class MemoryQueue<T = unknown, R = unknown> {
  private jobs: Map<string, MemoryJob<T, R>> = new Map();
  private queue: string[] = [];
  private processing: Set<string> = new Set();
  private processor?: JobProcessor<T, R>;
  private concurrency: number;
  private maxRetries: number;
  private retryDelay: number;
  private isRunning = false;
  private eventListeners: Map<
    string,
    ((job: MemoryJob<T, R>, result?: R, error?: Error) => void)[]
  > = new Map();

  constructor(
    public readonly name: string,
    options: MemoryQueueOptions = {}
  ) {
    this.concurrency = options.concurrency ?? 5;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 5000;
  }

  /**
   * Add a job to the queue
   */
  async add(name: string, data: T): Promise<MemoryJob<T, R>> {
    const job: MemoryJob<T, R> = {
      id: crypto.randomUUID(),
      name,
      data,
      status: "pending",
      progress: 0,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: this.maxRetries,
    };

    this.jobs.set(job.id, job);
    this.queue.push(job.id);

    this.emit("waiting", job);

    // Process if we have capacity
    this.processNext();

    return job;
  }

  /**
   * Add multiple jobs at once
   */
  async addBulk(jobs: { name: string; data: T }[]): Promise<MemoryJob<T, R>[]> {
    return Promise.all(jobs.map((j) => this.add(j.name, j.data)));
  }

  /**
   * Set the job processor
   */
  process(processor: JobProcessor<T, R>): void {
    this.processor = processor;
    this.isRunning = true;
    this.processNext();
  }

  /**
   * Get a job by ID
   */
  getJob(id: string): MemoryJob<T, R> | undefined {
    return this.jobs.get(id);
  }

  /**
   * Get all jobs with optional status filter
   */
  getJobs(status?: JobStatus): MemoryJob<T, R>[] {
    const jobs = Array.from(this.jobs.values());
    if (status) {
      return jobs.filter((j) => j.status === status);
    }
    return jobs;
  }

  /**
   * Get queue counts
   */
  getCounts(): { pending: number; active: number; completed: number; failed: number } {
    const jobs = Array.from(this.jobs.values());
    return {
      pending: jobs.filter((j) => j.status === "pending").length,
      active: jobs.filter((j) => j.status === "active").length,
      completed: jobs.filter((j) => j.status === "completed").length,
      failed: jobs.filter((j) => j.status === "failed").length,
    };
  }

  /**
   * Update job progress
   */
  updateProgress(jobId: string, progress: number): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = progress;
      this.emit("progress", job);
    }
  }

  /**
   * Listen to queue events
   */
  on(
    event: "waiting" | "active" | "completed" | "failed" | "progress",
    listener: (job: MemoryJob<T, R>, result?: R, error?: Error) => void
  ): void {
    const listeners = this.eventListeners.get(event) ?? [];
    listeners.push(listener);
    this.eventListeners.set(event, listeners);
  }

  private emit(
    event: "waiting" | "active" | "completed" | "failed" | "progress",
    job: MemoryJob<T, R>,
    result?: R,
    error?: Error
  ): void {
    const listeners = this.eventListeners.get(event) ?? [];
    for (const listener of listeners) {
      try {
        listener(job, result, error);
      } catch (e) {
        logger.error(
          "Error in queue event listener",
          e instanceof Error ? e : new Error(String(e)),
          {
            event,
            jobId: job.id,
          }
        );
      }
    }
  }

  /**
   * Stop processing
   */
  close(): void {
    this.isRunning = false;
  }

  /**
   * Clear all jobs
   */
  clear(): void {
    this.jobs.clear();
    this.queue = [];
    this.processing.clear();
  }

  private async processNext(): Promise<void> {
    if (!this.isRunning || !this.processor) return;
    if (this.processing.size >= this.concurrency) return;
    if (this.queue.length === 0) return;

    const jobId = this.queue.shift();
    if (!jobId) return;

    const job = this.jobs.get(jobId);
    if (!job) return;

    this.processing.add(jobId);
    job.status = "active";
    job.startedAt = new Date();
    job.attempts++;

    this.emit("active", job);

    try {
      const result = await this.processor(job);
      job.status = "completed";
      job.result = result;
      job.completedAt = new Date();
      job.progress = 100;
      this.emit("completed", job, result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (job.attempts < job.maxAttempts) {
        // Retry
        job.status = "pending";
        job.error = err.message;
        setTimeout(() => {
          this.queue.push(jobId);
          this.processNext();
        }, this.retryDelay);
      } else {
        // Failed permanently
        job.status = "failed";
        job.error = err.message;
        job.completedAt = new Date();
        this.emit("failed", job, undefined, err);
      }
    } finally {
      this.processing.delete(jobId);
      this.processNext();
    }
  }
}

// Cache for named queues
const queueCache = new Map<string, MemoryQueue<unknown, unknown>>();

export function getMemoryQueue<T = unknown, R = unknown>(
  name: string = "default",
  options?: MemoryQueueOptions
): MemoryQueue<T, R> {
  let queue = queueCache.get(name);
  if (!queue) {
    queue = new MemoryQueue<unknown, unknown>(name, options);
    queueCache.set(name, queue);
  }
  return queue as unknown as MemoryQueue<T, R>;
}
