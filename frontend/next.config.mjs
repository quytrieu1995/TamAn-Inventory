import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const createNextConfig = (phase) => {
  /** @type {import('next').NextConfig} */
  const baseConfig = {
    reactStrictMode: true,
    outputFileTracingRoot: __dirname
  }

  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      ...baseConfig,
      distDir: '.next-dev'
    }
  }

  return baseConfig
}

export default createNextConfig
