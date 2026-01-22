/**
 * Test script for database migrations
 * Run with: cd packages/web && npx tsx test-migrations.ts
 */

import Database from 'better-sqlite3'
import { runMigrations } from './src/lib/migrations/runner'
import { unlinkSync, existsSync } from 'fs'

const TEST_DB_PATH = './test-migrations.db'

// Clean up any existing test database
if (existsSync(TEST_DB_PATH)) {
  unlinkSync(TEST_DB_PATH)
  console.log('🧹 Cleaned up existing test database')
}

// Create a fresh database
console.log('\n🔧 Creating test database...')
const db = new Database(TEST_DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Run migrations
console.log('\n📦 Running migrations...\n')
try {
  runMigrations(db)

  // Verify tables exist
  console.log('\n✅ Verifying schema...')
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    ORDER BY name
  `).all() as Array<{ name: string }>

  console.log(`   Found ${tables.length} tables:`)
  tables.forEach(t => console.log(`     - ${t.name}`))

  // Verify indexes exist
  const indexes = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='index' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>

  console.log(`\n   Found ${indexes.length} indexes:`)
  indexes.forEach(i => console.log(`     - ${i.name}`))

  // Check migration table
  const migrations = db.prepare(`
    SELECT version, name, applied_at
    FROM schema_migrations
    ORDER BY version
  `).all() as Array<{ version: number; name: string; applied_at: string }>

  console.log(`\n   Applied migrations:`)
  migrations.forEach(m => console.log(`     ${m.version}. ${m.name} (${m.applied_at})`))

  console.log('\n✅ Migration test passed!')

} catch (error) {
  console.error('\n❌ Migration test failed:', error)
  process.exit(1)
} finally {
  db.close()

  // Clean up test database
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH)
    console.log('\n🧹 Cleaned up test database')
  }
}
