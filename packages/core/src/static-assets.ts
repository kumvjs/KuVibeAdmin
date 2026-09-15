import { mkdir } from 'node:fs/promises'
import path from 'node:path'

/** 根据入口布局定位 public，不依赖工作目录或候选目录是否存在。 */
export function resolveStaticRoot(entryDirectory: string): string {
  const directory = path.resolve(entryDirectory)
  if (path.basename(directory) === 'src') {
    const parent = path.dirname(directory)
    return path.resolve(parent, path.basename(parent) === 'dist' ? '..' : '.', 'public')
  }
  if (path.basename(directory) === 'dist')
    return path.resolve(directory, '..', 'public')
  throw new Error(`Unsupported application entry directory: ${directory}`)
}

export async function prepareStaticRoot(entryDirectory: string): Promise<string> {
  const root = resolveStaticRoot(entryDirectory)
  await mkdir(root, { recursive: true })
  return root
}
