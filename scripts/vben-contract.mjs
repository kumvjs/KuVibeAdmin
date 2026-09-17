#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const lockPath = join(repositoryRoot, 'contracts/vben/upstream.lock.json')
const supportedMethods = new Set(['delete', 'get', 'patch', 'post', 'put'])

function fail(message) {
  console.error(`[vben-contract] ${message}`)
  process.exitCode = 1
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function parseArguments(argv) {
  const [command = 'generate', ...rest] = argv
  const options = {
    command,
    format: 'text',
    ref: undefined,
    source: undefined,
    write: false,
  }

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]
    if (argument === '--source') {
      if (!rest[index + 1])
        throw new Error('--source requires a directory')
      options.source = resolve(rest[index + 1])
      index += 1
    }
    else if (argument === '--ref') {
      if (!rest[index + 1])
        throw new Error('--ref requires a Git tag, branch, or ref')
      options.ref = rest[index + 1]
      index += 1
    }
    else if (argument === '--format') {
      if (!['json', 'text'].includes(rest[index + 1]))
        throw new Error('--format must be json or text')
      options.format = rest[index + 1]
      index += 1
    }
    else if (argument === '--write') {
      options.write = true
    }
    else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (!['check', 'diff', 'generate', 'warn-main'].includes(command))
    throw new Error(`Unknown command: ${command}`)

  if (options.write && command !== 'generate')
    throw new Error('--write is only valid with generate')

  return options
}

function runGit(arguments_, options = {}) {
  const result = spawnSync('git', arguments_, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
  })

  if (result.status !== 0) {
    const details = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`
    throw new Error(`git ${arguments_.join(' ')} failed: ${details}`)
  }

  return result.stdout?.trim() ?? ''
}

function collectedPaths(lock) {
  return [...new Set(Object.values(lock.sources).flat())]
}

function sparseCheckoutPaths(lock) {
  return [...new Set(collectedPaths(lock).map(path =>
    /\.[^/]+$/u.test(path) ? dirname(path) : path))]
}

function createSparseClone(lock, ref = lock.tag) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kuvibeadmin-vben-'))
  const sourceRoot = join(temporaryRoot, 'vue-vben-admin')

  try {
    runGit([
      'clone',
      '--depth',
      '1',
      '--branch',
      ref,
      '--filter=blob:none',
      '--single-branch',
      '--sparse',
      lock.repository,
      sourceRoot,
    ], { inherit: true })
    runGit(['sparse-checkout', 'set', ...sparseCheckoutPaths(lock)], { cwd: sourceRoot })
  }
  catch (error) {
    rmSync(temporaryRoot, { force: true, recursive: true })
    throw error
  }

  return { sourceRoot, temporaryRoot }
}

function verifySource(lock, sourceRoot, { expectedCommit, requireLockedPaths }) {
  if (!existsSync(sourceRoot))
    throw new Error(`Source directory does not exist: ${sourceRoot}`)

  const commit = runGit(['rev-parse', 'HEAD'], { cwd: sourceRoot })
  if (expectedCommit && commit !== expectedCommit) {
    throw new Error(
      `Source commit ${commit} does not match expected commit ${expectedCommit}`,
    )
  }

  if (requireLockedPaths) {
    for (const path of collectedPaths(lock)) {
      const absolutePath = join(sourceRoot, path)
      if (!existsSync(absolutePath))
        throw new Error(`Locked source path is missing: ${path}`)
    }
  }

  return commit
}

function walkFiles(root, predicate) {
  const files = []
  for (const entry of readdirSync(root).sort()) {
    const absolutePath = join(root, entry)
    if (statSync(absolutePath).isDirectory())
      files.push(...walkFiles(absolutePath, predicate))
    else if (predicate(absolutePath))
      files.push(absolutePath)
  }
  return files
}

function filesForPath(sourceRoot, path) {
  const absolutePath = join(sourceRoot, path)
  if (!existsSync(absolutePath))
    return []
  if (!statSync(absolutePath).isDirectory())
    return [absolutePath]
  return walkFiles(absolutePath, file => /\.(?:json|ts|vue)$/u.test(file))
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

function findCallParenthesis(source, start) {
  let angleDepth = 0
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (character === '<')
      angleDepth += 1
    else if (character === '>' && angleDepth > 0)
      angleDepth -= 1
    else if (character === '(' && angleDepth === 0)
      return index
    else if (!/\s/u.test(character) && angleDepth === 0)
      return -1
  }
  return -1
}

function readStringLiteral(source, start) {
  const quote = source[start]
  if (!['"', "'", '`'].includes(quote))
    return undefined

  let value = ''
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index]
    if (character === '\\') {
      value += character + (source[index + 1] ?? '')
      index += 1
    }
    else if (character === quote) {
      return value
    }
    else {
      value += character
    }
  }
  return undefined
}

function splitCallArguments(source, openingParenthesis) {
  const arguments_ = []
  let current = ''
  let depth = 0
  let quote
  let escaped = false

  for (let index = openingParenthesis + 1; index < source.length; index += 1) {
    const character = source[index]

    if (quote) {
      current += character
      if (escaped) {
        escaped = false
      }
      else if (character === '\\') {
        escaped = true
      }
      else if (character === quote) {
        quote = undefined
      }
      continue
    }

    if (['"', "'", '`'].includes(character)) {
      quote = character
      current += character
    }
    else if ('[{(<'.includes(character)) {
      depth += 1
      current += character
    }
    else if (character === ')' && depth === 0) {
      arguments_.push(current.trim())
      return arguments_
    }
    else if (']}>'.includes(character) || (character === ')' && depth > 0)) {
      depth -= 1
      current += character
    }
    else if (character === ',' && depth === 0) {
      arguments_.push(current.trim())
      current = ''
    }
    else {
      current += character
    }
  }

  return []
}

function normalizeContractText(value) {
  return value.replace(/\s+/gu, ' ').trim()
}

function normalizeRoutePath(path) {
  return path
    .replace(/\$\{\s*([\w.]+)\s*\}/gu, (_, expression) => `:${expression.split('.').at(-1)}`)
    .replace(/\/{2,}/gu, '/')
}

function extractFrontendCalls(source) {
  const calls = []
  const callPattern = /\b(baseRequestClient|requestClient)\s*\.\s*(delete|download|get|patch|post|put|upload)\b/gu

  for (const match of source.matchAll(callPattern)) {
    const methodEnd = match.index + match[0].length
    const parenthesis = findCallParenthesis(source, methodEnd)
    if (parenthesis < 0)
      continue

    const arguments_ = splitCallArguments(source, parenthesis)
    const pathArgument = arguments_[0] ?? ''
    const pathStart = pathArgument.search(/["'`]/u)
    const rawPath = pathStart < 0
      ? undefined
      : readStringLiteral(pathArgument, pathStart)
    if (!rawPath || !rawPath.startsWith('/') || rawPath.startsWith('//'))
      continue

    const clientMethod = match[2]
    if (clientMethod === 'download')
      continue

    calls.push({
      client: match[1],
      method: clientMethod === 'upload' ? 'POST' : clientMethod.toUpperCase(),
      path: normalizeRoutePath(rawPath),
      requestSignature: normalizeContractText(arguments_.slice(1).join(', ')),
      responseSignature: normalizeContractText(source.slice(methodEnd, parenthesis)),
    })
  }

  return calls
}

function mockRouteFromFile(apiRoot, file) {
  const relativePath = relative(apiRoot, file).replaceAll('\\', '/')
  const segments = relativePath.replace(/\.ts$/u, '').split('/')
  const fileParts = segments.at(-1).split('.')
  const possibleMethod = fileParts.at(-1).toLowerCase()
  const method = supportedMethods.has(possibleMethod)
    ? possibleMethod.toUpperCase()
    : 'ANY'

  if (method !== 'ANY')
    fileParts.pop()
  segments[segments.length - 1] = fileParts.join('.')

  const path = `/${segments
    .filter(segment => segment !== '' && segment !== 'index')
    .map(segment => segment.replace(/^\[([^\.]+)\]$/u, ':$1'))
    .join('/')}`

  return { method, path }
}

function endpointCategory(path) {
  if (path.startsWith('/system/'))
    return 'system'
  if (path.startsWith('/timezone/'))
    return 'preference'
  if (['/demo/bigint', '/status', '/table/list', '/upload'].includes(path))
    return 'playground'
  return 'runtime'
}

function endpointSort(left, right) {
  return left.path.localeCompare(right.path) || left.method.localeCompare(right.method)
}

function buildSnapshot(lock, sourceRoot, options = {}) {
  const frontendFiles = lock.sources.frontend
    .flatMap(path => filesForPath(sourceRoot, path).filter(file => file.endsWith('.ts')))
  const apiRoot = join(sourceRoot, lock.sources.backend[0])
  const mockFiles = existsSync(apiRoot)
    ? walkFiles(apiRoot, file => file.endsWith('.ts'))
    : []
  const endpoints = new Map()
  const sourceHashes = {}
  const allSourceFiles = collectedPaths(lock)
    .flatMap(path => filesForPath(sourceRoot, path))

  for (const file of [...new Set(allSourceFiles)].sort()) {
    const source = readFileSync(file, 'utf8')
    sourceHashes[relative(sourceRoot, file).replaceAll('\\', '/')] = sha256(source)
  }

  for (const file of frontendFiles) {
    const source = readFileSync(file, 'utf8')
    const caller = relative(sourceRoot, file).replaceAll('\\', '/')
    for (const call of extractFrontendCalls(source)) {
      const key = `${call.method} ${call.path}`
      const endpoint = endpoints.get(key) ?? {
        category: endpointCategory(call.path),
        callers: [],
        method: call.method,
        mockHandlers: [],
        mockImplemented: false,
        path: call.path,
      }
      endpoint.callers.push({
        client: call.client,
        requestSignature: call.requestSignature,
        responseSignature: call.responseSignature,
        source: caller,
      })
      endpoints.set(key, endpoint)
    }
  }

  const mockRoutes = mockFiles.map((file) => ({
    ...mockRouteFromFile(apiRoot, file),
    source: relative(sourceRoot, file).replaceAll('\\', '/'),
  }))

  for (const endpoint of endpoints.values()) {
    endpoint.callers.sort((left, right) =>
      left.source.localeCompare(right.source)
      || left.client.localeCompare(right.client)
      || left.requestSignature.localeCompare(right.requestSignature)
      || left.responseSignature.localeCompare(right.responseSignature))
    endpoint.mockContracts = mockRoutes
      .filter(route => route.path === endpoint.path && (route.method === 'ANY' || route.method === endpoint.method))
      .map(route => ({ hash: sourceHashes[route.source], source: route.source }))
      .sort((left, right) => left.source.localeCompare(right.source))
    endpoint.mockHandlers = endpoint.mockContracts.map(contract => contract.source)
    endpoint.mockImplemented = endpoint.mockContracts.length > 0
  }

  const frontendEndpoints = [...endpoints.values()].sort(endpointSort)
  const mockOnlyRoutes = mockRoutes
    .filter(route => !frontendEndpoints.some(endpoint =>
      endpoint.path === route.path && (route.method === 'ANY' || route.method === endpoint.method)))
    .sort(endpointSort)

  const summary = {
    frontendEndpoints: frontendEndpoints.length,
    frontendEndpointsMissingFromMock: frontendEndpoints.filter(endpoint => !endpoint.mockImplemented).length,
    mockImplementedFrontendEndpoints: frontendEndpoints.filter(endpoint => endpoint.mockImplemented).length,
    mockOnlyDiagnostics: mockOnlyRoutes.length,
  }

  if (options.enforceExpected !== false) {
    for (const [field, expected] of Object.entries(lock.expected)) {
      if (summary[field] !== expected) {
        throw new Error(
          `Expected ${field}=${expected}, received ${summary[field]}. `
          + 'Review the upstream contract before updating the lock.',
        )
      }
    }
  }

  return {
    schemaVersion: 2,
    upstream: options.upstream ?? {
      collectedAt: lock.collectedAt,
      commit: lock.commit,
      repository: lock.repository,
      tag: lock.tag,
    },
    summary,
    frontendEndpoints,
    mockOnlyRoutes,
    sourceHashes,
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function endpointKey(endpoint) {
  return `${endpoint.method} ${endpoint.path}`
}

function callerSources(endpoint) {
  return new Set(endpoint.callers.map(caller => caller.source))
}

function hasSharedCaller(left, right) {
  const leftSources = callerSources(left)
  return right.callers.some(caller => leftSources.has(caller.source))
}

function comparableCallers(endpoint, field) {
  return endpoint.callers.map(caller => ({
    client: caller.client,
    signature: caller[field] ?? '',
    source: caller.source,
  }))
}

function sourceChangeKind(lock, path) {
  if (lock.sources.mockData.some(source => path === source || path.startsWith(`${source}/`)))
    return 'mock-data-only'
  if (lock.sources.behavior.some(source => path === source || path.startsWith(`${source}/`)))
    return 'request-changed'
  if (lock.sources.types.some(source => path === source || path.startsWith(`${source}/`)))
    return 'response-changed'
  if (lock.sources.frontend.some(source => path === source || path.startsWith(`${source}/`)))
    return 'frontend-contract-changed'
  if (lock.sources.backend.some(source => path === source || path.startsWith(`${source}/`)))
    return 'response-changed'
  return 'source-changed'
}

function diffSources(lock, baseline, candidate) {
  const paths = [...new Set([
    ...Object.keys(baseline.sourceHashes),
    ...Object.keys(candidate.sourceHashes),
  ])].sort()

  return paths.flatMap((path) => {
    const before = baseline.sourceHashes[path]
    const after = candidate.sourceHashes[path]
    if (before === after)
      return []
    return [{
      change: before ? (after ? 'changed' : 'removed') : 'added',
      kind: sourceChangeKind(lock, path),
      path,
    }]
  })
}

function diffSnapshots(lock, baseline, candidate) {
  const baselineMap = new Map(baseline.frontendEndpoints.map(endpoint => [endpointKey(endpoint), endpoint]))
  const candidateMap = new Map(candidate.frontendEndpoints.map(endpoint => [endpointKey(endpoint), endpoint]))
  const removed = [...baselineMap.values()].filter(endpoint => !candidateMap.has(endpointKey(endpoint)))
  const added = [...candidateMap.values()].filter(endpoint => !baselineMap.has(endpointKey(endpoint)))
  const methodChanged = []
  const renamed = []

  for (const oldEndpoint of [...removed]) {
    const replacement = added.find(endpoint =>
      endpoint.path === oldEndpoint.path && endpoint.method !== oldEndpoint.method)
    if (!replacement)
      continue
    methodChanged.push({
      from: oldEndpoint.method,
      path: oldEndpoint.path,
      to: replacement.method,
    })
    removed.splice(removed.indexOf(oldEndpoint), 1)
    added.splice(added.indexOf(replacement), 1)
  }

  for (const oldEndpoint of [...removed]) {
    const replacements = added.filter(endpoint =>
      endpoint.method === oldEndpoint.method && hasSharedCaller(oldEndpoint, endpoint))
    if (replacements.length !== 1)
      continue
    const replacement = replacements[0]
    renamed.push({
      from: oldEndpoint.path,
      method: oldEndpoint.method,
      to: replacement.path,
    })
    removed.splice(removed.indexOf(oldEndpoint), 1)
    added.splice(added.indexOf(replacement), 1)
  }

  const requestChanged = []
  const responseChanged = []
  const mockCoverageChanged = []

  for (const [key, before] of baselineMap) {
    const after = candidateMap.get(key)
    if (!after)
      continue

    if (JSON.stringify(comparableCallers(before, 'requestSignature'))
      !== JSON.stringify(comparableCallers(after, 'requestSignature'))) {
      requestChanged.push({ method: before.method, path: before.path })
    }

    if (JSON.stringify(comparableCallers(before, 'responseSignature'))
      !== JSON.stringify(comparableCallers(after, 'responseSignature'))
      || JSON.stringify(before.mockContracts ?? []) !== JSON.stringify(after.mockContracts ?? [])) {
      responseChanged.push({ method: before.method, path: before.path })
    }

    if (before.mockImplemented !== after.mockImplemented) {
      mockCoverageChanged.push({
        after: after.mockImplemented,
        before: before.mockImplemented,
        method: before.method,
        path: before.path,
      })
    }
  }

  const sourceChanges = diffSources(lock, baseline, candidate)
  const result = {
    baseline: baseline.upstream,
    candidate: candidate.upstream,
    summary: {
      added: added.length,
      methodChanged: methodChanged.length,
      mockCoverageChanged: mockCoverageChanged.length,
      removed: removed.length,
      renamed: renamed.length,
      requestChanged: requestChanged.length,
      responseChanged: responseChanged.length,
      sourceChanged: sourceChanges.length,
    },
    changes: {
      added: added.map(endpoint => ({ method: endpoint.method, path: endpoint.path })).sort(endpointSort),
      methodChanged: methodChanged.sort((left, right) => left.path.localeCompare(right.path)),
      mockCoverageChanged: mockCoverageChanged.sort(endpointSort),
      removed: removed.map(endpoint => ({ method: endpoint.method, path: endpoint.path })).sort(endpointSort),
      renamed: renamed.sort((left, right) => left.from.localeCompare(right.from)),
      requestChanged: requestChanged.sort(endpointSort),
      responseChanged: responseChanged.sort(endpointSort),
      sourceChanges,
    },
  }
  result.hasChanges = Object.values(result.summary).some(count => count > 0)
  result.mockDataOnly = result.hasChanges
    && Object.entries(result.summary)
      .filter(([key]) => key !== 'sourceChanged')
      .every(([, count]) => count === 0)
    && sourceChanges.every(change => change.kind === 'mock-data-only')
  return result
}

function formatDiff(diff) {
  const lines = [
    `Vben contract: ${diff.baseline.tag}@${diff.baseline.commit.slice(0, 12)} -> ${diff.candidate.tag}@${diff.candidate.commit.slice(0, 12)}`,
    `Changes: ${diff.hasChanges ? 'yes' : 'none'}${diff.mockDataOnly ? ' (mock-data-only)' : ''}`,
  ]

  for (const [kind, changes] of Object.entries(diff.changes)) {
    if (changes.length === 0)
      continue
    lines.push('', `${kind} (${changes.length})`)
    for (const change of changes)
      lines.push(`- ${JSON.stringify(change)}`)
  }

  return `${lines.join('\n')}\n`
}

function validateFixtures(lock) {
  const fixturePath = join(repositoryRoot, lock.fixtures)
  const fixtures = loadJson(fixturePath)
  const assertions = [
    [fixtures.schemaVersion === 1, 'fixture schemaVersion must be 1'],
    [fixtures.successEnvelope?.code === 0, 'success fixture code must be 0'],
    [fixtures.successEnvelope?.data !== undefined, 'success fixture must contain data'],
    [fixtures.errorEnvelope?.code !== 0 && fixtures.errorEnvelope?.data === null, 'error fixture must contain nonzero code and null data'],
    [Array.isArray(fixtures.pagination?.data?.items), 'pagination fixture must contain data.items'],
    [Number.isInteger(fixtures.pagination?.data?.total), 'pagination fixture total must be an integer'],
    [fixtures.authentication?.unauthorized?.httpStatus === 401, 'unauthorized fixture status must be 401'],
    [fixtures.authentication?.forbidden?.httpStatus === 403, 'forbidden fixture status must be 403'],
    [fixtures.authentication?.refresh?.response?.setCookieContains?.includes('HttpOnly'), 'refresh fixture must require HttpOnly'],
    [fixtures.authentication?.refresh?.response?.body?.code === 0, 'refresh fixture must use the success envelope'],
    [typeof fixtures.authentication?.refresh?.response?.body?.data?.accessToken === 'string', 'refresh fixture must contain data.accessToken'],
    [Array.isArray(fixtures.dynamicRoutes?.data), 'dynamic-routes fixture data must be an array'],
    [fixtures.bigint?.rawJson?.includes(fixtures.bigint?.expectedParsedId), 'bigint raw JSON must preserve the expected digits'],
  ]

  for (const [valid, message] of assertions) {
    if (!valid)
      throw new Error(message)
  }
  return fixturePath
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  const lock = loadJson(lockPath)
  const snapshotPath = join(repositoryRoot, lock.snapshot)
  let temporaryRoot
  let sourceRoot = options.source

  try {
    if (['diff', 'warn-main'].includes(options.command)) {
      const ref = options.ref ?? (options.command === 'warn-main' ? lock.warningRef : undefined)
      if (!ref)
        throw new Error('diff requires --ref <tag-or-branch>')

      if (!existsSync(snapshotPath))
        throw new Error(`Snapshot does not exist: ${relative(repositoryRoot, snapshotPath)}`)
      validateFixtures(lock)

      if (!sourceRoot) {
        const clone = createSparseClone(lock, ref)
        temporaryRoot = clone.temporaryRoot
        sourceRoot = clone.sourceRoot
      }

      const candidateCommit = verifySource(lock, sourceRoot, {
        expectedCommit: undefined,
        requireLockedPaths: false,
      })
      const candidate = buildSnapshot(lock, sourceRoot, {
        enforceExpected: false,
        upstream: {
          collectedAt: runGit(['show', '-s', '--format=%cI', 'HEAD'], { cwd: sourceRoot }),
          commit: candidateCommit,
          repository: lock.repository,
          tag: ref,
        },
      })
      const diff = diffSnapshots(lock, loadJson(snapshotPath), candidate)
      process.stdout.write(options.format === 'json' ? stableJson(diff) : formatDiff(diff))
      if (options.command === 'warn-main' && diff.hasChanges)
        process.exitCode = 2
      return
    }

    if (!sourceRoot) {
      const clone = createSparseClone(lock)
      temporaryRoot = clone.temporaryRoot
      sourceRoot = clone.sourceRoot
    }

    verifySource(lock, sourceRoot, {
      expectedCommit: lock.commit,
      requireLockedPaths: true,
    })
    const actual = stableJson(buildSnapshot(lock, sourceRoot))
    const fixturePath = validateFixtures(lock)

    if (options.command === 'check') {
      if (!existsSync(snapshotPath))
        throw new Error(`Snapshot does not exist: ${relative(repositoryRoot, snapshotPath)}`)
      const expected = readFileSync(snapshotPath, 'utf8')
      if (actual !== expected)
        throw new Error('Generated snapshot differs from the committed snapshot')
      console.log(`[vben-contract] snapshot verified: ${lock.snapshot}`)
      console.log(`[vben-contract] fixtures verified: ${relative(repositoryRoot, fixturePath)}`)
    }
    else if (options.write) {
      mkdirSync(dirname(snapshotPath), { recursive: true })
      writeFileSync(snapshotPath, actual)
      console.log(`[vben-contract] snapshot written: ${lock.snapshot}`)
    }
    else {
      process.stdout.write(actual)
    }
  }
  finally {
    if (temporaryRoot)
      rmSync(temporaryRoot, { force: true, recursive: true })
  }
}

const isDirectExecution = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectExecution) {
  try {
    main()
  }
  catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

export {
  diffSnapshots,
  extractFrontendCalls,
  mockRouteFromFile,
  splitCallArguments,
}
