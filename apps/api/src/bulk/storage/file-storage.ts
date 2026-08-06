import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { Injectable, Logger } from '@nestjs/common'

/**
 * Where uploaded files and generated reports live.
 *
 * Deliberately an interface with a local-disk implementation: imports are
 * streamed, so the only operations needed are "give me a read stream" and
 * "give me a write stream". Swapping in S3 later means implementing the same
 * two methods with GetObject and a multipart upload — no caller changes.
 *
 * Keys are generated here, never taken from user input, so an uploader cannot
 * choose a path.
 */
export interface StoredFile {
  key: string
  sizeBytes: number
}

@Injectable()
export class FileStorage {
  private readonly logger = new Logger(FileStorage.name)
  private readonly root = path.resolve(process.cwd(), 'uploads')

  /** Namespaced key: bulk/<jobId>/<kind>.<ext>. Never user-controlled. */
  buildKey(parts: { scope: string; id: string; name: string }): string {
    const safeName = parts.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    return `${parts.scope}/${parts.id}/${safeName}`
  }

  private absolute(key: string): string {
    // Resolve and then confirm the result is still inside the root, so a key
    // containing traversal segments cannot escape.
    const full = path.resolve(this.root, key)
    if (!full.startsWith(this.root + path.sep)) {
      throw new Error('Refusing to access a path outside the storage root')
    }
    return full
  }

  async write(key: string, data: Buffer | Readable): Promise<StoredFile> {
    const full = this.absolute(key)
    await mkdir(path.dirname(full), { recursive: true })

    if (Buffer.isBuffer(data)) {
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(full)
        out.on('error', reject)
        out.on('finish', resolve)
        out.end(data)
      })
    } else {
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(full)
        data.pipe(out)
        data.on('error', reject)
        out.on('error', reject)
        out.on('finish', resolve)
      })
    }

    const info = await stat(full)
    return { key, sizeBytes: info.size }
  }

  /** A write stream, for reports generated row by row without buffering. */
  async createWriteStream(key: string): Promise<Writable> {
    const full = this.absolute(key)
    await mkdir(path.dirname(full), { recursive: true })
    return createWriteStream(full)
  }

  createReadStream(key: string): Readable {
    return createReadStream(this.absolute(key))
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.absolute(key))
      return true
    } catch {
      return false
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.absolute(key))
    } catch (error) {
      // Purging a file that is already gone is not an error worth surfacing.
      this.logger.debug(`Could not remove ${key}: ${(error as Error).message}`)
    }
  }
}
