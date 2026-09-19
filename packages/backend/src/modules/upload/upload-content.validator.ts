import type { UploadPolicyResponseDto } from './dto/upload-policy.dto.js'
import { createReadStream } from 'node:fs'
import { open, rename, unlink } from 'node:fs/promises'
import { extname } from 'node:path'
import { Injectable, UnsupportedMediaTypeException } from '@nestjs/common'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import { open as openZip } from 'yauzl'

const MIME: Record<string, string[]> = {
  jpg: ['image/jpeg'],
  png: ['image/png'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
  txt: ['text/plain'],
  csv: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  zip: ['application/zip', 'application/x-zip-compressed'],
  mp3: ['audio/mpeg'],
  mp4: ['video/mp4'],
}

@Injectable()
export class UploadContentValidator {
  async validate(path: string, originalName: string, declaredMime: string, policy: UploadPolicyResponseDto) {
    const extension = extname(originalName).slice(1).toLowerCase().replace(/^jpeg$/, 'jpg')
    if (!policy.allowedFormats.includes(extension) || !MIME[extension])
      throw new UnsupportedMediaTypeException('文件格式不在用途白名单内')
    if (!MIME[extension].includes(declaredMime.toLowerCase()) && declaredMime !== 'application/octet-stream')
      throw new UnsupportedMediaTypeException('文件扩展名与 MIME 不一致')
    try {
      if (['txt', 'csv'].includes(extension)) {
        const decoder = new TextDecoder('utf-8', { fatal: true })
        for await (const buffer of createReadStream(path)) {
          const text = decoder.decode(buffer, { stream: true })
          if ([...text].some(char => char.charCodeAt(0) < 32 && !['\t', '\r', '\n'].includes(char)))
            throw new Error('Binary data in text')
        }
        decoder.decode()
      }
      else if (['zip', 'docx', 'xlsx', 'pptx'].includes(extension)) {
        await this.validateArchive(path, extension)
      }
      else {
        const handle = await open(path, 'r')
        const buffer = Buffer.alloc(65536)
        const { bytesRead } = await handle.read(buffer)
        await handle.close()
        const type = await fileTypeFromBuffer(buffer.subarray(0, bytesRead))
        if (!type || type.ext !== extension)
          throw new Error('Content mismatch')
        if (['jpg', 'png', 'webp', 'gif'].includes(extension)) {
          const options = { limitInputPixels: 16_777_216, failOn: 'warning' as const }
          const metadata = await sharp(path, options).metadata()
          if ((metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height
            || metadata.width > (policy.maxImageWidth ?? 4096) || metadata.height > (policy.maxImageHeight ?? 4096)) {
            throw new Error('Image dimensions or animation not allowed')
          }
          // Decode and re-encode, dropping metadata/trailing payloads before public use.
          const temporary = `${path}.normalized`
          try {
            await sharp(path, options).timeout({ seconds: 10 }).toFormat(extension === 'jpg' ? 'jpeg' : extension as 'png' | 'gif' | 'webp').toFile(temporary)
            await rename(temporary, path)
          }
          finally {
            await unlink(temporary).catch(() => {})
          }
        }
      }
      return { extension, mimeType: MIME[extension][0] }
    }
    catch {
      throw new UnsupportedMediaTypeException('附件内容无效、格式不匹配或超过内容安全限制')
    }
  }

  private validateArchive(path: string, extension: string): Promise<void> {
    return new Promise((resolve, reject) => {
      openZip(path, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
        if (error || !zip)
          return reject(error ?? new Error('Invalid archive'))
        let count = 0
        let total = 0
        const names = new Set<string>()
        let contentTypes = ''
        const timer = setTimeout(() => fail(new Error('Archive inspection timeout')), 5000)
        function fail(reason: Error) {
          clearTimeout(timer)
          zip!.close()
          reject(reason)
        }
        zip.on('error', fail)
        zip.on('entry', (entry) => {
          count++
          total += entry.uncompressedSize
          if (count > 10_000 || total > 1024 * 1024 * 1024 || entry.generalPurposeBitFlag & 1
            || entry.uncompressedSize > Math.max(entry.compressedSize * 200, 1024 * 1024)
            || names.has(entry.fileName) || /(?:^|\/)vbaProject\.bin$/i.test(entry.fileName)) {
            return fail(new Error('Unsafe archive'))
          }
          names.add(entry.fileName)
          if (extension !== 'zip' && entry.fileName === '[Content_Types].xml') {
            if (entry.uncompressedSize > 1024 * 1024)
              return fail(new Error('Oversized content types'))
            zip.openReadStream(entry, (streamError, stream) => {
              if (streamError || !stream)
                return fail(streamError ?? new Error('Missing entry'))
              let length = 0
              stream.on('data', (chunk: Buffer) => {
                length += chunk.length
                if (length > 1024 * 1024) {
                  stream.destroy()
                  fail(new Error('Oversized entry'))
                }
                else { contentTypes += chunk.toString('utf8') }
              })
              stream.on('error', fail)
              stream.on('end', () => zip.readEntry())
            })
          }
          else { zip.readEntry() }
        })
        zip.on('end', () => {
          clearTimeout(timer)
          const main: Record<string, string> = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' }
          const mime: Record<string, string> = {
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
          }
          if (!count || (extension !== 'zip' && (!names.has(main[extension]) || !contentTypes.includes(mime[extension]) || /macroEnabled|<!DOCTYPE|<!ENTITY/i.test(contentTypes))))
            return reject(new Error('Not an accepted Office document'))
          resolve()
        })
        zip.readEntry()
      })
    })
  }
}
